import type { CompetitionSnapshot } from "@/lib/db";
import { filterAttemptsForRound } from "@/lib/scoring";

export type DemoSimulationScore = {
  competitionId: string;
  climberId: string;
  climberName: string;
  climberNumber: string;
  accessToken: string;
  climbNumber: number;
  attemptCount: number;
  topped: boolean;
  zone: boolean;
  attemptsToTop: number | null;
  attemptsToZone: number | null;
};

export type DemoSimulationEvent = DemoSimulationScore & {
  submittedAt: number;
  mode: "staff" | "climber-scorecard" | "demo-service-role";
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getDemoSimulationDelayMs() {
  return randomInt(2000, 4000);
}

function getSkillProxy(snapshot: CompetitionSnapshot, climberId: string) {
  const leaderboardEntry = snapshot.qualifierLeaderboard.find((entry) => entry.climber_id === climberId);
  if (!leaderboardEntry) {
    return 0.55;
  }

  const fieldSize = Math.max(1, snapshot.qualifierLeaderboard.length);
  return clamp(1 - (leaderboardEntry.overall_rank - 1) / fieldSize, 0.18, 0.96);
}

function chooseClimber(snapshot: CompetitionSnapshot) {
  const activeRoundId = snapshot.activeQualifierRound?.id ?? null;
  const problemCount = snapshot.activeQualifierRound?.problem_count ?? snapshot.competition.total_climbs;
  const scorableClimbers = snapshot.climbers.filter((climber) => Boolean(climber.access_token));
  const climbersWithOpenProblems = scorableClimbers.filter((climber) => {
    const attempts = filterAttemptsForRound(climber.qualifier_attempts, activeRoundId);
    return attempts.some((attempt) => !attempt.topped) || attempts.length < problemCount;
  });
  const pool = climbersWithOpenProblems;

  return pool[randomInt(0, Math.max(0, pool.length - 1))] ?? null;
}

function chooseClimbNumber(snapshot: CompetitionSnapshot, climberId: string) {
  const activeRoundId = snapshot.activeQualifierRound?.id ?? null;
  const problemCount = snapshot.activeQualifierRound?.problem_count ?? snapshot.competition.total_climbs;
  const climber = snapshot.climbers.find((entry) => entry.id === climberId);
  const attempts = filterAttemptsForRound(climber?.qualifier_attempts ?? [], activeRoundId);
  const unfinished = Array.from({ length: problemCount }, (_, index) => index + 1).filter((climbNumber) => {
    const attempt = attempts.find((entry) => entry.climb_number === climbNumber);
    return !attempt?.topped;
  });

  if (unfinished.length) {
    return unfinished[randomInt(0, unfinished.length - 1)] ?? 1;
  }

  return randomInt(1, Math.max(1, problemCount));
}

export function buildDemoSimulationScore(snapshot: CompetitionSnapshot): DemoSimulationScore | null {
  if (!snapshot.competition.id || !snapshot.climbers.length) {
    return null;
  }

  const climber = chooseClimber(snapshot);
  if (!climber) {
    return null;
  }

  const problemCount = Math.max(1, snapshot.activeQualifierRound?.problem_count ?? snapshot.competition.total_climbs);
  const climbNumber = chooseClimbNumber(snapshot, climber.id);
  const normalizedClimb = problemCount > 1 ? (climbNumber - 1) / (problemCount - 1) : 0;
  const skill = getSkillProxy(snapshot, climber.id);
  const difficulty = clamp(0.26 + normalizedClimb * 0.52 + (Math.random() - 0.5) * 0.18, 0.12, 0.9);
  const edge = skill - difficulty;
  const topProbability = clamp(0.28 + edge * 0.72, 0.08, 0.86);
  const zoneProbability = clamp(0.58 + edge * 0.62, 0.18, 0.96);
  const topped = Math.random() < topProbability;
  const zone = topped || Math.random() < zoneProbability;
  const attemptsToTop = topped ? randomInt(1, 5) : null;
  const attemptsToZone = zone ? randomInt(1, Math.max(1, attemptsToTop ?? 5)) : null;
  const attemptCount = topped ? attemptsToTop ?? 1 : zone ? attemptsToZone ?? 1 : randomInt(1, 5);

  return {
    competitionId: snapshot.competition.id,
    climberId: climber.id,
    climberName: climber.name,
    climberNumber: climber.climber_number,
    accessToken: climber.access_token,
    climbNumber,
    attemptCount,
    topped,
    zone,
    attemptsToTop,
    attemptsToZone,
  };
}

export function formatDemoSimulationResult(score: Pick<DemoSimulationScore, "attemptCount" | "topped" | "zone">) {
  if (score.topped) {
    return score.attemptCount === 1 ? "flash top" : `top on attempt ${score.attemptCount}`;
  }

  if (score.zone) {
    return score.attemptCount === 1 ? "zone on first try" : `zone on attempt ${score.attemptCount}`;
  }

  return `${score.attemptCount} ${score.attemptCount === 1 ? "attempt" : "attempts"}, no score hold`;
}
