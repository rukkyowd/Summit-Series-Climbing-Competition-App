import { NextResponse } from "next/server";
import { createRouteSupabaseClient } from "./server-supabase";
import { isStaffRole } from "./staff-score-api";

type RouteSupabaseClient = ReturnType<typeof createRouteSupabaseClient>;

type ProfileRole = "admin" | "judge" | string;

type AuthenticatedProfile = {
  id: string;
  role: ProfileRole | null;
};

type AuthGuardResult =
  | { ok: true; supabase: RouteSupabaseClient; profile: AuthenticatedProfile }
  | { ok: false; response: NextResponse };

export async function getAuthenticatedProfile(
  supabase: RouteSupabaseClient = createRouteSupabaseClient()
): Promise<AuthGuardResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  return {
    ok: true,
    supabase,
    profile: {
      id: user.id,
      role: typeof profile?.role === "string" ? profile.role : null,
    },
  };
}

export async function requireStaff(): Promise<AuthGuardResult> {
  const result = await getAuthenticatedProfile();
  if (!result.ok) {
    return result;
  }

  if (!isStaffRole(result.profile.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Staff role required." }, { status: 403 }),
    };
  }

  return result;
}

export async function requireAdmin(): Promise<AuthGuardResult> {
  const result = await getAuthenticatedProfile();
  if (!result.ok) {
    return result;
  }

  if (result.profile.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin role required." }, { status: 403 }),
    };
  }

  return result;
}
