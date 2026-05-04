import type { DemoProgress } from "@/lib/demo-scenario";
import type { DemoSetupStepId, DemoSetupValidation } from "@/lib/demo-setup-validation";

export type DemoWizardStep = "create" | "judge" | "organize" | "public" | "finish";

export type DemoWizardProgress = DemoProgress & {
  publicReady: boolean;
};

export type DemoWizardStepDefinition = {
  id: DemoWizardStep;
  label: string;
  progressKey?: keyof DemoWizardProgress;
};

export type DemoWizardGuidance = {
  title: string;
  instruction: string;
  why: string;
  blockingMessage: string | null;
  primaryActionLabel: string;
  primaryTargetAnchor?: string;
};

export type DemoJudgeCorrectionTarget = {
  athleteName?: string | null;
  climberNumber?: string | null;
  roundName?: string | null;
  climbNumber: number;
  currentScore: string;
  correctedScore: string;
};

export const DEMO_WIZARD_STEPS: DemoWizardStepDefinition[] = [
  { id: "create", label: "Create", progressKey: "eventReady" },
  { id: "judge", label: "Judge", progressKey: "keyScoreCorrected" },
  { id: "organize", label: "Organize", progressKey: "organizerAdvanced" },
  { id: "public", label: "Public", progressKey: "publicReady" },
  { id: "finish", label: "Finish", progressKey: "publicReady" },
];

const SETUP_STEP_ANCHORS: Record<DemoSetupStepId, string> = {
  basics: "setup-basics",
  presets: "setup-presets",
  categories: "organizer-categories",
  schedule: "organizer-schedule",
  stages: "organizer-stages",
  review: "organizer-save-event",
};

export const DEMO_SETUP_STEP_CARD_ANCHORS: Record<DemoSetupStepId, string> = {
  basics: "organizer-step-basics",
  presets: "organizer-step-preset",
  categories: "organizer-step-categories",
  schedule: "organizer-step-schedule",
  stages: "organizer-step-stages",
  review: "organizer-step-review",
};

export function getDemoSetupStepCardAnchor(stepId: DemoSetupStepId) {
  return DEMO_SETUP_STEP_CARD_ANCHORS[stepId];
}

const SETUP_STEP_WHY: Record<DemoSetupStepId, string> = {
  basics: "This is the public event identity athletes and spectators will see.",
  presets: "The preset is only a starting point; choosing one or Custom makes the setup intentional.",
  categories: "Categories define the rankings and the finals field.",
  schedule: "Linked schedule blocks tell staff when each scoring round is active.",
  stages: "Qualifier and Finals stages make the judge and organizer handoff possible.",
  review: "Saving makes sure the judge panel opens against the persisted event, not an unsaved draft.",
};

export function normalizeDemoWizardProgress(progress: Partial<DemoWizardProgress> = {}): DemoWizardProgress {
  return {
    eventReady: progress.eventReady ?? false,
    dataPopulated: progress.dataPopulated ?? false,
    keyScoreCorrected: progress.keyScoreCorrected ?? false,
    organizerAdvanced: progress.organizerAdvanced ?? false,
    publicReady: progress.publicReady ?? false,
  };
}

export function isDemoWizardStepComplete(step: DemoWizardStepDefinition, progress: DemoWizardProgress) {
  return step.progressKey ? Boolean(progress[step.progressKey]) : false;
}

export function formatDemoJudgeScoreLabel(label: string) {
  return label
    .replace(/Top in (\d+) attempts?, Zone yes/gi, "Top on try $1, zone reached")
    .replace(/Top in (\d+) attempts?, Zone no/gi, "Top on try $1, zone not reached")
    .replace(/\bZone yes\b/gi, "zone reached")
    .replace(/\bZone no\b/gi, "zone not reached");
}

export function getDemoCreateWizardGuidance(
  validation: DemoSetupValidation,
  eventShellCreated: boolean
): DemoWizardGuidance {
  if (!eventShellCreated) {
    return {
      title: "Start as the organizer",
      instruction: "Create the demo event shell with the real staff event form.",
      why: "The demo starts from the same place a real organizer starts.",
      blockingMessage: "Create the event before the guided setup steps unlock.",
      primaryActionLabel: "Start Event Basics",
      primaryTargetAnchor: "organizer-create-name",
    };
  }

  if (validation.canContinueToJudge) {
    return {
      title: "Your event is ready.",
      instruction: "Next, add the sample field and open the real judge panel.",
      why: "The seed step happens only after your real setup is saved and complete.",
      blockingMessage: null,
      primaryActionLabel: "Continue to Judge Panel",
      primaryTargetAnchor: "organizer-go-judge",
    };
  }

  const stepId = validation.firstIncompleteStep ?? "basics";
  const step = validation.steps.find((status) => status.id === stepId);
  const label = step?.label ?? "Setup";

  return {
    title: `Finish ${label}`,
    instruction: step?.blockingMessage ?? "Complete the current setup step before moving forward.",
    why: SETUP_STEP_WHY[stepId],
    blockingMessage: step?.blockingMessage ?? null,
    primaryActionLabel: `Go to ${label}`,
    primaryTargetAnchor: SETUP_STEP_ANCHORS[stepId],
  };
}

export function getDemoJudgeWizardGuidance(
  corrected: boolean,
  target?: DemoJudgeCorrectionTarget | null
): DemoWizardGuidance {
  const athleteName = target?.athleteName?.trim() || "the highlighted athlete";
  const climberNumber = target?.climberNumber?.trim();
  const athleteLabel = climberNumber ? `${athleteName} (#${climberNumber})` : athleteName;
  const roundName = target?.roundName?.trim() || "Qualifier";
  const climbNumber = target?.climbNumber ?? 3;
  const currentScore = formatDemoJudgeScoreLabel(target?.currentScore ?? "Top on try 3, zone reached");
  const correctedScore = formatDemoJudgeScoreLabel(target?.correctedScore ?? "Top on try 1, zone reached");

  if (corrected) {
    return {
      title: "Nice work. The leaderboard is accurate.",
      instruction: "Next, go back to the organizer dashboard and advance finalists.",
      why: "Score corrections update the real leaderboard that determines the finals field.",
      blockingMessage: null,
      primaryActionLabel: "Go to Organizer Dashboard",
    };
  }

  return {
    title: "One score needs a quick fix",
    instruction: `Find ${athleteLabel}, open Boulder ${climbNumber} in ${roundName}, and change the demo mistake from "${currentScore}" to "${correctedScore}". Save the score when it looks right.`,
    why: "You are using the real score editor. The walkthrough just points you to the athlete and boulder that need attention.",
    blockingMessage: `Save Boulder ${climbNumber} for ${athleteLabel} as "${correctedScore}" to continue.`,
    primaryActionLabel: "Highlight Athlete",
    primaryTargetAnchor: "judge-entry-cards",
  };
}

export function getDemoOrganizerWizardGuidance({
  qualifierLocked,
  hasSemifinal = false,
  semifinalOpened = false,
  semifinalLocked = false,
  finalistsPersisted,
  finalsScoresReady = finalistsPersisted,
  advancementSourceLabel = "qualifier",
}: {
  qualifierLocked: boolean;
  hasSemifinal?: boolean;
  semifinalOpened?: boolean;
  semifinalLocked?: boolean;
  finalistsPersisted: boolean;
  finalsScoresReady?: boolean;
  advancementSourceLabel?: string;
}): DemoWizardGuidance {
  const sourceLabel = advancementSourceLabel.toLowerCase() === "semifinal" ? "semifinal" : "qualifier";
  if (finalistsPersisted && finalsScoresReady) {
    return {
      title: "Finalists are set.",
      instruction: "Next, view the public event page after the demo finals scores are ready.",
      why: "The public event page now reflects the real finalist field and finals attempts.",
      blockingMessage: null,
      primaryActionLabel: "View Public Page",
    };
  }

  if (finalistsPersisted) {
    return {
      title: "Finalists are set.",
      instruction: "Finals scores are being prepared before the public page unlocks.",
      why: "Public results should not be marked complete until finalists have real finals attempts.",
      blockingMessage: "Finals scores are still being prepared.",
      primaryActionLabel: "Waiting for finals scores",
      primaryTargetAnchor: "organizer-advance-finals",
    };
  }

  if (!qualifierLocked) {
    return {
      title: hasSemifinal ? "Prepare semifinals" : "Set the finals field",
      instruction: hasSemifinal
        ? "Lock qualifiers, then open semifinals."
        : "Lock qualifiers so the finals field is based on stable scores.",
      why: hasSemifinal
        ? "Semifinals should only open after qualifier scoring is frozen."
        : "Finalists should only be advanced after qualifier scoring is frozen.",
      blockingMessage: hasSemifinal
        ? "Lock qualifiers before opening semifinals."
        : "Lock qualifiers before advancing finalists.",
      primaryActionLabel: "Show lock button",
      primaryTargetAnchor: "organizer-lock-qualifiers",
    };
  }

  if (hasSemifinal && !semifinalOpened) {
    return {
      title: "Open semifinals",
      instruction: "Open semifinals so judges can score the next round.",
      why: "The semifinal round uses the same real judge workflow as qualifiers, but with its own active round.",
      blockingMessage: "Open semifinals before reviewing semifinal standings.",
      primaryActionLabel: "Show semifinals button",
      primaryTargetAnchor: "organizer-open-semifinals",
    };
  }

  if (hasSemifinal && !semifinalLocked) {
    return {
      title: "Set the finals field",
      instruction: "Lock semifinals, then advance finalists.",
      why: "The finals field should come from frozen semifinal standings.",
      blockingMessage: "Lock semifinals before advancing finalists.",
      primaryActionLabel: "Show semifinal lock",
      primaryTargetAnchor: "organizer-lock-semifinals",
    };
  }

  return {
    title: "Advance finalists",
    instruction: "Advance the finalist field and start finals.",
    why: `This creates the real finals field from the ${sourceLabel} rankings.`,
    blockingMessage: "Advance finalists before opening the public event.",
    primaryActionLabel: "Show advance button",
    primaryTargetAnchor: "organizer-advance-finals",
  };
}

export function getDemoPublicWizardGuidance(publicReady: boolean): DemoWizardGuidance {
  if (publicReady) {
    return {
      title: "Demo Complete",
      instruction: "You've run a full climbing competition.",
      why: "The event, judge scores, finalist field, finals attempts, and public page all came from the real app workflow.",
      blockingMessage: null,
      primaryActionLabel: "Review Public Results",
      primaryTargetAnchor: "public-results",
    };
  }

  return {
    title: "Public view",
    instruction: "This is what climbers and spectators see.",
    why: "Public standings, finalists, and finals results update from the live competition data.",
    blockingMessage: null,
    primaryActionLabel: "Review Leaderboard",
    primaryTargetAnchor: "public-leaderboard",
  };
}
