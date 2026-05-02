import { NextResponse, type NextRequest } from "next/server";
import {
  buildDemoCreateEventResponse,
  getDemoStoryState,
  prepareDemoStoryState,
  type DemoStoryTargetAct,
} from "@/lib/demo-story";
import { assertSupabaseServiceRoleConfigured } from "@/lib/server-supabase";

type DemoPrepareAct = "act2" | "act3" | "act4";

type DemoPrepareRequest = {
  targetAct?: DemoPrepareAct;
};

const TARGET_ACT_MAP: Record<DemoPrepareAct, DemoStoryTargetAct> = {
  act2: "event_created",
  act3: "score_corrected",
  act4: "public_ready",
};

function isAllowedDemoMutation(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return false;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return true;
  }

  try {
    const refererUrl = new URL(referer);
    return (
      refererUrl.origin === request.nextUrl.origin &&
      (refererUrl.pathname.startsWith("/demo") ||
        refererUrl.pathname.startsWith("/staff/demo") ||
        refererUrl.pathname.startsWith("/staff/c/") ||
        refererUrl.pathname.startsWith("/c/"))
    );
  } catch {
    return false;
  }
}

function isDemoPrepareAct(value: unknown): value is DemoPrepareAct {
  return value === "act2" || value === "act3" || value === "act4";
}

export async function GET() {
  const state = await getDemoStoryState();
  return NextResponse.json({ ok: true, state });
}

export async function POST(request: NextRequest) {
  if (!isAllowedDemoMutation(request)) {
    return NextResponse.json({ ok: false, error: "Demo preparation is only available from demo pages." }, { status: 401 });
  }

  try {
    assertSupabaseServiceRoleConfigured();
  } catch (error) {
    console.error("DEMO CREATE ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Demo service-role credentials are not configured." },
      { status: 500 }
    );
  }

  let payload: DemoPrepareRequest;
  try {
    payload = (await request.json()) as DemoPrepareRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!isDemoPrepareAct(payload.targetAct)) {
    return NextResponse.json({ ok: false, error: "Invalid demo prepare target." }, { status: 400 });
  }

  try {
    const state = await prepareDemoStoryState(TARGET_ACT_MAP[payload.targetAct]);
    const createResponse = state.competition ? buildDemoCreateEventResponse(state) : null;

    return NextResponse.json({
      ok: true,
      state,
      ...(createResponse ?? {}),
    });
  } catch (error) {
    console.error("DEMO CREATE ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to prepare demo state." },
      { status: 500 }
    );
  }
}
