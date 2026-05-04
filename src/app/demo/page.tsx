import SiteHeader from "@/components/site-header";
import { DemoEntry } from "@/components/demo-entry";
import { getDemoSetupValidation } from "@/lib/demo-setup-validation";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

async function getDemoCompetitions() {
  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("competitions")
      .select(
        "id, slug, name, created_at, format, has_finals, location_name, start_date, end_date, total_climbs, qualifier_counting_climbs, finals_cutoff, finals_problem_count, qualifier_eligible_age_groups, finals_eligible_age_groups, current_phase"
      )
      .eq("is_demo", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return Promise.all(
      (data ?? []).map(async (competition) => {
        const competitionId = competition.id as string;
        const [categoriesResult, roundsResult, scheduleResult, climbersResult, attemptsResult, finalistsResult] =
          await Promise.all([
            supabase
              .from("competition_categories")
              .select("id, age_group")
              .eq("competition_id", competitionId),
            supabase
              .from("competition_rounds")
              .select("id, round_type, scoring_bucket, is_enabled, problem_count, counting_climbs, finals_cutoff, advancement_source_round_id, advancement_cutoff")
              .eq("competition_id", competitionId),
            supabase
              .from("competition_schedule_blocks")
              .select("id, round_id, phase_type")
              .eq("competition_id", competitionId),
            supabase
              .from("climbers")
              .select("id")
              .eq("competition_id", competitionId)
              .limit(20),
            supabase
              .from("qualifier_attempts")
              .select("id")
              .eq("competition_id", competitionId)
              .limit(1),
            supabase
              .from("competition_finalists")
              .select("id")
              .eq("competition_id", competitionId)
              .limit(1),
          ]);

        const setupValidation = getDemoSetupValidation(
          {
            ...competition,
            categories: categoriesResult.data ?? [],
            rounds: roundsResult.data ?? [],
            schedule_blocks: scheduleResult.data ?? [],
          },
          {
            requirePreset: false,
            saved: true,
          }
        );
        const seeded = (climbersResult.data?.length ?? 0) >= 10 && (attemptsResult.data?.length ?? 0) > 0;
        const publicReady =
          (finalistsResult.data?.length ?? 0) > 0 &&
          ["finals_open", "finals_closed", "results"].includes(String(competition.current_phase ?? ""));

        return {
          id: competitionId,
          slug: competition.slug as string,
          name: competition.name as string,
          created_at: (competition.created_at as string | null) ?? null,
          canSkipToJudge: setupValidation.canContinueToJudge && seeded,
          canSkipToResults: publicReady,
        };
      })
    );
  } catch {
    return [];
  }
}

export default async function DemoPage() {
  const demos = await getDemoCompetitions();
  const latestDemo = demos[0] ?? null;

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light />
        <DemoEntry latestDemo={latestDemo} />
      </div>
    </main>
  );
}
