import { describe, expect, it } from "vitest";
import {
  getLiveLeaderboardCopy,
  getPublicOverviewSections,
  getPublicResultsState,
  getPublicStandingsCopy,
} from "@/lib/public-results";
import type { CompetitionPhase, FinalsLeaderboardEntry } from "@/lib/scoring";

function finalsRow(overrides: Partial<FinalsLeaderboardEntry> = {}): FinalsLeaderboardEntry {
  return {
    climber_id: "climber-1",
    name: "Avery Chen",
    climber_number: "101",
    province: "QC",
    category_id: "category-1",
    display_category: "Women / Junior",
    gender_division: "Women",
    age_group: "Junior",
    total_points: 0,
    previous_round_rank: 1,
    tops: 0,
    zones: 0,
    attempts_to_top: 0,
    attempts_to_zone: 0,
    overall_rank: 1,
    category_rank: 1,
    attempts: [],
    problem_results: [
      {
        climb_number: 1,
        top: false,
        zone: false,
        attempts_to_top: null,
        attempts_to_zone: null,
        points: 0,
      },
    ],
    ...overrides,
  };
}

describe("public results display state", () => {
  it("uses qualifier mode before finals", () => {
    const state = getPublicResultsState({
      phase: "qualifier_open",
      finalsLeaderboard: [],
    });

    expect(state).toMatchObject({
      mode: "qualifier",
      finalsStarted: false,
      finalsPending: false,
      hasFinalsAttempts: false,
      hasFinalsScores: false,
    });
    expect(getPublicOverviewSections(state)).toEqual(["leaderboard", "finals"]);
  });

  it.each<CompetitionPhase>(["finals_open", "finals_closed", "results"])(
    "uses finals mode during %s",
    (phase) => {
      const state = getPublicResultsState({
        phase,
        finalsLeaderboard: [
          finalsRow({
            attempts: [
              {
                competition_id: "competition-1",
                round_id: "finals-round",
                climber_id: "climber-1",
                climb_number: 1,
                top: true,
                zone: true,
                attempts_to_top: 2,
                attempts_to_zone: 1,
                entered_by: "staff",
              },
            ],
            problem_results: [
              {
                climb_number: 1,
                top: true,
                zone: true,
                attempts_to_top: 2,
                attempts_to_zone: 1,
                points: 34.8,
              },
            ],
          }),
        ],
      });

      expect(state.mode).toBe("finals");
      expect(state.finalsStarted).toBe(true);
      expect(state.finalsPending).toBe(false);
      expect(state.hasFinalsAttempts).toBe(true);
      expect(state.hasFinalsScores).toBe(true);
      expect(getPublicOverviewSections(state)).toEqual(["finals", "leaderboard"]);
    }
  );

  it("marks finals as pending when no finals attempts exist yet", () => {
    const state = getPublicResultsState({
      phase: "finals_open",
      finalsLeaderboard: [finalsRow()],
    });

    expect(state).toMatchObject({
      mode: "finals",
      finalsStarted: true,
      finalsPending: true,
      hasFinalsAttempts: false,
      hasFinalsScores: false,
    });
  });

  it("uses clear finals copy instead of qualifier copy during finals", () => {
    const state = getPublicResultsState({
      phase: "finals_open",
      finalsLeaderboard: [finalsRow()],
    });

    expect(getPublicStandingsCopy(state)).toMatchObject({
      kicker: "Qualification standings",
      title: "Earlier qualification standings",
    });
    expect(getLiveLeaderboardCopy(state)).toMatchObject({
      kicker: "Finals leaderboard",
    });
  });
});
