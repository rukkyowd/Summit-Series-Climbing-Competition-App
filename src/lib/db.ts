import { assertSupabaseConfigured, supabase } from "./supabase";
import type { ClimbAttempt, ClimbNumber, ClimberWithAttempts } from "./scoring";

function ensureConfigured() {
  assertSupabaseConfigured();
}

export async function registerClimber(name: string, climberNumber: string) {
  ensureConfigured();

  const { data: existing } = await supabase
    .from("climbers")
    .select("id")
    .eq("climber_number", climberNumber)
    .single();

  if (existing) {
    throw new Error(`Climber number ${climberNumber} is already registered.`);
  }

  const { data, error } = await supabase
    .from("climbers")
    .insert({ name: name.trim(), climber_number: climberNumber.trim() })
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
    .single();

  if (error) return null;
  return data as ClimberWithAttempts;
}

export async function getClimberById(id: string) {
  ensureConfigured();

  const { data, error } = await supabase
    .from("climbers")
    .select("*, climb_attempts(*)")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as ClimberWithAttempts;
}

export async function getAllClimbersWithAttempts(): Promise<ClimberWithAttempts[]> {
  ensureConfigured();

  const { data, error } = await supabase
    .from("climbers")
    .select("*, climb_attempts(*)");

  if (error) throw new Error(error.message);
  return (data as ClimberWithAttempts[]) ?? [];
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
    .single();

  if (existing) return existing as ClimbAttempt;

  const { data, error } = await supabase
    .from("climb_attempts")
    .insert({
      climber_id: climberId,
      climb_number: climbNumber,
      failed_attempts: 0,
      completed: false,
    })
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
  completionTimeSeconds: number
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

  const { error } = await supabase
    .from("climbers")
    .delete()
    .eq("id", climberId);

  if (error) throw new Error(error.message);
}

export async function deleteAllClimbers(): Promise<void> {
  ensureConfigured();

  const { error } = await supabase
    .from("climbers")
    .delete()
    .not("id", "is", null);

  if (error) throw new Error(error.message);
}
