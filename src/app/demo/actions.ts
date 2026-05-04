"use server";

import { revalidatePath } from "next/cache";
import {
  CASCADE_CUP_DEMO_END_DATE,
  CASCADE_CUP_DEMO_LOCATION,
  CASCADE_CUP_DEMO_REGISTRATION_CLOSES_AT,
  CASCADE_CUP_DEMO_REGISTRATION_OPENS_AT,
  CASCADE_CUP_DEMO_SCENARIO,
  CASCADE_CUP_DEMO_START_DATE,
} from "@/lib/cascade-cup-demo";
import { handleAdminCompetitionAction } from "@/lib/server-admin-competition-actions";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

const GUIDED_SANDBOX_DEMO_NAME = "Summit Sandbox Demo";

export type DemoLoadActionResult =
  | {
      ok: true;
      created: boolean;
      demo: {
        id: string;
        slug: string;
        name: string;
        created_at: string | null;
      };
    }
  | {
      ok: false;
      error: string;
    };

export type DemoSimulationScoreActionInput = {
  competitionId: string;
  climberId: string;
  climbNumber: number;
  attemptCount: number;
  topped: boolean;
  zone: boolean;
  attemptsToTop: number | null;
  attemptsToZone: number | null;
};

export type DemoSimulationScoreActionResult =
  | {
      ok: true;
      mode: "demo-service-role";
    }
  | {
      ok: false;
      error: string;
    };

type DemoCompetitionRow = {
  id: string;
  slug: string;
  name: string | null;
  created_at: string | null;
};

type DemoCompetitionGuardRow = {
  id: string;
  is_demo: boolean;
  current_phase: string | null;
};

function toDemoSummary(row: DemoCompetitionRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name ?? GUIDED_SANDBOX_DEMO_NAME,
    created_at: row.created_at ?? null,
  };
}

async function getExistingSandboxDemo() {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("competitions")
    .select("id, slug, name, created_at")
    .eq("is_demo", true)
    .eq("name", GUIDED_SANDBOX_DEMO_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DemoCompetitionRow | null;
}

async function getCompetitionById(id: string) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("competitions")
    .select("id, slug, name, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DemoCompetitionRow | null;
}

export async function loadDemoEventAction(): Promise<DemoLoadActionResult> {
  try {
    const existing = await getExistingSandboxDemo();
    if (existing) {
      return {
        ok: true,
        created: false,
        demo: toDemoSummary(existing),
      };
    }

    const result = await handleAdminCompetitionAction({
      action: "create",
      input: {
        name: GUIDED_SANDBOX_DEMO_NAME,
        is_demo: true,
        demo_scenario: CASCADE_CUP_DEMO_SCENARIO,
        location_name: CASCADE_CUP_DEMO_LOCATION,
        start_date: CASCADE_CUP_DEMO_START_DATE,
        end_date: CASCADE_CUP_DEMO_END_DATE,
        registration_opens_at: CASCADE_CUP_DEMO_REGISTRATION_OPENS_AT,
        registration_closes_at: CASCADE_CUP_DEMO_REGISTRATION_CLOSES_AT,
        description:
          "Guided sandbox event for exploring creation, registration, live scoring, and public leaderboards in the real workflow.",
      },
    });

    const competitionId = typeof result.competitionId === "string" ? result.competitionId : "";
    if (!competitionId) {
      throw new Error("Demo event was created but no competition id was returned.");
    }

    const created = await getCompetitionById(competitionId);
    if (!created) {
      throw new Error("Demo event was created but could not be loaded.");
    }

    revalidatePath("/demo");

    return {
      ok: true,
      created: true,
      demo: toDemoSummary(created),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to load the demo event.",
    };
  }
}

function createClientEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `demo-sim-${crypto.randomUUID()}`;
  }

  return `demo-sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export async function submitDemoSimulationScoreAction(
  input: DemoSimulationScoreActionInput
): Promise<DemoSimulationScoreActionResult> {
  try {
    if (!input.competitionId || !input.climberId || !isPositiveInteger(input.climbNumber)) {
      throw new Error("Missing demo score details.");
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("id, is_demo, current_phase")
      .eq("id", input.competitionId)
      .maybeSingle();

    if (competitionError) {
      throw new Error(competitionError.message);
    }

    const competitionRow = competition as DemoCompetitionGuardRow | null;
    if (!competitionRow) {
      throw new Error("Demo competition not found.");
    }

    if (competitionRow.is_demo !== true) {
      throw new Error("Refusing to simulate scores for a non-demo competition.");
    }

    if (competitionRow.current_phase !== "qualifier_open" && competitionRow.current_phase !== "wall_reset") {
      throw new Error("Demo qualifier scoring is not open.");
    }

    const [{ data: climber, error: climberError }, { data: round, error: roundError }] = await Promise.all([
      supabase
        .from("climbers")
        .select("id")
        .eq("competition_id", input.competitionId)
        .eq("id", input.climberId)
        .maybeSingle(),
      supabase
        .from("competition_rounds")
        .select("id")
        .eq("competition_id", input.competitionId)
        .eq("scoring_bucket", "qualifier")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (climberError) {
      throw new Error(climberError.message);
    }
    if (roundError) {
      throw new Error(roundError.message);
    }
    if (!climber) {
      throw new Error("Demo athlete not found.");
    }
    if (!round?.id) {
      throw new Error("No active demo qualifier round is available.");
    }

    const { error: scoreError } = await supabase.rpc("append_qualifier_score_event", {
      p_competition_id: input.competitionId,
      p_round_id: round.id,
      p_climber_id: input.climberId,
      p_climb_number: input.climbNumber,
      p_attempt_count: Math.max(0, input.attemptCount),
      p_topped: input.topped,
      p_zone: input.zone,
      p_attempts_to_top: input.attemptsToTop,
      p_attempts_to_zone: input.attemptsToZone,
      p_entered_by: "staff",
      p_client_event_id: createClientEventId(),
      p_scored_at: new Date().toISOString(),
      p_judge_device_id: "guided-demo-sandbox",
      p_judge_session_id: "guided-demo-live-sim",
      p_replayed_from_offline: false,
    });

    if (scoreError) {
      throw new Error(scoreError.message);
    }

    return { ok: true, mode: "demo-service-role" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to submit the demo score.",
    };
  }
}
