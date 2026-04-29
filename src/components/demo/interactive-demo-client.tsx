"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { DemoToolkit } from "@/components/demo/demo-toolkit";
import { InteractiveDemoTour } from "@/components/demo/interactive-demo-tour";
import { JudgeWorkspace } from "@/components/demo/judge-workspace";
import { LeaderboardPanel } from "@/components/demo/leaderboard-panel";
import type {
  DemoScenarioAthlete,
  DemoSimulationMode,
  DemoSimulationResponse,
  DemoToolkitState,
  JudgeQualifierSaveInput,
  LeaderboardImpact,
} from "@/components/demo/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { DEMO_COMPETITION_SLUG } from "@/lib/demo";
import {
  enqueueOfflineItem,
  readOfflineQueue,
  removeOfflineItem,
  writeOfflineQueue,
} from "@/lib/staff-offline-queue";
import {
  buildCompetitionPath,
  buildDisplayPath,
  buildQualifierLeaderboard,
  filterAttemptsForRound,
  type QualifierAttempt,
} from "@/lib/scoring";

type MobileTab = "judge" | "leaderboard";

function buildLocalAttempt(
  snapshot: CompetitionSnapshot,
  input: JudgeQualifierSaveInput
): QualifierAttempt {
  return {
    competition_id: snapshot.competition.id,
    round_id: snapshot.activeQualifierRound?.id ?? null,
    climber_id: input.climberId,
    climb_number: input.climbNumber,
    attempt_count: input.attemptCount,
    topped: input.topped,
    zone: input.zone,
    attempts_to_top: input.attemptsToTop,
    attempts_to_zone: input.attemptsToZone,
    entered_by: "staff",
    updated_at: new Date().toISOString(),
  };
}

function mergeQualifierAttempt(attempts: QualifierAttempt[], nextAttempt: QualifierAttempt) {
  const remaining = attempts.filter(
    (attempt) =>
      !(
        attempt.round_id === nextAttempt.round_id &&
        attempt.climb_number === nextAttempt.climb_number
      )
  );

  return [...remaining, nextAttempt].sort((left, right) => left.climb_number - right.climb_number);
}

function applyQualifierAttemptToSnapshot(
  snapshot: CompetitionSnapshot,
  nextAttempt: QualifierAttempt
): CompetitionSnapshot {
  const nextClimbers = snapshot.climbers.map((climber) =>
    climber.id === nextAttempt.climber_id
      ? {
          ...climber,
          qualifier_attempts: mergeQualifierAttempt(climber.qualifier_attempts, nextAttempt),
        }
      : climber
  );

  return {
    ...snapshot,
    climbers: nextClimbers,
    qualifierLeaderboard: buildQualifierLeaderboard(
      nextClimbers,
      snapshot.competition,
      snapshot.activeQualifierRound ?? null
    ),
  };
}

function getDemoQueueItems(competitionId: string) {
  return readOfflineQueue().filter(
    (
      item
    ): item is Extract<
      ReturnType<typeof readOfflineQueue>[number],
      { type: "qualifier" }
    > => item.type === "qualifier" && item.competitionId === competitionId
  );
}

async function postDemoQualifierAttempt(input: {
  competitionId: string;
  climberId: string;
  climbNumber: number;
  attemptCount: number;
  topped: boolean;
  zone: boolean;
  attemptsToTop: number | null;
  attemptsToZone: number | null;
}) {
  const response = await fetch("/api/demo/qualifier-attempt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as
    | { error?: string; attempt?: QualifierAttempt }
    | null;

  if (!response.ok || !payload?.attempt) {
    throw new Error(payload?.error || "Unable to save the demo qualifier score.");
  }

  return payload.attempt;
}

function shouldQueueFailedSave(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(message);
}

function getQualifierRank(snapshot: CompetitionSnapshot, climberId: string) {
  return snapshot.qualifierLeaderboard.find((entry) => entry.climber_id === climberId)?.category_rank ?? null;
}

function buildRankMessage(
  beforeSnapshot: CompetitionSnapshot,
  afterSnapshot: CompetitionSnapshot,
  athlete: DemoScenarioAthlete
) {
  const beforeRank = getQualifierRank(beforeSnapshot, athlete.id);
  const afterRank = getQualifierRank(afterSnapshot, athlete.id);

  if (beforeRank === null || afterRank === null) {
    return `Saved. ${athlete.name} is now visible on the public leaderboard.`;
  }

  if (afterRank < beforeRank) {
    return `Saved. ${athlete.name} moved from ${beforeRank}${ordinalSuffix(beforeRank)} to ${afterRank}${ordinalSuffix(afterRank)} in ${athlete.categoryLabel}.`;
  }

  if (afterRank > beforeRank) {
    return `Saved. ${athlete.name} now sits ${afterRank}${ordinalSuffix(afterRank)} in ${athlete.categoryLabel}.`;
  }

  return `Saved. ${athlete.name} stayed ${afterRank}${ordinalSuffix(afterRank)} in ${athlete.categoryLabel}, and the public leaderboard updated instantly.`;
}

function ordinalSuffix(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return "st";
  }
  if (mod10 === 2 && mod100 !== 12) {
    return "nd";
  }
  if (mod10 === 3 && mod100 !== 13) {
    return "rd";
  }
  return "th";
}

export function InteractiveDemoClient() {
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [leaderboardSnapshot, setLeaderboardSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [highlightedClimberId, setHighlightedClimberId] = useState<string | null>(null);
  const [leaderboardImpact, setLeaderboardImpact] = useState<LeaderboardImpact | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("judge");
  const [toolkitState, setToolkitState] = useState<DemoToolkitState>({
    simulateOffline: false,
    pendingQueueCount: 0,
    simulationRunning: false,
    lastSyncStatus: "synced",
  });
  const refreshTimerRef = useRef<number | null>(null);

  const refreshSnapshot = useCallback(async () => {
    const nextSnapshot = await getCompetitionSnapshot(DEMO_COMPETITION_SLUG);
    setSnapshot(nextSnapshot);
    setLeaderboardSnapshot(nextSnapshot);
    setToolkitState((current) => ({
      ...current,
      pendingQueueCount: getDemoQueueItems(nextSnapshot.competition.id).length,
    }));
    return nextSnapshot;
  }, []);

  useEffect(() => {
    setLoading(true);
    void refreshSnapshot()
      .then(() => {
        setError("");
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Unable to load the live demo.");
      })
      .finally(() => setLoading(false));
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!snapshot || toolkitState.simulateOffline) {
      return;
    }

    const tick = window.setInterval(() => {
      void refreshSnapshot().catch(() => {
        // Keep the local optimistic state if background refresh fails.
      });
    }, 8000);

    return () => window.clearInterval(tick);
  }, [refreshSnapshot, snapshot, toolkitState.simulateOffline]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const clearHighlightLater = () => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      setHighlightedClimberId(null);
      setLeaderboardImpact(null);
    }, 2600);
  };

  const scenarioAthlete = useMemo<DemoScenarioAthlete | null>(() => {
    if (!snapshot) {
      return null;
    }

    const preferred =
      snapshot.climbers.find((climber) => climber.name.toLowerCase().includes("maya foster")) ??
      snapshot.climbers[0] ??
      null;

    if (!preferred) {
      return null;
    }

    return {
      id: preferred.id,
      name: preferred.name,
      climberNumber: preferred.climber_number,
      categoryLabel: preferred.display_category,
    };
  }, [snapshot]);

  const handleSaveQualifier = useCallback(
    async (input: JudgeQualifierSaveInput) => {
      if (!snapshot) {
        return;
      }

      const previousSnapshot = snapshot;
      const optimisticAttempt = buildLocalAttempt(snapshot, input);
      const optimisticSnapshot = applyQualifierAttemptToSnapshot(snapshot, optimisticAttempt);
      setSaving(true);
      setError("");
      setMessage("");
      setHighlightedClimberId(input.climberId);
      const beforeRank = getQualifierRank(previousSnapshot, input.climberId);
      const optimisticAfterRank = getQualifierRank(optimisticSnapshot, input.climberId);
      setLeaderboardImpact({
        climberId: input.climberId,
        beforeRank,
        afterRank: optimisticAfterRank,
        delta: (beforeRank ?? 0) - (optimisticAfterRank ?? 0),
      });
      setSnapshot(optimisticSnapshot);
      if (!toolkitState.simulateOffline) {
        setLeaderboardSnapshot(optimisticSnapshot);
      }
      clearHighlightLater();

      if (toolkitState.simulateOffline) {
        enqueueOfflineItem({
          id: `demo-qualifier-${input.climberId}-${input.climbNumber}`,
          type: "qualifier",
          competitionId: snapshot.competition.id,
          climberId: input.climberId,
          climbNumber: input.climbNumber,
          attemptCount: input.attemptCount,
          topped: input.topped,
          zone: input.zone,
          attemptsToTop: input.attemptsToTop,
          attemptsToZone: input.attemptsToZone,
          createdAt: new Date().toISOString(),
        });
        setToolkitState((current) => ({
          ...current,
          pendingQueueCount: getDemoQueueItems(snapshot.competition.id).length,
          lastSyncStatus: "pending",
        }));
        setMessage(
          `Saved locally for ${scenarioAthlete?.name ?? "the demo athlete"}. The public leaderboard stays unchanged until you reconnect and sync.`
        );
        setSaving(false);
        return;
      }

      try {
        const savedAttempt = await postDemoQualifierAttempt({
          competitionId: snapshot.competition.id,
          climberId: input.climberId,
          climbNumber: input.climbNumber,
          attemptCount: input.attemptCount,
          topped: input.topped,
          zone: input.zone,
          attemptsToTop: input.attemptsToTop,
          attemptsToZone: input.attemptsToZone,
        });

        const savedSnapshot = applyQualifierAttemptToSnapshot(snapshot, savedAttempt);
        const savedAfterRank = getQualifierRank(savedSnapshot, input.climberId);
        setSnapshot(savedSnapshot);
        setLeaderboardSnapshot(savedSnapshot);
        setLeaderboardImpact({
          climberId: input.climberId,
          beforeRank,
          afterRank: savedAfterRank,
          delta: (beforeRank ?? 0) - (savedAfterRank ?? 0),
        });
        setToolkitState((current) => ({
          ...current,
          lastSyncStatus: "synced",
        }));
        setMessage(
          scenarioAthlete && input.climberId === scenarioAthlete.id
            ? buildRankMessage(previousSnapshot, savedSnapshot, scenarioAthlete)
            : "Saved judge call. The leaderboard updated from the same competition snapshot."
        );
        void refreshSnapshot().catch(() => {
          // The optimistic state already shows the result; silent failure is okay here.
        });
      } catch (nextError) {
        if (shouldQueueFailedSave(nextError)) {
          enqueueOfflineItem({
            id: `demo-qualifier-${input.climberId}-${input.climbNumber}`,
            type: "qualifier",
            competitionId: snapshot.competition.id,
            climberId: input.climberId,
            climbNumber: input.climbNumber,
            attemptCount: input.attemptCount,
            topped: input.topped,
            zone: input.zone,
            attemptsToTop: input.attemptsToTop,
            attemptsToZone: input.attemptsToZone,
            createdAt: new Date().toISOString(),
          });
          setToolkitState((current) => ({
            ...current,
            pendingQueueCount: getDemoQueueItems(snapshot.competition.id).length,
            lastSyncStatus: "pending",
          }));
          setMessage("Network failed, so the score queued locally for retry. Reconnect to publish it.");
        } else {
          setSnapshot(previousSnapshot);
          setLeaderboardSnapshot(previousSnapshot);
          setToolkitState((current) => ({
            ...current,
            lastSyncStatus: "failed",
          }));
          setError(nextError instanceof Error ? nextError.message : "Unable to save the judge call.");
        }
      } finally {
        setSaving(false);
      }
    },
    [refreshSnapshot, scenarioAthlete, snapshot, toolkitState.simulateOffline]
  );

  const flushOfflineQueue = useCallback(async () => {
    if (!snapshot) {
      return;
    }

    const queue = getDemoQueueItems(snapshot.competition.id);
    if (!queue.length) {
      setToolkitState((current) => ({
        ...current,
        pendingQueueCount: 0,
        lastSyncStatus: "synced",
      }));
      return;
    }

    setToolkitState((current) => ({
      ...current,
      lastSyncStatus: "syncing",
    }));
    setError("");
    setMessage("");

    try {
      for (const item of queue) {
        await postDemoQualifierAttempt({
          competitionId: item.competitionId,
          climberId: item.climberId,
          climbNumber: item.climbNumber,
          attemptCount: item.attemptCount,
          topped: item.topped,
          zone: item.zone ?? false,
          attemptsToTop: item.attemptsToTop ?? null,
          attemptsToZone: item.attemptsToZone ?? null,
        });
        removeOfflineItem(item.id);
      }

      await refreshSnapshot();
      setToolkitState((current) => ({
        ...current,
        pendingQueueCount: getDemoQueueItems(snapshot.competition.id).length,
        lastSyncStatus: "synced",
      }));
      setMessage("Queued score synced. Public leaderboard is live again.");
    } catch (nextError) {
      setToolkitState((current) => ({
        ...current,
        pendingQueueCount: getDemoQueueItems(snapshot.competition.id).length,
        lastSyncStatus: "failed",
      }));
      setError(nextError instanceof Error ? nextError.message : "Unable to sync queued demo scores.");
    }
  }, [refreshSnapshot, snapshot]);

  const handleToggleOffline = (nextValue: boolean) => {
    setToolkitState((current) => ({
      ...current,
      simulateOffline: nextValue,
      lastSyncStatus: nextValue
        ? current.pendingQueueCount > 0
          ? "pending"
          : current.lastSyncStatus
        : current.lastSyncStatus,
    }));

    if (!nextValue) {
      void flushOfflineQueue();
    }
  };

  const runSimulationStep = useCallback(
    async (mode: DemoSimulationMode) => {
      const response = await fetch("/api/demo/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ({ error?: string } & Partial<DemoSimulationResponse>)
        | null;

      if (!response.ok || !payload?.attempt || !snapshot) {
        throw new Error(payload?.error || "Unable to run the demo simulation.");
      }

      const impactedClimberId = payload.climberId ?? payload.attempt.climber_id;
      const beforeRank = getQualifierRank(snapshot, impactedClimberId);
      const simulatedSnapshot = applyQualifierAttemptToSnapshot(
        snapshot,
        payload.attempt as QualifierAttempt
      );
      setHighlightedClimberId(impactedClimberId);
      setSnapshot(simulatedSnapshot);
      setLeaderboardSnapshot(simulatedSnapshot);
      setLeaderboardImpact({
        climberId: impactedClimberId,
        beforeRank,
        afterRank: getQualifierRank(simulatedSnapshot, impactedClimberId),
        delta:
          (beforeRank ?? 0) -
          (getQualifierRank(simulatedSnapshot, impactedClimberId) ?? 0),
      });
      clearHighlightLater();
      await refreshSnapshot();
    },
    [refreshSnapshot, snapshot]
  );

  const handleSimulateOneScore = async () => {
    setError("");
    setMessage("");
    try {
      await runSimulationStep("single_score");
      setMessage("Triggered one live score so you can point out the real-time ranking jump.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to simulate a score.");
    }
  };

  const handleRunLiveBurst = async () => {
    if (toolkitState.simulationRunning) {
      return;
    }

    setToolkitState((current) => ({
      ...current,
      simulationRunning: true,
    }));
    setMessage("Live burst started. Watch the public rankings keep moving without leaving the page.");
    setError("");

    try {
      await runSimulationStep("live_burst");
      const burstCount = 11;
      for (let index = 0; index < burstCount; index += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        await runSimulationStep("live_burst");
      }
      setMessage("Live burst complete.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to run the live burst.");
    } finally {
      setToolkitState((current) => ({
        ...current,
        simulationRunning: false,
      }));
    }
  };

  const handleRestoreDemo = async () => {
    setError("");
    setMessage("");
    try {
      if (snapshot) {
        const remaining = readOfflineQueue().filter((item) => item.competitionId !== snapshot.competition.id);
        writeOfflineQueue(remaining);
      }

      const response = await fetch("/api/demo/reset", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to restore the seeded demo.");
      }

      await refreshSnapshot();
      setToolkitState((current) => ({
        ...current,
        pendingQueueCount: snapshot ? getDemoQueueItems(snapshot.competition.id).length : 0,
        lastSyncStatus: "synced",
      }));
      setMessage("Demo restored to the seeded qualifier-in-progress state.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to restore the demo.");
    }
  };

  const statusLabel = useMemo(() => {
    const status = toolkitState.lastSyncStatus;
    if (status === "synced") {
      return "Synced";
    }
    if (status === "syncing") {
      return "Syncing...";
    }
    if (status === "failed") {
      return "Sync failed";
    }
    return `Pending sync (${toolkitState.pendingQueueCount})`;
  }, [toolkitState.lastSyncStatus, toolkitState.pendingQueueCount]);

  if (loading) {
    return (
      <main className="results-page">
        <div className="content-frame space-y-6">
          <SiteHeader
            light
            status={
              <Link href="/demo" className="results-secondary-button">
                Back to demo roles
              </Link>
            }
          />
          <Surface variant="card" className="text-slate-600">
            Loading the live scoring demo...
          </Surface>
        </div>
      </main>
    );
  }

  if (!snapshot || !leaderboardSnapshot) {
    return (
      <main className="results-page">
        <div className="content-frame space-y-6">
          <SiteHeader light />
          <Alert variant="error">{error || "Unable to load the live scoring demo."}</Alert>
        </div>
      </main>
    );
  }

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader
          light
          status={
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/demo" className="results-secondary-button">
                Demo roles
              </Link>
              <Link href={buildDisplayPath(snapshot.competition.slug)} className="results-secondary-button">
                Public display
              </Link>
              <div className="results-chip">{statusLabel}</div>
            </div>
          }
        />

        <Surface variant="card" className="overflow-hidden">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-3">
              <div className="results-kicker">Experience as a judge</div>
              <h1 className="results-editorial-title text-4xl font-semibold text-slate-950 sm:text-5xl">
                Save one score. Watch the rank change live.
              </h1>
              <p className="max-w-3xl text-base leading-relaxed text-slate-600">
                You are judging {scenarioAthlete?.categoryLabel ?? "Youth D qualifiers"}. Start with{" "}
                {scenarioAthlete?.name ?? "the highlighted athlete"} on Boulder 1. The moment you save,
                the right side shows exactly what climbers, coaches, and spectators see.
              </p>
              {scenarioAthlete ? (
                <div className="inline-flex max-w-3xl flex-wrap items-center gap-2 rounded-full border border-sky-200 bg-sky-50/90 px-4 py-2 text-sm font-medium text-sky-800">
                  <span>You are judging {scenarioAthlete.categoryLabel} qualifiers.</span>
                  <span className="hidden sm:inline">·</span>
                  <span>Save {scenarioAthlete.name} on Boulder 1 first.</span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-start gap-3 lg:justify-end">
              <Button variant="secondary" onClick={() => setMobileTab("judge")} className="xl:hidden">
                Judge
              </Button>
              <Button variant="secondary" onClick={() => setMobileTab("leaderboard")} className="xl:hidden">
                Leaderboard
              </Button>
              <Link href="/staff/demo" className="results-secondary-button">
                Organizer workflow
              </Link>
            </div>
          </div>
        </Surface>

        {message ? <Alert variant="success">{message}</Alert> : null}
        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className={`min-w-0 ${mobileTab === "leaderboard" ? "hidden xl:block" : ""}`}>
            <JudgeWorkspace
              snapshot={snapshot}
              embedded
              saving={saving}
              queuedCount={toolkitState.pendingQueueCount}
              message=""
              error=""
              syncStatus={statusLabel}
              initialClimberId={scenarioAthlete?.id ?? snapshot.climbers[0]?.id ?? null}
              targetClimberId={scenarioAthlete?.id ?? null}
              targetClimberName={scenarioAthlete?.name ?? null}
              offlineMode={toolkitState.simulateOffline}
              onSaveQualifier={handleSaveQualifier}
            />
          </div>
          <div className={`min-w-0 ${mobileTab === "judge" ? "hidden xl:block" : ""}`}>
            <LeaderboardPanel
              snapshot={leaderboardSnapshot}
              embedded
              highlightedClimberId={highlightedClimberId}
              targetClimberId={scenarioAthlete?.id ?? null}
              impact={leaderboardImpact}
            />
          </div>
        </div>
      </div>

      <DemoToolkit
        state={toolkitState}
        onToggleOffline={handleToggleOffline}
        onSimulateOneScore={() => void handleSimulateOneScore()}
        onRunLiveBurst={() => void handleRunLiveBurst()}
        onSyncNow={() => void flushOfflineQueue()}
        onRestoreDemo={() => void handleRestoreDemo()}
      />
      <InteractiveDemoTour
        pendingQueueCount={toolkitState.pendingQueueCount}
        climberName={scenarioAthlete?.name ?? "the demo athlete"}
      />
    </main>
  );
}
