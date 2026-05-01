"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";

const TOUR_STATE_KEY = "organizer_demo_tour_state_v2";

export type OrganizerDemoStepId =
  | "overview"
  | "basics_name"
  | "basics_format"
  | "basics_registration"
  | "categories"
  | "preset"
  | "schedule"
  | "stages"
  | "create_event"
  | "event_name"
  | "event_details"
  | "save_event"
  | "handoff";

export type OrganizerDemoHandoffTarget = "judge" | "leaderboard" | "display";

type OrganizerDemoTourProps = {
  hasCreatedCompetition: boolean;
  competitionName: string;
  eventNameEntered: boolean;
  eventDetailsComplete: boolean;
  eventSaved: boolean;
  judgeReady: boolean;
  suppressed?: boolean;
  onActiveStepChange: (stepId: OrganizerDemoStepId) => void;
  onRestart: () => void;
  onJumpToCreate: () => void;
  onFocusAnchor: (anchor: string) => void;
  onLaunchJudge: () => void;
};

const baseSteps: Array<{
  id: OrganizerDemoStepId;
  title: string;
  body: string;
}> = [
  {
    id: "create_event",
    title: "Create the event for real",
    body: "Start from the empty organizer state and create the competition yourself. This is the first proof point in the story.",
  },
  {
    id: "event_name",
    title: "Name the comp",
    body: "Use the real event name field so the buyer sees a believable setup flow instead of a canned sample.",
  },
  {
    id: "event_details",
    title: "Set the format, dates, and rules",
    body: "Move through categories, structure, schedule, and stages until the event is fully configured.",
  },
  {
    id: "save_event",
    title: "Save the event",
    body: "Lock in the organizer setup with the real save button before you move into the judge experience.",
  },
  {
    id: "handoff",
    title: "Open the judge panel",
    body: "Once the saved event is ready, launch the judge panel and let the simulation bring the comp to life.",
  },
];

export function OrganizerDemoTour({
  hasCreatedCompetition,
  competitionName,
  eventNameEntered,
  eventDetailsComplete,
  eventSaved,
  judgeReady,
  suppressed = false,
  onActiveStepChange,
  onRestart,
  onJumpToCreate,
  onFocusAnchor,
  onLaunchJudge,
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
    if (!suppressed) {
      onActiveStepChange(activeStep.id);
    }
  }, [activeStep.id, onActiveStepChange, suppressed]);

  const stepRequirement = useMemo(() => {
    if (activeStep.id === "create_event") {
      return {
        complete: hasCreatedCompetition,
        label: hasCreatedCompetition
          ? `${competitionName || "Your event"} has been created.`
          : "Click Create event to generate the event record and unlock the organizer setup panel.",
      };
    }

    if (activeStep.id === "event_name") {
      return {
        complete: eventNameEntered,
        label: eventNameEntered
          ? `${competitionName || "The event"} has a name.`
          : "Fill in the real event name field first.",
      };
    }

    if (activeStep.id === "event_details") {
      return {
        complete: eventDetailsComplete,
        label: eventDetailsComplete
          ? "Categories, structure, schedule, and stages are configured."
          : "Work through the organizer setup cards until all five setup areas show ready.",
      };
    }

    if (activeStep.id === "save_event") {
      return {
        complete: eventSaved,
        label: eventSaved
          ? "The current organizer setup is saved."
          : "Click Save competition after you finish the setup cards.",
      };
    }

    return {
      complete: judgeReady,
      label: judgeReady
        ? "The judge panel is unlocked and ready to simulate registrations."
        : "The judge panel unlocks after the event is fully configured and saved.",
    };
  }, [activeStep.id, competitionName, eventDetailsComplete, eventNameEntered, eventSaved, hasCreatedCompetition, judgeReady]);

  if (suppressed) {
    return null;
  }

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
          {activeStep.id === "create_event" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onJumpToCreate} className="results-primary-button">
                Open create form
              </button>
            </div>
          ) : null}
          {activeStep.id === "event_name" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onJumpToCreate();
                  onFocusAnchor("organizer-create-name");
                }}
                className="results-primary-button"
              >
                Focus event name
              </button>
            </div>
          ) : null}
          {activeStep.id === "event_details" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onFocusAnchor("organizer-progress")}
                className="results-primary-button"
              >
                Open setup cards
              </button>
            </div>
          ) : null}
          {activeStep.id === "save_event" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onFocusAnchor("organizer-save-event")}
                className="results-primary-button"
              >
                Focus save button
              </button>
            </div>
          ) : null}
          {activeStep.id === "handoff" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onLaunchJudge}
                disabled={!judgeReady}
                className={judgeReady ? "results-primary-button" : "results-secondary-button opacity-60"}
              >
                Go to judge panel
              </button>
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
