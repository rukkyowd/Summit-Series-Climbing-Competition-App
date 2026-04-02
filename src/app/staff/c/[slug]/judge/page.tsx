"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import StaffCompetitionSubnav from "@/components/staff-competition-subnav";
import {
  getClimberWithAttempts,
  getCompetitionSnapshot,
  updateFinalAttempt,
  updateQualifierAttemptByStaff,
  type CompetitionSnapshot,
} from "@/lib/db";
import { getAuthState, isStaffRole, type Profile } from "@/lib/auth";
import { normalizeFinalAttemptInput, normalizeQualifierAttemptInput } from "@/lib/attempts";
import { enqueueOfflineItem, readOfflineQueue, removeOfflineItem } from "@/lib/staff-offline-queue";
import {
  buildFinalsLeaderboard,
  buildQualifierLeaderboard,
  canStaffScoreFinals,
  canStaffScoreQualifier,
  formatCompetitionPhaseLabel,
  formatFinalPoints,
  getClimbs,
  type ClimberWithAttempts,
  type FinalAttempt,
} from "@/lib/scoring";

type QualifierDraftState = Record<string, { attemptCount: number; topped: boolean }>;
type FinalsDraftState = Record<string, { top: boolean; zone: boolean; attemptsToTop: number; attemptsToZone: number }>;

function shouldQueueFailedSave(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(message);
}

export default function StaffJudgePage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const initialStage = searchParams?.get("stage") === "finals" ? "finals" : "qualifier";
  const initialClimberId = searchParams?.get("climberId") ?? "";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stage, setStage] = useState<"qualifier" | "finals">(initialStage);
  const [query, setQuery] = useState("");
  const [selectedBoulder, setSelectedBoulder] = useState(1);
  const [selectedCell, setSelectedCell] = useState<{ climberId: string; climbNumber: number } | null>(null);
  const [qualifierDrafts, setQualifierDrafts] = useState<QualifierDraftState>({});
  const [finalsDrafts, setFinalsDrafts] = useState<FinalsDraftState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [queuedCount, setQueuedCount] = useState(0);
  const flushingQueueRef = useRef(false);
  const finalsGridViewportRef = useRef<HTMLDivElement | null>(null);

  const flushOfflineQueue = useCallback(async () => {
    if (flushingQueueRef.current) {
      return;
    }

    flushingQueueRef.current = true;
    const queue = readOfflineQueue();
    try {
      for (const item of queue) {
        try {
          if (item.type === "qualifier") {
            await updateQualifierAttemptByStaff(item.competitionId, item.climberId, item.climbNumber, item.attemptCount, item.topped);
          } else {
            await updateFinalAttempt(item.competitionId, item.climberId, item.climbNumber, item.top, item.zone, item.attemptsToTop, item.attemptsToZone);
          }
          removeOfflineItem(item.id);
        } catch {
          break;
        }
      }

      setQueuedCount(readOfflineQueue().length);
      if (snapshot) {
        const refreshed = await getCompetitionSnapshot(snapshot.competition.id);
        setSnapshot(refreshed);
      }
    } finally {
      flushingQueueRef.current = false;
    }
  }, [snapshot]);

  useEffect(() => {
    setLoading(true);
    void Promise.all([getCompetitionSnapshot(slug), getAuthState()])
      .then(([nextSnapshot, authState]) => {
        if (!isStaffRole(authState.profile?.role)) {
          window.location.href = `/staff/login?redirect=${encodeURIComponent(`/staff/c/${slug}/judge`)}`;
          return;
        }

        setProfile(authState.profile);
        setSnapshot(nextSnapshot);
        const qualifierNext: QualifierDraftState = {};
        const finalsNext: FinalsDraftState = {};
        nextSnapshot.climbers.forEach((climber) => {
          climber.qualifier_attempts.forEach((attempt) => {
            qualifierNext[`${climber.id}:${attempt.climb_number}`] = {
              attemptCount: attempt.attempt_count,
              topped: attempt.topped,
            };
          });
          climber.final_attempts.forEach((attempt) => {
            finalsNext[`${climber.id}:${attempt.climb_number}`] = {
              top: attempt.top,
              zone: attempt.zone,
              attemptsToTop: attempt.attempts_to_top ?? 0,
              attemptsToZone: attempt.attempts_to_zone ?? 0,
            };
          });
        });
        setQualifierDrafts(qualifierNext);
        setFinalsDrafts(finalsNext);
        if (initialClimberId) {
          setSelectedCell({ climberId: initialClimberId, climbNumber: 1 });
        }
        setError("");
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Unable to load the judge panel.");
      })
      .finally(() => setLoading(false));
  }, [initialClimberId, slug]);

  useEffect(() => {
    const syncQueuedCount = () => setQueuedCount(readOfflineQueue().length);
    syncQueuedCount();
    if (typeof navigator !== "undefined" && navigator.onLine && readOfflineQueue().length > 0) {
      void flushOfflineQueue();
    }
    const onOnline = () => {
      syncQueuedCount();
      void flushOfflineQueue();
    };
    const retryTimer = window.setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.onLine && readOfflineQueue().length > 0) {
        void flushOfflineQueue();
      }
    }, 15000);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(retryTimer);
    };
  }, [flushOfflineQueue]);

  const qualifierClimbers = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const normalized = query.trim().toLowerCase();
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
  }, [query, snapshot]);

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
  const finalsReady = finalists.length > 0;
  const finalsProjected = Boolean(snapshot && !snapshot.finalistsPersisted && finalists.length > 0);
  const qualifierSavedCount = useMemo(
    () =>
      snapshot
        ? snapshot.climbers.filter((climber) =>
            climber.qualifier_attempts.some((attempt) => attempt.climb_number === selectedBoulder)
          ).length
        : 0,
    [selectedBoulder, snapshot]
  );
  const finalsScoredCellCount = useMemo(
    () =>
      finalists.reduce(
        (count, climber) =>
          count +
          getClimbs(snapshot?.competition.finals_problem_count ?? 0).filter((climb) => {
            const attempt = climber.final_attempts.find((entry) => entry.climb_number === climb.number);
            return Boolean(attempt?.top || attempt?.zone);
          }).length,
        0
      ),
    [finalists, snapshot?.competition.finals_problem_count]
  );
  const finalsTotalCellCount = finalists.length * (snapshot?.competition.finals_problem_count ?? 0);
  const finalsProblemCount = snapshot?.competition.finals_problem_count ?? 0;
  const finalsGridTemplateColumns = `minmax(9rem, 1.15fr) repeat(${Math.max(finalsProblemCount, 1)}, minmax(6.75rem, 1fr))`;
  const finalsGridMinWidth = `${Math.max(640, 176 + finalsProblemCount * 124)}px`;
  const finalsBlockedMessage = !snapshot
    ? ""
    : !finalists.length
      ? "No finalists are available yet. Finish qualifier results or advance the competition to finals to generate the finals field."
      : !finalsScoringOpen
        ? `Finals scoring is closed during the ${formatCompetitionPhaseLabel(snapshot.competition.current_phase).toLowerCase()} phase.`
        : "";

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
      selectedCell.climbNumber <= (snapshot?.competition.finals_problem_count ?? 0);

    if (!selectedStillValid) {
      setSelectedCell(firstCell);
    }
  }, [finalists, finalsReady, selectedCell, snapshot?.competition.finals_problem_count, stage]);

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

  const updateClimberInSnapshot = async (climberId: string, updater: (nextClimbers: ClimberWithAttempts[]) => CompetitionSnapshot) => {
    if (!snapshot) {
      return;
    }

    const refreshed = await getClimberWithAttempts(snapshot.competition.id, climberId);
    if (!refreshed) {
      return;
    }

    const nextClimbers = snapshot.climbers.map((entry) => (entry.id === climberId ? refreshed : entry));
    setSnapshot(updater(nextClimbers));
  };

  const saveQualifier = async (climberId: string) => {
    if (!snapshot || !canStaffScoreQualifier(snapshot.competition)) {
      return;
    }

    const key = `${climberId}:${selectedBoulder}`;
    const draft = qualifierDrafts[key] ?? { attemptCount: 0, topped: false };
    const normalized = normalizeQualifierAttemptInput(draft);
    setQualifierDrafts((current) => ({
      ...current,
      [key]: { attemptCount: normalized.attemptCount, topped: normalized.topped },
    }));
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateQualifierAttemptByStaff(
        snapshot.competition.id,
        climberId,
        selectedBoulder,
        normalized.attemptCount,
        normalized.topped,
        {
          zone: normalized.zone,
          attemptsToTop: normalized.attemptsToTop,
          attemptsToZone: normalized.attemptsToZone,
        }
      );
      await updateClimberInSnapshot(climberId, (nextClimbers) => ({
        ...snapshot,
        climbers: nextClimbers,
        qualifierLeaderboard: buildQualifierLeaderboard(nextClimbers, snapshot.competition),
      }));
      setMessage(`Saved qualifier score for boulder ${selectedBoulder}.`);
    } catch (nextError) {
      if (shouldQueueFailedSave(nextError)) {
        enqueueOfflineItem({
          id: `qualifier-${climberId}-${selectedBoulder}`,
          type: "qualifier",
          competitionId: snapshot.competition.id,
          climberId,
          climbNumber: selectedBoulder,
          attemptCount: normalized.attemptCount,
          topped: normalized.topped,
          createdAt: new Date().toISOString(),
        });
        setQueuedCount(readOfflineQueue().length);
        setError(
          nextError instanceof Error
            ? `${nextError.message} Score queued locally and will retry automatically.`
            : "Unable to save qualifier score right now. Score queued for retry."
        );
      } else {
        setError(nextError instanceof Error ? nextError.message : "Unable to save qualifier score.");
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
    const draft = finalsDrafts[key] ?? { top: false, zone: false, attemptsToTop: 0, attemptsToZone: 0 };
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
      await updateFinalAttempt(
        snapshot.competition.id,
        selectedCell.climberId,
        selectedCell.climbNumber,
        normalized.top,
        normalized.zone,
        normalized.attemptsToTop,
        normalized.attemptsToZone
      );
      await updateClimberInSnapshot(selectedCell.climberId, (nextClimbers) => ({
        ...snapshot,
        climbers: nextClimbers,
        finalsLeaderboard: buildFinalsLeaderboard(nextClimbers, snapshot.finalists, snapshot.competition),
      }));
      setMessage(`Saved finals score for boulder ${selectedCell.climbNumber}.`);
    } catch (nextError) {
      if (shouldQueueFailedSave(nextError)) {
        enqueueOfflineItem({
          id: `finals-${selectedCell.climberId}-${selectedCell.climbNumber}`,
          type: "finals",
          competitionId: snapshot.competition.id,
          climberId: selectedCell.climberId,
          climbNumber: selectedCell.climbNumber,
          top: normalized.top,
          zone: normalized.zone,
          attemptsToTop: normalized.attemptsToTop,
          attemptsToZone: normalized.attemptsToZone,
          createdAt: new Date().toISOString(),
        });
        setQueuedCount(readOfflineQueue().length);
        setError(
          nextError instanceof Error
            ? `${nextError.message} Score queued locally and will retry automatically.`
            : "Unable to save finals score right now. Score queued for retry."
        );
      } else {
        setError(nextError instanceof Error ? nextError.message : "Unable to save finals score.");
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
    setFinalsDrafts((state) => ({
      ...state,
      [key]: { top: false, zone: false, attemptsToTop: 0, attemptsToZone: 0 },
    }));
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

        {message ? <div className="results-alert results-alert-success">{message}</div> : null}
        {error ? <div className="results-alert results-alert-error">{error}</div> : null}

        <section className="results-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="results-kicker">Staff scoring</div>
              <h1 className="mt-2 text-4xl font-semibold text-slate-950">{snapshot.competition.name}</h1>
              <div className="mt-3 text-sm text-slate-600">Current phase: {formatCompetitionPhaseLabel(snapshot.competition.current_phase)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="results-chip">{profile?.display_name || profile?.role || "staff"}</div>
              <div className={qualifierScoringOpen ? "results-chip results-chip-live" : "results-chip"}>
                {qualifierScoringOpen ? "Qualifier scoring open" : "Qualifier scoring closed"}
              </div>
              <div className={finalsScoringOpen ? "results-chip results-chip-live" : "results-chip"}>
                {finalsScoringOpen ? "Finals scoring open" : "Finals scoring closed"}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              Judges and admins can score both qualifier and finals rounds from this page. Use qualifier mode for live boulder entry and finals mode for the full finals grid.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setStage("qualifier")}
                className={`rounded-[1.4rem] border px-5 py-4 text-left transition ${
                  stage === "qualifier"
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Qualifier</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">Boulder-by-boulder entry</div>
                <div className="mt-1 text-sm text-slate-600">
                  {qualifierScoringOpen ? "Open for staff scoring now." : "Locked until qualifier live."}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStage("finals")}
                className={`rounded-[1.4rem] border px-5 py-4 text-left transition ${
                  stage === "finals"
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Finals</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">Grid scoring for finalists</div>
                <div className="mt-1 text-sm text-slate-600">
                  {finalsScoringOpen ? "Open for finals scoring now." : finalsReady ? "Field loaded, waiting for finals live." : "Waiting for a finals field."}
                </div>
              </button>
            </div>
          </div>
          {queuedCount > 0 ? (
            <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {queuedCount} score {queuedCount === 1 ? "is" : "are"} queued locally. They will retry automatically as soon as saving is available again.
            </div>
          ) : null}
        </section>

        {stage === "qualifier" ? (
          <section className="results-card">
            <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
              <div className="space-y-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <div>
                  <div className="results-kicker">Qualifier controls</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    Boulder {String(selectedBoulder).padStart(2, "0")}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    {qualifierSavedCount} of {snapshot.climbers.length} climbers already have an entry on this boulder.
                  </div>
                </div>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="results-input"
                  placeholder="Filter by name, number, or category"
                />
                <div className="flex max-h-[22rem] flex-wrap gap-2 overflow-y-auto">
                  {getClimbs(snapshot.competition.total_climbs).map((climb) => (
                    <button
                      key={climb.number}
                      type="button"
                      onClick={() => setSelectedBoulder(climb.number)}
                      className={`results-secondary-button px-4 ${selectedBoulder === climb.number ? "results-secondary-button-active" : ""}`}
                    >
                      B{String(climb.number).padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                {!qualifierScoringOpen ? (
                  <div className="results-meta-card mb-5 text-slate-600">
                    Qualifier scoring is currently locked. Move the competition back to qualifier live if staff still need to enter qualifier scores.
                  </div>
                ) : null}

                <div className="space-y-3">
                  {qualifierClimbers.map((climber) => {
                    const key = `${climber.id}:${selectedBoulder}`;
                    const draft = qualifierDrafts[key] ?? { attemptCount: 0, topped: false };
                    const existingAttempt = climber.qualifier_attempts.find((attempt) => attempt.climb_number === selectedBoulder);
                    return (
                      <div key={climber.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold text-slate-950">{climber.name}</div>
                            <div className="mt-1 text-sm text-slate-600">
                              #{climber.climber_number} | {climber.display_category}
                            </div>
                            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              {existingAttempt ? "Existing score loaded" : "No score yet"}
                            </div>
                          </div>
                          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Boulder {String(selectedBoulder).padStart(2, "0")}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 lg:grid-cols-[8rem_auto_auto_9rem]">
                          <label className="space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Attempts</div>
                            <input
                              type="number"
                              min={0}
                              value={draft.attemptCount}
                              onChange={(event) =>
                                setQualifierDrafts((current) => ({
                                  ...current,
                                  [key]: { ...draft, attemptCount: Number(event.target.value) || 0 },
                                }))
                              }
                              className="results-input"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setQualifierDrafts((current) => ({ ...current, [key]: { ...draft, topped: false } }))}
                            className={`results-secondary-button ${!draft.topped ? "results-secondary-button-active" : ""}`}
                          >
                            No top
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setQualifierDrafts((current) => ({
                                ...current,
                                [key]: { ...draft, topped: true, attemptCount: Math.max(1, draft.attemptCount) },
                              }))
                            }
                            className={`results-secondary-button ${draft.topped ? "results-secondary-button-active" : ""}`}
                          >
                            Top
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveQualifier(climber.id)}
                            disabled={saving || !canStaffScoreQualifier(snapshot.competition)}
                            className="results-primary-button"
                          >
                            Save score
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!qualifierClimbers.length ? (
                    <div className="results-meta-card text-slate-600">
                      No climbers match that search yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="results-card">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="results-meta-card">
                <div className="results-kicker">Finals field</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{finalists.length}</div>
                <div className="mt-2 text-sm text-slate-600">
                  {finalsProjected ? "Projected from official qualifier standings." : "Finals field is locked and ready."}
                </div>
              </div>
              <div className="results-meta-card">
                <div className="results-kicker">Scored cells</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">
                  {finalsScoredCellCount}/{finalsTotalCellCount}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  Each finalist x boulder cell can be edited from the grid below.
                </div>
              </div>
              <div className="results-meta-card">
                <div className="results-kicker">Selected cell</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {selectedFinalist && selectedCell ? `${selectedFinalist.name} / B${selectedCell.climbNumber}` : "Choose a finals cell"}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {finalsScoringOpen ? "Finals saves are live now." : finalsBlockedMessage || "Waiting for finals scoring."}
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
                  <div className="w-full" style={{ minWidth: finalsGridMinWidth }}>
                  <div
                    className="grid gap-3 border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
                    style={{ gridTemplateColumns: finalsGridTemplateColumns }}
                  >
                    <div>Finalist</div>
                    {getClimbs(snapshot.competition.finals_problem_count).map((climb) => (
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
                        <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            #{snapshot.finalists.find((entry) => entry.climber_id === climber.id)?.climbing_order ?? "-"}
                          </div>
                          <div className="mt-2 text-lg font-semibold text-slate-950">{climber.name}</div>
                          <div className="mt-1 text-sm text-slate-600">{climber.display_category}</div>
                        </div>
                        {getClimbs(snapshot.competition.finals_problem_count).map((climb) => {
                          const key = `${climber.id}:${climb.number}`;
                          const attempt = climber.final_attempts.find((entry) => entry.climb_number === climb.number);
                          const draft = finalsDrafts[key] ?? {
                            top: attempt?.top ?? false,
                            zone: attempt?.zone ?? false,
                            attemptsToTop: attempt?.attempts_to_top ?? 0,
                            attemptsToZone: attempt?.attempts_to_zone ?? 0,
                          };
                          const label = draft.top ? `Top · ${draft.attemptsToTop || 0}` : draft.zone ? `Zone · ${draft.attemptsToZone || 0}` : "Pending";
                          const active = selectedCell?.climberId === climber.id && selectedCell?.climbNumber === climb.number;
                          return (
                            <button
                              id={`finals-cell-${climber.id}-${climb.number}`}
                              key={climb.number}
                              type="button"
                              onClick={() => setSelectedCell({ climberId: climber.id, climbNumber: climb.number })}
                              className={`min-h-24 rounded-[1.2rem] border px-3 py-3 text-sm font-semibold transition ${
                                active
                                  ? "border-sky-300 bg-sky-50 text-sky-700 shadow-[0_12px_24px_rgba(14,116,144,0.12)]"
                                  : draft.top
                                    ? "border-green-200 bg-green-50 text-green-700"
                                    : draft.zone
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : "border-slate-200 bg-white text-slate-600"
                              }`}
                            >
                              <div>{label}</div>
                              <div className="mt-2 text-xs font-medium opacity-70">
                                {draft.top ? `${formatFinalPoints(25 - Math.max(0, (draft.attemptsToTop || 1) - 1) * 0.1)} pts` : draft.zone ? `${formatFinalPoints(10 - Math.max(0, (draft.attemptsToZone || 1) - 1) * 0.1)} pts` : "Tap to edit"}
                              </div>
                              {active ? (
                                <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-600">
                                  Editing now
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                </div>
                <div className="hidden xl:block xl:sticky xl:top-24">
                  <div className="results-meta-card border-sky-100 bg-sky-50/40 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                    <div className="results-kicker">Finals editor</div>
                    {selectedFinalist && selectedCell ? (
                      <>
                        <div className="mt-3 inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                          Linked to highlighted cell
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-slate-950">
                          {selectedFinalist.name} / Boulder {selectedCell.climbNumber}
                        </div>
                        <div className="mt-2 text-sm text-slate-600">
                          Edit the selected finals cell here. Zone can stand alone, and recording a top automatically keeps the zone on.
                        </div>
                        {!finalsScoringOpen ? (
                          <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                            {finalsBlockedMessage}
                          </div>
                        ) : null}
                        {(() => {
                          const key = `${selectedCell.climberId}:${selectedCell.climbNumber}`;
                          const current = finalsDrafts[key] ?? { top: false, zone: false, attemptsToTop: 0, attemptsToZone: 0 };
                          return (
                            <div className="mt-5 grid gap-3">
                              <button type="button" onClick={() => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, zone: !current.zone, top: current.top && !current.zone ? false : current.top, attemptsToZone: !current.zone ? Math.max(1, current.attemptsToZone) : current.attemptsToZone } }))} className={`results-secondary-button w-full ${current.zone ? "results-secondary-button-active" : ""}`}>
                                {current.zone ? "Zone recorded" : "Record zone"}
                              </button>
                              <button type="button" onClick={() => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, top: !current.top, zone: !current.top ? true : current.zone, attemptsToTop: !current.top ? Math.max(1, current.attemptsToTop) : current.attemptsToTop, attemptsToZone: !current.top ? Math.max(1, current.attemptsToZone) : current.attemptsToZone } }))} className={`results-secondary-button w-full ${current.top ? "results-secondary-button-active" : ""}`}>
                                {current.top ? "Top recorded" : "Record top"}
                              </button>
                              <input type="number" min={0} value={current.attemptsToZone} onChange={(event) => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, attemptsToZone: Number(event.target.value) || 0 } }))} className="results-input" placeholder="Attempts to zone" />
                              <input type="number" min={0} value={current.attemptsToTop} onChange={(event) => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, attemptsToTop: Number(event.target.value) || 0 } }))} className="results-input" placeholder="Attempts to top" />
                              <div className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                                Live points: {formatFinalPoints((current.top ? 25 - Math.max(0, current.attemptsToTop - 1) * 0.1 : current.zone ? 10 - Math.max(0, current.attemptsToZone - 1) * 0.1 : 0))}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={clearFinalsCell} className="results-secondary-button">
                                  Clear
                                </button>
                                <button type="button" onClick={() => void saveFinals()} disabled={saving || !finalsScoringOpen} className="results-primary-button flex-1">
                                  Save finals cell
                                </button>
                              </div>
                            </div>
                          );
                        })()}
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
                  {!finalsScoringOpen ? (
                    <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      {finalsBlockedMessage}
                    </div>
                  ) : null}
                  {(() => {
                    const key = `${selectedCell.climberId}:${selectedCell.climbNumber}`;
                    const current = finalsDrafts[key] ?? { top: false, zone: false, attemptsToTop: 0, attemptsToZone: 0 };
                    return (
                      <div className="mt-5 grid gap-3">
                        <button type="button" onClick={() => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, zone: !current.zone, top: current.top && !current.zone ? false : current.top, attemptsToZone: !current.zone ? Math.max(1, current.attemptsToZone) : current.attemptsToZone } }))} className={`results-secondary-button w-full ${current.zone ? "results-secondary-button-active" : ""}`}>
                          {current.zone ? "Zone recorded" : "Record zone"}
                        </button>
                        <button type="button" onClick={() => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, top: !current.top, zone: !current.top ? true : current.zone, attemptsToTop: !current.top ? Math.max(1, current.attemptsToTop) : current.attemptsToTop, attemptsToZone: !current.top ? Math.max(1, current.attemptsToZone) : current.attemptsToZone } }))} className={`results-secondary-button w-full ${current.top ? "results-secondary-button-active" : ""}`}>
                          {current.top ? "Top recorded" : "Record top"}
                        </button>
                        <input type="number" min={0} value={current.attemptsToZone} onChange={(event) => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, attemptsToZone: Number(event.target.value) || 0 } }))} className="results-input" placeholder="Attempts to zone" />
                        <input type="number" min={0} value={current.attemptsToTop} onChange={(event) => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, attemptsToTop: Number(event.target.value) || 0 } }))} className="results-input" placeholder="Attempts to top" />
                        <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          Live points: {formatFinalPoints((current.top ? 25 - Math.max(0, current.attemptsToTop - 1) * 0.1 : current.zone ? 10 - Math.max(0, current.attemptsToZone - 1) * 0.1 : 0))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={clearFinalsCell} className="results-secondary-button">
                            Clear
                          </button>
                          <button type="button" onClick={() => void saveFinals()} disabled={saving || !finalsScoringOpen} className="results-primary-button flex-1">
                            Save finals cell
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
