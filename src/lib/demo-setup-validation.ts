import {
  competitionHasFinals,
  type Competition,
  type CompetitionCategory,
  type CompetitionRound,
  type CompetitionScheduleBlock,
} from "@/lib/scoring";

export const DEMO_SETUP_STEPS = [
  { id: "basics", label: "Basics" },
  { id: "presets", label: "Preset" },
  { id: "categories", label: "Categories" },
  { id: "schedule", label: "Schedule" },
  { id: "stages", label: "Stages" },
  { id: "review", label: "Review" },
] as const;

export type DemoSetupStepId = (typeof DEMO_SETUP_STEPS)[number]["id"];

export type DemoSetupStepStatus = {
  id: DemoSetupStepId;
  label: string;
  complete: boolean;
  blockingMessage: string | null;
};

export type DemoSetupValidation = {
  steps: DemoSetupStepStatus[];
  firstIncompleteStep: DemoSetupStepId | null;
  firstBlockingMessage: string | null;
  canContinueToJudge: boolean;
};

type DemoSetupValidationOptions = {
  selectedPresetId?: string | null;
  requirePreset?: boolean;
  saved?: boolean;
  requireSaved?: boolean;
};

type DemoSetupCompetition = Partial<
  Pick<
    Competition,
    | "name"
    | "slug"
    | "format"
    | "location_name"
    | "start_date"
    | "end_date"
    | "has_finals"
    | "finals_cutoff"
    | "qualifier_counting_climbs"
    | "qualifier_eligible_age_groups"
    | "finals_eligible_age_groups"
  >
> & {
  categories?: Array<Pick<CompetitionCategory, "id" | "age_group">>;
  schedule_blocks?: Array<Partial<CompetitionScheduleBlock> & Pick<CompetitionScheduleBlock, "id">>;
  rounds?: Array<Partial<CompetitionRound> & Pick<CompetitionRound, "id">>;
};

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function getScoringRounds(competition: DemoSetupCompetition | null | undefined) {
  return (competition?.rounds ?? [])
    .filter((round) => round.scoring_bucket !== "none" && round.is_enabled !== false)
    .sort((left, right) => {
      const sortDiff = (left.sort_order ?? 0) - (right.sort_order ?? 0);
      if (sortDiff !== 0) {
        return sortDiff;
      }
      return (left.round_number ?? 0) - (right.round_number ?? 0);
    });
}

export function getDemoQualifierStyleRounds(competition: DemoSetupCompetition | null | undefined) {
  return getScoringRounds(competition).filter(
    (round) =>
      round.scoring_bucket === "qualifier" ||
      round.round_type === "qualifier" ||
      round.round_type === "semifinal"
  );
}

export function getDemoQualifierRound(competition: DemoSetupCompetition | null | undefined) {
  return getDemoQualifierStyleRounds(competition)[0] ?? null;
}

export function getDemoFinalsRound(competition: DemoSetupCompetition | null | undefined) {
  return (
    getScoringRounds(competition).find(
      (round) => round.scoring_bucket === "finals" || round.round_type === "finals"
    ) ?? null
  );
}

export function getDemoAdvancementSourceRound(competition: DemoSetupCompetition | null | undefined) {
  const qualifierStyleRounds = getDemoQualifierStyleRounds(competition);
  const finalsRound = getDemoFinalsRound(competition);
  if (!qualifierStyleRounds.length || !finalsRound) {
    return null;
  }

  const linkedSource =
    qualifierStyleRounds.find((round) => round.id === finalsRound.advancement_source_round_id) ?? null;
  return linkedSource ?? qualifierStyleRounds[qualifierStyleRounds.length - 1] ?? null;
}

export function getDemoSelectedQualifierCategories(competition: DemoSetupCompetition | null | undefined) {
  const selectedAgeGroups = new Set(asStringArray(competition?.qualifier_eligible_age_groups));
  return (competition?.categories ?? []).filter((category) => selectedAgeGroups.has(category.age_group));
}

export function getDemoFinalsEligibleCategories(competition: DemoSetupCompetition | null | undefined) {
  const finalsAgeGroups = new Set(asStringArray(competition?.finals_eligible_age_groups));
  return getDemoSelectedQualifierCategories(competition).filter((category) => finalsAgeGroups.has(category.age_group));
}

export function getDemoScheduleBlockForRound(
  competition: DemoSetupCompetition | null | undefined,
  round: { id: string; round_type?: CompetitionRound["round_type"] | null } | null | undefined
) {
  if (!round?.id) {
    return null;
  }

  return (
    (competition?.schedule_blocks ?? []).find(
      (block) => block.phase_type === "qualifier_round" && block.round_id === round.id
    ) ?? null
  );
}

export function getDemoQualifierScheduleBlock(competition: DemoSetupCompetition | null | undefined) {
  return getDemoScheduleBlockForRound(competition, getDemoQualifierRound(competition));
}

export function getDemoFinalsScheduleBlock(competition: DemoSetupCompetition | null | undefined) {
  const finalsRound = getDemoFinalsRound(competition);
  if (!finalsRound?.id) {
    return null;
  }

  return (
    (competition?.schedule_blocks ?? []).find(
      (block) => block.phase_type === "finals_round" && block.round_id === finalsRound.id
    ) ?? null
  );
}

function demoFinalsEnabled(competition: DemoSetupCompetition | null | undefined) {
  if (!competition?.format) {
    return competition?.has_finals === true;
  }

  return competitionHasFinals({
    format: competition.format as Competition["format"],
    has_finals: competition.has_finals === true,
  });
}

function getCategoriesBlockingMessage(competition: DemoSetupCompetition | null | undefined) {
  const selectedCategories = getDemoSelectedQualifierCategories(competition);
  if (!selectedCategories.length) {
    return "You must add at least one category";
  }

  if (!demoFinalsEnabled(competition)) {
    return "This demo includes finals. Add a Finals stage before continuing.";
  }

  const finalsAgeGroups = asStringArray(competition?.finals_eligible_age_groups);
  const qualifierAgeGroups = new Set(asStringArray(competition?.qualifier_eligible_age_groups));
  const finalsEligibleCategories = getDemoFinalsEligibleCategories(competition);
  if (!finalsAgeGroups.length || !finalsEligibleCategories.length) {
    return "Choose at least one finals-eligible category.";
  }

  if (!finalsAgeGroups.every((ageGroup) => qualifierAgeGroups.has(ageGroup))) {
    return "Finals-eligible categories must also be selected qualifier categories.";
  }

  return null;
}

function getStagesBlockingMessage(competition: DemoSetupCompetition | null | undefined) {
  if (!demoFinalsEnabled(competition)) {
    return "This demo includes finals. Add a Finals stage before continuing.";
  }

  const qualifierRound = getDemoQualifierRound(competition);
  const qualifierStyleRounds = getDemoQualifierStyleRounds(competition);
  const finalsRound = getDemoFinalsRound(competition);
  if (!qualifierRound) {
    return "Add a qualifier scoring stage.";
  }
  if (!finalsRound) {
    return "Add a Finals stage.";
  }

  const qualifierProblemCount = Number(qualifierRound.problem_count ?? 0);
  const qualifierCountingClimbs = Number(qualifierRound.counting_climbs ?? competition?.qualifier_counting_climbs ?? 0);
  if (!Number.isFinite(qualifierProblemCount) || qualifierProblemCount <= 0) {
    return "Set a valid qualifier problem count.";
  }
  if (
    !Number.isFinite(qualifierCountingClimbs) ||
    qualifierCountingClimbs <= 0 ||
    qualifierCountingClimbs > qualifierProblemCount
  ) {
    return "Set qualifier counted climbs between 1 and the qualifier problem count.";
  }

  const semifinalRounds = qualifierStyleRounds.filter((round) => round.round_type === "semifinal");
  const invalidSemifinal = semifinalRounds.find((round) => {
    const problemCount = Number(round.problem_count ?? 0);
    const countingClimbs = Number(round.counting_climbs ?? 0);
    return (
      !Number.isFinite(problemCount) ||
      problemCount <= 0 ||
      !Number.isFinite(countingClimbs) ||
      countingClimbs <= 0 ||
      countingClimbs > problemCount
    );
  });
  if (invalidSemifinal) {
    return "Set valid semifinal problem counts and counted climbs.";
  }

  const finalsProblemCount = Number(finalsRound.problem_count ?? 0);
  if (!Number.isFinite(finalsProblemCount) || finalsProblemCount <= 0) {
    return "Set a valid Finals problem count.";
  }

  const expectedAdvancementSource = qualifierStyleRounds[qualifierStyleRounds.length - 1] ?? qualifierRound;
  const linkedSource = qualifierStyleRounds.find((round) => round.id === finalsRound.advancement_source_round_id);
  if (!finalsRound.advancement_source_round_id || !linkedSource) {
    return "Link Finals advancement to the qualifier or semifinal stage.";
  }
  if (linkedSource.id !== expectedAdvancementSource.id) {
    return expectedAdvancementSource.round_type === "semifinal"
      ? "Link Finals advancement to the semifinal stage."
      : "Link Finals advancement to the qualifier stage.";
  }

  const advancementCutoff = Number(finalsRound.advancement_cutoff ?? finalsRound.finals_cutoff ?? competition?.finals_cutoff ?? 0);
  if (!Number.isFinite(advancementCutoff) || advancementCutoff <= 0) {
    return "Choose how many athletes advance to Finals.";
  }

  return null;
}

function getScheduleBlockingMessage(competition: DemoSetupCompetition | null | undefined) {
  const stagesMessage = getStagesBlockingMessage(competition);
  if (stagesMessage) {
    return stagesMessage;
  }

  if (!getDemoQualifierScheduleBlock(competition)) {
    return "Add a qualifier schedule block linked to the qualifier stage.";
  }
  const semifinalWithoutSchedule = getDemoQualifierStyleRounds(competition).find(
    (round) => round.round_type === "semifinal" && !getDemoScheduleBlockForRound(competition, round)
  );
  if (semifinalWithoutSchedule) {
    return "Add a semifinal schedule block linked to the Semifinal stage.";
  }
  if (!getDemoFinalsScheduleBlock(competition)) {
    return "Add a Finals schedule block linked to the Finals stage.";
  }

  return null;
}

export function getDemoSetupValidation(
  competition: DemoSetupCompetition | null | undefined,
  options: DemoSetupValidationOptions = {}
): DemoSetupValidation {
  const requirePreset = options.requirePreset ?? true;
  const requireSaved = options.requireSaved ?? true;
  const basicsMessage =
    competition &&
    hasText(competition.name) &&
    hasText(competition.slug) &&
    hasText(competition.location_name) &&
    hasText(competition.start_date) &&
    hasText(competition.end_date)
      ? null
      : "Complete event name, link, location, start date, and end date.";
  const presetMessage =
    !requirePreset || options.selectedPresetId
      ? null
      : "Choose a preset or Custom setup before continuing.";
  const categoriesMessage = getCategoriesBlockingMessage(competition);
  const scheduleMessage = getScheduleBlockingMessage(competition);
  const stagesMessage = getStagesBlockingMessage(competition);
  const reviewMessage =
    !requireSaved || options.saved === true
      ? null
      : "Save the competition before opening the judge panel.";

  const byId: Record<DemoSetupStepId, string | null> = {
    basics: basicsMessage,
    presets: presetMessage,
    categories: categoriesMessage,
    schedule: scheduleMessage,
    stages: stagesMessage,
    review: reviewMessage,
  };
  const steps = DEMO_SETUP_STEPS.map((step) => ({
    ...step,
    complete: byId[step.id] === null,
    blockingMessage: byId[step.id],
  }));
  const firstIncomplete = steps.find((step) => !step.complete) ?? null;

  return {
    steps,
    firstIncompleteStep: firstIncomplete?.id ?? null,
    firstBlockingMessage: firstIncomplete?.blockingMessage ?? null,
    canContinueToJudge: steps.every((step) => step.complete),
  };
}
