import { NextResponse, type NextRequest } from "next/server";
import { normalizeQualifierAttemptInput } from "@/lib/attempts";
import { buildDisplayCategory } from "@/lib/scoring";
import { MOCK_ATHLETE_CURATED_FULL_NAMES } from "@/lib/mock-athlete-name-pool";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

type DemoSimulationMode = "single_score" | "live_burst" | "hydrate_event";

type DemoSimulationRequest = {
  mode?: DemoSimulationMode;
  competitionId?: string;
};

type QualifierAttemptRow = {
  climber_id: string;
  climb_number: number;
  attempt_count: number;
  topped: boolean;
  zone: boolean;
  attempts_to_top: number | null;
  attempts_to_zone: number | null;
};

type DemoCompetitionRecord = {
  id: string;
  slug: string;
  is_demo: boolean;
  current_phase: string;
  total_climbs: number | null;
  max_climbers: number | null;
};

type DemoCategoryRecord = {
  id: string;
  gender_division: string;
  age_group: string;
  sort_order: number;
};

type DemoRoundRecord = {
  id: string;
  problem_count: number | null;
};

type DemoScheduleBlockRecord = {
  id: string;
  eligible_category_ids: string[] | null;
};

const PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL"] as const;

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function createAccessToken(seed: string) {
  return `demo-${seed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function buildAttemptTemplate(seedIndex: number, climbNumber: number) {
  const variant = (seedIndex + climbNumber) % 6;

  switch (variant) {
    case 0:
      return { attempt_count: 1, zone: true, topped: true, attempts_to_top: 1, attempts_to_zone: 1 };
    case 1:
      return { attempt_count: 2, zone: true, topped: true, attempts_to_top: 2, attempts_to_zone: 1 };
    case 2:
      return { attempt_count: 2, zone: true, topped: false, attempts_to_top: null, attempts_to_zone: 2 };
    case 3:
      return { attempt_count: 3, zone: true, topped: false, attempts_to_top: null, attempts_to_zone: 2 };
    case 4:
      return { attempt_count: 3, zone: true, topped: true, attempts_to_top: 3, attempts_to_zone: 1 };
    default:
      return { attempt_count: 4, zone: false, topped: false, attempts_to_top: null, attempts_to_zone: null };
  }
}

async function requireCompetition(
  competitionId: string | undefined,
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>
) {
  if (!competitionId) {
    return {
      error: NextResponse.json({ error: "Missing demo competition id." }, { status: 400 }),
      competition: null,
    };
  }

  const { data: competition, error: competitionError } = await supabase
    .from("competitions")
    .select("id, slug, is_demo, current_phase, total_climbs, max_climbers")
    .eq("id", competitionId)
    .maybeSingle();

  if (competitionError) {
    throw new Error(competitionError.message);
  }

  if (!competition?.is_demo) {
    return {
      error: NextResponse.json({ error: "Demo competition not found." }, { status: 404 }),
      competition: null,
    };
  }

  return {
    error: null,
    competition: competition as DemoCompetitionRecord,
  };
}

async function hydrateEventCompetition(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: DemoCompetitionRecord
) {
  const { data: categories, error: categoriesError } = await supabase
    .from("competition_categories")
    .select("id, gender_division, age_group, sort_order")
    .eq("competition_id", competition.id)
    .order("sort_order", { ascending: true });

  if (categoriesError) {
    throw new Error(categoriesError.message);
  }

  const { data: qualifierRound, error: roundError } = await supabase
    .from("competition_rounds")
    .select("id, problem_count")
    .eq("competition_id", competition.id)
    .eq("scoring_bucket", "qualifier")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (roundError) {
    throw new Error(roundError.message);
  }

  if (!qualifierRound) {
    throw new Error("No active qualifier round is available for this demo event.");
  }

  const { data: qualifierBlocks, error: blocksError } = await supabase
    .from("competition_schedule_blocks")
    .select("id, eligible_category_ids")
    .eq("competition_id", competition.id)
    .eq("phase_type", "qualifier_round")
    .order("sort_order", { ascending: true });

  if (blocksError) {
    throw new Error(blocksError.message);
  }

  const categoryRows = (categories ?? []) as DemoCategoryRecord[];
  if (!categoryRows.length) {
    throw new Error("This demo event needs at least one competition category before it can be simulated.");
  }

  const problemCount = Math.max(1, qualifierRound.problem_count ?? competition.total_climbs ?? 5);
  const climberTarget = Math.min(150, Math.max(24, competition.max_climbers ?? 80));
  const qualifierBlockRows = (qualifierBlocks ?? []) as DemoScheduleBlockRecord[];

  const slotByCategory = new Map<string, string | null>();
  categoryRows.forEach((category) => {
    const matchedBlock =
      qualifierBlockRows.find((block) => (block.eligible_category_ids ?? []).includes(category.id)) ??
      qualifierBlockRows[0] ??
      null;
    slotByCategory.set(category.id, matchedBlock?.id ?? null);
  });

  await supabase.from("qualifier_attempts").delete().eq("competition_id", competition.id);
  await supabase.from("climbers").delete().eq("competition_id", competition.id);

  const climberRows = Array.from({ length: climberTarget }, (_, index) => {
    const category = categoryRows[index % categoryRows.length];
    const fullName = MOCK_ATHLETE_CURATED_FULL_NAMES[index % MOCK_ATHLETE_CURATED_FULL_NAMES.length] ?? `Demo Climber ${index + 1}`;
    const displayCategory = buildDisplayCategory(category.gender_division, category.age_group);
    const climberId = crypto.randomUUID();

    return {
      id: climberId,
      competition_id: competition.id,
      name: fullName,
      climber_number: String(101 + index),
      province: randomItem(PROVINCES),
      category_id: category.id,
      gender_division: category.gender_division,
      age_group: category.age_group,
      display_category: displayCategory,
      time_slot_id: slotByCategory.get(category.id) ?? null,
      access_token: createAccessToken(`${competition.slug}-${fullName}-${index}`),
    };
  });

  const { error: climberInsertError } = await supabase.from("climbers").insert(climberRows);
  if (climberInsertError) {
    throw new Error(climberInsertError.message);
  }

  const seededAttempts = climberRows.flatMap((climber, climberIndex) => {
    const seededProblemCount = Math.max(1, Math.min(problemCount, 2 + (climberIndex % Math.max(1, Math.min(problemCount, 3)))));
    return Array.from({ length: seededProblemCount }, (_, attemptIndex) => {
      const climbNumber = attemptIndex + 1;
      const template = buildAttemptTemplate(climberIndex, climbNumber);
      return {
        competition_id: competition.id,
        round_id: qualifierRound.id,
        climber_id: climber.id,
        climb_number: climbNumber,
        attempt_count: template.attempt_count,
        topped: template.topped,
        zone: template.zone,
        attempts_to_top: template.attempts_to_top,
        attempts_to_zone: template.attempts_to_zone,
        entered_by: "staff",
      };
    });
  });

  if (seededAttempts.length) {
    const { error: attemptsInsertError } = await supabase.from("qualifier_attempts").insert(seededAttempts);
    if (attemptsInsertError) {
      throw new Error(attemptsInsertError.message);
    }
  }

  return {
    competitionId: competition.id,
    climberCount: climberRows.length,
    qualifierAttemptCount: seededAttempts.length,
    roundId: qualifierRound.id,
  };
}

export async function POST(request: NextRequest) {
  let payload: DemoSimulationRequest;

  try {
    payload = (await request.json()) as DemoSimulationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const mode: DemoSimulationMode =
    payload.mode === "live_burst" || payload.mode === "hydrate_event" ? payload.mode : "single_score";

  try {
    const supabase = createServiceRoleSupabaseClient();
    const { competition, error } = await requireCompetition(payload.competitionId, supabase);
    if (error || !competition) {
      return error;
    }

    if (mode === "hydrate_event") {
      const result = await hydrateEventCompetition(supabase, competition);
      return NextResponse.json({
        mode,
        ...result,
      });
    }

    if (competition.current_phase !== "qualifier_open") {
      return NextResponse.json(
        { error: "Demo score simulation only runs while qualifiers are live." },
        { status: 409 }
      );
    }

    const { data: round, error: roundError } = await supabase
      .from("competition_rounds")
      .select("id, problem_count")
      .eq("competition_id", competition.id)
      .eq("scoring_bucket", "qualifier")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (roundError) {
      throw new Error(roundError.message);
    }

    if (!round) {
      return NextResponse.json({ error: "No active demo qualifier round is available." }, { status: 409 });
    }

    const { data: climbers, error: climbersError } = await supabase
      .from("climbers")
      .select("id, name, climber_number")
      .eq("competition_id", competition.id)
      .order("climber_number", { ascending: true });

    if (climbersError) {
      throw new Error(climbersError.message);
    }

    if (!climbers?.length) {
      return NextResponse.json({ error: "No simulated demo climbers are available yet." }, { status: 404 });
    }

    const { data: attempts, error: attemptsError } = await supabase
      .from("qualifier_attempts")
      .select(
        "competition_id, round_id, climber_id, climb_number, attempt_count, topped, zone, attempts_to_top, attempts_to_zone, entered_by, updated_at"
      )
      .eq("competition_id", competition.id)
      .eq("round_id", round.id);

    if (attemptsError) {
      throw new Error(attemptsError.message);
    }

    const problemCount = Math.max(1, round.problem_count ?? competition.total_climbs ?? 5);
    const attemptMap = new Map<string, QualifierAttemptRow>();
    (attempts ?? []).forEach((attempt) => {
      attemptMap.set(`${attempt.climber_id}:${attempt.climb_number}`, attempt as QualifierAttemptRow);
    });

    const candidateCells: Array<{ climberId: string; climbNumber: number; existing?: QualifierAttemptRow }> = [];
    climbers.forEach((climber) => {
      for (let climbNumber = 1; climbNumber <= problemCount; climbNumber += 1) {
        const existing = attemptMap.get(`${climber.id}:${climbNumber}`);
        if (!existing?.topped) {
          candidateCells.push({ climberId: climber.id, climbNumber, existing });
        }
      }
    });

    if (!candidateCells.length) {
      return NextResponse.json({ error: "The simulated event has already topped every available cell." }, { status: 409 });
    }

    const preferred = candidateCells.filter((cell) => !cell.existing?.zone);
    const candidate = randomItem(preferred.length ? preferred : candidateCells);
    const nextAttemptCount = Math.max(1, (candidate.existing?.attempt_count ?? 0) + 1);
    const zoneAlready = Boolean(candidate.existing?.zone);
    const topAlready = Boolean(candidate.existing?.topped);
    const shouldZone =
      zoneAlready ||
      nextAttemptCount >= 4 ||
      Math.random() < (mode === "live_burst" ? 0.62 : 0.54);
    const shouldTop =
      topAlready ||
      (shouldZone &&
        (nextAttemptCount >= 5 || Math.random() < (mode === "live_burst" ? 0.34 : 0.26)));

    const normalized = normalizeQualifierAttemptInput({
      attemptCount: nextAttemptCount,
      topped: shouldTop,
      zone: shouldZone,
      attemptsToTop: shouldTop ? candidate.existing?.attempts_to_top ?? nextAttemptCount : null,
      attemptsToZone: shouldZone ? candidate.existing?.attempts_to_zone ?? nextAttemptCount : null,
    });

    const { data, error: upsertError } = await supabase.rpc("append_qualifier_score_event", {
      p_competition_id: competition.id,
      p_round_id: round.id,
      p_climber_id: candidate.climberId,
      p_climb_number: candidate.climbNumber,
      p_attempt_count: normalized.attemptCount,
      p_topped: normalized.topped,
      p_zone: normalized.zone,
      p_attempts_to_top: normalized.attemptsToTop,
      p_attempts_to_zone: normalized.attemptsToZone,
      p_entered_by: "staff",
      p_client_event_id: `demo-sim-${crypto.randomUUID()}`,
      p_scored_at: new Date().toISOString(),
      p_judge_device_id: "demo-simulator",
      p_judge_session_id: mode,
      p_replayed_from_offline: false,
    });

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    const attempt =
      result && typeof result === "object" && "attempt" in result
        ? (result as { attempt: unknown }).attempt
        : null;

    return NextResponse.json({
      mode,
      attempt,
      climberId: candidate.climberId,
      climbNumber: candidate.climbNumber,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to simulate the demo event.",
      },
      { status: 500 }
    );
  }
}
