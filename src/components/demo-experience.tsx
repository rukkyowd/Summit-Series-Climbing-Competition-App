"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type DemoTourRouteId = "organizer" | "judge" | "leaderboard" | "display";

type DemoTourStep = {
  routeId: DemoTourRouteId;
  href: string;
  label: string;
  title: string;
  description: string;
  helper: string;
};

type DemoExperienceProps = {
  enabled: boolean;
  routeId: DemoTourRouteId;
  competitionSlug: string;
  bannerTitle: string;
  bannerDescription: string;
  bannerTip: string;
};

const STORAGE_STEP_KEY = "scorecard_demo_tour_step";
const STORAGE_DISMISSED_KEY = "scorecard_demo_tour_dismissed";

function buildDemoTourSteps(competitionSlug: string): DemoTourStep[] {
  return [
    {
      routeId: "organizer",
      href: "/staff/demo",
      label: "Stop 1",
      title: "Organizer dashboard",
      description: "Start here to show how one event controls setup, schedule, scoring links, and public views from a single workspace.",
      helper: "Use the event setup, schedule, and public-link sections to tell the organizer story first.",
    },
    {
      routeId: "judge",
      href: `/staff/c/${competitionSlug}/judge`,
      label: "Stop 2",
      title: "Judge scoring",
      description: "This is the phone-friendly scoring surface. Staff can tap attempts, zone, and top, then save the official qualifier result.",
      helper: "Try saving one boulder here, then jump straight to the leaderboard to show the live result.",
    },
    {
      routeId: "leaderboard",
      href: `/c/${competitionSlug}/leaderboard`,
      label: "Stop 3",
      title: "Public leaderboard",
      description: "Climbers, parents, and spectators can follow standings without staff sending screenshots or rebuilding rankings by hand.",
      helper: "Switch categories to show that one public page handles every division cleanly.",
    },
    {
      routeId: "display",
      href: `/c/${competitionSlug}/display`,
      label: "Stop 4",
      title: "Spectator display",
      description: "This is the projector-friendly screen for a TV or live stream, built to keep the room updated during the event.",
      helper: "Use this as the final stop in the walkthrough to land on the public event-day experience.",
    },
  ];
}

export default function DemoExperience({
  enabled,
  routeId,
  competitionSlug,
  bannerTitle,
  bannerDescription,
  bannerTip,
}: DemoExperienceProps) {
  const steps = useMemo(() => buildDemoTourSteps(competitionSlug), [competitionSlug]);
  const currentIndex = steps.findIndex((step) => step.routeId === routeId);
  const activeStep = currentIndex >= 0 ? steps[currentIndex] : null;
  const previousStep = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const nextStep = currentIndex >= 0 && currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!enabled || currentIndex < 0 || typeof window === "undefined") {
      return;
    }

    const storedDismissed = window.localStorage.getItem(STORAGE_DISMISSED_KEY) === "true";
    setDismissed(storedDismissed);
    window.localStorage.setItem(STORAGE_STEP_KEY, String(currentIndex));
  }, [currentIndex, enabled]);

  if (!enabled || !activeStep) {
    return null;
  }

  const restartTour = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_DISMISSED_KEY);
      window.localStorage.setItem(STORAGE_STEP_KEY, "0");
    }
    setDismissed(false);
  };

  const dismissTour = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_DISMISSED_KEY, "true");
      window.localStorage.setItem(STORAGE_STEP_KEY, String(currentIndex));
    }
    setDismissed(true);
  };

  return (
    <>
      <section className="results-alert border border-sky-200/70 bg-sky-50/85 text-sky-900 shadow-[0_12px_36px_rgba(14,116,144,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">{activeStep.label} of {steps.length} · Demo mode</div>
            <div className="text-xl font-semibold tracking-tight text-slate-950">{bannerTitle}</div>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-700">{bannerDescription}</p>
            <p className="max-w-3xl text-sm leading-relaxed text-sky-800">{bannerTip}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={restartTour} className="results-secondary-button">
              Restart tour
            </button>
            {nextStep ? (
              <Link href={nextStep.href} className="results-primary-button">
                Next: {nextStep.title}
              </Link>
            ) : (
              <Link href={steps[0].href} className="results-primary-button">
                Back to organizer demo
              </Link>
            )}
          </div>
        </div>
      </section>

      {!dismissed ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end px-4 pb-4 sm:px-6">
          <aside className="pointer-events-auto w-full max-w-md rounded-[2rem] border border-white/60 bg-white/88 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{activeStep.label}</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{activeStep.title}</h2>
              </div>
              <button
                type="button"
                onClick={dismissTour}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-slate-300 hover:text-slate-700"
              >
                Hide
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">{activeStep.description}</p>
            <p className="mt-3 rounded-[1.2rem] border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-relaxed text-slate-600">
              {activeStep.helper}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {previousStep ? (
                <Link href={previousStep.href} className="results-secondary-button">
                  Back
                </Link>
              ) : null}
              {nextStep ? (
                <Link href={nextStep.href} className="results-primary-button">
                  Continue
                </Link>
              ) : (
                <Link href={steps[0].href} className="results-primary-button">
                  Restart walkthrough
                </Link>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
