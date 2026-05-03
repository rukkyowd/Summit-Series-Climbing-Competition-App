export type GuidedDemoSetupStepId = "basics" | "preset" | "registration" | "create";

export type GuidedOrganizerWalkthroughStep = {
  id: GuidedDemoSetupStepId;
  title: string;
  explanation: string;
  why: string;
  anchorId: string;
};

export const GUIDED_ORGANIZER_ACT_1_STEPS: GuidedOrganizerWalkthroughStep[] = [
  {
    id: "basics",
    title: "Event basics",
    explanation: "Name the event and confirm where and when it runs.",
    why: "This gives the public page, staff workspace, and judge screens a believable event identity.",
    anchorId: "guided-act1-basics",
  },
  {
    id: "preset",
    title: "Preset",
    explanation:
      "Choose any preset or format that fits the event you want to build. The sandbox explains tradeoffs without forcing the choice.",
    why: "This keeps the walkthrough honest: users experience the real organizer controls and can deviate safely.",
    anchorId: "guided-act1-preset",
  },
  {
    id: "registration",
    title: "Registration",
    explanation:
      "Configure the public registration window and capacity. Sample athletes are added only after you confirm the judge handoff.",
    why: "Registration settings explain where climbers, private scorecards, categories, and judge assignments come from.",
    anchorId: "guided-act1-registration",
  },
  {
    id: "create",
    title: "Create Demo Event",
    explanation:
      "Now submit the real form. After creation, review the generated setup before choosing Go to Judge Panel.",
    why: "Creation uses the real backend; seeding waits for the explicit judge handoff.",
    anchorId: "guided-act1-create",
  },
];

export function clampGuidedAct1StepIndex(stepIndex: number) {
  return Math.max(0, Math.min(GUIDED_ORGANIZER_ACT_1_STEPS.length - 1, stepIndex));
}

export function getGuidedAct1FormStepId(stepIndex: number): GuidedDemoSetupStepId {
  return GUIDED_ORGANIZER_ACT_1_STEPS[clampGuidedAct1StepIndex(stepIndex)].id;
}
