import {
  GUIDED_DEMO_PRESET_ID,
  getGuidedDemoPreset,
  getPresetFinalsEligibleCategories,
  type CompetitionPreset,
  type CompetitionPresetId,
} from "./competition-presets";
import { DEMO_COMPETITION_NAME } from "./demo";

export type GuidedDemoSetupStepId =
  | "basics"
  | "preset"
  | "registration"
  | "categories"
  | "finals"
  | "rounds"
  | "schedule"
  | "create";

export type GuidedDemoSetupCategory = {
  id: string;
  division: string;
  ageGroup: string;
  displayName: string;
};

export type GuidedDemoEventSetupInput = {
  name?: string;
  locationName?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  maxClimbers?: number;
  presetId?: CompetitionPresetId | string;
};

export type GuidedDemoEventSetupDraft = {
  name: string;
  locationName: string;
  startDate: string;
  endDate: string;
  description: string;
  maxClimbers: number;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  presetId: typeof GUIDED_DEMO_PRESET_ID;
};

export type GuidedDemoSetupModel = {
  preset: CompetitionPreset;
  presetLocked: true;
  defaultEventSetup: GuidedDemoEventSetupDraft;
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
const DEFAULT_DEMO_LOCATION = "North Summit Climbing";
const DEFAULT_DEMO_CAPACITY = 150;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeNullableText(value: unknown) {
  const text = sanitizeText(value);
  return text || null;
}

function coercePositiveInteger(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return fallback;
  }

  return Math.round(numeric);
}

function getDefaultRegistrationDates(now: Date) {
  return {
    registrationOpensAt: new Date(now.getTime() - 14 * DAY_MS).toISOString(),
    registrationClosesAt: new Date(now.getTime() + DAY_MS).toISOString(),
  };
}

export function buildDefaultGuidedDemoEventSetup(now = new Date()): GuidedDemoEventSetupDraft {
  const registration = getDefaultRegistrationDates(now);
  const startDate = formatDate(now);

  return {
    name: DEMO_COMPETITION_NAME,
    locationName: DEFAULT_DEMO_LOCATION,
    startDate,
    endDate: startDate,
    description:
      "A guided youth championship demo that moves from setup to judged scoring, finalist advancement, finals, and public results.",
    registrationOpensAt: registration.registrationOpensAt,
    registrationClosesAt: registration.registrationClosesAt,
    maxClimbers: DEFAULT_DEMO_CAPACITY,
    presetId: GUIDED_DEMO_PRESET_ID,
  };
}

export function normalizeGuidedDemoEventSetup(
  input: GuidedDemoEventSetupInput | null | undefined,
  now = new Date()
): GuidedDemoEventSetupDraft {
  const defaults = buildDefaultGuidedDemoEventSetup(now);

  return {
    name: sanitizeText(input?.name) || defaults.name,
    locationName: sanitizeText(input?.locationName) || defaults.locationName,
    startDate: sanitizeText(input?.startDate) || defaults.startDate,
    endDate: sanitizeText(input?.endDate) || sanitizeText(input?.startDate) || defaults.endDate,
    description: sanitizeText(input?.description) || defaults.description,
    registrationOpensAt: sanitizeNullableText(input?.registrationOpensAt) ?? defaults.registrationOpensAt,
    registrationClosesAt: sanitizeNullableText(input?.registrationClosesAt) ?? defaults.registrationClosesAt,
    maxClimbers: Math.max(DEFAULT_DEMO_CAPACITY, coercePositiveInteger(input?.maxClimbers, defaults.maxClimbers)),
    presetId: GUIDED_DEMO_PRESET_ID,
  };
}

export function getInitialGuidedDemoConfirmedSteps(): GuidedDemoSetupStepId[] {
  return ["basics"];
}

export function buildGuidedDemoSetupModel(now = new Date()): GuidedDemoSetupModel {
  const preset = getGuidedDemoPreset();
  const finalsEligibleAgeGroups = getPresetFinalsEligibleCategories(preset);
  const defaultEventSetup = buildDefaultGuidedDemoEventSetup(now);

  return {
    preset,
    presetLocked: true,
    defaultEventSetup,
    steps: [
      {
        id: "basics",
        title: "Event basics",
        description: "Name the event and confirm the date, location, and capacity.",
      },
      {
        id: "preset",
        title: "Preset selection",
        description: "Start from the required finals-capable story preset.",
      },
      {
        id: "registration",
        title: "Registration setup",
        description: "Review public registration timing and how the demo will simulate athletes.",
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
        id: "rounds",
        title: "Rounds and scoring",
        description: "Confirm qualifier scoring, finals cutoff, ties, and finals problem count.",
      },
      {
        id: "schedule",
        title: "Schedule",
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
