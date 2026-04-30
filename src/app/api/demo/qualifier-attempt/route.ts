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
  clientEventId?: string;
  scoredAt?: string;
  judgeDeviceId?: string | null;
  judgeSessionId?: string | null;
  replayedFromOffline?: boolean;
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

    const { data, error: attemptError } = await supabase.rpc("append_qualifier_score_event", {
      p_competition_id: competition.id,
      p_round_id: round.id,
      p_climber_id: climber.id,
      p_climb_number: payload.climbNumber,
      p_attempt_count: normalized.attemptCount,
      p_topped: normalized.topped,
      p_zone: normalized.zone,
      p_attempts_to_top: normalized.attemptsToTop,
      p_attempts_to_zone: normalized.attemptsToZone,
      p_entered_by: "staff",
      p_client_event_id: payload.clientEventId,
      p_scored_at: payload.scoredAt,
      p_judge_device_id: payload.judgeDeviceId?.trim() || null,
      p_judge_session_id: payload.judgeSessionId?.trim() || null,
      p_replayed_from_offline: payload.replayedFromOffline ?? false,
    });

    if (attemptError) {
      throw new Error(attemptError.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    const attempt =
      result && typeof result === "object" && "attempt" in result
        ? (result as { attempt: unknown }).attempt
        : null;

    return NextResponse.json({
      attempt,
      status:
        result && typeof result === "object" && typeof (result as { status?: string }).status === "string"
          ? (result as { status: string }).status
          : "accepted",
      conflictReason:
        result &&
        typeof result === "object" &&
        typeof (result as { conflict_reason?: string }).conflict_reason === "string"
          ? (result as { conflict_reason: string }).conflict_reason
          : null,
      clientEventId:
        result &&
        typeof result === "object" &&
        typeof (result as { client_event_id?: string }).client_event_id === "string"
          ? (result as { client_event_id: string }).client_event_id
          : payload.clientEventId ?? null,
      scoredAt:
        result &&
        typeof result === "object" &&
        typeof (result as { scored_at?: string }).scored_at === "string"
          ? (result as { scored_at: string }).scored_at
          : payload.scoredAt ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to save the demo qualifier attempt.",
      },
      { status: 500 }
    );
  }
}
