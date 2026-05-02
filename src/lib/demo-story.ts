import { normalizeQualifierAttemptInput } from "./attempts";
import { getGuidedDemoPreset, GUIDED_DEMO_PRESET_ID } from "./competition-presets";
import { DEMO_COMPETITION_NAME, DEMO_COMPETITION_SLUG, isCanonicalDemoCompetitionSlug } from "./demo";
import { resetDemoCompetition } from "./demo-reset";
import {
  buildDemoStoryMetadataForClimbers,
  findDemoStoryClimberFromMetadata,
  type DemoStoryClimberIdentity,
  type DemoStoryTargetMetadata,
} from "./demo-story-target";
import { handleAdminCompetitionAction } from "./server-admin-competition-actions";
import { createServiceRoleSupabaseClient } from "./server-supabase";
import type { GuidedDemoEventSetupInput } from "./guided-demo-setup";

export type DemoStoryTargetAct =
  | "event_created"
  | "score_corrected"
  | "finalists_started"
  | "public_ready";

export type DemoStoryProgress = {
  eventCreated: boolean;
  finalsSetupReady: boolean;
  keyScoreCorrected: boolean;
  finalistsAdvanced: boolean;
  finalsStarted: boolean;
  publicViewed: boolean;
};

export type DemoStoryMetadata = DemoStoryTargetMetadata & {
  story_step?: DemoStoryTargetAct | string;
  key_score_corrected_at?: string;
  finalists_started_at?: string;
  public_ready_at?: string;
};

export type DemoStoryCompetitionSummary = {
  id: string;
  slug: string;
  name: string;
  is_demo: boolean;
  has_finals: boolean;
  finals_cutoff: number | null;
  finals_tie_advances: boolean | null;
  finals_problem_count: number | null;
  finals_eligible_age_groups: string[];
  current_phase: string;
  qualifier_locked_at: string | null;
  finals_started_at: string | null;
  demo_metadata: DemoStoryMetadata | null;
};

type DemoStoryAttemptSummary = {
  attempt_count: number;
  topped: boolean;
  zone: boolean;
  attempts_to_top: number | null;
  attempts_to_zone: number | null;
};

type DemoQualifierRoundSummary = {
  id: string;
  problem_count: number | null;
};

type DemoRoundSummary = {
  id: string;
  round_type: string | null;
  scoring_bucket: string | null;
  problem_count: number | null;
};

type DemoScheduleBlockSummary = {
  label: string;
  phase_type: string;
};

export type DemoStoryProgressSnapshot = {
  competition: DemoStoryCompetitionSummary | null;
  targetAttempt?: DemoStoryAttemptSummary | null;
  finalistCount?: number | null;
  finalsSetupReady?: boolean;
  publicViewed?: boolean;
  targetClimberBelongsToCompetition?: boolean;
};

export type DemoStoryState = {
  available: boolean;
  error: string | null;
  competition: DemoStoryCompetitionSummary | null;
  metadata: DemoStoryMetadata | null;
  targetAttempt: DemoStoryAttemptSummary | null;
  finalistCount: number;
  progress: DemoStoryProgress;
  links: {
    setup: string;
    judge: string | null;
    organizer: string | null;
    publicEvent: string | null;
    leaderboard: string | null;
    scorecard: string | null;
  };
};

const FINAL_PHASES = new Set(["finals_open", "finals_closed", "results"]);
const EVENT_CREATED_STORY_STEPS = new Set(["event_created", "score_corrected", "finalists_started", "public_ready"]);
const REQUIRED_FINALS_SCHEDULE_PHASES = new Set(["isolation", "observation", "finals_round"]);
const ACT_ORDER: DemoStoryTargetAct[] = [
  "event_created",
  "score_corrected",
  "finalists_started",
  "public_ready",
];

function stringSetsEqual(left: readonly string[], right: readonly string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && Array.from(leftSet).every((entry) => rightSet.has(entry));
}

export function deriveDemoFinalsSetupReady(snapshot: {
  competition: DemoStoryCompetitionSummary | null;
  rounds?: readonly DemoRoundSummary[] | null;
  scheduleBlocks?: readonly DemoScheduleBlockSummary[] | null;
}) {
  const competition = snapshot.competition;
  const preset = getGuidedDemoPreset();
  const rounds = snapshot.rounds ?? [];
  const scheduleBlocks = snapshot.scheduleBlocks ?? [];
  const hasQualifierRound = rounds.some(
    (round) => round.scoring_bucket === "qualifier" || round.round_type === "qualifier"
  );
  const hasFinalsRound = rounds.some(
    (round) =>
      (round.scoring_bucket === "finals" || round.round_type === "finals") &&
      (!round.problem_count || round.problem_count >= preset.finalsProblemCount)
  );
  const schedulePhases = new Set(scheduleBlocks.map((block) => block.phase_type));
  const hasFinalsSchedule = Array.from(REQUIRED_FINALS_SCHEDULE_PHASES).every((phase) =>
    schedulePhases.has(phase)
  );
  const hasAwards = scheduleBlocks.some((block) => block.label.toLowerCase().includes("awards"));

  return Boolean(
    competition &&
      isCanonicalDemoMutableCompetition(competition) &&
      competition.has_finals === true &&
      competition.demo_metadata?.preset_id === GUIDED_DEMO_PRESET_ID &&
      competition.finals_cutoff === preset.finalsCutoff &&
      competition.finals_tie_advances === preset.tiesAdvanceDefault &&
      competition.finals_problem_count === preset.finalsProblemCount &&
      stringSetsEqual(competition.finals_eligible_age_groups ?? [], preset.finalsEligibleCategories) &&
      hasQualifierRound &&
      hasFinalsRound &&
      hasFinalsSchedule &&
      hasAwards
  );
}

export function isCanonicalDemoMutableCompetition(
  competition: Pick<DemoStoryCompetitionSummary, "slug" | "is_demo"> | null | undefined
) {
  return Boolean(competition?.is_demo && isCanonicalDemoCompetitionSlug(competition.slug));
}

export function mergeDemoStoryMetadata(
  existing: DemoStoryMetadata | null | undefined,
  updates: DemoStoryMetadata
): DemoStoryMetadata {
  return {
    ...(existing ?? {}),
    ...updates,
  };
}

export function deriveDemoStoryProgress(snapshot: DemoStoryProgressSnapshot): DemoStoryProgress {
  const metadata = snapshot.competition?.demo_metadata ?? null;
  const expectedAttempts = metadata?.target_attempts_after ?? metadata?.drama_target_attempts_after ?? 1;
  const attempt = snapshot.targetAttempt ?? null;
  const completedTopAttempt = attempt?.attempts_to_top ?? attempt?.attempt_count ?? null;
  const completedZoneAttempt = attempt?.attempts_to_zone ?? attempt?.attempt_count ?? null;
  const targetBelongs = snapshot.targetClimberBelongsToCompetition !== false;
  const storyStep = typeof metadata?.story_step === "string" ? metadata.story_step : "";
  const finalsSetupReady = snapshot.finalsSetupReady === true;
  const eventCreated =
    isCanonicalDemoMutableCompetition(snapshot.competition) &&
    Boolean(metadata?.scenario_version) &&
    targetBelongs &&
    EVENT_CREATED_STORY_STEPS.has(storyStep);
  const keyScoreCorrected =
    eventCreated &&
    Boolean(attempt?.topped) &&
    (Boolean(attempt?.zone) || Boolean(attempt?.topped)) &&
    completedTopAttempt === expectedAttempts &&
    (completedZoneAttempt === null || completedZoneAttempt === expectedAttempts || completedZoneAttempt === 1);
  const finalistsAdvanced = eventCreated && finalsSetupReady && (snapshot.finalistCount ?? 0) > 0;
  const finalsStarted =
    eventCreated &&
    finalsSetupReady &&
    (Boolean(snapshot.competition?.finals_started_at) ||
      FINAL_PHASES.has(snapshot.competition?.current_phase ?? ""));

  return {
    eventCreated,
    finalsSetupReady,
    keyScoreCorrected,
    finalistsAdvanced,
    finalsStarted,
    publicViewed: Boolean(snapshot.publicViewed),
  };
}

function emptyDemoStoryState(error: string | null = null): DemoStoryState {
  return {
    available: false,
    error,
    competition: null,
    metadata: null,
    targetAttempt: null,
    finalistCount: 0,
    progress: {
      eventCreated: false,
      finalsSetupReady: false,
      keyScoreCorrected: false,
      finalistsAdvanced: false,
      finalsStarted: false,
      publicViewed: false,
    },
    links: {
      setup: "/staff/demo?demoStory=act1",
      judge: null,
      organizer: null,
      publicEvent: null,
      leaderboard: null,
      scorecard: null,
    },
  };
}

function getActIndex(targetAct: DemoStoryTargetAct) {
  return ACT_ORDER.indexOf(targetAct);
}

async function loadCanonicalDemoCompetition(supabase: ReturnType<typeof createServiceRoleSupabaseClient>) {
  const { data, error } = await supabase
    .from("competitions")
    .select(
      "id, slug, name, is_demo, has_finals, finals_cutoff, finals_tie_advances, finals_problem_count, finals_eligible_age_groups, current_phase, qualifier_locked_at, finals_started_at, demo_metadata"
    )
    .eq("slug", DEMO_COMPETITION_SLUG)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const competition = data as DemoStoryCompetitionSummary;
  if (!isCanonicalDemoMutableCompetition(competition)) {
    throw new Error("The canonical demo slug belongs to a real competition. Refusing to prepare demo state.");
  }

  return competition;
}

async function loadDemoTargetAttempt(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: DemoStoryCompetitionSummary | null
) {
  const metadata = competition?.demo_metadata ?? null;
  if (!competition?.id || !metadata?.drama_target_climber || !metadata.drama_target_climb_number) {
    return null;
  }

  const { data, error } = await supabase
    .from("qualifier_attempts")
    .select("attempt_count, topped, zone, attempts_to_top, attempts_to_zone")
    .eq("competition_id", competition.id)
    .eq("climber_id", metadata.drama_target_climber)
    .eq("climb_number", metadata.drama_target_climb_number)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as DemoStoryAttemptSummary | null;
}

async function loadDemoQualifierRoundSummary(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: DemoStoryCompetitionSummary | null
) {
  if (!competition?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from("competition_rounds")
    .select("id, problem_count")
    .eq("competition_id", competition.id)
    .or("scoring_bucket.eq.qualifier,round_type.eq.qualifier")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as DemoQualifierRoundSummary | null;
}

async function loadDemoRoundSummaries(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: DemoStoryCompetitionSummary | null
) {
  if (!competition?.id) {
    return [] as DemoRoundSummary[];
  }

  const { data, error } = await supabase
    .from("competition_rounds")
    .select("id, round_type, scoring_bucket, problem_count")
    .eq("competition_id", competition.id);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DemoRoundSummary[];
}

async function loadDemoScheduleBlockSummaries(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: DemoStoryCompetitionSummary | null
) {
  if (!competition?.id) {
    return [] as DemoScheduleBlockSummary[];
  }

  const { data, error } = await supabase
    .from("competition_schedule_blocks")
    .select("label, phase_type")
    .eq("competition_id", competition.id);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DemoScheduleBlockSummary[];
}

async function loadDemoStoryClimbers(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string
) {
  const { data, error } = await supabase
    .from("climbers")
    .select("id, competition_id, name, climber_number, gender_division, age_group, display_category")
    .eq("competition_id", competitionId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DemoStoryClimberIdentity[];
}

async function repairDemoStoryMetadata(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: DemoStoryCompetitionSummary,
  options: { resetIfUnrepairable?: boolean } = {}
) {
  const metadata = competition.demo_metadata ?? null;
  const climbers = await loadDemoStoryClimbers(supabase, competition.id);
  const targetClimber = findDemoStoryClimberFromMetadata(climbers, metadata, "target");
  const affectedClimber = findDemoStoryClimberFromMetadata(climbers, metadata, "affected");

  if (!targetClimber || !affectedClimber) {
    if (options.resetIfUnrepairable) {
      await resetDemoCompetition();
      const resetCompetition = await loadCanonicalDemoCompetition(supabase);
      if (!resetCompetition) {
        throw new Error("Unable to repair the demo state.");
      }
      return repairDemoStoryMetadata(supabase, resetCompetition, { resetIfUnrepairable: false });
    }

    return {
      competition,
      targetClimber: null,
      repaired: false,
    };
  }

  const nextMetadata = buildDemoStoryMetadataForClimbers({
    baseMetadata: {
      scenario_version: "demo-story-v1",
      story_step: metadata?.story_step ?? "reset",
      finals_ineligible_age_groups: ["Youth D", "Youth C"],
      ...(metadata ?? {}),
    },
    targetClimber,
    affectedClimber,
  });
  const alreadyFresh =
    metadata?.drama_target_climber === targetClimber.id &&
    metadata?.target_climber_id === targetClimber.id &&
    metadata?.drama_affected_climber === affectedClimber.id &&
    metadata?.affected_climber_id === affectedClimber.id;

  if (!alreadyFresh) {
    const update = await supabase
      .from("competitions")
      .update({ demo_metadata: nextMetadata })
      .eq("id", competition.id)
      .eq("is_demo", true);

    if (update.error) {
      throw new Error(update.error.message);
    }
  }

  return {
    competition: {
      ...competition,
      demo_metadata: nextMetadata,
    },
    targetClimber,
    repaired: !alreadyFresh,
  };
}

async function loadDemoFinalistCount(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: DemoStoryCompetitionSummary | null
) {
  if (!competition?.id) {
    return 0;
  }

  const { count, error } = await supabase
    .from("competition_finalists")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", competition.id);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function loadDemoScorecardLink(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competition: DemoStoryCompetitionSummary | null
) {
  const metadata = competition?.demo_metadata ?? null;
  if (!competition?.id || !metadata?.drama_target_climber) {
    return null;
  }

  const { data, error } = await supabase
    .from("climbers")
    .select("access_token")
    .eq("competition_id", competition.id)
    .eq("id", metadata.drama_target_climber)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const token = typeof data?.access_token === "string" ? data.access_token : null;
  return token ? `/c/${competition.slug}/scorecard?token=${encodeURIComponent(token)}&demoStory=public` : null;
}

export async function getDemoStoryState(publicViewed = false): Promise<DemoStoryState> {
  let supabase: ReturnType<typeof createServiceRoleSupabaseClient>;

  try {
    supabase = createServiceRoleSupabaseClient();
  } catch (error) {
    return emptyDemoStoryState(error instanceof Error ? error.message : "Demo services are not configured.");
  }

  try {
    const loadedCompetition = await loadCanonicalDemoCompetition(supabase);
    if (!loadedCompetition) {
      return emptyDemoStoryState(null);
    }

    const repairResult = await repairDemoStoryMetadata(supabase, loadedCompetition);
    if (!repairResult.targetClimber) {
      return {
        ...emptyDemoStoryState("Demo target climber is missing. Repair the demo state to regenerate canonical demo metadata."),
        available: true,
        competition: loadedCompetition,
        metadata: loadedCompetition.demo_metadata,
        links: {
          setup: "/staff/demo?demoStory=act1",
          judge: null,
          organizer: `/staff/c/${loadedCompetition.slug}?demoStory=act3`,
          publicEvent: `/c/${loadedCompetition.slug}?demoStory=public`,
          leaderboard: `/c/${loadedCompetition.slug}/leaderboard?demoStory=public`,
          scorecard: null,
        },
      };
    }

    const competition = repairResult.competition;
    const [targetAttempt, finalistCount, scorecard, qualifierRound, rounds, scheduleBlocks] = await Promise.all([
      loadDemoTargetAttempt(supabase, competition),
      loadDemoFinalistCount(supabase, competition),
      loadDemoScorecardLink(supabase, competition),
      loadDemoQualifierRoundSummary(supabase, competition),
      loadDemoRoundSummaries(supabase, competition),
      loadDemoScheduleBlockSummaries(supabase, competition),
    ]);
    const targetClimberBelongsToCompetition =
      repairResult.targetClimber.competition_id === undefined ||
      repairResult.targetClimber.competition_id === competition.id;
    const finalsSetupReady = deriveDemoFinalsSetupReady({
      competition,
      rounds,
      scheduleBlocks,
    });
    const progress = deriveDemoStoryProgress({
      competition,
      targetAttempt,
      finalistCount,
      finalsSetupReady,
      publicViewed,
      targetClimberBelongsToCompetition,
    });
    const judgeParams = new URLSearchParams({ demoStory: "act2" });
    if (competition.demo_metadata?.drama_target_climber) {
      judgeParams.set("climberId", competition.demo_metadata.drama_target_climber);
    }
    if (competition.demo_metadata?.drama_target_climb_number) {
      judgeParams.set("boulder", String(competition.demo_metadata.drama_target_climb_number));
    }
    const targetClimbNumber = competition.demo_metadata?.drama_target_climb_number ?? null;
    const targetProblemExists =
      typeof targetClimbNumber === "number" &&
      targetClimbNumber > 0 &&
      (!qualifierRound?.problem_count || targetClimbNumber <= qualifierRound.problem_count);
    const judgeRouteReady =
      targetClimberBelongsToCompetition && Boolean(qualifierRound?.id) && targetProblemExists;
    const readinessError = judgeRouteReady
      ? null
      : "Demo judge route prerequisites are missing. Repair the demo state to restore the target athlete and qualifier round.";
    const storyError =
      readinessError ??
      (finalsSetupReady
        ? null
        : "Demo finals setup is missing. Reset demo and restart Act 1 to restore the Youth Championship with Finals preset.");

    return {
      available: true,
      error: storyError,
      competition,
      metadata: competition.demo_metadata,
      targetAttempt,
      finalistCount,
      progress,
      links: {
        setup: "/staff/demo?demoStory=act1",
        judge: judgeRouteReady ? `/staff/c/${competition.slug}/judge?${judgeParams.toString()}` : null,
        organizer: `/staff/c/${competition.slug}?demoStory=act3`,
        publicEvent: `/c/${competition.slug}?demoStory=public`,
        leaderboard: `/c/${competition.slug}/leaderboard?demoStory=public`,
        scorecard,
      },
    };
  } catch (error) {
    return emptyDemoStoryState(error instanceof Error ? error.message : "Unable to load the demo story state.");
  }
}

async function ensureDemoCompetition(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  options: { reset?: boolean; setup?: GuidedDemoEventSetupInput }
) {
  let competition = await loadCanonicalDemoCompetition(supabase);

  if (options.reset || !competition) {
    await resetDemoCompetition({ setup: options.setup });
    competition = await loadCanonicalDemoCompetition(supabase);
  }

  if (!competition) {
    throw new Error("Unable to create the canonical demo competition.");
  }

  return competition;
}

async function ensureStoryMetadata(supabase: ReturnType<typeof createServiceRoleSupabaseClient>) {
  let competition = await loadCanonicalDemoCompetition(supabase);
  const metadata = competition?.demo_metadata ?? null;

  if (
    !competition ||
    !metadata?.scenario_version ||
    !metadata.drama_target_climber ||
    !metadata.drama_target_climb_number
  ) {
    await resetDemoCompetition();
    competition = await loadCanonicalDemoCompetition(supabase);
  }

  if (!competition?.demo_metadata?.drama_target_climber || !competition.demo_metadata.drama_target_climb_number) {
    throw new Error("Unable to prepare the demo story metadata.");
  }

  const repairResult = await repairDemoStoryMetadata(supabase, competition, { resetIfUnrepairable: true });
  if (!repairResult.targetClimber) {
    throw new Error("Unable to repair the demo target climber.");
  }

  return repairResult.competition;
}

async function markDemoEventCreated(supabase: ReturnType<typeof createServiceRoleSupabaseClient>) {
  const competition = await ensureStoryMetadata(supabase);
  const nextMetadata = mergeDemoStoryMetadata(competition.demo_metadata, {
    story_step: "event_created",
  });
  const update = await supabase
    .from("competitions")
    .update({ demo_metadata: nextMetadata })
    .eq("id", competition.id)
    .eq("is_demo", true);

  if (update.error) {
    throw new Error(update.error.message);
  }
}

async function applyDemoKeyScoreCorrection(supabase: ReturnType<typeof createServiceRoleSupabaseClient>) {
  const competition = await ensureStoryMetadata(supabase);
  const metadata = competition.demo_metadata!;
  const targetClimberId = metadata.drama_target_climber!;
  const targetClimbNumber = metadata.drama_target_climb_number!;
  const attemptsAfter = metadata.drama_target_attempts_after ?? 1;
  const normalized = normalizeQualifierAttemptInput({
    attemptCount: attemptsAfter,
    topped: true,
    zone: true,
    attemptsToTop: attemptsAfter,
    attemptsToZone: 1,
  });

  const { data: round, error: roundError } = await supabase
    .from("competition_rounds")
    .select("id")
    .eq("competition_id", competition.id)
    .eq("scoring_bucket", "qualifier")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (roundError) {
    throw new Error(roundError.message);
  }

  if (!round?.id) {
    throw new Error("No qualifier round is available for the demo story.");
  }

  const { error } = await supabase.rpc("append_qualifier_score_event", {
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
    p_client_event_id: `demo-story-key-score-${competition.id}-${targetClimberId}-${targetClimbNumber}`,
    p_scored_at: new Date().toISOString(),
    p_judge_device_id: "demo-command-center",
    p_judge_session_id: "guided-story",
    p_replayed_from_offline: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  const nextMetadata = mergeDemoStoryMetadata(metadata, {
    story_step: "score_corrected",
    key_score_corrected_at: new Date().toISOString(),
  });
  const update = await supabase
    .from("competitions")
    .update({ demo_metadata: nextMetadata })
    .eq("id", competition.id)
    .eq("is_demo", true);

  if (update.error) {
    throw new Error(update.error.message);
  }
}

async function ensureFinalistsStarted(supabase: ReturnType<typeof createServiceRoleSupabaseClient>) {
  const competition = await ensureStoryMetadata(supabase);
  const existingFinalistCount = await loadDemoFinalistCount(supabase, competition);
  const alreadyStarted =
    existingFinalistCount > 0 &&
    (Boolean(competition.finals_started_at) || FINAL_PHASES.has(competition.current_phase));

  if (!alreadyStarted) {
    await handleAdminCompetitionAction({
      action: "set_phase",
      competitionId: competition.id,
      nextPhase: "qualifier_closed",
      note: "Demo story: organizer reviewed the corrected cut line.",
    });
    await handleAdminCompetitionAction({
      action: "advance_to_finals",
      competitionId: competition.id,
    });
    await handleAdminCompetitionAction({
      action: "set_phase",
      competitionId: competition.id,
      nextPhase: "finals_open",
      note: "Demo story: finals are open for the public demo.",
    });
  }

  const latest = await loadCanonicalDemoCompetition(supabase);
  if (!latest) {
    throw new Error("Unable to reload the demo competition after starting finals.");
  }

  const nextMetadata = mergeDemoStoryMetadata(latest.demo_metadata, {
    story_step: "finalists_started",
    finalists_started_at: new Date().toISOString(),
  });
  const update = await supabase
    .from("competitions")
    .update({ demo_metadata: nextMetadata })
    .eq("id", latest.id)
    .eq("is_demo", true);

  if (update.error) {
    throw new Error(update.error.message);
  }
}

export async function prepareDemoStoryState(
  targetAct: DemoStoryTargetAct,
  options: { reset?: boolean; resetOnly?: boolean; setup?: GuidedDemoEventSetupInput } = {}
): Promise<DemoStoryState> {
  if (!ACT_ORDER.includes(targetAct)) {
    throw new Error("Invalid demo story target.");
  }

  const supabase = createServiceRoleSupabaseClient();
  await ensureDemoCompetition(supabase, options);

  if (options.resetOnly) {
    return getDemoStoryState();
  }

  await markDemoEventCreated(supabase);

  if (getActIndex(targetAct) >= getActIndex("score_corrected")) {
    await applyDemoKeyScoreCorrection(supabase);
  }

  if (getActIndex(targetAct) >= getActIndex("finalists_started")) {
    await ensureFinalistsStarted(supabase);
  }

  if (targetAct === "public_ready") {
    const competition = await loadCanonicalDemoCompetition(supabase);
    if (!competition) {
      throw new Error("Unable to load the demo competition.");
    }

    const nextMetadata = mergeDemoStoryMetadata(competition.demo_metadata, {
      story_step: "public_ready",
      public_ready_at: new Date().toISOString(),
    });
    const update = await supabase
      .from("competitions")
      .update({ demo_metadata: nextMetadata })
      .eq("id", competition.id)
      .eq("is_demo", true);

    if (update.error) {
      throw new Error(update.error.message);
    }
  }

  return getDemoStoryState();
}

export const DEMO_STORY_COPY = {
  title: "Summit Series Demo",
  subtitle: "Run a complete climbing competition story from setup to scoring to live results.",
  fallbackCompetitionName: DEMO_COMPETITION_NAME,
} as const;
