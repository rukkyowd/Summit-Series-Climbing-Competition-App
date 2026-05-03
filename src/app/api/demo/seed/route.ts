import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";
import {
  CASCADE_CUP_AGE_GROUPS,
  CASCADE_CUP_DEMO_COUNTING_CLIMBS,
  CASCADE_CUP_DEMO_FIELD_SIZE,
  CASCADE_CUP_DEMO_FINALS_CUTOFF,
  CASCADE_CUP_DEMO_FINALS_PROBLEM_COUNT,
  CASCADE_CUP_DEMO_FINALS_TIE_ADVANCES,
  CASCADE_CUP_DEMO_QUALIFIER_PROBLEMS,
  buildCascadeCupScorecardUrl,
  getCascadeCupCategoryRows,
  getCascadeCupSeedClimbers,
  sampleCascadeCupScorecardToken,
  type CascadeCupClimberSeed,
} from "@/lib/cascade-cup-demo";
import {
  DEMO_TARGET_AFTER_LABEL,
  DEMO_TARGET_BEFORE_LABEL,
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NAME,
  DEMO_TARGET_CLIMBER_NUMBER,
  buildDemoOrganizerUrl,
  buildDemoJudgeUrl,
  buildDemoLeaderboardUrl,
  buildDemoPublicUrl,
} from "@/lib/demo-scenario";

type DemoSeedRequest = {
  competitionId?: string;
  scenario?: string;
};

type CompetitionRow = {
  id: string;
  slug: string;
  is_demo: boolean;
  format: string | null;
  total_climbs: number | null;
  qualifier_counting_climbs: number | null;
  finals_eligible_age_groups: unknown;
};

type CategoryRow = {
  id: string;
  competition_id: string;
  gender_division: string;
  age_group: string;
  display_name: string;
};

type RoundRow = {
  id: string;
  round_number?: number | null;
  sort_order?: number | null;
  round_type: string | null;
  scoring_bucket: string | null;
};

type ScheduleBlockRow = {
  id: string;
  label?: string | null;
  round_id: string | null;
  phase_type: string;
  eligible_category_ids: unknown;
  capacity: number | null;
  sort_order: number | null;
};

const SAMPLE_CLIMBERS = getCascadeCupSeedClimbers();

function createId() {
  return crypto.randomUUID();
}

function scoreFor(climber: CascadeCupClimberSeed, climbNumber: number) {
  if (climber.number === DEMO_TARGET_CLIMBER_NUMBER && climbNumber === DEMO_TARGET_CLIMB_NUMBER) {
    return {
      attempt_count: 3,
      zone: true,
      topped: true,
      attempts_to_top: 3,
      attempts_to_zone: 1,
    };
  }

  const targetClimbCountBySeed = [20, 19, 18, 17, 16, 15, 15, 14];
  const topCount = targetClimbCountBySeed[climber.seedIndex] ?? 12;
  const topped = climbNumber <= topCount;
  const zone = topped || climbNumber <= Math.min(CASCADE_CUP_DEMO_QUALIFIER_PROBLEMS, topCount + 3);
  const attemptCount = topped
    ? 1 + ((climber.seedIndex + climbNumber) % 3)
    : zone
      ? 2 + ((climber.seedIndex + climbNumber) % 2)
      : 0;

  return {
    attempt_count: attemptCount,
    zone,
    topped,
    attempts_to_top: topped ? attemptCount : null,
    attempts_to_zone: zone ? Math.max(1, Math.min(attemptCount || 1, 2)) : null,
  };
}

function legacyScoreFor(climberNumber: string, climbNumber: number) {
  if (climberNumber === DEMO_TARGET_CLIMBER_NUMBER && climbNumber === DEMO_TARGET_CLIMB_NUMBER) {
    return {
      attempt_count: 3,
      zone: true,
      topped: true,
      attempts_to_top: 3,
      attempts_to_zone: 1,
    };
  }

  const numeric = Number(climberNumber);
  const topped = (numeric + climbNumber) % 3 !== 0;
  const zone = true;
  const attemptCount = 1 + ((numeric + climbNumber) % 3);

  return {
    attempt_count: attemptCount,
    zone,
    topped,
    attempts_to_top: topped ? attemptCount : null,
    attempts_to_zone: zone ? Math.max(1, Math.min(attemptCount, 2)) : null,
  };
}

async function ensureCascadeCupCategories(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string
) {
  const rows = getCascadeCupCategoryRows(competitionId);
  const { error } = await supabase.from("competition_categories").upsert(rows, {
    onConflict: "competition_id,id",
  });

  if (error) {
    throw new Error(error.message);
  }

  return rows;
}

async function getQualifierRoundId(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: CompetitionRow
) {
  const { data, error } = await supabase
    .from("competition_rounds")
    .select("id, round_type, scoring_bucket")
    .eq("competition_id", competition.id)
    .or("round_type.eq.qualifier,scoring_bucket.eq.qualifier")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const existingId = (data as RoundRow | null)?.id ?? null;
  if (existingId) {
    const update = await supabase
      .from("competition_rounds")
      .update({
        problem_count: CASCADE_CUP_DEMO_QUALIFIER_PROBLEMS,
        counting_climbs: CASCADE_CUP_DEMO_COUNTING_CLIMBS,
        finals_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
        advancement_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
        scoring_bucket: "qualifier",
      })
      .eq("competition_id", competition.id)
      .eq("id", existingId);
    if (update.error) {
      throw new Error(update.error.message);
    }
    return existingId;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("competition_rounds")
    .insert({
      competition_id: competition.id,
      round_number: 1,
      sort_order: 1,
      name: "Qualifier",
      round_type: "qualifier",
      format: competition.format ?? "five_on_five_off",
      status: "pending",
      runtime_phase: "qualifier_open",
      is_enabled: true,
      is_active: false,
      activated_at: null,
      problem_count: CASCADE_CUP_DEMO_QUALIFIER_PROBLEMS,
      counting_climbs: CASCADE_CUP_DEMO_COUNTING_CLIMBS,
      finals_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
      eligible_category_ids: [],
      advancement_source_round_id: null,
      advancement_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
      scoring_bucket: "qualifier",
      scoring_config: {},
      started_at: null,
      closed_at: null,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return inserted.id as string;
}

function ensureCascadeCupFinalsEligible(value: unknown) {
  const current = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  return Array.from(new Set([...current, ...CASCADE_CUP_AGE_GROUPS]));
}

async function ensureDemoFinalsConfiguration(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: CompetitionRow
) {
  const { error } = await supabase
    .from("competitions")
    .update({
      has_finals: true,
      total_climbs: CASCADE_CUP_DEMO_QUALIFIER_PROBLEMS,
      qualifier_counting_climbs: CASCADE_CUP_DEMO_COUNTING_CLIMBS,
      finals_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
      finals_tie_advances: CASCADE_CUP_DEMO_FINALS_TIE_ADVANCES,
      finals_problem_count: CASCADE_CUP_DEMO_FINALS_PROBLEM_COUNT,
      qualifier_eligible_age_groups: [...CASCADE_CUP_AGE_GROUPS],
      finals_eligible_age_groups: ensureCascadeCupFinalsEligible(competition.finals_eligible_age_groups),
    })
    .eq("id", competition.id)
    .eq("is_demo", true);

  if (error) {
    throw new Error(error.message);
  }
}

async function ensureFinalsRound(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: CompetitionRow,
  qualifierRoundId: string
) {
  const { data, error } = await supabase
    .from("competition_rounds")
    .select("id, round_number, sort_order, round_type, scoring_bucket")
    .eq("competition_id", competition.id)
    .or("round_type.eq.finals,scoring_bucket.eq.finals")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const existing = data as RoundRow | null;
  const row = {
    name: "Finals",
    round_type: "finals",
    format: "ifsc_finals_format",
    status: "pending",
    runtime_phase: "finals_open",
    is_enabled: true,
    is_active: false,
    activated_at: null,
    problem_count: CASCADE_CUP_DEMO_FINALS_PROBLEM_COUNT,
    counting_climbs: null,
    finals_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
    eligible_category_ids: [],
    advancement_source_round_id: qualifierRoundId,
    advancement_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
    scoring_bucket: "finals",
    scoring_config: {},
    started_at: null,
    closed_at: null,
  };

  if (existing?.id) {
    const update = await supabase
      .from("competition_rounds")
      .update({
        ...row,
        round_number: existing.round_number ?? 2,
        sort_order: existing.sort_order ?? 2,
      })
      .eq("competition_id", competition.id)
      .eq("id", existing.id);

    if (update.error) {
      throw new Error(update.error.message);
    }

    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("competition_rounds")
    .insert({
      competition_id: competition.id,
      round_number: 2,
      sort_order: 2,
      ...row,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return inserted.id as string;
}

async function ensureQualifierSession(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string,
  qualifierRoundId: string | null,
  categoryIds: string[]
) {
  if (!qualifierRoundId) {
    throw new Error("Demo seeding requires a qualifier round before climbers can be assigned to a session.");
  }

  const { data, error } = await supabase
    .from("competition_schedule_blocks")
    .select("id, round_id, phase_type, eligible_category_ids, capacity, sort_order")
    .eq("competition_id", competitionId)
    .eq("phase_type", "qualifier_round")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const blocks = (data ?? []) as ScheduleBlockRow[];
  const linkedBlock = blocks.find((block) => block.round_id === qualifierRoundId);
  if (linkedBlock) {
    const update = await supabase
      .from("competition_schedule_blocks")
      .update({
        label: "Cascade Cup qualifier",
        audience_label: "Youth B, Youth A, and Junior",
        eligible_category_ids: categoryIds,
        capacity: Math.max(linkedBlock.capacity ?? 0, CASCADE_CUP_DEMO_FIELD_SIZE),
      })
      .eq("id", linkedBlock.id);

    if (update.error) {
      throw new Error(update.error.message);
    }

    return linkedBlock.id;
  }

  const unlinkedBlock = blocks.find((block) => !block.round_id);
  if (unlinkedBlock) {
    const update = await supabase
      .from("competition_schedule_blocks")
      .update({
        label: "Cascade Cup qualifier",
        audience_label: "Youth B, Youth A, and Junior",
        round_id: qualifierRoundId,
        capacity: Math.max(unlinkedBlock.capacity ?? 0, CASCADE_CUP_DEMO_FIELD_SIZE),
        eligible_category_ids: categoryIds,
      })
      .eq("id", unlinkedBlock.id);

    if (update.error) {
      throw new Error(update.error.message);
    }

    return unlinkedBlock.id;
  }

  const nextSortOrder = blocks.reduce((max, block) => Math.max(max, block.sort_order ?? 0), 0) + 1;
  const { data: inserted, error: insertError } = await supabase
    .from("competition_schedule_blocks")
    .insert({
      competition_id: competitionId,
      round_id: qualifierRoundId,
      sort_order: nextSortOrder,
      label: "Cascade Cup qualifier",
      phase_type: "qualifier_round",
      audience_label: "Youth B, Youth A, and Junior",
      is_active: false,
      start_time: "10:00 AM",
      end_time: "12:00 PM",
      capacity: Math.max(CASCADE_CUP_DEMO_FIELD_SIZE, 20),
      eligible_category_ids: categoryIds,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return inserted.id as string;
}

async function nextScheduleSortOrder(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string,
  fallback: number
) {
  const { data, error } = await supabase
    .from("competition_schedule_blocks")
    .select("sort_order")
    .eq("competition_id", competitionId);

  if (error) {
    throw new Error(error.message);
  }

  const currentMax = (data ?? []).reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), 0);
  return Math.max(currentMax + 1, fallback);
}

async function ensureLifecycleScheduleBlock(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  input: {
    competitionId: string;
    phaseType: "finals_round" | "results";
    label: string;
    audienceLabel: string;
    roundId: string | null;
    categoryIds?: string[];
    startTime: string;
    endTime: string;
    sortOrder: number;
  }
) {
  const { data, error } = await supabase
    .from("competition_schedule_blocks")
    .select("id, label, round_id, phase_type, eligible_category_ids, capacity, sort_order")
    .eq("competition_id", input.competitionId)
    .eq("phase_type", input.phaseType)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const blocks = (data ?? []) as ScheduleBlockRow[];
  const eligibleCategoryIds = input.categoryIds ?? [];
  const linkedBlock = blocks.find((block) =>
    input.roundId ? block.round_id === input.roundId : block.label === input.label || !block.round_id
  );

  if (linkedBlock) {
    const update = await supabase
      .from("competition_schedule_blocks")
      .update({
        label: input.label,
        audience_label: input.audienceLabel,
        round_id: input.roundId,
        start_time: input.startTime,
        end_time: input.endTime,
        capacity: Math.max(linkedBlock.capacity ?? 0, CASCADE_CUP_DEMO_FIELD_SIZE),
        eligible_category_ids: eligibleCategoryIds,
      })
      .eq("competition_id", input.competitionId)
      .eq("id", linkedBlock.id);

    if (update.error) {
      throw new Error(update.error.message);
    }

    return linkedBlock.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("competition_schedule_blocks")
    .insert({
      competition_id: input.competitionId,
      round_id: input.roundId,
      sort_order: await nextScheduleSortOrder(supabase, input.competitionId, input.sortOrder),
      label: input.label,
      phase_type: input.phaseType,
      audience_label: input.audienceLabel,
      is_active: false,
      start_time: input.startTime,
      end_time: input.endTime,
      capacity: Math.max(CASCADE_CUP_DEMO_FIELD_SIZE, 20),
      eligible_category_ids: eligibleCategoryIds,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return inserted.id as string;
}

async function clearPreviousSeed(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string
) {
  const sampleNumbers = SAMPLE_CLIMBERS.map((climber) => climber.number);
  const { data: existingClimbers, error } = await supabase
    .from("climbers")
    .select("id")
    .eq("competition_id", competitionId)
    .in("climber_number", sampleNumbers);

  if (error) {
    throw new Error(error.message);
  }

  const climberIds = (existingClimbers ?? []).map((climber) => climber.id as string);
  if (climberIds.length) {
    const attemptDelete = await supabase.from("qualifier_attempts").delete().in("climber_id", climberIds);
    if (attemptDelete.error) {
      throw new Error(attemptDelete.error.message);
    }

    const finalDelete = await supabase.from("final_attempts").delete().in("climber_id", climberIds);
    if (finalDelete.error) {
      throw new Error(finalDelete.error.message);
    }

    const climberDelete = await supabase.from("climbers").delete().in("id", climberIds);
    if (climberDelete.error) {
      throw new Error(climberDelete.error.message);
    }
  }
}

async function resetDemoCompetitionProgress(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string,
  qualifierRoundId: string,
  qualifierSessionId: string
) {
  const timestamp = new Date().toISOString();
  const finalistDelete = await supabase.from("competition_finalists").delete().eq("competition_id", competitionId);
  if (finalistDelete.error) {
    throw new Error(finalistDelete.error.message);
  }

  const finalAttemptDelete = await supabase.from("final_attempts").delete().eq("competition_id", competitionId);
  if (finalAttemptDelete.error) {
    throw new Error(finalAttemptDelete.error.message);
  }

  const competitionUpdate = await supabase
    .from("competitions")
    .update({
      current_phase: "qualifier_open",
      stage_mode: "qualifier",
      qualifier_locked_at: null,
      finals_started_at: null,
    })
    .eq("id", competitionId);
  if (competitionUpdate.error) {
    throw new Error(competitionUpdate.error.message);
  }

  const inactiveRoundUpdate = await supabase
    .from("competition_rounds")
    .update({
      status: "pending",
      is_active: false,
      activated_at: null,
      started_at: null,
      closed_at: null,
    })
    .eq("competition_id", competitionId)
    .neq("id", qualifierRoundId);
  if (inactiveRoundUpdate.error) {
    throw new Error(inactiveRoundUpdate.error.message);
  }

  const activeRoundUpdate = await supabase
    .from("competition_rounds")
    .update({
      status: "scoring",
      is_active: true,
      activated_at: timestamp,
      started_at: timestamp,
      closed_at: null,
    })
    .eq("competition_id", competitionId)
    .eq("id", qualifierRoundId);
  if (activeRoundUpdate.error) {
    throw new Error(activeRoundUpdate.error.message);
  }

  const clearBlocks = await supabase
    .from("competition_schedule_blocks")
    .update({ is_active: false })
    .eq("competition_id", competitionId);
  if (clearBlocks.error) {
    throw new Error(clearBlocks.error.message);
  }

  const activateBlock = await supabase
    .from("competition_schedule_blocks")
    .update({ is_active: true })
    .eq("competition_id", competitionId)
    .eq("id", qualifierSessionId);
  if (activateBlock.error) {
    throw new Error(activateBlock.error.message);
  }
}

export async function POST(request: NextRequest) {
  let body: DemoSeedRequest;

  try {
    body = (await request.json()) as DemoSeedRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!body.competitionId) {
    return NextResponse.json({ ok: false, error: "competitionId is required." }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("id, slug, is_demo, format, total_climbs, qualifier_counting_climbs, finals_eligible_age_groups")
      .eq("id", body.competitionId)
      .maybeSingle();

    if (competitionError) {
      throw new Error(competitionError.message);
    }

    const competitionRow = competition as CompetitionRow | null;
    if (!competitionRow) {
      return NextResponse.json({ ok: false, error: "Competition not found." }, { status: 404 });
    }

    if (competitionRow.is_demo !== true) {
      return NextResponse.json(
        { ok: false, error: "Refusing to seed sample data into a non-demo competition." },
        { status: 403 }
      );
    }

    const categories = await ensureCascadeCupCategories(supabase, competitionRow.id);
    const categoryIds = categories.map((category) => category.id);
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    await ensureDemoFinalsConfiguration(supabase, competitionRow);
    const qualifierRoundId = await getQualifierRoundId(supabase, competitionRow);
    const finalsRoundId = await ensureFinalsRound(supabase, competitionRow, qualifierRoundId);
    const qualifierSessionId = await ensureQualifierSession(
      supabase,
      competitionRow.id,
      qualifierRoundId,
      categoryIds
    );
    await ensureLifecycleScheduleBlock(supabase, {
      competitionId: competitionRow.id,
      phaseType: "finals_round",
      label: "Cascade Cup finals",
      audienceLabel: "Finalists",
      roundId: finalsRoundId,
      categoryIds,
      startTime: "2:00 PM",
      endTime: "3:30 PM",
      sortOrder: 5,
    });
    await ensureLifecycleScheduleBlock(supabase, {
      competitionId: competitionRow.id,
      phaseType: "results",
      label: "Awards and public results",
      audienceLabel: "Athletes and spectators",
      roundId: null,
      startTime: "4:00 PM",
      endTime: "4:30 PM",
      sortOrder: 6,
    });
    await resetDemoCompetitionProgress(supabase, competitionRow.id, qualifierRoundId, qualifierSessionId);
    await clearPreviousSeed(supabase, competitionRow.id);

    const climberRows = SAMPLE_CLIMBERS.map((climber) => {
      const category = categoryById.get(climber.categoryId);
      if (!category) {
        throw new Error(`Missing demo category ${climber.categoryId}.`);
      }

      return {
        id: createId(),
        competition_id: competitionRow.id,
        name: climber.name,
        climber_number: climber.number,
        province: climber.province,
        category_id: category.id,
        gender_division: category.gender_division,
        age_group: category.age_group,
        display_category: category.display_name,
        time_slot_id: qualifierSessionId,
        access_token: sampleCascadeCupScorecardToken(competitionRow.id, climber.number),
      };
    });

    const { data: insertedClimbers, error: climberError } = await supabase
      .from("climbers")
      .insert(climberRows)
      .select("id, climber_number");

    if (climberError) {
      throw new Error(climberError.message);
    }

    const seedByNumber = new Map(SAMPLE_CLIMBERS.map((climber) => [climber.number, climber]));
    const attempts = (insertedClimbers ?? []).flatMap((climber) =>
      Array.from({ length: CASCADE_CUP_DEMO_QUALIFIER_PROBLEMS }, (_, index) => index + 1).map((climbNumber) => {
        const seed = seedByNumber.get(climber.climber_number as string);
        const score = seed ? scoreFor(seed, climbNumber) : legacyScoreFor(climber.climber_number as string, climbNumber);
        return {
          competition_id: competitionRow.id,
          round_id: qualifierRoundId,
          climber_id: climber.id,
          climb_number: climbNumber,
          entered_by: "staff",
          ...score,
        };
      })
    );

    const { error: attemptError } = await supabase.from("qualifier_attempts").insert(attempts);
    if (attemptError) {
      throw new Error(attemptError.message);
    }

    const target = (insertedClimbers ?? []).find((climber) => climber.climber_number === DEMO_TARGET_CLIMBER_NUMBER);
    const targetClimberId = typeof target?.id === "string" ? target.id : null;

    return NextResponse.json({
      ok: true,
      competitionId: competitionRow.id,
      slug: competitionRow.slug,
      judgeUrl: buildDemoJudgeUrl(competitionRow.slug, targetClimberId),
      publicUrl: buildDemoPublicUrl(competitionRow.slug),
      leaderboardUrl: buildDemoLeaderboardUrl(competitionRow.slug),
      organizerUrl: buildDemoOrganizerUrl(competitionRow.slug),
      scorecardUrl: buildCascadeCupScorecardUrl(competitionRow.slug, competitionRow.id),
      target: {
        climberId: targetClimberId,
        climberNumber: DEMO_TARGET_CLIMBER_NUMBER,
        name: DEMO_TARGET_CLIMBER_NAME,
        climbNumber: DEMO_TARGET_CLIMB_NUMBER,
        before: DEMO_TARGET_BEFORE_LABEL,
        after: DEMO_TARGET_AFTER_LABEL,
      },
      inserted: {
        climbers: insertedClimbers?.length ?? 0,
        attempts: attempts.length,
      },
    });
  } catch (error) {
    console.error("DEMO SEED ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to seed demo data." },
      { status: 500 }
    );
  }
}
