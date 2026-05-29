import SiteHeader from "@/components/site-header";
import { DemoEntry } from "@/components/demo-entry";
import { getDemoSetupValidation } from "@/lib/demo-setup-validation";
import {
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NUMBER,
  isDemoTargetCorrected,
  type DemoTargetAttemptState,
} from "@/lib/demo-scenario";
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
        const [
          categoriesResult,
          roundsResult,
          scheduleResult,
          climbersResult,
          attemptsResult,
          finalistsResult,
          finalAttemptsResult,
          qualifierRoundResult,
          targetClimberResult,
        ] =
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
              .select("climber_id")
              .eq("competition_id", competitionId)
              .limit(1),
            supabase
              .from("final_attempts")
              .select("id")
              .eq("competition_id", competitionId)
              .limit(1),
            supabase
              .from("competition_rounds")
              .select("id, name")
              .eq("competition_id", competitionId)
              .eq("scoring_bucket", "qualifier")
              .order("sort_order", { ascending: true })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("climbers")
              .select("id, name, climber_number")
              .eq("competition_id", competitionId)
              .eq("climber_number", DEMO_TARGET_CLIMBER_NUMBER)
              .maybeSingle(),
          ]);

        const targetClimber = targetClimberResult.data as { id: string; name: string; climber_number: string } | null;
        const qualifierRound = qualifierRoundResult.data as { id: string; name: string | null } | null;
        const { data: targetAttempt } =
          targetClimber && qualifierRound?.id
            ? await supabase
                .from("qualifier_attempts")
                .select("attempt_count, topped, zone, attempts_to_top, attempts_to_zone")
                .eq("competition_id", competitionId)
                .eq("round_id", qualifierRound.id)
                .eq("climber_id", targetClimber.id)
                .eq("climb_number", DEMO_TARGET_CLIMB_NUMBER)
                .maybeSingle()
            : { data: null };

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
        const seeded =
          (climbersResult.data?.length ?? 0) >= 10 &&
          (attemptsResult.data?.length ?? 0) > 0 &&
          Boolean(targetClimber && targetAttempt);
        const keyScoreCorrected = isDemoTargetCorrected(targetAttempt as DemoTargetAttemptState);
        const publicReady =
          (finalistsResult.data?.length ?? 0) > 0 &&
          (finalAttemptsResult.data?.length ?? 0) > 0 &&
          ["finals_open", "finals_closed", "results"].includes(String(competition.current_phase ?? ""));
        const organizerAdvanced =
          seeded &&
          (finalistsResult.data?.length ?? 0) > 0 &&
          ["finals_open", "finals_closed", "results"].includes(String(competition.current_phase ?? ""));

        return {
          id: competitionId,
          slug: competition.slug as string,
          name: competition.name as string,
          created_at: (competition.created_at as string | null) ?? null,
          canSkipToJudge: setupValidation.canContinueToJudge && seeded,
          canSkipToResults: publicReady,
          progress: {
            eventReady: true,
            dataPopulated: seeded,
            keyScoreCorrected,
            organizerAdvanced,
            publicReady,
          },
        };
      })
    );
  } catch {
    return [];
  }
}

export default async function DemoPage() {
  const demos = await getDemoCompetitions();

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light />
        <DemoEntry demos={demos} />
      </div>
    </main>
  );
}
