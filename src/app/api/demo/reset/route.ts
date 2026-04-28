import { NextResponse, type NextRequest } from "next/server";
import { resetDemoCompetition } from "@/lib/demo-reset";
import { createRouteSupabaseClient } from "@/lib/server-supabase";

const RESET_SECRET = process.env["CRON_SECRET"] ?? process.env["DEMO_RESET_SECRET"] ?? null;

async function isAuthorizedAdminRequest(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (RESET_SECRET && authorization === `Bearer ${RESET_SECRET}`) {
    return true;
  }

  const supabase = createRouteSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return profile?.role === "admin";
}

async function handleReset(request: NextRequest) {
  const authorized = await isAuthorizedAdminRequest(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await resetDemoCompetition();
    return NextResponse.json({ ok: true, demo: result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to reset the demo competition.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleReset(request);
}

export async function GET(request: NextRequest) {
  return handleReset(request);
}
