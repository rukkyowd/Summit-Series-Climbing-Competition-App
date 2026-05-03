"use client";

import { Button } from "@/components/ui/button";

export type GuidedDemoWalkthroughStep = {
  id: string;
  label: string;
  title: string;
  description: string;
  why: string;
};

export const DEMO_STORY_WALKTHROUGH_STEPS: GuidedDemoWalkthroughStep[] = [
  {
    id: "build-event",
    label: "Build Event",
    title: "Organizer: Build the event",
    description: "Create the demo competition through the real staff setup flow.",
    why: "This proves the public page, staff workspace, judge panel, categories, schedule, and stages all come from the same event.",
  },
  {
    id: "seed-field",
    label: "Open Judge",
    title: "Add the sample field",
    description: "Click Go to Judge Panel to add climbers, seeded scores, and the intentional Maya Chen mistake.",
    why: "The sample data appears only after you confirm the handoff, so setup still feels like real organizer work.",
  },
  {
    id: "score-key-climb",
    label: "Judge",
    title: "Judge: correct Maya Chen",
    description: "Use the real judge screen to change #104 Maya Chen on B3 from Top in 3 to Top in 1.",
    why: "This shows how a live score correction can change ranking without judges touching admin tools.",
  },
  {
    id: "advance-finalists",
    label: "Advance",
    title: "Organizer: advance finalists",
    description: "Return to staff controls, review the cut line, lock qualifiers, advance finalists, and start finals.",
    why: "Organizers need confidence before turning live qualifier data into a finals field.",
  },
  {
    id: "view-results",
    label: "Public",
    title: "Public: view results",
    description: "Open the public event and leaderboard to see what athletes, parents, coaches, and spectators see.",
    why: "The demo ends by showing the same data flowing out to public-facing event pages.",
  },
  {
    id: "finish-demo",
    label: "Finish",
    title: "Finish and clean up",
    description: "Finish the demo from the demo workspace when you are done exploring.",
    why: "Cleanup keeps demo competitions out of the normal homepage and staff lists after the walkthrough.",
  },
];

type GuidedDemoWalkthroughProps = {
  eyebrow?: string;
  steps?: GuidedDemoWalkthroughStep[];
  currentStepIndex: number;
  storyConnection: string;
  onSelectStep: (stepIndex: number) => void;
  onRestart: () => void;
};

export function GuidedDemoWalkthrough({
  eyebrow = "Guided demo walkthrough",
  steps = DEMO_STORY_WALKTHROUGH_STEPS,
  currentStepIndex,
  storyConnection,
  onSelectStep,
  onRestart,
}: GuidedDemoWalkthroughProps) {
  const safeStepIndex = Math.max(0, Math.min(steps.length - 1, currentStepIndex));
  const currentStep = steps[safeStepIndex] ?? steps[0];
  const canAdvance = safeStepIndex < steps.length - 1;

  return (
    <section className="space-y-4 rounded-[2rem] border border-slate-200 bg-white/92 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
      <div className="space-y-3">
        <div className="results-kicker text-sky-700">{eyebrow}</div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{currentStep.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{currentStep.description}</p>
        </div>
        <div className="rounded-[1.2rem] border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm leading-6 text-sky-950">
          <span className="font-semibold">Why this matters:</span> {currentStep.why}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          size="compact"
          disabled={!canAdvance}
          onClick={() => onSelectStep(safeStepIndex + 1)}
        >
          Next guide step
        </Button>
        <Button type="button" variant="secondary" size="compact" onClick={onRestart}>
          Restart guide
        </Button>
      </div>

      <div className="text-xs leading-5 text-slate-500">
        Guide navigation only moves the explanation and highlight. It never saves, creates, scores,
        advances, deletes, or populates demo data.
      </div>

      <div className="flex flex-wrap gap-2">
        {steps.map((step, index) => {
          const isActive = index === safeStepIndex;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectStep(index)}
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                isActive
                  ? "border-sky-300 bg-sky-100 text-sky-900"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
              }`}
            >
              {step.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-[1.2rem] border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-950">
        <span className="font-semibold">Story connection:</span> {storyConnection}
      </div>
    </section>
  );
}
