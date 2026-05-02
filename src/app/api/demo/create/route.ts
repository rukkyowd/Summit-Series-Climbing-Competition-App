import { NextResponse, type NextRequest } from "next/server";
import {
  buildDemoCreateEventResponse,
  prepareDemoStoryState,
} from "@/lib/demo-story";
import type { GuidedDemoEventSetupInput } from "@/lib/guided-demo-setup";

type DemoCreateRequest = {
  setup?: GuidedDemoEventSetupInput;
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
      (refererUrl.pathname.startsWith("/demo") || refererUrl.pathname.startsWith("/staff/demo"))
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedDemoMutation(request)) {
    return NextResponse.json({ ok: false, error: "Demo creation is only available from demo pages." }, { status: 401 });
  }

  let payload: DemoCreateRequest;
  try {
    payload = (await request.json()) as DemoCreateRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  try {
    const state = await prepareDemoStoryState("event_created", {
      reset: true,
      setup: payload.setup,
    });
    const response = buildDemoCreateEventResponse(state);

    return NextResponse.json({
      ok: true,
      ...response,
      state,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the demo event.";
    return NextResponse.json(
      { ok: false, error: `Demo event creation failed: ${message.replace(/^Demo event creation failed:\s*/i, "")}` },
      { status: 500 }
    );
  }
}
