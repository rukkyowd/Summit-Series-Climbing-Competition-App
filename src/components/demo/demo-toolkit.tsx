"use client";

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
  save: "Logging the first flash...",
  leaderboard: "Live rankings are reshuffling...",
  offline: "Wi-Fi just dropped. Scores are queueing locally...",
  sync: "Reconnecting and publishing queued scores...",
  complete: "Pitch flow complete.",
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
  const syncLabel =
    state.lastSyncStatus === "synced"
      ? "Live sync"
      : state.lastSyncStatus === "syncing"
        ? "Syncing..."
        : state.lastSyncStatus === "failed"
          ? "Sync failed"
          : `Queued ${state.pendingQueueCount}`;

  return (
    <details className="demo-toolkit fixed bottom-4 left-1/2 z-40 w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2">
      <summary className="demo-toolkit-summary">
        <div className="demo-toolkit-pill">
          <div className="flex min-w-0 items-center gap-3">
            <div className="demo-toolkit-icon" aria-hidden="true">
              ▶
            </div>
            <div className="min-w-0">
              <div className="demo-toolkit-title">Demo controls</div>
              <div className="demo-toolkit-status">
                {state.scriptRunning && playbackStep
                  ? playbackCopy[playbackStep]
                  : state.simulateOffline
                    ? "Wi-Fi dropped. Scores queue locally."
                    : "Run the money-moment pitch or steer it manually."}
              </div>
            </div>
          </div>
          <div className="demo-toolkit-chip">{syncLabel}</div>
        </div>
      </summary>

      <div className="demo-toolkit-panel">
        <div className="space-y-3">
          <div className="results-kicker text-white/60">Pitch controls</div>
          <h3 className="text-xl font-semibold text-white">Run the 90-second comp-day story</h3>
          <p className="text-sm leading-relaxed text-slate-300">
            Kick off one guided sequence that scores a flash, moves the leaderboard, drops Wi-Fi,
            queues a score, then reconnects and publishes everything live.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Button
            variant="linearPrimary"
            className="min-h-14 rounded-[1.15rem] text-base"
            onClick={onRunDemo}
            disabled={state.scriptRunning || state.simulationRunning}
          >
            {state.scriptRunning ? "Running sales demo..." : "Run demo"}
          </Button>
          <Button
            variant="linearSecondary"
            className="min-h-14 rounded-[1.15rem] px-5"
            onClick={onRestoreDemo}
            disabled={state.scriptRunning}
          >
            Restore state
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
            Trigger one live score
          </Button>
          <Button
            variant="linearSecondary"
            className="min-h-12 rounded-[1rem]"
            onClick={onRunLiveBurst}
            disabled={state.scriptRunning || state.simulationRunning}
          >
            {state.simulationRunning ? "Live burst running..." : "Run live burst"}
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
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="linearGhost"
            className="min-h-11 rounded-[1rem] border border-white/10 bg-white/[0.04]"
            onClick={onSyncNow}
            disabled={(state.pendingQueueCount === 0 && state.lastSyncStatus !== "failed") || state.scriptRunning}
          >
            Reconnect and sync
          </Button>
          <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
            {state.pendingQueueCount > 0
              ? `${state.pendingQueueCount} queued ${state.pendingQueueCount === 1 ? "score" : "scores"} waiting`
              : "No queued scores"}
          </div>
        </div>
      </div>
    </details>
  );
}
