"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";

const TOUR_STATE_KEY = "organizer_demo_tour_state_v1";

export type OrganizerDemoStepId =
  | "overview"
  | "categories"
  | "preset"
  | "schedule"
  | "stages"
  | "handoff";

export type OrganizerDemoHandoffTarget = "judge" | "leaderboard" | "display";

type OrganizerDemoTourProps = {
  competitionName: string;
  setupOpened: boolean;
  categoriesViewed: boolean;
  presetSelectedTitle: string | null;
  scheduleViewed: boolean;
  stagesViewed: boolean;
  handoffTarget: OrganizerDemoHandoffTarget | null;
  judgeHref: string;
  leaderboardHref: string;
  displayHref: string;
  onActiveStepChange: (stepId: OrganizerDemoStepId) => void;
  onRestart: () => void;
  onHandoffClick: (target: OrganizerDemoHandoffTarget) => void;
};

const baseSteps: Array<{
  id: OrganizerDemoStepId;
  title: string;
  body: string;
}> = [
  {
    id: "overview",
    title: "Start the setup walkthrough",
    body: "Open the organizer setup spine first. This is the control flow a gym would follow before comp day starts.",
  },
  {
    id: "categories",
    title: "Confirm who can register",
    body: "Switch to Categories so the event has the right age groups before staff build rounds and schedules.",
  },
  {
    id: "preset",
    title: "Apply a proven event template",
    body: "Choose the setup preset that best matches the day. This generates the event structure without manual round-by-round setup.",
  },
  {
    id: "schedule",
    title: "Review the day schedule",
    body: "Open Schedule to confirm the generated blocks. This is how the event timing stays tied to the competition model.",
  },
  {
    id: "stages",
    title: "Check the competition stages",
    body: "Open Stages to see how qualifiers, semifinals, and finals connect before staff move into live operations.",
  },
  {
    id: "handoff",
    title: "Preview the public outputs",
    body: "Open a connected public or live staff view. The same event you just configured powers every one of these surfaces.",
  },
];

export function OrganizerDemoTour({
  competitionName,
  setupOpened,
  categoriesViewed,
  presetSelectedTitle,
  scheduleViewed,
  stagesViewed,
  handoffTarget,
  judgeHref,
  leaderboardHref,
  displayHref,
  onActiveStepChange,
  onRestart,
  onHandoffClick,
}: OrganizerDemoTourProps) {
  const reduceMotion = useReducedMotion();
  const [hidden, setHidden] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TOUR_STATE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as { hidden?: boolean; stepIndex?: number };
      setHidden(Boolean(parsed.hidden));
      if (typeof parsed.stepIndex === "number" && parsed.stepIndex >= 0 && parsed.stepIndex < baseSteps.length) {
        setStepIndex(parsed.stepIndex);
      }
    } catch {
      // Ignore bad saved organizer tour state.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      TOUR_STATE_KEY,
      JSON.stringify({
        hidden,
        stepIndex,
      })
    );
  }, [hidden, stepIndex]);

  const activeStep = baseSteps[stepIndex];

  useEffect(() => {
    onActiveStepChange(activeStep.id);
  }, [activeStep.id, onActiveStepChange]);

  const stepRequirement = useMemo(() => {
    if (activeStep.id === "overview") {
      return {
        complete: setupOpened,
        label: setupOpened
          ? "Organizer setup is open."
          : "Use the Start here button to open the organizer setup section.",
      };
    }

    if (activeStep.id === "categories") {
      return {
        complete: categoriesViewed,
        label: categoriesViewed
          ? "Categories reviewed."
          : "Switch to Categories in the setup progress area to unlock Continue.",
      };
    }

    if (activeStep.id === "preset") {
      return {
        complete: Boolean(presetSelectedTitle),
        label: presetSelectedTitle
          ? `${presetSelectedTitle} is applied to ${competitionName}.`
          : "Choose one event template in Structure so the setup flow generates rounds and schedule blocks.",
      };
    }

    if (activeStep.id === "schedule") {
      return {
        complete: scheduleViewed,
        label: scheduleViewed
          ? "Schedule reviewed."
          : "Open Schedule in the setup progress cards to inspect the day plan.",
      };
    }

    if (activeStep.id === "stages") {
      return {
        complete: stagesViewed,
        label: stagesViewed
          ? "Competition stages reviewed."
          : "Open Stages so you can see how the actual comp rounds connect.",
      };
    }

    return {
      complete: Boolean(handoffTarget),
      label: handoffTarget
        ? `${handoffTarget === "judge" ? "Judge live flow" : handoffTarget === "leaderboard" ? "Public leaderboard" : "Public display"} opened.`
        : "Open Judge live flow, Public leaderboard, or Public display to finish the organizer handoff.",
    };
  }, [
    activeStep.id,
    categoriesViewed,
    competitionName,
    handoffTarget,
    presetSelectedTitle,
    scheduleViewed,
    setupOpened,
    stagesViewed,
  ]);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="fixed bottom-4 left-4 z-40 rounded-full border border-slate-200 bg-white/92 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl"
      >
        Resume organizer tour
      </button>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeStep.id}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: reduceMotion ? 0.18 : 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="fixed bottom-4 right-4 z-40 w-[min(30rem,calc(100vw-2rem))]"
      >
        <Surface variant="card" className="space-y-4 rounded-[1.8rem] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between gap-3">
            <div className="results-kicker">
              Step {stepIndex + 1} of {baseSteps.length} - Organizer walkthrough
            </div>
            <button
              type="button"
              onClick={() => setHidden(true)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
            >
              Hide
            </button>
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{activeStep.title}</h3>
            <p className="text-sm leading-relaxed text-slate-600">{activeStep.body}</p>
          </div>
          <div
            className={`rounded-[1rem] border px-4 py-3 text-sm font-medium ${
              stepRequirement.complete
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {stepRequirement.complete ? "Ready to continue: " : "Do this next: "}
            {stepRequirement.label}
          </div>
          {activeStep.id === "handoff" ? (
            <div className="flex flex-wrap gap-2">
              <Link href={judgeHref} onClick={() => onHandoffClick("judge")} className="results-primary-button">
                See judge live flow
              </Link>
              <Link href={leaderboardHref} onClick={() => onHandoffClick("leaderboard")} className="results-secondary-button">
                Open leaderboard
              </Link>
              <Link href={displayHref} onClick={() => onHandoffClick("display")} className="results-secondary-button">
                Open display
              </Link>
            </div>
          ) : null}
          <div className="flex gap-2">
            {baseSteps.map((step, index) => (
              <div
                key={step.id}
                className={`h-2 flex-1 rounded-full ${index === stepIndex ? "bg-sky-500" : index < stepIndex ? "bg-slate-400" : "bg-slate-200"}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={stepIndex === 0}
            >
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  onRestart();
                  setStepIndex(0);
                  setHidden(false);
                }}
              >
                Restart
              </Button>
              <Button
                variant="primary"
                disabled={!stepRequirement.complete}
                onClick={() => {
                  if (stepIndex === baseSteps.length - 1) {
                    setHidden(true);
                    return;
                  }
                  setStepIndex((current) => Math.min(baseSteps.length - 1, current + 1));
                }}
              >
                {stepIndex === baseSteps.length - 1 ? "Finish" : "Continue"}
              </Button>
            </div>
          </div>
        </Surface>
      </motion.div>
    </AnimatePresence>
  );
}
