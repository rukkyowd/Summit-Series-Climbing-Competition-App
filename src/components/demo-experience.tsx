"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type DemoTourRouteId = "organizer" | "judge" | "leaderboard" | "display";

type CalloutMode = "floating" | "sheet";
type CalloutSide = "left" | "right" | "bottom";

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
  allowInteraction?: boolean;
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
const TRANSITION_MIN_MS = 600;
const FALLBACK_CALLOUT_STYLE: CSSProperties = {
  left: 16,
  bottom: 16,
  width: 344,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getRouteLabel(routeId: DemoTourRouteId) {
  if (routeId === "organizer") return "Organizer demo";
  if (routeId === "judge") return "Judge scoring";
  if (routeId === "leaderboard") return "Live leaderboard";
  return "Spectator display";
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
      allowInteraction: true,
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

function buildInteractionPanels(spotlight: SpotlightBox): CSSProperties[] {
  return [
    { left: 0, top: 0, width: "100%", height: spotlight.top },
    { left: 0, top: spotlight.top, width: spotlight.left, height: spotlight.height },
    { left: spotlight.left + spotlight.width, top: spotlight.top, right: 0, height: spotlight.height },
    { left: 0, top: spotlight.top + spotlight.height, width: "100%", bottom: 0 },
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
  const isRightHalf = rect.left + rect.width / 2 > window.innerWidth / 2;
  const rightFits = rect.right + 24 + calloutWidth <= window.innerWidth - 16;
  const leftFits = rect.left - 24 - calloutWidth >= 16;

  const fallbackSides: Array<Exclude<CalloutSide, "bottom">> = isRightHalf ? ["left", "right"] : ["right", "left"];
  const sidesToTry = preferredSide ? [preferredSide, ...fallbackSides.filter((side) => side !== preferredSide)] : fallbackSides;

  for (const side of sidesToTry) {
    if (side === "left" && leftFits) {
      return "left";
    }
    if (side === "right" && rightFits) {
      return "right";
    }
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
  const [transitioning, setTransitioning] = useState(false);

  const transitionStartedAtRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);

  const activeStep = steps[activeIndex] ?? null;
  const previousStep = activeIndex > 0 ? steps[activeIndex - 1] : null;
  const nextStep = activeIndex < steps.length - 1 ? steps[activeIndex + 1] : null;
  const routeCurrentStepPosition = routeStepIndexes.findIndex((index) => index === activeIndex);
  const routeNextStep =
    routeCurrentStepPosition >= 0 && routeCurrentStepPosition < routeStepIndexes.length - 1
      ? steps[routeStepIndexes[routeCurrentStepPosition + 1]]
      : null;

  const finishTransition = () => {
    if (typeof window === "undefined") {
      setTransitioning(false);
      return;
    }

    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    const elapsed = Date.now() - transitionStartedAtRef.current;
    const remaining = Math.max(0, TRANSITION_MIN_MS - elapsed);
    transitionTimerRef.current = window.setTimeout(() => {
      setTransitioning(false);
      transitionTimerRef.current = null;
    }, remaining);
  };

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
    const storedIndex =
      Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < steps.length ? parsedIndex : firstRouteStepIndex;
    const resolvedIndex =
      steps[storedIndex]?.routeId === routeId ? storedIndex : firstRouteStepIndex;

    setDismissed(storedDismissed);
    setComplete(false);
    setActiveIndex(resolvedIndex);

    setTransitioning(false);
  }, [enabled, firstRouteStepIndex, routeId, steps]);

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
    let resizeObserver: ResizeObserver | null = null;

    const updatePosition = (scrollTarget: boolean) => {
      const target = document.querySelector(activeStep.selector);
      if (!(target instanceof HTMLElement)) {
        setTransitioning(true);
        setSpotlight(null);
        setCalloutMode("sheet");
        setCalloutSide("bottom");
        const fallbackWidth = Math.min(360, window.innerWidth - 24);
        setCalloutStyle({
          left: Math.max(12, (window.innerWidth - fallbackWidth) / 2),
          bottom: 16,
          width: fallbackWidth,
        });
        return;
      }

      finishTransition();

      if (scrollTarget) {
        target.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: activeStep.verticalBias === "top" ? "start" : activeStep.verticalBias === "bottom" ? "end" : "center",
          inline: "nearest",
        });
      }

      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(
        () =>
          (frame = window.requestAnimationFrame(() => {
            const rect = target.getBoundingClientRect();
            const padding = window.innerWidth < 768 ? 12 : 18;
            const requestedWidth = activeStep.calloutWidth ?? 344;
            const calloutWidth = Math.min(requestedWidth, window.innerWidth - 24);
            const preferredSide = resolveFloatingSide(rect, calloutWidth, activeStep.preferredSide);
            const useFloating = window.innerWidth >= 980 && rect.width < window.innerWidth * 0.68 && preferredSide !== null;
            const verticalPadding = useFloating ? padding + 12 : padding + 44;

            const nextSpotlight: SpotlightBox = {
              top: clamp(rect.top - padding, 12, Math.max(12, window.innerHeight - rect.height - verticalPadding * 2 - 12)),
              left: clamp(rect.left - padding, 12, Math.max(12, window.innerWidth - rect.width - padding * 2 - 12)),
              width: Math.max(rect.width + padding * 2, 240),
              height: Math.max(rect.height + padding * 2, 120),
              radius: window.innerWidth < 768 ? 24 : 30,
            };

            setSpotlight(nextSpotlight);

            if (!useFloating || !preferredSide) {
              const sheetWidth = Math.min(window.innerWidth >= 1024 ? 320 : 360, window.innerWidth - 24);
              setCalloutMode("sheet");
              setCalloutSide("bottom");
              setCalloutStyle({
                left: Math.max(12, (window.innerWidth - sheetWidth) / 2),
                bottom: 16,
                width: sheetWidth,
              });
              return;
            }

            const resolvedLeft =
              preferredSide === "right" ? rect.right + 24 : rect.left - calloutWidth - 24;
            const estimatedHeight = 308;
            const smartBias =
              activeStep.verticalBias === "center" && rect.top > window.innerHeight / 2
                ? "bottom"
                : activeStep.verticalBias === "center"
                  ? "top"
                  : activeStep.verticalBias;
            const preferredTop = resolvePreferredTop(rect, estimatedHeight, smartBias);
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

    const targetElement = document.querySelector(activeStep.selector);
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => updatePosition(false));
      if (targetElement instanceof HTMLElement) {
        resizeObserver.observe(targetElement);
      }
      resizeObserver.observe(document.body);
    }

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
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [activeStep, complete, dismissed, enabled, prefersReducedMotion, routeId]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

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

    if (targetStep.routeId !== routeId) {
      transitionStartedAtRef.current = Date.now();
      setTransitioning(true);
      router.push(targetStep.href);
      return;
    }

    setTransitioning(false);
    setActiveIndex(targetIndex);
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

  const maskId = `demo-tour-mask-${activeIndex}`;
  const showTransitionOverlay = !dismissed && !complete && (transitioning || activeStep.routeId !== routeId);
  const showTourOverlay = !dismissed && !complete && activeStep.routeId === routeId;
  const animatedCalloutStyle = calloutStyle ?? FALLBACK_CALLOUT_STYLE;
  const animatedCalloutTarget = {
    top: typeof animatedCalloutStyle.top === "number" ? animatedCalloutStyle.top : undefined,
    left: typeof animatedCalloutStyle.left === "number" ? animatedCalloutStyle.left : undefined,
    right: typeof animatedCalloutStyle.right === "number" ? animatedCalloutStyle.right : undefined,
    bottom: typeof animatedCalloutStyle.bottom === "number" ? animatedCalloutStyle.bottom : undefined,
    width:
      typeof animatedCalloutStyle.width === "number" || typeof animatedCalloutStyle.width === "string"
        ? animatedCalloutStyle.width
        : undefined,
    opacity: 1,
    scale: 1,
    y: 0,
  };
  const spotlightTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 62, damping: 28, mass: 1.3 };
  const calloutTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 72, damping: 26, mass: 1.18 };
  const fadeTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.72, ease: [0.22, 1, 0.36, 1] as const };

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

      <AnimatePresence mode="wait">
        {showTransitionOverlay ? (
          <motion.div
            key="demo-tour-transition"
            className="pointer-events-none fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeTransition}
          >
            <motion.div className="demo-tour-transition-shell absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition} />
            <motion.div
              className="demo-tour-transition-card absolute left-1/2 top-1/2 w-[min(24rem,calc(100vw-2rem))] rounded-[1.4rem] border border-white/75 bg-white/92 px-6 py-6 text-center shadow-[0_30px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl"
              initial={{ x: "-50%", y: "-46%", opacity: 0, scale: 0.97 }}
              animate={{ x: "-50%", y: "-50%", opacity: 1, scale: 1 }}
              exit={{ x: "-50%", y: "-48%", opacity: 0, scale: 0.98 }}
              transition={calloutTransition}
            >
              <div className="mx-auto h-2 w-16 overflow-hidden rounded-full bg-slate-200/90">
                <div className="demo-tour-transition-bar h-full w-1/2 rounded-full bg-[linear-gradient(90deg,#185fa5,#0c447c)]" />
              </div>
              <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Guided handoff
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                {`Traveling to ${getRouteLabel(activeStep.routeId)}...`}
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">Bringing the next tour step into view.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showTourOverlay ? (
          <motion.div
            key={`demo-tour-overlay-${activeIndex}-${routeId}`}
            className="fixed inset-0 z-50 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeTransition}
          >
            {spotlight ? (
              <div className="absolute inset-0 pointer-events-none">
                <svg className="demo-tour-overlay-svg absolute inset-0 h-full w-full" aria-hidden="true">
                  <defs>
                    <mask id={maskId}>
                      <rect width="100%" height="100%" fill="white" />
                      <motion.rect
                        initial={false}
                        animate={{
                          x: spotlight.left,
                          y: spotlight.top,
                          width: spotlight.width,
                          height: spotlight.height,
                          rx: spotlight.radius,
                          ry: spotlight.radius,
                        }}
                        transition={spotlightTransition}
                        fill="black"
                      />
                    </mask>
                    <radialGradient id={`${maskId}-gradient`} cx="50%" cy="45%" r="82%">
                      <stop offset="0%" stopColor="rgba(15,23,42,0.18)" />
                      <stop offset="55%" stopColor="rgba(15,23,42,0.28)" />
                      <stop offset="100%" stopColor="rgba(15,23,42,0.4)" />
                    </radialGradient>
                  </defs>
                  <rect width="100%" height="100%" fill={`url(#${maskId}-gradient)`} mask={`url(#${maskId})`} />
                </svg>

                <motion.div
                  className="demo-tour-spotlight absolute pointer-events-none"
                  initial={false}
                  animate={{
                    top: spotlight.top,
                    left: spotlight.left,
                    width: spotlight.width,
                    height: spotlight.height,
                    borderRadius: spotlight.radius,
                  }}
                  transition={spotlightTransition}
                >
                  <div className="demo-tour-spotlight__glow absolute -inset-6 rounded-[calc(inherit+1.5rem)]" />
                  <div className="demo-tour-spotlight__wash absolute inset-0 rounded-[inherit]" />
                  <div className="demo-tour-spotlight__edge absolute inset-0 rounded-[inherit]" />
                </motion.div>
              </div>
            ) : (
              <motion.div className="demo-tour-backdrop absolute inset-0 pointer-events-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition} />
            )}

            {spotlight
              ? buildInteractionPanels(spotlight).map((panelStyle, index) => (
                  <div key={`demo-tour-blocker-${index}`} className="absolute pointer-events-auto" style={panelStyle} />
                ))
              : null}

            {spotlight && !activeStep.allowInteraction ? (
              <motion.div
                className="absolute pointer-events-auto"
                initial={false}
                animate={{
                  top: spotlight.top,
                  left: spotlight.left,
                  width: spotlight.width,
                  height: spotlight.height,
                  borderRadius: spotlight.radius,
                }}
                transition={spotlightTransition}
              />
            ) : null}

            <motion.aside
              layout
              className={`demo-tour-callout pointer-events-auto absolute ${calloutMode === "sheet" ? "demo-tour-callout-sheet" : "demo-tour-callout-floating"}`}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={animatedCalloutTarget}
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              transition={calloutTransition}
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
                      <button
                        type="button"
                        disabled
                        aria-hidden="true"
                        className={cn(buttonStyles({ variant: "secondary" }), "pointer-events-none opacity-0")}
                      >
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
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {enabled && dismissed ? (
          <motion.button
            key="demo-tour-resume"
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(STORAGE_DISMISSED_KEY);
              }
              setDismissed(false);
              setComplete(false);
            }}
            className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/92 px-3 py-2 text-xs font-semibold text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.12)] backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:bg-white"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={calloutTransition}
          >
            <span aria-hidden="true">{"\u25B6"}</span>
            Resume tour
          </motion.button>
        ) : null}
      </AnimatePresence>
    </>
  );
}
