import { describe, expect, it } from "vitest";
import {
  canClimberSelfScoreQualifier,
  canRegisterDuringCompetition,
  getCompetitionPhaseSequenceFromScheduleBlocks,
  getCompetitionPhaseForSchedulePhase,
  getFormatCapabilities,
  normalizeCompetition,
  phaseToStageMode,
} from "./scoring";

describe("format capabilities", () => {
  it("marks scramble as self-scored and not official points", () => {
    expect(getFormatCapabilities("scramble")).toMatchObject({
      selfScoredQualifier: true,
      officialPointsQualifier: false,
      supportsFinals: false,
    });
  });

  it("marks flash as official points with fixed counting climbs", () => {
    expect(getFormatCapabilities("flash_format")).toMatchObject({
      selfScoredQualifier: false,
      officialPointsQualifier: true,
      countingClimbsFixed: true,
      supportsFinals: true,
    });
  });
});

describe("competition phases", () => {
  it("derives finals stage from observation and results phases", () => {
    expect(phaseToStageMode("observation")).toBe("finals");
    expect(phaseToStageMode("results")).toBe("finals");
    expect(phaseToStageMode("wall_reset")).toBe("qualifier");
  });

  it("defaults registration and self scoring to closed unless qualifier_open", () => {
    expect(canRegisterDuringCompetition({ current_phase: "qualifier_open" })).toBe(true);
    expect(canRegisterDuringCompetition({ current_phase: "qualifier_closed" })).toBe(false);
    expect(canClimberSelfScoreQualifier({ current_phase: "qualifier_open", format: "scramble" })).toBe(true);
    expect(canClimberSelfScoreQualifier({ current_phase: "qualifier_closed", format: "scramble" })).toBe(false);
  });

  it("maps live schedule blocks to the scoring phase they imply", () => {
    expect(getCompetitionPhaseForSchedulePhase("qualifier_round")).toBe("qualifier_open");
    expect(getCompetitionPhaseForSchedulePhase("isolation")).toBe("observation");
    expect(getCompetitionPhaseForSchedulePhase("finals_round")).toBe("finals_open");
    expect(getCompetitionPhaseForSchedulePhase("custom")).toBeNull();
  });

  it("builds a phase sequence from schedule blocks without duplicate qualifier phases", () => {
    expect(
      getCompetitionPhaseSequenceFromScheduleBlocks([
        { label: "Youth B", phase_type: "qualifier_round", start_time: "9:00 AM" },
        { label: "Youth A", phase_type: "qualifier_round", start_time: "10:00 AM" },
        { label: "Reset", phase_type: "wall_reset", start_time: "11:00 AM" },
        { label: "Observe", phase_type: "observation", start_time: "12:00 PM" },
        { label: "Finals", phase_type: "finals_round", start_time: "1:00 PM" },
        { label: "Awards", phase_type: "results", start_time: "2:00 PM" },
      ])
    ).toEqual(["qualifier_open", "wall_reset", "observation", "finals_open", "results"]);
  });
});

describe("competition normalization", () => {
  it("derives stage mode from current phase and preserves finals problem count up to 8", () => {
    const competition = normalizeCompetition({
      id: "comp-1",
      name: "Spring Send",
      slug: "spring-send",
      format: "flash_format",
      current_phase: "finals_open",
      finals_problem_count: 6,
    });

    expect(competition.stage_mode).toBe("finals");
    expect(competition.current_phase).toBe("finals_open");
    expect(competition.finals_problem_count).toBe(6);
  });
});
