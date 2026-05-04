import { describe, expect, it } from "vitest";
import { getOrganizerOperationsModel } from "@/lib/organizer-operations";
import {
  DEFAULT_COMPETITION,
  getRoundRuntimePhase,
  type Competition,
  type CompetitionCategory,
  type CompetitionRound,
  type CompetitionScheduleBlock,
  type FinalistSelection,
  type QualifierLeaderboardEntry,
} from "@/lib/scoring";

function category(id: string, displayName: string, sortOrder: number): CompetitionCategory {
  const [genderDivision, ageGroup] = displayName.split(" / ");
  return {
    id,
    competition_id: "comp",
    gender_division: genderDivision,
    age_group: ageGroup,
    display_name: displayName,
    sort_order: sortOrder,
  };
}

function round(
  id: string,
  roundType: CompetitionRound["round_type"],
  sortOrder: number,
  overrides: Partial<CompetitionRound> = {}
): CompetitionRound {
  const scoringBucket = roundType === "finals" ? "finals" : "qualifier";
  return {
    id,
    competition_id: "comp",
    round_number: sortOrder,
    sort_order: sortOrder,
    name: roundType === "semifinal" ? "Semifinal" : roundType === "finals" ? "Finals" : "Qualifier",
    round_type: roundType,
    format: roundType === "finals" ? "ifsc_finals_format" : "flash_format",
    status: "pending",
    runtime_phase: getRoundRuntimePhase(roundType),
    is_enabled: true,
    is_active: roundType === "qualifier",
    activated_at: null,
    problem_count: roundType === "finals" ? 4 : 6,
    counting_climbs: roundType === "finals" ? null : 6,
    finals_cutoff: roundType === "semifinal" ? null : 8,
    eligible_category_ids: [],
    advancement_source_round_id: null,
    advancement_cutoff: roundType === "finals" ? 8 : null,
    scoring_bucket: scoringBucket,
    scoring_config: {},
    started_at: null,
    closed_at: null,
    ...overrides,
  };
}

function block(
  id: string,
  roundId: string,
  label: string,
  isActive = false
): CompetitionScheduleBlock {
  return {
    id,
    competition_id: "comp",
    round_id: roundId,
    label,
    phase_type: "qualifier_round",
    audience_label: label,
    is_active: isActive,
    start_time: "9:00 AM",
    end_time: "10:00 AM",
    capacity: 50,
    eligible_category_ids: [],
  };
}

function competition(overrides: Partial<Competition> = {}): Competition {
  const categories = [
    category("cat-men-junior", "Men / Junior", 1),
    category("cat-women-junior", "Women / Junior", 2),
  ];
  const qualifier = round("round-qualifier", "qualifier", 1, { status: "active" });
  const finals = round("round-finals", "finals", 2, {
    advancement_source_round_id: qualifier.id,
  });

  return {
    ...DEFAULT_COMPETITION,
    id: "comp",
    slug: "comp",
    name: "Organizer Ops",
    format: "flash_format",
    current_phase: "qualifier_open",
    has_finals: true,
    finals_cutoff: 8,
    finals_eligible_age_groups: ["Junior"],
    categories,
    rounds: [qualifier, finals],
    schedule_blocks: [block("block-qualifier", qualifier.id, "Qualifier wave", true)],
    ...overrides,
  };
}

function leaderboardEntry(
  climberId: string,
  name: string,
  categoryEntry: CompetitionCategory,
  rank: number
): QualifierLeaderboardEntry {
  return {
    climber_id: climberId,
    name,
    climber_number: String(100 + rank),
    province: "QC",
    category_id: categoryEntry.id,
    display_category: categoryEntry.display_name,
    gender_division: categoryEntry.gender_division,
    age_group: categoryEntry.age_group,
    time_slot_id: "block-qualifier",
    total_score: 100 - rank,
    counting_climbs: [],
    all_climbs: [],
    topped_count: 6,
    zone_count: 6,
    counting_attempt_total: rank,
    overall_rank: rank,
    category_rank: rank,
  };
}

function finalist(
  climberId: string,
  name: string,
  categoryEntry: CompetitionCategory,
  rank: number
): FinalistSelection {
  return {
    climber_id: climberId,
    name,
    category_id: categoryEntry.id,
    display_category: categoryEntry.display_name,
    gender_division: categoryEntry.gender_division,
    age_group: categoryEntry.age_group,
    qualifier_rank: rank,
    advanced_with_tie: false,
    climbing_order: rank,
  };
}

function categoryLeaderboard(categoryEntry: CompetitionCategory, count: number) {
  return Array.from({ length: count }, (_, index) =>
    leaderboardEntry(`${categoryEntry.id}-${index + 1}`, `Athlete ${index + 1}`, categoryEntry, index + 1)
  );
}

describe("organizer operations model", () => {
  it("builds a qualifier-to-finals operation flow when there is no semifinal", () => {
    const comp = competition();
    const [men] = comp.categories;
    const model = getOrganizerOperationsModel({
      competition: comp,
      qualifierLeaderboard: categoryLeaderboard(men, 10),
      projectedFinalists: categoryLeaderboard(men, 8).map((entry) =>
        finalist(entry.climber_id, entry.name, men, entry.category_rank)
      ),
      canEditPhase: true,
    });

    expect(model.steps.map((step) => step.label)).toEqual([
      "Review qualifiers",
      "Lock qualifiers",
      "Advance finals",
      "Publish results",
    ]);
    expect(model.steps.find((step) => step.id === "lock-qualifiers")).toMatchObject({
      state: "available",
      action: "lockQualifiers",
    });
    expect(model.steps.find((step) => step.id === "advance-finals")?.disabledReason).toBe(
      "Lock qualifiers before advancing finalists."
    );
    expect(model.advancementPreview).toMatchObject({
      title: "Qualifiers -> Finals",
      cutoffLabel: "Top 8 per category",
      sourceStatusLabel: "Qualifiers live",
    });
    expect(model.advancementPreview?.rows[0]).toMatchObject({
      categoryName: "Men / Junior",
      qualifyingSlot: 8,
      athleteName: "Athlete 8",
      sourceRank: 8,
    });
  });

  it("shows qualifier-to-semifinal preview before semifinals open", () => {
    const base = competition();
    const [men] = base.categories;
    const qualifier = base.rounds![0];
    const semifinal = round("round-semifinal", "semifinal", 2, {
      advancement_source_round_id: qualifier.id,
      advancement_cutoff: 8,
    });
    const finals = round("round-finals", "finals", 3, {
      advancement_source_round_id: semifinal.id,
      advancement_cutoff: 8,
    });
    const comp = competition({
      rounds: [qualifier, semifinal, finals],
      schedule_blocks: [
        block("block-qualifier", qualifier.id, "Qualifier wave", true),
        block("block-semifinal", semifinal.id, "Semifinal round"),
      ],
    });
    const model = getOrganizerOperationsModel({
      competition: comp,
      qualifierLeaderboard: categoryLeaderboard(men, 9),
      canEditPhase: true,
    });

    expect(model.hasSemifinal).toBe(true);
    expect(model.steps.map((step) => step.label)).toEqual([
      "Review qualifiers",
      "Lock qualifiers",
      "Open semifinals",
      "Review semifinals",
      "Lock semifinals",
      "Advance finals",
      "Publish results",
    ]);
    expect(model.steps.find((step) => step.id === "open-semifinals")?.disabledReason).toBe("Lock qualifiers first.");
    expect(model.advancementPreview).toMatchObject({
      title: "Qualifiers -> Semifinals",
      projectedCountLabel: "8 projected to advance",
      sourceStatusLabel: "Qualifiers live",
    });
  });

  it("enables opening semifinals after qualifiers are locked", () => {
    const base = competition();
    const qualifier = base.rounds![0];
    const semifinal = round("round-semifinal", "semifinal", 2, {
      advancement_source_round_id: qualifier.id,
      advancement_cutoff: 8,
    });
    const finals = round("round-finals", "finals", 3, {
      advancement_source_round_id: semifinal.id,
      advancement_cutoff: 8,
    });
    const comp = competition({
      current_phase: "qualifier_closed",
      rounds: [qualifier, semifinal, finals],
      schedule_blocks: [
        block("block-qualifier", qualifier.id, "Qualifier wave", true),
        block("block-semifinal", semifinal.id, "Semifinal round"),
      ],
    });
    const model = getOrganizerOperationsModel({ competition: comp, canEditPhase: true });

    expect(model.qualifierLocked).toBe(true);
    expect(model.semifinalOpened).toBe(false);
    expect(model.steps.find((step) => step.id === "open-semifinals")).toMatchObject({
      state: "available",
      disabledReason: "",
    });
    expect(model.steps.find((step) => step.id === "advance-finals")?.disabledReason).toBe(
      "Lock semifinals before advancing finalists."
    );
  });

  it("switches the preview to semifinal-to-finals once semifinals are live", () => {
    const base = competition();
    const [men] = base.categories;
    const qualifier = base.rounds![0];
    const semifinal = round("round-semifinal", "semifinal", 2, {
      advancement_source_round_id: qualifier.id,
      advancement_cutoff: 8,
      status: "active",
      is_active: true,
      activated_at: "2026-05-04T12:00:00.000Z",
    });
    const finals = round("round-finals", "finals", 3, {
      advancement_source_round_id: semifinal.id,
      advancement_cutoff: 8,
    });
    const comp = competition({
      current_phase: "wall_reset",
      rounds: [{ ...qualifier, is_active: false, status: "closed" }, semifinal, finals],
      schedule_blocks: [
        block("block-qualifier", qualifier.id, "Qualifier wave"),
        block("block-semifinal", semifinal.id, "Semifinal round", true),
      ],
    });
    const projected = categoryLeaderboard(men, 8).map((entry) =>
      finalist(entry.climber_id, entry.name, men, entry.category_rank)
    );
    const model = getOrganizerOperationsModel({
      competition: comp,
      qualifierLeaderboard: categoryLeaderboard(men, 8),
      projectedFinalists: projected,
      canEditPhase: true,
    });

    expect(model.semifinalOpened).toBe(true);
    expect(model.semifinalLocked).toBe(false);
    expect(model.steps.find((step) => step.id === "lock-semifinals")).toMatchObject({
      state: "available",
      disabledReason: "",
    });
    expect(model.advancementPreview).toMatchObject({
      title: "Semifinals -> Finals",
      sourceStatusLabel: "Semifinals live",
    });
  });

  it("enables finals advancement only after semifinals are locked", () => {
    const base = competition();
    const [men] = base.categories;
    const qualifier = base.rounds![0];
    const semifinal = round("round-semifinal", "semifinal", 2, {
      advancement_source_round_id: qualifier.id,
      advancement_cutoff: 8,
      status: "active",
      activated_at: "2026-05-04T12:00:00.000Z",
    });
    const finals = round("round-finals", "finals", 3, {
      advancement_source_round_id: semifinal.id,
      advancement_cutoff: 8,
    });
    const comp = competition({
      current_phase: "qualifier_closed",
      rounds: [qualifier, semifinal, finals],
      schedule_blocks: [
        block("block-qualifier", qualifier.id, "Qualifier wave"),
        block("block-semifinal", semifinal.id, "Semifinal round", true),
      ],
    });
    const projected = categoryLeaderboard(men, 8).map((entry) =>
      finalist(entry.climber_id, entry.name, men, entry.category_rank)
    );
    const model = getOrganizerOperationsModel({
      competition: comp,
      projectedFinalists: projected,
      canEditPhase: true,
    });

    expect(model.semifinalLocked).toBe(true);
    expect(model.steps.find((step) => step.id === "advance-finals")).toMatchObject({
      state: "available",
      disabledReason: "",
    });
  });
});
