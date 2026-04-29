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
import type { JudgeQualifierSaveInput } from "@/components/demo/types";

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
  initialClimberId?: string | null;
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
  initialClimberId = null,
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
    <Surface variant="card" className={embedded ? "flex h-full min-h-0 flex-col" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-4" data-demo-anchor="interactive-judge">
        <div className="space-y-2">
          <div className="results-kicker">{activeQualifierRoundName} scoring workspace</div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
            Boulder-by-boulder judging
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
            Save one judge call on the left and watch the leaderboard move on the right. This uses the
            same seeded demo competition the public pages read from.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{formatCompetitionPhaseLabel(snapshot.competition.current_phase)}</Badge>
          <Badge variant={queuedCount > 0 ? "live" : "default"} data-demo-anchor="interactive-sync">
            {syncStatus}
          </Badge>
        </div>
      </div>

      {message ? <Alert variant="success" className="mt-4">{message}</Alert> : null}
      {error ? <Alert variant="error" className="mt-4">{error}</Alert> : null}
      {queuedCount > 0 ? (
        <Alert variant="warning" className="mt-4">
          {queuedCount} score {queuedCount === 1 ? "is" : "are"} waiting to sync from the local demo
          queue.
        </Alert>
      ) : null}

      <div className={`mt-6 grid gap-4 ${embedded ? "lg:grid-cols-[19rem_minmax(0,1fr)]" : "xl:grid-cols-[20rem_minmax(0,1fr)]"}`}>
        <div className="results-control-stack">
          <div>
            <div className="results-kicker">{activeQualifierRoundName} controls</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              Boulder {String(selectedBoulder).padStart(2, "0")}
            </div>
            <div className="mt-2 text-sm text-slate-600">
              {qualifierSavedCount} of {snapshot.climbers.length} climbers already have an entry on this
              boulder.
            </div>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="results-input"
            placeholder="Filter by name, number, or category"
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
              >
                B{String(climb.number).padStart(2, "0")}
              </button>
            ))}
          </div>
          <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
            {qualifierScoringOpen
              ? "Large touch targets are enabled here on purpose so a judge can save a score fast, even under gym pressure."
              : "Qualifier scoring is currently locked, so the workspace is in read-only mode."}
          </div>
        </div>

        <div className="min-h-0 space-y-3 overflow-y-auto pr-1" data-demo-anchor="interactive-judge-card">
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
                className="results-workspace-card route-judge-card"
                data-demo-anchor={climberIndex === 0 ? "interactive-first-athlete" : undefined}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">{climber.name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      #{climber.climber_number} | {climber.display_category}
                    </div>
                    <div className={`judge-status-chip judge-status-chip-${presentation.confirmationTone}`}>
                      {presentation.confirmationLabel}
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Boulder {String(selectedBoulder).padStart(2, "0")}
                  </div>
                </div>

                <div className="route-judge-live-row">
                  <div className="route-judge-counter-card">
                    <div className="results-kicker">Live attempt counter</div>
                    <div className="route-judge-counter-row">
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
                      >
                        Attempt
                      </button>
                    </div>
                  </div>

                  <div className="judge-live-summary">
                    <div>
                      <div className="results-kicker">Judge call</div>
                      <div className="mt-2 text-xl font-semibold text-slate-950">{presentation.liveLabel}</div>
                    </div>
                    <div className="text-sm text-slate-600">{presentation.liveDetail}</div>
                  </div>
                </div>

                <div className="route-judge-action-grid route-judge-action-grid-qualifier">
                  <button
                    type="button"
                    onClick={() =>
                      setQualifierDraft(key, (current) => ({
                        ...current,
                        attemptCount: current.attemptCount + 1,
                      }))
                    }
                    className="route-judge-action route-judge-action-neutral"
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
                  >
                    <span className="route-judge-action-label">Top</span>
                    <span className="route-judge-action-detail">
                      {presentation.normalized.topped ? "Top ON" : "Top OFF"}
                    </span>
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-500">Last saved: {presentation.savedSummary}</div>
                  <div className="flex flex-wrap items-center gap-2" data-demo-anchor={climberIndex === 0 ? "interactive-save" : undefined}>
                    <Button
                      variant="ghost"
                      className="min-h-11 rounded-full px-4 text-slate-500"
                      onClick={() => setQualifierDraft(key, () => EMPTY_QUALIFIER_DRAFT)}
                      disabled={saving}
                    >
                      Clear
                    </Button>
                    <Button
                      variant="primary"
                      className="min-h-11 rounded-full px-5"
                      onClick={() => void handleSave(climber.id, selectedBoulder)}
                      disabled={saving || !qualifierScoringOpen}
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
