import { describe, expect, it } from "vitest";
import {
  buildQualifierLeaderboard,
  buildRegistrationChoices,
  canRegisterForScheduleBlock,
  canClimberSelfScoreQualifier,
  canRegisterDuringCompetition,
  canUseLiveBoulderQueue,
  DEFAULT_COMPETITION,
  formatCompetitionDateBadge,
  formatDateLabel,
  formatDateRange,
  getActiveQueueSessionBlock,
  getCompetitionLifecycleLabel,
  getCompetitionPhaseSequenceFromScheduleBlocks,
  getCompetitionPhaseForSchedulePhase,
  getFormatCapabilities,
  isRoundActiveForCompetitionPhase,
  normalizeCompetition,
  phaseToStageMode,
  pickPreferredQualifierCategory,
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

  it("reports results before live schedule state when results are published", () => {
    expect(
      getCompetitionLifecycleLabel({
        status: "active",
        current_phase: "results",
        start_date: "2026-05-10",
        end_date: "2026-05-10",
        schedule_blocks: [
          {
            phase_type: "qualifier_round",
            is_active: true,
          },
        ],
      })
    ).toBe("Results published");
  });

  it("formats date-only values without timezone day shifts", () => {
    expect(formatDateLabel("2026-05-10")).toContain("May");
    expect(formatDateLabel("2026-05-10")).toContain("10");
    expect(formatDateRange("2026-05-10", "2026-05-10")).toBe(formatDateLabel("2026-05-10"));
    expect(formatCompetitionDateBadge({ start_date: "2026-05-10", end_date: "2026-05-11" })).toEqual({
      month: "MAY",
      day: "10 - 11",
    });
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

  it("builds authored rounds from legacy competition settings when none are provided", () => {
    const competition = normalizeCompetition({
      id: "comp-rounds",
      name: "Round Ready",
      slug: "round-ready",
      format: "flash_format",
      has_finals: true,
      current_phase: "finals_open",
      total_climbs: 12,
      qualifier_counting_climbs: 6,
      finals_problem_count: 4,
    });

    expect(competition.rounds?.map((round) => [round.round_type, round.scoring_bucket, round.is_active])).toEqual([
      ["qualifier", "qualifier", false],
      ["finals", "finals", true],
    ]);
    expect(competition.rounds?.[0]?.problem_count).toBe(12);
    expect(competition.rounds?.[1]?.problem_count).toBe(4);
  });

  it("preserves linked round ids on schedule blocks", () => {
    const competition = normalizeCompetition(
      {
        ...DEFAULT_COMPETITION,
        id: "comp-linked-rounds",
        slug: "comp-linked-rounds",
        name: "Linked Rounds",
      },
      [],
      [
        {
          id: "qual-wave",
          competition_id: "comp-linked-rounds",
          round_id: "round-qualifier",
          label: "Qualifier Wave A",
          phase_type: "qualifier_round",
          audience_label: "Wave A",
          is_active: true,
          start_time: "9:00 AM",
          end_time: "11:00 AM",
          capacity: 40,
          eligible_category_ids: [],
        },
      ],
      [
        {
          id: "round-qualifier",
          competition_id: "comp-linked-rounds",
          round_number: 1,
          sort_order: 1,
          name: "Qualifier",
          round_type: "qualifier",
          format: "scramble",
          status: "active",
          runtime_phase: "qualifier_open",
          is_enabled: true,
          is_active: true,
          activated_at: null,
          problem_count: 30,
          counting_climbs: 6,
          finals_cutoff: null,
          eligible_category_ids: [],
          advancement_source_round_id: null,
          advancement_cutoff: null,
          scoring_bucket: "qualifier",
          scoring_config: {},
          started_at: null,
          closed_at: null,
        },
      ]
    );

    expect(competition.schedule_blocks[0]?.round_id).toBe("round-qualifier");
    expect(competition.rounds?.[0]?.id).toBe("round-qualifier");
  });

  it("only offers registration blocks whose linked rounds are active for the current phase", () => {
    const competition = normalizeCompetition(
      {
        ...DEFAULT_COMPETITION,
        id: "comp-registration-rounds",
        slug: "comp-registration-rounds",
        name: "Registration Rounds",
        current_phase: "qualifier_open",
      },
      [],
      [
        {
          id: "linked-open",
          competition_id: "comp-registration-rounds",
          round_id: "round-qualifier-open",
          label: "Open Wave",
          phase_type: "qualifier_round",
          audience_label: "Open",
          is_active: true,
          start_time: "9:00 AM",
          end_time: "10:00 AM",
          capacity: 20,
          eligible_category_ids: [],
        },
        {
          id: "linked-closed",
          competition_id: "comp-registration-rounds",
          round_id: "round-qualifier-closed",
          label: "Closed Wave",
          phase_type: "qualifier_round",
          audience_label: "Closed",
          is_active: false,
          start_time: "10:00 AM",
          end_time: "11:00 AM",
          capacity: 20,
          eligible_category_ids: [],
        },
      ],
      [
        {
          id: "round-qualifier-open",
          competition_id: "comp-registration-rounds",
          round_number: 1,
          sort_order: 1,
          name: "Qualifier A",
          round_type: "qualifier",
          format: "scramble",
          status: "active",
          runtime_phase: "qualifier_open",
          is_enabled: true,
          is_active: true,
          activated_at: null,
          problem_count: 30,
          counting_climbs: 6,
          finals_cutoff: null,
          eligible_category_ids: [],
          advancement_source_round_id: null,
          advancement_cutoff: null,
          scoring_bucket: "qualifier",
          scoring_config: {},
          started_at: null,
          closed_at: null,
        },
        {
          id: "round-qualifier-closed",
          competition_id: "comp-registration-rounds",
          round_number: 2,
          sort_order: 2,
          name: "Qualifier B",
          round_type: "qualifier",
          format: "scramble",
          status: "pending",
          runtime_phase: "qualifier_open",
          is_enabled: true,
          is_active: false,
          activated_at: null,
          problem_count: 30,
          counting_climbs: 6,
          finals_cutoff: null,
          eligible_category_ids: [],
          advancement_source_round_id: null,
          advancement_cutoff: null,
          scoring_bucket: "qualifier",
          scoring_config: {},
          started_at: null,
          closed_at: null,
        },
      ]
    );

    expect(canRegisterForScheduleBlock(competition, competition.schedule_blocks[0]!)).toBe(true);
    expect(canRegisterForScheduleBlock(competition, competition.schedule_blocks[1]!)).toBe(false);

    const choices = buildRegistrationChoices(competition, []);
    expect(choices.some((choice) => choice.slots.some((slot) => slot.id === "linked-open"))).toBe(true);
    expect(choices.some((choice) => choice.slots.some((slot) => slot.id === "linked-closed"))).toBe(false);
  });

  it("treats a round as phase-compatible only when it is active, enabled, and matches the phase bucket", () => {
    expect(
      isRoundActiveForCompetitionPhase(
        { current_phase: "qualifier_open" },
        {
          is_enabled: true,
          is_active: true,
          runtime_phase: "qualifier_open",
          scoring_bucket: "qualifier",
        }
      )
    ).toBe(true);

    expect(
      isRoundActiveForCompetitionPhase(
        { current_phase: "qualifier_open" },
        {
          is_enabled: true,
          is_active: false,
          runtime_phase: "qualifier_open",
          scoring_bucket: "qualifier",
        }
      )
    ).toBe(false);

    expect(
      isRoundActiveForCompetitionPhase(
        { current_phase: "observation" },
        {
          is_enabled: true,
          is_active: true,
          runtime_phase: "observation",
          scoring_bucket: "qualifier",
        }
      )
    ).toBe(false);
  });

  it("allows semifinals to remain qualifier-style score-bearing rounds", () => {
    const competition = normalizeCompetition(
      {
        ...DEFAULT_COMPETITION,
        id: "comp-semifinal",
        slug: "comp-semifinal",
        name: "Semifinal Ready",
        format: "flash_format",
      },
      [],
      [],
      [
        {
          id: "round-qualifier",
          competition_id: "comp-semifinal",
          round_number: 1,
          sort_order: 1,
          name: "Qualifier",
          round_type: "qualifier",
          format: "flash_format",
          status: "closed",
          runtime_phase: "qualifier_open",
          is_enabled: true,
          is_active: false,
          activated_at: null,
          problem_count: 5,
          counting_climbs: 5,
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
          id: "round-semifinal",
          competition_id: "comp-semifinal",
          round_number: 2,
          sort_order: 2,
          name: "Semifinal",
          round_type: "semifinal",
          format: "flash_format",
          status: "active",
          runtime_phase: "qualifier_open",
          is_enabled: true,
          is_active: true,
          activated_at: null,
          problem_count: 4,
          counting_climbs: 4,
          finals_cutoff: null,
          eligible_category_ids: [],
          advancement_source_round_id: "round-qualifier",
          advancement_cutoff: 6,
          scoring_bucket: "qualifier",
          scoring_config: {},
          started_at: null,
          closed_at: null,
        },
      ]
    );

    expect(competition.rounds?.[1]?.scoring_bucket).toBe("qualifier");
    expect(competition.rounds?.[1]?.is_active).toBe(true);
  });

  it("builds qualifier leaderboards from the selected round only", () => {
    const competition = normalizeCompetition(
      {
        ...DEFAULT_COMPETITION,
        id: "comp-round-leaderboard",
        slug: "comp-round-leaderboard",
        name: "Round Scoped",
        format: "flash_format",
      },
      [],
      [],
      [
        {
          id: "round-qualifier",
          competition_id: "comp-round-leaderboard",
          round_number: 1,
          sort_order: 1,
          name: "Qualifier",
          round_type: "qualifier",
          format: "flash_format",
          status: "closed",
          runtime_phase: "qualifier_open",
          is_enabled: true,
          is_active: false,
          activated_at: null,
          problem_count: 1,
          counting_climbs: 1,
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
          id: "round-semifinal",
          competition_id: "comp-round-leaderboard",
          round_number: 2,
          sort_order: 2,
          name: "Semifinal",
          round_type: "semifinal",
          format: "flash_format",
          status: "active",
          runtime_phase: "qualifier_open",
          is_enabled: true,
          is_active: true,
          activated_at: null,
          problem_count: 1,
          counting_climbs: 1,
          finals_cutoff: null,
          eligible_category_ids: [],
          advancement_source_round_id: "round-qualifier",
          advancement_cutoff: 6,
          scoring_bucket: "qualifier",
          scoring_config: {},
          started_at: null,
          closed_at: null,
        },
      ]
    );

    const [qualifierRound, semifinalRound] = competition.rounds ?? [];
    const leaderboard = buildQualifierLeaderboard(
      [
        {
          id: "climber-1",
          competition_id: competition.id,
          name: "Ada",
          climber_number: "12",
          province: "NS",
          category_id: "Women::Open",
          gender_division: "Women",
          age_group: "Open",
          display_category: "Women / Open",
          time_slot_id: null,
          access_token: "token",
          qualifier_attempts: [
            {
              competition_id: competition.id,
              round_id: qualifierRound.id,
              climber_id: "climber-1",
              climb_number: 1,
              attempt_count: 2,
              zone: true,
              topped: true,
              attempts_to_top: 2,
              attempts_to_zone: 1,
              entered_by: "staff",
            },
            {
              competition_id: competition.id,
              round_id: semifinalRound.id,
              climber_id: "climber-1",
              climb_number: 1,
              attempt_count: 1,
              zone: true,
              topped: true,
              attempts_to_top: 1,
              attempts_to_zone: 1,
              entered_by: "staff",
            },
          ],
          final_attempts: [],
        },
      ],
      competition,
      semifinalRound
    );

    expect(leaderboard[0]?.total_score).toBe(25);
    expect(leaderboard[0]?.counting_attempt_total).toBe(1);
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
        {
          id: "score-verification",
          competition_id: "comp-4",
          label: "Score verification",
          phase_type: "custom",
          audience_label: "Officials",
          is_active: false,
          start_time: "1:00 PM",
          end_time: "1:30 PM",
          capacity: 20,
          eligible_category_ids: [],
        },
      ]
    );

    const choices = buildRegistrationChoices(competition, []);

    expect(choices).toHaveLength(1);
    expect(choices[0]?.slots.map((slot) => slot.label)).toEqual(["Recreational Scramble"]);
  });

  it("orders registration choices by schedule block order before category sort order", () => {
    const competition = normalizeCompetition(
      {
        ...DEFAULT_COMPETITION,
        id: "comp-7",
        slug: "spring-send-recreational",
        name: "Spring Send Recreational",
        format: "scramble",
      },
      [
        {
          id: "Men::Rec",
          competition_id: "comp-7",
          gender_division: "Men",
          age_group: "Rec",
          display_name: "Men / Rec",
          sort_order: 0,
        },
        {
          id: "Men::Open",
          competition_id: "comp-7",
          gender_division: "Men",
          age_group: "Open",
          display_name: "Men / Open",
          sort_order: 1,
        },
        {
          id: "Women::Rec",
          competition_id: "comp-7",
          gender_division: "Women",
          age_group: "Rec",
          display_name: "Women / Rec",
          sort_order: 2,
        },
      ],
      [
        {
          id: "rec-session",
          competition_id: "comp-7",
          label: "Rec Session",
          phase_type: "qualifier_round",
          audience_label: "Rec",
          is_active: true,
          start_time: "9:00 AM",
          end_time: "11:00 AM",
          capacity: 20,
          eligible_category_ids: ["Men::Rec", "Women::Rec"],
        },
        {
          id: "open-session",
          competition_id: "comp-7",
          label: "Open Session",
          phase_type: "qualifier_round",
          audience_label: "Open",
          is_active: false,
          start_time: "11:30 AM",
          end_time: "1:30 PM",
          capacity: 20,
          eligible_category_ids: ["Men::Open"],
        },
      ]
    );

    const choices = buildRegistrationChoices(competition, []);

    expect(choices.map((choice) => choice.category.display_name)).toEqual([
      "Men / Rec",
      "Women / Rec",
      "Men / Open",
    ]);
  });

  it("realigns demo competition dates to the current timeline", () => {
    const now = new Date();
    const expectedToday = new Date(now);
    expectedToday.setHours(0, 0, 0, 0);

    const expectedUpcoming = new Date(now);
    expectedUpcoming.setHours(0, 0, 0, 0);
    expectedUpcoming.setDate(expectedUpcoming.getDate() + 14);

    const liveDemo = normalizeCompetition({
      id: "comp-5",
      name: "Bridgeport Community Boulder Scramble",
      slug: "mock-rec-scramble-live",
      start_date: "2026-04-02",
      end_date: "2026-04-02",
      registration_closes_at: "2026-04-02T12:00:00.000Z",
    });

    const upcomingDemo = normalizeCompetition({
      id: "comp-6",
      name: "Quebec City Junior Boulder Championship",
      slug: "mock-flash-upcoming",
      start_date: "2026-04-09",
      end_date: "2026-04-10",
      registration_opens_at: "2026-04-04T12:00:00.000Z",
      registration_closes_at: "2026-04-08T12:00:00.000Z",
    });

    expect(liveDemo.start_date).toBe(expectedToday.toISOString().slice(0, 10));
    expect(liveDemo.end_date).toBe(expectedToday.toISOString().slice(0, 10));
    expect(new Date(liveDemo.registration_closes_at ?? "").getTime()).toBeGreaterThan(now.getTime());

    expect(upcomingDemo.start_date).toBe(expectedUpcoming.toISOString().slice(0, 10));
    expect(upcomingDemo.end_date).toBe(
      new Date(expectedUpcoming.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    );
    expect(new Date(upcomingDemo.registration_opens_at ?? "").getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("leaderboard category defaults", () => {
  it("prefers the largest qualifier category and breaks ties by sort order", () => {
    const preferred = pickPreferredQualifierCategory(
      [
        { id: "youth-d", sort_order: 3, display_name: "Youth D" },
        { id: "open", sort_order: 1, display_name: "Open" },
        { id: "rec", sort_order: 2, display_name: "Rec" },
      ],
      [
        { category_id: "open" },
        { category_id: "open" },
        { category_id: "rec" },
        { category_id: "rec" },
      ]
    );

    expect(preferred).toBe("open");
  });

  it("falls back to the first ordered category when no qualifier scores exist yet", () => {
    const preferred = pickPreferredQualifierCategory(
      [
        { id: "youth-d", sort_order: 3, display_name: "Youth D" },
        { id: "open", sort_order: 1, display_name: "Open" },
      ],
      []
    );

    expect(preferred).toBe("open");
  });
});
