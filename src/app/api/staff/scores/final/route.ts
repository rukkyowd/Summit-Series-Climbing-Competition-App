import { NextResponse, type NextRequest } from "next/server";
import { normalizeFinalAttemptInput } from "@/lib/attempts";
import { getStaffScoreErrorStatus, normalizeStaffScoreRpcResult } from "@/lib/staff-score-api";
import { isPositiveInteger, readJsonBody, requireStaffScoreClient, trimOrNull } from "../_shared";

type FinalScoreRequest = {
  competitionId?: string;
  climberId?: string;
  climbNumber?: number;
  top?: boolean;
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
  const { payload, response: bodyError } = await readJsonBody<FinalScoreRequest>(request);
  if (bodyError) {
    return bodyError;
  }

  if (!payload?.competitionId || !payload.climberId || !isPositiveInteger(payload.climbNumber)) {
    return NextResponse.json({ error: "Missing competition, climber, or boulder details." }, { status: 400 });
  }
  const clientEventId = trimOrNull(payload.clientEventId);
  if (!clientEventId) {
    return NextResponse.json({ error: "clientEventId is required for idempotent staff scoring." }, { status: 400 });
  }

  const normalized = normalizeFinalAttemptInput({
    top: payload.top ?? false,
    zone: payload.zone ?? false,
    attemptsToTop: payload.attemptsToTop,
    attemptsToZone: payload.attemptsToZone,
  });

  try {
    const { supabase, response: authError } = await requireStaffScoreClient();
    if (authError) {
      return authError;
    }

    const { data, error } = await supabase.rpc("submit_staff_final_score_event", {
      p_competition_id: payload.competitionId,
      p_climber_id: payload.climberId,
      p_climb_number: payload.climbNumber,
      p_top: normalized.top,
      p_zone: normalized.zone,
      p_attempts_to_top: normalized.attemptsToTop,
      p_attempts_to_zone: normalized.attemptsToZone,
      p_client_event_id: clientEventId,
      p_scored_at: payload.scoredAt ?? null,
      p_judge_device_id: trimOrNull(payload.judgeDeviceId),
      p_judge_session_id: trimOrNull(payload.judgeSessionId),
      p_replayed_from_offline: payload.replayedFromOffline ?? false,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: getStaffScoreErrorStatus(error.message) });
    }

    return NextResponse.json(
      normalizeStaffScoreRpcResult(data, {
        clientEventId,
        scoredAt: payload.scoredAt ?? null,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save the finals attempt.";
    return NextResponse.json({ error: message }, { status: getStaffScoreErrorStatus(message) });
  }
}
