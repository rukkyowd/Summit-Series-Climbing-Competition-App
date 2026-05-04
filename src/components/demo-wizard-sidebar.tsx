"use client";

import { useCallback, useState } from "react";
import { DemoLoadingOverlay, useDemoNavigation } from "@/components/demo-loading-overlay";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { jumpToDemoAnchor } from "@/lib/demo-jump-target";
import {
  DEMO_WIZARD_STEPS,
  isDemoWizardStepComplete,
  normalizeDemoWizardProgress,
  type DemoWizardProgress,
  type DemoWizardStep,
} from "@/lib/demo-wizard";

export type DemoWizardAction = {
  label: string;
  href?: string;
  onClick?: () => void | Promise<void>;
  targetAnchor?: string;
  disabled?: boolean;
  loadingTitle?: string;
  loadingText?: string;
  loadingDelayMs?: number;
};

export type DemoRankDelta = {
  targetName: string;
  rankBefore: number;
  rankNow: number;
  cutoff: number;
};

export type DemoWizardSidebarProps = {
  currentStep: DemoWizardStep;
  title: string;
  instruction: string;
  why: string;
  progress: Partial<DemoWizardProgress>;
  blockingMessage?: string | null;
  primaryAction?: DemoWizardAction;
  secondaryActions?: DemoWizardAction[];
  wandTarget?: { targetAthleteSelected: boolean } | null;
  demoRankDelta?: DemoRankDelta | null;
};

function ActionButton({
  action,
  navigateWithDemoLoading,
  primary = false,
}: {
  action: DemoWizardAction;
  navigateWithDemoLoading: ReturnType<typeof useDemoNavigation>["navigateWithDemoLoading"];
  primary?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const disabled = action.disabled || pending;

  async function runAction() {
    if (disabled) {
      return;
    }

    if (!action.onClick && !action.targetAnchor && !action.href) {
      return;
    }

    setPending(true);
    setError("");
    try {
      if (action.onClick) {
        await action.onClick();
      }
      if (action.targetAnchor && !jumpToDemoAnchor(action.targetAnchor)) {
        throw new Error("I can't find that step on this screen yet.");
      }
      if (action.href) {
        await navigateWithDemoLoading(action.href, {
          title: action.loadingTitle,
          text: action.loadingText,
          delayMs: action.loadingDelayMs,
        });
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "That demo action did not work. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={runAction}
        className={cn(
          buttonStyles({ variant: primary ? "primary" : "secondary", size: "compact", fullWidth: true }),
          disabled && "opacity-60"
        )}
      >
        {pending ? (action.href ? "Opening..." : "Working...") : action.label}
      </button>
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function WandButton({ targetAthleteSelected }: { targetAthleteSelected: boolean }) {
  const [pending, setPending] = useState(false);

  const run = useCallback(async () => {
    if (pending) {
      return;
    }

    setPending(true);
    try {
      if (!targetAthleteSelected) {
        jumpToDemoAnchor("judge-target-athlete");
        await new Promise<void>((resolve) => window.setTimeout(resolve, 750));
      }
      jumpToDemoAnchor("judge-attempt-counter");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1400));
      jumpToDemoAnchor("judge-top-button");
    } finally {
      setPending(false);
    }
  }, [pending, targetAthleteSelected]);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={run}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-[1rem] border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40",
        pending && "cursor-wait opacity-60"
      )}
      aria-label="Highlight the scoring controls you need to change"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
        <path d="m14 7 3 3" />
        <path d="M5 6v4" />
        <path d="M19 14v4" />
        <path d="M10 2v2" />
        <path d="M7 8H3" />
        <path d="M21 16h-4" />
        <path d="M11 3H9" />
      </svg>
      {pending ? "Highlighting..." : "Show me where"}
    </button>
  );
}

function RankDeltaWidget({ delta }: { delta: DemoRankDelta }) {
  const inFinals = delta.rankNow <= delta.cutoff;
  const changed = delta.rankNow !== delta.rankBefore;

  return (
    <div className="mt-3 rounded-[1rem] border border-sky-100 bg-sky-50/80 px-3 py-2.5">
      <div className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-sky-600">
        Correction impact
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <span
          className={cn(
            "text-lg font-black tabular-nums",
            changed ? "text-slate-400 line-through" : "text-slate-500"
          )}
          aria-label={`Previous rank: ${delta.rankBefore}`}
        >
          #{delta.rankBefore}
        </span>
        <span className="text-slate-400" aria-hidden="true">
          {"->"}
        </span>
        <span
          className={cn(
            "text-2xl font-black tabular-nums transition-colors duration-500",
            inFinals ? "text-emerald-600" : "text-slate-500"
          )}
          aria-label={`Current rank: ${delta.rankNow}`}
        >
          #{delta.rankNow}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.65rem] font-bold transition-colors duration-500",
            inFinals ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
          )}
        >
          {inFinals ? "Finals" : "Out"}
        </span>
      </div>
      <div className="mt-0.5 truncate text-xs text-slate-500">{delta.targetName}</div>
    </div>
  );
}

export function DemoWizardSidebar({
  currentStep,
  title,
  instruction,
  why,
  progress,
  blockingMessage = null,
  primaryAction,
  secondaryActions = [],
  wandTarget = null,
  demoRankDelta = null,
}: DemoWizardSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const normalizedProgress = normalizeDemoWizardProgress(progress);
  const currentIndex = DEMO_WIZARD_STEPS.findIndex((step) => step.id === currentStep);
  const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
  const currentLabel = `Step ${safeCurrentIndex + 1} of ${DEMO_WIZARD_STEPS.length}`;
  const { loadingCopy, navigateWithDemoLoading } = useDemoNavigation();
  const showWand =
    currentStep === "judge" &&
    !normalizedProgress.keyScoreCorrected &&
    wandTarget !== null;
  const showRankDelta =
    currentStep === "judge" &&
    !normalizedProgress.keyScoreCorrected &&
    demoRankDelta !== null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/95 px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shadow-[0_0_0_6px_rgba(14,165,233,0.14)]" />
        Summit demo: {currentLabel}
      </button>
    );
  }

  return (
    <aside className="fixed bottom-4 right-4 z-50 w-[min(23rem,calc(100vw-2rem))] rounded-[1.5rem] border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.22)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="results-kicker text-sky-700">Summit Series wizard</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {currentLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500"
        >
          Minimize
        </button>
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        {DEMO_WIZARD_STEPS.map((step, index) => {
          const active = step.id === currentStep;
          const complete = isDemoWizardStepComplete(step, normalizedProgress);
          return (
            <div
              key={step.id}
              className={cn(
                "h-2 flex-1 rounded-full",
                complete ? "bg-emerald-400" : active ? "bg-sky-500" : index < safeCurrentIndex ? "bg-slate-300" : "bg-slate-200"
              )}
              title={`${step.label}${complete ? " complete" : active ? " current" : ""}`}
            />
          );
        })}
      </div>

      {showWand ? (
        <div className="mt-3">
          <WandButton targetAthleteSelected={wandTarget?.targetAthleteSelected ?? false} />
        </div>
      ) : null}

      {showRankDelta && demoRankDelta ? <RankDeltaWidget delta={demoRankDelta} /> : null}

      <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{instruction}</p>
      <div className="mt-4 rounded-[1rem] border border-sky-100 bg-sky-50 px-3 py-3 text-sm leading-6 text-sky-950">
        <span className="font-semibold">Why it matters: </span>
        {why}
      </div>
      {blockingMessage ? (
        <div className="mt-3 rounded-[1rem] border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-medium leading-6 text-amber-900">
          {blockingMessage}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2">
        {primaryAction ? (
          <ActionButton action={primaryAction} navigateWithDemoLoading={navigateWithDemoLoading} primary />
        ) : null}
        {secondaryActions.map((action) => (
          <ActionButton
            key={`${action.label}-${action.href ?? action.targetAnchor ?? "action"}`}
            action={action}
            navigateWithDemoLoading={navigateWithDemoLoading}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <div className={normalizedProgress.dataPopulated ? "text-emerald-700" : ""}>
          {normalizedProgress.dataPopulated ? "Sample field ready" : "Add sample field"}
        </div>
        <div className={normalizedProgress.keyScoreCorrected ? "text-emerald-700" : ""}>
          {normalizedProgress.keyScoreCorrected ? "Correction saved" : "Score fix needed"}
        </div>
        <div className={normalizedProgress.organizerAdvanced ? "text-emerald-700" : ""}>
          {normalizedProgress.organizerAdvanced ? "Finalists set" : "Organizer step next"}
        </div>
        <div className={normalizedProgress.publicReady ? "text-emerald-700" : ""}>
          {normalizedProgress.publicReady ? "Public page ready" : "Public page next"}
        </div>
      </div>
      <DemoLoadingOverlay
        active={Boolean(loadingCopy)}
        title={loadingCopy?.title ?? "Opening next step..."}
        text={loadingCopy?.text ?? "Bringing the next demo screen into view."}
      />
    </aside>
  );
}
