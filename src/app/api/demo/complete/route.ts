import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

type DemoCompleteRequest = {
  competitionId?: string;
};

export async function POST(request: NextRequest) {
  let body: DemoCompleteRequest;

  try {
    body = (await request.json()) as DemoCompleteRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!body.competitionId) {
    return NextResponse.json({ ok: false, error: "competitionId is required." }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("id, is_demo")
      .eq("id", body.competitionId)
      .maybeSingle();

    if (competitionError) {
      throw new Error(competitionError.message);
    }

    if (!competition) {
      return NextResponse.json({ ok: false, error: "Demo competition not found." }, { status: 404 });
    }

    if (competition.is_demo !== true) {
      return NextResponse.json({ ok: false, error: "Refusing to delete a non-demo competition." }, { status: 403 });
    }

    const { error: deleteError } = await supabase.from("competitions").delete().eq("id", body.competitionId);
    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return NextResponse.json({ ok: true, competitionId: body.competitionId, deleted: true });
  } catch (error) {
    console.error("DEMO COMPLETE ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to finish demo." },
      { status: 500 }
    );
  }
}
