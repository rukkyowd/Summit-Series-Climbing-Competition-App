import type { Session } from "@supabase/supabase-js";
import { assertSupabaseConfigured, supabase } from "./supabase";

export type AppRole = "admin" | "judge" | "climber";
const AUTH_TIMEOUT_MS = 10000;

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

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(
          new Error(
            `${label} timed out. Check your Supabase URL/key, confirm the schema is applied, and make sure your user has a row in public.profiles.`
          )
        );
      }, AUTH_TIMEOUT_MS);
    }),
  ]);
}

async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await withTimeout<any>(
    supabase.from("profiles").select("id, role, display_name").eq("id", userId).maybeSingle(),
    "Profile lookup"
  );

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
  } = await withTimeout<any>(supabase.auth.getSession(), "Session lookup");

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

  const { data, error } = await withTimeout<any>(
    supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    }),
    "Sign-in"
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data.session) {
    throw new Error("Supabase did not return a session for this login.");
  }

  const profile = await getProfile(data.session.user.id);

  if (!isStaffRole(profile?.role)) {
    await supabase.auth.signOut();
    throw new Error(
      "This account can sign in, but it is not assigned the judge or admin role in public.profiles."
    );
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
