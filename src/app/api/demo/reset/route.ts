import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COMPETITION_SLUG } from "@/lib/demo";
import { getDemoStoryState } from "@/lib/demo-story";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

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
        refererUrl.pathname.startsWith(`/staff/c/${DEMO_COMPETITION_SLUG}`) ||
        refererUrl.pathname.startsWith(`/c/${DEMO_COMPETITION_SLUG}`))
    );
  } catch {
    return false;
  }
}

async function deleteCanonicalDemoCompetition() {
  const supabase = createServiceRoleSupabaseClient();
  const { data: rows, error: loadError } = await supabase
    .from("competitions")
    .select("id, slug, is_demo")
    .eq("slug", DEMO_COMPETITION_SLUG);

  if (loadError) {
    throw new Error(loadError.message || "Unable to load the canonical demo competition.");
  }

  const existingRows = rows ?? [];
  if (existingRows.some((row) => row.slug === DEMO_COMPETITION_SLUG && row.is_demo !== true)) {
    throw new Error("The canonical demo slug belongs to a real competition. Refusing to reset demo state.");
  }

  const demoIds = existingRows.filter((row) => row.is_demo === true).map((row) => row.id as string);
  if (!demoIds.length) {
    return [] as string[];
  }

  const { error: deleteError } = await supabase.from("competitions").delete().in("id", demoIds);
  if (deleteError) {
    throw new Error(deleteError.message || "Unable to reset the canonical demo competition.");
  }

  return demoIds;
}

export async function POST(request: NextRequest) {
  if (!isAllowedDemoMutation(request)) {
    return NextResponse.json({ ok: false, error: "Demo reset is only available from demo pages." }, { status: 401 });
  }

  try {
    const deletedCompetitionIds = await deleteCanonicalDemoCompetition();
    const state = await getDemoStoryState();
    return NextResponse.json({ ok: true, deletedCompetitionIds, state });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to reset demo state." },
      { status: 500 }
    );
  }
}
