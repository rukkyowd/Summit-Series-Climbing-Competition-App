export const DEMO_TARGET_CLIMBER_NUMBER = "103";
export const DEMO_TARGET_CLIMBER_NAME = "Athlete C";
export const DEMO_TARGET_CLIMB_NUMBER = 3;
export const DEMO_TARGET_BEFORE_LABEL = "Top on try 3, zone reached";
export const DEMO_TARGET_AFTER_LABEL = "Top on try 1, zone reached";

export type DemoTargetAttemptState = {
  attempt_count?: number | null;
  topped?: boolean | null;
  zone?: boolean | null;
  attempts_to_top?: number | null;
  attempts_to_zone?: number | null;
} | null;

export type DemoProgress = {
  eventReady: boolean;
  dataPopulated: boolean;
  keyScoreCorrected: boolean;
  organizerAdvanced: boolean;
  publicReady?: boolean;
};

export function isDemoTargetCorrected(attempt: DemoTargetAttemptState) {
  return Boolean(
    attempt?.topped === true &&
      attempt.zone === true &&
      attempt.attempt_count === 1 &&
      attempt.attempts_to_top === 1 &&
      attempt.attempts_to_zone === 1
  );
}

export function isDemoTargetSeeded(attempt: DemoTargetAttemptState) {
  return Boolean(
    attempt?.topped &&
      attempt.zone &&
      attempt.attempt_count === 3 &&
      attempt.attempts_to_top === 3
  );
}

export function buildDemoJudgeUrl(slug: string, climberId: string | null | undefined) {
  const params = new URLSearchParams({
    demo: "act2",
    boulder: String(DEMO_TARGET_CLIMB_NUMBER),
  });

  if (climberId) {
    params.set("climberId", climberId);
  }

  return `/staff/c/${slug}/judge?${params.toString()}`;
}

export function buildDemoOrganizerUrl(slug: string) {
  return `/staff/c/${slug}?demo=act3`;
}

export function buildDemoPublicUrl(slug: string) {
  return `/c/${slug}?demo=act4`;
}

export function buildDemoLeaderboardUrl(slug: string) {
  return `/c/${slug}/leaderboard?demo=act4`;
}
