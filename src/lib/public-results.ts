import type { CompetitionPhase, FinalsLeaderboardEntry } from "./scoring";

export type PublicResultsDisplayMode = "qualifier" | "finals";
export type PublicOverviewSection = "leaderboard" | "finals";

export interface PublicResultsState {
  mode: PublicResultsDisplayMode;
  finalsStarted: boolean;
  finalsPending: boolean;
  hasFinalsAttempts: boolean;
  hasFinalsScores: boolean;
}

export function isPublicFinalsPhase(phase: CompetitionPhase | null | undefined) {
  return phase === "finals_open" || phase === "finals_closed" || phase === "results";
}

export function finalsRowsHaveAttempts(rows: FinalsLeaderboardEntry[]) {
  return rows.some((row) => row.attempts.length > 0);
}

export function finalsRowsHaveScores(rows: FinalsLeaderboardEntry[]) {
  return rows.some((row) =>
    row.problem_results.some((result) => result.top || result.zone || result.points > 0)
  );
}

export function getPublicResultsState(input: {
  phase: CompetitionPhase | null | undefined;
  finalsLeaderboard: FinalsLeaderboardEntry[];
}): PublicResultsState {
  const finalsStarted = isPublicFinalsPhase(input.phase);
  const hasFinalsAttempts = finalsRowsHaveAttempts(input.finalsLeaderboard);
  const hasFinalsScores = finalsRowsHaveScores(input.finalsLeaderboard);

  return {
    mode: finalsStarted ? "finals" : "qualifier",
    finalsStarted,
    finalsPending: finalsStarted && !hasFinalsAttempts,
    hasFinalsAttempts,
    hasFinalsScores,
  };
}

export function getPublicOverviewSections(state: PublicResultsState): PublicOverviewSection[] {
  return state.finalsStarted ? ["finals", "leaderboard"] : ["leaderboard", "finals"];
}

export function getPublicStandingsCopy(state: PublicResultsState) {
  if (state.finalsStarted) {
    return {
      kicker: "Qualification standings",
      title: "Earlier qualification standings",
      description: "These rankings show how athletes reached finals. Current finals results are shown above.",
      emptyText: "No qualification scores are public yet.",
      linkLabel: "Open finals leaderboard",
    };
  }

  return {
    kicker: "Leaderboard",
    title: "Public standings",
    description: "Live rankings and finalists stay visible to spectators from the public event surface.",
    emptyText: "No qualifier scores are public yet.",
    linkLabel: "Open full leaderboard",
  };
}

export function getLiveLeaderboardCopy(state: PublicResultsState) {
  if (state.finalsStarted) {
    return {
      kicker: "Finals leaderboard",
      description: "Finals are the live competition phase now, so this page follows finals standings instead of earlier qualifier rankings.",
      pendingTitle: "Finals are live.",
      pendingText: "Finals standings will appear here as soon as judges save the first finals score.",
    };
  }

  return {
    kicker: "Live leaderboard",
    description: "This is the public-facing leaderboard for climbers, coaches, parents, and spectators. It stays in sync with the same event record the judge station writes to.",
    pendingTitle: "Waiting for scores.",
    pendingText: "Qualifier standings will appear here as soon as scores are saved.",
  };
}
