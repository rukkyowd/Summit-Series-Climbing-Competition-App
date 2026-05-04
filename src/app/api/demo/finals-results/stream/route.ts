import { NextResponse, type NextRequest } from "next/server";
import { buildDemoFinalScore } from "@/lib/demo-seed-data";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DemoFinalsStreamRequest = {
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

type AttemptRow = {
  competition_id: string;
  round_id: string;
  climber_id: string;
  climb_number: number;
  top: boolean;
  zone: boolean;
  attempts_to_top: number | null;
  attempts_to_zone: number | null;
  entered_by: string;
  updated_at: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sseChunk(event: string, data: Record<string, unknown>) {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function buildOrderedAttempts(
  finalistRows: FinalistRow[],
  problemCount: number,
  competitionId: string,
  roundId: string,
  timestamp: string
): AttemptRow[] {
  const ordered: AttemptRow[] = [];

  for (let problemIndex = 0; problemIndex < problemCount; problemIndex += 1) {
    const climbNumber = problemIndex + 1;

    for (let finalistIndex = 0; finalistIndex < finalistRows.length; finalistIndex += 1) {
      const finalist = finalistRows[finalistIndex];
      const score = buildDemoFinalScore({
        competitionId,
        roundId,
        climberId: finalist.climber_id,
        qualifierRank: finalist.qualifier_rank,
        climbingOrder: finalist.climbing_order,
        finalistIndex,
        climbNumber,
        problemCount,
      });

      ordered.push({
        competition_id: competitionId,
        round_id: roundId,
        climber_id: finalist.climber_id,
        climb_number: climbNumber,
        top: score.top,
        zone: score.zone,
        attempts_to_top: score.attempts_to_top,
        attempts_to_zone: score.attempts_to_zone,
        entered_by: "staff",
        updated_at: timestamp,
      });
    }
  }

  return ordered;
}

export async function POST(request: NextRequest) {
  let body: DemoFinalsStreamRequest;

  try {
    body = (await request.json()) as DemoFinalsStreamRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!body.competitionId) {
    return NextResponse.json({ ok: false, error: "competitionId is required." }, { status: 400 });
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data: competition, error: competitionError } = await supabase
    .from("competitions")
    .select("id, is_demo, finals_problem_count")
    .eq("id", body.competitionId)
    .maybeSingle();

  if (competitionError) {
    return NextResponse.json({ ok: false, error: competitionError.message }, { status: 500 });
  }

  const competitionRow = competition as CompetitionRow | null;
  if (!competitionRow) {
    return NextResponse.json({ ok: false, error: "Competition not found." }, { status: 404 });
  }

  if (competitionRow.is_demo !== true) {
    return NextResponse.json(
      { ok: false, error: "Refusing to stream finals results into a non-demo competition." },
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
    return NextResponse.json({ ok: false, error: roundError.message }, { status: 500 });
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
    return NextResponse.json({ ok: false, error: finalistsError.message }, { status: 500 });
  }

  const finalistRows = (finalists ?? []) as FinalistRow[];
  if (!finalistRows.length) {
    return NextResponse.json(
      { ok: false, error: "Demo finalists must be advanced before finals results can be streamed." },
      { status: 409 }
    );
  }

  const { error: deleteError } = await supabase
    .from("final_attempts")
    .delete()
    .eq("competition_id", competitionRow.id)
    .eq("round_id", finalsRoundRow.id);

  if (deleteError) {
    return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  const problemCount = Math.max(
    1,
    Math.min(finalsRoundRow.problem_count ?? competitionRow.finals_problem_count ?? 4, 8)
  );
  const timestamp = new Date().toISOString();
  const orderedAttempts = buildOrderedAttempts(
    finalistRows,
    problemCount,
    competitionRow.id,
    finalsRoundRow.id,
    timestamp
  );
  const scoreIntervalMs = 400;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(sseChunk("start", { total: orderedAttempts.length }));

        for (let index = 0; index < orderedAttempts.length; index += 1) {
          const attempt = orderedAttempts[index];
          const { error: insertError } = await supabase.from("final_attempts").insert(attempt);

          if (insertError) {
            controller.enqueue(sseChunk("error", { message: insertError.message }));
            controller.close();
            return;
          }

          controller.enqueue(
            sseChunk("score", {
              index,
              climber_id: attempt.climber_id,
              climb_number: attempt.climb_number,
              top: attempt.top,
              zone: attempt.zone,
            })
          );

          if (index < orderedAttempts.length - 1) {
            await sleep(scoreIntervalMs);
          }
        }

        controller.enqueue(sseChunk("complete", { inserted: orderedAttempts.length }));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Streaming error.";
        controller.enqueue(sseChunk("error", { message }));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
