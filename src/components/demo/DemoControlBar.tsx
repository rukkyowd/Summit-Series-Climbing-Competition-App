"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { DEMO_ROLE_LABELS, type DemoRole } from "@/hooks/useDemoRole";

type DemoControlBarProps = {
  activeDemoName?: string | null;
  busyLabel?: string;
  role: DemoRole;
  simulateLive: boolean;
  simulationDisabled?: boolean;
  showAdvanced: boolean;
  onLoadDemo: () => void;
  onResetDemo: () => void;
  onRoleChange: (role: DemoRole) => void;
  onShowAdvancedChange: (showAdvanced: boolean) => void;
  onSimulateLiveChange: (simulateLive: boolean) => void;
};

const roles: DemoRole[] = ["admin", "judge", "public"];

export function DemoControlBar({
  activeDemoName,
  busyLabel,
  role,
  simulateLive,
  simulationDisabled = false,
  showAdvanced,
  onLoadDemo,
  onResetDemo,
  onRoleChange,
  onShowAdvancedChange,
  onSimulateLiveChange,
}: DemoControlBarProps) {
  const busy = Boolean(busyLabel);

  return (
    <div className="sticky top-3 z-40 rounded-[1.35rem] border border-white/70 bg-white/86 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="results-kicker">Demo Event</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="break-words font-semibold text-slate-950">
              {activeDemoName ?? "No demo loaded"}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
              {busyLabel ?? "Ready"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="primary" size="md" disabled={busy} onClick={onLoadDemo}>
            {busyLabel === "Loading demo..." ? "Loading..." : "Load Demo Event"}
          </Button>
          <Button type="button" variant="secondary" size="md" disabled={busy || !activeDemoName} onClick={onResetDemo}>
            {busyLabel === "Resetting demo..." ? "Resetting..." : "Reset Demo"}
          </Button>

          <button
            type="button"
            onClick={() => onSimulateLiveChange(!simulateLive)}
            disabled={busy || simulationDisabled}
            aria-pressed={simulateLive}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50",
              simulateLive
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-[0_10px_24px_rgba(16,185,129,0.12)]"
                : "border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300",
            )}
          >
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                simulateLive ? "bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,0.12)]" : "bg-slate-300",
              )}
              aria-hidden="true"
            />
            Simulate Live
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 border-t border-slate-200/70 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Role switcher">
          {roles.map((nextRole) => (
            <button
              key={nextRole}
              type="button"
              onClick={() => onRoleChange(nextRole)}
              className={cn(
                "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-all",
                nextRole === role
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-white/70 text-slate-500 hover:border-slate-300 hover:text-slate-800",
              )}
            >
              {DEMO_ROLE_LABELS[nextRole].replace(" View", "")}
            </button>
          ))}
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
          <input
            type="checkbox"
            checked={showAdvanced}
            onChange={(event) => onShowAdvancedChange(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          Advanced route links
        </label>
      </div>
    </div>
  );
}
