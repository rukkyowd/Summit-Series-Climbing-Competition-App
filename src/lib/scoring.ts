// ============================================================
// SCORING ENGINE
// All scoring math lives here. Pure functions — no side effects.
// ============================================================

export const CLIMBS = [
  { number: 1, label: "Climb 1", basePoints: 1000, color: "#2ECC71" },
  { number: 2, label: "Climb 2", basePoints: 2000, color: "#3498DB" },
  { number: 3, label: "Climb 3", basePoints: 3000, color: "#E63946" },
] as const;

export const PENALTY_PER_FAIL = 200;
export const MAX_PENALIZED_FAILS = 3; // cap: only penalize up to 3 fails per climb

export type ClimbNumber = 1 | 2 | 3;

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
  climb1_score: number;
  climb2_score: number;
  climb3_score: number;
  total_score: number;
  total_time_seconds: number;
  rank: number;
}

/**
 * Calculate the score for a single climb.
 *
 * The capping rule:
 *   - You can only lose points for up to MAX_PENALIZED_FAILS attempts.
 *   - Even if you fail 10 times, you're only penalized for 3.
 *   - Minimum score for a completed climb is basePoints − (MAX_PENALIZED_FAILS × PENALTY_PER_FAIL).
 *   - If the climb was NOT completed, the score is 0.
 *
 * Example: Climb 2 (2000 pts), 5 fails
 *   cappedFails = min(5, 3) = 3
 *   score = 2000 − (3 × 200) = 1400  ← safely above Climb 1 max (1000)
 */
export function calculateClimbScore(
  climbNumber: ClimbNumber,
  failedAttempts: number,
  completed: boolean
): number {
  if (!completed) return 0;

  const climb = CLIMBS.find((c) => c.number === climbNumber)!;
  const cappedFails = Math.min(failedAttempts, MAX_PENALIZED_FAILS);
  const penalty = cappedFails * PENALTY_PER_FAIL;
  return climb.basePoints - penalty;
}

/**
 * Calculate the total score for a climber across all their attempts.
 */
export function calculateTotalScore(attempts: ClimbAttempt[]): number {
  return attempts.reduce((total, attempt) => {
    return (
      total +
      calculateClimbScore(
        attempt.climb_number,
        attempt.failed_attempts,
        attempt.completed
      )
    );
  }, 0);
}

/**
 * Calculate total completion time (sum of all completed climbs).
 * Incomplete climbs contribute 0.
 */
export function calculateTotalTime(attempts: ClimbAttempt[]): number {
  return attempts.reduce((total, attempt) => {
    if (attempt.completed && attempt.completion_time_seconds != null) {
      return total + attempt.completion_time_seconds;
    }
    return total;
  }, 0);
}

/**
 * Build a full leaderboard from raw climbers + attempts data.
 * Sorted by: total score DESC, then total time ASC (tie-breaker).
 */
export function buildLeaderboard(
  climbers: ClimberWithAttempts[]
): LeaderboardEntry[] {
  const entries = climbers.map((climber) => {
    const a = climber.climb_attempts;

    const getAttempt = (n: ClimbNumber) =>
      a.find((x) => x.climb_number === n);

    const c1 = getAttempt(1);
    const c2 = getAttempt(2);
    const c3 = getAttempt(3);

    const climb1_score = c1
      ? calculateClimbScore(1, c1.failed_attempts, c1.completed)
      : 0;
    const climb2_score = c2
      ? calculateClimbScore(2, c2.failed_attempts, c2.completed)
      : 0;
    const climb3_score = c3
      ? calculateClimbScore(3, c3.failed_attempts, c3.completed)
      : 0;

    const total_score = climb1_score + climb2_score + climb3_score;
    const total_time_seconds = calculateTotalTime(a);

    return {
      climber_id: climber.id,
      name: climber.name,
      climber_number: climber.climber_number,
      climb1_score,
      climb2_score,
      climb3_score,
      total_score,
      total_time_seconds,
      rank: 0, // assigned below
    };
  });

  // Sort: highest score first, then lowest time
  entries.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    return a.total_time_seconds - b.total_time_seconds;
  });

  // Assign ranks (handle ties: same score+time = same rank)
  let rank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (
      i > 0 &&
      (entries[i].total_score !== entries[i - 1].total_score ||
        entries[i].total_time_seconds !== entries[i - 1].total_time_seconds)
    ) {
      rank = i + 1;
    }
    entries[i].rank = rank;
  }

  return entries;
}

/**
 * Format seconds into MM:SS string.
 */
export function formatTime(totalSeconds: number): string {
  if (!totalSeconds) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Parse MM:SS or raw seconds string into total seconds.
 */
export function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();

  // Handle MM:SS format
  if (trimmed.includes(":")) {
    const [mStr, sStr] = trimmed.split(":");
    const m = parseInt(mStr, 10);
    const s = parseInt(sStr, 10);
    if (isNaN(m) || isNaN(s) || s >= 60) return null;
    return m * 60 + s;
  }

  // Handle raw seconds
  const seconds = parseInt(trimmed, 10);
  if (isNaN(seconds) || seconds < 0) return null;
  return seconds;
}
