import {
  DEFAULT_FINALS_CUTOFF,
  compareCompetitionPhases,
  getRoundLabel,
  isFinalsEligibleCategory,
  type Competition,
  type CompetitionCategory,
  type CompetitionPhase,
  type CompetitionRound,
  type FinalistSelection,
  type QualifierLeaderboardEntry,
} from "@/lib/scoring";

export type OrganizerOperationAction =
  | "openLeaderboard"
  | "lockQualifiers"
  | "openSemifinals"
  | "lockSemifinals"
  | "advanceFinals"
  | "publishResults"
  | "openPublicResults";

export type OrganizerOperationState = "complete" | "available" | "locked";

export interface OrganizerOperationStep {
  id:
    | "review-qualifiers"
    | "lock-qualifiers"
    | "open-semifinals"
    | "review-semifinals"
    | "lock-semifinals"
    | "advance-finals"
    | "publish-results";
  label: string;
  description: string;
  statusLabel: string;
  actionLabel: string;
  action: OrganizerOperationAction;
  anchor: string;
  complete: boolean;
  state: OrganizerOperationState;
  disabledReason: string;
}

export interface AdvancementPreviewRow {
  categoryId: string | null;
  categoryName: string;
  cutoff: number;
  qualifyingSlot: number;
  projectedAdvancing: number;
  categorySize: number;
  athleteName: string | null;
  sourceRank: number | null;
  explanation: string | null;
}

export interface AdvancementPreview {
  title: string;
  sourceLabel: string;
  targetLabel: string;
  cutoffLabel: string;
  projectedCountLabel: string;
  sourceStatusLabel: string;
  emptyMessage: string;
  rows: AdvancementPreviewRow[];
}

export interface OrganizerOperationsModel {
  hasFinals: boolean;
  hasSemifinal: boolean;
  qualifierRound: CompetitionRound | null;
  semifinalRound: CompetitionRound | null;
  finalsRound: CompetitionRound | null;
  finalsAdvancementSourceRound: CompetitionRound | null;
  semifinalScheduleBlockId: string | null;
  qualifierLocked: boolean;
  semifinalOpened: boolean;
  semifinalLocked: boolean;
  finalsStarted: boolean;
  finalsLive: boolean;
  resultsPublished: boolean;
  currentSourceRound: CompetitionRound | null;
  nextTargetRound: CompetitionRound | null;
  activeScheduleLabel: string | null;
  overallStatusLabel: string;
  summary: string;
  steps: OrganizerOperationStep[];
  advancementPreview: AdvancementPreview | null;
}

export interface OrganizerOperationsInput {
  competition: Competition | null;
  qualifierLeaderboard?: QualifierLeaderboardEntry[];
  projectedFinalists?: FinalistSelection[];
  finalistsPersisted?: boolean;
  finalsScoresReady?: boolean;
  canEditPhase?: boolean;
}

type SourcePreviewEntry = {
  climberId: string;
  name: string;
  categoryId: string | null;
  displayCategory: string;
  genderDivision: string;
  ageGroup: string;
  sourceRank: number;
  sortRank: number;
};

type CategoryPreviewDefinition = {
  id: string | null;
  name: string;
  genderDivision: string;
  ageGroup: string;
  sortOrder: number;
};

function roundSort(left: CompetitionRound, right: CompetitionRound) {
  return left.sort_order - right.sort_order || left.round_number - right.round_number || left.name.localeCompare(right.name);
}

function orderedRounds(competition: Competition) {
  return [...(competition.rounds ?? [])].filter((round) => round.is_enabled).sort(roundSort);
}

function getRoundName(round: CompetitionRound | null, fallback: string) {
  if (!round) {
    return fallback;
  }

  return round.name?.trim() || getRoundLabel(round.round_type, Math.max(0, round.sort_order - 1));
}

function getPluralRoundName(round: CompetitionRound | null, fallback: string) {
  const roundType = round?.round_type;
  if (roundType === "semifinal") {
    return "Semifinals";
  }
  if (roundType === "finals") {
    return "Finals";
  }
  if (roundType === "qualifier") {
    return "Qualifiers";
  }

  return fallback;
}

function getAdvancementCutoff(competition: Competition, targetRound: CompetitionRound | null) {
  return targetRound?.advancement_cutoff ?? targetRound?.finals_cutoff ?? competition.finals_cutoff ?? DEFAULT_FINALS_CUTOFF;
}

function isCategoryEligibleForTarget(
  competition: Competition,
  targetRound: CompetitionRound | null,
  category: Pick<CompetitionCategory, "id" | "gender_division" | "age_group">
) {
  if (targetRound?.eligible_category_ids.length) {
    return targetRound.eligible_category_ids.includes(category.id);
  }

  return isFinalsEligibleCategory(competition, category.gender_division, category.age_group);
}

function categoryKey(
  entry: Pick<SourcePreviewEntry, "categoryId" | "displayCategory" | "genderDivision" | "ageGroup">
) {
  return entry.categoryId ?? `${entry.genderDivision}::${entry.ageGroup}::${entry.displayCategory}`;
}

function categoryDefinitionKey(category: CategoryPreviewDefinition) {
  return category.id ?? `${category.genderDivision}::${category.ageGroup}::${category.name}`;
}

function buildSourceEntriesFromLeaderboard(entries: QualifierLeaderboardEntry[]): SourcePreviewEntry[] {
  return entries.map((entry) => ({
    climberId: entry.climber_id,
    name: entry.name,
    categoryId: entry.category_id,
    displayCategory: entry.display_category,
    genderDivision: entry.gender_division,
    ageGroup: entry.age_group,
    sourceRank: entry.category_rank,
    sortRank: entry.category_rank || entry.overall_rank,
  }));
}

function buildSourceEntriesFromFinalistProjection(entries: FinalistSelection[]): SourcePreviewEntry[] {
  return entries.map((entry) => ({
    climberId: entry.climber_id,
    name: entry.name,
    categoryId: entry.category_id,
    displayCategory: entry.display_category,
    genderDivision: entry.gender_division,
    ageGroup: entry.age_group,
    sourceRank: entry.qualifier_rank,
    sortRank: entry.qualifier_rank,
  }));
}

function deriveCategoryDefinitions(
  competition: Competition,
  targetRound: CompetitionRound | null,
  sourceEntries: SourcePreviewEntry[]
) {
  const fromSetup = competition.categories
    .filter((category) => isCategoryEligibleForTarget(competition, targetRound, category))
    .map<CategoryPreviewDefinition>((category) => ({
      id: category.id,
      name: category.display_name,
      genderDivision: category.gender_division,
      ageGroup: category.age_group,
      sortOrder: category.sort_order,
    }));

  if (fromSetup.length) {
    return fromSetup.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  }

  const seen = new Set<string>();
  return sourceEntries
    .flatMap<CategoryPreviewDefinition>((entry, index) => {
      const key = categoryKey(entry);
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [
        {
          id: entry.categoryId,
          name: entry.displayCategory,
          genderDivision: entry.genderDivision,
          ageGroup: entry.ageGroup,
          sortOrder: index,
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildPreviewRows({
  competition,
  targetRound,
  cutoff,
  sourceEntries,
}: {
  competition: Competition;
  targetRound: CompetitionRound | null;
  cutoff: number;
  sourceEntries: SourcePreviewEntry[];
}) {
  const sourceByCategory = new Map<string, SourcePreviewEntry[]>();
  sourceEntries.forEach((entry) => {
    const category = competition.categories.find((candidate) => candidate.id === entry.categoryId) ?? null;
    if (category && !isCategoryEligibleForTarget(competition, targetRound, category)) {
      return;
    }
    if (!category && !isFinalsEligibleCategory(competition, entry.genderDivision, entry.ageGroup)) {
      return;
    }

    const key = categoryKey(entry);
    const rows = sourceByCategory.get(key) ?? [];
    rows.push(entry);
    sourceByCategory.set(key, rows);
  });

  const categories = deriveCategoryDefinitions(
    competition,
    targetRound,
    Array.from(sourceByCategory.values()).flat()
  );

  return categories.map<AdvancementPreviewRow>((category) => {
    const rows = [...(sourceByCategory.get(categoryDefinitionKey(category)) ?? [])].sort(
      (left, right) =>
        left.sortRank - right.sortRank ||
        left.sourceRank - right.sourceRank ||
        left.name.localeCompare(right.name) ||
        left.climberId.localeCompare(right.climberId)
    );
    const categorySize = rows.length;
    const projectedAdvancing = Math.min(cutoff, categorySize);
    const qualifyingSlot = projectedAdvancing || cutoff;
    const cutoffEntry = projectedAdvancing ? rows[projectedAdvancing - 1] ?? null : null;
    const explanation =
      categorySize === 0
        ? "No scored athletes in this category yet."
        : categorySize < cutoff
          ? `Only ${categorySize} eligible ${categorySize === 1 ? "athlete has" : "athletes have"} scores, so everyone listed would advance.`
          : null;

    return {
      categoryId: category.id,
      categoryName: category.name,
      cutoff,
      qualifyingSlot,
      projectedAdvancing,
      categorySize,
      athleteName: cutoffEntry?.name ?? null,
      sourceRank: cutoffEntry?.sourceRank ?? null,
      explanation,
    };
  });
}

function sourceStatusLabel({
  sourceRound,
  qualifierLocked,
  semifinalOpened,
  semifinalLocked,
  finalsStarted,
  resultsPublished,
}: {
  sourceRound: CompetitionRound | null;
  qualifierLocked: boolean;
  semifinalOpened: boolean;
  semifinalLocked: boolean;
  finalsStarted: boolean;
  resultsPublished: boolean;
}) {
  if (resultsPublished) {
    return "Results published";
  }
  if (finalsStarted) {
    return "Finals live";
  }
  if (sourceRound?.round_type === "semifinal") {
    if (semifinalLocked) {
      return "Semifinals locked";
    }
    if (semifinalOpened) {
      return "Semifinals live";
    }
    return "Semifinals not open";
  }

  return qualifierLocked ? "Qualifiers locked" : "Qualifiers live";
}

function buildAdvancementPreview({
  competition,
  sourceRound,
  targetRound,
  qualifierLeaderboard,
  projectedFinalists,
  qualifierLocked,
  semifinalOpened,
  semifinalLocked,
  finalsStarted,
  resultsPublished,
}: {
  competition: Competition;
  sourceRound: CompetitionRound | null;
  targetRound: CompetitionRound | null;
  qualifierLeaderboard: QualifierLeaderboardEntry[];
  projectedFinalists: FinalistSelection[];
  qualifierLocked: boolean;
  semifinalOpened: boolean;
  semifinalLocked: boolean;
  finalsStarted: boolean;
  resultsPublished: boolean;
}) {
  if (!targetRound) {
    return null;
  }

  const sourceLabel = getPluralRoundName(sourceRound, "Qualifiers");
  const targetLabel = getPluralRoundName(targetRound, "Finals");
  const cutoff = getAdvancementCutoff(competition, targetRound);
  const sourceEntries =
    targetRound.round_type === "semifinal"
      ? buildSourceEntriesFromLeaderboard(qualifierLeaderboard)
      : buildSourceEntriesFromFinalistProjection(projectedFinalists);
  const rows = buildPreviewRows({ competition, targetRound, cutoff, sourceEntries });
  const projectedCount = rows.reduce((sum, row) => sum + row.projectedAdvancing, 0);

  return {
    title: `${sourceLabel} -> ${targetLabel}`,
    sourceLabel,
    targetLabel,
    cutoffLabel: `Top ${cutoff} per category`,
    projectedCountLabel: projectedCount
      ? `${projectedCount} projected to advance`
      : `No athletes projected for ${targetLabel.toLowerCase()} yet`,
    sourceStatusLabel: sourceStatusLabel({
      sourceRound,
      qualifierLocked,
      semifinalOpened,
      semifinalLocked,
      finalsStarted,
      resultsPublished,
    }),
    emptyMessage: `Add scores in ${sourceLabel.toLowerCase()} to preview who advances to ${targetLabel.toLowerCase()}.`,
    rows,
  } satisfies AdvancementPreview;
}

function buildStep({
  id,
  label,
  description,
  statusLabel,
  actionLabel,
  action,
  anchor,
  complete,
  disabledReason,
}: Omit<OrganizerOperationStep, "state">): OrganizerOperationStep {
  return {
    id,
    label,
    description,
    statusLabel,
    actionLabel,
    action,
    anchor,
    complete,
    disabledReason,
    state: complete ? "complete" : disabledReason ? "locked" : "available",
  };
}

function hasStartedFinals(phase: CompetitionPhase) {
  return compareCompetitionPhases(phase, "finals_open") >= 0;
}

export function getOrganizerOperationsModel({
  competition,
  qualifierLeaderboard = [],
  projectedFinalists = [],
  finalistsPersisted = false,
  finalsScoresReady = finalistsPersisted,
  canEditPhase = false,
}: OrganizerOperationsInput): OrganizerOperationsModel {
  if (!competition) {
    return {
      hasFinals: false,
      hasSemifinal: false,
      qualifierRound: null,
      semifinalRound: null,
      finalsRound: null,
      finalsAdvancementSourceRound: null,
      semifinalScheduleBlockId: null,
      qualifierLocked: false,
      semifinalOpened: false,
      semifinalLocked: false,
      finalsStarted: false,
      finalsLive: false,
      resultsPublished: false,
      currentSourceRound: null,
      nextTargetRound: null,
      activeScheduleLabel: null,
      overallStatusLabel: "No event selected",
      summary: "Select an event to run organizer operations.",
      steps: [],
      advancementPreview: null,
    };
  }

  const rounds = orderedRounds(competition);
  const qualifierRound =
    rounds.find((round) => round.round_type === "qualifier" && round.scoring_bucket === "qualifier") ??
    rounds.find((round) => round.scoring_bucket === "qualifier") ??
    null;
  const semifinalRound =
    rounds.find((round) => round.round_type === "semifinal" && round.scoring_bucket === "qualifier") ?? null;
  const finalsRound =
    rounds.find((round) => round.round_type === "finals" || round.scoring_bucket === "finals") ?? null;
  const hasFinals = Boolean(competition.has_finals && finalsRound);
  const hasSemifinal = Boolean(semifinalRound);
  const finalsAdvancementSourceRound =
    (finalsRound?.advancement_source_round_id
      ? rounds.find((round) => round.id === finalsRound.advancement_source_round_id) ?? null
      : null) ??
    (hasSemifinal ? semifinalRound : qualifierRound);
  const activeScheduleBlock = competition.schedule_blocks.find((block) => block.is_active) ?? null;
  const activeBlockRound = activeScheduleBlock?.round_id
    ? rounds.find((round) => round.id === activeScheduleBlock.round_id) ?? null
    : null;
  const semifinalScheduleBlock =
    competition.schedule_blocks.find((block) => block.round_id === semifinalRound?.id) ?? null;
  const finalsStarted = hasStartedFinals(competition.current_phase);
  const finalsLive = competition.current_phase === "finals_open";
  const resultsPublished = competition.current_phase === "results";
  const qualifierLocked = compareCompetitionPhases(competition.current_phase, "qualifier_closed") >= 0;
  const semifinalOpened = Boolean(
    hasSemifinal &&
      (finalsStarted ||
        competition.current_phase === "wall_reset" ||
        activeBlockRound?.id === semifinalRound?.id ||
        semifinalRound?.activated_at ||
        (semifinalRound?.status && semifinalRound.status !== "pending"))
  );
  const semifinalLocked = Boolean(
    hasSemifinal &&
      semifinalOpened &&
      (finalsStarted || resultsPublished || competition.current_phase === "qualifier_closed")
  );
  const semifinalLive = Boolean(hasSemifinal && semifinalOpened && !semifinalLocked && !finalsStarted);
  const sourceForFinals = finalsAdvancementSourceRound ?? qualifierRound;
  const currentSourceRound =
    hasSemifinal && !semifinalOpened ? qualifierRound : sourceForFinals;
  const nextTargetRound = hasSemifinal && !semifinalOpened ? semifinalRound : finalsRound;
  const advancementPreview = hasFinals
    ? buildAdvancementPreview({
        competition,
        sourceRound: currentSourceRound,
        targetRound: nextTargetRound,
        qualifierLeaderboard,
        projectedFinalists,
        qualifierLocked,
        semifinalOpened,
        semifinalLocked,
        finalsStarted,
        resultsPublished,
      })
    : null;
  const projectedCount = advancementPreview?.rows.reduce((sum, row) => sum + row.projectedAdvancing, 0) ?? projectedFinalists.length;
  const sourceName = getRoundName(currentSourceRound, "Qualifier");
  const sourceNameLower = sourceName.toLowerCase();
  const qualifierStandingsCount = qualifierLeaderboard.length;
  const canAdvanceFromSource = hasSemifinal ? semifinalLocked : qualifierLocked;

  const steps: OrganizerOperationStep[] = [
    buildStep({
      id: "review-qualifiers",
      label: "Review qualifiers",
      description: "Check qualifier standings before scores are frozen.",
      statusLabel: qualifierLocked ? "Reviewed" : qualifierStandingsCount ? `${qualifierStandingsCount} ranked` : "Open",
      actionLabel: "Open leaderboard",
      action: "openLeaderboard",
      anchor: "organizer-open-leaderboard",
      complete: qualifierLocked || qualifierStandingsCount > 0,
      disabledReason: "",
    }),
    buildStep({
      id: "lock-qualifiers",
      label: "Lock qualifiers",
      description: hasSemifinal
        ? "Freeze qualifier scoring before semifinals open."
        : "Freeze qualifier scoring before finalists are selected.",
      statusLabel: qualifierLocked ? "Locked" : "Open",
      actionLabel: "Lock qualifiers",
      action: "lockQualifiers",
      anchor: "organizer-lock-qualifiers",
      complete: qualifierLocked,
      disabledReason: !canEditPhase
        ? "Only admins can lock qualifier scoring."
        : qualifierLocked
          ? "Qualifier scoring is already locked."
          : competition.current_phase !== "qualifier_open"
            ? "Move the event to qualifier live before locking qualifiers."
            : "",
    }),
  ];

  if (hasSemifinal) {
    steps.push(
      buildStep({
        id: "open-semifinals",
        label: "Open semifinals",
        description: "Activate the semifinal scoring round and its linked schedule block.",
        statusLabel: semifinalOpened ? "Open" : "Waiting",
        actionLabel: "Open semifinals",
        action: "openSemifinals",
        anchor: "organizer-open-semifinals",
        complete: semifinalOpened,
        disabledReason: !canEditPhase
          ? "Only admins can open semifinals."
          : !qualifierLocked
            ? "Lock qualifiers first."
            : semifinalOpened
              ? "Semifinals are already open or complete."
              : !semifinalScheduleBlock
                ? "Add a schedule block linked to the semifinal round first."
                : "",
      }),
      buildStep({
        id: "review-semifinals",
        label: "Review semifinals",
        description: "Check semifinal standings before the finals field is created.",
        statusLabel: semifinalLocked
          ? "Reviewed"
          : semifinalLive && qualifierStandingsCount
            ? `${qualifierStandingsCount} ranked`
            : "Waiting",
        actionLabel: "Open leaderboard",
        action: "openLeaderboard",
        anchor: "organizer-review-semifinals",
        complete: semifinalLocked || (semifinalLive && qualifierStandingsCount > 0),
        disabledReason: !semifinalOpened ? "Open semifinals first." : "",
      }),
      buildStep({
        id: "lock-semifinals",
        label: "Lock semifinals",
        description: "Freeze semifinal scoring before finalists are selected.",
        statusLabel: semifinalLocked ? "Locked" : semifinalLive ? "Live" : "Waiting",
        actionLabel: "Lock semifinals",
        action: "lockSemifinals",
        anchor: "organizer-lock-semifinals",
        complete: semifinalLocked,
        disabledReason: !canEditPhase
          ? "Only admins can lock semifinal scoring."
          : !semifinalOpened
            ? "Open semifinals first."
            : semifinalLocked
              ? "Semifinal scoring is already locked."
              : competition.current_phase !== "wall_reset"
                ? "Semifinals must be live before they can be locked."
                : "",
      })
    );
  }

  steps.push(
    buildStep({
      id: "advance-finals",
      label: "Advance finals",
      description: `Create the finals field from ${sourceNameLower} rankings and open finals scoring.`,
      statusLabel: finalsStarted
        ? "Finals live"
        : projectedCount
          ? `${projectedCount} projected`
          : "Waiting",
      actionLabel: "Advance + start finals",
      action: "advanceFinals",
      anchor: "organizer-advance-finals",
      complete: finalsStarted,
      disabledReason: !canEditPhase
        ? "Only admins can advance and start finals."
        : !hasFinals
          ? "Finals are not enabled for this competition."
          : finalsStarted
            ? "Finals are already running or complete."
            : !canAdvanceFromSource
              ? hasSemifinal
                ? "Lock semifinals before advancing finalists."
                : "Lock qualifiers before advancing finalists."
              : !projectedCount
                ? `No athletes are projected to advance yet. Check eligibility, cutoff, and ${sourceNameLower} scores.`
                : "",
    }),
    buildStep({
      id: "publish-results",
      label: "Publish results",
      description: finalsScoresReady
        ? "Finish live scoring and show final standings publicly."
        : "Finish live scoring once finals attempts are ready.",
      statusLabel: resultsPublished ? "Published" : "Pending",
      actionLabel: resultsPublished ? "Open public results" : "Publish results",
      action: resultsPublished ? "openPublicResults" : "publishResults",
      anchor: "organizer-publish-results",
      complete: resultsPublished,
      disabledReason: !canEditPhase
        ? "Only admins can publish results."
        : resultsPublished
          ? ""
          : hasFinals && !finalsStarted
            ? "Advance and start finals first."
            : !hasFinals && !qualifierLocked
              ? "Lock qualifier scoring first."
              : "",
    })
  );

  const overallStatusLabel = resultsPublished
    ? "Results published"
    : finalsLive
      ? "Finals live"
      : finalsStarted
        ? "Finals running"
        : hasSemifinal
          ? semifinalLocked
            ? "Semifinals locked"
            : semifinalOpened
              ? "Semifinals live"
              : qualifierLocked
                ? "Qualifiers locked"
                : "Qualifiers live"
          : qualifierLocked
            ? "Qualifiers locked"
            : "Qualifiers live";

  const summary = hasSemifinal
    ? "Review qualifiers, lock qualifiers, open semifinals, lock semifinals, advance finals, then publish results."
    : hasFinals
      ? "Review qualifiers, lock qualifiers, advance and start finals, then publish results."
      : "Review qualifiers, lock scoring, then publish results.";

  return {
    hasFinals,
    hasSemifinal,
    qualifierRound,
    semifinalRound,
    finalsRound,
    finalsAdvancementSourceRound,
    semifinalScheduleBlockId: semifinalScheduleBlock?.id ?? null,
    qualifierLocked,
    semifinalOpened,
    semifinalLocked,
    finalsStarted,
    finalsLive,
    resultsPublished,
    currentSourceRound,
    nextTargetRound,
    activeScheduleLabel: activeScheduleBlock?.label ?? null,
    overallStatusLabel,
    summary,
    steps,
    advancementPreview,
  };
}
