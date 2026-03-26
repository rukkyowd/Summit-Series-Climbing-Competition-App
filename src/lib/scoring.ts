// ============================================================
// SCORING ENGINE
// All scoring math lives here. Pure functions, no side effects.
// ============================================================

export const TOTAL_CLIMBS = 30;
export const PENALTY_PER_FAIL = 200;
export const MAX_PENALIZED_FAILS = 3;

const CLIMB_COLORS = ["#2ECC71", "#3498DB", "#E63946", "#F4D03F", "#FF9F43"] as const;

export const CLIMBS = Array.from({ length: TOTAL_CLIMBS }, (_, index) => {
  const number = index + 1;

  return {
    number,
    label: `Climb ${number.toString().padStart(2, "0")}`,
    basePoints: number * 1000,
    color: CLIMB_COLORS[index % CLIMB_COLORS.length],
  };
});

export type ClimbNumber = number;

export interface ClimbAttempt {
  id?: string;
  climber_id: string;
  climb_number: ClimbNumber;
  failed_attempts: number;
  completed: boolean;
  completion_time_seconds: number | null;
  started_at?: string;
  completed_at?: string;
}

export interface Climber {
  id: string;
  name: string;
  climber_number: string;
  registered_at?: string;
}

export interface ClimberWithAttempts extends Climber {
  climb_attempts: ClimbAttempt[];
}

export interface LeaderboardEntry {
  climber_id: string;
  name: string;
  climber_number: string;
  route_scores: number[];
  completed_routes: number;
  highest_completed_climb: number;
  total_score: number;
  total_time_seconds: number;
  rank: number;
}

export function calculateClimbScore(
  climbNumber: ClimbNumber,
  failedAttempts: number,
  completed: boolean
): number {
  if (!completed) return 0;

  const climb = CLIMBS.find((entry) => entry.number === climbNumber);
  if (!climb) return 0;

  const cappedFails = Math.min(failedAttempts, MAX_PENALIZED_FAILS);
  const penalty = cappedFails * PENALTY_PER_FAIL;
  return climb.basePoints - penalty;
}

export function calculateTotalScore(attempts: ClimbAttempt[]): number {
  return attempts.reduce((total, attempt) => {
    return total + calculateClimbScore(attempt.climb_number, attempt.failed_attempts, attempt.completed);
  }, 0);
}

export function calculateTotalTime(attempts: ClimbAttempt[]): number {
  return attempts.reduce((total, attempt) => {
    if (attempt.completed && attempt.completion_time_seconds != null) {
      return total + attempt.completion_time_seconds;
    }
    return total;
  }, 0);
}

export function countCompletedRoutes(attempts: ClimbAttempt[]): number {
  return attempts.filter((attempt) => attempt.completed).length;
}

export function getHighestCompletedClimb(attempts: ClimbAttempt[]): number {
  return attempts
    .filter((attempt) => attempt.completed)
    .reduce((highest, attempt) => Math.max(highest, attempt.climb_number), 0);
}

export function getRouteScores(attempts: ClimbAttempt[]): number[] {
  return CLIMBS.map((climb) => {
    const attempt = attempts.find((entry) => entry.climb_number === climb.number);
    return attempt ? calculateClimbScore(climb.number, attempt.failed_attempts, attempt.completed) : 0;
  });
}

export const MAX_TOTAL_SCORE = CLIMBS.reduce((sum, climb) => sum + climb.basePoints, 0);

export function buildLeaderboard(climbers: ClimberWithAttempts[]): LeaderboardEntry[] {
  const entries = climbers.map((climber) => {
    const route_scores = getRouteScores(climber.climb_attempts);
    const total_score = route_scores.reduce((sum, score) => sum + score, 0);
    const total_time_seconds = calculateTotalTime(climber.climb_attempts);

    return {
      climber_id: climber.id,
      name: climber.name,
      climber_number: climber.climber_number,
      route_scores,
      completed_routes: countCompletedRoutes(climber.climb_attempts),
      highest_completed_climb: getHighestCompletedClimb(climber.climb_attempts),
      total_score,
      total_time_seconds,
      rank: 0,
    };
  });

  entries.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    return a.total_time_seconds - b.total_time_seconds;
  });

  let rank = 1;
  for (let index = 0; index < entries.length; index += 1) {
    if (
      index > 0 &&
      (entries[index].total_score !== entries[index - 1].total_score ||
        entries[index].total_time_seconds !== entries[index - 1].total_time_seconds)
    ) {
      rank = index + 1;
    }
    entries[index].rank = rank;
  }

  return entries;
}

export function formatTime(totalSeconds: number): string {
  if (!totalSeconds) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();

  if (trimmed.includes(":")) {
    const [minutesRaw, secondsRaw] = trimmed.split(":");
    const minutes = parseInt(minutesRaw, 10);
    const seconds = parseInt(secondsRaw, 10);
    if (isNaN(minutes) || isNaN(seconds) || seconds >= 60) return null;
    return minutes * 60 + seconds;
  }

  const seconds = parseInt(trimmed, 10);
  if (isNaN(seconds) || seconds < 0) return null;
  return seconds;
}
