import { describe, expect, it } from "vitest";
import {
  buildRegistrationChoices,
  canClimberSelfScoreQualifier,
  canRegisterDuringCompetition,
  canUseLiveBoulderQueue,
  DEFAULT_COMPETITION,
  getActiveQueueSessionBlock,
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

  it("allows future registration windows during qualifier_closed when explicit dates are still open", () => {
    const opensAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const closesAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    expect(
      canRegisterDuringCompetition({
        current_phase: "qualifier_closed",
        status: "active",
        registration_opens_at: opensAt,
        registration_closes_at: closesAt,
      })
    ).toBe(true);
  });

  it("closes registration outside the configured registration window", () => {
    const opensAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const closesAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    expect(
      canRegisterDuringCompetition({
        current_phase: "qualifier_open",
        status: "active",
        registration_opens_at: opensAt,
        registration_closes_at: closesAt,
      })
    ).toBe(false);
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

  it("only opens the live boulder queue during a live self-scored qualifier block", () => {
    const scrambleCompetition = normalizeCompetition({
      id: "comp-queue",
      name: "Queue Test",
      slug: "queue-test",
      format: "scramble",
      current_phase: "qualifier_open",
    });

    scrambleCompetition.schedule_blocks = [
      {
        id: "block-1",
        competition_id: scrambleCompetition.id,
        label: "Morning Session",
        phase_type: "qualifier_round",
        audience_label: "Open Session",
        is_active: true,
        start_time: "9:00 AM",
        end_time: "12:00 PM",
        capacity: 50,
        eligible_category_ids: [],
      },
    ];

    expect(canUseLiveBoulderQueue(scrambleCompetition)).toBe(true);
    expect(getActiveQueueSessionBlock(scrambleCompetition)?.label).toBe("Morning Session");

    expect(
      canUseLiveBoulderQueue({
        ...scrambleCompetition,
        current_phase: "qualifier_closed",
      })
    ).toBe(false);

    expect(
      canUseLiveBoulderQueue({
        ...scrambleCompetition,
        format: "flash_format",
      })
    ).toBe(false);
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

  it("allows scramble to disable finals while keeping finals enabled for fixed-finals formats", () => {
    const scramble = normalizeCompetition({
      id: "comp-2",
      name: "Scramble Session",
      slug: "scramble-session",
      format: "scramble",
      has_finals: false,
    });

    const flash = normalizeCompetition({
      id: "comp-3",
      name: "Flash Session",
      slug: "flash-session",
      format: "flash_format",
      has_finals: false,
    });

    expect(scramble.has_finals).toBe(false);
    expect(flash.has_finals).toBe(true);
  });

  it("only offers climbing windows as registration assignments", () => {
    const competition = normalizeCompetition(
      {
        ...DEFAULT_COMPETITION,
        id: "comp-4",
        slug: "spring-send",
        name: "Spring Send",
        format: "scramble",
      },
      [
        {
          id: "Open::Rec",
          competition_id: "comp-4",
          gender_division: "Open",
          age_group: "Rec",
          display_name: "Open / Rec",
          sort_order: 0,
        },
      ],
      [
        {
          id: "check-in",
          competition_id: "comp-4",
          label: "Check-in",
          phase_type: "check_in",
          audience_label: "All climbers",
          is_active: false,
          start_time: "8:00 AM",
          end_time: "9:00 AM",
          capacity: 80,
          eligible_category_ids: [],
        },
        {
          id: "scramble-window",
          competition_id: "comp-4",
          label: "Recreational Scramble",
          phase_type: "qualifier_round",
          audience_label: "Scramble window",
          is_active: false,
          start_time: "9:00 AM",
          end_time: "12:00 PM",
          capacity: 80,
          eligible_category_ids: [],
        },
      ]
    );

    const choices = buildRegistrationChoices(competition, []);

    expect(choices).toHaveLength(1);
    expect(choices[0]?.slots.map((slot) => slot.label)).toEqual(["Recreational Scramble"]);
  });
});
