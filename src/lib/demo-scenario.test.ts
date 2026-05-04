import { describe, expect, it } from "vitest";
import {
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NUMBER,
  buildDemoJudgeUrl,
  isDemoTargetCorrected,
  isDemoTargetSeeded,
} from "./demo-scenario";

describe("demo scenario helpers", () => {
  it("builds judge links that preselect the correction target and Boulder 3", () => {
    expect(buildDemoJudgeUrl("demo-comp", "climber-103")).toBe(
      `/staff/c/demo-comp/judge?demo=act2&boulder=${DEMO_TARGET_CLIMB_NUMBER}&climberId=climber-103`
    );
  });

  it("recognizes the seeded scoring mistake as Top in 3", () => {
    expect(
      isDemoTargetSeeded({
        attempt_count: 3,
        topped: true,
        zone: true,
        attempts_to_top: 3,
        attempts_to_zone: 1,
      })
    ).toBe(true);
  });

  it("only completes the judge act after the exact corrected score is saved", () => {
    expect(
      isDemoTargetCorrected({
        attempt_count: 3,
        topped: true,
        zone: true,
        attempts_to_top: 3,
        attempts_to_zone: 1,
      })
    ).toBe(false);

    expect(
      isDemoTargetCorrected({
        attempt_count: 1,
        topped: true,
        zone: true,
        attempts_to_top: null,
        attempts_to_zone: 1,
      })
    ).toBe(false);

    expect(
      isDemoTargetCorrected({
        attempt_count: 1,
        topped: true,
        zone: true,
        attempts_to_top: 1,
        attempts_to_zone: 1,
      })
    ).toBe(true);
  });

  it("documents the stable target number used by seed/state routes", () => {
    expect(DEMO_TARGET_CLIMBER_NUMBER).toBe("103");
  });
});
