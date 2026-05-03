import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";
import { buildDisplayCategory, createCategoryKey } from "@/lib/scoring";
import {
  DEMO_TARGET_AFTER_LABEL,
  DEMO_TARGET_BEFORE_LABEL,
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NAME,
  DEMO_TARGET_CLIMBER_NUMBER,
  buildDemoJudgeUrl,
  buildDemoLeaderboardUrl,
  buildDemoPublicUrl,
} from "@/lib/demo-scenario";

type DemoSeedRequest = {
  competitionId?: string;
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

const SAMPLE_CLIMBERS = [
  { name: "Leo Grant", number: "101", province: "NS" },
  { name: "Noah Patel", number: "102", province: "NB" },
  { name: "Milo Fraser", number: "103", province: "PE" },
  { name: DEMO_TARGET_CLIMBER_NAME, number: DEMO_TARGET_CLIMBER_NUMBER, province: "NS", target: true },
  { name: "Declan White", number: "105", province: "NL" },
  { name: "Isaac Green", number: "106", province: "QC" },
] as const;

const DEMO_FINALS_CUTOFF = 6;
const DEMO_FINALS_PROBLEM_COUNT = 4;
const DEMO_FINALS_ELIGIBLE_AGE_GROUP = "Youth B";

function createId() {
  return crypto.randomUUID();
}

function sampleToken(competitionId: string, number: string) {
  return `scorecard-demo-seed-${competitionId}-${number}`;
}

function scoreFor(climberNumber: string, climbNumber: number) {
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

async function ensureCategory(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string
) {
  const categoryId = createCategoryKey("Men", "Youth B");
  const { data: existing, error: loadError } = await supabase
    .from("competition_categories")
    .select("id, competition_id, gender_division, age_group, display_name")
    .eq("competition_id", competitionId)
    .eq("id", categoryId)
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }

  if (existing) {
    return existing as CategoryRow;
  }

  const row = {
    id: categoryId,
    competition_id: competitionId,
    gender_division: "Men",
    age_group: "Youth B",
    display_name: buildDisplayCategory("Men", "Youth B"),
    sort_order: 0,
  };
  const { error } = await supabase.from("competition_categories").upsert(row, {
    onConflict: "competition_id,id",
  });

  if (error) {
    throw new Error(error.message);
  }

  return row;
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
      problem_count: competition.total_climbs ?? 4,
      counting_climbs: competition.qualifier_counting_climbs ?? 4,
      finals_cutoff: DEMO_FINALS_CUTOFF,
      eligible_category_ids: [],
      advancement_source_round_id: null,
      advancement_cutoff: DEMO_FINALS_CUTOFF,
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

function ensureYouthBFinalsEligible(value: unknown) {
  const current = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  return Array.from(new Set([...current, DEMO_FINALS_ELIGIBLE_AGE_GROUP]));
}

async function ensureDemoFinalsConfiguration(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: CompetitionRow
) {
  const { error } = await supabase
    .from("competitions")
    .update({
      has_finals: true,
      finals_cutoff: DEMO_FINALS_CUTOFF,
      finals_tie_advances: false,
      finals_problem_count: DEMO_FINALS_PROBLEM_COUNT,
      finals_eligible_age_groups: ensureYouthBFinalsEligible(competition.finals_eligible_age_groups),
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
    problem_count: DEMO_FINALS_PROBLEM_COUNT,
    counting_climbs: null,
    finals_cutoff: DEMO_FINALS_CUTOFF,
    eligible_category_ids: [],
    advancement_source_round_id: qualifierRoundId,
    advancement_cutoff: DEMO_FINALS_CUTOFF,
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

function getEligibleCategoryIds(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function blockAllowsCategory(block: ScheduleBlockRow, categoryId: string) {
  const eligibleCategoryIds = getEligibleCategoryIds(block.eligible_category_ids);
  return eligibleCategoryIds.length === 0 || eligibleCategoryIds.includes(categoryId);
}

async function ensureQualifierSession(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string,
  qualifierRoundId: string | null,
  categoryId: string
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
  const linkedBlock = blocks.find((block) => block.round_id === qualifierRoundId && blockAllowsCategory(block, categoryId));
  if (linkedBlock) {
    return linkedBlock.id;
  }

  const unlinkedBlock = blocks.find((block) => !block.round_id && blockAllowsCategory(block, categoryId));
  if (unlinkedBlock) {
    const update = await supabase
      .from("competition_schedule_blocks")
      .update({
        round_id: qualifierRoundId,
        capacity: Math.max(unlinkedBlock.capacity ?? 0, SAMPLE_CLIMBERS.length),
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
      label: "Demo qualifier session",
      phase_type: "qualifier_round",
      audience_label: "Demo climbers",
      is_active: false,
      start_time: "10:00 AM",
      end_time: "12:00 PM",
      capacity: Math.max(SAMPLE_CLIMBERS.length, 20),
      eligible_category_ids: [categoryId],
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
    categoryId?: string;
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
  const eligibleCategoryIds = input.categoryId ? [input.categoryId] : [];
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
        capacity: Math.max(linkedBlock.capacity ?? 0, SAMPLE_CLIMBERS.length),
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
      capacity: Math.max(SAMPLE_CLIMBERS.length, 20),
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

    const category = await ensureCategory(supabase, competitionRow.id);
    await ensureDemoFinalsConfiguration(supabase, competitionRow);
    const qualifierRoundId = await getQualifierRoundId(supabase, competitionRow);
    const finalsRoundId = await ensureFinalsRound(supabase, competitionRow, qualifierRoundId);
    const qualifierSessionId = await ensureQualifierSession(
      supabase,
      competitionRow.id,
      qualifierRoundId,
      category.id
    );
    await ensureLifecycleScheduleBlock(supabase, {
      competitionId: competitionRow.id,
      phaseType: "finals_round",
      label: "Demo finals",
      audienceLabel: "Finalists",
      roundId: finalsRoundId,
      categoryId: category.id,
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

    const climberRows = SAMPLE_CLIMBERS.map((climber) => ({
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
      access_token: sampleToken(competitionRow.id, climber.number),
    }));

    const { data: insertedClimbers, error: climberError } = await supabase
      .from("climbers")
      .insert(climberRows)
      .select("id, climber_number");

    if (climberError) {
      throw new Error(climberError.message);
    }

    const attempts = (insertedClimbers ?? []).flatMap((climber) =>
      [1, 2, 3, 4].map((climbNumber) => {
        const score = scoreFor(climber.climber_number as string, climbNumber);
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
