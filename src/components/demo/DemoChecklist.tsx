"use client";

import { cn } from "@/lib/cn";

export type DemoChecklistStepId = "create" | "register" | "score" | "leaderboard";

export type DemoChecklistStep = {
  id: DemoChecklistStepId;
  label: string;
  description: string;
};

export const DEMO_CHECKLIST_STEPS: DemoChecklistStep[] = [
  {
    id: "create",
    label: "Create competition",
    description: "Load the seeded event and confirm the organizer setup.",
  },
  {
    id: "register",
    label: "Register athletes",
    description: "Review the sample field, categories, and schedule block.",
  },
  {
    id: "score",
    label: "Start scoring",
    description: "Submit a real score through the scoring workflow.",
  },
  {
    id: "leaderboard",
    label: "View leaderboard",
    description: "Watch rankings move as live results come in.",
  },
];

type DemoChecklistProps = {
  activeStep: DemoChecklistStepId;
  completedSteps?: Set<DemoChecklistStepId>;
  onSelectStep: (stepId: DemoChecklistStepId) => void;
};

export function DemoChecklist({ activeStep, completedSteps = new Set(), onSelectStep }: DemoChecklistProps) {
  return (
    <aside className="sticky top-28 space-y-3 rounded-[1.4rem] border border-slate-200 bg-white/82 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div>
        <div className="results-kicker">Guided checklist</div>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">Run the event</h2>
      </div>
      <div className="space-y-2">
        {DEMO_CHECKLIST_STEPS.map((step, index) => {
          const active = step.id === activeStep;
          const complete = completedSteps.has(step.id);
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectStep(step.id)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "w-full rounded-[1rem] border px-3 py-3 text-left transition-all duration-200",
                active
                  ? "border-sky-200 bg-sky-50 text-sky-900 shadow-[0_12px_24px_rgba(14,116,215,0.08)]"
                  : "border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    complete
                      ? "bg-emerald-100 text-emerald-700"
                      : active
                        ? "bg-sky-600 text-white"
                        : "bg-slate-100 text-slate-500",
                  )}
                >
                  {complete ? "OK" : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-950">{step.label}</span>
                  <span className="mt-1 block text-xs leading-5">{step.description}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
