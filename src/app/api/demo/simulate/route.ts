import { NextResponse, type NextRequest } from "next/server";
import { normalizeQualifierAttemptInput } from "@/lib/attempts";
import { DEMO_COMPETITION_SLUG } from "@/lib/demo";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

type DemoSimulationMode = "single_score" | "live_burst";

type DemoSimulationRequest = {
  mode?: DemoSimulationMode;
};

type QualifierAttemptRow = {
  climber_id: string;
  climb_number: number;
  attempt_count: number;
  topped: boolean;
  zone: boolean;
  attempts_to_top: number | null;
  attempts_to_zone: number | null;
};

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export async function POST(request: NextRequest) {
  let payload: DemoSimulationRequest;

  try {
    payload = (await request.json()) as DemoSimulationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const mode: DemoSimulationMode =
    payload.mode === "live_burst" ? "live_burst" : "single_score";

  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("id, slug, is_demo, current_phase, total_climbs")
      .eq("slug", DEMO_COMPETITION_SLUG)
      .maybeSingle();

    if (competitionError) {
      throw new Error(competitionError.message);
    }

    if (!competition?.is_demo) {
      return NextResponse.json({ error: "Canonical demo competition not found." }, { status: 404 });
    }

    if (competition.current_phase !== "qualifier_open") {
      return NextResponse.json(
        { error: "Demo score simulation only runs while qualifiers are live." },
        { status: 409 }
      );
    }

    const { data: round, error: roundError } = await supabase
      .from("competition_rounds")
      .select("id, problem_count")
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

    const { data: climbers, error: climbersError } = await supabase
      .from("climbers")
      .select("id, name, climber_number")
      .eq("competition_id", competition.id)
      .order("climber_number", { ascending: true });

    if (climbersError) {
      throw new Error(climbersError.message);
    }

    if (!climbers?.length) {
      return NextResponse.json({ error: "No seeded demo climbers are available." }, { status: 404 });
    }

    const { data: attempts, error: attemptsError } = await supabase
      .from("qualifier_attempts")
      .select(
        "competition_id, round_id, climber_id, climb_number, attempt_count, topped, zone, attempts_to_top, attempts_to_zone, entered_by, updated_at"
      )
      .eq("competition_id", competition.id)
      .eq("round_id", round.id);

    if (attemptsError) {
      throw new Error(attemptsError.message);
    }

    const problemCount = Math.max(1, round.problem_count ?? competition.total_climbs ?? 5);
    const attemptMap = new Map<string, QualifierAttemptRow>();
    (attempts ?? []).forEach((attempt) => {
      attemptMap.set(`${attempt.climber_id}:${attempt.climb_number}`, attempt);
    });

    const candidateCells: Array<{ climberId: string; climbNumber: number; existing?: QualifierAttemptRow }> = [];
    climbers.forEach((climber) => {
      for (let climbNumber = 1; climbNumber <= problemCount; climbNumber += 1) {
        const existing = attemptMap.get(`${climber.id}:${climbNumber}`);
        if (!existing?.topped) {
          candidateCells.push({ climberId: climber.id, climbNumber, existing });
        }
      }
    });

    if (!candidateCells.length) {
      return NextResponse.json({ error: "The seeded demo has already topped every available cell." }, { status: 409 });
    }

    const preferred = candidateCells.filter((cell) => !cell.existing?.zone);
    const candidate = randomItem(preferred.length ? preferred : candidateCells);
    const nextAttemptCount = Math.max(1, (candidate.existing?.attempt_count ?? 0) + 1);
    const zoneAlready = Boolean(candidate.existing?.zone);
    const topAlready = Boolean(candidate.existing?.topped);
    const shouldZone =
      zoneAlready ||
      nextAttemptCount >= 4 ||
      Math.random() < (mode === "live_burst" ? 0.62 : 0.54);
    const shouldTop =
      topAlready ||
      (shouldZone &&
        (nextAttemptCount >= 5 || Math.random() < (mode === "live_burst" ? 0.34 : 0.26)));

    const normalized = normalizeQualifierAttemptInput({
      attemptCount: nextAttemptCount,
      topped: shouldTop,
      zone: shouldZone,
      attemptsToTop: shouldTop ? candidate.existing?.attempts_to_top ?? nextAttemptCount : null,
      attemptsToZone: shouldZone ? candidate.existing?.attempts_to_zone ?? nextAttemptCount : null,
    });

    const { data: attempt, error: upsertError } = await supabase
      .from("qualifier_attempts")
      .upsert(
        {
          competition_id: competition.id,
          round_id: round.id,
          climber_id: candidate.climberId,
          climb_number: candidate.climbNumber,
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

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    return NextResponse.json({
      mode,
      attempt,
      climberId: candidate.climberId,
      climbNumber: candidate.climbNumber,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to simulate a live demo score.",
      },
      { status: 500 }
    );
  }
}
