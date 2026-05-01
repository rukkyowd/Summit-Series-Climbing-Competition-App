import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server-auth";
import { createRouteSupabaseClient } from "@/lib/server-supabase";

export type StaffScoreClientResult =
  | { supabase: ReturnType<typeof createRouteSupabaseClient>; response: null }
  | { supabase: null; response: NextResponse };

export async function requireStaffScoreClient(): Promise<StaffScoreClientResult> {
  const result = await requireStaff();
  if (!result.ok) {
    return {
      supabase: null,
      response: result.response,
    };
  }

  return { supabase: result.supabase, response: null };
}

export function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export async function readJsonBody<TPayload>(request: Request) {
  try {
    return { payload: (await request.json()) as TPayload, response: null };
  } catch {
    return {
      payload: null,
      response: NextResponse.json({ error: "Invalid request body." }, { status: 400 }),
    };
  }
}
