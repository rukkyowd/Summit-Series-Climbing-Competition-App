import { describe, expect, it } from "vitest";
import {
  DEMO_WIZARD_STEPS,
  formatDemoJudgeScoreLabel,
  getDemoSetupStepCardAnchor,
  getDemoCreateWizardGuidance,
  getDemoJudgeWizardGuidance,
  getDemoOrganizerWizardGuidance,
  getDemoPublicWizardGuidance,
  isDemoWizardStepComplete,
  normalizeDemoWizardProgress,
} from "@/lib/demo-wizard";
import { DEMO_SETUP_STEPS, type DemoSetupValidation } from "@/lib/demo-setup-validation";

function validation(overrides: Partial<DemoSetupValidation> = {}): DemoSetupValidation {
  return {
    steps: [
      { id: "basics", label: "Basics", complete: false, blockingMessage: "Complete basics." },
      { id: "presets", label: "Preset", complete: false, blockingMessage: "Choose a preset." },
      { id: "categories", label: "Categories", complete: false, blockingMessage: "Add categories." },
      { id: "schedule", label: "Schedule", complete: false, blockingMessage: "Add schedule." },
      { id: "stages", label: "Stages", complete: false, blockingMessage: "Add stages." },
      { id: "review", label: "Review", complete: false, blockingMessage: "Save first." },
    ],
    firstIncompleteStep: "basics",
    firstBlockingMessage: "Complete basics.",
    canContinueToJudge: false,
    ...overrides,
  };
}

describe("demo wizard helpers", () => {
  it("normalizes missing progress flags to false", () => {
    expect(normalizeDemoWizardProgress({ eventReady: true })).toEqual({
      eventReady: true,
      dataPopulated: false,
      keyScoreCorrected: false,
      organizerAdvanced: false,
      publicReady: false,
    });
  });

  it("derives step completion from progress keys", () => {
    const progress = normalizeDemoWizardProgress({
      eventReady: true,
      keyScoreCorrected: true,
    });

    expect(isDemoWizardStepComplete(DEMO_WIZARD_STEPS[0], progress)).toBe(true);
    expect(isDemoWizardStepComplete(DEMO_WIZARD_STEPS[1], progress)).toBe(true);
    expect(isDemoWizardStepComplete(DEMO_WIZARD_STEPS[2], progress)).toBe(false);
  });

  it("targets event creation before the shell exists", () => {
    const guidance = getDemoCreateWizardGuidance(validation(), false);

    expect(guidance).toMatchObject({
      title: "Start as the organizer",
      primaryActionLabel: "Start Event Basics",
      primaryTargetAnchor: "organizer-create-name",
    });
  });

  it("targets the first incomplete setup step after creation", () => {
    const guidance = getDemoCreateWizardGuidance(
      validation({
        firstIncompleteStep: "schedule",
        firstBlockingMessage: "Add schedule.",
      }),
      true
    );

    expect(guidance).toMatchObject({
      title: "Finish Schedule",
      blockingMessage: "Add schedule.",
      primaryTargetAnchor: "organizer-schedule",
    });
  });

  it("has a stable step-card highlight target for every Act 1 setup step", () => {
    expect(DEMO_SETUP_STEPS.map((step) => [step.id, getDemoSetupStepCardAnchor(step.id)])).toEqual([
      ["basics", "organizer-step-basics"],
      ["presets", "organizer-step-preset"],
      ["categories", "organizer-step-categories"],
      ["schedule", "organizer-step-schedule"],
      ["stages", "organizer-step-stages"],
      ["review", "organizer-step-review"],
    ]);
  });

  it("targets the judge handoff when setup is complete", () => {
    const completeValidation = validation({
      steps: validation().steps.map((step) => ({ ...step, complete: true, blockingMessage: null })),
      firstIncompleteStep: null,
      firstBlockingMessage: null,
      canContinueToJudge: true,
    });

    expect(getDemoCreateWizardGuidance(completeValidation, true)).toMatchObject({
      title: "Your event is ready.",
      blockingMessage: null,
      primaryTargetAnchor: "organizer-go-judge",
    });
  });

  it("normalizes raw score labels into friendly demo copy", () => {
    expect(formatDemoJudgeScoreLabel("Top in 3 attempts, Zone yes")).toBe("Top on try 3, zone reached");
    expect(formatDemoJudgeScoreLabel("Top in 1 attempt, Zone no")).toBe("Top on try 1, zone not reached");
  });

  it("gives friendly judge correction instructions before continuing", () => {
    const guidance = getDemoJudgeWizardGuidance(false, {
      athleteName: "Avery Chen",
      climberNumber: "103",
      roundName: "Qualifier",
      climbNumber: 3,
      currentScore: "Top in 3 attempts, Zone yes",
      correctedScore: "Top in 1 attempt, Zone yes",
    });

    expect(guidance).toMatchObject({
      primaryActionLabel: "Highlight Athlete",
      primaryTargetAnchor: "judge-entry-cards",
    });
    expect(guidance.instruction).toContain("Avery Chen (#103)");
    expect(guidance.instruction).toContain(
      'open Boulder 3 in Qualifier, and change the demo mistake from "Top on try 3, zone reached" to "Top on try 1, zone reached"'
    );
    expect(guidance.blockingMessage).toBe(
      'Save Boulder 3 for Avery Chen (#103) as "Top on try 1, zone reached" to continue.'
    );
    expect(`${guidance.title} ${guidance.instruction} ${guidance.blockingMessage}`).not.toMatch(
      /Zone yes|then Save|Demo - Judge|Correct Avery Chen/
    );
    expect(getDemoJudgeWizardGuidance(true)).toMatchObject({
      primaryActionLabel: "Go to Organizer Dashboard",
      blockingMessage: null,
    });
  });

  it("guides organizer actions from lock to advance to public", () => {
    expect(getDemoOrganizerWizardGuidance({ qualifierLocked: false, finalistsPersisted: false })).toMatchObject({
      primaryTargetAnchor: "organizer-lock-qualifiers",
    });
    expect(getDemoOrganizerWizardGuidance({ qualifierLocked: true, finalistsPersisted: false })).toMatchObject({
      primaryTargetAnchor: "organizer-advance-finals",
    });
    expect(getDemoOrganizerWizardGuidance({ qualifierLocked: true, finalistsPersisted: true, finalsScoresReady: false })).toMatchObject({
      primaryActionLabel: "Waiting for finals scores",
      blockingMessage: "Finals scores are still being prepared.",
    });
    expect(getDemoOrganizerWizardGuidance({ qualifierLocked: true, finalistsPersisted: true, finalsScoresReady: true })).toMatchObject({
      primaryActionLabel: "View Public Page",
      blockingMessage: null,
    });
  });

  it("uses semifinal organizer copy when finals advance from semifinals", () => {
    expect(
      getDemoOrganizerWizardGuidance({
        qualifierLocked: false,
        finalistsPersisted: false,
        advancementSourceLabel: "semifinal",
      })
    ).toMatchObject({
      instruction: "Lock semifinals so the cut line cannot change.",
      blockingMessage: "Lock semifinals before advancing finalists.",
    });
  });

  it("uses the finish copy once the public page is ready", () => {
    expect(getDemoPublicWizardGuidance(false)).toMatchObject({
      title: "Public view",
      primaryTargetAnchor: "public-leaderboard",
    });
    expect(getDemoPublicWizardGuidance(true)).toMatchObject({
      title: "Demo Complete",
      primaryTargetAnchor: "public-results",
    });
  });
});
