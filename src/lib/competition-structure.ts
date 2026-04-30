import {
  competitionHasFinals,
  createCompetitionRoundId,
  getRoundDefaultScoringBucket,
  getRoundLabel,
  getRoundRuntimePhase,
  type Competition,
  type CompetitionRound,
  type CompetitionRoundType,
  type CompetitionScheduleBlock,
} from "./scoring";

function createRoundTemplate(
  competition: Pick<Competition, "id" | "format" | "total_climbs" | "qualifier_counting_climbs" | "finals_cutoff" | "finals_problem_count">,
  roundType: CompetitionRoundType,
  sortOrder: number
): CompetitionRound {
  const scoringBucket = getRoundDefaultScoringBucket(roundType);
  return {
    id: createCompetitionRoundId(),
    competition_id: competition.id,
    round_number: sortOrder,
    sort_order: sortOrder,
    name: getRoundLabel(roundType, sortOrder - 1),
    round_type: roundType,
    format: roundType === "finals" ? "ifsc_finals_format" : competition.format,
    status: "pending",
    runtime_phase: getRoundRuntimePhase(roundType),
    is_enabled: true,
    is_active: scoringBucket === "qualifier",
    activated_at: null,
    problem_count: roundType === "finals" ? competition.finals_problem_count : competition.total_climbs,
    counting_climbs: roundType === "finals" ? null : competition.qualifier_counting_climbs,
    finals_cutoff: roundType === "semifinal" ? null : competition.finals_cutoff,
    eligible_category_ids: [],
    advancement_source_round_id: null,
    advancement_cutoff: roundType === "finals" ? competition.finals_cutoff : null,
    scoring_bucket: scoringBucket,
    scoring_config: {},
    started_at: null,
    closed_at: null,
  };
}

function normalizeRoundOrdering(rounds: CompetitionRound[], competitionId: string) {
  return rounds.map((round, index) => ({
    ...round,
    round_number: index + 1,
    sort_order: index + 1,
    competition_id: competitionId,
  }));
}

function normalizeFinalsScheduleLinks(
  scheduleBlocks: CompetitionScheduleBlock[],
  shouldHaveFinals: boolean,
  finalsRoundId: string | null
) {
  const finalsLinkedPhaseTypes = new Set<CompetitionScheduleBlock["phase_type"]>([
    "isolation",
    "observation",
    "finals_round",
  ]);

  let changed = false;
  const nextScheduleBlocks = scheduleBlocks.map((block) => {
    if (!finalsLinkedPhaseTypes.has(block.phase_type)) {
      return block;
    }

    const nextRoundId = shouldHaveFinals ? finalsRoundId : null;
    if ((block.round_id ?? null) === nextRoundId) {
      return block;
    }

    changed = true;
    return {
      ...block,
      round_id: nextRoundId,
    };
  });

  return { changed, scheduleBlocks: nextScheduleBlocks };
}

export function normalizeCompetitionFinalsSetup(competition: Competition) {
  const currentRounds = [...(competition.rounds ?? [])];
  const shouldHaveFinals = competitionHasFinals(competition);
  const qualifierRound =
    currentRounds.find((round) => round.scoring_bucket === "qualifier") ?? currentRounds[0] ?? null;
  const finalsRoundIndex = currentRounds.findIndex((round) => round.scoring_bucket === "finals");
  const standbyFinalsRoundIndex = currentRounds.findIndex(
    (round) => round.round_type === "finals" && round.scoring_bucket !== "finals"
  );

  let nextRounds = currentRounds;
  let roundsChanged = false;

  if (shouldHaveFinals && finalsRoundIndex < 0) {
    if (standbyFinalsRoundIndex >= 0) {
      nextRounds = currentRounds.map((round, index) =>
        index === standbyFinalsRoundIndex
          ? {
              ...round,
              scoring_bucket: "finals",
              format: "ifsc_finals_format",
              advancement_source_round_id: round.advancement_source_round_id ?? qualifierRound?.id ?? null,
            }
          : round
      );
    } else {
      const nextFinalsRound = createRoundTemplate(competition, "finals", currentRounds.length + 1);
      nextFinalsRound.advancement_source_round_id = qualifierRound?.id ?? null;
      nextRounds = [...currentRounds, nextFinalsRound];
    }
    roundsChanged = true;
  }

  if (!shouldHaveFinals && finalsRoundIndex >= 0) {
    nextRounds = currentRounds.filter((round) => round.scoring_bucket !== "finals");
    roundsChanged = true;
  }

  if (roundsChanged) {
    nextRounds = normalizeRoundOrdering(nextRounds, competition.id);
  }

  const finalsRound = nextRounds.find((round) => round.scoring_bucket === "finals") ?? null;
  const { changed: scheduleChanged, scheduleBlocks } = normalizeFinalsScheduleLinks(
    competition.schedule_blocks,
    shouldHaveFinals,
    finalsRound?.id ?? null
  );

  const nextHasFinals = shouldHaveFinals && Boolean(finalsRound);
  const changed = roundsChanged || scheduleChanged || competition.has_finals !== nextHasFinals;

  if (!changed) {
    return {
      changed: false,
      competition,
    };
  }

  return {
    changed: true,
    competition: {
      ...competition,
      rounds: nextRounds,
      schedule_blocks: scheduleBlocks,
      has_finals: nextHasFinals,
    },
  };
}
