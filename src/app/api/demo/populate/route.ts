import { NextResponse, type NextRequest } from "next/server";
import { populateDemoEventData } from "@/lib/demo-reset";
import { assertSupabaseServiceRoleConfigured } from "@/lib/server-supabase";

type DemoPopulateRequest = {
  competitionId?: string;
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
      (refererUrl.pathname.startsWith("/staff/new") ||
        refererUrl.pathname.startsWith("/staff/dashboard") ||
        refererUrl.pathname.startsWith("/demo") ||
        refererUrl.pathname.startsWith("/staff/c/"))
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedDemoMutation(request)) {
    return NextResponse.json({ ok: false, error: "Demo population is only available from demo pages." }, { status: 401 });
  }

  try {
    assertSupabaseServiceRoleConfigured();
  } catch (error) {
    console.error("DEMO POPULATE ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Demo service-role credentials are not configured." },
      { status: 500 }
    );
  }

  let payload: DemoPopulateRequest;
  try {
    payload = (await request.json()) as DemoPopulateRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!payload.competitionId) {
    return NextResponse.json({ ok: false, error: "competitionId is required." }, { status: 400 });
  }

  try {
    const populated = await populateDemoEventData(payload.competitionId);
    const judgeUrl = `/staff/c/${populated.slug}/judge?demoStory=act2`;
    return NextResponse.json({
      ok: true,
      competitionId: populated.competitionId,
      slug: populated.slug,
      judgeUrl,
      publicUrl: `/c/${populated.slug}`,
      leaderboardUrl: `/c/${populated.slug}/leaderboard`,
    });
  } catch (error) {
    console.error("DEMO POPULATE ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to populate demo data." },
      { status: 500 }
    );
  }
}
