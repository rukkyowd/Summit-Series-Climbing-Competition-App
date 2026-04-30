"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { CompetitionSnapshot } from "@/lib/db";
import { normalizeQualifierAttemptInput } from "@/lib/attempts";
import {
  canStaffScoreQualifier,
  filterAttemptsForRound,
  formatCompetitionPhaseLabel,
  getActiveQualifierStyleRound,
  getClimbs,
  type QualifierAttempt,
} from "@/lib/scoring";
import type { DemoSyncStatus, JudgeQualifierSaveInput } from "@/components/demo/types";

type QualifierDraft = { attemptCount: number; topped: boolean; zone: boolean };
type QualifierDraftState = Record<string, QualifierDraft>;
type ConfirmationTone = "pending" | "confirmed" | "dirty";

const EMPTY_QUALIFIER_DRAFT: QualifierDraft = { attemptCount: 0, topped: false, zone: false };

function getQualifierDraftFromAttempt(
  attempt?: { attempt_count: number; topped: boolean; zone?: boolean | null } | null
): QualifierDraft {
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

function qualifierDraftMatchesSaved(
  draft: QualifierDraft,
  attempt?: { attempt_count: number; topped: boolean; zone?: boolean | null } | null
) {
  const normalized = normalizeQualifierAttemptInput(draft);
  const saved = getQualifierDraftFromAttempt(attempt);
  return (
    normalized.attemptCount === saved.attemptCount &&
    normalized.topped === saved.topped &&
    normalized.zone === saved.zone
  );
}

function formatQualifierSavedState(
  attempt?: { attempt_count: number; topped: boolean; zone?: boolean | null } | null
) {
  if (!attempt) {
    return "No official entry yet";
  }

  const countLabel = `${attempt.attempt_count} ${
    attempt.attempt_count === 1 ? "attempt" : "attempts"
  }`;
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
    confirmationLabel: dirty
      ? "Unsaved judge edits"
      : hasSavedAttempt
        ? hasSavedResult
          ? "Score confirmed"
          : "Draft saved"
        : "No saved score yet",
    confirmationTone: dirty ? "dirty" : hasSavedResult ? "confirmed" : "pending",
    savedSummary: formatQualifierSavedState(attempt),
  };
}

type JudgeWorkspaceProps = {
  snapshot: CompetitionSnapshot;
  embedded?: boolean;
  saving?: boolean;
  queuedCount?: number;
  message?: string;
  error?: string;
  syncStatus?: string;
  syncState?: DemoSyncStatus;
  initialClimberId?: string | null;
  targetClimberId?: string | null;
  targetClimberName?: string | null;
  offlineMode?: boolean;
  interactionLocked?: boolean;
  pitchClimbLabels?: Array<{ number: number; shortLabel: string; label: string }>;
  presentationFocus?: "judge" | "save" | "leaderboard" | "offline" | "sync" | "complete" | null;
  onSaveQualifier: (input: JudgeQualifierSaveInput) => Promise<void>;
};

export function JudgeWorkspace({
  snapshot,
  embedded = false,
  saving = false,
  queuedCount = 0,
  message = "",
  error = "",
  syncStatus = "Synced",
  syncState = "synced",
  initialClimberId = null,
  targetClimberId = null,
  targetClimberName = null,
  offlineMode = false,
  interactionLocked = false,
  pitchClimbLabels = [],
  presentationFocus = null,
  onSaveQualifier,
}: JudgeWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [selectedBoulder, setSelectedBoulder] = useState(1);
  const [qualifierDrafts, setQualifierDrafts] = useState<QualifierDraftState>({});
  const activeQualifierRoundId =
    snapshot.activeQualifierRound?.id ??
    getActiveQualifierStyleRound(snapshot.competition)?.id ??
    null;
  const activeQualifierRoundName =
    snapshot.activeQualifierRound?.name ??
    getActiveQualifierStyleRound(snapshot.competition)?.name ??
    "Qualifier";
  const activeQualifierProblemCount =
    snapshot.activeQualifierRound?.problem_count ?? snapshot.competition.total_climbs ?? 0;
  const qualifierScoringOpen = canStaffScoreQualifier(snapshot.competition);
  const syncToneClass =
    syncState === "failed"
      ? "demo-judge-sync-row-failed"
      : syncState === "syncing"
        ? "demo-judge-sync-row-syncing"
        : syncState === "pending" || offlineMode
          ? "demo-judge-sync-row-pending"
          : "demo-judge-sync-row-synced";
  const syncHelperCopy = offlineMode
    ? "New scores stay on this judge station until you reconnect."
    : syncState === "pending"
      ? `${queuedCount} ${queuedCount === 1 ? "score is" : "scores are"} waiting to publish.`
      : syncState === "syncing"
        ? "Queued scores are syncing back to the public leaderboard."
        : syncState === "failed"
          ? "Sync needs attention before the public view catches up."
          : "Every save is publishing live to the public leaderboard.";
  const selectedPitchClimb =
    pitchClimbLabels.find((climb) => climb.number === selectedBoulder) ??
    pitchClimbLabels[selectedBoulder - 1] ??
    null;

  useEffect(() => {
    const nextDrafts: QualifierDraftState = {};
    snapshot.climbers.forEach((climber) => {
      filterAttemptsForRound(climber.qualifier_attempts, activeQualifierRoundId).forEach((attempt) => {
        nextDrafts[`${climber.id}:${attempt.climb_number}`] = getQualifierDraftFromAttempt(attempt);
      });
    });
    setQualifierDrafts(nextDrafts);
  }, [activeQualifierRoundId, snapshot]);

  const qualifierClimbers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = snapshot.climbers.filter((climber) => {
      if (!normalized) {
        return true;
      }

      return (
        climber.name.toLowerCase().includes(normalized) ||
        climber.climber_number.toLowerCase().includes(normalized) ||
        climber.display_category.toLowerCase().includes(normalized)
      );
    });

    if (!initialClimberId) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      if (left.id === initialClimberId) {
        return -1;
      }
      if (right.id === initialClimberId) {
        return 1;
      }
      return left.name.localeCompare(right.name);
    });
  }, [initialClimberId, query, snapshot.climbers]);

  const qualifierSavedCount = useMemo(
    () =>
      snapshot.climbers.filter((climber) =>
        filterAttemptsForRound(climber.qualifier_attempts, activeQualifierRoundId).some(
          (attempt) => attempt.climb_number === selectedBoulder
        )
      ).length,
    [activeQualifierRoundId, selectedBoulder, snapshot.climbers]
  );

  const setQualifierDraft = (key: string, updater: (draft: QualifierDraft) => QualifierDraft) => {
    setQualifierDrafts((current) => {
      const nextDraft = updater(current[key] ?? EMPTY_QUALIFIER_DRAFT);
      return {
        ...current,
        [key]: nextDraft,
      };
    });
  };

  const handleSave = async (climberId: string, climbNumber: number) => {
    const key = `${climberId}:${climbNumber}`;
    const draft = qualifierDrafts[key] ?? EMPTY_QUALIFIER_DRAFT;
    const normalized = normalizeQualifierAttemptInput(draft);
    setQualifierDrafts((current) => ({
      ...current,
      [key]: {
        attemptCount: normalized.attemptCount,
        topped: normalized.topped,
        zone: normalized.zone,
      },
    }));
    await onSaveQualifier({
      climberId,
      climbNumber,
      attemptCount: normalized.attemptCount,
      topped: normalized.topped,
      zone: normalized.zone,
      attemptsToTop: normalized.attemptsToTop,
      attemptsToZone: normalized.attemptsToZone,
    });
  };

  return (
    <Surface
      variant="card"
      className={`${embedded ? "flex h-full min-h-0 min-w-0 flex-col" : ""} ${
        offlineMode ? "demo-judge-offline-surface" : ""
      } ${presentationFocus === "judge" || presentationFocus === "offline" || presentationFocus === "sync" ? "demo-pitch-focus-surface" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4" data-demo-anchor="interactive-judge">
        <div className="space-y-2">
          <div className="results-kicker">{activeQualifierRoundName} scoring workspace</div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
            Boulder-by-boulder judging
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
            You are judging {targetClimberId ? qualifierClimbers.find((climber) => climber.id === targetClimberId)?.display_category ?? "the live qualifier field" : "the live qualifier field"}. Save one score on Boulder 1, then watch the public leaderboard react on the right.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{formatCompetitionPhaseLabel(snapshot.competition.current_phase)}</Badge>
          <Badge variant={queuedCount > 0 ? "live" : "default"} data-demo-anchor="interactive-sync">
            {syncStatus}
          </Badge>
        </div>
      </div>

      <div className={`mt-6 grid gap-4 ${embedded ? "demo-judge-shell-embedded" : "xl:grid-cols-[20rem_minmax(0,1fr)]"}`}>
        <div className="results-control-stack">
          <div>
            <div className="results-kicker">{activeQualifierRoundName} controls</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              Boulder {String(selectedBoulder).padStart(2, "0")}
            </div>
            {selectedPitchClimb ? (
              <div className="mt-2 inline-flex items-center rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                {selectedPitchClimb.label}
              </div>
            ) : null}
            <div className="mt-2 text-sm text-slate-600">
              {qualifierSavedCount} of {snapshot.climbers.length} climbers already have an entry on this
              boulder.
            </div>
            {targetClimberName ? (
              <div className="mt-3 rounded-[1rem] border border-sky-200 bg-sky-50/80 px-3 py-3 text-sm text-sky-800">
                Demo target: save {targetClimberName} on Boulder 1, then watch the leaderboard jump.
              </div>
            ) : null}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="results-input"
            placeholder="Filter by name, number, or category"
            disabled={interactionLocked}
          />
          <div className="flex max-h-[20rem] flex-wrap gap-2 overflow-y-auto">
            {getClimbs(activeQualifierProblemCount).map((climb) => (
              <button
                key={climb.number}
                type="button"
                onClick={() => setSelectedBoulder(climb.number)}
                className={`results-secondary-button px-4 ${
                  selectedBoulder === climb.number ? "results-secondary-button-active" : ""
                }`}
                disabled={interactionLocked}
              >
                <span className="flex flex-col items-center gap-1 text-center">
                  <span>B{String(climb.number).padStart(2, "0")}</span>
                  {pitchClimbLabels[climb.number - 1] ? (
                    <span className="text-[11px] font-medium normal-case tracking-normal text-slate-500">
                      {pitchClimbLabels[climb.number - 1]?.shortLabel}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
            {qualifierScoringOpen
              ? "Large touch targets are enabled here on purpose so a judge can save a score fast, even under gym pressure."
              : "Qualifier scoring is currently locked, so the workspace is in read-only mode."}
          </div>
        </div>

        <div className="min-h-0 min-w-0 space-y-3 overflow-y-auto pr-1" data-demo-anchor="interactive-judge-card">
          {qualifierClimbers.map((climber, climberIndex) => {
            const key = `${climber.id}:${selectedBoulder}`;
            const existingAttempt = filterAttemptsForRound(
              climber.qualifier_attempts,
              activeQualifierRoundId
            ).find((attempt) => attempt.climb_number === selectedBoulder);
            const draft = qualifierDrafts[key] ?? getQualifierDraftFromAttempt(existingAttempt);
            const presentation = getQualifierPresentation(draft, existingAttempt);
            return (
              <div
                key={climber.id}
                className={`results-workspace-card route-judge-card ${
                  embedded ? "demo-judge-card-embedded" : ""
                } ${
                  targetClimberId === climber.id ? "demo-judge-card-target ring-2 ring-sky-300/80 shadow-[0_18px_42px_rgba(14,116,215,0.12)]" : ""
                }`}
                data-demo-anchor={climberIndex === 0 ? "interactive-first-athlete" : undefined}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">{climber.name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      #{climber.climber_number} | {climber.display_category}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className={`judge-status-chip judge-status-chip-${presentation.confirmationTone}`}>
                        {presentation.confirmationLabel}
                      </div>
                      {targetClimberId === climber.id ? (
                        <Badge className="demo-judge-target-badge">Demo target</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Boulder {String(selectedBoulder).padStart(2, "0")}
                  </div>
                </div>

                {targetClimberId === climber.id ? (
                  <div className="demo-judge-target-callout">
                    Save this climber first so the rank jump is obvious on the leaderboard.
                  </div>
                ) : null}

                <div className={`demo-judge-live-stack ${embedded ? "demo-judge-live-stack-embedded" : "route-judge-live-row"}`}>
                  <div className="route-judge-counter-card">
                    <div className="results-kicker">Live attempt counter</div>
                    <div className={`route-judge-counter-row ${embedded ? "demo-judge-counter-row-embedded" : ""}`}>
                      <button
                        type="button"
                        onClick={() =>
                          setQualifierDraft(key, (current) => {
                            const nextAttemptCount = Math.max(0, current.attemptCount - 1);
                            return {
                              attemptCount: nextAttemptCount,
                              topped: nextAttemptCount > 0 ? current.topped : false,
                              zone: nextAttemptCount > 0 ? current.zone : false,
                            };
                          })
                        }
                        className="route-judge-counter-button"
                        aria-label={`Decrease live attempts for ${climber.name}`}
                        disabled={interactionLocked}
                      >
                        -
                      </button>
                      <div className="route-judge-counter-value">{presentation.normalized.attemptCount}</div>
                      <button
                        type="button"
                        onClick={() =>
                          setQualifierDraft(key, (current) => ({
                            ...current,
                            attemptCount: current.attemptCount + 1,
                          }))
                        }
                        className="route-judge-counter-button route-judge-counter-button-accent"
                        aria-label={`Add an attempt for ${climber.name}`}
                        disabled={interactionLocked}
                      >
                        Attempt
                      </button>
                    </div>
                  </div>

                  <div className={`judge-live-summary min-w-0 ${embedded ? "demo-judge-live-summary-embedded" : ""}`}>
                    <div className="space-y-2">
                      <div className="results-kicker">Judge call</div>
                      <div className="mt-2 text-xl font-semibold text-slate-950">{presentation.liveLabel}</div>
                      <div className={`demo-judge-sync-row ${syncToneClass}`} data-demo-anchor={climberIndex === 0 ? "interactive-offline-banner" : undefined}>
                        <span className="demo-judge-sync-dot" />
                        <span>{syncStatus}</span>
                        <span className="hidden text-slate-400 sm:inline">·</span>
                        <span className="demo-judge-sync-helper">{syncHelperCopy}</span>
                      </div>
                    </div>
                    <div className="text-sm text-slate-600">{presentation.liveDetail}</div>
                  </div>
                </div>

                <div className={`route-judge-action-grid route-judge-action-grid-qualifier ${embedded ? "demo-judge-action-grid-embedded" : ""}`}>
                  <button
                    type="button"
                    onClick={() =>
                      setQualifierDraft(key, (current) => ({
                        ...current,
                        attemptCount: current.attemptCount + 1,
                      }))
                    }
                    className="route-judge-action route-judge-action-neutral"
                    disabled={interactionLocked}
                  >
                    <span className="route-judge-action-label">Attempt</span>
                    <span className="route-judge-action-detail">Count another live start</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setQualifierDraft(key, (current) => ({
                        attemptCount: Math.max(1, current.attemptCount),
                        topped: false,
                        zone: !current.zone,
                      }))
                    }
                    className={`route-judge-action route-judge-action-zone ${
                      presentation.normalized.zone && !presentation.normalized.topped
                        ? "route-judge-action-active"
                        : ""
                    }`}
                    disabled={interactionLocked}
                  >
                    <span className="route-judge-action-label">Zone</span>
                    <span className="route-judge-action-detail">
                      {presentation.normalized.zone && !presentation.normalized.topped
                        ? "Zone ON"
                        : "Zone OFF"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setQualifierDraft(key, (current) => ({
                        attemptCount: Math.max(1, current.attemptCount),
                        topped: !current.topped,
                        zone: !current.topped ? true : current.zone,
                      }))
                    }
                    className={`route-judge-action route-judge-action-top ${
                      presentation.normalized.topped ? "route-judge-action-active" : ""
                    }`}
                    disabled={interactionLocked}
                  >
                    <span className="route-judge-action-label">Top</span>
                    <span className="route-judge-action-detail">
                      {presentation.normalized.topped ? "Top ON" : "Top OFF"}
                    </span>
                  </button>
                </div>

                <div className={`route-judge-footer ${embedded ? "demo-judge-footer-embedded" : ""}`}>
                  <div className="space-y-1 text-sm text-slate-500">
                    <div>Last saved: {presentation.savedSummary}</div>
                    {message && targetClimberId === climber.id ? (
                      <div className="text-sm font-medium text-emerald-700">{message}</div>
                    ) : null}
                    {error && targetClimberId === climber.id ? (
                      <div className="text-sm font-medium text-red-700">{error}</div>
                    ) : null}
                  </div>
                  <div
                    className={`flex flex-wrap items-center gap-2 ${embedded ? "w-full sm:w-auto" : ""}`}
                    data-demo-anchor={climberIndex === 0 ? "interactive-save" : undefined}
                  >
                    <Button
                      variant="ghost"
                      className={`text-slate-500 ${embedded ? "min-h-12 px-5 text-sm" : "min-h-11 rounded-full px-4"}`}
                      onClick={() => setQualifierDraft(key, () => EMPTY_QUALIFIER_DRAFT)}
                      disabled={saving || interactionLocked}
                    >
                      Clear
                    </Button>
                    <Button
                      variant="primary"
                      className={`${embedded ? "min-h-14 min-w-[13rem] flex-1 rounded-[1.1rem] px-6 text-base sm:flex-none" : "min-h-11 rounded-full px-5"}`}
                      onClick={() => void handleSave(climber.id, selectedBoulder)}
                      disabled={saving || !qualifierScoringOpen || interactionLocked}
                    >
                      Save judge call
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Surface>
  );
}
