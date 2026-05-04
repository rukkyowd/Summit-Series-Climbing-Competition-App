import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";
import {
  DEMO_TARGET_AFTER_LABEL,
  DEMO_TARGET_BEFORE_LABEL,
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NAME,
  DEMO_TARGET_CLIMBER_NUMBER,
  buildDemoJudgeUrl,
  buildDemoOrganizerUrl,
  buildDemoPublicUrl,
} from "@/lib/demo-scenario";

type DemoSeedRequest = {
  competitionId?: string;
  slug?: string;
};

type CompetitionRow = {
  id: string;
  slug: string;
  is_demo: boolean;
  format: string | null;
  total_climbs: number | null;
  qualifier_counting_climbs: number | null;
  finals_cutoff: number | null;
  finals_problem_count: number | null;
  qualifier_eligible_age_groups: unknown;
  current_phase: string | null;
};

type CategoryRow = {
  id: string;
  competition_id: string;
  gender_division: string;
  age_group: string;
  display_name: string;
  sort_order?: number | null;
};

type RoundRow = {
  id: string;
  round_number?: number | null;
  sort_order?: number | null;
  problem_count?: number | null;
  counting_climbs?: number | null;
};

type ScheduleBlockRow = {
  id: string;
  round_id: string | null;
  capacity: number | null;
  sort_order: number | null;
};

type InsertedClimberRow = {
  id: string;
  climber_number: string;
};

const DEMO_FIELD_SIZE = 12;
const DEMO_PROBLEM_COUNT = 6;
const DEMO_CLIMBERS = Array.from({ length: DEMO_FIELD_SIZE }, (_, index) => {
  const letter = String.fromCharCode("A".charCodeAt(0) + index);
  return {
    name: `Athlete ${letter}`,
    number: String(101 + index),
    province: ["NS", "NB", "PE", "NL", "QC", "ON"][index % 6],
    seedIndex: index,
  };
});
const DEMO_CLIMBER_NUMBERS = DEMO_CLIMBERS.map((climber) => climber.number);

function createId() {
  return crypto.randomUUID();
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function scoreFor(seedIndex: number, climbNumber: number) {
  if (DEMO_CLIMBERS[seedIndex]?.number === DEMO_TARGET_CLIMBER_NUMBER && climbNumber === DEMO_TARGET_CLIMB_NUMBER) {
    return {
      attempt_count: 3,
      zone: true,
      topped: true,
      attempts_to_top: 3,
      attempts_to_zone: 1,
    };
  }

  const topCountBySeed = [6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 2, 1];
  const topCount = topCountBySeed[seedIndex] ?? 2;
  const topped = climbNumber <= topCount;
  const zone = topped || climbNumber <= Math.min(DEMO_PROBLEM_COUNT, topCount + 1 + (seedIndex % 2));
  const attemptCount = topped ? 1 + ((seedIndex + climbNumber) % 3) : zone ? 2 + ((seedIndex + climbNumber) % 2) : 0;

  return {
    attempt_count: attemptCount,
    zone,
    topped,
    attempts_to_top: topped ? attemptCount : null,
    attempts_to_zone: zone ? Math.max(1, Math.min(attemptCount || 1, 2)) : null,
  };
}

async function getCompetition(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  body: DemoSeedRequest
) {
  const query = supabase
    .from("competitions")
    .select(
      "id, slug, is_demo, format, total_climbs, qualifier_counting_climbs, finals_cutoff, finals_problem_count, qualifier_eligible_age_groups, current_phase"
    )
    .limit(1);

  const { data, error } = body.competitionId
    ? await query.eq("id", body.competitionId).maybeSingle()
    : await query.eq("slug", body.slug ?? "").maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as CompetitionRow | null;
}

async function getSelectedCategories(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: CompetitionRow
) {
  const { data, error } = await supabase
    .from("competition_categories")
    .select("id, competition_id, gender_division, age_group, display_name, sort_order")
    .eq("competition_id", competition.id)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const allCategories = (data ?? []) as CategoryRow[];
  const selectedAgeGroups = new Set(asStringArray(competition.qualifier_eligible_age_groups));
  const selectedCategories = allCategories.filter((category) => selectedAgeGroups.has(category.age_group));

  if (!selectedCategories.length) {
    throw new Response("You must add at least one category", { status: 409 });
  }

  return selectedCategories;
}

async function ensureQualifierRound(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: CompetitionRow
) {
  const { data, error } = await supabase
    .from("competition_rounds")
    .select("id, round_number, sort_order, problem_count, counting_climbs")
    .eq("competition_id", competition.id)
    .or("round_type.eq.qualifier,scoring_bucket.eq.qualifier")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const existing = data as RoundRow | null;
  const problemCount = Math.max(existing?.problem_count ?? competition.total_climbs ?? DEMO_PROBLEM_COUNT, DEMO_PROBLEM_COUNT);
  const countingClimbs = Math.min(
    Math.max(existing?.counting_climbs ?? competition.qualifier_counting_climbs ?? DEMO_PROBLEM_COUNT, 1),
    problemCount
  );

  if (existing?.id) {
    const update = await supabase
      .from("competition_rounds")
      .update({
        name: "Qualifier",
        round_type: "qualifier",
        format: competition.format ?? "scramble",
        status: "scoring",
        runtime_phase: "qualifier_open",
        is_enabled: true,
        is_active: true,
        activated_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        closed_at: null,
        problem_count: problemCount,
        counting_climbs: countingClimbs,
        scoring_bucket: "qualifier",
      })
      .eq("competition_id", competition.id)
      .eq("id", existing.id);

    if (update.error) {
      throw new Error(update.error.message);
    }

    return { id: existing.id, problemCount };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("competition_rounds")
    .insert({
      competition_id: competition.id,
      round_number: 1,
      sort_order: 1,
      name: "Qualifier",
      round_type: "qualifier",
      format: competition.format ?? "scramble",
      status: "scoring",
      runtime_phase: "qualifier_open",
      is_enabled: true,
      is_active: true,
      activated_at: new Date().toISOString(),
      problem_count: DEMO_PROBLEM_COUNT,
      counting_climbs: Math.min(competition.qualifier_counting_climbs ?? DEMO_PROBLEM_COUNT, DEMO_PROBLEM_COUNT),
      finals_cutoff: competition.finals_cutoff ?? 6,
      eligible_category_ids: [],
      advancement_source_round_id: null,
      advancement_cutoff: competition.finals_cutoff ?? 6,
      scoring_bucket: "qualifier",
      scoring_config: {},
      started_at: new Date().toISOString(),
      closed_at: null,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return { id: inserted.id as string, problemCount: DEMO_PROBLEM_COUNT };
}

async function ensureQualifierSession(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string,
  qualifierRoundId: string,
  categoryIds: string[]
) {
  const { data, error } = await supabase
    .from("competition_schedule_blocks")
    .select("id, round_id, capacity, sort_order")
    .eq("competition_id", competitionId)
    .eq("phase_type", "qualifier_round")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const blocks = (data ?? []) as ScheduleBlockRow[];
  const linkedBlock = blocks.find((block) => block.round_id === qualifierRoundId) ?? blocks[0] ?? null;

  if (linkedBlock?.id) {
    const update = await supabase
      .from("competition_schedule_blocks")
      .update({
        label: "Qualifier round",
        audience_label: "Demo field",
        round_id: qualifierRoundId,
        is_active: true,
        capacity: Math.max(linkedBlock.capacity ?? 0, DEMO_FIELD_SIZE),
        eligible_category_ids: categoryIds,
      })
      .eq("competition_id", competitionId)
      .eq("id", linkedBlock.id);

    if (update.error) {
      throw new Error(update.error.message);
    }

    return linkedBlock.id;
  }

  const nextSortOrder = blocks.reduce((max, block) => Math.max(max, block.sort_order ?? 0), 0) + 1;
  const { data: inserted, error: insertError } = await supabase
    .from("competition_schedule_blocks")
    .insert({
      competition_id: competitionId,
      round_id: qualifierRoundId,
      sort_order: nextSortOrder,
      label: "Qualifier round",
      phase_type: "qualifier_round",
      audience_label: "Demo field",
      is_active: true,
      start_time: "10:00 AM",
      end_time: "12:00 PM",
      capacity: Math.max(DEMO_FIELD_SIZE, 20),
      eligible_category_ids: categoryIds,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return inserted.id as string;
}

async function resetDemoProgress(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string,
  qualifierRoundId: string,
  qualifierSessionId: string
) {
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

  const inactiveRounds = await supabase
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
  if (inactiveRounds.error) {
    throw new Error(inactiveRounds.error.message);
  }

  const activeRound = await supabase
    .from("competition_rounds")
    .update({
      status: "scoring",
      is_active: true,
      closed_at: null,
    })
    .eq("competition_id", competitionId)
    .eq("id", qualifierRoundId);
  if (activeRound.error) {
    throw new Error(activeRound.error.message);
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

async function clearPreviousSeed(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string
) {
  const { data: existingClimbers, error } = await supabase
    .from("climbers")
    .select("id")
    .eq("competition_id", competitionId)
    .in("climber_number", DEMO_CLIMBER_NUMBERS);

  if (error) {
    throw new Error(error.message);
  }

  const climberIds = (existingClimbers ?? []).map((climber) => climber.id as string);
  if (!climberIds.length) {
    return;
  }

  const qualifierDelete = await supabase.from("qualifier_attempts").delete().in("climber_id", climberIds);
  if (qualifierDelete.error) {
    throw new Error(qualifierDelete.error.message);
  }

  const finalDelete = await supabase.from("final_attempts").delete().in("climber_id", climberIds);
  if (finalDelete.error) {
    throw new Error(finalDelete.error.message);
  }

  const finalistDelete = await supabase.from("competition_finalists").delete().in("climber_id", climberIds);
  if (finalistDelete.error) {
    throw new Error(finalistDelete.error.message);
  }

  const climberDelete = await supabase.from("climbers").delete().in("id", climberIds);
  if (climberDelete.error) {
    throw new Error(climberDelete.error.message);
  }
}

export async function POST(request: NextRequest) {
  let body: DemoSeedRequest;

  try {
    body = (await request.json()) as DemoSeedRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!body.competitionId && !body.slug) {
    return NextResponse.json({ ok: false, error: "competitionId or slug is required." }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleSupabaseClient();
    const competition = await getCompetition(supabase, body);

    if (!competition) {
      return NextResponse.json({ ok: false, error: "Competition not found." }, { status: 404 });
    }

    if (competition.is_demo !== true) {
      return NextResponse.json(
        { ok: false, error: "Refusing to seed sample data into a non-demo competition." },
        { status: 403 }
      );
    }

    const categories = await getSelectedCategories(supabase, competition);
    const categoryIds = categories.map((category) => category.id);
    const qualifierRound = await ensureQualifierRound(supabase, competition);
    const qualifierSessionId = await ensureQualifierSession(
      supabase,
      competition.id,
      qualifierRound.id,
      categoryIds
    );

    await resetDemoProgress(supabase, competition.id, qualifierRound.id, qualifierSessionId);
    await clearPreviousSeed(supabase, competition.id);

    const climberRows = DEMO_CLIMBERS.map((climber, index) => {
      const category = categories[index % categories.length];
      return {
        id: createId(),
        competition_id: competition.id,
        name: climber.name,
        climber_number: climber.number,
        province: climber.province,
        category_id: category.id,
        gender_division: category.gender_division,
        age_group: category.age_group,
        display_category: category.display_name,
        time_slot_id: qualifierSessionId,
        access_token: `summit-demo-${competition.id}-${climber.number}`,
      };
    });

    const { data: insertedClimbers, error: climberError } = await supabase
      .from("climbers")
      .insert(climberRows)
      .select("id, climber_number");

    if (climberError) {
      throw new Error(climberError.message);
    }

    const insertedRows = (insertedClimbers ?? []) as InsertedClimberRow[];
    const seedIndexByNumber = new Map(DEMO_CLIMBERS.map((climber) => [climber.number, climber.seedIndex]));
    const problemCount = Math.max(qualifierRound.problemCount, DEMO_TARGET_CLIMB_NUMBER);
    const attempts = insertedRows.flatMap((climber) =>
      Array.from({ length: problemCount }, (_, index) => {
        const climbNumber = index + 1;
        const seedIndex = seedIndexByNumber.get(climber.climber_number) ?? 0;
        return {
          competition_id: competition.id,
          round_id: qualifierRound.id,
          climber_id: climber.id,
          climb_number: climbNumber,
          entered_by: "staff",
          ...scoreFor(seedIndex, climbNumber),
        };
      })
    );

    const { error: attemptError } = await supabase.from("qualifier_attempts").insert(attempts);
    if (attemptError) {
      throw new Error(attemptError.message);
    }

    const target = insertedRows.find((climber) => climber.climber_number === DEMO_TARGET_CLIMBER_NUMBER);
    const targetClimberId = target?.id ?? null;

    return NextResponse.json({
      ok: true,
      competitionId: competition.id,
      slug: competition.slug,
      activeRoundId: qualifierRound.id,
      judgeUrl: buildDemoJudgeUrl(competition.slug, targetClimberId),
      organizerUrl: buildDemoOrganizerUrl(competition.slug),
      publicUrl: buildDemoPublicUrl(competition.slug),
      target: {
        climberId: targetClimberId,
        climberNumber: DEMO_TARGET_CLIMBER_NUMBER,
        name: DEMO_TARGET_CLIMBER_NAME,
        climbNumber: DEMO_TARGET_CLIMB_NUMBER,
        before: DEMO_TARGET_BEFORE_LABEL,
        after: DEMO_TARGET_AFTER_LABEL,
      },
      inserted: {
        climbers: insertedRows.length,
        attempts: attempts.length,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      const message = await error.text();
      return NextResponse.json({ ok: false, error: message }, { status: error.status });
    }

    console.error("DEMO SEED ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to seed demo data." },
      { status: 500 }
    );
  }
}
