import {
  getGuidedDemoPreset,
  getPresetFinalsEligibleCategories,
  type CompetitionPreset,
} from "./competition-presets";

export type GuidedDemoSetupStepId = "preset" | "categories" | "finals" | "schedule" | "create";

export type GuidedDemoSetupCategory = {
  id: string;
  division: string;
  ageGroup: string;
  displayName: string;
};

export type GuidedDemoSetupModel = {
  preset: CompetitionPreset;
  presetLocked: true;
  steps: Array<{
    id: GuidedDemoSetupStepId;
    title: string;
    description: string;
  }>;
  categories: GuidedDemoSetupCategory[];
  finalsEligibleCategories: GuidedDemoSetupCategory[];
  rounds: Array<{
    title: string;
    description: string;
    problemCount: number;
  }>;
  scheduleBlocks: Array<{
    label: string;
    phaseType: string;
    audienceLabel: string;
    roundType: string | null;
  }>;
  finalsStorySteps: Array<{
    title: string;
    body: string;
  }>;
};

const GUIDED_DEMO_DIVISIONS = ["Men", "Women"] as const;

function categoryId(division: string, ageGroup: string) {
  return `${division.toLowerCase()}-${ageGroup.toLowerCase().replaceAll(" ", "-")}`;
}

function expandCategories(ageGroups: readonly string[]): GuidedDemoSetupCategory[] {
  return ageGroups.flatMap((ageGroup) =>
    GUIDED_DEMO_DIVISIONS.map((division) => ({
      id: categoryId(division, ageGroup),
      division,
      ageGroup,
      displayName: `${division} / ${ageGroup}`,
    }))
  );
}

export function buildGuidedDemoSetupModel(): GuidedDemoSetupModel {
  const preset = getGuidedDemoPreset();
  const finalsEligibleAgeGroups = getPresetFinalsEligibleCategories(preset);

  return {
    preset,
    presetLocked: true,
    steps: [
      {
        id: "preset",
        title: "Preset selection",
        description: "Start from the required finals-capable story preset.",
      },
      {
        id: "categories",
        title: "Category review",
        description: "Review the generated youth competition field.",
      },
      {
        id: "finals",
        title: "Finals eligibility",
        description: "See which selected categories can advance to finals.",
      },
      {
        id: "schedule",
        title: "Schedule and rounds",
        description: "Review the qualifier day, finals logistics, and awards flow.",
      },
      {
        id: "create",
        title: "Create demo event",
        description: "Reset and create the canonical demo competition.",
      },
    ],
    categories: expandCategories(preset.defaultCategories),
    finalsEligibleCategories: expandCategories(finalsEligibleAgeGroups),
    rounds: [
      {
        title: "Qualifier round",
        description: `${preset.qualifierProblemCount} problems, best ${preset.countingClimbs} count.`,
        problemCount: preset.qualifierProblemCount,
      },
      {
        title: "Finals round",
        description: `Top ${preset.finalsCutoff} advance for ${preset.finalsProblemCount} finals problems.`,
        problemCount: preset.finalsProblemCount,
      },
    ],
    scheduleBlocks: preset.defaultScheduleBlocks.map((block) => ({
      label: block.label,
      phaseType: block.phase_type,
      audienceLabel: block.audience_label,
      roundType: block.round_type ?? null,
    })),
    finalsStorySteps: [
      {
        title: "Qualifiers",
        body: "Judges score climbers during the qualifier round.",
      },
      {
        title: "Cut line",
        body: "The leaderboard ranks climbers by category. The key score correction can move an athlete above the finals cut line.",
      },
      {
        title: "Advance finalists",
        body: "The organizer locks qualifiers and advances the eligible categories.",
      },
      {
        title: "Finals",
        body: "Finalists compete in a finals stage using the configured finals format.",
      },
      {
        title: "Public results",
        body: "Athletes, coaches, parents, and spectators can view rankings and results publicly.",
      },
    ],
  };
}
