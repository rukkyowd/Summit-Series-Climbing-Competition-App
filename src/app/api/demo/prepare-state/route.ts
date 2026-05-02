import { NextResponse, type NextRequest } from "next/server";
import {
  prepareDemoStoryState,
  getDemoStoryState,
  type DemoStoryTargetAct,
} from "@/lib/demo-story";
import { DEMO_COMPETITION_SLUG } from "@/lib/demo";
import type { GuidedDemoEventSetupInput } from "@/lib/guided-demo-setup";

const DEMO_STORY_TARGET_ACTS = [
  "event_created",
  "score_corrected",
  "finalists_started",
  "public_ready",
] as const satisfies readonly DemoStoryTargetAct[];

type DemoPrepareStateRequest = {
  targetAct?: DemoStoryTargetAct;
  reset?: boolean;
  resetOnly?: boolean;
  setup?: GuidedDemoEventSetupInput;
};

function isAllowedDemoRequest(request: NextRequest) {
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
    if (refererUrl.origin !== request.nextUrl.origin) {
      return false;
    }

    return (
      refererUrl.pathname.startsWith("/demo") ||
      refererUrl.pathname.startsWith("/staff/demo") ||
      refererUrl.pathname.startsWith(`/staff/c/${DEMO_COMPETITION_SLUG}`) ||
      refererUrl.pathname.startsWith(`/c/${DEMO_COMPETITION_SLUG}`)
    );
  } catch {
    return false;
  }
}

function isDemoStoryTargetAct(value: unknown): value is DemoStoryTargetAct {
  return typeof value === "string" && DEMO_STORY_TARGET_ACTS.includes(value as DemoStoryTargetAct);
}

export async function GET() {
  const state = await getDemoStoryState();
  return NextResponse.json({ ok: true, state });
}

export async function POST(request: NextRequest) {
  if (!isAllowedDemoRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Demo state preparation is only available from demo pages." },
      { status: 401 }
    );
  }

  let payload: DemoPrepareStateRequest;

  try {
    payload = (await request.json()) as DemoPrepareStateRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!isDemoStoryTargetAct(payload.targetAct)) {
    return NextResponse.json({ ok: false, error: "Invalid demo story target." }, { status: 400 });
  }

  try {
    const state = await prepareDemoStoryState(payload.targetAct, {
      reset: payload.reset === true,
      resetOnly: payload.resetOnly === true,
      setup: payload.setup,
    });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to prepare the demo story state.",
      },
      { status: 500 }
    );
  }
}
