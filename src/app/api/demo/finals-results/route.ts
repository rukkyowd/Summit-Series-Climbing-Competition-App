import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

type DemoFinalsResultsRequest = {
  competitionId?: string;
};

type CompetitionRow = {
  id: string;
  is_demo: boolean;
  finals_problem_count: number | null;
};

type FinalsRoundRow = {
  id: string;
  problem_count: number | null;
};

type FinalistRow = {
  climber_id: string;
  qualifier_rank: number | null;
  climbing_order: number | null;
};

function scoreForFinalist(finalistIndex: number, climbNumber: number) {
  const rankSeed = finalistIndex + 1;
  const topLimit = Math.max(1, 5 - Math.ceil(rankSeed / 2));
  const top = climbNumber <= topLimit;
  const zone = top || (rankSeed + climbNumber) % 4 !== 0;
  const attemptsToTop = top ? 1 + ((rankSeed + climbNumber) % 3) : null;
  const attemptsToZone = zone ? Math.min(attemptsToTop ?? 1 + ((rankSeed + climbNumber) % 2), 4) : null;

  return {
    top,
    zone,
    attempts_to_top: attemptsToTop,
    attempts_to_zone: attemptsToZone,
  };
}

export async function POST(request: NextRequest) {
  let body: DemoFinalsResultsRequest;

  try {
    body = (await request.json()) as DemoFinalsResultsRequest;
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
      .select("id, is_demo, finals_problem_count")
      .eq("id", body.competitionId)
      .maybeSingle();

    if (competitionError) {
      throw new Error(competitionError.message);
    }

    const competitionRow = competition as CompetitionRow | null;
    if (!competitionRow) {
      return NextResponse.json({ ok: false, error: "Competition not found." }, { status: 404 });
    }

    if (competitionRow.is_demo !== true) {
      return NextResponse.json(
        { ok: false, error: "Refusing to seed finals results into a non-demo competition." },
        { status: 403 }
      );
    }

    const { data: finalsRound, error: roundError } = await supabase
      .from("competition_rounds")
      .select("id, problem_count")
      .eq("competition_id", competitionRow.id)
      .or("round_type.eq.finals,scoring_bucket.eq.finals")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (roundError) {
      throw new Error(roundError.message);
    }

    const finalsRoundRow = finalsRound as FinalsRoundRow | null;
    if (!finalsRoundRow?.id) {
      return NextResponse.json({ ok: false, error: "Demo finals round not found." }, { status: 409 });
    }

    const { data: finalists, error: finalistsError } = await supabase
      .from("competition_finalists")
      .select("climber_id, qualifier_rank, climbing_order")
      .eq("competition_id", competitionRow.id)
      .order("climbing_order", { ascending: true })
      .order("qualifier_rank", { ascending: true });

    if (finalistsError) {
      throw new Error(finalistsError.message);
    }

    const finalistRows = (finalists ?? []) as FinalistRow[];
    if (!finalistRows.length) {
      return NextResponse.json(
        { ok: false, error: "Demo finalists must be advanced before finals results can be seeded." },
        { status: 409 }
      );
    }

    const problemCount = Math.max(1, Math.min(finalsRoundRow.problem_count ?? competitionRow.finals_problem_count ?? 4, 8));
    const timestamp = new Date().toISOString();
    const attempts = finalistRows.flatMap((finalist, finalistIndex) =>
      Array.from({ length: problemCount }, (_, problemIndex) => {
        const climbNumber = problemIndex + 1;
        const score = scoreForFinalist(finalistIndex, climbNumber);
        return {
          competition_id: competitionRow.id,
          round_id: finalsRoundRow.id,
          climber_id: finalist.climber_id,
          climb_number: climbNumber,
          top: score.top,
          zone: score.zone,
          attempts_to_top: score.attempts_to_top,
          attempts_to_zone: score.attempts_to_zone,
          entered_by: "staff",
          updated_at: timestamp,
        };
      })
    );

    const { error: upsertError } = await supabase.from("final_attempts").upsert(attempts, {
      onConflict: "competition_id,round_id,climber_id,climb_number",
    });

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    return NextResponse.json({
      ok: true,
      competitionId: competitionRow.id,
      inserted: {
        finalists: finalistRows.length,
        attempts: attempts.length,
      },
    });
  } catch (error) {
    console.error("DEMO FINALS RESULTS ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to seed demo finals results." },
      { status: 500 }
    );
  }
}
