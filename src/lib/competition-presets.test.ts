import { describe, expect, it } from "vitest";
import {
  COMPETITION_PRESETS,
  detectCompetitionPreset,
  getCompetitionPreset,
  getGuidedDemoPreset,
  getPresetFinalsEligibleCategories,
} from "./competition-presets";
import { DEFAULT_COMPETITION, normalizeCompetition } from "./scoring";

describe("competition presets", () => {
  it("provides the recommended preset set plus Custom", () => {
    expect(COMPETITION_PRESETS.map((preset) => preset.name)).toEqual([
      "Community Scramble",
      "Recreational Scramble + Awards",
      "Youth Qualifier Day",
      "Youth Championship with Finals",
      "Open Boulder Championship",
      "IFSC-Style Finals Event",
      "Flash Format Competition",
      "Finals-Only Showcase",
      "Training / Mock Event",
      "Custom",
    ]);
  });

  it("keeps existing generic competitions custom unless they exactly match a preset", () => {
    const existingCompetition = normalizeCompetition(
      {
        ...DEFAULT_COMPETITION,
        id: "existing-comp",
        name: "Existing Saved Competition",
        slug: "existing-saved-competition",
      },
      [],
      [],
      []
    );

    expect(detectCompetitionPreset(existingCompetition).id).toBe("custom");
  });

  it("uses a finals-capable preset for the guided demo story", () => {
    const preset = getGuidedDemoPreset();

    expect(preset.id).toBe("youth_championship_finals");
    expect(preset.finalsEnabled).toBe(true);
    expect(preset.finalsCutoff).toBe(6);
    expect(preset.finalsProblemCount).toBe(4);
    expect(preset.finalsEligibleCategories).toEqual(["Youth B", "Youth A", "Junior"]);
    expect(preset.defaultScheduleBlocks.some((block) => block.phase_type === "isolation")).toBe(true);
    expect(preset.defaultScheduleBlocks.some((block) => block.phase_type === "observation")).toBe(true);
    expect(preset.defaultScheduleBlocks.some((block) => block.phase_type === "finals_round")).toBe(true);
  });

  it("does not use qualifier-only presets for the guided demo story", () => {
    const guidedPreset = getGuidedDemoPreset();
    const qualifierOnlyPresetIds = COMPETITION_PRESETS.filter((preset) => !preset.finalsEnabled).map(
      (preset) => preset.id
    );

    expect(qualifierOnlyPresetIds).toEqual([
      "community_scramble",
      "recreational_scramble_awards",
      "youth_qualifier_day",
    ]);
    expect(qualifierOnlyPresetIds).not.toContain(guidedPreset.id);
  });

  it("keeps existing demo competitions custom so presets do not regenerate demo data", () => {
    const preset = getCompetitionPreset("training_mock_event");
    const demoCompetition = normalizeCompetition(
      {
        ...DEFAULT_COMPETITION,
        id: "canonical-demo",
        name: "Canonical Demo",
        slug: "spring-open-2026-demo",
        is_demo: true,
        format: preset.format,
        has_finals: preset.finalsEnabled,
        finals_cutoff: preset.finalsCutoff,
        finals_tie_advances: preset.tiesAdvanceDefault,
        total_climbs: preset.qualifierProblemCount,
        qualifier_counting_climbs: preset.countingClimbs,
        finals_problem_count: preset.finalsProblemCount,
        qualifier_eligible_age_groups: [...preset.defaultCategories],
        finals_eligible_age_groups: getPresetFinalsEligibleCategories(preset),
      },
      [],
      [],
      []
    );

    expect(detectCompetitionPreset(demoCompetition).id).toBe("custom");
  });

  it("confidently detects a competition that matches a preset contract", () => {
    const preset = getCompetitionPreset("open_boulder_championship");
    const competition = normalizeCompetition(
      {
        ...DEFAULT_COMPETITION,
        id: "open-championship",
        name: "Open Championship",
        slug: "open-championship",
        format: preset.format,
        has_finals: preset.finalsEnabled,
        finals_cutoff: preset.finalsCutoff,
        finals_tie_advances: preset.tiesAdvanceDefault,
        total_climbs: preset.qualifierProblemCount,
        qualifier_counting_climbs: preset.countingClimbs,
        finals_problem_count: preset.finalsProblemCount,
        qualifier_eligible_age_groups: [...preset.defaultCategories],
        finals_eligible_age_groups: getPresetFinalsEligibleCategories(preset),
      },
      [],
      [],
      []
    );

    expect(detectCompetitionPreset(competition).id).toBe("open_boulder_championship");
  });

  it("never exposes finals-eligible categories outside the preset qualifier field", () => {
    for (const preset of COMPETITION_PRESETS) {
      expect(
        getPresetFinalsEligibleCategories(preset).every((ageGroup) =>
          preset.defaultCategories.includes(ageGroup)
        )
      ).toBe(true);
    }
  });
});
