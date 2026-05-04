import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";
import {
  DEMO_TARGET_AFTER_LABEL,
  DEMO_TARGET_BEFORE_LABEL,
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NUMBER,
  isDemoTargetCorrected,
  isDemoTargetSeeded,
  type DemoTargetAttemptState,
} from "@/lib/demo-scenario";

type CompetitionRow = {
  id: string;
  slug: string;
  is_demo: boolean;
  current_phase: string | null;
  qualifier_locked_at: string | null;
  finals_started_at: string | null;
};

export const dynamic = "force-dynamic";

function getSingleCount(result: { count?: number | null }) {
  return result.count ?? 0;
}

export async function GET(request: NextRequest) {
  const competitionId = request.nextUrl.searchParams.get("competitionId")?.trim() ?? "";
  const slug = request.nextUrl.searchParams.get("slug")?.trim() ?? "";

  if (!competitionId && !slug) {
    return NextResponse.json({ ok: false, error: "competitionId or slug is required." }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleSupabaseClient();
    const competitionQuery = supabase
      .from("competitions")
      .select("id, slug, is_demo, current_phase, qualifier_locked_at, finals_started_at")
      .limit(1);
    const { data: competition, error: competitionError } = competitionId
      ? await competitionQuery.eq("id", competitionId).maybeSingle()
      : await competitionQuery.eq("slug", slug).maybeSingle();

    if (competitionError) {
      throw new Error(competitionError.message);
    }

    const competitionRow = competition as CompetitionRow | null;
    if (!competitionRow) {
      return NextResponse.json({ ok: false, error: "Demo competition not found." }, { status: 404 });
    }

    if (competitionRow.is_demo !== true) {
      return NextResponse.json({ ok: false, error: "Refusing to read demo state for a non-demo competition." }, { status: 403 });
    }

    const [
      climberCountResult,
      attemptCountResult,
      finalistCountResult,
      finalAttemptCountResult,
      qualifierRoundResult,
      targetClimberResult,
    ] = await Promise.all([
      supabase.from("climbers").select("id", { count: "exact", head: true }).eq("competition_id", competitionRow.id),
      supabase.from("qualifier_attempts").select("id", { count: "exact", head: true }).eq("competition_id", competitionRow.id),
      supabase.from("competition_finalists").select("climber_id", { count: "exact", head: true }).eq("competition_id", competitionRow.id),
      supabase.from("final_attempts").select("id", { count: "exact", head: true }).eq("competition_id", competitionRow.id),
      supabase
        .from("competition_rounds")
        .select("id, name")
        .eq("competition_id", competitionRow.id)
        .eq("scoring_bucket", "qualifier")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("climbers")
        .select("id, name, climber_number")
        .eq("competition_id", competitionRow.id)
        .eq("climber_number", DEMO_TARGET_CLIMBER_NUMBER)
        .maybeSingle(),
    ]);

    for (const result of [
      climberCountResult,
      attemptCountResult,
      finalistCountResult,
      finalAttemptCountResult,
      qualifierRoundResult,
      targetClimberResult,
    ]) {
      if (result.error) {
        throw new Error(result.error.message);
      }
    }

    const targetClimber = targetClimberResult.data as { id: string; name: string; climber_number: string } | null;
    const qualifierRound = qualifierRoundResult.data as { id: string; name: string | null } | null;
    const { data: targetAttempt, error: targetAttemptError } = targetClimber
      ? await supabase
          .from("qualifier_attempts")
          .select("attempt_count, topped, zone, attempts_to_top, attempts_to_zone")
          .eq("competition_id", competitionRow.id)
          .eq("round_id", qualifierRound?.id ?? "")
          .eq("climber_id", targetClimber.id)
          .eq("climb_number", DEMO_TARGET_CLIMB_NUMBER)
          .maybeSingle()
      : { data: null, error: null };

    if (targetAttemptError) {
      throw new Error(targetAttemptError.message);
    }

    const attempt = targetAttempt as DemoTargetAttemptState;
    const climberCount = getSingleCount(climberCountResult);
    const attemptCount = getSingleCount(attemptCountResult);
    const finalistCount = getSingleCount(finalistCountResult);
    const finalAttemptCount = getSingleCount(finalAttemptCountResult);
    const dataPopulated = climberCount > 0 && attemptCount > 0 && Boolean(targetClimber && targetAttempt);
    const finalsStarted = Boolean(competitionRow.finals_started_at) || ["finals_open", "finals_closed", "results"].includes(competitionRow.current_phase ?? "");
    const publicReady = finalistCount > 0 && finalAttemptCount >= finalistCount && finalsStarted;

    return NextResponse.json({
      ok: true,
      competition: {
        id: competitionRow.id,
        slug: competitionRow.slug,
      },
      target: {
        climberId: targetClimber?.id ?? null,
        climberNumber: DEMO_TARGET_CLIMBER_NUMBER,
        name: targetClimber?.name ?? null,
        climbNumber: DEMO_TARGET_CLIMB_NUMBER,
        roundName: qualifierRound?.name ?? "Qualifier",
        before: DEMO_TARGET_BEFORE_LABEL,
        after: DEMO_TARGET_AFTER_LABEL,
        attempt,
        seeded: isDemoTargetSeeded(attempt),
        corrected: isDemoTargetCorrected(attempt),
      },
      counts: {
        climbers: climberCount,
        attempts: attemptCount,
        finalists: finalistCount,
        finalAttempts: finalAttemptCount,
      },
      progress: {
        eventReady: true,
        dataPopulated,
        keyScoreCorrected: isDemoTargetCorrected(attempt),
        organizerAdvanced: dataPopulated && finalistCount > 0 && finalsStarted,
        publicReady,
      },
    });
  } catch (error) {
    console.error("DEMO STATE ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load demo state." },
      { status: 500 }
    );
  }
}
