"use client";

import { Suspense, useCallback, useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import {
  getClimberByAccessToken,
  getCompetitionSnapshot,
  joinLiveBoulderQueue,
  leaveLiveBoulderQueue,
  updateQualifierAttemptByToken,
  type CompetitionSnapshot,
} from "@/lib/db";
import { saveScorecardAccessToken } from "@/lib/scorecard-access";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";
import {
  buildCompetitionPath,
  canClimberSelfScoreQualifier,
  canUseLiveBoulderQueue,
  formatCompetitionPhaseLabel,
  formatFinalPoints,
  formatTimeRange,
  getClimbs,
  getActiveQueueSessionBlock,
  getTimeSlotLabel,
  type ClimberWithAttempts,
} from "@/lib/scoring";

type DraftState = Record<number, { attemptCount: number; topped: boolean }>;

type DraftAction =
  | { type: "initialize"; climber: ClimberWithAttempts | null; totalClimbs: number }
  | { type: "update"; climbNumber: number; patch: Partial<{ attemptCount: number; topped: boolean }> };

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "initialize": {
      if (!action.climber) {
        return {};
      }

      const next: DraftState = {};
      getClimbs(action.totalClimbs).forEach((climb) => {
        const attempt = action.climber?.qualifier_attempts.find((entry) => entry.climb_number === climb.number);
        next[climb.number] = {
          attemptCount: attempt?.attempt_count ?? 0,
          topped: attempt?.topped ?? false,
        };
      });
      return next;
    }
    case "update":
      return {
        ...state,
        [action.climbNumber]: {
          ...(state[action.climbNumber] ?? { attemptCount: 0, topped: false }),
          ...action.patch,
        },
      };
    default:
      return state;
  }
}

function formatCrowdStatus(count: number) {
  if (count <= 0) {
    return "Open wall";
  }

  if (count === 1) {
    return "Light traffic";
  }

  if (count <= 3) {
    return "Busy";
  }

  return "Crowded";
}

function ScorecardContent() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const token = searchParams?.get("token") ?? "";
  const legacyClimberId = searchParams?.get("id") ?? "";
  const stage = searchParams?.get("stage") === "finals" ? "finals" : "qualifier";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [climber, setClimber] = useState<ClimberWithAttempts | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [queueSaving, setQueueSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, dispatch] = useReducer(draftReducer, {});

  const refreshScorecard = useCallback(async (resetDrafts = false) => {
    if (!token) {
      return;
    }

    const [nextSnapshot, nextClimberLookup] = await Promise.all([
      getCompetitionSnapshot(slug),
      getClimberByAccessToken(token),
    ]);

    setSnapshot(nextSnapshot);
    setClimber(nextClimberLookup?.climber ?? null);
    if (resetDrafts) {
      dispatch({
        type: "initialize",
        climber: nextClimberLookup?.climber ?? null,
        totalClimbs: nextSnapshot.competition.total_climbs,
      });
    }
  }, [slug, token]);

  useEffect(() => {
    if (token) {
      saveScorecardAccessToken(token, slug);
      return;
    }

    const query = legacyClimberId ? `?climberId=${legacyClimberId}&stage=${stage}` : stage === "finals" ? "?stage=finals" : "";
    router.replace(`/staff/c/${slug}/judge${query}`);
  }, [legacyClimberId, router, slug, stage, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);
    void refreshScorecard(true)
      .then(() => {
        setError("");
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Unable to load the scorecard.");
      })
      .finally(() => setLoading(false));
  }, [refreshScorecard, token]);

  useEffect(() => {
    if (!supabaseConfigured || !snapshot) {
      return;
    }

    const competitionId = snapshot.competition.id;
    const channel = publicSupabase
      .channel(`scorecard-${competitionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "competitions", filter: `id=eq.${competitionId}` }, () => {
        void refreshScorecard().catch(() => undefined);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_schedule_blocks", filter: `competition_id=eq.${competitionId}` }, () => {
        void refreshScorecard().catch(() => undefined);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_boulder_queue", filter: `competition_id=eq.${competitionId}` }, () => {
        void refreshScorecard().catch(() => undefined);
      })
      .subscribe();

    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, [refreshScorecard, snapshot]);

  const qualifierEntry = useMemo(
    () => snapshot?.qualifierLeaderboard.find((entry) => entry.climber_id === climber?.id) ?? null,
    [climber?.id, snapshot]
  );
  const finalsEntry = useMemo(
    () => snapshot?.finalsLeaderboard.find((entry) => entry.climber_id === climber?.id) ?? null,
    [climber?.id, snapshot]
  );
  const qualifierOpen = snapshot ? canClimberSelfScoreQualifier(snapshot.competition) : false;
  const activeQueueSession = useMemo(
    () => (snapshot ? getActiveQueueSessionBlock(snapshot.competition) : null),
    [snapshot]
  );
  const queueOpen = snapshot ? canUseLiveBoulderQueue(snapshot.competition) : false;
  const currentQueueEntry = useMemo(
    () => snapshot?.boulderQueue.find((entry) => entry.climber_id === climber?.id) ?? null,
    [climber?.id, snapshot]
  );
  const queueSessionMismatch =
    Boolean(queueOpen && climber?.time_slot_id && activeQueueSession?.id && climber.time_slot_id !== activeQueueSession.id);
  const qualifierClimbScores = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return (
      qualifierEntry?.all_climbs ??
      getClimbs(snapshot.competition.total_climbs).map((climb) => ({
        climb_number: climb.number,
        zone: false,
        topped: false,
        attempt_count: 0,
        extra_attempts: 0,
        attempts_to_top: null,
        attempts_to_zone: null,
        base_points: climb.base_points,
        score: 0,
        counting: false,
      }))
    );
  }, [qualifierEntry?.all_climbs, snapshot]);
  const queueByClimb = useMemo(() => {
    const grouped = new Map<number, CompetitionSnapshot["boulderQueue"]>();
    snapshot?.boulderQueue.forEach((entry) => {
      const next = grouped.get(entry.climb_number) ?? [];
      next.push(entry);
      grouped.set(entry.climb_number, next);
    });
    return grouped;
  }, [snapshot]);

  const saveQualifier = async (climbNumber: number) => {
    if (!snapshot) {
      return;
    }

    const draft = drafts[climbNumber] ?? { attemptCount: 0, topped: false };
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await updateQualifierAttemptByToken(token, snapshot.competition.id, climbNumber, draft.attemptCount, draft.topped);

      if (currentQueueEntry) {
        try {
          await leaveLiveBoulderQueue(token, snapshot.competition.id);
        } catch {
          // Keep the score save successful even if queue cleanup misses a beat.
        }
      }

      await refreshScorecard();
      setMessage(
        currentQueueEntry
          ? `Saved boulder ${climbNumber} and cleared your live queue check-in.`
          : `Saved boulder ${climbNumber}.`
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save qualifier score.");
    } finally {
      setSaving(false);
    }
  };

  const checkIntoQueue = async (climbNumber: number) => {
    if (!snapshot) {
      return;
    }

    setQueueSaving(true);
    setError("");
    setMessage("");

    try {
      await joinLiveBoulderQueue(token, snapshot.competition.id, climbNumber);
      await refreshScorecard();
      setMessage(`Joined the live queue for boulder ${climbNumber}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to join the live boulder queue.");
    } finally {
      setQueueSaving(false);
    }
  };

  const leaveQueue = async () => {
    if (!snapshot) {
      return;
    }

    setQueueSaving(true);
    setError("");
    setMessage("");

    try {
      await leaveLiveBoulderQueue(token, snapshot.competition.id);
      await refreshScorecard();
      setMessage("You left the live boulder queue.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to leave the live boulder queue.");
    } finally {
      setQueueSaving(false);
    }
  };

  if (!token) {
    return (
      <main className="results-page">
        <div className="content-frame">
          <section className="results-card text-slate-600">Redirecting staff scoring to the judge panel...</section>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="results-page">
        <div className="content-frame space-y-6">
          <SiteHeader light competitionSlug={slug} />
          <section className="results-card">
            <div className="skeleton-block h-8 w-40" />
            <div className="skeleton-block mt-4 h-20 w-full" />
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="skeleton-block h-40 w-full" />
              <div className="skeleton-block h-40 w-full" />
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!snapshot || !climber) {
    return (
      <main className="results-page">
        <div className="content-frame space-y-6">
          <SiteHeader light competitionSlug={slug} />
          <section className="results-card text-slate-600">
            {error || "This private scorecard link is not valid anymore."}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light competitionSlug={slug} />

        {message ? <div className="results-alert results-alert-success">{message}</div> : null}
        {error ? <div className="results-alert results-alert-error">{error}</div> : null}

        <section className="results-card">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="results-kicker">Climber #{climber.climber_number}</div>
              <h1 className="mt-2 text-4xl font-semibold text-slate-950 sm:text-5xl">{climber.name}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="results-chip">{climber.display_category}</span>
                <span className="results-chip">{climber.province}</span>
                <span className="results-chip">Private scorecard</span>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href={`${buildCompetitionPath(slug, "scorecard")}?token=${token}`} className={`results-secondary-button w-full sm:w-auto ${stage === "qualifier" ? "results-secondary-button-active" : ""}`}>Qualifier</Link>
                <Link href={`${buildCompetitionPath(slug, "scorecard")}?token=${token}&stage=finals`} className={`results-secondary-button w-full sm:w-auto ${stage === "finals" ? "results-secondary-button-active" : ""}`}>Finals</Link>
              </div>
            </div>

            <div className="results-meta-card">
              <div className="results-kicker">Competition phase</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{formatCompetitionPhaseLabel(snapshot.competition.current_phase)}</div>
              {stage === "qualifier" ? (
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  {qualifierEntry
                    ? (
                      <>
                        <div>{`Overall #${qualifierEntry.overall_rank} | Category #${qualifierEntry.category_rank}`}</div>
                        <div className="font-medium text-slate-950">
                          {Number.isInteger(qualifierEntry.total_score)
                            ? `${qualifierEntry.total_score.toLocaleString()} total points`
                            : `${formatFinalPoints(qualifierEntry.total_score)} total points`}
                        </div>
                      </>
                    )
                    : "No qualifier score recorded yet."}
                </div>
              ) : (
                <div className="mt-4 text-sm text-slate-600">
                  {finalsEntry
                    ? `Overall #${finalsEntry.overall_rank} | Category #${finalsEntry.category_rank}`
                    : "Finals scores will appear here once the round begins."}
                </div>
              )}
            </div>
          </div>
        </section>

        {stage === "qualifier" ? (
          <section className="results-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="results-kicker">Qualifier scorecard</div>
                <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                  {qualifierOpen ? "Record your attempts" : "Read-only qualifier scorecard"}
                </h2>
              </div>
              <div className="results-chip">{qualifierOpen ? "Scoring open" : "Scoring closed"}</div>
            </div>

            {snapshot.competition.format === "scramble" ? (
              <div className="mt-5 space-y-4">
                <div className="results-meta-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="results-kicker">Live boulder guide</div>
                      <div className="mt-2 text-xl font-semibold text-slate-950">
                        {activeQueueSession ? activeQueueSession.label : "Guide waiting for a live session"}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        {activeQueueSession
                          ? `${formatTimeRange(activeQueueSession.start_time, activeQueueSession.end_time)} · One live check-in at a time per climber so the wall can see where traffic is building.`
                          : "Staff needs to mark your scramble session live before climbers can use the boulder guide."}
                      </div>
                    </div>
                    {currentQueueEntry ? (
                      <div className="results-chip results-chip-live">
                        Checked in on Boulder {currentQueueEntry.climb_number}
                      </div>
                    ) : null}
                  </div>

                  {currentQueueEntry ? (
                    <div className="mt-4 rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
                      {(() => {
                        const activeEntries = queueByClimb.get(currentQueueEntry.climb_number) ?? [];
                        const othersHere = Math.max(0, activeEntries.length - 1);
                        return othersHere > 0
                          ? `You are checked in on Boulder ${currentQueueEntry.climb_number} with ${othersHere} other ${othersHere === 1 ? "climber" : "climbers"} currently there.`
                          : `You are checked in on Boulder ${currentQueueEntry.climb_number}. Right now it looks open around that wall.`;
                      })()}
                    </div>
                  ) : null}

                  {queueSessionMismatch ? (
                    <div className="results-alert results-alert-error mt-4">
                      The live queue is currently running for {activeQueueSession?.label}. Your assigned session is{" "}
                      {getTimeSlotLabel(climber.time_slot_id, snapshot.competition)}.
                    </div>
                  ) : queueOpen ? (
                    <div className="results-alert results-alert-success mt-4">
                      Tap the boulder you are walking to now. This is a soft crowd guide, not a strict turn-order system. Saving an attempt clears your check-in automatically, and stale check-ins fall away after a few minutes.
                    </div>
                  ) : null}

                  {snapshot.boulderQueue.length ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {Array.from(queueByClimb.entries())
                        .sort(([left], [right]) => left - right)
                        .map(([climbNumber, entries]) => (
                          <div key={climbNumber} className="rounded-[1.2rem] border border-slate-200 bg-white/80 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold text-slate-950">Boulder {climbNumber}</span>
                              <span className="results-chip">{formatCrowdStatus(entries.length)}</span>
                            </div>
                            <div className="mt-3 space-y-2 text-sm text-slate-600">
                              <div>{entries.length} {entries.length === 1 ? "climber checked in" : "climbers checked in"}</div>
                              {entries.slice(0, 3).map((entry) => (
                                <div key={entry.climber_id} className="flex items-center justify-between gap-3">
                                  <span className="truncate">
                                    {entry.climber_name}
                                  </span>
                                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    #{entry.climber_number}
                                  </span>
                                </div>
                              ))}
                              {entries.length > 3 ? (
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                  +{entries.length - 3} more waiting
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : activeQueueSession ? (
                    <div className="mt-4 text-sm text-slate-600">
                      No climbers are checked into a boulder yet for this live session.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!qualifierOpen ? (
              <div className="results-meta-card mt-5 text-slate-600">
                Private self-scoring is currently closed. Your saved score for each boulder remains visible here in read-only mode.
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {qualifierOpen
                ? getClimbs(snapshot.competition.total_climbs).map((climb) => {
                    const draft = drafts[climb.number] ?? { attemptCount: 0, topped: false };
                    const queueEntries = queueByClimb.get(climb.number) ?? [];
                    const queuedHere = currentQueueEntry?.climb_number === climb.number;
                    const otherClimbersHere = queueEntries.filter((entry) => entry.climber_id !== climber.id).length;
                    return (
                      <div key={climb.number} className="results-meta-card">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="results-kicker">Boulder {String(climb.number).padStart(2, "0")}</div>
                            <div className="mt-2 text-xl font-semibold text-slate-950">{climb.base_points} base points</div>
                          </div>
                          <button type="button" onClick={() => void saveQualifier(climb.number)} disabled={saving || !qualifierOpen} className="results-primary-button">
                            Save
                          </button>
                        </div>
                        {snapshot.competition.format === "scramble" ? (
                          <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-slate-950">Live boulder guide</div>
                              <div className="results-chip">{formatCrowdStatus(queueEntries.length)}</div>
                            </div>
                            <div className="mt-2 text-sm text-slate-600">
                              {queuedHere
                                ? otherClimbersHere > 0
                                  ? `You are checked in here with ${otherClimbersHere} other ${otherClimbersHere === 1 ? "climber" : "climbers"} currently around this boulder.`
                                  : "You are checked in here. Right now the wall looks clear."
                                : queueEntries.length
                                  ? `${queueEntries.length} ${queueEntries.length === 1 ? "climber is" : "climbers are"} checked in around this boulder right now.`
                                  : "No one is checked in for this boulder right now."}
                            </div>
                            {queueEntries.length ? (
                              <div className="mt-3 space-y-2 text-sm text-slate-600">
                                {queueEntries.slice(0, 4).map((entry) => (
                                  <div key={entry.climber_id} className="flex items-center justify-between gap-3">
                                    <span className={entry.climber_id === climber.id ? "font-semibold text-slate-950" : ""}>
                                      {entry.climber_name}
                                    </span>
                                    <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                      #{entry.climber_number}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {queueOpen && !queueSessionMismatch ? (
                              <div className="mt-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    queuedHere ? void leaveQueue() : void checkIntoQueue(climb.number)
                                  }
                                  disabled={queueSaving}
                                  className={`w-full ${queuedHere ? "results-secondary-button results-secondary-button-active" : "results-secondary-button"}`}
                                >
                                  {queuedHere ? "Clear my check-in" : currentQueueEntry ? "Move check-in here" : "Check in here"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-sm font-medium text-slate-700">Attempts</span>
                            <input type="number" min={0} value={draft.attemptCount} onChange={(event) => dispatch({ type: "update", climbNumber: climb.number, patch: { attemptCount: Number(event.target.value) || 0 } })} className="results-input" />
                          </label>
                          <label className="space-y-2">
                            <span className="text-sm font-medium text-slate-700">Top recorded</span>
                            <button type="button" onClick={() => dispatch({ type: "update", climbNumber: climb.number, patch: { topped: !draft.topped } })} className={`results-secondary-button ${draft.topped ? "results-secondary-button-active" : ""}`}>
                              {draft.topped ? "Top" : "Not topped"}
                            </button>
                          </label>
                        </div>
                      </div>
                    );
                  })
                : qualifierClimbScores.map((climb) => (
                    <div key={climb.climb_number} className="results-meta-card">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="results-kicker">Boulder {String(climb.climb_number).padStart(2, "0")}</div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            {Number.isInteger(climb.score) ? climb.score.toLocaleString() : formatFinalPoints(climb.score)} points
                          </div>
                        </div>
                        {climb.counting ? <div className="results-chip">Counting score</div> : null}
                      </div>
                      <div className="mt-3 text-sm text-slate-600">
                        {climb.topped
                          ? `Top in ${climb.attempt_count} ${climb.attempt_count === 1 ? "try" : "tries"}`
                          : climb.attempt_count > 0
                            ? `${climb.attempt_count} attempts logged, no top recorded`
                            : "No score recorded"}
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        Base value: {climb.base_points.toLocaleString()}
                      </div>
                    </div>
                  ))}
            </div>
          </section>
        ) : (
          <section className="results-card">
            <div className="results-kicker">Finals</div>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">Read-only finals scorecard</h2>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {snapshot.finalsLeaderboard.find((entry) => entry.climber_id === climber.id)?.problem_results.map((problem) => (
                <div key={problem.climb_number} className="results-meta-card">
                  <div className="results-kicker">Boulder {String(problem.climb_number).padStart(2, "0")}</div>
                  <div className="mt-2 text-xl font-semibold text-slate-950">{formatFinalPoints(problem.points)} points</div>
                  <div className="mt-3 text-sm text-slate-600">
                    {problem.top ? `Top in ${problem.attempts_to_top} tries` : problem.zone ? `Zone in ${problem.attempts_to_zone} tries` : "No score recorded"}
                  </div>
                </div>
              )) ?? (
                <div className="results-meta-card text-slate-600">Finals scores will appear here once staff starts recording them.</div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function CompetitionScorecardPage() {
  return (
    <Suspense fallback={<main className="results-page"><div className="content-frame"><section className="results-card text-slate-600">Loading scorecard...</section></div></main>}>
      <ScorecardContent />
    </Suspense>
  );
}
