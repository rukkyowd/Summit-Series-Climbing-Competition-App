import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";
import {
  getDemoQualifierRound,
  getDemoQualifierScheduleBlock,
  getDemoSelectedQualifierCategories,
  getDemoSetupValidation,
} from "@/lib/demo-setup-validation";
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
import type { Competition, CompetitionRound, CompetitionScheduleBlock } from "@/lib/scoring";

type DemoSeedRequest = {
  competitionId?: string;
  slug?: string;
};

type CompetitionRow = {
  id: string;
  slug: string;
  name: string | null;
  is_demo: boolean;
  format: string | null;
  has_finals: boolean | null;
  location_name: string | null;
  start_date: string | null;
  end_date: string | null;
  total_climbs: number | null;
  qualifier_counting_climbs: number | null;
  finals_cutoff: number | null;
  finals_problem_count: number | null;
  qualifier_eligible_age_groups: unknown;
  finals_eligible_age_groups: unknown;
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
  competition_id?: string | null;
  round_number?: number | null;
  sort_order?: number | null;
  name?: string | null;
  round_type?: string | null;
  format?: string | null;
  status?: string | null;
  runtime_phase?: string | null;
  is_enabled?: boolean | null;
  is_active?: boolean | null;
  activated_at?: string | null;
  problem_count?: number | null;
  counting_climbs?: number | null;
  finals_cutoff?: number | null;
  eligible_category_ids?: unknown;
  advancement_source_round_id?: string | null;
  advancement_cutoff?: number | null;
  scoring_bucket?: string | null;
  scoring_config?: unknown;
  started_at?: string | null;
  closed_at?: string | null;
};

type ScheduleBlockRow = {
  id: string;
  competition_id?: string | null;
  round_id: string | null;
  label?: string | null;
  phase_type?: string | null;
  audience_label?: string | null;
  is_active?: boolean | null;
  start_time?: string | null;
  end_time?: string | null;
  capacity: number | null;
  sort_order: number | null;
  eligible_category_ids?: unknown;
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
      "id, slug, name, is_demo, format, has_finals, location_name, start_date, end_date, total_climbs, qualifier_counting_climbs, finals_cutoff, finals_problem_count, qualifier_eligible_age_groups, finals_eligible_age_groups, current_phase"
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

async function getCompetitionCategories(
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

  return (data ?? []) as CategoryRow[];
}

async function getCompetitionRounds(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: CompetitionRow
) {
  const { data, error } = await supabase
    .from("competition_rounds")
    .select(
      "id, competition_id, round_number, sort_order, name, round_type, format, status, runtime_phase, is_enabled, is_active, activated_at, problem_count, counting_climbs, finals_cutoff, eligible_category_ids, advancement_source_round_id, advancement_cutoff, scoring_bucket, scoring_config, started_at, closed_at"
    )
    .eq("competition_id", competition.id)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RoundRow[];
}

async function getCompetitionScheduleBlocks(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: CompetitionRow
) {
  const { data, error } = await supabase
    .from("competition_schedule_blocks")
    .select(
      "id, competition_id, round_id, sort_order, label, phase_type, audience_label, is_active, start_time, end_time, capacity, eligible_category_ids"
    )
    .eq("competition_id", competition.id)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ScheduleBlockRow[];
}

function asNumber(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asFinalsCutoff(value: number | null | undefined): 6 | 8 | null {
  if (value === 8) {
    return 8;
  }
  if (value === 6) {
    return 6;
  }
  return null;
}

function buildSetupCompetition(
  competition: CompetitionRow,
  categories: CategoryRow[],
  rounds: RoundRow[],
  scheduleBlocks: ScheduleBlockRow[]
) {
  return {
    id: competition.id,
    slug: competition.slug,
    name: competition.name ?? "",
    is_demo: competition.is_demo,
    format: (competition.format ?? "scramble") as Competition["format"],
    has_finals: competition.has_finals === true,
    location_name: competition.location_name ?? "",
    start_date: competition.start_date,
    end_date: competition.end_date,
    total_climbs: asNumber(competition.total_climbs, DEMO_PROBLEM_COUNT),
    qualifier_counting_climbs: asNumber(competition.qualifier_counting_climbs, DEMO_PROBLEM_COUNT),
    finals_cutoff: asFinalsCutoff(competition.finals_cutoff) ?? 6,
    finals_problem_count: asNumber(competition.finals_problem_count, 4),
    qualifier_eligible_age_groups: asStringArray(competition.qualifier_eligible_age_groups),
    finals_eligible_age_groups: asStringArray(competition.finals_eligible_age_groups),
    categories: categories.map((category) => ({
      ...category,
      sort_order: category.sort_order ?? 0,
    })),
    rounds: rounds.map((round, index) => ({
      id: round.id,
      competition_id: round.competition_id ?? competition.id,
      round_number: round.round_number ?? index + 1,
      sort_order: round.sort_order ?? index + 1,
      name: round.name ?? "",
      round_type: (round.round_type ?? "qualifier") as CompetitionRound["round_type"],
      format: (round.format ?? competition.format ?? "scramble") as CompetitionRound["format"],
      status: (round.status ?? "pending") as CompetitionRound["status"],
      runtime_phase: (round.runtime_phase ?? "qualifier_open") as CompetitionRound["runtime_phase"],
      is_enabled: round.is_enabled !== false,
      is_active: round.is_active === true,
      activated_at: round.activated_at ?? null,
      problem_count: asNumber(round.problem_count, 0),
      counting_climbs: typeof round.counting_climbs === "number" ? round.counting_climbs : null,
      finals_cutoff: asFinalsCutoff(round.finals_cutoff),
      eligible_category_ids: asStringArray(round.eligible_category_ids),
      advancement_source_round_id: round.advancement_source_round_id ?? null,
      advancement_cutoff: typeof round.advancement_cutoff === "number" ? round.advancement_cutoff : null,
      scoring_bucket: (round.scoring_bucket ?? "none") as CompetitionRound["scoring_bucket"],
      scoring_config:
        round.scoring_config && typeof round.scoring_config === "object" && !Array.isArray(round.scoring_config)
          ? (round.scoring_config as Record<string, unknown>)
          : {},
      started_at: round.started_at ?? null,
      closed_at: round.closed_at ?? null,
    })),
    schedule_blocks: scheduleBlocks.map((block, index) => ({
      id: block.id,
      competition_id: block.competition_id ?? competition.id,
      round_id: block.round_id,
      sort_order: block.sort_order ?? index + 1,
      label: block.label ?? "",
      phase_type: (block.phase_type ?? "custom") as CompetitionScheduleBlock["phase_type"],
      audience_label: block.audience_label ?? "",
      is_active: block.is_active === true,
      start_time: block.start_time ?? null,
      end_time: block.end_time ?? null,
      capacity: asNumber(block.capacity, 0),
      eligible_category_ids: asStringArray(block.eligible_category_ids),
    })),
  };
}

async function prepareQualifierRound(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: CompetitionRow,
  qualifierRound: ReturnType<typeof getDemoQualifierRound>
) {
  if (!qualifierRound?.id) {
    throw new Response("Add a qualifier scoring stage.", { status: 409 });
  }

  const problemCount = Math.max(asNumber(qualifierRound.problem_count, DEMO_PROBLEM_COUNT), DEMO_TARGET_CLIMB_NUMBER);
  const countingClimbs = Math.min(
    Math.max(asNumber(qualifierRound.counting_climbs, competition.qualifier_counting_climbs ?? DEMO_PROBLEM_COUNT), 1),
    problemCount
  );
  const update = await supabase
    .from("competition_rounds")
    .update({
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
    .eq("id", qualifierRound.id);

  if (update.error) {
    throw new Error(update.error.message);
  }

  return { id: qualifierRound.id, problemCount };
}

async function prepareQualifierSession(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string,
  qualifierSession: ReturnType<typeof getDemoQualifierScheduleBlock>,
  categoryIds: string[]
) {
  if (!qualifierSession?.id) {
    throw new Response("Add a qualifier schedule block linked to the qualifier stage.", { status: 409 });
  }

  const update = await supabase
    .from("competition_schedule_blocks")
    .update({
      is_active: true,
      capacity: Math.max(qualifierSession.capacity ?? 0, DEMO_FIELD_SIZE),
      eligible_category_ids: categoryIds,
    })
    .eq("competition_id", competitionId)
    .eq("id", qualifierSession.id);

  if (update.error) {
    throw new Error(update.error.message);
  }

  return qualifierSession.id;
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

    const allCategories = await getCompetitionCategories(supabase, competition);
    const rounds = await getCompetitionRounds(supabase, competition);
    const scheduleBlocks = await getCompetitionScheduleBlocks(supabase, competition);
    const setupCompetition = buildSetupCompetition(competition, allCategories, rounds, scheduleBlocks);
    const setupValidation = getDemoSetupValidation(setupCompetition, {
      requirePreset: false,
      saved: true,
    });

    if (!setupValidation.canContinueToJudge) {
      throw new Response(setupValidation.firstBlockingMessage ?? "Complete the demo setup before seeding.", {
        status: 409,
      });
    }

    const selectedCategoryIds = new Set(getDemoSelectedQualifierCategories(setupCompetition).map((category) => category.id));
    const categories = allCategories.filter((category) => selectedCategoryIds.has(category.id));
    const categoryIds = categories.map((category) => category.id);
    const qualifierRound = await prepareQualifierRound(supabase, competition, getDemoQualifierRound(setupCompetition));
    const qualifierSessionId = await prepareQualifierSession(
      supabase,
      competition.id,
      getDemoQualifierScheduleBlock(setupCompetition),
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
