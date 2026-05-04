import { describe, expect, it } from "vitest";
import {
  CASCADE_CUP_DEMO_COUNTING_CLIMBS,
  CASCADE_CUP_DEMO_FINALS_CUTOFF,
  CASCADE_CUP_DEMO_FINALS_PROBLEM_COUNT,
  CASCADE_CUP_DEMO_NAME,
  CASCADE_CUP_DEMO_QUALIFIER_PROBLEMS,
  buildCascadeCupScorecardUrl,
  buildCascadeCupRounds,
  buildCascadeCupScheduleBlocks,
  getCascadeCupCategoryRows,
  getCascadeCupCreateFormDefaults,
  getCascadeCupSeedClimbers,
  isCascadeCupScenario,
} from "./cascade-cup-demo";

describe("Cascade Cup demo scenario", () => {
  it("prefills the current-year Cascade Cup real creation form defaults", () => {
    const defaults = getCascadeCupCreateFormDefaults();

    expect(defaults).toMatchObject({
      name: CASCADE_CUP_DEMO_NAME,
      format: "five_on_five_off",
      location: "North Summit Climbing",
      startDate: "2026-05-10",
      endDate: "2026-05-10",
      maxClimbers: 80,
    });
    expect(defaults.name).toBe("Cascade Cup 2026 — Youth");
  });

  it("recognizes only the Cascade Cup scenario key", () => {
    expect(isCascadeCupScenario("cascade-cup")).toBe(true);
    expect(isCascadeCupScenario("other-demo")).toBe(false);
    expect(isCascadeCupScenario(undefined)).toBe(false);
  });

  it("builds the seeded athlete scorecard URL without a reseed request", () => {
    const url = new URL(
      buildCascadeCupScorecardUrl("cascade-cup-2026-youth", "competition-1"),
      "https://example.test"
    );

    expect(url.pathname).toBe("/c/cascade-cup-2026-youth/scorecard");
    expect(url.searchParams.get("demo")).toBe("1");
    expect(url.searchParams.get("token")).toBe("scorecard-demo-seed-competition-1-104");
  });

  it("creates six youth championship categories for the sales demo", () => {
    const categories = getCascadeCupCategoryRows("competition-1");

    expect(categories.map((category) => category.display_name)).toEqual([
      "Men / Youth B",
      "Men / Youth A",
      "Men / Junior",
      "Women / Youth B",
      "Women / Youth A",
      "Women / Junior",
    ]);
  });

  it("creates a finals-capable qualifier and finals round", () => {
    const rounds = buildCascadeCupRounds({
      id: "competition-1",
      format: "five_on_five_off",
      current_phase: "qualifier_open",
    });

    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toMatchObject({
      round_type: "qualifier",
      scoring_bucket: "qualifier",
      problem_count: CASCADE_CUP_DEMO_QUALIFIER_PROBLEMS,
      counting_climbs: CASCADE_CUP_DEMO_COUNTING_CLIMBS,
      advancement_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
      is_active: true,
    });
    expect(rounds[1]).toMatchObject({
      round_type: "finals",
      scoring_bucket: "finals",
      problem_count: CASCADE_CUP_DEMO_FINALS_PROBLEM_COUNT,
      advancement_source_round_id: rounds[0].id,
      is_active: false,
    });
  });

  it("creates the Cascade Cup schedule blocks that line up with the rounds", () => {
    const categories = getCascadeCupCategoryRows("competition-1");
    const rounds = buildCascadeCupRounds({
      id: "competition-1",
      format: "five_on_five_off",
      current_phase: "qualifier_open",
    });
    const blocks = buildCascadeCupScheduleBlocks(
      "competition-1",
      rounds,
      categories.map((category) => category.id)
    );

    expect(blocks.map((block) => block.label)).toEqual([
      "Check-in",
      "Rules briefing",
      "Cascade Cup qualifier",
      "Finals",
      "Results / Awards",
    ]);
    expect(blocks.find((block) => block.phase_type === "qualifier_round")).toMatchObject({
      round_id: rounds[0].id,
      is_active: true,
    });
    expect(blocks.find((block) => block.phase_type === "finals_round")).toMatchObject({
      round_id: rounds[1].id,
      is_active: false,
    });
  });

  it("seeds 48 climbers with Maya Chen as #104", () => {
    const climbers = getCascadeCupSeedClimbers();

    expect(climbers).toHaveLength(48);
    expect(new Set(climbers.map((climber) => climber.number)).size).toBe(48);
    expect(climbers.find((climber) => climber.number === "104")).toMatchObject({
      name: "Maya Chen",
      target: true,
      genderDivision: "Men",
      ageGroup: "Youth B",
    });
  });
});
