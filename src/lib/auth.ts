import type { Session } from "@supabase/supabase-js";
import { assertSupabaseConfigured, supabase } from "./supabase";

export type AppRole = "admin" | "judge" | "climber";

export interface Profile {
  id: string;
  role: AppRole;
  display_name?: string | null;
}

export interface AuthState {
  session: Session | null;
  profile: Profile | null;
}

export function isStaffRole(role: AppRole | null | undefined) {
  return role === "admin" || role === "judge";
}

async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as Profile;
}

export async function getAuthState(): Promise<AuthState> {
  assertSupabaseConfigured();

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  if (!session) {
    return {
      session: null,
      profile: null,
    };
  }

  return {
    session,
    profile: await getProfile(session.user.id),
  };
}

export async function signInWithRole(email: string, password: string): Promise<AuthState> {
  assertSupabaseConfigured();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.session) {
    throw new Error("Supabase did not return a session for this login.");
  }

  const profile = await getProfile(data.session.user.id);

  if (!isStaffRole(profile?.role)) {
    await supabase.auth.signOut();
    throw new Error("This account is not assigned the judge or admin role.");
  }

  return {
    session: data.session,
    profile,
  };
}

export async function signOutUser() {
  assertSupabaseConfigured();

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}
