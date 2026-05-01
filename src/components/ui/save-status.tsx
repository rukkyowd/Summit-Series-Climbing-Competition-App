import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type SaveStatusState = "idle" | "saving" | "saved" | "queued" | "offline" | "error";

const labels: Record<SaveStatusState, string> = {
  idle: "Ready",
  saving: "Saving...",
  saved: "Saved",
  queued: "Queued",
  offline: "Offline",
  error: "Save failed",
};

const dots: Record<SaveStatusState, string> = {
  idle: "bg-slate-300",
  saving: "bg-sky-500",
  saved: "bg-emerald-500",
  queued: "bg-amber-500",
  offline: "bg-slate-500",
  error: "bg-red-500",
};

type SaveStatusProps = HTMLAttributes<HTMLDivElement> & {
  state?: SaveStatusState;
  detail?: string | null;
};

export function SaveStatus({ state = "idle", detail, className, ...props }: SaveStatusProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm",
        className
      )}
      {...props}
    >
      <span className={cn("h-2 w-2 rounded-full", dots[state])} aria-hidden />
      <span>{labels[state]}</span>
      {detail ? <span className="font-medium text-slate-400">{detail}</span> : null}
    </div>
  );
}
