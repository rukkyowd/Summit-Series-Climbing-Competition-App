import { describe, expect, it } from "vitest";
import { GUIDED_DEMO_PRESET_ID } from "./competition-presets";
import {
  buildGuidedDemoSetupModel,
  normalizeGuidedDemoEventSetup,
} from "./guided-demo-setup";

describe("guided demo setup model", () => {
  it("uses the locked Youth Championship with Finals preset", () => {
    const model = buildGuidedDemoSetupModel();

    expect(model.preset.id).toBe(GUIDED_DEMO_PRESET_ID);
    expect(model.preset.name).toBe("Youth Championship with Finals");
    expect(model.presetLocked).toBe(true);
    expect(model.preset.finalsEnabled).toBe(true);
    expect(model.defaultEventSetup.presetId).toBe(GUIDED_DEMO_PRESET_ID);
    expect(model.defaultEventSetup.maxClimbers).toBe(150);
  });

  it("generates the same setup sections the user reviews in Act 1", () => {
    const model = buildGuidedDemoSetupModel();

    expect(model.steps.map((step) => step.id)).toEqual([
      "basics",
      "preset",
      "categories",
      "finals",
      "rounds",
      "schedule",
      "registration",
      "create",
    ]);
    expect(model.categories.map((category) => category.displayName)).toContain("Men / Youth D");
    expect(model.categories.map((category) => category.displayName)).toContain("Women / Junior");
    expect(model.finalsEligibleCategories.map((category) => category.displayName)).toEqual([
      "Men / Youth B",
      "Women / Youth B",
      "Men / Youth A",
      "Women / Youth A",
      "Men / Junior",
      "Women / Junior",
    ]);
  });

  it("includes finals-capable rounds and schedule blocks", () => {
    const model = buildGuidedDemoSetupModel();

    expect(model.rounds.map((round) => round.title)).toEqual(["Qualifier round", "Finals round"]);
    expect(model.scheduleBlocks.some((block) => block.phaseType === "isolation")).toBe(true);
    expect(model.scheduleBlocks.some((block) => block.phaseType === "observation")).toBe(true);
    expect(model.scheduleBlocks.some((block) => block.phaseType === "finals_round")).toBe(true);
    expect(model.scheduleBlocks.some((block) => block.label.toLowerCase().includes("awards"))).toBe(true);
  });

  it("locks submitted guided setup back to the finals-capable preset", () => {
    const normalized = normalizeGuidedDemoEventSetup({
      name: "  Summer Scramble  ",
      locationName: "  Coastal Gym  ",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      description: "  Demo notes  ",
      maxClimbers: 20,
      presetId: "community_scramble",
    });

    expect(normalized.name).toBe("Summer Scramble");
    expect(normalized.locationName).toBe("Coastal Gym");
    expect(normalized.presetId).toBe(GUIDED_DEMO_PRESET_ID);
    expect(normalized.maxClimbers).toBe(150);
  });
});
