import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COMPETITION_SLUG } from "@/lib/demo";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

export async function GET(request: NextRequest) {
  const scenario = request.nextUrl.searchParams.get("scenario");
  if (scenario !== "competitor") {
    return NextResponse.json({ error: "Unsupported demo scorecard scenario." }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("id, slug, is_demo")
      .eq("slug", DEMO_COMPETITION_SLUG)
      .maybeSingle();

    if (competitionError) {
      throw new Error(competitionError.message);
    }

    if (!competition?.is_demo) {
      return NextResponse.json({ error: "Canonical demo competition not found." }, { status: 404 });
    }

    const { data: climbers, error: climbersError } = await supabase
      .from("climbers")
      .select("id, name, climber_number, access_token")
      .eq("competition_id", competition.id)
      .order("climber_number", { ascending: true });

    if (climbersError) {
      throw new Error(climbersError.message);
    }

    if (!climbers?.length) {
      return NextResponse.json({ error: "No seeded demo climbers are available yet." }, { status: 404 });
    }

    const { data: attempts, error: attemptsError } = await supabase
      .from("qualifier_attempts")
      .select("climber_id, attempt_count")
      .eq("competition_id", competition.id);

    if (attemptsError) {
      throw new Error(attemptsError.message);
    }

    const attemptTotals = new Map<string, number>();
    attempts?.forEach((attempt) => {
      attemptTotals.set(
        attempt.climber_id,
        (attemptTotals.get(attempt.climber_id) ?? 0) + (attempt.attempt_count ?? 0)
      );
    });

    const chosen = [...climbers].sort((left, right) => {
      const rightAttempts = attemptTotals.get(right.id) ?? 0;
      const leftAttempts = attemptTotals.get(left.id) ?? 0;
      if (rightAttempts !== leftAttempts) {
        return rightAttempts - leftAttempts;
      }
      return left.climber_number.localeCompare(right.climber_number, undefined, { numeric: true });
    })[0];

    return NextResponse.json({
      token: chosen.access_token,
      competitionSlug: competition.slug,
      climber: {
        id: chosen.id,
        name: chosen.name,
        climberNumber: chosen.climber_number,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create the competitor demo session.",
      },
      { status: 500 }
    );
  }
}
