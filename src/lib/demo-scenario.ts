export const DEMO_TARGET_CLIMBER_NUMBER = "104";
export const DEMO_TARGET_CLIMBER_NAME = "Maya Chen";
export const DEMO_TARGET_CLIMB_NUMBER = 3;
export const DEMO_TARGET_BEFORE_LABEL = "Top in 3 attempts";
export const DEMO_TARGET_AFTER_LABEL = "Top in 1 attempt";

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
};

export function isDemoTargetCorrected(attempt: DemoTargetAttemptState) {
  if (!attempt?.topped) {
    return false;
  }

  const topOnFirstAttempt = attempt.attempts_to_top === 1 || attempt.attempt_count === 1;
  const zoneResolved = attempt.zone === true || attempt.topped === true;

  return topOnFirstAttempt && zoneResolved;
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
    demo: "1",
    boulder: String(DEMO_TARGET_CLIMB_NUMBER),
  });

  if (climberId) {
    params.set("climberId", climberId);
  }

  return `/staff/c/${slug}/judge?${params.toString()}`;
}

export function buildDemoOrganizerUrl(slug: string) {
  return `/staff/c/${slug}?demo=1`;
}

export function buildDemoPublicUrl(slug: string) {
  return `/c/${slug}?demo=1`;
}

export function buildDemoLeaderboardUrl(slug: string) {
  return `/c/${slug}/leaderboard?demo=1`;
}
