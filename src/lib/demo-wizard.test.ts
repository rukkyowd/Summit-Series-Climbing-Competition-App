import { describe, expect, it } from "vitest";
import {
  DEMO_WIZARD_STEPS,
  getDemoCreateWizardGuidance,
  getDemoJudgeWizardGuidance,
  getDemoOrganizerWizardGuidance,
  getDemoPublicWizardGuidance,
  isDemoWizardStepComplete,
  normalizeDemoWizardProgress,
} from "@/lib/demo-wizard";
import type { DemoSetupValidation } from "@/lib/demo-setup-validation";

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
      title: "Demo - Organizer",
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

  it("gives exact judge correction instructions before continuing", () => {
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
    expect(guidance.instruction).toContain("Boulder 3 is currently Top in 3 attempts, Zone yes");
    expect(guidance.instruction).toContain("Set Boulder 3 to Top in 1 attempt, Zone yes, then Save.");
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
      primaryActionLabel: "Finals Scores Pending",
      blockingMessage: "Demo finals scores are not ready yet.",
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
      title: "Demo - Public View",
      primaryTargetAnchor: "public-leaderboard",
    });
    expect(getDemoPublicWizardGuidance(true)).toMatchObject({
      title: "Demo Complete",
      primaryTargetAnchor: "public-results",
    });
  });
});
