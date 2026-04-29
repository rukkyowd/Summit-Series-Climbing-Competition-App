"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export type DemoTourRouteId = "organizer" | "judge" | "leaderboard" | "display";

type DemoTourStep = {
  routeId: DemoTourRouteId;
  href: string;
  selector: string;
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

type SpotlightBox = {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
};

const STORAGE_STEP_KEY = "scorecard_demo_tour_step";
const STORAGE_DISMISSED_KEY = "scorecard_demo_tour_dismissed";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildDemoTourSteps(competitionSlug: string): DemoTourStep[] {
  return [
    {
      routeId: "organizer",
      href: "/staff/demo",
      selector: '[data-demo-anchor="organizer-overview"]',
      label: "Stop 1",
      title: "Organizer overview",
      description: "Start with the event shell so gyms immediately see that setup, categories, rounds, and public links all live in one place.",
      helper: "Use this opening card to frame the product as one shared event workspace instead of a patchwork of spreadsheets and scoreboards.",
    },
    {
      routeId: "organizer",
      href: "/staff/demo",
      selector: '[data-demo-anchor="organizer-links"]',
      label: "Stop 2",
      title: "Quick route handoff",
      description: "These shortcuts are the bridge between admin setup and the public experience. They make it easy to jump into the exact workflow you want to demo.",
      helper: "Call out that staff, judges, and spectators all branch out from the same event record instead of managing separate systems.",
    },
    {
      routeId: "organizer",
      href: "/staff/demo",
      selector: '[data-demo-anchor="organizer-progress"]',
      label: "Stop 3",
      title: "Guided event setup",
      description: "This section shows the full organizer flow from basics through stages, with one linear setup path instead of a cluttered admin back office.",
      helper: "Highlight that the setup is structured enough for a first-time organizer, but still flexible for more custom events.",
    },
    {
      routeId: "judge",
      href: `/staff/c/${competitionSlug}/judge`,
      selector: '[data-demo-anchor="judge-hero"]',
      label: "Stop 4",
      title: "Judge scoring workspace",
      description: "This is the live scoring screen staff would use on a phone or tablet during qualifiers.",
      helper: "Frame it as the event-day tool: low-friction entry, fast save feedback, and no paper reconciliation afterward.",
    },
    {
      routeId: "judge",
      href: `/staff/c/${competitionSlug}/judge`,
      selector: '[data-demo-anchor="judge-mode-toggle"]',
      label: "Stop 5",
      title: "Scoring mode switch",
      description: "Judges can move between qualifier-style entry and finals scoring from the same page when the event reaches that phase.",
      helper: "This is a good place to explain that the workflow adapts to the round instead of forcing staff into separate tools.",
    },
    {
      routeId: "judge",
      href: `/staff/c/${competitionSlug}/judge`,
      selector: '[data-demo-anchor="judge-entry-cards"]',
      label: "Stop 6",
      title: "Live athlete entry",
      description: "Each athlete card supports the full judge call: attempts, zone, top, and save, all on one surface.",
      helper: "Save one boulder score here, then continue to the public leaderboard to show the result appear live.",
    },
    {
      routeId: "leaderboard",
      href: `/c/${competitionSlug}/leaderboard`,
      selector: '[data-demo-anchor="leaderboard-overview"]',
      label: "Stop 7",
      title: "Live public rankings",
      description: "This is the page climbers, parents, and coaches can watch in real time while judging is happening.",
      helper: "Position it as the single public source of truth, not something staff have to manually refresh or repost elsewhere.",
    },
    {
      routeId: "leaderboard",
      href: `/c/${competitionSlug}/leaderboard`,
      selector: '[data-demo-anchor="leaderboard-categories"]',
      label: "Stop 8",
      title: "Category switching",
      description: "One public leaderboard can cleanly serve every division without sending people to different event pages.",
      helper: "Flip through categories to show that a family can follow multiple climbers from one place.",
    },
    {
      routeId: "leaderboard",
      href: `/c/${competitionSlug}/leaderboard`,
      selector: '[data-demo-anchor="leaderboard-table"]',
      label: "Stop 9",
      title: "Readable standings",
      description: "The standings area keeps rank, score, and result context easy to scan on both mobile cards and the full desktop table.",
      helper: "Use this to show that the product is audience-friendly, not just organizer-friendly.",
    },
    {
      routeId: "display",
      href: `/c/${competitionSlug}/display`,
      selector: '[data-demo-anchor="display-overview"]',
      label: "Stop 10",
      title: "Display mode",
      description: "The display view is the big-screen version of the event, meant for projectors, TVs, and streams around the gym.",
      helper: "This is the high-visibility close to the walkthrough because it feels the most like the real room on comp day.",
    },
    {
      routeId: "display",
      href: `/c/${competitionSlug}/display`,
      selector: '[data-demo-anchor="display-standings"]',
      label: "Stop 11",
      title: "Crowd-facing results",
      description: "The final stop shows how standings stay polished and legible when they are projected to the whole room.",
      helper: "End here to reinforce that the same event data powers both the staff workflow and the public event experience.",
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
  const router = useRouter();
  const steps = useMemo(() => buildDemoTourSteps(competitionSlug), [competitionSlug]);
  const routeStepIndexes = useMemo(
    () => steps.map((step, index) => ({ step, index })).filter((entry) => entry.step.routeId === routeId).map((entry) => entry.index),
    [routeId, steps]
  );
  const firstRouteStepIndex = routeStepIndexes[0] ?? 0;
  const [activeIndex, setActiveIndex] = useState(firstRouteStepIndex);
  const [dismissed, setDismissed] = useState(true);
  const [spotlight, setSpotlight] = useState<SpotlightBox | null>(null);
  const [calloutStyle, setCalloutStyle] = useState<Record<string, string> | null>(null);

  const activeStep = steps[activeIndex] ?? null;
  const currentRouteStepPosition = routeStepIndexes.findIndex((index) => index === activeIndex);
  const previousStep = activeIndex > 0 ? steps[activeIndex - 1] : null;
  const nextStep = activeIndex < steps.length - 1 ? steps[activeIndex + 1] : null;
  const routeNextStep = currentRouteStepPosition >= 0 && currentRouteStepPosition < routeStepIndexes.length - 1 ? steps[routeStepIndexes[currentRouteStepPosition + 1]] : null;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const storedDismissed = window.localStorage.getItem(STORAGE_DISMISSED_KEY) === "true";
    const parsedIndex = Number(window.localStorage.getItem(STORAGE_STEP_KEY));
    const resolvedIndex =
      Number.isInteger(parsedIndex) && routeStepIndexes.includes(parsedIndex) ? parsedIndex : firstRouteStepIndex;

    setDismissed(storedDismissed);
    setActiveIndex(resolvedIndex);
  }, [enabled, firstRouteStepIndex, routeStepIndexes]);

  useEffect(() => {
    if (!enabled || dismissed || !activeStep || activeStep.routeId !== routeId || typeof window === "undefined") {
      setSpotlight(null);
      setCalloutStyle(null);
      return;
    }

    let frame = 0;

    const updatePosition = (scrollTarget: boolean) => {
      const target = document.querySelector(activeStep.selector);
      if (!(target instanceof HTMLElement)) {
        setSpotlight(null);
        setCalloutStyle(null);
        return;
      }

      if (scrollTarget) {
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }

      frame = window.requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        const padding = 16;
        const nextSpotlight = {
          top: clamp(rect.top - padding, 12, Math.max(12, window.innerHeight - rect.height - padding * 2 - 12)),
          left: clamp(rect.left - padding, 12, Math.max(12, window.innerWidth - rect.width - padding * 2 - 12)),
          width: Math.max(rect.width + padding * 2, 260),
          height: Math.max(rect.height + padding * 2, 120),
          radius: 28,
        };

        const calloutWidth = Math.min(390, window.innerWidth - 24);
        const preferredRight = rect.left + rect.width + 28;
        const preferredLeft = rect.left - calloutWidth - 28;
        const useRightSide = preferredRight + calloutWidth <= window.innerWidth - 16;
        const resolvedLeft = useRightSide ? preferredRight : Math.max(12, preferredLeft);
        const resolvedTop = clamp(rect.top + rect.height / 2 - 190, 16, Math.max(16, window.innerHeight - 332));

        setSpotlight(nextSpotlight);
        setCalloutStyle({
          top: `${resolvedTop}px`,
          left: `${clamp(resolvedLeft, 12, Math.max(12, window.innerWidth - calloutWidth - 12))}px`,
          width: `${calloutWidth}px`,
        });
      });
    };

    const handleResize = () => updatePosition(false);
    const handleScroll = () => updatePosition(false);

    updatePosition(true);
    const settleTimeout = window.setTimeout(() => updatePosition(false), 260);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.clearTimeout(settleTimeout);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [activeStep, dismissed, enabled, routeId]);

  if (!enabled || !activeStep) {
    return null;
  }

  const goToStep = (targetIndex: number) => {
    const targetStep = steps[targetIndex];
    if (!targetStep || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_STEP_KEY, String(targetIndex));
    window.localStorage.removeItem(STORAGE_DISMISSED_KEY);
    setDismissed(false);

    if (targetStep.routeId === routeId) {
      setActiveIndex(targetIndex);
      return;
    }

    router.push(targetStep.href);
  };

  const restartTour = () => {
    goToStep(0);
  };

  const dismissTour = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_DISMISSED_KEY, "true");
      window.localStorage.setItem(STORAGE_STEP_KEY, String(activeIndex));
    }
    setDismissed(true);
  };

  return (
    <>
      <section className="results-alert border border-sky-200/70 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(239,246,255,0.88))] text-sky-900 shadow-[0_16px_44px_rgba(14,116,144,0.1)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              {activeStep.label} of {steps.length} · Demo mode
            </div>
            <div className="text-xl font-semibold tracking-tight text-slate-950">{bannerTitle}</div>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-700">{bannerDescription}</p>
            <p className="max-w-3xl text-sm leading-relaxed text-sky-800">{bannerTip}</p>
            {routeNextStep ? (
              <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
                On this page next: <span className="font-semibold text-slate-900">{routeNextStep.title}</span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={restartTour} className="results-secondary-button">
              Restart tour
            </button>
            {nextStep ? (
              <button type="button" onClick={() => goToStep(activeIndex + 1)} className="results-primary-button">
                Next: {nextStep.title}
              </button>
            ) : (
              <button type="button" onClick={restartTour} className="results-primary-button">
                Back to organizer demo
              </button>
            )}
          </div>
        </div>
      </section>

      {!dismissed && activeStep.routeId === routeId ? (
        <div className="pointer-events-none fixed inset-0 z-50">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.08),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.18),rgba(15,23,42,0.3))] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]" />
          {spotlight ? (
            <div
              className="absolute border border-sky-300/70 bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.4),0_0_0_1px_rgba(255,255,255,0.72),0_30px_90px_rgba(14,116,144,0.22)] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
              style={{
                top: `${spotlight.top}px`,
                left: `${spotlight.left}px`,
                width: `${spotlight.width}px`,
                height: `${spotlight.height}px`,
                borderRadius: `${spotlight.radius}px`,
              }}
            >
              <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_top_right,rgba(186,230,253,0.22),transparent_55%)]" />
            </div>
          ) : null}
          <aside
            className="pointer-events-auto absolute rounded-[2rem] border border-white/60 bg-white/92 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={calloutStyle ?? { right: "16px", bottom: "16px", width: "min(390px, calc(100vw - 24px))" }}
          >
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
            <div className="mt-4 flex gap-2">
              {steps.map((step, index) => (
                <div
                  key={`${step.routeId}-${step.selector}`}
                  className={index === activeIndex ? "h-1.5 flex-1 rounded-full bg-slate-950" : "h-1.5 flex-1 rounded-full bg-slate-200"}
                />
              ))}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">{activeStep.description}</p>
            <p className="mt-3 rounded-[1.2rem] border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-relaxed text-slate-600">
              {activeStep.helper}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {previousStep ? (
                <button type="button" onClick={() => goToStep(activeIndex - 1)} className="results-secondary-button">
                  Back
                </button>
              ) : null}
              {nextStep ? (
                <button type="button" onClick={() => goToStep(activeIndex + 1)} className="results-primary-button">
                  Continue
                </button>
              ) : (
                <button type="button" onClick={restartTour} className="results-primary-button">
                  Restart walkthrough
                </button>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
