"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DemoPlaybackStep, DemoToolkitState } from "@/components/demo/types";

type DemoToolkitProps = {
  state: DemoToolkitState;
  playbackStep: DemoPlaybackStep | null;
  onRunDemo: () => void;
  onToggleOffline: (nextValue: boolean) => void;
  onSimulateOneScore: () => void;
  onRunLiveBurst: () => void;
  onSyncNow: () => void;
  onRestoreDemo: () => void;
};

const playbackCopy: Record<DemoPlaybackStep, string> = {
  save: "Step 1 of 4: judge is logging the flash...",
  leaderboard: "Step 2 of 4: the live ranking is reordering...",
  offline: "Step 3 of 4: Wi-Fi is down, but scores are still saving...",
  sync: "Step 4 of 4: reconnecting and publishing queued scores...",
  complete: "Pitch flow complete. You can replay it or take over manually.",
};

export function DemoToolkit({
  state,
  playbackStep,
  onRunDemo,
  onToggleOffline,
  onSimulateOneScore,
  onRunLiveBurst,
  onSyncNow,
  onRestoreDemo,
}: DemoToolkitProps) {
  const [open, setOpen] = useState(false);

  const syncLabel =
    state.lastSyncStatus === "synced"
      ? "Saved live"
      : state.lastSyncStatus === "saving"
        ? "Saving live..."
        : state.lastSyncStatus === "syncing"
          ? "Publishing queue..."
          : state.lastSyncStatus === "failed"
            ? "Needs review"
            : state.pendingQueueCount > 0
              ? `On this device (${state.pendingQueueCount})`
              : "On this device";

  return (
    <div className="demo-toolkit fixed bottom-4 left-1/2 z-40 w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2">
      <button
        type="button"
        className="demo-toolkit-summary w-full"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <div className="demo-toolkit-pill">
          <div className="flex min-w-0 items-center gap-3">
            <div className="demo-toolkit-icon" aria-hidden="true">
              {open ? "-" : "+"}
            </div>
            <div className="min-w-0">
              <div className="demo-toolkit-title">Demo tools</div>
              <div className="demo-toolkit-status">
                {state.scriptRunning && playbackStep
                  ? playbackCopy[playbackStep]
                  : state.simulateOffline
                    ? "Wi-Fi dropped. Scores are saving on this device."
                    : open
                      ? "Manual tools are open."
                      : "Open tools only when you want to steer the walkthrough."}
              </div>
            </div>
          </div>
          <div className="demo-toolkit-chip">{syncLabel}</div>
        </div>
      </button>

      {open ? (
        <div className="demo-toolkit-panel">
          <div className="space-y-3">
            <div className="results-kicker text-white/60">Walkthrough tools</div>
            <h3 className="text-xl font-semibold text-white">Run the 90-second comp-day story</h3>
            <p className="text-sm leading-relaxed text-slate-300">
              Kick off one guided sequence that scores a flash, moves the leaderboard, drops
              Wi-Fi, queues a score, then reconnects and publishes everything live.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Button
              variant="linearPrimary"
              className="min-h-14 rounded-[1.15rem] text-base"
              onClick={onRunDemo}
              disabled={state.scriptRunning || state.simulationRunning}
              data-demo-anchor="interactive-run-demo"
            >
              {state.scriptRunning ? "Running guided demo..." : "Run guided demo"}
            </Button>
            <Button
              variant="linearSecondary"
              className="min-h-14 rounded-[1.15rem] px-5"
              onClick={onRestoreDemo}
              disabled={state.scriptRunning}
            >
              Reset demo state
            </Button>
          </div>

          <div className="demo-toolkit-divider" />

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant="linearSecondary"
              className="min-h-12 rounded-[1rem]"
              onClick={onSimulateOneScore}
              disabled={state.scriptRunning}
            >
              Save one sample score
            </Button>
            <Button
              variant="linearSecondary"
              className="min-h-12 rounded-[1rem]"
              onClick={onRunLiveBurst}
              disabled={state.scriptRunning || state.simulationRunning}
            >
              {state.simulationRunning ? "Score burst running..." : "Run score burst"}
            </Button>
          </div>

          <label className="demo-toolkit-toggle">
            <div>
              <div className="font-semibold text-white">Simulate Wi-Fi drop</div>
              <div className="mt-1 text-sm text-slate-300">
                Keep scoring locally while the public leaderboard pauses.
              </div>
            </div>
            <input
              type="checkbox"
              checked={state.simulateOffline}
              onChange={(event) => onToggleOffline(event.target.checked)}
              className="h-5 w-5 rounded border-white/20 bg-transparent text-sky-400"
              disabled={state.scriptRunning && playbackStep !== "offline" && playbackStep !== "sync"}
              data-demo-anchor="interactive-offline-toggle"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant="linearGhost"
              className="min-h-11 rounded-[1rem] border border-white/10 bg-white/[0.04]"
              onClick={onSyncNow}
              disabled={(state.pendingQueueCount === 0 && state.lastSyncStatus !== "failed") || state.scriptRunning}
              data-demo-anchor="interactive-sync-now"
            >
              Publish queued scores
            </Button>
            <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              {state.pendingQueueCount > 0
                ? `${state.pendingQueueCount} queued ${state.pendingQueueCount === 1 ? "score is" : "scores are"} waiting to publish`
                : "No queued scores waiting"}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
