import { describe, expect, it } from "vitest";
import {
  buildDemoCreateEventResponse,
  deriveDemoFinalsSetupReady,
  deriveDemoStoryProgress,
  isCanonicalDemoMutableCompetition,
  mergeDemoStoryMetadata,
  type DemoStoryState,
  type DemoStoryCompetitionSummary,
} from "./demo-story";
import {
  buildDemoStoryMetadataForClimbers,
  findDemoStoryClimberFromMetadata,
} from "./demo-story-target";
import { DEMO_COMPETITION_SLUG } from "./demo";

function demoCompetition(
  overrides: Partial<DemoStoryCompetitionSummary> = {}
): DemoStoryCompetitionSummary {
  return {
    id: "demo-competition",
    slug: DEMO_COMPETITION_SLUG,
    name: "Demo",
    is_demo: true,
    has_finals: true,
    finals_cutoff: 6,
    finals_tie_advances: true,
    finals_problem_count: 4,
    finals_eligible_age_groups: ["Youth B", "Youth A", "Junior"],
    current_phase: "qualifier_open",
    qualifier_locked_at: null,
    finals_started_at: null,
    demo_metadata: {
      scenario_version: "demo-story-v1",
      preset_id: "youth_championship_finals",
      story_step: "event_created",
      drama_target_climber: "climber-c",
      drama_target_climb_number: 3,
      drama_target_attempts_after: 1,
    },
    ...overrides,
  };
}

describe("demo story progress", () => {
  it("only treats the canonical is_demo competition as mutable", () => {
    expect(isCanonicalDemoMutableCompetition(demoCompetition())).toBe(true);
    expect(
      isCanonicalDemoMutableCompetition({
        slug: DEMO_COMPETITION_SLUG,
        is_demo: false,
      })
    ).toBe(false);
    expect(
      isCanonicalDemoMutableCompetition({
        slug: "real-youth-championship",
        is_demo: true,
      })
    ).toBe(false);
  });

  it("detects the key score correction from the normalized qualifier attempt", () => {
    const progress = deriveDemoStoryProgress({
      competition: demoCompetition(),
      targetAttempt: {
        attempt_count: 1,
        topped: true,
        zone: true,
        attempts_to_top: 1,
        attempts_to_zone: 1,
      },
      finalistCount: 0,
      finalsSetupReady: true,
    });

    expect(progress.eventCreated).toBe(true);
    expect(progress.keyScoreCorrected).toBe(true);
    expect(progress.finalistsAdvanced).toBe(false);
  });

  it("keeps a freshly reset demo locked until Act 1 is explicitly started", () => {
    const progress = deriveDemoStoryProgress({
      competition: demoCompetition({
        demo_metadata: {
          scenario_version: "demo-story-v1",
          story_step: "reset",
          drama_target_climber: "climber-c",
          drama_target_climb_number: 3,
          drama_target_attempts_after: 1,
        },
      }),
      targetAttempt: {
        attempt_count: 1,
        topped: true,
        zone: true,
        attempts_to_top: 1,
        attempts_to_zone: 1,
      },
      finalistCount: 0,
      finalsSetupReady: true,
    });

    expect(progress.eventCreated).toBe(false);
    expect(progress.keyScoreCorrected).toBe(false);
    expect(progress.finalistsAdvanced).toBe(false);
    expect(progress.finalsStarted).toBe(false);
  });

  it("detects the guided demo finals setup contract", () => {
    expect(
      deriveDemoFinalsSetupReady({
        competition: demoCompetition(),
        rounds: [
          { id: "qualifier-round", round_type: "qualifier", scoring_bucket: "qualifier", problem_count: 6 },
          { id: "finals-round", round_type: "finals", scoring_bucket: "finals", problem_count: 4 },
        ],
        scheduleBlocks: [
          { label: "Isolation opens", phase_type: "isolation" },
          { label: "Observation", phase_type: "observation" },
          { label: "Finals", phase_type: "finals_round" },
          { label: "Awards", phase_type: "results" },
        ],
      })
    ).toBe(true);
  });

  it("reports missing finals setup as not ready for Act 3", () => {
    expect(
      deriveDemoFinalsSetupReady({
        competition: demoCompetition({
          has_finals: false,
          demo_metadata: {
            scenario_version: "demo-story-v1",
            preset_id: "community_scramble",
            story_step: "event_created",
            drama_target_climber: "climber-c",
            drama_target_climb_number: 3,
            drama_target_attempts_after: 1,
          },
        }),
        rounds: [{ id: "qualifier-round", round_type: "qualifier", scoring_bucket: "qualifier", problem_count: 30 }],
        scheduleBlocks: [{ label: "Awards", phase_type: "results" }],
      })
    ).toBe(false);
  });

  it("requires both the key score correction and finals setup before Act 3 can unlock", () => {
    const progress = deriveDemoStoryProgress({
      competition: demoCompetition(),
      targetAttempt: {
        attempt_count: 1,
        topped: true,
        zone: true,
        attempts_to_top: 1,
        attempts_to_zone: 1,
      },
      finalistCount: 6,
      finalsSetupReady: false,
    });

    expect(progress.keyScoreCorrected).toBe(true);
    expect(progress.finalsSetupReady).toBe(false);
    expect(progress.finalistsAdvanced).toBe(false);
    expect(progress.finalsStarted).toBe(false);
  });

  it("does not require finalists or finals-started state before the organizer act can unlock", () => {
    const progress = deriveDemoStoryProgress({
      competition: demoCompetition(),
      targetAttempt: {
        attempt_count: 1,
        topped: true,
        zone: true,
        attempts_to_top: 1,
        attempts_to_zone: 1,
      },
      finalistCount: 0,
      finalsSetupReady: true,
    });

    expect(progress.eventCreated).toBe(true);
    expect(progress.keyScoreCorrected).toBe(true);
    expect(progress.finalsSetupReady).toBe(true);
    expect(progress.finalistsAdvanced).toBe(false);
    expect(progress.finalsStarted).toBe(false);
  });

  it("accepts the corrected score when top implies zone and attempts are normalized", () => {
    const progress = deriveDemoStoryProgress({
      competition: demoCompetition(),
      targetAttempt: {
        attempt_count: 1,
        topped: true,
        zone: false,
        attempts_to_top: null,
        attempts_to_zone: null,
      },
      finalistCount: 0,
      finalsSetupReady: true,
    });

    expect(progress.eventCreated).toBe(true);
    expect(progress.keyScoreCorrected).toBe(true);
  });

  it("does not mark the judge act complete while the seeded before-state is still present", () => {
    const progress = deriveDemoStoryProgress({
      competition: demoCompetition(),
      targetAttempt: {
        attempt_count: 3,
        topped: true,
        zone: true,
        attempts_to_top: 3,
        attempts_to_zone: 2,
      },
      finalistCount: 0,
      finalsSetupReady: true,
    });

    expect(progress.eventCreated).toBe(true);
    expect(progress.keyScoreCorrected).toBe(false);
  });

  it("does not mark act 2 complete when the target climber is stale or outside the canonical demo", () => {
    const progress = deriveDemoStoryProgress({
      competition: demoCompetition(),
      targetAttempt: {
        attempt_count: 1,
        topped: true,
        zone: true,
        attempts_to_top: 1,
        attempts_to_zone: 1,
      },
      finalistCount: 0,
      finalsSetupReady: true,
      targetClimberBelongsToCompetition: false,
    });

    expect(progress.eventCreated).toBe(false);
    expect(progress.keyScoreCorrected).toBe(false);
  });

  it("detects organizer/public readiness from finalists and finals phase", () => {
    const progress = deriveDemoStoryProgress({
      competition: demoCompetition({
        current_phase: "finals_open",
        finals_started_at: "2026-05-01T12:00:00.000Z",
      }),
      targetAttempt: {
        attempt_count: 1,
        topped: true,
        zone: true,
        attempts_to_top: 1,
        attempts_to_zone: 1,
      },
      finalistCount: 6,
      finalsSetupReady: true,
      publicViewed: true,
    });

    expect(progress.finalistsAdvanced).toBe(true);
    expect(progress.finalsStarted).toBe(true);
    expect(progress.publicViewed).toBe(true);
  });

  it("preserves existing demo metadata when story state updates are merged", () => {
    expect(
      mergeDemoStoryMetadata(
        {
          scenario_version: "demo-story-v1",
          drama_target_climber: "climber-c",
          custom_note: "do not erase me",
        },
        {
          story_step: "score_corrected",
          key_score_corrected_at: "2026-05-01T12:00:00.000Z",
        }
      )
    ).toEqual({
      scenario_version: "demo-story-v1",
      drama_target_climber: "climber-c",
      custom_note: "do not erase me",
      story_step: "score_corrected",
      key_score_corrected_at: "2026-05-01T12:00:00.000Z",
    });
  });

  it("repairs stale target metadata from stable climber number and category fields", () => {
    const climbers = [
      {
        id: "fresh-a",
        competition_id: "new-demo",
        name: "Noah Patel",
        climber_number: "102",
        gender_division: "Men",
        age_group: "Youth B",
        display_category: "Men / Youth B",
      },
      {
        id: "fresh-b",
        competition_id: "new-demo",
        name: "Milo Fraser",
        climber_number: "103",
        gender_division: "Men",
        age_group: "Youth B",
        display_category: "Men / Youth B",
      },
      {
        id: "fresh-c",
        competition_id: "new-demo",
        name: "Maya Chen",
        climber_number: "104",
        gender_division: "Men",
        age_group: "Youth B",
        display_category: "Men / Youth B",
      },
    ];

    const repaired = findDemoStoryClimberFromMetadata(climbers, {
      drama_target_climber: "stale-climber-id",
      drama_target_climber_number: "104",
      drama_target_climber_name: "Maya Chen",
      drama_target_category: "Men / Youth B",
    });

    expect(repaired?.id).toBe("fresh-c");
  });

  it("builds reset metadata with a target climber id from the newly-created demo field", () => {
    const targetClimber = {
      id: "new-target-id",
      competition_id: "new-demo",
      name: "Maya Chen",
      climber_number: "104",
      gender_division: "Men",
      age_group: "Youth B",
      display_category: "Men / Youth B",
    };
    const affectedClimber = {
      id: "new-affected-id",
      competition_id: "new-demo",
      name: "Milo Fraser",
      climber_number: "103",
      gender_division: "Men",
      age_group: "Youth B",
      display_category: "Men / Youth B",
    };

    const metadata = buildDemoStoryMetadataForClimbers({
      baseMetadata: { scenario_version: "demo-story-v1" },
      targetClimber,
      affectedClimber,
    });

    expect(metadata.target_climber_id).toBe(targetClimber.id);
    expect(metadata.drama_target_climber).toBe(targetClimber.id);
    expect(metadata.target_climber_number).toBe("104");
    expect(metadata.drama_pair).toEqual([affectedClimber.id, targetClimber.id]);
  });

  it("builds the guided event creation response from the populated server state", () => {
    const competition = demoCompetition({
      id: "created-demo-id",
      slug: DEMO_COMPETITION_SLUG,
    });
    const progress = deriveDemoStoryProgress({
      competition,
      targetAttempt: {
        attempt_count: 3,
        topped: true,
        zone: true,
        attempts_to_top: 3,
        attempts_to_zone: 2,
      },
      finalistCount: 0,
      finalsSetupReady: true,
    });
    const state: DemoStoryState = {
      available: true,
      error: null,
      competition,
      metadata: competition.demo_metadata,
      targetAttempt: {
        attempt_count: 3,
        topped: true,
        zone: true,
        attempts_to_top: 3,
        attempts_to_zone: 2,
      },
      finalistCount: 0,
      progress,
      links: {
        setup: "/staff/demo?demoStory=act1",
        judge: `/staff/c/${DEMO_COMPETITION_SLUG}/judge?demoStory=act2`,
        organizer: `/staff/c/${DEMO_COMPETITION_SLUG}?demoStory=act3`,
        publicEvent: `/c/${DEMO_COMPETITION_SLUG}?demoStory=public`,
        leaderboard: `/c/${DEMO_COMPETITION_SLUG}/leaderboard?demoStory=public`,
        scorecard: `/c/${DEMO_COMPETITION_SLUG}/scorecard?token=demo`,
      },
    };

    expect(buildDemoCreateEventResponse(state)).toEqual({
      competitionId: "created-demo-id",
      slug: DEMO_COMPETITION_SLUG,
      isDemo: true,
      judgeUrl: `/staff/c/${DEMO_COMPETITION_SLUG}/judge?demoStory=act2`,
      publicUrl: `/c/${DEMO_COMPETITION_SLUG}?demoStory=public`,
      leaderboardUrl: `/c/${DEMO_COMPETITION_SLUG}/leaderboard?demoStory=public`,
      progress,
    });
    expect(progress.eventCreated).toBe(true);
    expect(progress.keyScoreCorrected).toBe(false);
  });

  it("refuses to build a guided creation response before the judge route is ready", () => {
    const competition = demoCompetition();
    const state: DemoStoryState = {
      available: true,
      error: null,
      competition,
      metadata: competition.demo_metadata,
      targetAttempt: null,
      finalistCount: 0,
      progress: deriveDemoStoryProgress({
        competition,
        targetAttempt: null,
        finalistCount: 0,
        finalsSetupReady: true,
      }),
      links: {
        setup: "/staff/demo?demoStory=act1",
        judge: null,
        organizer: `/staff/c/${DEMO_COMPETITION_SLUG}?demoStory=act3`,
        publicEvent: `/c/${DEMO_COMPETITION_SLUG}?demoStory=public`,
        leaderboard: `/c/${DEMO_COMPETITION_SLUG}/leaderboard?demoStory=public`,
        scorecard: null,
      },
    };

    expect(() => buildDemoCreateEventResponse(state)).toThrow("failed to prepare judge route");
  });
});
