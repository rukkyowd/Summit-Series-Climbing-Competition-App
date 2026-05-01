"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import DemoExperience from "@/components/demo-experience";
import { AthletePicker, type AthletePickerEntry, type AthletePickerStatusTone } from "@/components/judge/athlete-picker";
import { JudgeStatusStrip } from "@/components/judge/judge-status-strip";
import { OfflineQueuePanel } from "@/components/judge/offline-queue-panel";
import { QualifierScoreEditor } from "@/components/judge/qualifier-score-editor";
import { RecentScoreFeedback } from "@/components/judge/recent-score-feedback";
import SiteHeader from "@/components/site-header";
import StaffCompetitionSubnav from "@/components/staff-competition-subnav";
import { Button } from "@/components/ui/button";
import type { SaveStatusState } from "@/components/ui/save-status";
import { isDemoCompetitionRecord } from "@/lib/demo";
import {
  getClimberWithAttempts,
  getCompetitionSnapshot,
  updateFinalAttempt,
  updateQualifierAttemptByStaff,
  type CompetitionSnapshot,
} from "@/lib/db";
import { getAuthState, isStaffRole, type Profile } from "@/lib/auth";
import { normalizeFinalAttemptInput, normalizeQualifierAttemptInput } from "@/lib/attempts";
import {
  buildQueueMetadata,
  enqueueOfflineItem,
  markOfflineItemRetried,
  readOfflineQueue,
  removeOfflineItem,
  type OfflineQueueItem,
} from "@/lib/staff-offline-queue";
import {
  buildFinalsLeaderboard,
  buildQualifierLeaderboard,
  canStaffScoreFinals,
  canStaffScoreQualifier,
  competitionHasFinals,
  filterAttemptsForRound,
  formatCompetitionPhaseLabel,
  formatFinalPoints,
  getActiveFinalsRound,
  getActiveQualifierStyleRound,
  getClimbs,
  isFinalsStage,
  type ClimberWithAttempts,
  type FinalAttempt,
  type QualifierAttempt,
} from "@/lib/scoring";

type QualifierDraft = { attemptCount: number; topped: boolean; zone: boolean };
type FinalsDraft = { top: boolean; zone: boolean; attemptsToTop: number; attemptsToZone: number };
type QualifierDraftState = Record<string, QualifierDraft>;
type FinalsDraftState = Record<string, FinalsDraft>;
type QueuedScorePreview = {
  id: string;
  climberName: string;
  climbLabel: string;
  resultLabel: string;
  queuedAtLabel: string;
  retryCount: number;
};

const EMPTY_QUALIFIER_DRAFT: QualifierDraft = { attemptCount: 0, topped: false, zone: false };
const EMPTY_FINALS_DRAFT: FinalsDraft = { top: false, zone: false, attemptsToTop: 0, attemptsToZone: 0 };

async function saveDemoQualifierAttempt(
  competitionId: string,
  climberId: string,
  climbNumber: number,
  attemptCount: number,
  topped: boolean,
  options?: {
    zone?: boolean;
    attemptsToTop?: number | null;
    attemptsToZone?: number | null;
    clientEventId?: string;
    scoredAt?: string;
    judgeDeviceId?: string | null;
    judgeSessionId?: string | null;
    replayedFromOffline?: boolean;
  }
) {
  const response = await fetch("/api/demo/qualifier-attempt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      competitionId,
      climberId,
      climbNumber,
      attemptCount,
      topped,
      zone: options?.zone,
      attemptsToTop: options?.attemptsToTop,
      attemptsToZone: options?.attemptsToZone,
      clientEventId: options?.clientEventId,
      scoredAt: options?.scoredAt,
      judgeDeviceId: options?.judgeDeviceId,
      judgeSessionId: options?.judgeSessionId,
      replayedFromOffline: options?.replayedFromOffline,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
        attempt?: QualifierAttempt;
        status?: "accepted" | "projected" | "conflicted" | "ignored_as_stale";
        conflictReason?: string | null;
        clientEventId?: string | null;
        scoredAt?: string | null;
      }
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

function mergeFinalAttempt(attempts: FinalAttempt[], nextAttempt: FinalAttempt) {
  const remaining = attempts.filter(
    (attempt) =>
      !(
        attempt.round_id === nextAttempt.round_id &&
        attempt.climb_number === nextAttempt.climb_number
      )
  );

  return [...remaining, nextAttempt].sort((left, right) => left.climb_number - right.climb_number);
}

function getQualifierDraftFromAttempt(attempt?: { attempt_count: number; topped: boolean; zone?: boolean | null } | null): QualifierDraft {
  const normalized = normalizeQualifierAttemptInput({
    attemptCount: attempt?.attempt_count ?? 0,
    topped: Boolean(attempt?.topped),
    zone: Boolean(attempt?.zone ?? attempt?.topped),
    attemptsToTop: attempt?.attempt_count ?? 0,
    attemptsToZone: attempt?.attempt_count ?? 0,
  });

  return {
    attemptCount: normalized.attemptCount,
    topped: normalized.topped,
    zone: normalized.zone,
  };
}

function getFinalsDraftFromAttempt(attempt?: FinalAttempt | null): FinalsDraft {
  const normalized = normalizeFinalAttemptInput({
    top: Boolean(attempt?.top),
    zone: Boolean(attempt?.zone),
    attemptsToTop: attempt?.attempts_to_top ?? 0,
    attemptsToZone: attempt?.attempts_to_zone ?? 0,
  });

  return {
    top: normalized.top,
    zone: normalized.zone,
    attemptsToTop: normalized.attemptsToTop ?? 0,
    attemptsToZone: normalized.attemptsToZone ?? 0,
  };
}

function qualifierDraftMatchesSaved(draft: QualifierDraft, attempt?: { attempt_count: number; topped: boolean; zone?: boolean | null } | null) {
  const normalized = normalizeQualifierAttemptInput(draft);
  const saved = getQualifierDraftFromAttempt(attempt);
  return (
    normalized.attemptCount === saved.attemptCount &&
    normalized.topped === saved.topped &&
    normalized.zone === saved.zone
  );
}

function finalsDraftMatchesSaved(draft: FinalsDraft, attempt?: FinalAttempt | null) {
  const normalized = normalizeFinalAttemptInput(draft);
  const saved = getFinalsDraftFromAttempt(attempt);
  return (
    normalized.top === saved.top &&
    normalized.zone === saved.zone &&
    (normalized.attemptsToTop ?? 0) === saved.attemptsToTop &&
    (normalized.attemptsToZone ?? 0) === saved.attemptsToZone
  );
}

function shouldQueueFailedSave(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(message);
}

function normalizeJudgeSaveError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : String(error ?? "").trim();
  if (!message) {
    return fallback;
  }

  if (/unauthorized/i.test(message)) {
    return "This judge station needs a fresh authorized session before it can publish live again.";
  }

  if (/scoring is not open|closed|locked|phase/i.test(message)) {
    return "This round is locked or closed. Ask the organizer to reopen the scoring phase before saving.";
  }

  if (/climber not found|invalid climber/i.test(message)) {
    return "That athlete is no longer available for this round. Return to the athlete picker and choose the current climber.";
  }

  if (/only finalists|finalist/i.test(message)) {
    return "That athlete is not in the finals field. Pick a finalist from the finals grid before saving.";
  }

  if (/clienteventid|idempotent/i.test(message)) {
    return "This judge station could not create a unique save id. Refresh the judge page before trying again.";
  }

  return message;
}

function buildResultLabel(input: { topped?: boolean; zone?: boolean; top?: boolean; attemptCount?: number; attemptsToTop?: number | null; attemptsToZone?: number | null }) {
  if (input.top ?? input.topped) {
    const attemptNumber = input.attemptsToTop ?? input.attemptCount ?? 0;
    return attemptNumber === 1 ? "Flash top" : `Top on attempt ${attemptNumber}`;
  }
  if (input.zone) {
    const attemptNumber = input.attemptsToZone ?? input.attemptCount ?? 0;
    return `Zone on attempt ${attemptNumber}`;
  }
  return `Attempt ${input.attemptCount ?? 0} logged`;
}

function buildAthleteScoreLabel(
  climber: Pick<ClimberWithAttempts, "climber_number" | "name"> | null | undefined,
  climbNumber: number,
  resultLabel: string
) {
  const athleteLabel = climber ? `#${climber.climber_number} ${climber.name}` : "Selected athlete";
  return `${athleteLabel} - B${climbNumber} ${resultLabel}`;
}

function getQualifierPreviewLabel(
  climbNumber: number,
  normalized: ReturnType<typeof normalizeQualifierAttemptInput>
) {
  const resultLabel = buildResultLabel({
    topped: normalized.topped,
    zone: normalized.zone,
    attemptCount: normalized.attemptCount,
    attemptsToTop: normalized.attemptsToTop,
    attemptsToZone: normalized.attemptsToZone,
  });
  const implication = normalized.topped
    ? "Top is selected, so zone will save as ON."
    : normalized.zone
      ? "Zone is ON and top is OFF."
      : "Zone and top are both OFF.";

  return `Preview: B${climbNumber} ${resultLabel}. ${implication}`;
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

type ConfirmationTone = "pending" | "confirmed" | "dirty";

function formatQualifierSavedState(attempt?: { attempt_count: number; topped: boolean; zone?: boolean | null } | null) {
  if (!attempt) {
    return "No official entry yet";
  }

  const countLabel = `${attempt.attempt_count} ${attempt.attempt_count === 1 ? "attempt" : "attempts"}`;
  if (attempt.topped) {
    return `${countLabel}, zone + top`;
  }
  if (attempt.zone) {
    return `${countLabel}, zone`;
  }
  return `${countLabel}, no hold`;
}

function getQualifierPresentation(
  draft: QualifierDraft,
  attempt?: { attempt_count: number; topped: boolean; zone?: boolean | null } | null
): {
  normalized: ReturnType<typeof normalizeQualifierAttemptInput>;
  dirty: boolean;
  liveLabel: string;
  liveDetail: string;
  confirmationLabel: string;
  confirmationTone: ConfirmationTone;
  savedSummary: string;
} {
  const normalized = normalizeQualifierAttemptInput(draft);
  const dirty = !qualifierDraftMatchesSaved(draft, attempt);
  const hasSavedAttempt = Boolean(attempt);
  const hasSavedResult = Boolean(attempt?.topped || attempt?.zone);

  let liveLabel = "Waiting for first attempt";
  let liveDetail = "Count the first attempt, then mark zone or top once control is clear.";

  if (normalized.topped) {
    liveLabel = `Top called on attempt ${normalized.attemptsToTop ?? normalized.attemptCount}`;
    liveDetail = "Zone stays on automatically. This will save as the official result for this boulder.";
  } else if (normalized.zone) {
    liveLabel = `Zone called on attempt ${normalized.attemptsToZone ?? normalized.attemptCount}`;
    liveDetail = "Zone is marked. Add top later only if the climber finishes.";
  } else if (normalized.attemptCount > 0) {
    liveLabel = `Attempt ${normalized.attemptCount} - no hold called`;
    liveDetail = "No scoring hold is marked yet.";
  }

  return {
    normalized,
    dirty,
    liveLabel,
    liveDetail,
    confirmationLabel: dirty ? "Unsaved judge edits" : hasSavedAttempt ? (hasSavedResult ? "Score confirmed" : "Draft saved") : "No saved score yet",
    confirmationTone: dirty ? "dirty" : hasSavedResult ? "confirmed" : "pending",
    savedSummary: formatQualifierSavedState(attempt),
  };
}

function getFinalsPresentation(draft: FinalsDraft, attempt?: FinalAttempt | null): {
  normalized: ReturnType<typeof normalizeFinalAttemptInput>;
  dirty: boolean;
  resultLabel: string;
  pointsLabel: string;
  confirmationLabel: string;
  confirmationTone: ConfirmationTone;
} {
  const normalized = normalizeFinalAttemptInput(draft);
  const dirty = !finalsDraftMatchesSaved(draft, attempt);
  const hasSavedAttempt = Boolean(attempt?.top || attempt?.zone);
  const pointsValue = normalized.top
    ? 25 - Math.max(0, ((normalized.attemptsToTop ?? 1) || 1) - 1) * 0.1
    : normalized.zone
      ? 10 - Math.max(0, ((normalized.attemptsToZone ?? 1) || 1) - 1) * 0.1
      : 0;

  return {
    normalized,
    dirty,
    resultLabel: normalized.top
      ? `Top on ${normalized.attemptsToTop ?? 0}`
      : normalized.zone
        ? `Zone on ${normalized.attemptsToZone ?? 0}`
        : "Pending",
    pointsLabel: normalized.top || normalized.zone ? `${formatFinalPoints(pointsValue)} pts` : "Tap to score",
    confirmationLabel: dirty ? "Ready to confirm" : hasSavedAttempt ? "Confirmed" : "Awaiting first score",
    confirmationTone: dirty ? "dirty" : hasSavedAttempt ? "confirmed" : "pending",
  };
}

type FinalsEditorPanelProps = {
  current: FinalsDraft;
  dirty: boolean;
  confirmationLabel: string;
  confirmationTone: ConfirmationTone;
  finalsScoringOpen: boolean;
  finalsBlockedMessage: string;
  saving: boolean;
  onAdjustZoneAttempts: (delta: number) => void;
  onAdjustTopAttempts: (delta: number) => void;
  onClear: () => void;
  onSave: () => void;
  onToggleTop: () => void;
  onToggleZone: () => void;
};

function FinalsEditorPanel({
  current,
  dirty,
  confirmationLabel,
  confirmationTone,
  finalsScoringOpen,
  finalsBlockedMessage,
  saving,
  onAdjustZoneAttempts,
  onAdjustTopAttempts,
  onClear,
  onSave,
  onToggleTop,
  onToggleZone,
}: FinalsEditorPanelProps) {
  const pointsValue = current.top
    ? 25 - Math.max(0, current.attemptsToTop - 1) * 0.1
    : current.zone
      ? 10 - Math.max(0, current.attemptsToZone - 1) * 0.1
      : 0;

  return (
    <div className="mt-5 grid gap-3">
      <div className={`judge-confirmation-card judge-confirmation-card-${confirmationTone}`}>
        <div className="results-kicker">Cell status</div>
        <div className="mt-2 text-lg font-semibold text-slate-950">{confirmationLabel}</div>
        <div className="mt-1 text-sm text-slate-600">
          {dirty
            ? "This climber / boulder cell has judge edits that still need an official save."
            : "This cell reflects the current official finals record for the selected boulder."}
        </div>
      </div>
      {!finalsScoringOpen ? (
        <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {finalsBlockedMessage}
        </div>
      ) : null}
      <div className="route-judge-action-grid">
        <button
          type="button"
          onClick={onToggleZone}
          className={`route-judge-action route-judge-action-zone ${current.zone ? "route-judge-action-active" : ""}`}
        >
          <span className="route-judge-action-label">Zone</span>
          <span className="route-judge-action-detail">
            {current.zone ? `Marked on ${current.attemptsToZone || 1}` : "Record control"}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleTop}
          className={`route-judge-action route-judge-action-top ${current.top ? "route-judge-action-active" : ""}`}
        >
          <span className="route-judge-action-label">Top</span>
          <span className="route-judge-action-detail">
            {current.top ? `Marked on ${current.attemptsToTop || 1}` : "Record finish"}
          </span>
        </button>
      </div>
      <div className="route-judge-counter-grid">
        <div className="route-judge-counter-card">
          <div className="results-kicker">Attempts to zone</div>
          <div className="route-judge-counter-row">
            <button type="button" onClick={() => onAdjustZoneAttempts(-1)} className="route-judge-counter-button" aria-label="Decrease attempts to zone">
              -
            </button>
            <div className="route-judge-counter-value">{current.zone ? current.attemptsToZone : 0}</div>
            <button type="button" onClick={() => onAdjustZoneAttempts(1)} className="route-judge-counter-button" aria-label="Increase attempts to zone">
              +
            </button>
          </div>
        </div>
        <div className="route-judge-counter-card">
          <div className="results-kicker">Attempts to top</div>
          <div className="route-judge-counter-row">
            <button type="button" onClick={() => onAdjustTopAttempts(-1)} className="route-judge-counter-button" aria-label="Decrease attempts to top">
              -
            </button>
            <div className="route-judge-counter-value">{current.top ? current.attemptsToTop : 0}</div>
            <button type="button" onClick={() => onAdjustTopAttempts(1)} className="route-judge-counter-button" aria-label="Increase attempts to top">
              +
            </button>
          </div>
        </div>
      </div>
      <div className="judge-live-summary">
        <div>
          <div className="results-kicker">Live points</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{formatFinalPoints(pointsValue)}</div>
        </div>
        <div className="text-sm text-slate-600">
          Finals points update from the current scores in this editor. Save when the boulder card matches what you observed.
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Button type="button" onClick={onClear} variant="danger" size="touch" fullWidth>
          Clear
        </Button>
        <Button type="button" onClick={onSave} disabled={saving || !finalsScoringOpen} variant="primary" size="touch" fullWidth>
          {saving ? "Saving..." : "Confirm finals call"}
        </Button>
      </div>
    </div>
  );
}

export default function StaffJudgePage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const initialStage = searchParams?.get("stage") === "finals" ? "finals" : "qualifier";
  const initialClimberId = searchParams?.get("climberId") ?? "";
  const initialBoulder = Math.max(1, Number(searchParams?.get("boulder") ?? 1) || 1);
  const demoStoryMode = searchParams?.get("demoStory") === "act2";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stage, setStage] = useState<"qualifier" | "finals">(initialStage);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedQualifierClimberId, setSelectedQualifierClimberId] = useState(initialClimberId);
  const [selectedBoulder, setSelectedBoulder] = useState(initialBoulder);
  const [selectedCell, setSelectedCell] = useState<{ climberId: string; climbNumber: number } | null>(null);
  const [qualifierDrafts, setQualifierDrafts] = useState<QualifierDraftState>({});
  const [finalsDrafts, setFinalsDrafts] = useState<FinalsDraftState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [queuedCount, setQueuedCount] = useState(0);
  const [queuedItems, setQueuedItems] = useState<QueuedScorePreview[]>([]);
  const flushingQueueRef = useRef(false);
  const finalsGridViewportRef = useRef<HTMLDivElement | null>(null);
  const activeQualifierRoundId = snapshot?.activeQualifierRound?.id ?? getActiveQualifierStyleRound(snapshot?.competition ?? { rounds: [], schedule_blocks: [], current_phase: "qualifier_open" })?.id ?? null;
  const activeQualifierRoundName = snapshot?.activeQualifierRound?.name ?? getActiveQualifierStyleRound(snapshot?.competition ?? { rounds: [], schedule_blocks: [], current_phase: "qualifier_open" })?.name ?? "Qualifier";
  const activeFinalsRoundId = snapshot?.activeFinalsRound?.id ?? getActiveFinalsRound(snapshot?.competition ?? { rounds: [], schedule_blocks: [], current_phase: "qualifier_open" })?.id ?? null;
  const activeFinalsRoundName = snapshot?.activeFinalsRound?.name ?? getActiveFinalsRound(snapshot?.competition ?? { rounds: [], schedule_blocks: [], current_phase: "qualifier_open" })?.name ?? "Finals";
  const activeQualifierProblemCount = snapshot?.activeQualifierRound?.problem_count ?? snapshot?.competition.total_climbs ?? 0;
  const activeFinalsProblemCount = snapshot?.activeFinalsRound?.problem_count ?? snapshot?.competition.finals_problem_count ?? 0;

  const syncQueuedState = useCallback(async (nextSnapshot?: CompetitionSnapshot | null) => {
    const queue = await readOfflineQueue();
    const competitionId = nextSnapshot?.competition.id ?? snapshot?.competition.id ?? null;
    const relevantQueue = competitionId ? queue.filter((item) => item.competitionId === competitionId) : queue;
    const sourceSnapshot = nextSnapshot ?? snapshot;

    setQueuedCount(relevantQueue.length);
    setQueuedItems(
      relevantQueue.map((item) => {
        const climber = sourceSnapshot?.climbers.find((entry) => entry.id === item.climberId);
        return {
          id: item.id,
          climberName: climber?.name ?? "Queued climber",
          climbLabel: `Boulder ${String(item.climbNumber).padStart(2, "0")}`,
          resultLabel:
            item.type === "qualifier"
              ? buildResultLabel({
                  topped: item.topped,
                  zone: item.zone,
                  attemptCount: item.attemptCount,
                  attemptsToTop: item.attemptsToTop,
                  attemptsToZone: item.attemptsToZone,
                })
              : buildResultLabel({
                  top: item.top,
                  zone: item.zone,
                  attemptsToTop: item.attemptsToTop,
                  attemptsToZone: item.attemptsToZone,
                }),
          queuedAtLabel: formatQueuedAtLabel(item.scoredAt),
          retryCount: item.retryCount,
        };
      })
    );
  }, [snapshot]);

  const flushOfflineQueue = useCallback(async () => {
    if (flushingQueueRef.current) {
      return;
    }

    flushingQueueRef.current = true;
    const queue = await readOfflineQueue();
    try {
      let replayedCount = 0;
      let replayConflictLabel = "";
      for (const item of queue) {
        try {
          let resultStatus: "accepted" | "projected" | "conflicted" | "ignored_as_stale" | null = null;
          let resultLabel = "";
          const climber = snapshot?.climbers.find((entry) => entry.id === item.climberId);
          if (item.type === "qualifier") {
            resultLabel = buildAthleteScoreLabel(
              climber,
              item.climbNumber,
              buildResultLabel({
                topped: item.topped,
                zone: item.zone,
                attemptCount: item.attemptCount,
                attemptsToTop: item.attemptsToTop,
                attemptsToZone: item.attemptsToZone,
              })
            );
            if (snapshot?.competition.id === item.competitionId && isDemoCompetitionRecord(snapshot.competition)) {
              const result = await saveDemoQualifierAttempt(item.competitionId, item.climberId, item.climbNumber, item.attemptCount, item.topped, {
                zone: item.zone,
                attemptsToTop: item.attemptsToTop,
                attemptsToZone: item.attemptsToZone,
                clientEventId: item.clientEventId,
                scoredAt: item.scoredAt,
                judgeDeviceId: item.judgeDeviceId,
                judgeSessionId: item.judgeSessionId,
                replayedFromOffline: true,
              });
              resultStatus = result.status;
            } else {
              const result = await updateQualifierAttemptByStaff(item.competitionId, item.climberId, item.climbNumber, item.attemptCount, item.topped, {
                zone: item.zone,
                attemptsToTop: item.attemptsToTop,
                attemptsToZone: item.attemptsToZone,
                clientEventId: item.clientEventId,
                scoredAt: item.scoredAt,
                judgeDeviceId: item.judgeDeviceId,
                judgeSessionId: item.judgeSessionId,
                replayedFromOffline: true,
              });
              resultStatus = result.status;
            }
          } else {
            resultLabel = buildAthleteScoreLabel(
              climber,
              item.climbNumber,
              buildResultLabel({
                top: item.top,
                zone: item.zone,
                attemptsToTop: item.attemptsToTop,
                attemptsToZone: item.attemptsToZone,
              })
            );
            const result = await updateFinalAttempt(item.competitionId, item.climberId, item.climbNumber, item.top, item.zone, item.attemptsToTop, item.attemptsToZone, {
              clientEventId: item.clientEventId,
              scoredAt: item.scoredAt,
              judgeDeviceId: item.judgeDeviceId,
              judgeSessionId: item.judgeSessionId,
              replayedFromOffline: true,
            });
            resultStatus = result.status;
          }
          await removeOfflineItem(item.id);
          replayedCount += 1;
          if (resultStatus === "conflicted" || resultStatus === "ignored_as_stale") {
            replayConflictLabel = resultLabel;
          }
        } catch {
          await markOfflineItemRetried(item.id);
          break;
        }
      }

      await syncQueuedState(snapshot);
      if (snapshot) {
        const refreshed = await getCompetitionSnapshot(snapshot.competition.id);
        setSnapshot(refreshed);
        await syncQueuedState(refreshed);
      }
      if (replayConflictLabel) {
        setMessage(`Replay conflict: ${replayConflictLabel}. A newer live score stayed in place.`);
      } else if (replayedCount > 0) {
        setMessage(`Replayed: ${replayedCount} offline ${replayedCount === 1 ? "score" : "scores"} published live.`);
      }
    } finally {
      flushingQueueRef.current = false;
    }
  }, [snapshot, syncQueuedState]);

  useEffect(() => {
    setLoading(true);
    void Promise.all([getCompetitionSnapshot(slug), getAuthState()])
      .then(([nextSnapshot, authState]) => {
        const allowPublicDemoJudge = isDemoCompetitionRecord(nextSnapshot.competition);
        if (!isStaffRole(authState.profile?.role) && !allowPublicDemoJudge) {
          window.location.href = `/staff/login?redirect=${encodeURIComponent(`/staff/c/${slug}/judge`)}`;
          return;
        }

        setProfile(
          isStaffRole(authState.profile?.role)
            ? authState.profile
            : {
                id: "demo-judge",
                role: "judge",
                display_name: "Demo judge",
              }
        );
        setSnapshot(nextSnapshot);
        const qualifierNext: QualifierDraftState = {};
        const finalsNext: FinalsDraftState = {};
        nextSnapshot.climbers.forEach((climber) => {
          filterAttemptsForRound(climber.qualifier_attempts, nextSnapshot.activeQualifierRound?.id).forEach((attempt) => {
            qualifierNext[`${climber.id}:${attempt.climb_number}`] = getQualifierDraftFromAttempt(attempt);
          });
          filterAttemptsForRound(climber.final_attempts, nextSnapshot.activeFinalsRound?.id).forEach((attempt) => {
            finalsNext[`${climber.id}:${attempt.climb_number}`] = getFinalsDraftFromAttempt(attempt);
          });
        });
        setQualifierDrafts(qualifierNext);
        setFinalsDrafts(finalsNext);
        if (initialClimberId) {
          setSelectedQualifierClimberId(initialClimberId);
          setSelectedCell({ climberId: initialClimberId, climbNumber: initialBoulder });
        } else {
          setSelectedQualifierClimberId(nextSnapshot.climbers[0]?.id ?? "");
        }
        setError("");
        void syncQueuedState(nextSnapshot);
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Unable to load the judge panel.");
      })
      .finally(() => setLoading(false));
  }, [initialBoulder, initialClimberId, slug, syncQueuedState]);

  useEffect(() => {
    void syncQueuedState();
    void (async () => {
      const queue = await readOfflineQueue();
      if (typeof navigator !== "undefined" && navigator.onLine && queue.length > 0) {
        await flushOfflineQueue();
      }
    })();
    const onOnline = () => {
      void syncQueuedState();
      void flushOfflineQueue();
    };
    const retryTimer = window.setInterval(async () => {
      const queue = await readOfflineQueue();
      if (typeof navigator !== "undefined" && navigator.onLine && queue.length > 0) {
        await flushOfflineQueue();
      }
    }, 15000);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(retryTimer);
    };
  }, [flushOfflineQueue, syncQueuedState]);

  const qualifierClimbers = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const normalized = deferredQuery.trim().toLowerCase();
    return snapshot.climbers.filter((climber) => {
      if (!normalized) {
        return true;
      }
      return (
        climber.name.toLowerCase().includes(normalized) ||
        climber.climber_number.toLowerCase().includes(normalized) ||
        climber.display_category.toLowerCase().includes(normalized)
      );
    });
  }, [deferredQuery, snapshot]);

  useEffect(() => {
    if (stage !== "qualifier" || !qualifierClimbers.length) {
      return;
    }

    if (!selectedQualifierClimberId || !qualifierClimbers.some((climber) => climber.id === selectedQualifierClimberId)) {
      setSelectedQualifierClimberId(qualifierClimbers[0].id);
    }
  }, [qualifierClimbers, selectedQualifierClimberId, stage]);

  const selectedQualifierClimber = useMemo(
    () =>
      snapshot?.climbers.find((climber) => climber.id === selectedQualifierClimberId) ??
      qualifierClimbers[0] ??
      null,
    [qualifierClimbers, selectedQualifierClimberId, snapshot]
  );

  const selectedQualifierAttempt = useMemo(
    () =>
      selectedQualifierClimber
        ? filterAttemptsForRound(selectedQualifierClimber.qualifier_attempts, activeQualifierRoundId).find((attempt) => attempt.climb_number === selectedBoulder) ?? null
        : null,
    [activeQualifierRoundId, selectedBoulder, selectedQualifierClimber]
  );

  const selectedQualifierDraftKey = selectedQualifierClimber ? `${selectedQualifierClimber.id}:${selectedBoulder}` : "";
  const selectedQualifierDraft = selectedQualifierClimber
    ? qualifierDrafts[selectedQualifierDraftKey] ?? getQualifierDraftFromAttempt(selectedQualifierAttempt)
    : EMPTY_QUALIFIER_DRAFT;
  const selectedQualifierPresentation = getQualifierPresentation(selectedQualifierDraft, selectedQualifierAttempt);
  const selectedQualifierPreview = getQualifierPreviewLabel(
    selectedBoulder,
    selectedQualifierPresentation.normalized
  );

  const finalists = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const finalistIds = new Set(snapshot.finalists.map((entry) => entry.climber_id));
    return snapshot.climbers
      .filter((climber) => finalistIds.has(climber.id))
      .sort((left, right) => {
        const leftOrder = snapshot.finalists.find((entry) => entry.climber_id === left.id)?.climbing_order ?? 0;
        const rightOrder = snapshot.finalists.find((entry) => entry.climber_id === right.id)?.climbing_order ?? 0;
        return leftOrder - rightOrder;
      });
  }, [snapshot]);

  const selectedFinalist = useMemo(
    () => finalists.find((entry) => entry.id === selectedCell?.climberId) ?? null,
    [finalists, selectedCell?.climberId]
  );
  const qualifierScoringOpen = snapshot ? canStaffScoreQualifier(snapshot.competition) : false;
  const finalsScoringOpen = snapshot ? canStaffScoreFinals(snapshot.competition) : false;
  const finalsEnabled = snapshot ? competitionHasFinals(snapshot.competition) : false;
  const finalsWorkspaceVisible = snapshot ? finalsEnabled && isFinalsStage(snapshot.competition) : false;
  const finalsReady = finalists.length > 0;
  const finalsProjected = Boolean(snapshot && !snapshot.finalistsPersisted && finalists.length > 0);
  const qualifierSavedCount = useMemo(
    () =>
      snapshot
        ? snapshot.climbers.filter((climber) =>
            filterAttemptsForRound(climber.qualifier_attempts, activeQualifierRoundId).some((attempt) => attempt.climb_number === selectedBoulder)
          ).length
        : 0,
    [activeQualifierRoundId, selectedBoulder, snapshot]
  );
  const qualifierAthleteEntries = useMemo<AthletePickerEntry[]>(
    () =>
      qualifierClimbers.map((climber) => {
        const key = `${climber.id}:${selectedBoulder}`;
        const existingAttempt = filterAttemptsForRound(climber.qualifier_attempts, activeQualifierRoundId).find((attempt) => attempt.climb_number === selectedBoulder);
        const draft = qualifierDrafts[key] ?? getQualifierDraftFromAttempt(existingAttempt);
        const presentation = getQualifierPresentation(draft, existingAttempt);
        const statusTone: AthletePickerStatusTone = presentation.dirty
          ? "dirty"
          : presentation.normalized.topped
            ? "top"
            : presentation.normalized.zone
              ? "zone"
              : existingAttempt
                ? "saved"
                : "pending";
        const statusLabel = presentation.dirty
          ? "Unsaved"
          : presentation.normalized.topped
            ? "Top"
            : presentation.normalized.zone
              ? "Zone"
              : existingAttempt
                ? "Saved"
                : "Open";

        return {
          id: climber.id,
          climberNumber: climber.climber_number,
          name: climber.name,
          category: climber.display_category,
          statusLabel,
          resultLabel: presentation.dirty ? getQualifierPreviewLabel(selectedBoulder, presentation.normalized) : presentation.savedSummary,
          statusTone,
        };
      }),
    [activeQualifierRoundId, qualifierClimbers, qualifierDrafts, selectedBoulder]
  );
  const finalsScoredCellCount = useMemo(
    () =>
      finalists.reduce(
        (count, climber) =>
          count +
          getClimbs(activeFinalsProblemCount).filter((climb) => {
            const attempt = filterAttemptsForRound(climber.final_attempts, activeFinalsRoundId).find((entry) => entry.climb_number === climb.number);
            return Boolean(attempt?.top || attempt?.zone);
          }).length,
        0
      ),
    [activeFinalsProblemCount, activeFinalsRoundId, finalists]
  );
  const finalsTotalCellCount = finalists.length * activeFinalsProblemCount;
  const finalsProblemCount = activeFinalsProblemCount;
  const finalsGridTemplateColumns = `minmax(9rem, 1.15fr) repeat(${Math.max(finalsProblemCount, 1)}, minmax(6.75rem, 1fr))`;
  const finalsGridMinWidth = `${Math.max(640, 176 + finalsProblemCount * 124)}px`;
  const syncStatusLabel = saving
    ? "Saving live..."
    : queuedCount > 0
      ? `Saved on this device (${queuedCount})`
      : "Saved live";
  const syncHelperCopy = queuedCount > 0
    ? "Queued scores are preserved on this judge station and will publish automatically when saving is available again."
    : "Every save is publishing live to the leaderboard and public event surfaces.";
  const finalsBlockedMessage = !snapshot
    ? ""
    : !finalists.length
      ? "No finalists are available yet. Finish qualifier results or advance the competition to finals to generate the finals field."
      : !finalsScoringOpen
        ? `Finals scoring is closed during the ${formatCompetitionPhaseLabel(snapshot.competition.current_phase).toLowerCase()} phase.`
        : "";
  const saveFeedbackState: SaveStatusState = error
    ? "error"
    : saving
      ? "saving"
      : selectedQualifierPresentation.dirty && stage === "qualifier"
        ? "dirty"
        : /newer|conflict|another judge/i.test(message)
          ? "conflict"
          : /queued|saved on this device/i.test(message)
            ? "queued"
            : /replayed/i.test(message)
              ? "replayed"
              : message
                ? "saved"
                : queuedCount > 0
                  ? "queued"
                  : "idle";
  const saveFeedbackTitle = error
    ? "Needs attention"
    : saving
      ? "Saving live score..."
      : saveFeedbackState === "dirty"
        ? "Unsaved score edits"
        : saveFeedbackState === "queued"
          ? "Offline score queued"
          : saveFeedbackState === "conflict"
            ? "Score conflict visible"
            : saveFeedbackState === "replayed"
              ? "Offline score replayed"
              : message
                ? "Recent score"
                : "Ready to score";
  const saveFeedbackDetail = error
    ? error
    : message ||
      (stage === "qualifier" && selectedQualifierClimber
        ? selectedQualifierPreview
        : queuedCount > 0
          ? "Scores saved on this device will retry automatically."
          : "Pick an athlete and boulder, then save when the card matches what you observed.");
  const selectedFinalAttempt = useMemo(
    () =>
      selectedFinalist && selectedCell
        ? filterAttemptsForRound(selectedFinalist.final_attempts, activeFinalsRoundId).find((entry) => entry.climb_number === selectedCell.climbNumber) ?? null
        : null,
    [activeFinalsRoundId, selectedCell, selectedFinalist]
  );
  const selectedFinalDraftKey = selectedCell ? `${selectedCell.climberId}:${selectedCell.climbNumber}` : "";
  const selectedFinalDraft = useMemo(
    () =>
      selectedCell
        ? finalsDrafts[selectedFinalDraftKey] ?? getFinalsDraftFromAttempt(selectedFinalAttempt)
        : null,
    [finalsDrafts, selectedCell, selectedFinalAttempt, selectedFinalDraftKey]
  );
  const selectedFinalPresentation = useMemo(
    () => (selectedFinalDraft ? getFinalsPresentation(selectedFinalDraft, selectedFinalAttempt) : null),
    [selectedFinalAttempt, selectedFinalDraft]
  );

  useEffect(() => {
    if (!finalsWorkspaceVisible && stage === "finals") {
      setStage("qualifier");
    }
  }, [finalsWorkspaceVisible, stage]);

  useEffect(() => {
    if (stage !== "finals" || !finalsReady) {
      return;
    }

    if (!selectedCell) {
      return;
    }

    const firstCell = { climberId: finalists[0]?.id ?? "", climbNumber: 1 };
    if (!firstCell.climberId) {
      return;
    }

    const selectedStillValid =
      finalists.some((climber) => climber.id === selectedCell.climberId) &&
      selectedCell.climbNumber <= activeFinalsProblemCount;

    if (!selectedStillValid) {
      setSelectedCell(firstCell);
    }
  }, [activeFinalsProblemCount, finalists, finalsReady, selectedCell, stage]);

  useEffect(() => {
    if (stage !== "finals" || !selectedCell) {
      return;
    }

    const target = document.getElementById(`finals-cell-${selectedCell.climberId}-${selectedCell.climbNumber}`);
    if (!target) {
      return;
    }

    target.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedCell, stage]);

  useEffect(() => {
    if (selectedBoulder > activeQualifierProblemCount && activeQualifierProblemCount > 0) {
      setSelectedBoulder(1);
    }
  }, [activeQualifierProblemCount, selectedBoulder]);

  const updateClimberInSnapshot = async (
    climberId: string,
    updater: (nextClimbers: ClimberWithAttempts[]) => CompetitionSnapshot,
    fallbackUpdater?: (climber: ClimberWithAttempts) => ClimberWithAttempts
  ) => {
    if (!snapshot) {
      return;
    }

    const refreshed = await getClimberWithAttempts(snapshot.competition.id, climberId);
    const nextClimbers = snapshot.climbers.map((entry) => {
      if (entry.id !== climberId) {
        return entry;
      }

      if (refreshed) {
        return fallbackUpdater ? fallbackUpdater(refreshed) : refreshed;
      }

      return fallbackUpdater ? fallbackUpdater(entry) : entry;
    });

    setSnapshot(updater(nextClimbers));
  };

  const setQualifierDraft = useCallback((key: string, updater: (draft: QualifierDraft) => QualifierDraft) => {
    setQualifierDrafts((current) => {
      const nextDraft = updater(current[key] ?? EMPTY_QUALIFIER_DRAFT);
      return {
        ...current,
        [key]: nextDraft,
      };
    });
  }, []);

  const setFinalsDraft = useCallback((key: string, updater: (draft: FinalsDraft) => FinalsDraft) => {
    setFinalsDrafts((current) => {
      const nextDraft = updater(current[key] ?? EMPTY_FINALS_DRAFT);
      return {
        ...current,
        [key]: nextDraft,
      };
    });
  }, []);

  const saveQualifier = async (climberId: string) => {
    if (!snapshot || !canStaffScoreQualifier(snapshot.competition)) {
      return;
    }

    const key = `${climberId}:${selectedBoulder}`;
    const draft = qualifierDrafts[key] ?? EMPTY_QUALIFIER_DRAFT;
    const normalized = normalizeQualifierAttemptInput(draft);
    setQualifierDrafts((current) => ({
      ...current,
      [key]: { attemptCount: normalized.attemptCount, topped: normalized.topped, zone: normalized.zone },
    }));
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const metadata = await buildQueueMetadata();
      const savedAttempt = isDemoCompetitionRecord(snapshot.competition)
        ? await saveDemoQualifierAttempt(
            snapshot.competition.id,
            climberId,
            selectedBoulder,
            normalized.attemptCount,
            normalized.topped,
            {
              zone: normalized.zone,
              attemptsToTop: normalized.attemptsToTop,
              attemptsToZone: normalized.attemptsToZone,
              clientEventId: metadata.clientEventId,
              scoredAt: metadata.scoredAt,
              judgeDeviceId: metadata.judgeDeviceId,
              judgeSessionId: metadata.judgeSessionId,
            }
          )
        : await updateQualifierAttemptByStaff(
            snapshot.competition.id,
            climberId,
            selectedBoulder,
            normalized.attemptCount,
            normalized.topped,
            {
              zone: normalized.zone,
              attemptsToTop: normalized.attemptsToTop,
              attemptsToZone: normalized.attemptsToZone,
              clientEventId: metadata.clientEventId,
              scoredAt: metadata.scoredAt,
              judgeDeviceId: metadata.judgeDeviceId,
              judgeSessionId: metadata.judgeSessionId,
            }
          );
      await updateClimberInSnapshot(
        climberId,
        (nextClimbers) => ({
          ...snapshot,
          climbers: nextClimbers,
          qualifierLeaderboard: buildQualifierLeaderboard(nextClimbers, snapshot.competition, snapshot.activeQualifierRound ?? null),
        }),
        (climber) => ({
          ...climber,
          qualifier_attempts: mergeQualifierAttempt(climber.qualifier_attempts, savedAttempt.attempt),
        })
      );
      const climber = snapshot.climbers.find((entry) => entry.id === climberId);
      const savedLabel = buildAthleteScoreLabel(
        climber,
        selectedBoulder,
        buildResultLabel({
          topped: normalized.topped,
          zone: normalized.zone,
          attemptCount: normalized.attemptCount,
          attemptsToTop: normalized.attemptsToTop,
          attemptsToZone: normalized.attemptsToZone,
        })
      );
      setMessage(
        savedAttempt.status === "ignored_as_stale"
          ? `Conflict: ${savedLabel}. A newer score already exists, so this queued score did not replace the current result.`
          : savedAttempt.status === "conflicted"
            ? `Conflict: ${savedLabel}. Another judge had already scored this cell; the latest timed event is now live.`
            : `Saved: ${savedLabel}.`
      );
      await syncQueuedState();
    } catch (nextError) {
      if (shouldQueueFailedSave(nextError)) {
        const metadata = await buildQueueMetadata();
        await enqueueOfflineItem({
          id: `qualifier-${climberId}-${selectedBoulder}`,
          type: "qualifier",
          competitionId: snapshot.competition.id,
          climberId,
          climbNumber: selectedBoulder,
          attemptCount: normalized.attemptCount,
          topped: normalized.topped,
          zone: normalized.zone,
          attemptsToTop: normalized.attemptsToTop,
          attemptsToZone: normalized.attemptsToZone,
          clientEventId: metadata.clientEventId,
          scoredAt: metadata.scoredAt,
          judgeDeviceId: metadata.judgeDeviceId,
          judgeSessionId: metadata.judgeSessionId,
          createdAt: new Date().toISOString(),
          retryCount: 0,
          lastTriedAt: null,
        });
        await syncQueuedState();
        const climber = snapshot.climbers.find((entry) => entry.id === climberId);
        const queuedLabel = buildAthleteScoreLabel(
          climber,
          selectedBoulder,
          buildResultLabel({
            topped: normalized.topped,
            zone: normalized.zone,
            attemptCount: normalized.attemptCount,
            attemptsToTop: normalized.attemptsToTop,
            attemptsToZone: normalized.attemptsToZone,
          })
        );
        setMessage(
          nextError instanceof Error
            ? `Offline queued: ${queuedLabel}. ${normalizeJudgeSaveError(nextError, "Unable to save live right now.")} It will retry automatically.`
            : `Offline queued: ${queuedLabel}. It will retry automatically.`
        );
      } else {
        setError(normalizeJudgeSaveError(nextError, "Unable to save qualifier score."));
      }
    } finally {
      setSaving(false);
    }
  };

  const saveFinals = async () => {
    if (!snapshot || !selectedCell || !canStaffScoreFinals(snapshot.competition)) {
      return;
    }

    const key = `${selectedCell.climberId}:${selectedCell.climbNumber}`;
    const draft = finalsDrafts[key] ?? EMPTY_FINALS_DRAFT;
    const normalized = normalizeFinalAttemptInput(draft);
    setFinalsDrafts((state) => ({
      ...state,
      [key]: {
        top: normalized.top,
        zone: normalized.zone,
        attemptsToTop: normalized.attemptsToTop ?? 0,
        attemptsToZone: normalized.attemptsToZone ?? 0,
      },
    }));
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const metadata = await buildQueueMetadata();
      const savedAttempt = await updateFinalAttempt(
        snapshot.competition.id,
        selectedCell.climberId,
        selectedCell.climbNumber,
        normalized.top,
        normalized.zone,
        normalized.attemptsToTop,
        normalized.attemptsToZone,
        {
          clientEventId: metadata.clientEventId,
          scoredAt: metadata.scoredAt,
          judgeDeviceId: metadata.judgeDeviceId,
          judgeSessionId: metadata.judgeSessionId,
        }
      );
      await updateClimberInSnapshot(
        selectedCell.climberId,
        (nextClimbers) => ({
          ...snapshot,
          climbers: nextClimbers,
          finalsLeaderboard: buildFinalsLeaderboard(
            nextClimbers,
            snapshot.finalists,
            snapshot.competition,
            snapshot.activeFinalsRound ?? null
          ),
        }),
        (climber) => ({
          ...climber,
          final_attempts: mergeFinalAttempt(climber.final_attempts, savedAttempt.attempt),
        })
      );
      const climber = snapshot.climbers.find((entry) => entry.id === selectedCell.climberId);
      const savedLabel = buildAthleteScoreLabel(
        climber,
        selectedCell.climbNumber,
        buildResultLabel({
          top: normalized.top,
          zone: normalized.zone,
          attemptsToTop: normalized.attemptsToTop,
          attemptsToZone: normalized.attemptsToZone,
        })
      );
      setMessage(
        savedAttempt.status === "ignored_as_stale"
          ? `Conflict: ${savedLabel}. A newer finals score already exists, so this queued score did not replace the current result.`
          : savedAttempt.status === "conflicted"
            ? `Conflict: ${savedLabel}. Another judge also updated this cell; the latest timed event is now live.`
            : `Saved: ${savedLabel}.`
      );
      await syncQueuedState();
    } catch (nextError) {
      if (shouldQueueFailedSave(nextError)) {
        const metadata = await buildQueueMetadata();
        await enqueueOfflineItem({
          id: `finals-${selectedCell.climberId}-${selectedCell.climbNumber}`,
          type: "finals",
          competitionId: snapshot.competition.id,
          climberId: selectedCell.climberId,
          climbNumber: selectedCell.climbNumber,
          top: normalized.top,
          zone: normalized.zone,
          attemptsToTop: normalized.attemptsToTop,
          attemptsToZone: normalized.attemptsToZone,
          clientEventId: metadata.clientEventId,
          scoredAt: metadata.scoredAt,
          judgeDeviceId: metadata.judgeDeviceId,
          judgeSessionId: metadata.judgeSessionId,
          createdAt: new Date().toISOString(),
          retryCount: 0,
          lastTriedAt: null,
        });
        await syncQueuedState();
        const climber = snapshot.climbers.find((entry) => entry.id === selectedCell.climberId);
        const queuedLabel = buildAthleteScoreLabel(
          climber,
          selectedCell.climbNumber,
          buildResultLabel({
            top: normalized.top,
            zone: normalized.zone,
            attemptsToTop: normalized.attemptsToTop,
            attemptsToZone: normalized.attemptsToZone,
          })
        );
        setMessage(
          nextError instanceof Error
            ? `Offline queued: ${queuedLabel}. ${normalizeJudgeSaveError(nextError, "Unable to save live right now.")} It will retry automatically.`
            : `Offline queued: ${queuedLabel}. It will retry automatically.`
        );
      } else {
        setError(normalizeJudgeSaveError(nextError, "Unable to save finals score."));
      }
    } finally {
      setSaving(false);
    }
  };

  const clearFinalsCell = () => {
    if (!selectedCell) {
      return;
    }

    const key = `${selectedCell.climberId}:${selectedCell.climbNumber}`;
    setFinalsDraft(key, () => EMPTY_FINALS_DRAFT);
  };

  const highlightDemoTarget = () => {
    setStage("qualifier");
    setSelectedBoulder(initialBoulder);
    if (initialClimberId) {
      setSelectedQualifierClimberId(initialClimberId);
      setSelectedCell({ climberId: initialClimberId, climbNumber: initialBoulder });
    }
    document.querySelector('[data-demo-anchor="judge-entry-cards"]')?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  if (loading) {
    return (
      <main className="results-page">
        <div className="content-frame">
          <section className="results-card text-slate-600">Loading judge panel...</section>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="results-page">
        <div className="content-frame">
          <section className="results-card text-slate-600">{error || "Unable to load the judge panel."}</section>
        </div>
      </main>
    );
  }

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader
          light
          status={<div className="results-chip">Judge panel</div>}
        />
        <StaffCompetitionSubnav competitionSlug={slug} />

        <RecentScoreFeedback
          state={saveFeedbackState}
          title={saveFeedbackTitle}
          detail={saveFeedbackDetail}
          contextLabel={stage === "finals" ? "Finals save feedback" : "Qualifier save feedback"}
        />
        {isDemoCompetitionRecord(snapshot.competition) && demoStoryMode ? (
          <section className="results-alert border border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(255,255,255,0.92))] text-slate-800">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="results-kicker text-sky-700">Act 2 - Judge the key climb</div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Find Athlete C, select B{initialBoulder}, change Top from attempt 3 to attempt 1, then save.
                </h2>
                <p className="max-w-4xl text-sm leading-relaxed text-slate-600">
                  This guide will not click or save for you. Use the athlete picker, the boulder selector,
                  the Top control, and the attempt controls yourself. After saving, return to the demo guide
                  and press “I completed this” so it can verify the database state.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={highlightDemoTarget}>
                Highlight target
              </Button>
            </div>
          </section>
        ) : null}
        {isDemoCompetitionRecord(snapshot.competition) && !demoStoryMode ? (
          <DemoExperience
            enabled
            routeId="judge"
            competitionSlug={snapshot.competition.slug}
            bannerTitle="Judge station demo"
            bannerDescription="This is the live scoring surface a judge would use on a phone or tablet. Every save here updates the official qualifier result for that climber and boulder."
            bannerTip="Record one boulder score, then switch to the live leaderboard to show the live standings response."
          />
        ) : null}

        <section className="results-card space-y-4" data-demo-anchor="judge-hero">
          <div className="results-workspace-hero">
            <div>
              <div className="results-kicker">Staff scoring</div>
              <h1 className="results-editorial-title mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">
                {snapshot.competition.name}
              </h1>
              <div className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                Current phase: {formatCompetitionPhaseLabel(snapshot.competition.current_phase)}.{" "}
                {finalsWorkspaceVisible
                  ? "Move between qualifier and finals modes without leaving the scoring workspace."
                  : "Finals mode appears here once the competition reaches observation."}
              </div>
            </div>
          </div>
          <JudgeStatusStrip
            profileLabel={profile?.display_name || profile?.role || "staff"}
            saving={saving}
            queuedCount={queuedCount}
            syncStatusLabel={syncStatusLabel}
            syncHelperCopy={syncHelperCopy}
            qualifierScoringOpen={qualifierScoringOpen}
            finalsScoringOpen={finalsScoringOpen}
            liveRoundName={stage === "finals" ? activeFinalsRoundName : activeQualifierRoundName}
            liveRoundModeLabel={stage === "finals" ? "Grid scoring workspace" : "Boulder-by-boulder entry"}
            climberCount={snapshot.climbers.length}
            qualifierProblemCount={activeQualifierProblemCount}
          />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-sm text-slate-600">
              Judges and admins can score the active qualifier-style round and the active finals round from this page. Use qualifier mode for qualifier or semifinal entry, and finals mode for the full finals grid.
            </div>
            <div className="grid gap-3 sm:grid-cols-2" data-demo-anchor="judge-mode-toggle">
              <button
                type="button"
                onClick={() => setStage("qualifier")}
                className={`results-stage-toggle ${stage === "qualifier" ? "results-stage-toggle-active" : ""}`}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{activeQualifierRoundName}</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">Boulder-by-boulder entry</div>
                <div className="mt-1 text-sm text-slate-600">
                  {qualifierScoringOpen ? "Open for staff scoring now." : "Locked until qualifier live."}
                </div>
              </button>
              {finalsWorkspaceVisible ? (
              <button
                type="button"
                onClick={() => setStage("finals")}
                className={`results-stage-toggle ${stage === "finals" ? "results-stage-toggle-active" : ""}`}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{activeFinalsRoundName}</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">Grid scoring for finalists</div>
                <div className="mt-1 text-sm text-slate-600">
                  {finalsScoringOpen ? "Open for finals scoring now." : finalsReady ? "Field loaded, waiting for finals live." : "Waiting for a finals field."}
                </div>
              </button>
              ) : null}
            </div>
          </div>
          <OfflineQueuePanel queuedCount={queuedCount} queuedItems={queuedItems} />
        </section>

        {stage === "qualifier" ? (
          <section className="results-card">
            <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
              <AthletePicker
                activeRoundName={activeQualifierRoundName}
                athletes={qualifierAthleteEntries}
                problemCount={activeQualifierProblemCount}
                query={query}
                savedCount={qualifierSavedCount}
                selectedAthleteId={selectedQualifierClimber?.id ?? null}
                selectedBoulder={selectedBoulder}
                totalCount={snapshot.climbers.length}
                onQueryChange={setQuery}
                onSelectAthlete={setSelectedQualifierClimberId}
                onSelectBoulder={setSelectedBoulder}
              />
              <QualifierScoreEditor
                athlete={
                  selectedQualifierClimber
                    ? {
                        climberNumber: selectedQualifierClimber.climber_number,
                        name: selectedQualifierClimber.name,
                        category: selectedQualifierClimber.display_category,
                      }
                    : null
                }
                attemptCount={selectedQualifierPresentation.normalized.attemptCount}
                blockedMessage={`${activeQualifierRoundName} scoring is currently locked. Ask the organizer to reopen the live qualifier phase before saving.`}
                boulderNumber={selectedBoulder}
                confirmationLabel={selectedQualifierPresentation.confirmationLabel}
                confirmationTone={selectedQualifierPresentation.confirmationTone}
                dirty={selectedQualifierPresentation.dirty}
                liveDetail={selectedQualifierPresentation.liveDetail}
                liveLabel={selectedQualifierPresentation.liveLabel}
                normalizedPreview={selectedQualifierPreview}
                roundName={activeQualifierRoundName}
                savedSummary={selectedQualifierPresentation.savedSummary}
                saveState={saving ? "saving" : selectedQualifierPresentation.dirty ? "dirty" : queuedCount > 0 ? "queued" : "saved"}
                saving={saving}
                scoringOpen={qualifierScoringOpen}
                topped={selectedQualifierPresentation.normalized.topped}
                zone={selectedQualifierPresentation.normalized.zone}
                onAddAttempt={() =>
                  selectedQualifierClimber &&
                  setQualifierDraft(selectedQualifierDraftKey, (current) => ({
                    ...current,
                    attemptCount: current.attemptCount + 1,
                  }))
                }
                onClear={() =>
                  selectedQualifierClimber &&
                  setQualifierDraft(selectedQualifierDraftKey, () => EMPTY_QUALIFIER_DRAFT)
                }
                onDecreaseAttempt={() =>
                  selectedQualifierClimber &&
                  setQualifierDraft(selectedQualifierDraftKey, (current) => {
                    const nextAttemptCount = Math.max(0, current.attemptCount - 1);
                    return {
                      attemptCount: nextAttemptCount,
                      topped: nextAttemptCount > 0 ? current.topped : false,
                      zone: nextAttemptCount > 0 ? current.zone : false,
                    };
                  })
                }
                onSave={() => selectedQualifierClimber && void saveQualifier(selectedQualifierClimber.id)}
                onToggleTop={() =>
                  selectedQualifierClimber &&
                  setQualifierDraft(selectedQualifierDraftKey, (current) => ({
                    attemptCount: Math.max(1, current.attemptCount),
                    topped: !current.topped,
                    zone: !current.topped ? true : current.zone,
                  }))
                }
                onToggleZone={() =>
                  selectedQualifierClimber &&
                  setQualifierDraft(selectedQualifierDraftKey, (current) => ({
                    attemptCount: Math.max(1, current.attemptCount),
                    topped: false,
                    zone: !current.zone,
                  }))
                }
              />
            </div>
          </section>
        ) : (
          <section className="results-card">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="results-workspace-card">
                <div className="results-kicker">{activeFinalsRoundName} field</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{finalists.length}</div>
                <div className="mt-2 text-sm text-slate-600">
                  {finalsProjected ? "Projected from official qualifier standings." : "Finals field is locked and ready."}
                </div>
              </div>
              <div className="results-workspace-card">
                <div className="results-kicker">Scored cells</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">
                  {finalsScoredCellCount}/{finalsTotalCellCount}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  Each finalist x boulder cell can be edited from the grid below.
                </div>
              </div>
              <div className="results-workspace-card">
                <div className="results-kicker">Selected cell</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {selectedFinalist && selectedCell ? `${selectedFinalist.name} / B${selectedCell.climbNumber}` : "Choose a finals cell"}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {selectedFinalPresentation
                    ? `${selectedFinalPresentation.confirmationLabel}. ${selectedFinalPresentation.pointsLabel}.`
                    : finalsScoringOpen
                      ? "Finals saves are live now."
                      : finalsBlockedMessage || "Waiting for finals scoring."}
                </div>
              </div>
            </div>

            {finalsProjected ? (
              <div className="mt-5 rounded-[1.2rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                Finals scoring is enabled using the current projected finalists. Advancing to finals will lock the climbing order, but judges can already enter scores here once finals are live.
              </div>
            ) : null}
            {!finalsReady ? (
              <div className="results-meta-card mt-5 text-slate-600">{finalsBlockedMessage}</div>
            ) : (
              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
                <div ref={finalsGridViewportRef} className="overflow-x-auto">
                  <div className="results-grid-shell w-full" style={{ minWidth: finalsGridMinWidth }}>
                  <div
                    className="results-grid-header grid gap-3"
                    style={{ gridTemplateColumns: finalsGridTemplateColumns }}
                  >
                    <div>Finalist</div>
                    {getClimbs(activeFinalsProblemCount).map((climb) => (
                      <div key={climb.number}>B{climb.number}</div>
                    ))}
                  </div>
                  <div className="space-y-3 py-4">
                    {finalists.map((climber) => (
                      <div
                        key={climber.id}
                        className="grid gap-3 px-4"
                        style={{ gridTemplateColumns: finalsGridTemplateColumns }}
                      >
                        <div className="results-workspace-card px-4 py-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            #{snapshot.finalists.find((entry) => entry.climber_id === climber.id)?.climbing_order ?? "-"}
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">{climber.name}</div>
                          <div className="mt-1 text-sm text-slate-600">{climber.display_category}</div>
                        </div>
                        {getClimbs(activeFinalsProblemCount).map((climb) => {
                          const key = `${climber.id}:${climb.number}`;
                          const attempt = filterAttemptsForRound(climber.final_attempts, activeFinalsRoundId).find((entry) => entry.climb_number === climb.number);
                          const draft = finalsDrafts[key] ?? getFinalsDraftFromAttempt(attempt);
                          const presentation = getFinalsPresentation(draft, attempt);
                          const active = selectedCell?.climberId === climber.id && selectedCell?.climbNumber === climb.number;
                          return (
                            <button
                              id={`finals-cell-${climber.id}-${climb.number}`}
                              key={climb.number}
                              type="button"
                              onClick={() => setSelectedCell({ climberId: climber.id, climbNumber: climb.number })}
                              className={`results-cell-button ${
                                active
                                  ? "results-cell-button-active"
                                  : presentation.dirty
                                    ? "results-cell-button-dirty"
                                    : presentation.normalized.top
                                    ? "results-cell-button-top"
                                    : presentation.normalized.zone
                                      ? "results-cell-button-zone"
                                      : "results-cell-button-pending"
                              }`}
                            >
                              <div>{presentation.resultLabel}</div>
                              <div className="mt-2 text-xs font-medium opacity-70">
                                {presentation.pointsLabel}
                              </div>
                              <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
                                {active ? "Editing now" : presentation.confirmationLabel}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                </div>
                <div className="hidden xl:block xl:sticky xl:top-24">
                  <div className="results-workspace-card border-sky-100 bg-sky-50/40 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                    <div className="results-kicker">Finals editor</div>
                    {selectedFinalist && selectedCell ? (
                      <>
                        <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          selectedFinalPresentation?.confirmationTone === "dirty"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : selectedFinalPresentation?.confirmationTone === "confirmed"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-sky-200 bg-white text-sky-700"
                        }`}>
                          {selectedFinalPresentation?.confirmationLabel ?? "Linked to highlighted cell"}
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-slate-950">
                          {selectedFinalist.name} / Boulder {selectedCell.climbNumber}
                        </div>
                        <div className="mt-2 text-sm text-slate-600">
                          Route judges can confirm the selected finals cell here. Zone can stand alone, and recording a top automatically keeps the zone on.
                        </div>
                        {selectedFinalDraft && selectedFinalPresentation ? (
                          <FinalsEditorPanel
                            current={selectedFinalDraft}
                            dirty={selectedFinalPresentation.dirty}
                            confirmationLabel={selectedFinalPresentation.confirmationLabel}
                            confirmationTone={selectedFinalPresentation.confirmationTone}
                            finalsScoringOpen={finalsScoringOpen}
                            finalsBlockedMessage={finalsBlockedMessage}
                            saving={saving}
                            onAdjustZoneAttempts={(delta) =>
                              setFinalsDraft(selectedFinalDraftKey, (current) => {
                                const attemptsToZone = Math.max(0, current.attemptsToZone + delta);
                                return {
                                  ...current,
                                  zone: attemptsToZone > 0 ? true : false,
                                  top: attemptsToZone > 0 ? current.top : false,
                                  attemptsToZone,
                                };
                              })
                            }
                            onAdjustTopAttempts={(delta) =>
                              setFinalsDraft(selectedFinalDraftKey, (current) => {
                                const attemptsToTop = Math.max(0, current.attemptsToTop + delta);
                                return {
                                  ...current,
                                  top: attemptsToTop > 0,
                                  zone: attemptsToTop > 0 ? true : current.zone,
                                  attemptsToTop,
                                  attemptsToZone: attemptsToTop > 0 ? Math.max(1, current.attemptsToZone) : current.attemptsToZone,
                                };
                              })
                            }
                            onClear={clearFinalsCell}
                            onSave={() => void saveFinals()}
                            onToggleZone={() =>
                              setFinalsDraft(selectedFinalDraftKey, (current) => ({
                                ...current,
                                zone: !current.zone,
                                top: current.zone ? false : current.top,
                                attemptsToZone: !current.zone ? Math.max(1, current.attemptsToZone) : current.attemptsToZone,
                              }))
                            }
                            onToggleTop={() =>
                              setFinalsDraft(selectedFinalDraftKey, (current) => ({
                                ...current,
                                top: !current.top,
                                zone: !current.top ? true : current.zone,
                                attemptsToTop: !current.top ? Math.max(1, current.attemptsToTop) : current.attemptsToTop,
                                attemptsToZone: !current.top ? Math.max(1, current.attemptsToZone) : current.attemptsToZone,
                              }))
                            }
                          />
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="mt-2 text-2xl font-semibold text-slate-950">Choose a finals cell</div>
                        <div className="mt-2 text-sm text-slate-600">
                          Tap any finalist x boulder cell in the grid and the editor will stay open here while you work through scores.
                        </div>
                        <div className="mt-5 rounded-[1.2rem] border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-sm text-slate-500">
                          Select a pending, zone, or top cell to start editing.
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedFinalist && selectedCell && finalsReady ? (
              <div className="fixed inset-0 z-[70] xl:hidden">
                <button
                  type="button"
                  aria-label="Close finals editor"
                  className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
                  onClick={() => setSelectedCell(null)}
                />
                <div className="absolute inset-x-0 bottom-0 max-h-[85svh] overflow-y-auto rounded-t-[1.8rem] border border-slate-200 bg-white px-4 pb-6 pt-4 shadow-[0_-18px_48px_rgba(15,23,42,0.22)]">
                  <div className="mx-auto h-1.5 w-14 rounded-full bg-slate-200" />
                  <div className="mt-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="results-kicker">Edit finals cell</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {selectedFinalist.name} / Boulder {selectedCell.climbNumber}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCell(null)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
                    >
                      Close
                    </button>
                  </div>
                  <div className="mt-3 text-sm text-slate-600">
                    Judges can score finals here one cell at a time. Zone can stand alone, and recording a top automatically keeps the zone on.
                  </div>
                  {selectedFinalDraft && selectedFinalPresentation ? (
                    <FinalsEditorPanel
                      current={selectedFinalDraft}
                      dirty={selectedFinalPresentation.dirty}
                      confirmationLabel={selectedFinalPresentation.confirmationLabel}
                      confirmationTone={selectedFinalPresentation.confirmationTone}
                      finalsScoringOpen={finalsScoringOpen}
                      finalsBlockedMessage={finalsBlockedMessage}
                      saving={saving}
                      onAdjustZoneAttempts={(delta) =>
                        setFinalsDraft(selectedFinalDraftKey, (current) => {
                          const attemptsToZone = Math.max(0, current.attemptsToZone + delta);
                          return {
                            ...current,
                            zone: attemptsToZone > 0 ? true : false,
                            top: attemptsToZone > 0 ? current.top : false,
                            attemptsToZone,
                          };
                        })
                      }
                      onAdjustTopAttempts={(delta) =>
                        setFinalsDraft(selectedFinalDraftKey, (current) => {
                          const attemptsToTop = Math.max(0, current.attemptsToTop + delta);
                          return {
                            ...current,
                            top: attemptsToTop > 0,
                            zone: attemptsToTop > 0 ? true : current.zone,
                            attemptsToTop,
                            attemptsToZone: attemptsToTop > 0 ? Math.max(1, current.attemptsToZone) : current.attemptsToZone,
                          };
                        })
                      }
                      onClear={clearFinalsCell}
                      onSave={() => void saveFinals()}
                      onToggleZone={() =>
                        setFinalsDraft(selectedFinalDraftKey, (current) => ({
                          ...current,
                          zone: !current.zone,
                          top: current.zone ? false : current.top,
                          attemptsToZone: !current.zone ? Math.max(1, current.attemptsToZone) : current.attemptsToZone,
                        }))
                      }
                      onToggleTop={() =>
                        setFinalsDraft(selectedFinalDraftKey, (current) => ({
                          ...current,
                          top: !current.top,
                          zone: !current.top ? true : current.zone,
                          attemptsToTop: !current.top ? Math.max(1, current.attemptsToTop) : current.attemptsToTop,
                          attemptsToZone: !current.top ? Math.max(1, current.attemptsToZone) : current.attemptsToZone,
                        }))
                      }
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
