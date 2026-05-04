"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type DemoWizardStep = "create" | "judge" | "organize" | "public" | "cleanup";

export type DemoWizardAction = {
  label: string;
  href?: string;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
};

export type DemoWizardSidebarProps = {
  currentStep: DemoWizardStep;
  title: string;
  instruction: string;
  why: string;
  progress: {
    eventReady: boolean;
    dataPopulated: boolean;
    keyScoreCorrected: boolean;
    organizerAdvanced: boolean;
    publicReady?: boolean;
  };
  primaryAction?: DemoWizardAction;
  secondaryActions?: DemoWizardAction[];
};

const WIZARD_STEPS: Array<{
  id: DemoWizardStep;
  label: string;
  progressKey?: keyof DemoWizardSidebarProps["progress"];
}> = [
  { id: "create", label: "Create", progressKey: "eventReady" },
  { id: "judge", label: "Judge", progressKey: "keyScoreCorrected" },
  { id: "organize", label: "Organize", progressKey: "organizerAdvanced" },
  { id: "public", label: "Public", progressKey: "publicReady" },
  { id: "cleanup", label: "Clean up" },
];

function isStepComplete(
  step: (typeof WIZARD_STEPS)[number],
  progress: DemoWizardSidebarProps["progress"]
) {
  return step.progressKey ? Boolean(progress[step.progressKey]) : false;
}

function ActionButton({
  action,
  primary = false,
}: {
  action: DemoWizardAction;
  primary?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const disabled = action.disabled || pending;

  async function runAction() {
    if (!action.onClick || disabled) {
      return;
    }

    setPending(true);
    setError("");
    try {
      await action.onClick();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Demo action failed.");
    } finally {
      setPending(false);
    }
  }

  if (action.href && !action.onClick) {
    return (
      <Link
        href={action.href}
        aria-disabled={disabled}
        className={cn(
          buttonStyles({ variant: primary ? "primary" : "secondary", size: "compact", fullWidth: true }),
          disabled && "pointer-events-none opacity-50"
        )}
      >
        {action.label}
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={runAction}
        className={buttonStyles({ variant: primary ? "primary" : "secondary", size: "compact", fullWidth: true })}
      >
        {pending ? "Working..." : action.label}
      </button>
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function DemoWizardSidebar({
  currentStep,
  title,
  instruction,
  why,
  progress,
  primaryAction,
  secondaryActions = [],
}: DemoWizardSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const currentIndex = WIZARD_STEPS.findIndex((step) => step.id === currentStep);
  const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
  const currentLabel = `Step ${safeCurrentIndex + 1} of ${WIZARD_STEPS.length}`;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/95 px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shadow-[0_0_0_6px_rgba(14,165,233,0.14)]" />
        Cascade demo: {currentLabel}
      </button>
    );
  }

  return (
    <aside className="fixed bottom-4 right-4 z-50 w-[min(23rem,calc(100vw-2rem))] rounded-[1.5rem] border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.22)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="results-kicker text-sky-700">Cascade Cup wizard</div>
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
        {WIZARD_STEPS.map((step, index) => {
          const active = step.id === currentStep;
          const complete = isStepComplete(step, progress);
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

      <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{instruction}</p>
      <div className="mt-4 rounded-[1rem] border border-sky-100 bg-sky-50 px-3 py-3 text-sm leading-6 text-sky-950">
        <span className="font-semibold">Why this matters: </span>
        {why}
      </div>

      <div className="mt-4 grid gap-2">
        {primaryAction ? <ActionButton action={primaryAction} primary /> : null}
        {secondaryActions.map((action) => (
          <ActionButton key={`${action.label}-${action.href ?? "action"}`} action={action} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <div className={progress.dataPopulated ? "text-emerald-700" : ""}>
          {progress.dataPopulated ? "Seeded field" : "No sample field yet"}
        </div>
        <div className={progress.keyScoreCorrected ? "text-emerald-700" : ""}>
          {progress.keyScoreCorrected ? "Maya corrected" : "Maya pending"}
        </div>
        <div className={progress.organizerAdvanced ? "text-emerald-700" : ""}>
          {progress.organizerAdvanced ? "Finals live" : "Organizer pending"}
        </div>
        <div className={progress.publicReady ? "text-emerald-700" : ""}>
          {progress.publicReady ? "Public ready" : "Results pending"}
        </div>
      </div>
    </aside>
  );
}
