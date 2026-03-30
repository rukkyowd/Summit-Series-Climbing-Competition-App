import { assertSupabaseConfigured, publicSupabase, supabase } from "./supabase";
import type {
  ClimbAttempt,
  ClimbNumber,
  ClimberWithAttempts,
  LeaderboardViewRow,
} from "./scoring";
import { buildLeaderboard, getCompetitionSettings } from "./scoring";

function ensureConfigured() {
  assertSupabaseConfigured();
}

export async function registerClimber(name: string, climberNumber: string, category: string) {
  ensureConfigured();

  const { data: existing } = await supabase
    .from("climbers")
    .select("id")
    .eq("climber_number", climberNumber)
    .maybeSingle();

  if (existing) {
    throw new Error(`Climber number ${climberNumber} is already registered.`);
  }

  const { data, error } = await supabase
    .from("climbers")
    .insert({
      name: name.trim(),
      climber_number: climberNumber.trim(),
      category: category.trim(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getClimberByNumber(climberNumber: string) {
  ensureConfigured();

  const { data, error } = await publicSupabase
    .from("climbers")
    .select("*, climb_attempts(*)")
    .eq("climber_number", climberNumber)
    .maybeSingle();

  if (error || !data) return null;
  return data as ClimberWithAttempts;
}

export async function getClimberById(id: string) {
  ensureConfigured();

  const { data, error } = await publicSupabase
    .from("climbers")
    .select("*, climb_attempts(*)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as ClimberWithAttempts;
}

export async function getAllClimbersWithAttempts(): Promise<ClimberWithAttempts[]> {
  ensureConfigured();

  const { data, error } = await publicSupabase
    .from("climbers")
    .select("*, climb_attempts(*)")
    .order("climber_number", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as ClimberWithAttempts[]) ?? [];
}

export async function getCompetitionCategories(): Promise<string[]> {
  ensureConfigured();

  const { data, error } = await publicSupabase
    .from("climbers")
    .select("category")
    .order("category", { ascending: true });

  if (error) {
    return ["Open"];
  }

  const categories = new Set(
    (data ?? [])
      .map((entry) => entry.category)
      .filter((value): value is string => Boolean(value?.trim()))
  );
  const values = Array.from(categories);
  return values.length ? values : ["Open"];
}

export async function getLeaderboardRows(category?: string | null): Promise<LeaderboardViewRow[]> {
  ensureConfigured();

  let query = publicSupabase.from("leaderboard_view").select("*");

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (!error && data) {
    const rows = (data as LeaderboardViewRow[]).map((row) => ({
      ...row,
      category: row.category ?? "Open",
    }));

    rows.sort((left, right) => {
      if ((right.total_score ?? 0) !== (left.total_score ?? 0)) {
        return (right.total_score ?? 0) - (left.total_score ?? 0);
      }
      if ((left.total_time_seconds ?? 0) !== (right.total_time_seconds ?? 0)) {
        return (left.total_time_seconds ?? 0) - (right.total_time_seconds ?? 0);
      }
      return left.name.localeCompare(right.name);
    });

    let overallRank = 1;
    const categoryRanks: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    const previousByCategory: Record<string, LeaderboardViewRow | undefined> = {};

    return rows.map((row, index) => {
      if (
        index > 0 &&
        (row.total_score !== rows[index - 1].total_score ||
          row.total_time_seconds !== rows[index - 1].total_time_seconds)
      ) {
        overallRank = index + 1;
      }

      const rowCategory = row.category ?? "Open";
      categoryCounts[rowCategory] = (categoryCounts[rowCategory] ?? 0) + 1;

      const previous = previousByCategory[rowCategory];
      if (
        !previous ||
        previous.total_score !== row.total_score ||
        previous.total_time_seconds !== row.total_time_seconds
      ) {
        categoryRanks[rowCategory] = categoryCounts[rowCategory];
      }

      previousByCategory[rowCategory] = row;

      return {
        ...row,
        overall_rank: row.overall_rank ?? overallRank,
        category_rank: row.category_rank ?? categoryRanks[rowCategory],
      };
    });
  }

  const [climbers, settings] = await Promise.all([
    getAllClimbersWithAttempts(),
    getCompetitionSettings(true),
  ]);

  const fallbackBoard = buildLeaderboard(
    category ? climbers.filter((climber) => (climber.category ?? "Open") === category) : climbers,
    settings
  );

  return fallbackBoard.map((entry) => ({
    climber_id: entry.climber_id,
    name: entry.name,
    climber_number: entry.climber_number,
    category: entry.category ?? "Open",
    total_score: entry.total_score,
    total_time_seconds: entry.total_time_seconds,
    completed_climbs: entry.completed_routes,
    highest_completed_climb: entry.highest_completed_climb,
    overall_rank: entry.rank,
    category_rank: entry.rank,
  }));
}

export async function getOrCreateAttempt(
  climberId: string,
  climbNumber: ClimbNumber
): Promise<ClimbAttempt> {
  ensureConfigured();

  const { data: existing } = await supabase
    .from("climb_attempts")
    .select("*")
    .eq("climber_id", climberId)
    .eq("climb_number", climbNumber)
    .maybeSingle();

  if (existing) return existing as ClimbAttempt;

  const startedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("climb_attempts")
    .insert({
      climber_id: climberId,
      climb_number: climbNumber,
      failed_attempts: 0,
      completed: false,
      started_at: startedAt,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ClimbAttempt;
}

export async function getAttemptSnapshot(
  climberId: string,
  climbNumber: ClimbNumber
): Promise<ClimbAttempt | null> {
  ensureConfigured();

  const { data, error } = await publicSupabase
    .from("climb_attempts")
    .select("*")
    .eq("climber_id", climberId)
    .eq("climb_number", climbNumber)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ClimbAttempt | null) ?? null;
}

export async function startClimbAttempt(
  climberId: string,
  climbNumber: ClimbNumber,
  startedAtIso = new Date().toISOString()
): Promise<ClimbAttempt> {
  ensureConfigured();
  const attempt = await getOrCreateAttempt(climberId, climbNumber);

  if (attempt.completed) {
    throw new Error("Completed climbs must be reset before a new timed attempt starts.");
  }

  const { data, error } = await supabase
    .from("climb_attempts")
    .update({
      started_at: startedAtIso,
      completed_at: null,
    })
    .eq("id", attempt.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ClimbAttempt;
}

export async function addFailedAttempt(
  climberId: string,
  climbNumber: ClimbNumber
): Promise<ClimbAttempt> {
  ensureConfigured();
  const attempt = await getOrCreateAttempt(climberId, climbNumber);

  if (attempt.completed) {
    throw new Error("Cannot add a fail to a completed climb.");
  }

  const { data, error } = await supabase
    .from("climb_attempts")
    .update({ failed_attempts: attempt.failed_attempts + 1 })
    .eq("id", attempt.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ClimbAttempt;
}

export async function removeLastFail(
  climberId: string,
  climbNumber: ClimbNumber
): Promise<ClimbAttempt> {
  ensureConfigured();
  const attempt = await getOrCreateAttempt(climberId, climbNumber);

  if (attempt.completed) throw new Error("Cannot undo fails on a completed climb.");
  if (attempt.failed_attempts === 0) throw new Error("No fails to remove.");

  const { data, error } = await supabase
    .from("climb_attempts")
    .update({ failed_attempts: attempt.failed_attempts - 1 })
    .eq("id", attempt.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ClimbAttempt;
}

export async function completeClimb(
  climberId: string,
  climbNumber: ClimbNumber,
  completionTimeSeconds: number,
  startedAtIso?: string
): Promise<ClimbAttempt> {
  ensureConfigured();
  const attempt = await getOrCreateAttempt(climberId, climbNumber);

  if (attempt.completed) {
    throw new Error("Climb already marked complete.");
  }

  const { data, error } = await supabase
    .from("climb_attempts")
    .update({
      completed: true,
      completion_time_seconds: completionTimeSeconds,
      started_at: startedAtIso ?? attempt.started_at ?? new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ClimbAttempt;
}

export async function resetClimb(
  climberId: string,
  climbNumber: ClimbNumber
): Promise<ClimbAttempt> {
  ensureConfigured();
  const attempt = await getOrCreateAttempt(climberId, climbNumber);

  const { data, error } = await supabase
    .from("climb_attempts")
    .update({
      completed: false,
      failed_attempts: 0,
      completion_time_seconds: null,
      started_at: new Date().toISOString(),
      completed_at: null,
    })
    .eq("id", attempt.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ClimbAttempt;
}

export async function deleteClimber(climberId: string): Promise<void> {
  ensureConfigured();

  const { error } = await supabase.from("climbers").delete().eq("id", climberId);

  if (error) throw new Error(error.message);
}

export async function deleteAllClimbers(): Promise<void> {
  ensureConfigured();

  const { error } = await supabase.from("climbers").delete().not("id", "is", null);

  if (error) throw new Error(error.message);
}
