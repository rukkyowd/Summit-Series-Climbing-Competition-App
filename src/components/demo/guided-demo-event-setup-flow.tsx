"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import {
  buildGuidedDemoSetupModel,
  type GuidedDemoSetupStepId,
} from "@/lib/guided-demo-setup";

const setupModel = buildGuidedDemoSetupModel();

type GuidedDemoEventSetupFlowProps = {
  busy: boolean;
  onBack: () => void;
  onCreateDemoEvent: () => void;
};

function stepIndex(stepId: GuidedDemoSetupStepId) {
  return setupModel.steps.findIndex((step) => step.id === stepId);
}

export function GuidedDemoEventSetupFlow({
  busy,
  onBack,
  onCreateDemoEvent,
}: GuidedDemoEventSetupFlowProps) {
  const [activeStepId, setActiveStepId] = useState<GuidedDemoSetupStepId>("preset");
  const activeStep = setupModel.steps.find((step) => step.id === activeStepId) ?? setupModel.steps[0];
  const activeStepIndex = stepIndex(activeStep.id);
  const nextStep = setupModel.steps[activeStepIndex + 1] ?? null;
  const previousStep = setupModel.steps[activeStepIndex - 1] ?? null;

  return (
    <Surface variant="panel" density="public" className="space-y-6 border-sky-200 bg-white/95">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Badge>Act 1 setup flow</Badge>
          <div>
            <h2 className="text-3xl font-black tracking-[-0.03em] text-slate-950">
              Create the Demo Event
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
              Walk through the same setup decisions a real organizer makes: pick the event shape,
              review categories, confirm finals eligibility, inspect the schedule, then create the
              canonical demo competition.
            </p>
            <p className="mt-3 max-w-4xl rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-900">
              This demo uses a Youth Championship with Finals preset so you can see the full event
              lifecycle: setup, qualifier scoring, leaderboard movement, finalist advancement,
              finals, and public results.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
          <Button variant="primary" size="lg" onClick={onCreateDemoEvent} disabled={busy}>
            Create Demo Event
          </Button>
          <Button variant="secondary" size="lg" onClick={onBack} disabled={busy}>
            Back to Demo Home
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <nav className="space-y-2" aria-label="Demo setup steps">
          {setupModel.steps.map((step, index) => {
            const isActive = step.id === activeStep.id;
            const isVisited = index < activeStepIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStepId(step.id)}
                disabled={busy}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left transition",
                  isActive
                    ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]"
                    : isVisited
                      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-[0.18em]">
                    Step {index + 1}
                  </span>
                  <span className="rounded-full bg-white/20 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
                    {isActive ? "Active" : isVisited ? "Reviewed" : "Open"}
                  </span>
                </div>
                <div className="mt-2 font-black">{step.title}</div>
                <div className={cn("mt-1 text-xs leading-5", isActive ? "text-slate-200" : "text-slate-500")}>
                  {step.description}
                </div>
              </button>
            );
          })}
        </nav>

        <div className="space-y-4">
          {activeStep.id === "preset" ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">
                    Preset selection
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    {setupModel.preset.name}
                  </h3>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-800">
                  Required for story
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {setupModel.preset.description}
              </p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                The guided story locks this finals-capable preset. Qualifier-only presets like
                Community Scramble and Recreational Scramble are available in the normal setup flow,
                but not in this full lifecycle demo.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs font-bold text-slate-500">Qualifier problems</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">
                    {setupModel.preset.qualifierProblemCount}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs font-bold text-slate-500">Counting climbs</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">
                    {setupModel.preset.countingClimbs}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs font-bold text-slate-500">Finals cutoff</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">
                    Top {setupModel.preset.finalsCutoff}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {activeStep.id === "categories" ? (
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-5">
              <h3 className="font-black text-slate-950">Generated categories</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The preset generates the youth field the same way the organizer setup flow does.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {setupModel.categories.map((category) => (
                  <span
                    key={category.id}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700"
                  >
                    {category.displayName}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {activeStep.id === "finals" ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5">
                <h3 className="font-black text-emerald-950">Finals-eligible categories</h3>
                <p className="mt-2 text-sm leading-6 text-emerald-900">
                  Youth D and Youth C compete in qualifiers, but they do not advance to finals by
                  default. Youth B, Youth A, and Junior are finals-eligible.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {setupModel.finalsEligibleCategories.map((category) => (
                    <span
                      key={category.id}
                      className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-800"
                    >
                      {category.displayName}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-sky-200 bg-sky-50/80 p-5">
                <h3 className="font-black text-sky-950">How finals work in this demo</h3>
                <div className="mt-4 grid gap-3">
                  {setupModel.finalsStorySteps.map((step, index) => (
                    <div key={step.title} className="flex gap-3 rounded-2xl bg-white/80 p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-black text-white">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-black text-slate-950">{step.title}</p>
                        <p className="mt-1 text-sm leading-5 text-slate-600">{step.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeStep.id === "schedule" ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(16rem,0.65fr)]">
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-5">
                <h3 className="font-black text-slate-950">Schedule blocks</h3>
                <ol className="mt-4 space-y-2">
                  {setupModel.scheduleBlocks.map((block, index) => (
                    <li
                      key={`${block.phaseType}-${block.label}`}
                      className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-black text-slate-950">{block.label}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {block.phaseType.replaceAll("_", " ")} / {block.audienceLabel}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-5">
                <h3 className="font-black text-slate-950">Rounds</h3>
                <div className="mt-4 space-y-3">
                  {setupModel.rounds.map((round) => (
                    <div key={round.title} className="rounded-2xl bg-slate-50 p-4">
                      <p className="font-black text-slate-950">{round.title}</p>
                      <p className="mt-1 text-sm leading-5 text-slate-600">{round.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeStep.id === "create" ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5">
              <h3 className="text-2xl font-black tracking-tight text-emerald-950">
                Ready to create the canonical demo event
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-900">
                This will reset only the canonical demo competition, regenerate demo_metadata and
                target climber metadata, seed registrations and scores, then open the judge panel.
                Real competitions are not touched.
              </p>
              <Button
                variant="primary"
                size="lg"
                className="mt-5"
                onClick={onCreateDemoEvent}
                disabled={busy}
              >
                Create Demo Event
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Button
              variant="secondary"
              size="compact"
              onClick={() => previousStep && setActiveStepId(previousStep.id)}
              disabled={busy || !previousStep}
            >
              Back
            </Button>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {activeStep.title}
            </div>
            {nextStep ? (
              <Button
                variant="primary"
                size="compact"
                onClick={() => setActiveStepId(nextStep.id)}
                disabled={busy}
              >
                Next
              </Button>
            ) : (
              <Button variant="primary" size="compact" onClick={onCreateDemoEvent} disabled={busy}>
                Create Demo Event
              </Button>
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
}
