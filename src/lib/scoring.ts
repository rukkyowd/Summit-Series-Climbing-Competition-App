// ============================================================
// SCORING ENGINE
// Shared scoring helpers plus database-backed competition settings.
// ============================================================

import { assertSupabaseConfigured, supabase } from "./supabase";

export const TOTAL_CLIMBS = 30;

export interface CompetitionSettings {
  penalty_per_fail: number;
  max_penalized_fails: number;
}

export const DEFAULT_COMPETITION_SETTINGS: CompetitionSettings = {
  penalty_per_fail: 200,
  max_penalized_fails: 3,
};

const CLIMB_COLORS = ["#2ECC71", "#3498DB", "#E63946", "#F4D03F", "#FF9F43"] as const;

let cachedSettings: CompetitionSettings | null = null;

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
  completed_at?: string | null;
}

export interface Climber {
  id: string;
  name: string;
  climber_number: string;
  category: string;
  registered_at?: string;
}

export interface ClimberWithAttempts extends Climber {
  climb_attempts: ClimbAttempt[];
}

export interface LeaderboardEntry {
  climber_id: string;
  name: string;
  climber_number: string;
  category: string;
  route_scores: number[];
  completed_routes: number;
  highest_completed_climb: number;
  total_score: number;
  total_time_seconds: number;
  rank: number;
}

export interface LeaderboardViewRow {
  climber_id: string;
  name: string;
  climber_number: string;
  category?: string | null;
  total_score: number;
  total_time_seconds: number;
  completed_climbs: number;
  highest_completed_climb: number;
  overall_rank?: number | null;
  category_rank?: number | null;
}

export async function getCompetitionSettings(forceRefresh = false): Promise<CompetitionSettings> {
  if (cachedSettings && !forceRefresh) {
    return cachedSettings;
  }

  if (!supabase) {
    return DEFAULT_COMPETITION_SETTINGS;
  }

  try {
    assertSupabaseConfigured();

    const { data, error } = await supabase
      .from("competition_settings")
      .select("penalty_per_fail, max_penalized_fails")
      .eq("id", 1)
      .single();

    if (error || !data) {
      cachedSettings = DEFAULT_COMPETITION_SETTINGS;
      return cachedSettings;
    }

    cachedSettings = {
      penalty_per_fail: data.penalty_per_fail ?? DEFAULT_COMPETITION_SETTINGS.penalty_per_fail,
      max_penalized_fails:
        data.max_penalized_fails ?? DEFAULT_COMPETITION_SETTINGS.max_penalized_fails,
    };

    return cachedSettings;
  } catch {
    cachedSettings = DEFAULT_COMPETITION_SETTINGS;
    return cachedSettings;
  }
}

export function clearCompetitionSettingsCache() {
  cachedSettings = null;
}

export function calculateClimbScore(
  climbNumber: ClimbNumber,
  failedAttempts: number,
  completed: boolean,
  settings: CompetitionSettings = DEFAULT_COMPETITION_SETTINGS
): number {
  if (!completed) return 0;

  const climb = CLIMBS.find((entry) => entry.number === climbNumber);
  if (!climb) return 0;

  const cappedFails = Math.min(failedAttempts, settings.max_penalized_fails);
  const penalty = cappedFails * settings.penalty_per_fail;
  return climb.basePoints - penalty;
}

export function calculateTotalScore(
  attempts: ClimbAttempt[],
  settings: CompetitionSettings = DEFAULT_COMPETITION_SETTINGS
): number {
  return attempts.reduce((total, attempt) => {
    return (
      total +
      calculateClimbScore(
        attempt.climb_number,
        attempt.failed_attempts,
        attempt.completed,
        settings
      )
    );
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

export function getRouteScores(
  attempts: ClimbAttempt[],
  settings: CompetitionSettings = DEFAULT_COMPETITION_SETTINGS
): number[] {
  return CLIMBS.map((climb) => {
    const attempt = attempts.find((entry) => entry.climb_number === climb.number);

    return attempt
      ? calculateClimbScore(climb.number, attempt.failed_attempts, attempt.completed, settings)
      : 0;
  });
}

export function mapLeaderboardViewRowToEntry(
  row: LeaderboardViewRow,
  categoryScoped = false
): LeaderboardEntry {
  return {
    climber_id: row.climber_id,
    name: row.name,
    climber_number: row.climber_number,
    category: row.category ?? "Open",
    route_scores: [],
    completed_routes: row.completed_climbs,
    highest_completed_climb: row.highest_completed_climb,
    total_score: row.total_score,
    total_time_seconds: row.total_time_seconds,
    rank: (categoryScoped ? row.category_rank : row.overall_rank) ?? 0,
  };
}

export const MAX_TOTAL_SCORE = CLIMBS.reduce((sum, climb) => sum + climb.basePoints, 0);

export function buildLeaderboard(
  climbers: ClimberWithAttempts[],
  settings: CompetitionSettings = DEFAULT_COMPETITION_SETTINGS
): LeaderboardEntry[] {
  const entries = climbers.map((climber) => {
    const route_scores = getRouteScores(climber.climb_attempts, settings);
    const total_score = route_scores.reduce((sum, score) => sum + score, 0);
    const total_time_seconds = calculateTotalTime(climber.climb_attempts);

    return {
      climber_id: climber.id,
      name: climber.name,
      climber_number: climber.climber_number,
      category: climber.category,
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
    if (a.total_time_seconds !== b.total_time_seconds) {
      return a.total_time_seconds - b.total_time_seconds;
    }

    return a.name.localeCompare(b.name);
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
