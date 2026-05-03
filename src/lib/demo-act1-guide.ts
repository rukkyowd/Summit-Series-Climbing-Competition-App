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
      "Youth Championship with Finals is locked for this story so categories, rounds, schedule, finalist advancement, and public results stay connected.",
    why: "The preset keeps Act 3 meaningful by guaranteeing a finals-capable event before scoring starts.",
    anchorId: "guided-act1-preset",
  },
  {
    id: "registration",
    title: "Registration",
    explanation:
      "Configure the public registration window and capacity. The demo simulates athletes after creation so the real judge and leaderboard screens have data.",
    why: "Registration settings explain where climbers, private scorecards, categories, and judge assignments come from.",
    anchorId: "guided-act1-registration",
  },
  {
    id: "create",
    title: "Create Demo Event",
    explanation:
      "Now submit the real form. After creation, the demo seeds climbers, qualifier scores, Maya's scoring mistake, and finals-ready structure.",
    why: "This is the only step that creates the event and starts server-side demo population.",
    anchorId: "guided-act1-create",
  },
];

export function clampGuidedAct1StepIndex(stepIndex: number) {
  return Math.max(0, Math.min(GUIDED_ORGANIZER_ACT_1_STEPS.length - 1, stepIndex));
}

export function getGuidedAct1FormStepId(stepIndex: number): GuidedDemoSetupStepId {
  return GUIDED_ORGANIZER_ACT_1_STEPS[clampGuidedAct1StepIndex(stepIndex)].id;
}
