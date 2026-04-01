"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import {
  getClimberWithAttempts,
  getCompetitionSnapshot,
  updateFinalAttempt,
  updateQualifierAttemptByStaff,
  type CompetitionSnapshot,
} from "@/lib/db";
import { getAuthState, isStaffRole } from "@/lib/auth";
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

export default function StaffJudgePage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const initialStage = searchParams.get("stage") === "finals" ? "finals" : "qualifier";
  const initialClimberId = searchParams.get("climberId") ?? "";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
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

  useEffect(() => {
    setLoading(true);
    void Promise.all([getCompetitionSnapshot(slug), getAuthState()])
      .then(([nextSnapshot, authState]) => {
        if (!isStaffRole(authState.profile?.role)) {
          window.location.href = `/staff/login?redirect=${encodeURIComponent(`/staff/c/${slug}/judge`)}`;
          return;
        }

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
    const onOnline = () => {
      syncQueuedCount();
      void flushOfflineQueue();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

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

  const flushOfflineQueue = async () => {
    const queue = readOfflineQueue();
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
  };

  const saveQualifier = async (climberId: string) => {
    if (!snapshot || !canStaffScoreQualifier(snapshot.competition)) {
      return;
    }

    const key = `${climberId}:${selectedBoulder}`;
    const draft = qualifierDrafts[key] ?? { attemptCount: 0, topped: false };
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateQualifierAttemptByStaff(snapshot.competition.id, climberId, selectedBoulder, draft.attemptCount, draft.topped);
      await updateClimberInSnapshot(climberId, (nextClimbers) => ({
        ...snapshot,
        climbers: nextClimbers,
        qualifierLeaderboard: buildQualifierLeaderboard(nextClimbers, snapshot.competition),
      }));
      setMessage(`Saved qualifier score for boulder ${selectedBoulder}.`);
    } catch (nextError) {
      enqueueOfflineItem({
        id: `qualifier-${climberId}-${selectedBoulder}`,
        type: "qualifier",
        competitionId: snapshot.competition.id,
        climberId,
        climbNumber: selectedBoulder,
        attemptCount: draft.attemptCount,
        topped: draft.topped,
        createdAt: new Date().toISOString(),
      });
      setQueuedCount(readOfflineQueue().length);
      setError(nextError instanceof Error ? `${nextError.message} Score queued and will retry when connection returns.` : "Unable to save qualifier score. Score queued for retry.");
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
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await updateFinalAttempt(
        snapshot.competition.id,
        selectedCell.climberId,
        selectedCell.climbNumber,
        draft.top,
        draft.zone,
        draft.top ? draft.attemptsToTop : null,
        draft.zone ? draft.attemptsToZone : null
      );
      await updateClimberInSnapshot(selectedCell.climberId, (nextClimbers) => ({
        ...snapshot,
        climbers: nextClimbers,
        finalsLeaderboard: buildFinalsLeaderboard(nextClimbers, snapshot.finalists, snapshot.competition),
      }));
      setMessage(`Saved finals score for boulder ${selectedCell.climbNumber}.`);
    } catch (nextError) {
      enqueueOfflineItem({
        id: `finals-${selectedCell.climberId}-${selectedCell.climbNumber}`,
        type: "finals",
        competitionId: snapshot.competition.id,
        climberId: selectedCell.climberId,
        climbNumber: selectedCell.climbNumber,
        top: draft.top,
        zone: draft.zone,
        attemptsToTop: draft.top ? draft.attemptsToTop : null,
        attemptsToZone: draft.zone ? draft.attemptsToZone : null,
        createdAt: new Date().toISOString(),
      });
      setQueuedCount(readOfflineQueue().length);
      setError(nextError instanceof Error ? `${nextError.message} Score queued and will retry when connection returns.` : "Unable to save finals score. Score queued for retry.");
    } finally {
      setSaving(false);
    }
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
          competitionSlug={slug}
          status={<div className="results-chip">Judge panel</div>}
        />

        {message ? <div className="results-alert results-alert-success">{message}</div> : null}
        {error ? <div className="results-alert results-alert-error">{error}</div> : null}

        <section className="results-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="results-kicker">Staff scoring</div>
              <h1 className="mt-2 text-4xl font-semibold text-slate-950">{snapshot.competition.name}</h1>
              <div className="mt-3 text-sm text-slate-600">Current phase: {formatCompetitionPhaseLabel(snapshot.competition.current_phase)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setStage("qualifier")} className={`results-secondary-button ${stage === "qualifier" ? "results-secondary-button-active" : ""}`}>Qualifier</button>
              <button type="button" onClick={() => setStage("finals")} className={`results-secondary-button ${stage === "finals" ? "results-secondary-button-active" : ""}`}>Finals</button>
            </div>
          </div>
          {queuedCount > 0 ? (
            <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {queuedCount} score {queuedCount === 1 ? "is" : "are"} queued locally. They will retry automatically when the network returns.
            </div>
          ) : null}
        </section>

        {stage === "qualifier" ? (
          <section className="results-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="results-input max-w-xl" placeholder="Filter climbers by name, number, or category" />
              <div className="flex flex-wrap gap-2">
                {getClimbs(snapshot.competition.total_climbs).map((climb) => (
                  <button key={climb.number} type="button" onClick={() => setSelectedBoulder(climb.number)} className={`results-secondary-button ${selectedBoulder === climb.number ? "results-secondary-button-active" : ""}`}>
                    B{String(climb.number).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {qualifierClimbers.map((climber) => {
                const key = `${climber.id}:${selectedBoulder}`;
                const draft = qualifierDrafts[key] ?? { attemptCount: 0, topped: false };
                return (
                  <div key={climber.id} className="results-admin-list-item">
                    <div>
                      <div className="text-lg font-semibold text-slate-950">{climber.name}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        #{climber.climber_number} | {climber.display_category}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[7rem_auto_auto]">
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
                      <button type="button" onClick={() => setQualifierDrafts((current) => ({ ...current, [key]: { ...draft, topped: !draft.topped } }))} className={`results-secondary-button ${draft.topped ? "results-secondary-button-active" : ""}`}>
                        {draft.topped ? "Top" : "No top"}
                      </button>
                      <button type="button" onClick={() => void saveQualifier(climber.id)} disabled={saving || !canStaffScoreQualifier(snapshot.competition)} className="results-primary-button">
                        Save
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="results-card">
            <div className="overflow-x-auto">
              <div className="min-w-[780px] space-y-3">
                {finalists.map((climber) => {
                  const results = getClimbs(snapshot.competition.finals_problem_count).map((climb) => {
                    const key = `${climber.id}:${climb.number}`;
                    const attempt = climber.final_attempts.find((entry) => entry.climb_number === climb.number);
                    const draft = finalsDrafts[key] ?? {
                      top: attempt?.top ?? false,
                      zone: attempt?.zone ?? false,
                      attemptsToTop: attempt?.attempts_to_top ?? 0,
                      attemptsToZone: attempt?.attempts_to_zone ?? 0,
                    };
                    const label = draft.top ? `T${draft.attemptsToTop}` : draft.zone ? `Z${draft.attemptsToZone}` : "--";
                    return { climbNumber: climb.number, label };
                  });

                  return (
                    <div key={climber.id} className="results-admin-list-item">
                      <div>
                        <div className="text-lg font-semibold text-slate-950">{climber.name}</div>
                        <div className="mt-1 text-sm text-slate-600">{climber.display_category}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {results.map((problem) => (
                          <button
                            key={problem.climbNumber}
                            type="button"
                            onClick={() => setSelectedCell({ climberId: climber.id, climbNumber: problem.climbNumber })}
                            className={`results-secondary-button ${selectedCell?.climberId === climber.id && selectedCell?.climbNumber === problem.climbNumber ? "results-secondary-button-active" : ""}`}
                          >
                            B{problem.climbNumber}: {problem.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedFinalist && selectedCell ? (
              <div className="results-meta-card mt-5">
                <div className="results-kicker">Edit finals cell</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">
                  {selectedFinalist.name} · Boulder {selectedCell.climbNumber}
                </div>
                {(() => {
                  const key = `${selectedCell.climberId}:${selectedCell.climbNumber}`;
                  const current = finalsDrafts[key] ?? { top: false, zone: false, attemptsToTop: 0, attemptsToZone: 0 };
                  return (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <button type="button" onClick={() => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, zone: !current.zone, top: current.top && !current.zone ? false : current.top } }))} className={`results-secondary-button ${current.zone ? "results-secondary-button-active" : ""}`}>
                        {current.zone ? "Zone recorded" : "Record zone"}
                      </button>
                      <button type="button" onClick={() => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, top: !current.top, zone: !current.top ? true : current.zone } }))} className={`results-secondary-button ${current.top ? "results-secondary-button-active" : ""}`}>
                        {current.top ? "Top recorded" : "Record top"}
                      </button>
                      <input type="number" min={0} value={current.attemptsToZone} onChange={(event) => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, attemptsToZone: Number(event.target.value) || 0 } }))} className="results-input" placeholder="Attempts to zone" />
                      <input type="number" min={0} value={current.attemptsToTop} onChange={(event) => setFinalsDrafts((state) => ({ ...state, [key]: { ...current, attemptsToTop: Number(event.target.value) || 0 } }))} className="results-input" placeholder="Attempts to top" />
                      <div className="sm:col-span-2 flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-600">Live points: {formatFinalPoints((current.top ? 25 - Math.max(0, current.attemptsToTop - 1) * 0.1 : current.zone ? 10 - Math.max(0, current.attemptsToZone - 1) * 0.1 : 0))}</div>
                        <button type="button" onClick={() => void saveFinals()} disabled={saving || !canStaffScoreFinals(snapshot.competition)} className="results-primary-button">
                          Save finals cell
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
