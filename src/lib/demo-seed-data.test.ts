import { describe, expect, it } from "vitest";
import {
  buildDemoFinalScore,
  buildDemoQualifierScore,
  createDemoAthleteSeeds,
} from "@/lib/demo-seed-data";
import {
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NUMBER,
} from "@/lib/demo-scenario";

const categories = [
  {
    id: "Men::Open",
    gender_division: "Men",
    age_group: "Open",
    display_name: "Men / Open",
    sort_order: 1,
  },
  {
    id: "Women::Open",
    gender_division: "Women",
    age_group: "Open",
    display_name: "Women / Open",
    sort_order: 2,
  },
];

describe("demo seed data", () => {
  it("generates stable realistic athletes for the same competition", () => {
    const firstRun = createDemoAthleteSeeds({ competitionId: "competition-1", categories });
    const secondRun = createDemoAthleteSeeds({ competitionId: "competition-1", categories });

    expect(firstRun).toEqual(secondRun);
    expect(firstRun).toHaveLength(18);
    expect(firstRun[0].name).toMatch(/^[A-Z][a-z]+ [A-Z][A-Za-z]+$/);
    expect(new Set(firstRun.map((athlete) => athlete.name)).size).toBe(firstRun.length);
    expect(firstRun[2].climberNumber).toBe(DEMO_TARGET_CLIMBER_NUMBER);
  });

  it("uses a dedicated seeded wrong score for the correction target", () => {
    const athlete = createDemoAthleteSeeds({ competitionId: "competition-1", categories })[2];
    const score = buildDemoQualifierScore({
      competitionId: "competition-1",
      roundId: "round-qualifier",
      roundIndex: 0,
      roundType: "qualifier",
      climber: athlete,
      climbNumber: DEMO_TARGET_CLIMB_NUMBER,
      problemCount: 6,
    });

    expect(score).toEqual({
      attempt_count: 3,
      topped: true,
      zone: true,
      attempts_to_top: 3,
      attempts_to_zone: 1,
    });
  });

  it("generates deterministic semifinal and finals scores", () => {
    const athlete = createDemoAthleteSeeds({ competitionId: "competition-1", categories })[0];
    const semifinalScore = buildDemoQualifierScore({
      competitionId: "competition-1",
      roundId: "round-semi",
      roundIndex: 1,
      roundType: "semifinal",
      climber: athlete,
      climbNumber: 2,
      problemCount: 4,
    });
    const finalScore = buildDemoFinalScore({
      competitionId: "competition-1",
      roundId: "round-finals",
      climberId: "climber-1",
      qualifierRank: 1,
      climbingOrder: 1,
      finalistIndex: 0,
      climbNumber: 1,
      problemCount: 4,
    });

    expect(semifinalScore).toMatchObject({
      attempt_count: expect.any(Number),
      topped: expect.any(Boolean),
      zone: expect.any(Boolean),
    });
    expect(finalScore).toEqual(
      buildDemoFinalScore({
        competitionId: "competition-1",
        roundId: "round-finals",
        climberId: "climber-1",
        qualifierRank: 1,
        climbingOrder: 1,
        finalistIndex: 0,
        climbNumber: 1,
        problemCount: 4,
      })
    );
  });
});
