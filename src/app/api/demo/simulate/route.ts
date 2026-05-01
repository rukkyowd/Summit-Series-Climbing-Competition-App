import { NextResponse, type NextRequest } from "next/server";
import { normalizeQualifierAttemptInput } from "@/lib/attempts";
import { buildDisplayCategory } from "@/lib/scoring";
import { MOCK_ATHLETE_CURATED_FULL_NAMES } from "@/lib/mock-athlete-name-pool";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

type DemoSimulationMode =
  | "single_score"
  | "live_burst"
  | "hydrate_event"
  | "drama_tick"
  | "drama_reset";

type DemoSimulationRequest = {
  mode?: DemoSimulationMode;
  competitionId?: string;
};

type DramaMetadata = {
  drama_pair?: string[];
  drama_target_climber?: string;
  drama_target_climb_number?: number;
  drama_target_attempts_before?: number;
  drama_target_attempts_after?: number;
  drama_description?: string;
} | null;

type DramaContext = {
  athleteName: string;
  climberBName: string;
  climbLabel: string;
  beforeRank: number | null;
  afterRank: number | null;
  tiebreakExplanation: string;
  isRankSwap: boolean;
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
  demo_metadata: DramaMetadata;
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

type DemoClimberInsertRow = {
  id: string;
  competition_id: string;
  name: string;
  climber_number: string;
  province: string;
  category_id: string;
  gender_division: string;
  age_group: string;
  display_category: string;
  time_slot_id: string | null;
  access_token: string;
};

const PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL"] as const;
const DRAMA_PREFERRED_AGE_GROUPS = ["Youth B", "Youth A", "Junior", "Open"] as const;

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function hashSeed(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededUnit(seed: string) {
  return hashSeed(seed) / 4294967295;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createAccessToken(seed: string) {
  return `demo-${seed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function getCategoryStrength(ageGroup: string) {
  switch (ageGroup) {
    case "Open":
      return 0.08;
    case "Junior":
      return 0.05;
    case "Youth A":
      return 0.04;
    case "Youth B":
      return 0.02;
    case "Youth C":
      return -0.02;
    case "Youth D":
      return -0.05;
    case "Masters":
      return -0.01;
    case "Rec":
      return -0.08;
    default:
      return 0;
  }
}

function buildRealisticAttempt(
  competitionId: string,
  category: DemoCategoryRecord,
  categoryIndex: number,
  climberSeed: string,
  fieldRank: number,
  fieldSize: number,
  climbNumber: number,
  problemCount: number
) {
  const normalizedRank = fieldSize <= 1 ? 0 : fieldRank / (fieldSize - 1);
  const baseSkill = 0.97 - normalizedRank * 0.72;
  const categoryBoost = getCategoryStrength(category.age_group);
  const consistency = seededUnit(`${climberSeed}:consistency`) * 0.14 - 0.07;
  const clutchBoost = seededUnit(`${climberSeed}:clutch:${climbNumber}`) * 0.14 - 0.07;
  const skill = clamp(baseSkill + categoryBoost + consistency + clutchBoost, 0.12, 1.05);

  const normalizedClimb = problemCount <= 1 ? 0 : (climbNumber - 1) / (problemCount - 1);
  const categoryDifficultyShift = (categoryIndex % 3) * 0.015;
  const routeDifficulty =
    0.22 +
    normalizedClimb * 0.5 +
    seededUnit(`${competitionId}:difficulty:${category.id}:${climbNumber}`) * 0.13 +
    categoryDifficultyShift;

  const attendancePenalty =
    normalizedClimb > 0.65 && skill < 0.45 && seededUnit(`${climberSeed}:attendance:${climbNumber}`) > 0.84
      ? 0.2
      : 0;
  const performance = skill - routeDifficulty - attendancePenalty;
  const volatility = seededUnit(`${climberSeed}:volatility:${climbNumber}`) * 0.12 - 0.06;
  const finalScore = performance + volatility;

  if (finalScore > 0.27) {
    const attemptsToTop = clamp(
      1 + Math.floor((0.46 - finalScore) * -4 + seededUnit(`${climberSeed}:top:${climbNumber}`) * 2),
      1,
      4
    );
    const flashBias = seededUnit(`${climberSeed}:flash:${climbNumber}`);
    const adjustedAttemptsToTop = finalScore > 0.44 && flashBias > 0.32 ? 1 : attemptsToTop;
    const attemptsToZone =
      adjustedAttemptsToTop === 1
        ? 1
        : clamp(adjustedAttemptsToTop - (flashBias > 0.66 ? 1 : 0), 1, adjustedAttemptsToTop);

    return {
      attempt_count: adjustedAttemptsToTop,
      zone: true,
      topped: true,
      attempts_to_top: adjustedAttemptsToTop,
      attempts_to_zone: attemptsToZone,
    };
  }

  if (finalScore > -0.03) {
    const attemptsToZone = clamp(
      1 + Math.floor((0.18 - finalScore) * 6 + seededUnit(`${climberSeed}:zone:${climbNumber}`) * 2),
      1,
      4
    );
    const extraBurns = seededUnit(`${climberSeed}:zone-burn:${climbNumber}`) > 0.58 ? 1 : 0;

    return {
      attempt_count: clamp(attemptsToZone + extraBurns, attemptsToZone, 5),
      zone: true,
      topped: false,
      attempts_to_top: null,
      attempts_to_zone: attemptsToZone,
    };
  }

  const workingAttempts = clamp(
    1 + Math.floor(Math.max(0, routeDifficulty - skill) * 5 + seededUnit(`${climberSeed}:miss:${climbNumber}`) * 2),
    1,
    5
  );

  return {
    attempt_count: workingAttempts,
    zone: false,
    topped: false,
    attempts_to_top: null,
    attempts_to_zone: null,
  };
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
    .select("id, slug, is_demo, current_phase, total_climbs, max_climbers, demo_metadata")
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

async function seedDramaScenario(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: DemoCompetitionRecord,
  qualifierRound: DemoRoundRecord,
  categoryRows: DemoCategoryRecord[],
  climberRows: DemoClimberInsertRow[],
  problemCount: number
) {
  if (problemCount < 4) {
    throw new Error("This demo event needs at least four qualifier boulders to seed the cut-line drama scenario.");
  }

  const categoryCounts = new Map<string, number>();
  climberRows.forEach((climber) => {
    categoryCounts.set(climber.category_id, (categoryCounts.get(climber.category_id) ?? 0) + 1);
  });

  const targetCategory =
    [...categoryRows]
      .filter(
        (category) =>
          category.gender_division === "Men" &&
          DRAMA_PREFERRED_AGE_GROUPS.includes(
            category.age_group as (typeof DRAMA_PREFERRED_AGE_GROUPS)[number]
          )
      )
      .sort((left, right) => {
        const countDiff = (categoryCounts.get(right.id) ?? 0) - (categoryCounts.get(left.id) ?? 0);
        if (countDiff !== 0) {
          return countDiff;
        }

        return left.sort_order - right.sort_order;
      })[0] ?? null;

  if (!targetCategory) {
    throw new Error("Unable to find a category for the demo cut-line drama scenario.");
  }

  const trio = [...climberRows]
    .filter((climber) => climber.category_id === targetCategory.id)
    .sort((left, right) => Number(left.climber_number) - Number(right.climber_number))
    .slice(0, 3);

  if (trio.length < 3) {
    throw new Error("The demo cut-line drama scenario needs at least three climbers in one category.");
  }

  const [athleteA, athleteB, athleteC] = trio;

  const { error: deleteDramaAttemptsError } = await supabase
    .from("qualifier_attempts")
    .delete()
    .eq("competition_id", competition.id)
    .in(
      "climber_id",
      [athleteA.id, athleteB.id, athleteC.id]
    );

  if (deleteDramaAttemptsError) {
    throw new Error(deleteDramaAttemptsError.message);
  }

  const seededDramaAttempts = [
    [athleteA.id, 1, 1, true, true, 1, 1],
    [athleteA.id, 2, 1, true, true, 1, 1],
    [athleteA.id, 3, 1, true, true, 1, 1],
    [athleteA.id, 4, 2, true, false, null, 2],
    [athleteB.id, 1, 1, true, true, 1, 1],
    [athleteB.id, 2, 2, true, true, 2, 1],
    [athleteB.id, 3, 2, true, true, 2, 1],
    [athleteB.id, 4, 1, true, false, null, 1],
    [athleteC.id, 1, 1, true, true, 1, 1],
    [athleteC.id, 2, 2, true, true, 2, 1],
    [athleteC.id, 3, 3, true, true, 3, 2],
    [athleteC.id, 4, 1, true, false, null, 1],
  ].map(
    ([
      climberId,
      climbNumber,
      attemptCount,
      zone,
      topped,
      attemptsToTop,
      attemptsToZone,
    ]) => ({
      competition_id: competition.id,
      round_id: qualifierRound.id,
      climber_id: climberId,
      climb_number: climbNumber,
      attempt_count: attemptCount,
      zone,
      topped,
      attempts_to_top: attemptsToTop,
      attempts_to_zone: attemptsToZone,
      entered_by: "staff" as const,
    })
  );

  const { error: insertDramaAttemptsError } = await supabase
    .from("qualifier_attempts")
    .insert(seededDramaAttempts);

  if (insertDramaAttemptsError) {
    throw new Error(insertDramaAttemptsError.message);
  }

  const dramaMetadata: Exclude<DramaMetadata, null> = {
    drama_pair: [athleteB.id, athleteC.id],
    drama_target_climber: athleteC.id,
    drama_target_climb_number: 3,
    drama_target_attempts_before: 3,
    drama_target_attempts_after: 1,
    drama_description: `${athleteC.name} tops Boulder 3 in 1 attempt instead of 3 and jumps past ${athleteB.name} at the finals cut line on attempts.`,
  };

  const { error: updateCompetitionError } = await supabase
    .from("competitions")
    .update({ demo_metadata: dramaMetadata })
    .eq("id", competition.id);

  if (updateCompetitionError) {
    throw new Error(updateCompetitionError.message);
  }

  return dramaMetadata;
}

async function handleDramaTick(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: DemoCompetitionRecord
) {
  const metadata = competition.demo_metadata;

  if (!metadata?.drama_target_climber || !metadata.drama_target_climb_number) {
    return NextResponse.json(
      { error: "No drama scenario is seeded for this competition yet." },
      { status: 409 }
    );
  }

  const targetClimberId = metadata.drama_target_climber;
  const targetClimbNumber = metadata.drama_target_climb_number;
  const attemptsAfter = metadata.drama_target_attempts_after ?? 1;
  const dramaPair = metadata.drama_pair ?? [];
  const climberBId = dramaPair.find((id) => id !== targetClimberId) ?? null;

  const { data: climbers, error: climbersError } = await supabase
    .from("climbers")
    .select("id, name")
    .in("id", climberBId ? [targetClimberId, climberBId] : [targetClimberId])
    .eq("competition_id", competition.id);

  if (climbersError) {
    throw new Error(climbersError.message);
  }

  const climberC = climbers?.find((climber) => climber.id === targetClimberId) ?? null;
  const climberB = climberBId ? climbers?.find((climber) => climber.id === climberBId) ?? null : null;

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
    return NextResponse.json({ error: "No active qualifier round found." }, { status: 409 });
  }

  const { data: currentAttempt, error: currentAttemptError } = await supabase
    .from("qualifier_attempts")
    .select("attempt_count, attempts_to_top, attempts_to_zone")
    .eq("competition_id", competition.id)
    .eq("climber_id", targetClimberId)
    .eq("round_id", round.id)
    .eq("climb_number", targetClimbNumber)
    .maybeSingle();

  if (currentAttemptError) {
    throw new Error(currentAttemptError.message);
  }

  const attemptsBefore = currentAttempt?.attempt_count ?? metadata.drama_target_attempts_before ?? 3;
  if (attemptsBefore <= attemptsAfter) {
    return NextResponse.json({
      mode: "drama_tick",
      alreadyFired: true,
      message: "The cut-line swap already fired. Reset the drama scenario to replay it cleanly.",
      dramaContext: null,
    });
  }

  const normalized = normalizeQualifierAttemptInput({
    attemptCount: attemptsAfter,
    topped: true,
    zone: true,
    attemptsToTop: attemptsAfter,
    attemptsToZone: attemptsAfter,
  });

  const { data, error: upsertError } = await supabase.rpc("append_qualifier_score_event", {
    p_competition_id: competition.id,
    p_round_id: round.id,
    p_climber_id: targetClimberId,
    p_climb_number: targetClimbNumber,
    p_attempt_count: normalized.attemptCount,
    p_topped: normalized.topped,
    p_zone: normalized.zone,
    p_attempts_to_top: normalized.attemptsToTop,
    p_attempts_to_zone: normalized.attemptsToZone,
    p_entered_by: "staff",
    p_client_event_id: `drama-tick-${crypto.randomUUID()}`,
    p_scored_at: new Date().toISOString(),
    p_judge_device_id: "drama-simulator",
    p_judge_session_id: "drama_tick",
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

  const dramaContext: DramaContext = {
    athleteName: climberC?.name ?? "Athlete C",
    climberBName: climberB?.name ?? "Athlete B",
    climbLabel: `Boulder ${String(targetClimbNumber).padStart(2, "0")}`,
    beforeRank: null,
    afterRank: null,
    tiebreakExplanation:
      `${climberC?.name ?? "Athlete C"} now tops Boulder ${targetClimbNumber} in ${attemptsAfter} attempt instead of ${attemptsBefore}. ` +
      `That drops their counting attempts and pushes them ahead of ${climberB?.name ?? "Athlete B"} at the finals cut line.`,
    isRankSwap: true,
  };

  return NextResponse.json({
    mode: "drama_tick",
    attempt,
    climberId: targetClimberId,
    climbNumber: targetClimbNumber,
    dramaContext,
  });
}

async function handleDramaReset(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: DemoCompetitionRecord
) {
  const metadata = competition.demo_metadata;

  if (!metadata?.drama_target_climber || !metadata.drama_target_climb_number) {
    return NextResponse.json(
      { error: "No drama scenario is seeded for this competition." },
      { status: 409 }
    );
  }

  const { data: round, error: roundError } = await supabase
    .from("competition_rounds")
    .select("id")
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
    return NextResponse.json({ error: "No active qualifier round found." }, { status: 409 });
  }

  const attemptsBefore = metadata.drama_target_attempts_before ?? 3;
  const normalized = normalizeQualifierAttemptInput({
    attemptCount: attemptsBefore,
    topped: true,
    zone: true,
    attemptsToTop: attemptsBefore,
    attemptsToZone: Math.max(1, attemptsBefore - 1),
  });

  const { error: upsertError } = await supabase.rpc("append_qualifier_score_event", {
    p_competition_id: competition.id,
    p_round_id: round.id,
    p_climber_id: metadata.drama_target_climber,
    p_climb_number: metadata.drama_target_climb_number,
    p_attempt_count: normalized.attemptCount,
    p_topped: normalized.topped,
    p_zone: normalized.zone,
    p_attempts_to_top: normalized.attemptsToTop,
    p_attempts_to_zone: normalized.attemptsToZone,
    p_entered_by: "staff",
    p_client_event_id: `drama-reset-${crypto.randomUUID()}`,
    p_scored_at: new Date().toISOString(),
    p_judge_device_id: "drama-simulator",
    p_judge_session_id: "drama_reset",
    p_replayed_from_offline: false,
  });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return NextResponse.json({ mode: "drama_reset", ok: true });
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
  const qualifierBlockRows = (qualifierBlocks ?? []) as DemoScheduleBlockRecord[];
  const baseClimberTarget = Math.max(competition.max_climbers ?? 80, categoryRows.length * 18);
  const climberTarget = Math.min(240, baseClimberTarget + categoryRows.length * 6);
  const climbersPerCategory = Math.max(14, Math.floor(climberTarget / categoryRows.length));

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

  const climberRows: DemoClimberInsertRow[] = categoryRows.flatMap((category, categoryIndex) =>
    Array.from({ length: climbersPerCategory }, (_, categoryClimberIndex) => {
      const globalIndex = categoryIndex * climbersPerCategory + categoryClimberIndex;
      const poolIndex =
        (categoryIndex * 29 + categoryClimberIndex * 7 + Math.floor(seededUnit(`${competition.id}:${category.id}`) * 11)) %
        MOCK_ATHLETE_CURATED_FULL_NAMES.length;
      const fullName = MOCK_ATHLETE_CURATED_FULL_NAMES[poolIndex] ?? `Demo Climber ${globalIndex + 1}`;
      const displayCategory = buildDisplayCategory(category.gender_division, category.age_group);
      const climberId = crypto.randomUUID();

      return {
        id: climberId,
        competition_id: competition.id,
        name: fullName,
        climber_number: String(101 + globalIndex),
        province: PROVINCES[(globalIndex + categoryIndex) % PROVINCES.length],
        category_id: category.id,
        gender_division: category.gender_division,
        age_group: category.age_group,
        display_category: displayCategory,
        time_slot_id: slotByCategory.get(category.id) ?? null,
        access_token: createAccessToken(`${competition.slug}-${fullName}-${globalIndex}`),
      };
    })
  );

  const { error: climberInsertError } = await supabase.from("climbers").insert(climberRows);
  if (climberInsertError) {
    throw new Error(climberInsertError.message);
  }

  const seededAttempts = climberRows.flatMap((climber, climberIndex) => {
    const category = categoryRows.find((row) => row.id === climber.category_id);
    if (!category) {
      return [];
    }

    const categoryIndex = categoryRows.findIndex((row) => row.id === category.id);
    const fieldRank = climberIndex % climbersPerCategory;
    const climberSeed = `${competition.id}:${category.id}:${climber.id}:${fieldRank}`;

    return Array.from({ length: problemCount }, (_, attemptIndex) => {
      const climbNumber = attemptIndex + 1;
      const skipProbability =
        climbNumber >= Math.max(3, problemCount - 1) && fieldRank > Math.floor(climbersPerCategory * 0.75)
          ? 0.24
          : climbNumber >= Math.max(4, problemCount)
            ? 0.08
            : 0;

      if (skipProbability > 0 && seededUnit(`${climberSeed}:skip:${climbNumber}`) < skipProbability) {
        return null;
      }

      const template = buildRealisticAttempt(
        competition.id,
        category,
        categoryIndex,
        climberSeed,
        fieldRank,
        climbersPerCategory,
        climbNumber,
        problemCount
      );

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
    }).filter(Boolean);
  });

  if (seededAttempts.length) {
    const { error: attemptsInsertError } = await supabase.from("qualifier_attempts").insert(seededAttempts);
    if (attemptsInsertError) {
      throw new Error(attemptsInsertError.message);
    }
  }

  const dramaMetadata = await seedDramaScenario(
    supabase,
    competition,
    qualifierRound as DemoRoundRecord,
    categoryRows,
    climberRows,
    problemCount
  );

  return {
    competitionId: competition.id,
    climberCount: climberRows.length,
    qualifierAttemptCount: seededAttempts.length,
    roundId: qualifierRound.id,
    dramaMetadata,
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
    payload.mode === "live_burst" ||
    payload.mode === "hydrate_event" ||
    payload.mode === "drama_tick" ||
    payload.mode === "drama_reset"
      ? payload.mode
      : "single_score";

  try {
    const supabase = createServiceRoleSupabaseClient();
    const { competition, error } = await requireCompetition(payload.competitionId, supabase);
    if (error || !competition) {
      return error;
    }

    if (mode === "drama_tick") {
      return await handleDramaTick(supabase, competition);
    }

    if (mode === "drama_reset") {
      return await handleDramaReset(supabase, competition);
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
