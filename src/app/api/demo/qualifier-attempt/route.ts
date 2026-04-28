import { NextResponse, type NextRequest } from "next/server";
import { normalizeQualifierAttemptInput } from "@/lib/attempts";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

type DemoQualifierAttemptRequest = {
  competitionId?: string;
  climberId?: string;
  climbNumber?: number;
  attemptCount?: number;
  topped?: boolean;
  zone?: boolean;
  attemptsToTop?: number | null;
  attemptsToZone?: number | null;
};

export async function POST(request: NextRequest) {
  let payload: DemoQualifierAttemptRequest;

  try {
    payload = (await request.json()) as DemoQualifierAttemptRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!payload.competitionId || !payload.climberId || !payload.climbNumber) {
    return NextResponse.json({ error: "Missing competition, climber, or boulder details." }, { status: 400 });
  }

  const normalized = normalizeQualifierAttemptInput({
    attemptCount: payload.attemptCount ?? 0,
    topped: payload.topped ?? false,
    zone: payload.zone,
    attemptsToTop: payload.attemptsToTop,
    attemptsToZone: payload.attemptsToZone,
  });

  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("id, is_demo, current_phase")
      .eq("id", payload.competitionId)
      .maybeSingle();

    if (competitionError) {
      throw new Error(competitionError.message);
    }

    if (!competition?.is_demo) {
      return NextResponse.json({ error: "Only the seeded demo competition accepts public demo saves." }, { status: 403 });
    }

    if (competition.current_phase !== "qualifier_open") {
      return NextResponse.json({ error: "Demo qualifier scoring is only open during the live qualifier phase." }, { status: 409 });
    }

    const { data: round, error: roundError } = await supabase
      .from("competition_rounds")
      .select("id")
      .eq("competition_id", competition.id)
      .eq("scoring_bucket", "qualifier")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (roundError) {
      throw new Error(roundError.message);
    }

    if (!round) {
      return NextResponse.json({ error: "No active demo qualifier round is available." }, { status: 409 });
    }

    const { data: climber, error: climberError } = await supabase
      .from("climbers")
      .select("id")
      .eq("competition_id", competition.id)
      .eq("id", payload.climberId)
      .maybeSingle();

    if (climberError) {
      throw new Error(climberError.message);
    }

    if (!climber) {
      return NextResponse.json({ error: "Climber not found in the demo competition." }, { status: 404 });
    }

    const { data: attempt, error: attemptError } = await supabase
      .from("qualifier_attempts")
      .upsert(
        {
          competition_id: competition.id,
          round_id: round.id,
          climber_id: climber.id,
          climb_number: payload.climbNumber,
          attempt_count: normalized.attemptCount,
          topped: normalized.topped,
          zone: normalized.zone,
          attempts_to_top: normalized.attemptsToTop,
          attempts_to_zone: normalized.attemptsToZone,
          entered_by: "staff",
        },
        { onConflict: "competition_id,round_id,climber_id,climb_number" }
      )
      .select("*")
      .single();

    if (attemptError) {
      throw new Error(attemptError.message);
    }

    return NextResponse.json({ attempt });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to save the demo qualifier attempt.",
      },
      { status: 500 }
    );
  }
}
