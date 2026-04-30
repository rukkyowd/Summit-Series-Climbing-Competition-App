import { NextResponse, type NextRequest } from "next/server";
import { resetDemoCompetition } from "@/lib/demo-reset";
import { createRouteSupabaseClient } from "@/lib/server-supabase";

const RESET_SECRET = process.env["CRON_SECRET"] ?? process.env["DEMO_RESET_SECRET"] ?? null;
const PUBLIC_DEMO_PATH_PREFIXES = ["/demo", "/staff/demo"] as const;

type DemoResetRequest = {
  mode?: string;
};

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

function isPublicDemoResetRequest(request: NextRequest, payload: DemoResetRequest | null) {
  if (request.method !== "POST" || payload?.mode !== "public_demo") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return false;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);
    return (
      refererUrl.origin === request.nextUrl.origin &&
      PUBLIC_DEMO_PATH_PREFIXES.some((prefix) => refererUrl.pathname.startsWith(prefix))
    );
  } catch {
    return false;
  }
}

async function handleReset(request: NextRequest, options?: { publicDemo?: boolean }) {
  const authorized = options?.publicDemo ? true : await isAuthorizedAdminRequest(request);
  if (!authorized) {
    return NextResponse.json(
      { error: "This reset is only available from the live demo or an authorized staff session." },
      { status: 401 }
    );
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
  let payload: DemoResetRequest | null = null;

  try {
    payload = (await request.json()) as DemoResetRequest;
  } catch {
    payload = null;
  }

  return handleReset(request, { publicDemo: isPublicDemoResetRequest(request, payload) });
}

export async function GET(request: NextRequest) {
  return handleReset(request);
}
