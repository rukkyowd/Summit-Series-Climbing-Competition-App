"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import { DemoSalesShell } from "@/components/demo/demo-sales-shell";
import { DemoToolkit } from "@/components/demo/demo-toolkit";
import { InteractiveDemoTour } from "@/components/demo/interactive-demo-tour";
import { JudgeWorkspace } from "@/components/demo/judge-workspace";
import { LeaderboardPanel } from "@/components/demo/leaderboard-panel";
import type {
  DemoScenarioAthlete,
  DemoQueuedScorePreview,
  DemoPlaybackStep,
  DramaContext,
  DemoSimulationMode,
  DemoSimulationResponse,
  DemoToolkitState,
  JudgeQualifierSaveInput,
  LeaderboardImpact,
  LeaderboardToast,
} from "@/components/demo/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import {
  clearDemoSalesSession,
  createDemoSalesSession,
  patchDemoSalesSession,
  readDemoSalesSession,
  writeDemoSalesSession,
  type DemoSalesSession,
} from "@/lib/demo-sales-session";
import {
  buildQueueMetadata,
  type OfflineQueueItem,
  markOfflineItemRetried,
  enqueueOfflineItem,
  readOfflineQueue,
  removeOfflineItem,
  writeOfflineQueue,
} from "@/lib/staff-offline-queue";
import { DEMO_PITCH_CLIMBS, getDemoPitchClimb } from "@/lib/demo";
import {
  buildCompetitionPath,
  buildDisplayPath,
  buildQualifierLeaderboard,
  filterAttemptsForRound,
  type QualifierAttempt,
} from "@/lib/scoring";

type MobileTab = "judge" | "leaderboard";
type TourStepId = "judge" | "save" | "leaderboard" | "offline" | "sync";
type PlaybackNarration = {
  title: string;
  body: string;
};

type DemoAudioEngine = {
  click: () => void;
  flash: () => void;
};

type DemoCursorState = {
  visible: boolean;
  x: number;
  y: number;
  clicking: boolean;
  label: string | null;
};

const JUDGE_STEP_LABELS: Record<Exclude<DemoPlaybackStep, "complete"> | "complete", string> = {
  save: "Judge · flash save",
  leaderboard: "Judge · live leaderboard",
  offline: "Judge · Wi-Fi drop",
  sync: "Judge · reconnect and sync",
  complete: "Judge · story complete",
};

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

type DemoQualifierSaveResponse = {
  attempt: QualifierAttempt;
  status: "accepted" | "projected" | "conflicted" | "ignored_as_stale";
  conflictReason: string | null;
  clientEventId: string | null;
  scoredAt: string | null;
};

async function getDemoQueueItems(competitionId: string) {
  return (await readOfflineQueue()).filter(
    (item): item is Extract<OfflineQueueItem, { type: "qualifier" }> =>
      item.type === "qualifier" && item.competitionId === competitionId
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
  clientEventId: string;
  scoredAt: string;
  judgeDeviceId: string | null;
  judgeSessionId: string | null;
  replayedFromOffline?: boolean;
}) {
  const response = await fetch("/api/demo/qualifier-attempt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as
    | { error?: string; attempt?: QualifierAttempt; status?: DemoQualifierSaveResponse["status"]; conflictReason?: string | null; clientEventId?: string | null; scoredAt?: string | null }
    | null;

  if (!response.ok || !payload?.attempt) {
    throw new Error(payload?.error || "Unable to save the demo qualifier score.");
  }

  return {
    attempt: payload.attempt,
    status: payload.status ?? "accepted",
    conflictReason: payload.conflictReason ?? null,
    clientEventId: payload.clientEventId ?? null,
    scoredAt: payload.scoredAt ?? null,
  } satisfies DemoQualifierSaveResponse;
}

function shouldQueueFailedSave(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(message);
}

function normalizeDemoErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : String(error ?? "").trim();
  if (!message) {
    return fallback;
  }

  if (/unauthorized/i.test(message)) {
    return "This demo action needs a fresh authorized session before it can publish live again.";
  }

  return message;
}

function getQualifierRank(snapshot: CompetitionSnapshot, climberId: string) {
  return snapshot.qualifierLeaderboard.find((entry) => entry.climber_id === climberId)?.category_rank ?? null;
}

function getQualifierEntryByName(snapshot: CompetitionSnapshot, climberName: string) {
  return snapshot.qualifierLeaderboard.find((entry) => entry.name === climberName) ?? null;
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

function buildDramaSwapMessage(
  beforeSnapshot: CompetitionSnapshot,
  afterSnapshot: CompetitionSnapshot,
  dramaContext: DramaContext
) {
  const athleteBefore = getQualifierEntryByName(beforeSnapshot, dramaContext.athleteName);
  const athleteAfter = getQualifierEntryByName(afterSnapshot, dramaContext.athleteName);
  const bubbleBefore = getQualifierEntryByName(beforeSnapshot, dramaContext.climberBName);
  const bubbleAfter = getQualifierEntryByName(afterSnapshot, dramaContext.climberBName);
  const categoryLabel = athleteAfter?.display_category ?? athleteBefore?.display_category ?? "this category";

  if (
    athleteBefore?.category_rank &&
    athleteAfter?.category_rank &&
    bubbleBefore?.category_rank &&
    bubbleAfter?.category_rank
  ) {
    return `${dramaContext.athleteName} jumps from ${athleteBefore.category_rank}${ordinalSuffix(athleteBefore.category_rank)} to ${athleteAfter.category_rank}${ordinalSuffix(athleteAfter.category_rank)} in ${categoryLabel}. ${dramaContext.climberBName} slides from ${bubbleBefore.category_rank}${ordinalSuffix(bubbleBefore.category_rank)} to ${bubbleAfter.category_rank}${ordinalSuffix(bubbleAfter.category_rank)} on counting attempts. ${dramaContext.tiebreakExplanation}`;
  }

  return dramaContext.tiebreakExplanation;
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

function buildScoreResultLabel(attempt: Pick<QualifierAttempt, "topped" | "zone" | "attempt_count">) {
  if (attempt.topped) {
    return attempt.attempt_count === 1
      ? "FLASH TOP ✓"
      : `TOP on attempt ${attempt.attempt_count} ✓`;
  }
  if (attempt.zone) {
    return `ZONE on attempt ${attempt.attempt_count}`;
  }
  return `Attempt ${attempt.attempt_count} logged`;
}

function formatQueuedAtLabel(scoredAt: string) {
  const timestamp = new Date(scoredAt).getTime();
  if (Number.isNaN(timestamp)) {
    return "Queued just now";
  }

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) {
    return "Queued just now";
  }
  if (seconds < 60) {
    return `Queued ${seconds}s ago`;
  }

  return `Queued ${Math.round(seconds / 60)}m ago`;
}

function buildQueuedScorePreviews(
  queue: Extract<OfflineQueueItem, { type: "qualifier" }>[],
  snapshot: CompetitionSnapshot | null
): DemoQueuedScorePreview[] {
  return queue.map((item) => {
    const climber = snapshot?.climbers.find((entry) => entry.id === item.climberId);
    return {
      id: item.id,
      climberName: climber?.name ?? "Queued climber",
      climbLabel: getDemoPitchClimb(item.climbNumber)?.label ?? `Boulder ${String(item.climbNumber).padStart(2, "0")}`,
      resultLabel: buildScoreResultLabel({
        topped: item.topped,
        zone: item.zone ?? false,
        attempt_count: item.attemptCount,
      }),
      queuedAtLabel: formatQueuedAtLabel(item.scoredAt),
      retryCount: item.retryCount,
    };
  });
}

function findClimber(snapshot: CompetitionSnapshot, climberId: string) {
  return snapshot.climbers.find((climber) => climber.id === climberId) ?? null;
}

function buildImpactReason(snapshot: CompetitionSnapshot, climberId: string) {
  const entry = snapshot.qualifierLeaderboard.find((row) => row.climber_id === climberId);
  if (!entry) {
    return null;
  }

  const sameCategory = snapshot.qualifierLeaderboard.filter(
    (row) => row.category_id === entry.category_id && row.climber_id !== climberId
  );

  const nearby = sameCategory.find(
    (row) =>
      row.category_rank === entry.category_rank + 1 ||
      row.category_rank === entry.category_rank - 1
  );

  if (!nearby) {
    return null;
  }

  if (
    entry.topped_count === nearby.topped_count &&
    entry.zone_count === nearby.zone_count &&
    entry.counting_attempt_total < nearby.counting_attempt_total
  ) {
    return "Fewer attempts wins";
  }

  if (entry.topped_count >= nearby.topped_count && entry.counting_attempt_total < nearby.counting_attempt_total) {
    return "Cleaner attempts edge it";
  }

  return null;
}

export function InteractiveDemoClient() {
  const router = useRouter();
  const shellClassName = "mx-auto w-full space-y-6 xl:space-y-7";

  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [leaderboardSnapshot, setLeaderboardSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [highlightedClimberId, setHighlightedClimberId] = useState<string | null>(null);
  const [leaderboardImpact, setLeaderboardImpact] = useState<LeaderboardImpact | null>(null);
  const [leaderboardToast, setLeaderboardToast] = useState<LeaderboardToast | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(new Date().toISOString());
  const [liveSaveCompleted, setLiveSaveCompleted] = useState(false);
  const [leaderboardObserved, setLeaderboardObserved] = useState(false);
  const [offlineQueuedSaveCompleted, setOfflineQueuedSaveCompleted] = useState(false);
  const [syncRecovered, setSyncRecovered] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("judge");
  const [activeTourStep, setActiveTourStep] = useState<TourStepId>("judge");
  const [playbackStep, setPlaybackStep] = useState<DemoPlaybackStep | null>(null);
  const [presentationFocus, setPresentationFocus] = useState<DemoPlaybackStep | "judge" | null>("judge");
  const [playbackNarration, setPlaybackNarration] = useState<PlaybackNarration | null>(null);
  const [salesSession, setSalesSession] = useState<DemoSalesSession | null>(null);
  const [salesAudioEnabled, setSalesAudioEnabled] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [demoCompetitionId, setDemoCompetitionId] = useState<string | null>(null);
  const [demoCursor, setDemoCursor] = useState<DemoCursorState>({
    visible: false,
    x: 0,
    y: 0,
    clicking: false,
    label: null,
  });
  const [toolkitState, setToolkitState] = useState<DemoToolkitState>({
    simulateOffline: false,
    pendingQueueCount: 0,
    simulationRunning: false,
    scriptRunning: false,
    lastSyncStatus: "synced",
  });
  const [queuedScorePreviews, setQueuedScorePreviews] = useState<DemoQueuedScorePreview[]>([]);
  const refreshTimerRef = useRef<number | null>(null);
  const leaderboardToastTimerRef = useRef<number | null>(null);
  const leaderboardBurstTriggeredRef = useRef(false);
  const snapshotRef = useRef<CompetitionSnapshot | null>(null);
  const confettiTimerRef = useRef<number | null>(null);
  const audioEngineRef = useRef<DemoAudioEngine | null>(null);
  const salesAutoplayStartedRef = useRef(false);
  const runDemoRef = useRef<((options?: { preserveSalesSession?: boolean }) => Promise<void>) | null>(null);
  runDemoRef.current = handleRunDemo;

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const session = readDemoSalesSession();
    setSalesSession(session);
    setSalesAudioEnabled(session?.audioEnabled ?? false);
    setDemoCompetitionId(session?.competitionId ?? null);
  }, []);

  const syncSalesSessionState = useCallback((updater: (current: DemoSalesSession | null) => DemoSalesSession) => {
    setSalesSession((current) => {
      const next = updater(current);
      setDemoCompetitionId(next.competitionId ?? null);
      writeDemoSalesSession(next);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (confettiTimerRef.current) {
        window.clearTimeout(confettiTimerRef.current);
      }
    };
  }, []);

  const getAudioEngine = useCallback(() => {
    if (audioEngineRef.current) {
      return audioEngineRef.current;
    }

    const AudioContextCtor =
      typeof window !== "undefined"
        ? (window.AudioContext ||
            // @ts-expect-error webkit fallback
            window.webkitAudioContext)
        : null;

    if (!AudioContextCtor) {
      return null;
    }

    const context = new AudioContextCtor();
    const playTone = (frequency: number, duration: number, gainValue: number) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(gainValue, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    };

    audioEngineRef.current = {
      click: () => playTone(560, 0.09, 0.03),
      flash: () => {
        playTone(780, 0.12, 0.045);
        playTone(1170, 0.2, 0.028);
      },
    };

    return audioEngineRef.current;
  }, []);

  const playDemoSound = useCallback(
    (tone: "click" | "flash") => {
      if (!salesAudioEnabled) {
        return;
      }

      const engine = getAudioEngine();
      if (!engine) {
        return;
      }

      engine[tone]();
    },
    [getAudioEngine, salesAudioEnabled]
  );

  const triggerConfetti = useCallback(() => {
    setShowConfetti(true);
    if (confettiTimerRef.current) {
      window.clearTimeout(confettiTimerRef.current);
    }
    confettiTimerRef.current = window.setTimeout(() => {
      setShowConfetti(false);
    }, 1800);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    if (!demoCompetitionId) {
      throw new Error("No organizer demo event is active yet. Create an event from the organizer flow first.");
    }

    const nextSnapshot = await getCompetitionSnapshot(demoCompetitionId);
    const pendingQueue = await getDemoQueueItems(nextSnapshot.competition.id);
    setSnapshot(nextSnapshot);
    setLeaderboardSnapshot(nextSnapshot);
    setLastUpdatedAt(new Date().toISOString());
    setQueuedScorePreviews(buildQueuedScorePreviews(pendingQueue, nextSnapshot));
    setToolkitState((current) => ({
      ...current,
      pendingQueueCount: pendingQueue.length,
    }));
    return nextSnapshot;
  }, [demoCompetitionId]);

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
      if (leaderboardToastTimerRef.current) {
        window.clearTimeout(leaderboardToastTimerRef.current);
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

  const showLeaderboardToast = useCallback(
    (toast: LeaderboardToast) => {
      setLeaderboardToast(toast);
      setLastUpdatedAt(new Date().toISOString());
      if (leaderboardToastTimerRef.current) {
        window.clearTimeout(leaderboardToastTimerRef.current);
      }
      leaderboardToastTimerRef.current = window.setTimeout(() => {
        setLeaderboardToast(null);
      }, 3200);
    },
    []
  );

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
      const liveSnapshot = snapshotRef.current ?? snapshot;
      if (!liveSnapshot) {
        return;
      }

      const previousSnapshot = liveSnapshot;
      const optimisticAttempt = buildLocalAttempt(liveSnapshot, input);
      const optimisticSnapshot = applyQualifierAttemptToSnapshot(liveSnapshot, optimisticAttempt);
      setSaving(true);
      setError("");
      setMessage("");
      setToolkitState((current) => ({
        ...current,
        lastSyncStatus: toolkitState.simulateOffline ? "pending" : "saving",
      }));
      setHighlightedClimberId(input.climberId);
      const beforeRank = getQualifierRank(previousSnapshot, input.climberId);
      const optimisticAfterRank = getQualifierRank(optimisticSnapshot, input.climberId);
      setLeaderboardImpact({
        climberId: input.climberId,
        beforeRank,
        afterRank: optimisticAfterRank,
        delta: (beforeRank ?? 0) - (optimisticAfterRank ?? 0),
        reason: buildImpactReason(optimisticSnapshot, input.climberId),
      });
      setSnapshot(optimisticSnapshot);
      if (!toolkitState.simulateOffline) {
        setLeaderboardSnapshot(optimisticSnapshot);
      }
      clearHighlightLater();

      if (toolkitState.simulateOffline) {
        const metadata = await buildQueueMetadata();
        await enqueueOfflineItem({
          id: `demo-qualifier-${input.climberId}-${input.climbNumber}`,
          type: "qualifier",
          competitionId: liveSnapshot.competition.id,
          climberId: input.climberId,
          climbNumber: input.climbNumber,
          attemptCount: input.attemptCount,
          topped: input.topped,
          zone: input.zone,
          attemptsToTop: input.attemptsToTop,
          attemptsToZone: input.attemptsToZone,
          clientEventId: metadata.clientEventId,
          scoredAt: metadata.scoredAt,
          judgeDeviceId: metadata.judgeDeviceId,
          judgeSessionId: metadata.judgeSessionId,
          createdAt: new Date().toISOString(),
          retryCount: 0,
          lastTriedAt: null,
        });
        const queue = await getDemoQueueItems(liveSnapshot.competition.id);
        setQueuedScorePreviews(buildQueuedScorePreviews(queue, optimisticSnapshot));
        setToolkitState((current) => ({
          ...current,
          pendingQueueCount: queue.length,
          lastSyncStatus: "pending",
        }));
        if (scenarioAthlete && input.climberId === scenarioAthlete.id) {
          setOfflineQueuedSaveCompleted(true);
          setSyncRecovered(false);
        }
        setMessage(
          `Saved locally for ${scenarioAthlete?.name ?? "the demo athlete"}. The public leaderboard stays unchanged until you reconnect and sync.`
        );
        setSaving(false);
        return;
      }

      try {
        const metadata = await buildQueueMetadata();
        const savedResult = await postDemoQualifierAttempt({
          competitionId: liveSnapshot.competition.id,
          climberId: input.climberId,
          climbNumber: input.climbNumber,
          attemptCount: input.attemptCount,
          topped: input.topped,
          zone: input.zone,
          attemptsToTop: input.attemptsToTop,
          attemptsToZone: input.attemptsToZone,
          clientEventId: metadata.clientEventId,
          scoredAt: metadata.scoredAt,
          judgeDeviceId: metadata.judgeDeviceId,
          judgeSessionId: metadata.judgeSessionId,
        });

        const savedSnapshot = applyQualifierAttemptToSnapshot(liveSnapshot, savedResult.attempt);
        const savedAfterRank = getQualifierRank(savedSnapshot, input.climberId);
        const impactReason = buildImpactReason(savedSnapshot, input.climberId);
        const savedClimber = findClimber(savedSnapshot, input.climberId);
        const climbLabel =
          getDemoPitchClimb(input.climbNumber)?.label ??
          `Boulder ${String(input.climbNumber).padStart(2, "0")}`;
        setSnapshot(savedSnapshot);
        setLeaderboardSnapshot(savedSnapshot);
        setLeaderboardImpact({
          climberId: input.climberId,
          beforeRank,
          afterRank: savedAfterRank,
          delta: (beforeRank ?? 0) - (savedAfterRank ?? 0),
          reason: impactReason,
        });
        setToolkitState((current) => ({
          ...current,
          lastSyncStatus: "synced",
        }));
        if (scenarioAthlete && input.climberId === scenarioAthlete.id) {
          setLiveSaveCompleted(true);
        }
        setMessage(
          scenarioAthlete && input.climberId === scenarioAthlete.id
            ? buildRankMessage(previousSnapshot, savedSnapshot, scenarioAthlete)
            : "Score saved live. The leaderboard updated from the same event record."
        );
        if (savedClimber) {
          showLeaderboardToast({
            id: `${savedClimber.id}-${Date.now()}`,
            climberId: savedClimber.id,
            climberName: savedClimber.name,
            climbLabel,
            resultLabel: buildScoreResultLabel(savedResult.attempt),
            detail: impactReason,
          });
        }
        void refreshSnapshot().catch(() => {
          // The optimistic state already shows the result; silent failure is okay here.
        });
      } catch (nextError) {
        if (shouldQueueFailedSave(nextError)) {
          const metadata = await buildQueueMetadata();
          await enqueueOfflineItem({
            id: `demo-qualifier-${input.climberId}-${input.climbNumber}`,
            type: "qualifier",
          competitionId: liveSnapshot.competition.id,
            climberId: input.climberId,
            climbNumber: input.climbNumber,
            attemptCount: input.attemptCount,
            topped: input.topped,
            zone: input.zone,
            attemptsToTop: input.attemptsToTop,
            attemptsToZone: input.attemptsToZone,
            clientEventId: metadata.clientEventId,
            scoredAt: metadata.scoredAt,
            judgeDeviceId: metadata.judgeDeviceId,
            judgeSessionId: metadata.judgeSessionId,
            createdAt: new Date().toISOString(),
            retryCount: 0,
            lastTriedAt: null,
          });
          const queue = await getDemoQueueItems(liveSnapshot.competition.id);
          setQueuedScorePreviews(buildQueuedScorePreviews(queue, previousSnapshot));
          setToolkitState((current) => ({
            ...current,
            pendingQueueCount: queue.length,
            lastSyncStatus: "pending",
          }));
          if (scenarioAthlete && input.climberId === scenarioAthlete.id) {
            setOfflineQueuedSaveCompleted(true);
            setSyncRecovered(false);
          }
          setMessage("Network failed, so the score queued locally for retry. Reconnect to publish it.");
        } else {
          setSnapshot(previousSnapshot);
          setLeaderboardSnapshot(previousSnapshot);
          setToolkitState((current) => ({
            ...current,
            lastSyncStatus: "failed",
          }));
          setError(normalizeDemoErrorMessage(nextError, "Unable to save the score live right now."));
        }
      } finally {
        setSaving(false);
      }
    },
    [refreshSnapshot, scenarioAthlete, showLeaderboardToast, snapshot, toolkitState.simulateOffline]
  );

  const flushOfflineQueue = useCallback(async () => {
    const liveSnapshot = snapshotRef.current ?? snapshot;
    if (!liveSnapshot) {
      return;
    }

    const queue = await getDemoQueueItems(liveSnapshot.competition.id);
    if (!queue.length) {
      setQueuedScorePreviews([]);
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
          clientEventId: item.clientEventId,
          scoredAt: item.scoredAt,
          judgeDeviceId: item.judgeDeviceId,
          judgeSessionId: item.judgeSessionId,
          replayedFromOffline: true,
        });
        await removeOfflineItem(item.id);
      }

      await refreshSnapshot();
      const remaining = await getDemoQueueItems(liveSnapshot.competition.id);
      const refreshedSnapshot = await getCompetitionSnapshot(liveSnapshot.competition.id);
      setQueuedScorePreviews(buildQueuedScorePreviews(remaining, refreshedSnapshot));
      setToolkitState((current) => ({
        ...current,
        pendingQueueCount: remaining.length,
        lastSyncStatus: "synced",
      }));
      if (queue.length > 0) {
        setSyncRecovered(true);
      }
      const lastQueuedItem = queue[queue.length - 1];
      if (lastQueuedItem) {
        const queuedClimber = findClimber(refreshedSnapshot, lastQueuedItem.climberId);
        if (queuedClimber) {
          showLeaderboardToast({
            id: `${queuedClimber.id}-${Date.now()}`,
            climberId: queuedClimber.id,
            climberName: queuedClimber.name,
            climbLabel:
              getDemoPitchClimb(lastQueuedItem.climbNumber)?.label ??
              `Boulder ${String(lastQueuedItem.climbNumber).padStart(2, "0")}`,
            resultLabel: buildScoreResultLabel({
              topped: lastQueuedItem.topped,
              zone: lastQueuedItem.zone ?? false,
              attempt_count: lastQueuedItem.attemptCount,
            }),
            detail: "Queued score just landed on the public leaderboard.",
          });
        }
      }
      setMessage("Queued score synced. Public leaderboard is live again.");
    } catch (nextError) {
      if (queue[0]) {
        await markOfflineItemRetried(queue[0].id);
      }
      const remaining = await getDemoQueueItems(liveSnapshot.competition.id);
      setQueuedScorePreviews(buildQueuedScorePreviews(remaining, liveSnapshot));
      setToolkitState((current) => ({
        ...current,
        pendingQueueCount: remaining.length,
        lastSyncStatus: "failed",
      }));
      setError(nextError instanceof Error ? nextError.message : "Unable to sync queued demo scores.");
    }
  }, [refreshSnapshot, showLeaderboardToast, snapshot]);

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
      const liveSnapshot = snapshotRef.current ?? snapshot;
      const response = await fetch("/api/demo/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode, competitionId: liveSnapshot?.competition.id }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ({ error?: string } & Partial<DemoSimulationResponse>)
        | null;

      if (!response.ok || !liveSnapshot) {
        throw new Error(payload?.error || "Unable to run the demo simulation.");
      }

      if (payload?.alreadyFired) {
        if (payload.message) {
          setMessage(payload.message);
        }

        return {
          payload,
          simulatedSnapshot: liveSnapshot,
          beforeRank: null,
          afterRank: null,
        };
      }

      if (!payload?.attempt) {
        throw new Error(payload?.error || "Unable to run the demo simulation.");
      }

      const impactedClimberId = payload.climberId ?? payload.attempt.climber_id;
      const beforeRank = getQualifierRank(liveSnapshot, impactedClimberId);
      const simulatedSnapshot = applyQualifierAttemptToSnapshot(
        liveSnapshot,
        payload.attempt as QualifierAttempt
      );
      const impactReason = buildImpactReason(simulatedSnapshot, impactedClimberId);
      const impactedClimber = findClimber(simulatedSnapshot, impactedClimberId);
      const climbLabel =
        getDemoPitchClimb(payload.climbNumber ?? payload.attempt.climb_number)?.label ??
        `Boulder ${String(payload.climbNumber ?? payload.attempt.climb_number).padStart(2, "0")}`;
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
        reason: impactReason,
      });
      if (impactedClimber) {
        showLeaderboardToast({
          id: `${impactedClimber.id}-${Date.now()}`,
          climberId: impactedClimber.id,
          climberName: impactedClimber.name,
          climbLabel,
          resultLabel: buildScoreResultLabel(payload.attempt),
          detail: impactReason,
        });
      }
      clearHighlightLater();
      await refreshSnapshot();

      return {
        payload,
        simulatedSnapshot,
        beforeRank,
        afterRank: getQualifierRank(simulatedSnapshot, impactedClimberId),
      };
    },
    [refreshSnapshot, showLeaderboardToast, snapshot]
  );

  const resetDramaScenario = useCallback(
    async (suppressErrors = false) => {
      const liveSnapshot = snapshotRef.current ?? snapshot;
      if (!liveSnapshot) {
        return false;
      }

      try {
        const response = await fetch("/api/demo/simulate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "drama_reset",
            competitionId: liveSnapshot.competition.id,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | ({ error?: string } & Partial<DemoSimulationResponse>)
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Unable to reset the drama scenario.");
        }

        await refreshSnapshot();
        setHighlightedClimberId(null);
        setLeaderboardImpact(null);
        setLeaderboardToast(null);
        return true;
      } catch (nextError) {
        if (!suppressErrors) {
          setError(nextError instanceof Error ? nextError.message : "Unable to reset the drama scenario.");
        }
        return false;
      }
    },
    [refreshSnapshot, snapshot]
  );

  const handleSimulateOneScore = async () => {
    setError("");
    setMessage("");
    try {
      const result = await runSimulationStep("drama_tick");
      if (result?.payload?.dramaContext) {
        setMessage(buildDramaSwapMessage(snapshotRef.current ?? snapshot ?? result.simulatedSnapshot, result.simulatedSnapshot, result.payload.dramaContext));
        setLeaderboardObserved(true);
      } else {
        setMessage(result?.payload?.message ?? "Triggered the cut-line swap.");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to trigger the cut-line swap.");
    }
  };

  const handleRunLiveBurst = async () => {
    if (toolkitState.simulationRunning || toolkitState.scriptRunning) {
      return;
    }

    setToolkitState((current) => ({
      ...current,
      simulationRunning: true,
    }));
    setMessage("Live burst started. Watch the public rankings keep moving without leaving the page.");
      setError("");

      try {
        const burstCount = 5;
        for (let index = 0; index < burstCount; index += 1) {
          if (index > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 1300));
          }
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

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const moveDemoCursorTo = useCallback(
    async (
      anchor: string,
      options?: {
        click?: boolean;
        label?: string | null;
        settleMs?: number;
      }
    ) => {
      const element = document.querySelector<HTMLElement>(`[data-demo-anchor="${anchor}"]`);
      if (!element) {
        return;
      }

      if (anchor.startsWith("interactive-offline") || anchor.startsWith("interactive-sync")) {
        element.closest("details")?.setAttribute("open", "open");
      }

      element.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "smooth",
      });

      await wait(options?.settleMs ?? 700);

      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width * 0.5;
      const y = rect.top + rect.height * 0.5;

      setDemoCursor({
        visible: true,
        x,
        y,
        clicking: false,
        label: options?.label ?? null,
      });

      await wait(420);

      if (options?.click) {
        setDemoCursor((current) => ({
          ...current,
          clicking: true,
        }));
        playDemoSound("click");
        await wait(260);
        setDemoCursor((current) => ({
          ...current,
          clicking: false,
        }));
      }
    },
    [playDemoSound]
  );

  const resetDemoDataInBackground = useCallback(async () => {
    if (snapshotRef.current) {
      const remaining = (await readOfflineQueue()).filter(
        (item) => item.competitionId !== snapshotRef.current?.competition.id
      );
      await writeOfflineQueue(remaining);
    }
  }, []);

  const replayFullSalesStory = async () => {
    setError("");
    setMessage("");
    const resetWorked = await resetDramaScenario(true);
    if (!resetWorked) {
      await handleRestoreDemo();
      return;
    }

    setLiveSaveCompleted(false);
    setLeaderboardObserved(false);
    setOfflineQueuedSaveCompleted(false);
    setSyncRecovered(false);
    setPlaybackStep(null);
    setPlaybackNarration(null);
    setPresentationFocus("judge");
    setMobileTab("judge");
    await handleRunDemo({ preserveSalesSession: salesSession?.organizerCompleted });
  };

  async function handleRunDemo(options?: { preserveSalesSession?: boolean }) {
    if (toolkitState.scriptRunning || toolkitState.simulationRunning) {
      return;
    }

    const freshSnapshot = snapshotRef.current ?? snapshot;
    if (!freshSnapshot) {
      setError("No simulated judge event is loaded yet.");
      return;
    }

    const athlete =
      freshSnapshot?.climbers.find((climber) => climber.name.toLowerCase().includes("maya foster")) ??
      freshSnapshot?.climbers[0] ??
      null;

    if (!athlete) {
      setError("Unable to find the scripted demo athlete.");
      return;
    }

    setToolkitState((current) => ({
      ...current,
      scriptRunning: true,
    }));
    setError("");
    setMessage("Guided demo started. Watch one saved score, the finals bubble swap, the Wi-Fi drop, and the sync recovery.");
    syncSalesSessionState((current) =>
      createDemoSalesSession({
        mode: "judge",
        phase: "judge",
        storyStep: "judge-save",
        narratorTitle: options?.preserveSalesSession
          ? "The event you just configured is now powering live judging."
          : "Watch one saved score drive the whole comp-day story.",
        narratorBody: options?.preserveSalesSession
          ? "Stay with the story as the same event moves into one judge save, a live leaderboard reaction, and an offline recovery moment."
          : "This guided demo shows the money moment: one clean save, live public movement, a Wi-Fi failure, and a resilient sync catch-up.",
        autoplay: true,
        organizerCompleted: options?.preserveSalesSession ?? false,
        judgePending: false,
        persistentCompletion: false,
        audioEnabled: current?.audioEnabled ?? salesAudioEnabled,
        competitionId: freshSnapshot.competition.id,
        competitionSlug: freshSnapshot.competition.slug,
      })
    );

    try {
      await resetDramaScenario(true);
      setPlaybackNarration({
        title: "Starting the guided demo",
        body: "You are watching the exact comp-day story: one judge logs a score, the finals bubble flips live on tiebreaks, Wi-Fi drops, scores keep queueing, then everything syncs back in.",
      });
      await wait(2600);

      setPresentationFocus("judge");
      setPlaybackStep("save");
      setMobileTab("judge");
      setPlaybackNarration({
        title: "Step 1: Judge logs a flash",
        body: `Watch the left side. ${athlete.name} gets a flash on ${getDemoPitchClimb(1)?.label ?? "Boulder 1"} and that result becomes the official public score.`,
      });
      syncSalesSessionState((current) => ({
        ...(current ??
          createDemoSalesSession({
            mode: "judge",
            phase: "judge",
            storyStep: "judge-save",
            narratorTitle: "",
            narratorBody: "",
          })),
        phase: "judge",
        storyStep: "judge-save",
        narratorTitle: "Step 1: Judge logs a flash",
        narratorBody: `Watch the left side. ${athlete.name} gets a flash on ${getDemoPitchClimb(1)?.label ?? "Boulder 1"} and that result becomes the official public score.`,
      }));
      await moveDemoCursorTo("interactive-top-button", {
        click: true,
        label: "Top",
      });
      await wait(900);
      await moveDemoCursorTo("interactive-save-button", {
        click: true,
        label: "Save score",
      });
      await wait(1200);

      await handleSaveQualifier({
        climberId: athlete.id,
        climbNumber: 1,
        attemptCount: 1,
        topped: true,
        zone: true,
        attemptsToTop: 1,
        attemptsToZone: 1,
      });
      playDemoSound("flash");
      triggerConfetti();
      await wait(2200);

      setPresentationFocus("leaderboard");
      setPlaybackStep("leaderboard");
      setMobileTab("leaderboard");
      setPlaybackNarration({
        title: "Step 2: The finals bubble flips live",
        body: "Now watch the right side. One corrected attempt count changes the tie-break chain and flips the last finals spot in real time.",
      });
      syncSalesSessionState((current) => ({
        ...(current ??
          createDemoSalesSession({
            mode: "judge",
            phase: "judge",
            storyStep: "judge-leaderboard",
            narratorTitle: "",
            narratorBody: "",
          })),
        phase: "judge",
        storyStep: "judge-leaderboard",
        narratorTitle: "Step 2: The finals bubble flips live",
        narratorBody:
          "Now watch the right side. One corrected attempt count changes the tie-break chain and flips the last finals spot in real time.",
      }));
      setDemoCursor((current) => ({
        ...current,
        label: "Bubble spot changes live",
      }));
      await wait(2600);
      const dramaResult = await runSimulationStep("drama_tick");
      if (dramaResult?.payload?.dramaContext) {
        setMessage(
          buildDramaSwapMessage(
            snapshotRef.current ?? freshSnapshot,
            dramaResult.simulatedSnapshot,
            dramaResult.payload.dramaContext
          )
        );
      }
      setLeaderboardObserved(true);
      await wait(2200);
      await runSimulationStep("live_burst");
      await wait(1600);
      await runSimulationStep("live_burst");
      setMessage("The cut line just flipped on attempts, and the rest of the board keeps moving like a real comp floor.");
      await wait(2200);

      setPresentationFocus("offline");
      setPlaybackStep("offline");
      setMobileTab("judge");
      setPlaybackNarration({
        title: "Step 3: Wi-Fi drops, but judging keeps going",
        body: "The left side is now in offline mode. The public leaderboard pauses, but the judge can still save a score locally without losing the result.",
      });
      syncSalesSessionState((current) => ({
        ...(current ??
          createDemoSalesSession({
            mode: "judge",
            phase: "judge",
            storyStep: "judge-offline",
            narratorTitle: "",
            narratorBody: "",
          })),
        phase: "judge",
        storyStep: "judge-offline",
        narratorTitle: "Step 3: Wi-Fi drops, but judging keeps going",
        narratorBody:
          "The left side is now in offline mode. The public leaderboard pauses, but the judge can still save a score locally without losing the result.",
      }));
      setToolkitState((current) => ({
        ...current,
        simulateOffline: true,
        lastSyncStatus: current.pendingQueueCount > 0 ? "pending" : current.lastSyncStatus,
      }));
      await moveDemoCursorTo("interactive-offline-toggle", {
        click: true,
        label: "Simulate Wi-Fi drop",
      });
      await wait(1800);
      await moveDemoCursorTo("interactive-zone-button", {
        click: true,
        label: "Zone",
      });
      await wait(700);
      await moveDemoCursorTo("interactive-save-button", {
        click: true,
        label: "Save locally",
      });
      await wait(1200);
      await handleSaveQualifier({
        climberId: athlete.id,
        climbNumber: 2,
        attemptCount: 2,
        topped: false,
        zone: true,
        attemptsToTop: null,
        attemptsToZone: 2,
      });
      await wait(2400);

      setPresentationFocus("sync");
      setPlaybackStep("sync");
      setPlaybackNarration({
        title: "Step 4: Reconnect and publish the queue",
        body: "Wi-Fi comes back, the queued score flushes, and the public side catches up without the judge having to re-enter anything.",
      });
      syncSalesSessionState((current) => ({
        ...(current ??
          createDemoSalesSession({
            mode: "judge",
            phase: "judge",
            storyStep: "judge-sync",
            narratorTitle: "",
            narratorBody: "",
          })),
        phase: "judge",
        storyStep: "judge-sync",
        narratorTitle: "Step 4: Reconnect and publish the queue",
        narratorBody:
          "Wi-Fi comes back, the queued score flushes, and the public side catches up without the judge having to re-enter anything.",
      }));
      setToolkitState((current) => ({
        ...current,
        simulateOffline: false,
      }));
      await moveDemoCursorTo("interactive-offline-toggle", {
        click: true,
        label: "Reconnect Wi-Fi",
      });
      await wait(1100);
      await moveDemoCursorTo("interactive-sync-now", {
        click: true,
        label: "Reconnect and sync",
      });
      await wait(1100);
      await flushOfflineQueue();
      setMobileTab("leaderboard");
      await wait(2600);

      setPlaybackStep("complete");
      setPresentationFocus("leaderboard");
      setPlaybackNarration({
        title: "Demo complete",
        body: "In under a minute, you just built the event, watched judging go live, saw the leaderboard update, and proved the app can recover cleanly when Wi-Fi drops.",
      });
      await resetDemoDataInBackground();
      syncSalesSessionState((current) => ({
        ...(current ??
          createDemoSalesSession({
            mode: "judge",
            phase: "complete",
            storyStep: "complete",
            narratorTitle: "",
            narratorBody: "",
          })),
        mode: "judge",
        phase: "complete",
        storyStep: "complete",
        narratorTitle: "Demo complete",
        narratorBody:
          "The comp was created from scratch, judging worked, the leaderboard reacted live, and the offline queue recovered cleanly. Use Start over whenever you want to return to the organizer flow and build the next event.",
        autoplay: false,
        organizerCompleted: true,
        judgePending: false,
        persistentCompletion: true,
        audioEnabled: salesAudioEnabled,
      }));
      salesAutoplayStartedRef.current = false;
      setMessage("Guided demo complete. Use Start over to jump back to the organizer flow and rebuild the event from scratch.");
    } catch (nextError) {
      setError(normalizeDemoErrorMessage(nextError, "Unable to run the guided demo."));
    } finally {
      setDemoCursor((current) => ({
        ...current,
        visible: false,
        clicking: false,
        label: null,
      }));
      setToolkitState((current) => ({
        ...current,
        scriptRunning: false,
      }));
    }
  }

  const handleGuidedLeaderboardBurst = useCallback(async () => {
    if (toolkitState.simulationRunning || toolkitState.simulateOffline) {
      return;
    }

    setLeaderboardObserved(false);
    setToolkitState((current) => ({
      ...current,
      simulationRunning: true,
    }));
    setMessage("Watch the finals bubble flip first, then the rest of the field keeps moving around it.");
    setError("");

    try {
      const dramaResult = await runSimulationStep("drama_tick");
      if (dramaResult?.payload?.dramaContext) {
        setMessage(
          buildDramaSwapMessage(
            snapshotRef.current ?? snapshot ?? dramaResult.simulatedSnapshot,
            dramaResult.simulatedSnapshot,
            dramaResult.payload.dramaContext
          )
        );
        setLeaderboardObserved(true);
      }

      const burstCount = 2;
      for (let index = 0; index < burstCount; index += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        await runSimulationStep("live_burst");
      }
      setMessage("The cut line moved on attempts, then the board kept breathing with live ambient scores.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to run the guided live event burst.");
    } finally {
      setToolkitState((current) => ({
        ...current,
        simulationRunning: false,
      }));
    }
  }, [runSimulationStep, snapshot, toolkitState.simulateOffline, toolkitState.simulationRunning]);

  useEffect(() => {
    if (activeTourStep !== "leaderboard") {
      leaderboardBurstTriggeredRef.current = false;
      return;
    }

    if (!leaderboardBurstTriggeredRef.current) {
      setLeaderboardObserved(false);
    }

    if (!liveSaveCompleted || toolkitState.simulateOffline || toolkitState.scriptRunning) {
      return;
    }

    if (leaderboardBurstTriggeredRef.current) {
      return;
    }

    leaderboardBurstTriggeredRef.current = true;
    void handleGuidedLeaderboardBurst();
  }, [
    activeTourStep,
    handleGuidedLeaderboardBurst,
      leaderboardObserved,
      liveSaveCompleted,
      toolkitState.scriptRunning,
      toolkitState.simulateOffline,
    ]);

  async function handleRestoreDemo() {
    setError("");
    setMessage("");
    try {
      const activeCompetitionId = snapshot?.competition.id ?? demoCompetitionId;
      if (activeCompetitionId) {
        const remaining = (await readOfflineQueue()).filter((item) => item.competitionId !== activeCompetitionId);
        await writeOfflineQueue(remaining);
      }

      const response = await fetch("/api/demo/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "public_demo",
          competitionId: activeCompetitionId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to reset the demo event.");
      }

      clearDemoSalesSession();
      setDemoCompetitionId(null);
      setSalesSession(null);
      salesAutoplayStartedRef.current = false;
      router.push("/staff/demo");
    } catch (nextError) {
      setError(normalizeDemoErrorMessage(nextError, "Unable to reset the demo."));
    }
  }

  const statusLabel = useMemo(() => {
    const status = toolkitState.lastSyncStatus;
    if (status === "synced") {
      return "Saved live";
    }
    if (status === "saving") {
      return "Saving live...";
    }
    if (status === "syncing") {
      return "Publishing queued scores...";
    }
    if (status === "failed") {
      return "Sync needs review";
    }
    return toolkitState.pendingQueueCount > 0 ? `Saved on this device (${toolkitState.pendingQueueCount})` : "Saved on this device";
  }, [toolkitState.lastSyncStatus, toolkitState.pendingQueueCount]);
  const showPersistentCompletion = playbackStep === "complete" || salesSession?.persistentCompletion === true;

  useEffect(() => {
    if (!snapshot || !salesSession || salesAutoplayStartedRef.current) {
      return;
    }

    if (salesSession.mode === "judge" && salesSession.autoplay) {
      salesAutoplayStartedRef.current = true;
      void runDemoRef.current?.({ preserveSalesSession: salesSession.organizerCompleted });
    }
  }, [salesSession, snapshot]);

  if (loading) {
    return (
      <main className="results-page">
        <div className={shellClassName}>
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
        <div className={shellClassName}>
          <SiteHeader light />
          <Alert variant="error">
            {error || "Unable to load the live scoring demo."}
            {!demoCompetitionId ? (
              <>
                {" "}
                <Link href="/staff/demo" className="underline underline-offset-2">
                  Go back to the organizer demo
                </Link>
                {" "}to create and launch an event first.
              </>
            ) : null}
          </Alert>
        </div>
      </main>
    );
  }

  return (
    <main className={`results-page ${toolkitState.simulateOffline ? "demo-pitch-offline-page" : ""}`}>
      <div className={shellClassName}>
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

        <DemoSalesShell
          mode="judge"
          stepLabel={JUDGE_STEP_LABELS[playbackStep ?? "save"]}
          title={playbackNarration?.title ?? salesSession?.narratorTitle ?? "Watch the finals bubble flip live on one corrected score."}
          body={
            playbackNarration?.body ??
            salesSession?.narratorBody ??
            "This pitch path shows a clean save, a cut-line tiebreak swap, a Wi-Fi drop, and a resilient sync recovery."
          }
          autoplayRunning={toolkitState.scriptRunning}
          audioEnabled={salesAudioEnabled}
          onReplay={() => void replayFullSalesStory()}
          onSkipToJudge={() => void handleRunDemo({ preserveSalesSession: salesSession?.organizerCompleted })}
          onBackToOrganizer={() => {
            writeDemoSalesSession(
              createDemoSalesSession({
                mode: "organizer",
                phase: "organizer",
                storyStep: "organizer-intro",
                narratorTitle: "Back to the organizer side of the story.",
                narratorBody:
                  "Return to the organizer setup flow to show how the event gets built before comp day starts.",
                autoplay: false,
                organizerCompleted: false,
                judgePending: false,
                persistentCompletion: false,
                audioEnabled: salesAudioEnabled,
                competitionId: snapshot.competition.id,
                competitionSlug: snapshot.competition.slug,
              })
            );
            router.push("/staff/demo");
          }}
          onToggleAudio={() => {
            const nextValue = !salesAudioEnabled;
            setSalesAudioEnabled(nextValue);
            const existing = readDemoSalesSession();
            if (existing) {
              setSalesSession({
                ...existing,
                audioEnabled: nextValue,
              });
              patchDemoSalesSession({ audioEnabled: nextValue });
            } else {
              writeDemoSalesSession(
                createDemoSalesSession({
                  mode: "judge",
                  phase: "judge",
                  storyStep: "judge-save",
                  narratorTitle: "Watch the finals bubble flip live on one corrected score.",
                  narratorBody:
                    "This pitch path shows a clean save, a cut-line tiebreak swap, a Wi-Fi drop, and a resilient sync recovery.",
                  autoplay: false,
                  organizerCompleted: false,
                  judgePending: false,
                  persistentCompletion: false,
                  audioEnabled: nextValue,
                  competitionId: snapshot.competition.id,
                  competitionSlug: snapshot.competition.slug,
                })
              );
            }
          }}
        />

        {showPersistentCompletion ? (
          <Surface variant="card" className="overflow-hidden border-emerald-200 bg-emerald-50/70">
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div className="space-y-3">
                  <div className="results-kicker text-emerald-700">Guided story complete</div>
                <h2 className="text-3xl font-semibold text-slate-950 sm:text-4xl">
                  The event was built, judged live, and safely recovered from bad Wi‑Fi.
                </h2>
                <p className="max-w-3xl text-base leading-7 text-slate-600">
                  This ending stays visible for the presenter, even though the underlying demo event has already been reset behind the scenes and is ready for the next replay.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  "Organizer created the event structure",
                  "Judge station saved a live score",
                  "Leaderboard reacted instantly",
                  "Offline queue recovered cleanly",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[1.4rem] border border-emerald-200 bg-white/90 px-4 py-4 text-sm font-medium text-emerald-900 shadow-[0_16px_45px_-30px_rgba(16,185,129,0.5)]"
                  >
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                      ✓
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Surface>
        ) : null}

        <Surface variant="card" className="overflow-hidden">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-3">
              <div className="results-kicker">Experience as a judge</div>
              <h1 className="results-editorial-title text-4xl font-semibold text-slate-950 sm:text-5xl">
                Save one score. Watch the finals bubble flip live.
              </h1>
              <p className="max-w-3xl text-base leading-relaxed text-slate-600">
                You are judging {scenarioAthlete?.categoryLabel ?? "the featured qualifier field"}. Start with{" "}
                {scenarioAthlete?.name ?? "the highlighted athlete"} on Boulder 1. Then the right side shows the exact cut-line tiebreak swing that climbers, coaches, and spectators would see live.
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

        {playbackNarration ? (
          <Surface variant="row" className="border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(255,255,255,0.94))]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="results-kicker text-sky-700">
                  {toolkitState.scriptRunning ? "Autoplay walkthrough" : "Walkthrough summary"}
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  {playbackNarration.title}
                </h2>
                <p className="max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
                  {playbackNarration.body}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/90 px-4 py-2 text-sm font-semibold text-sky-800 shadow-[0_10px_24px_rgba(14,116,215,0.08)]">
                <span className="demo-live-dot" aria-hidden="true" />
                <span>{toolkitState.scriptRunning ? "Watch this step before the next one starts" : "Ready to replay"}</span>
              </div>
            </div>
          </Surface>
        ) : null}

        <div className="grid gap-6 2xl:[grid-template-columns:minmax(0,1.18fr)_minmax(34rem,0.82fr)]">
          <div className={`min-w-0 ${mobileTab === "leaderboard" ? "hidden 2xl:block" : ""}`}>
            <JudgeWorkspace
              snapshot={snapshot}
              embedded
              saving={saving}
              queuedCount={toolkitState.pendingQueueCount}
              queuedItems={queuedScorePreviews}
              message={message}
              error={error}
              syncStatus={statusLabel}
              syncState={toolkitState.lastSyncStatus}
              initialClimberId={scenarioAthlete?.id ?? snapshot.climbers[0]?.id ?? null}
              targetClimberId={scenarioAthlete?.id ?? null}
              targetClimberName={scenarioAthlete?.name ?? null}
              offlineMode={toolkitState.simulateOffline}
              interactionLocked={toolkitState.scriptRunning}
              pitchClimbLabels={[...DEMO_PITCH_CLIMBS]}
              presentationFocus={presentationFocus}
              onSaveQualifier={handleSaveQualifier}
            />
          </div>
          <div className={`min-w-0 ${mobileTab === "judge" ? "hidden 2xl:block" : ""}`}>
            <LeaderboardPanel
              snapshot={leaderboardSnapshot}
              embedded
              highlightedClimberId={highlightedClimberId}
              targetClimberId={scenarioAthlete?.id ?? null}
              impact={leaderboardImpact}
              lastUpdatedAt={lastUpdatedAt}
              toast={leaderboardToast}
              presentationFocus={presentationFocus}
            />
          </div>
        </div>
      </div>

      <DemoToolkit
        state={toolkitState}
        playbackStep={playbackStep}
        onRunDemo={() => void handleRunDemo()}
        onToggleOffline={handleToggleOffline}
        onSimulateOneScore={() => void handleSimulateOneScore()}
        onRunLiveBurst={() => void handleRunLiveBurst()}
        onSyncNow={() => void flushOfflineQueue()}
        onRestoreDemo={() => void handleRestoreDemo()}
      />
      {showConfetti ? (
        <div className="demo-confetti" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, index) => (
            <span
              key={`confetti-${index}`}
              className="demo-confetti-piece"
              style={{
                left: `${8 + index * 5}%`,
                animationDelay: `${index * 60}ms`,
              }}
            />
          ))}
        </div>
      ) : null}
      {demoCursor.visible ? (
        <div
          className={`demo-pointer ${demoCursor.clicking ? "demo-pointer-clicking" : ""}`}
          style={{
            left: demoCursor.x,
            top: demoCursor.y,
          }}
          aria-hidden="true"
        >
          <div className="demo-pointer-dot" />
          {demoCursor.label ? <div className="demo-pointer-label">{demoCursor.label}</div> : null}
        </div>
      ) : null}
      <InteractiveDemoTour
        pendingQueueCount={toolkitState.pendingQueueCount}
        climberName={scenarioAthlete?.name ?? "the demo athlete"}
        liveSaveCompleted={liveSaveCompleted}
        leaderboardObserved={leaderboardObserved}
        offlineMode={toolkitState.simulateOffline}
        offlineQueuedSaveCompleted={offlineQueuedSaveCompleted}
        syncRecovered={syncRecovered}
        syncStatus={toolkitState.lastSyncStatus}
        suppressed={toolkitState.scriptRunning || playbackStep !== null}
        onActiveStepChange={setActiveTourStep}
        onRestart={() => void handleRestoreDemo()}
      />
    </main>
  );
}
