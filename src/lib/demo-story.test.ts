import { describe, expect, it } from "vitest";
import {
  deriveDemoStoryProgress,
  isCanonicalDemoMutableCompetition,
  mergeDemoStoryMetadata,
  type DemoStoryCompetitionSummary,
} from "./demo-story";
import { DEMO_COMPETITION_SLUG } from "./demo";

function demoCompetition(
  overrides: Partial<DemoStoryCompetitionSummary> = {}
): DemoStoryCompetitionSummary {
  return {
    id: "demo-competition",
    slug: DEMO_COMPETITION_SLUG,
    name: "Demo",
    is_demo: true,
    current_phase: "qualifier_open",
    qualifier_locked_at: null,
    finals_started_at: null,
    demo_metadata: {
      scenario_version: "demo-story-v1",
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
    });

    expect(progress.eventCreated).toBe(true);
    expect(progress.keyScoreCorrected).toBe(true);
    expect(progress.finalistsAdvanced).toBe(false);
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
    });

    expect(progress.eventCreated).toBe(true);
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
});
