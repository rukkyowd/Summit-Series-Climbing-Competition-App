import { describe, expect, it } from "vitest";
import {
  GUIDED_ORGANIZER_ACT_1_STEPS,
  clampGuidedAct1StepIndex,
  getGuidedAct1FormStepId,
} from "./demo-act1-guide";

describe("guided Act 1 guide mapping", () => {
  it("keeps the guide aligned to real StaffEventCreationForm sections only", () => {
    expect(GUIDED_ORGANIZER_ACT_1_STEPS.map((step) => step.id)).toEqual([
      "basics",
      "preset",
      "registration",
      "create",
    ]);
  });

  it("maps out-of-range guide indexes to valid form highlights", () => {
    expect(clampGuidedAct1StepIndex(-1)).toBe(0);
    expect(clampGuidedAct1StepIndex(99)).toBe(GUIDED_ORGANIZER_ACT_1_STEPS.length - 1);
    expect(getGuidedAct1FormStepId(99)).toBe("create");
  });

  it("documents that guide navigation is not a create or seed trigger", () => {
    expect(GUIDED_ORGANIZER_ACT_1_STEPS[0].anchorId).toBe("guided-act1-basics");
    expect(GUIDED_ORGANIZER_ACT_1_STEPS.at(-1)?.anchorId).toBe("guided-act1-create");
  });
});
