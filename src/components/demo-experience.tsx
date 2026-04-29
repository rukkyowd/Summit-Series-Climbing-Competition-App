"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type DemoTourRouteId = "organizer" | "judge" | "leaderboard" | "display";

type DemoTourStep = {
  routeId: DemoTourRouteId;
  href: string;
  selector: string;
  title: string;
  description: string;
  action: string;
  continueLabel?: string;
  preferredSide?: Exclude<CalloutSide, "bottom">;
  verticalBias?: "top" | "center" | "bottom";
  calloutWidth?: number;
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

type MaskPanel = CSSProperties;
type CalloutMode = "floating" | "sheet";
type CalloutSide = "left" | "right" | "bottom";

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
      title: "Organizer overview",
      description:
        "Everything lives in one event record: setup, categories, rounds, registration, and public links, instead of being split across different tools.",
      action:
        "This is the starting point on setup day. Notice that the public-facing links are already connected before the event goes live.",
      preferredSide: "right",
      verticalBias: "top",
      calloutWidth: 336,
    },
    {
      routeId: "organizer",
      href: "/staff/demo",
      selector: '[data-demo-anchor="organizer-progress"]',
      title: "Setup in steps",
      description:
        "The guided flow walks organizers from basics through stages without a complex back office. Structured enough for a first timer, flexible enough for custom events.",
      action:
        "Each step unlocks the next part of the build. A gym can hand this off to another staff member without a training session.",
      preferredSide: "left",
      verticalBias: "center",
      calloutWidth: 332,
    },
    {
      routeId: "judge",
      href: `/staff/c/${competitionSlug}/judge`,
      selector: '[data-demo-anchor="judge-entry-cards"]',
      title: "Judge scoring",
      description:
        "Each athlete card handles attempts, zone, top, and save in one touch surface that works well on a phone or tablet.",
      action:
        "Confirm a call on the highlighted card. The leaderboard should reflect that save as soon as you continue.",
      continueLabel: "Save a score & continue",
      preferredSide: "right",
      verticalBias: "center",
      calloutWidth: 344,
    },
    {
      routeId: "leaderboard",
      href: `/c/${competitionSlug}/leaderboard`,
      selector: '[data-demo-anchor="leaderboard-overview"]',
      title: "Live public rankings",
      description:
        "This is the page climbers, parents, and coaches watch in real time. One URL serves every category instead of splitting divisions across separate pages.",
      action:
        "Switch categories here to show how one family can follow multiple climbers from the same public page.",
      preferredSide: "right",
      verticalBias: "top",
      calloutWidth: 332,
    },
    {
      routeId: "leaderboard",
      href: `/c/${competitionSlug}/leaderboard`,
      selector: '[data-demo-anchor="leaderboard-table"]',
      title: "Readable standings",
      description:
        "Rank, score, and result context stay easy to scan on both mobile cards and the full desktop table. The same data powers both views.",
      action:
        "Look at the tied rows here. The standings stay readable without making spectators decode how ties were handled.",
      preferredSide: "left",
      verticalBias: "center",
      calloutWidth: 336,
    },
    {
      routeId: "display",
      href: `/c/${competitionSlug}/display`,
      selector: '[data-demo-anchor="display-overview"]',
      title: "Spectator display",
      description:
        "The display view is built for projectors, TVs, and streams around the gym with large type, strong contrast, and crowd-friendly presentation.",
      action: "End on this screen. It is the closest view to what the room feels like on comp day.",
      continueLabel: "Finish tour",
      preferredSide: "left",
      verticalBias: "bottom",
      calloutWidth: 332,
    },
  ];
}

function buildMaskPanels(spotlight: SpotlightBox): MaskPanel[] {
  const overlap = 18;
  const right = spotlight.left + spotlight.width;
  const bottom = spotlight.top + spotlight.height;

  return [
    { left: 0, top: 0, width: "100%", height: spotlight.top + overlap },
    { left: 0, top: spotlight.top, width: spotlight.left + overlap, height: spotlight.height },
    { left: right - overlap, top: spotlight.top, right: 0, height: spotlight.height },
    { left: 0, top: bottom - overlap, width: "100%", bottom: 0 },
  ];
}

function buildCornerMasks(spotlight: SpotlightBox): Array<MaskPanel & { key: string; className: string }> {
  const radius = Math.max(spotlight.radius, 24);
  const size = radius + 18;
  const right = spotlight.left + spotlight.width;
  const bottom = spotlight.top + spotlight.height;

  return [
    { key: "top-left", className: "demo-tour-corner-mask demo-tour-corner-mask-tl", left: spotlight.left, top: spotlight.top, width: size, height: size },
    { key: "top-right", className: "demo-tour-corner-mask demo-tour-corner-mask-tr", left: right - size, top: spotlight.top, width: size, height: size },
    { key: "bottom-left", className: "demo-tour-corner-mask demo-tour-corner-mask-bl", left: spotlight.left, top: bottom - size, width: size, height: size },
    { key: "bottom-right", className: "demo-tour-corner-mask demo-tour-corner-mask-br", left: right - size, top: bottom - size, width: size, height: size },
  ];
}

function resolvePreferredTop(rect: DOMRect, calloutHeight: number, bias: DemoTourStep["verticalBias"]) {
  if (bias === "top") {
    return rect.top - 12;
  }
  if (bias === "bottom") {
    return rect.bottom - calloutHeight + 12;
  }
  return rect.top + rect.height / 2 - calloutHeight / 2;
}

function resolveFloatingSide(
  rect: DOMRect,
  calloutWidth: number,
  preferredSide: DemoTourStep["preferredSide"]
): Exclude<CalloutSide, "bottom"> | null {
  const rightFits = rect.right + 26 + calloutWidth <= window.innerWidth - 16;
  const leftFits = rect.left - 26 - calloutWidth >= 12;

  if (preferredSide === "left") {
    if (leftFits) {
      return "left";
    }
    if (rightFits) {
      return "right";
    }
    return null;
  }

  if (preferredSide === "right") {
    if (rightFits) {
      return "right";
    }
    if (leftFits) {
      return "left";
    }
    return null;
  }

  if (rightFits) {
    return "right";
  }
  if (leftFits) {
    return "left";
  }
  return null;
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
    () =>
      steps
        .map((step, index) => ({ step, index }))
        .filter((entry) => entry.step.routeId === routeId)
        .map((entry) => entry.index),
    [routeId, steps]
  );
  const firstRouteStepIndex = routeStepIndexes[0] ?? 0;
  const [activeIndex, setActiveIndex] = useState(firstRouteStepIndex);
  const [dismissed, setDismissed] = useState(true);
  const [complete, setComplete] = useState(false);
  const [spotlight, setSpotlight] = useState<SpotlightBox | null>(null);
  const [calloutStyle, setCalloutStyle] = useState<CSSProperties | null>(null);
  const [calloutMode, setCalloutMode] = useState<CalloutMode>("floating");
  const [calloutSide, setCalloutSide] = useState<CalloutSide>("right");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const activeStep = steps[activeIndex] ?? null;
  const previousStep = activeIndex > 0 ? steps[activeIndex - 1] : null;
  const nextStep = activeIndex < steps.length - 1 ? steps[activeIndex + 1] : null;
  const routeCurrentStepPosition = routeStepIndexes.findIndex((index) => index === activeIndex);
  const routeNextStep =
    routeCurrentStepPosition >= 0 && routeCurrentStepPosition < routeStepIndexes.length - 1
      ? steps[routeStepIndexes[routeCurrentStepPosition + 1]]
      : null;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    applyPreference();
    mediaQuery.addEventListener("change", applyPreference);
    return () => mediaQuery.removeEventListener("change", applyPreference);
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const storedDismissed = window.localStorage.getItem(STORAGE_DISMISSED_KEY) === "true";
    const parsedIndex = Number(window.localStorage.getItem(STORAGE_STEP_KEY));
    const resolvedIndex =
      Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < steps.length ? parsedIndex : firstRouteStepIndex;

    setDismissed(storedDismissed);
    setComplete(false);
    setActiveIndex(resolvedIndex);
  }, [enabled, firstRouteStepIndex, steps.length]);

  useEffect(() => {
    if (!enabled || dismissed || complete || !activeStep || activeStep.routeId !== routeId || typeof window === "undefined") {
      setSpotlight(null);
      setCalloutStyle(null);
      setCalloutMode("floating");
      setCalloutSide("right");
      return;
    }

    let frame = 0;
    let settleTimer = 0;

    const updatePosition = (scrollTarget: boolean) => {
      const target = document.querySelector(activeStep.selector);
      if (!(target instanceof HTMLElement)) {
        setSpotlight(null);
        setCalloutMode("sheet");
        setCalloutSide("bottom");
        setCalloutStyle({ left: "50%", bottom: 16, width: Math.min(360, window.innerWidth - 24), transform: "translateX(-50%)" });
        return;
      }

      if (scrollTarget) {
        target.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "center",
          inline: "nearest",
        });
      }

      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(
        () =>
          (frame = window.requestAnimationFrame(() => {
            const rect = target.getBoundingClientRect();
            const padding = window.innerWidth < 768 ? 12 : 18;
            const nextSpotlight: SpotlightBox = {
              top: clamp(rect.top - padding, 12, Math.max(12, window.innerHeight - rect.height - padding * 2 - 12)),
              left: clamp(rect.left - padding, 12, Math.max(12, window.innerWidth - rect.width - padding * 2 - 12)),
              width: Math.max(rect.width + padding * 2, 240),
              height: Math.max(rect.height + padding * 2, 120),
              radius: window.innerWidth < 768 ? 24 : 30,
            };

            const requestedWidth = activeStep.calloutWidth ?? 344;
            const calloutWidth = Math.min(requestedWidth, window.innerWidth - 24);
            const preferredSide = resolveFloatingSide(rect, calloutWidth, activeStep.preferredSide);
            const useFloating = window.innerWidth >= 980 && rect.width < window.innerWidth * 0.68 && preferredSide !== null;

            setSpotlight(nextSpotlight);

            if (!useFloating) {
              const sheetWidth = Math.min(window.innerWidth >= 1024 ? 320 : 360, window.innerWidth - 24);
              setCalloutMode("sheet");
              setCalloutSide("bottom");
              setCalloutStyle({
                left: "50%",
                bottom: 16,
                width: sheetWidth,
                transform: "translateX(-50%)",
              });
              return;
            }

            const resolvedLeft =
              preferredSide === "right" ? rect.right + 26 : rect.left - calloutWidth - 26;
            const estimatedHeight = 308;
            const preferredTop = resolvePreferredTop(rect, estimatedHeight, activeStep.verticalBias);
            const resolvedTop = clamp(preferredTop, 16, Math.max(16, window.innerHeight - estimatedHeight - 16));

            setCalloutMode("floating");
            setCalloutSide(preferredSide);
            setCalloutStyle({
              top: resolvedTop,
              left: clamp(resolvedLeft, 12, Math.max(12, window.innerWidth - calloutWidth - 12)),
              width: calloutWidth,
            });
          })),
        scrollTarget && !prefersReducedMotion ? 220 : 70
      );
    };

    const handleResize = () => updatePosition(false);
    const handleScroll = () => updatePosition(false);

    updatePosition(true);
    const settleTimeout = window.setTimeout(() => updatePosition(false), prefersReducedMotion ? 90 : 280);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(settleTimeout);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [activeStep, complete, dismissed, enabled, prefersReducedMotion, routeId]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const isActive = enabled && !dismissed && !complete && activeStep?.routeId === routeId;
    document.body.dataset.demoTourActive = isActive ? "true" : "false";

    return () => {
      delete document.body.dataset.demoTourActive;
    };
  }, [activeStep, complete, dismissed, enabled, routeId]);

  if (!enabled || !activeStep) {
    return null;
  }

  const goToStep = (targetIndex: number) => {
    const targetStep = steps[targetIndex];
    if (!targetStep || typeof window === "undefined") {
      return;
    }

    setComplete(false);
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
    setComplete(false);
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
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700 shadow-[0_10px_24px_rgba(14,116,144,0.08)]">
              <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_0_6px_rgba(14,165,233,0.12)]" />
              {`Step ${activeIndex + 1} of ${steps.length} - Demo mode`}
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
            <button type="button" onClick={restartTour} className={buttonStyles({ variant: "secondary" })}>
              Restart tour
            </button>
            {nextStep ? (
              <button type="button" onClick={() => goToStep(activeIndex + 1)} className={buttonStyles({ variant: "primary" })}>
                Next: {nextStep.title}
              </button>
            ) : (
              <button type="button" onClick={restartTour} className={buttonStyles({ variant: "primary" })}>
                Back to organizer demo
              </button>
            )}
          </div>
        </div>
      </section>

      {!dismissed && activeStep.routeId === routeId ? (
        <div className="pointer-events-none fixed inset-0 z-50">
          {spotlight ? (
            buildMaskPanels(spotlight).map((panelStyle, index) => (
              <div key={`demo-tour-mask-${index}`} className="demo-tour-mask absolute" style={panelStyle} />
            ))
          ) : (
            <div className="demo-tour-backdrop absolute inset-0" />
          )}
          {spotlight
            ? buildCornerMasks(spotlight).map((corner) => (
                <div
                  key={corner.key}
                  className={corner.className}
                  style={{ left: corner.left, top: corner.top, width: corner.width, height: corner.height }}
                />
              ))
            : null}
          {spotlight ? (
            <div
              className="demo-tour-spotlight absolute"
              style={{
                top: `${spotlight.top}px`,
                left: `${spotlight.left}px`,
                width: `${spotlight.width}px`,
                height: `${spotlight.height}px`,
                borderRadius: `${spotlight.radius}px`,
              }}
            >
              <div className="demo-tour-spotlight__wash absolute inset-0 rounded-[inherit]" />
              <div className="demo-tour-spotlight__edge absolute inset-0 rounded-[inherit]" />
            </div>
          ) : null}

          <aside
            className={`demo-tour-callout pointer-events-auto absolute ${calloutMode === "sheet" ? "demo-tour-callout-sheet" : "demo-tour-callout-floating"}`}
            style={calloutStyle ?? { right: "16px", bottom: "16px", width: "min(344px, calc(100vw - 24px))" }}
          >
            {calloutMode === "floating" && !complete ? (
              <div className={`demo-tour-callout__arrow demo-tour-callout__arrow-${calloutSide}`} aria-hidden="true" />
            ) : null}

            {complete ? (
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                  {"\u2713"}
                </div>
                <h2 className="mt-4 text-[1.7rem] font-semibold tracking-tight text-slate-950">Tour complete</h2>
                <p className="mt-3 text-[15px] leading-7 text-slate-700">
                  You&apos;ve seen the full event workflow. The demo is still live, so you can keep exploring freely.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={restartTour} className={buttonStyles({ variant: "primary" })}>
                    Restart tour
                  </button>
                  <button type="button" onClick={dismissTour} className={buttonStyles({ variant: "secondary" })}>
                    Explore on my own
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="demo-tour-callout__badge">{`Stop ${activeIndex + 1} of ${steps.length}`}</div>
                    <h2 className="mt-3 text-[1.55rem] font-semibold tracking-tight text-slate-950 sm:text-[1.75rem]">{activeStep.title}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={dismissTour}
                    className="rounded-full border border-slate-200/90 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-slate-300 hover:bg-white hover:text-slate-700"
                  >
                    Hide
                  </button>
                </div>

                <div className="mt-5">
                  <div className="flex gap-2">
                    {steps.map((step, index) => (
                      <div
                        key={`${step.routeId}-${step.selector}`}
                        className={
                          index === activeIndex
                            ? "demo-tour-progress demo-tour-progress-active"
                            : index < activeIndex
                              ? "demo-tour-progress demo-tour-progress-done"
                              : "demo-tour-progress"
                        }
                      />
                    ))}
                  </div>
                  <div className="mt-3 h-[2px] overflow-hidden rounded-full bg-slate-200/90">
                    <div className="demo-tour-progress-bar" style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }} />
                  </div>
                </div>

                <p className="mt-4 text-[14px] leading-7 text-slate-600">{activeStep.description}</p>
                <div className="mt-4 rounded-[1.15rem] border border-sky-200/90 bg-sky-50/95 px-4 py-4 text-sm leading-7 text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
                  {activeStep.action}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                    {activeIndex + 1} / {steps.length}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {previousStep ? (
                      <button type="button" onClick={() => goToStep(activeIndex - 1)} className={buttonStyles({ variant: "secondary" })}>
                        Back
                      </button>
                    ) : (
                      <button type="button" disabled aria-hidden="true" className={cn(buttonStyles({ variant: "secondary" }), "pointer-events-none opacity-0")}>
                        Back
                      </button>
                    )}
                    {nextStep ? (
                      <button type="button" onClick={() => goToStep(activeIndex + 1)} className={buttonStyles({ variant: "primary" })}>
                        {activeStep.continueLabel ?? "Continue ->"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setComplete(true)}
                        className={cn(
                          buttonStyles({ variant: "primary" }),
                          "bg-[linear-gradient(135deg,#15966d,#13845f)] hover:shadow-[0_18px_36px_rgba(21,150,109,0.22)]"
                        )}
                      >
                        {activeStep.continueLabel ?? "Finish tour"}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}
    </>
  );
}
