"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button, buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type DemoHUDAction = {
  label: string;
  href?: string;
  onClick?: () => void | Promise<void>;
};

export type DemoHUDProps = {
  actLabel: string;
  title: string;
  instruction: string;
  why: string;
  completed: boolean;
  primaryAction?: DemoHUDAction;
  secondaryActions?: DemoHUDAction[];
};

type DemoHUDActionButtonProps = {
  action: DemoHUDAction;
  primary?: boolean;
  pendingLabel: string;
  onAsyncError: (message: string) => void;
};

function DemoHUDActionButton({ action, primary = false, pendingLabel, onAsyncError }: DemoHUDActionButtonProps) {
  const [pending, setPending] = useState(false);
  const variant = primary ? "primary" : "secondary";

  if (action.href && !action.onClick) {
    return (
      <Link href={action.href} className={buttonStyles({ variant, size: "sm", fullWidth: true })}>
        {action.label}
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      fullWidth
      disabled={pending}
      onClick={async () => {
        if (!action.onClick) {
          return;
        }

        setPending(true);
        onAsyncError("");
        try {
          await action.onClick();
        } catch (error) {
          onAsyncError(error instanceof Error ? error.message : "Demo action failed. Please try again.");
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? pendingLabel : action.label}
    </Button>
  );
}

export function DemoHUD({
  actLabel,
  title,
  instruction,
  why,
  completed,
  primaryAction,
  secondaryActions = [],
}: DemoHUDProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionError, setActionError] = useState("");
  const statusLabel = completed ? "Complete" : "Waiting for action";

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.section
            key="expanded"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-[1.5rem] border border-slate-200/90 bg-white/95 p-4 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.22)] backdrop-blur"
            aria-label={`${actLabel}: ${title}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      completed ? "animate-pulse bg-emerald-500" : "animate-pulse bg-sky-500"
                    )}
                    aria-hidden="true"
                  />
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-slate-500">
                    {actLabel}
                  </p>
                </div>
                <h2 className="mt-2 text-base font-semibold leading-snug text-slate-950">{title}</h2>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                onClick={() => setExpanded(false)}
              >
                x
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-sm leading-6 text-slate-600">{instruction}</p>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/90 p-3 text-sm leading-5 text-sky-950">
                <div className="mb-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-sky-700">
                  Why this matters
                </div>
                {why}
              </div>
              <div
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  completed ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"
                )}
              >
                {statusLabel}
              </div>
              {actionError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {actionError}
                </div>
              ) : null}
              <div className="grid gap-2">
                {primaryAction ? (
                  <DemoHUDActionButton
                    action={primaryAction}
                    primary
                    pendingLabel="Working..."
                    onAsyncError={setActionError}
                  />
                ) : null}
                {secondaryActions.map((action) => (
                  <DemoHUDActionButton
                    key={`${action.label}-${action.href ?? "action"}`}
                    action={action}
                    pendingLabel="Working..."
                    onAsyncError={setActionError}
                  />
                ))}
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.button
            key="collapsed"
            type="button"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            className={cn(
              "group flex items-center gap-2 rounded-full border bg-white/95 px-4 py-3 text-sm font-semibold shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
              completed ? "border-emerald-200 text-emerald-700" : "border-sky-200 text-sky-700"
            )}
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            aria-label={`Open demo guide: ${actLabel}`}
          >
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full ring-4",
                completed ? "animate-pulse bg-emerald-500 ring-emerald-100" : "animate-pulse bg-sky-500 ring-sky-100"
              )}
              aria-hidden="true"
            />
            <span>{actLabel}</span>
            <span className="text-slate-400 transition group-hover:text-slate-600">Guide</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
