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

export function getDemoCreateWizardGuidance(
  validation: DemoSetupValidation,
  eventShellCreated: boolean
): DemoWizardGuidance {
  if (!eventShellCreated) {
    return {
      title: "Demo - Organizer",
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

export function getDemoJudgeWizardGuidance(corrected: boolean): DemoWizardGuidance {
  if (corrected) {
    return {
      title: "Nice - the leaderboard is now accurate.",
      instruction: "Next, go back to the organizer dashboard and advance finalists.",
      why: "Score corrections update the real leaderboard that determines the finals field.",
      blockingMessage: null,
      primaryActionLabel: "Go to Organizer Dashboard",
    };
  }

  return {
    title: "Demo - Judge",
    instruction: "Find Athlete C and correct their score on Boulder 3.",
    why: "This uses the real score editor; the walkthrough only helps you find the right athlete.",
    blockingMessage: "Correct Athlete C's Boulder 3 score before continuing.",
    primaryActionLabel: "Highlight Athlete",
    primaryTargetAnchor: "judge-entry-cards",
  };
}

export function getDemoOrganizerWizardGuidance({
  qualifierLocked,
  finalistsPersisted,
}: {
  qualifierLocked: boolean;
  finalistsPersisted: boolean;
}): DemoWizardGuidance {
  if (finalistsPersisted) {
    return {
      title: "Finalists are set.",
      instruction: "Next, view the public event page.",
      why: "The public event page now reflects the real finalist field.",
      blockingMessage: null,
      primaryActionLabel: "View Public Page",
    };
  }

  if (!qualifierLocked) {
    return {
      title: "Demo - Organizer",
      instruction: "Lock qualifiers so the cut line cannot change.",
      why: "Finalists should only be advanced after qualifier scoring is frozen.",
      blockingMessage: "Lock qualifiers before advancing finalists.",
      primaryActionLabel: "Find Lock Qualifiers",
      primaryTargetAnchor: "organizer-lock-qualifiers",
    };
  }

  return {
    title: "Advance finalists",
    instruction: "Advance the finalist field and start finals.",
    why: "This creates the real finals field from the qualifier rankings.",
    blockingMessage: "Advance finalists before opening the public event.",
    primaryActionLabel: "Find Advance Finalists",
    primaryTargetAnchor: "organizer-advance-finals",
  };
}

export function getDemoPublicWizardGuidance(publicReady: boolean): DemoWizardGuidance {
  if (publicReady) {
    return {
      title: "Demo Complete",
      instruction: "You've run a full climbing competition.",
      why: "The event, judge scores, finalist field, and public page all came from the real app workflow.",
      blockingMessage: null,
      primaryActionLabel: "Review Public Results",
      primaryTargetAnchor: "public-results",
    };
  }

  return {
    title: "Demo - Public View",
    instruction: "This is what climbers and spectators see.",
    why: "Public standings and finalist information update from the live competition data.",
    blockingMessage: null,
    primaryActionLabel: "Review Leaderboard",
    primaryTargetAnchor: "public-leaderboard",
  };
}
