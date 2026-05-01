import { normalizeQualifierAttemptInput } from "./attempts";
import { DEMO_COMPETITION_NAME, DEMO_COMPETITION_SLUG, isCanonicalDemoCompetitionSlug } from "./demo";
import { resetDemoCompetition } from "./demo-reset";
import { handleAdminCompetitionAction } from "./server-admin-competition-actions";
import { createServiceRoleSupabaseClient } from "./server-supabase";

export type DemoStoryTargetAct =
  | "event_created"
  | "score_corrected"
  | "finalists_started"
  | "public_ready";

export type DemoStoryProgress = {
  eventCreated: boolean;
  keyScoreCorrected: boolean;
  finalistsAdvanced: boolean;
  finalsStarted: boolean;
  publicViewed: boolean;
};

export type DemoStoryMetadata = {
  scenario_version?: string;
  preset_id?: string;
  preset_name?: string;
  story_step?: DemoStoryTargetAct | string;
  finals_ineligible_age_groups?: string[];
  drama_pair?: string[];
  drama_target_climber?: string;
  drama_target_climber_name?: string;
  drama_target_climber_number?: string;
  drama_target_climb_number?: number;
  drama_target_attempts_before?: number;
  drama_target_attempts_after?: number;
  drama_description?: string;
  drama_affected_climber?: string;
  drama_affected_climber_name?: string;
  key_score_corrected_at?: string;
  finalists_started_at?: string;
  public_ready_at?: string;
  [key: string]: unknown;
};

export type DemoStoryCompetitionSummary = {
  id: string;
  slug: string;
  name: string;
  is_demo: boolean;
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

export type DemoStoryProgressSnapshot = {
  competition: DemoStoryCompetitionSummary | null;
  targetAttempt?: DemoStoryAttemptSummary | null;
  finalistCount?: number | null;
  publicViewed?: boolean;
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
const ACT_ORDER: DemoStoryTargetAct[] = [
  "event_created",
  "score_corrected",
  "finalists_started",
  "public_ready",
];

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
  const expectedAttempts = metadata?.drama_target_attempts_after ?? 1;
  const attempt = snapshot.targetAttempt ?? null;
  const completedTopAttempt = attempt?.attempts_to_top ?? attempt?.attempt_count ?? null;
  const eventCreated = isCanonicalDemoMutableCompetition(snapshot.competition) && Boolean(metadata?.scenario_version);
  const keyScoreCorrected =
    eventCreated &&
    Boolean(attempt?.topped) &&
    Boolean(attempt?.zone) &&
    completedTopAttempt === expectedAttempts;
  const finalistsAdvanced = eventCreated && (snapshot.finalistCount ?? 0) > 0;
  const finalsStarted =
    eventCreated &&
    (Boolean(snapshot.competition?.finals_started_at) ||
      FINAL_PHASES.has(snapshot.competition?.current_phase ?? ""));

  return {
    eventCreated,
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
      keyScoreCorrected: false,
      finalistsAdvanced: false,
      finalsStarted: false,
      publicViewed: false,
    },
    links: {
      setup: "/staff/demo",
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
    .select("id, slug, name, is_demo, current_phase, qualifier_locked_at, finals_started_at, demo_metadata")
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
    const competition = await loadCanonicalDemoCompetition(supabase);
    if (!competition) {
      return emptyDemoStoryState(null);
    }

    const [targetAttempt, finalistCount, scorecard] = await Promise.all([
      loadDemoTargetAttempt(supabase, competition),
      loadDemoFinalistCount(supabase, competition),
      loadDemoScorecardLink(supabase, competition),
    ]);
    const progress = deriveDemoStoryProgress({
      competition,
      targetAttempt,
      finalistCount,
      publicViewed,
    });

    return {
      available: true,
      error: null,
      competition,
      metadata: competition.demo_metadata,
      targetAttempt,
      finalistCount,
      progress,
      links: {
        setup: "/staff/demo",
        judge: `/staff/c/${competition.slug}/judge?demoStory=act2`,
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
  options: { reset?: boolean }
) {
  let competition = await loadCanonicalDemoCompetition(supabase);

  if (options.reset || !competition) {
    await resetDemoCompetition();
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

  return competition;
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
  options: { reset?: boolean } = {}
): Promise<DemoStoryState> {
  if (!ACT_ORDER.includes(targetAct)) {
    throw new Error("Invalid demo story target.");
  }

  const supabase = createServiceRoleSupabaseClient();
  await ensureDemoCompetition(supabase, options);

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
