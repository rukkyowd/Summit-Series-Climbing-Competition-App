"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { DemoSyncStatus } from "@/components/demo/types";

const TOUR_STATE_KEY = "interactive_demo_tour_state_v2";

type InteractiveDemoTourProps = {
  pendingQueueCount: number;
  climberName: string;
  liveSaveCompleted: boolean;
  leaderboardObserved: boolean;
  offlineMode: boolean;
  offlineQueuedSaveCompleted: boolean;
  syncRecovered: boolean;
  syncStatus: DemoSyncStatus;
};

const baseSteps = [
  {
    id: "judge",
    title: "Find the demo athlete",
    body: "__ATHLETE__ is highlighted as the first scoring example. This is the one row to act on first.",
  },
  {
    id: "save",
    title: "Save one judge call",
    body: "Add the result on Boulder 1, then hit Save judge call. Continue unlocks after the official score is saved.",
  },
  {
    id: "leaderboard",
    title: "Watch the ranking react",
    body: "The leaderboard on the right should move as soon as the save lands. Continue unlocks once the rank impact is visible.",
  },
  {
    id: "offline",
    title: "Simulate a Wi-Fi drop",
    body: "Turn on Simulate Wi-Fi drop, save the demo athlete again, and leave the score queued locally.",
  },
  {
    id: "sync",
    title: "Reconnect and sync",
    body: "Turn Wi-Fi back on or hit Reconnect and sync. Continue unlocks once the queued score publishes.",
  },
] as const;

export function InteractiveDemoTour({
  pendingQueueCount,
  climberName,
  liveSaveCompleted,
  leaderboardObserved,
  offlineMode,
  offlineQueuedSaveCompleted,
  syncRecovered,
  syncStatus,
}: InteractiveDemoTourProps) {
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
      // Ignore bad local tour state.
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

  const steps = useMemo(
    () =>
      baseSteps.map((step) =>
        step.id === "sync" && pendingQueueCount > 0
          ? {
              ...step,
              body: `${pendingQueueCount} queued ${
                pendingQueueCount === 1 ? "score is" : "scores are"
              } waiting right now. Reconnect and publish them to finish the resilience story.`,
            }
          : {
              ...step,
              body: step.body.replace("__ATHLETE__", climberName),
            }
      ),
    [climberName, pendingQueueCount]
  );

  const activeStep = steps[stepIndex];
  const stepRequirement = useMemo(() => {
    if (activeStep.id === "judge") {
      return {
        complete: true,
        label: "The demo athlete is already highlighted.",
      };
    }

    if (activeStep.id === "save") {
      return {
        complete: liveSaveCompleted,
        label: liveSaveCompleted
          ? "Live score saved."
          : `Save ${climberName} on Boulder 1 to unlock Continue.`,
      };
    }

    if (activeStep.id === "leaderboard") {
      return {
        complete: leaderboardObserved,
        label: leaderboardObserved
          ? "Leaderboard impact confirmed."
          : "Wait for the leaderboard row to highlight and show the rank change.",
      };
    }

    if (activeStep.id === "offline") {
      return {
        complete: offlineQueuedSaveCompleted,
        label: offlineQueuedSaveCompleted
          ? "Offline queue created."
          : offlineMode
            ? `Save ${climberName} again while Wi-Fi is dropped so it queues locally.`
            : "Turn on Simulate Wi-Fi drop, then save the demo athlete again.",
      };
    }

    return {
      complete: syncRecovered,
      label: syncRecovered
        ? "Queued score synced back to the public leaderboard."
        : syncStatus === "syncing"
          ? "Sync is running now. Wait for it to finish."
          : "Reconnect and sync the queued score to finish the walkthrough.",
    };
  }, [
    activeStep.id,
    climberName,
    leaderboardObserved,
    liveSaveCompleted,
    offlineMode,
    offlineQueuedSaveCompleted,
    syncRecovered,
    syncStatus,
  ]);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="fixed bottom-4 left-4 z-40 rounded-full border border-slate-200 bg-white/92 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl"
      >
        Resume demo tour
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
        className="fixed bottom-4 right-4 z-40 w-[min(28rem,calc(100vw-2rem))]"
      >
        <Surface variant="card" className="space-y-4 rounded-[1.8rem] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between gap-3">
            <div className="results-kicker">
              Step {stepIndex + 1} of {steps.length}
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
          <div className="flex gap-2">
            {steps.map((step, index) => (
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
                onClick={() => setStepIndex(0)}
              >
                Restart
              </Button>
              <Button
                variant="primary"
                disabled={!stepRequirement.complete}
                onClick={() => {
                  if (stepIndex === steps.length - 1) {
                    setHidden(true);
                    return;
                  }
                  setStepIndex((current) => Math.min(steps.length - 1, current + 1));
                }}
              >
                {stepIndex === steps.length - 1 ? "Finish" : "Continue"}
              </Button>
            </div>
          </div>
        </Surface>
      </motion.div>
    </AnimatePresence>
  );
}
