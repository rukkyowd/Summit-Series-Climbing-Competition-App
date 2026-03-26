import { assertSupabaseConfigured, supabase } from "./supabase";
import type {
  ClimbAttempt,
  ClimbNumber,
  ClimberWithAttempts,
  LeaderboardViewRow,
} from "./scoring";

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

  const { data, error } = await supabase
    .from("climbers")
    .select("*, climb_attempts(*)")
    .eq("climber_number", climberNumber)
    .maybeSingle();

  if (error || !data) return null;
  return data as ClimberWithAttempts;
}

export async function getClimberById(id: string) {
  ensureConfigured();

  const { data, error } = await supabase
    .from("climbers")
    .select("*, climb_attempts(*)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as ClimberWithAttempts;
}

export async function getAllClimbersWithAttempts(): Promise<ClimberWithAttempts[]> {
  ensureConfigured();

  const { data, error } = await supabase
    .from("climbers")
    .select("*, climb_attempts(*)")
    .order("climber_number", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as ClimberWithAttempts[]) ?? [];
}

export async function getCompetitionCategories(): Promise<string[]> {
  ensureConfigured();

  const { data, error } = await supabase
    .from("climbers")
    .select("category")
    .order("category", { ascending: true });

  if (error) throw new Error(error.message);

  const categories = new Set(
    (data ?? [])
      .map((entry) => entry.category)
      .filter((value): value is string => Boolean(value?.trim()))
  );

  return Array.from(categories);
}

export async function getLeaderboardRows(category?: string | null): Promise<LeaderboardViewRow[]> {
  ensureConfigured();

  let query = supabase.from("leaderboard_view").select("*");

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query.order(category ? "category_rank" : "overall_rank", {
    ascending: true,
  });

  if (error) throw new Error(error.message);
  return (data as LeaderboardViewRow[]) ?? [];
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
