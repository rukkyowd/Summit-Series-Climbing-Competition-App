"use client";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { DemoToolkitState } from "@/components/demo/types";

type DemoToolkitProps = {
  state: DemoToolkitState;
  onToggleOffline: (nextValue: boolean) => void;
  onSimulateOneScore: () => void;
  onRunLiveBurst: () => void;
  onSyncNow: () => void;
  onRestoreDemo: () => void;
};

export function DemoToolkit({
  state,
  onToggleOffline,
  onSimulateOneScore,
  onRunLiveBurst,
  onSyncNow,
  onRestoreDemo,
}: DemoToolkitProps) {
  return (
    <details className="fixed right-4 top-24 z-40 w-[min(22rem,calc(100vw-2rem))]">
      <summary className="cursor-pointer list-none">
        <Surface variant="meta" className="flex items-center justify-between gap-3 rounded-[1.4rem] px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.12)]">
          <div>
            <div className="results-kicker">Demo control panel</div>
            <div className="mt-1 text-sm font-medium text-slate-800">
              {state.lastSyncStatus === "synced"
                ? "Synced"
                : state.lastSyncStatus === "syncing"
                  ? "Syncing..."
                  : state.lastSyncStatus === "failed"
                    ? "Sync failed"
                    : `Pending sync (${state.pendingQueueCount})`}
            </div>
          </div>
          <div className="results-chip">{state.simulateOffline ? "Wi-Fi dropped" : "Live sync"}</div>
        </Surface>
      </summary>
      <Surface variant="card" className="mt-3 space-y-4 rounded-[1.8rem] p-5 shadow-[0_22px_54px_rgba(15,23,42,0.18)]">
        <div>
          <div className="results-kicker">Controls</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Use this panel to prove the live scoring loop, simulate a gym Wi-Fi drop, and reset the seeded event.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={onSimulateOneScore}>
            Trigger live score
          </Button>
          <Button variant="secondary" onClick={onRunLiveBurst} disabled={state.simulationRunning}>
            {state.simulationRunning ? "Live burst running..." : "Run live burst"}
          </Button>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
          <span>Simulate Wi-Fi drop</span>
          <input
            type="checkbox"
            checked={state.simulateOffline}
            onChange={(event) => onToggleOffline(event.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-sky-600"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="ghost"
            onClick={onSyncNow}
            disabled={state.pendingQueueCount === 0 && state.lastSyncStatus !== "failed"}
          >
            Reconnect and sync
          </Button>
          <Button variant="danger" onClick={onRestoreDemo}>
            Restore demo state
          </Button>
        </div>
      </Surface>
    </details>
  );
}
