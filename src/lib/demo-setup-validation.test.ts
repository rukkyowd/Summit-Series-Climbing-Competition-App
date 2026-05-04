import { describe, expect, it } from "vitest";
import { getDemoSetupValidation } from "@/lib/demo-setup-validation";
import type { Competition } from "@/lib/scoring";

function buildCompetition(overrides: Partial<Competition> = {}): Competition {
  const competitionId = "competition-1";

  return {
    id: competitionId,
    slug: "summit-demo",
    name: "Summit Series Demo",
    is_demo: true,
    status: "active",
    format: "scramble",
    current_phase: "qualifier_open",
    discipline_label: "Boulder",
    stage_mode: "qualifier",
    location_name: "Summit Gym",
    start_date: "2026-06-01",
    end_date: "2026-06-01",
    registration_opens_at: null,
    registration_closes_at: null,
    description: "",
    hero_image_url: "",
    official_event_url: "",
    official_registration_url: "",
    official_schedule_url: "",
    total_climbs: 6,
    max_climbers: 80,
    qualifier_counting_climbs: 4,
    has_finals: true,
    finals_cutoff: 6,
    finals_tie_advances: false,
    qualifier_eligible_age_groups: ["Open"],
    finals_eligible_age_groups: ["Open"],
    qualifier_locked_at: null,
    finals_started_at: null,
    finals_problem_count: 4,
    categories: [
      {
        id: "Men::Open",
        competition_id: competitionId,
        gender_division: "Men",
        age_group: "Open",
        display_name: "Men / Open",
        sort_order: 1,
      },
    ],
    rounds: [
      {
        id: "round-qualifier",
        competition_id: competitionId,
        round_number: 1,
        sort_order: 1,
        name: "Qualifier",
        round_type: "qualifier",
        format: "scramble",
        status: "pending",
        runtime_phase: "qualifier_open",
        is_enabled: true,
        is_active: false,
        activated_at: null,
        problem_count: 6,
        counting_climbs: 4,
        finals_cutoff: 6,
        eligible_category_ids: [],
        advancement_source_round_id: null,
        advancement_cutoff: null,
        scoring_bucket: "qualifier",
        scoring_config: {},
        started_at: null,
        closed_at: null,
      },
      {
        id: "round-finals",
        competition_id: competitionId,
        round_number: 2,
        sort_order: 2,
        name: "Finals",
        round_type: "finals",
        format: "ifsc_finals_format",
        status: "pending",
        runtime_phase: "finals_open",
        is_enabled: true,
        is_active: false,
        activated_at: null,
        problem_count: 4,
        counting_climbs: null,
        finals_cutoff: 6,
        eligible_category_ids: [],
        advancement_source_round_id: "round-qualifier",
        advancement_cutoff: 6,
        scoring_bucket: "finals",
        scoring_config: {},
        started_at: null,
        closed_at: null,
      },
    ],
    schedule_blocks: [
      {
        id: "schedule-qualifier",
        competition_id: competitionId,
        round_id: "round-qualifier",
        sort_order: 1,
        label: "Qualifier",
        phase_type: "qualifier_round",
        audience_label: "All athletes",
        is_active: false,
        start_time: "10:00 AM",
        end_time: "12:00 PM",
        capacity: 24,
        eligible_category_ids: [],
      },
      {
        id: "schedule-finals",
        competition_id: competitionId,
        round_id: "round-finals",
        sort_order: 2,
        label: "Finals",
        phase_type: "finals_round",
        audience_label: "Finalists",
        is_active: false,
        start_time: "2:00 PM",
        end_time: "3:00 PM",
        capacity: 12,
        eligible_category_ids: [],
      },
    ],
    ...overrides,
  };
}

describe("getDemoSetupValidation", () => {
  it("requires dates in the basics step", () => {
    const validation = getDemoSetupValidation(buildCompetition({ start_date: null }), {
      selectedPresetId: "custom",
      saved: true,
    });

    expect(validation.steps.find((step) => step.id === "basics")).toMatchObject({
      complete: false,
      blockingMessage: "Complete event name, link, location, start date, and end date.",
    });
  });

  it("requires either a preset or explicit Custom setup", () => {
    const missingPreset = getDemoSetupValidation(buildCompetition(), { saved: true });
    const customPreset = getDemoSetupValidation(buildCompetition(), { selectedPresetId: "custom", saved: true });

    expect(missingPreset.steps.find((step) => step.id === "presets")).toMatchObject({
      complete: false,
      blockingMessage: "Choose a preset or Custom setup before continuing.",
    });
    expect(customPreset.steps.find((step) => step.id === "presets")).toMatchObject({ complete: true });
  });

  it("requires at least one selected category", () => {
    const validation = getDemoSetupValidation(
      buildCompetition({ qualifier_eligible_age_groups: [], finals_eligible_age_groups: [] }),
      { selectedPresetId: "custom", saved: true }
    );

    expect(validation.firstBlockingMessage).toBe("You must add at least one category");
  });

  it("requires a finals scoring round", () => {
    const competition = buildCompetition({
      rounds: buildCompetition().rounds?.filter((round) => round.scoring_bucket !== "finals"),
    });
    const validation = getDemoSetupValidation(competition, { selectedPresetId: "custom", saved: true });

    expect(validation.steps.find((step) => step.id === "stages")).toMatchObject({
      complete: false,
      blockingMessage: "Add a Finals stage.",
    });
  });

  it("requires a finals schedule block linked to the finals round", () => {
    const competition = buildCompetition({
      schedule_blocks: buildCompetition().schedule_blocks.filter((block) => block.phase_type !== "finals_round"),
    });
    const validation = getDemoSetupValidation(competition, { selectedPresetId: "custom", saved: true });

    expect(validation.steps.find((step) => step.id === "schedule")).toMatchObject({
      complete: false,
      blockingMessage: "Add a Finals schedule block linked to the Finals stage.",
    });
  });

  it("blocks judge continuation until the saved draft matches persisted event", () => {
    const validation = getDemoSetupValidation(buildCompetition(), {
      selectedPresetId: "custom",
      saved: false,
    });

    expect(validation.steps.find((step) => step.id === "review")).toMatchObject({
      complete: false,
      blockingMessage: "Save the competition before opening the judge panel.",
    });
    expect(validation.canContinueToJudge).toBe(false);
  });

  it("passes when every forced setup step is complete and saved", () => {
    const validation = getDemoSetupValidation(buildCompetition(), {
      selectedPresetId: "custom",
      saved: true,
    });

    expect(validation.firstIncompleteStep).toBeNull();
    expect(validation.canContinueToJudge).toBe(true);
  });
});
