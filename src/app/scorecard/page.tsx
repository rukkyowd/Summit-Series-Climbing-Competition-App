"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import { getAuthState, isStaffRole, signInWithRole, signOutUser, type Profile } from "@/lib/auth";
import {
  getClimberByAccessToken,
  getClimberById,
  getCompetitionSnapshot,
  searchClimbers,
  updateFinalAttempt,
  updateQualifierAttemptByStaff,
  updateQualifierAttemptByToken,
  type CompetitionSnapshot,
} from "@/lib/db";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";
import { saveScorecardAccessToken } from "@/lib/scorecard-access";
import {
  buildFinalProblemResults,
  canClimberSelfScoreQualifier,
  canStaffScoreFinals,
  canStaffScoreQualifier,
  calculateFinalAttemptPoints,
  formatSchedulePhaseLabel,
  formatFinalPoints,
  formatSupportsFinals,
  getActiveScheduleBlock,
  getEventWorkflowGuide,
  getClimbs,
  getTimeSlotLabel,
  isFinalsEligibleCategory,
  type ClimberWithAttempts,
} from "@/lib/scoring";

type QualifierDraft = { attemptCount: number; topped: boolean };
type FinalsDraft = { top: boolean; zone: boolean; attemptsToTop: number; attemptsToZone: number };

function ScorecardContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const climberId = searchParams.get("id") ?? "";
  const stage = searchParams.get("stage") === "finals" ? "finals" : "qualifier";

  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [climber, setClimber] = useState<ClimberWithAttempts | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lookup, setLookup] = useState("");
  const [results, setResults] = useState<ClimberWithAttempts[]>([]);
  const [qualifierDrafts, setQualifierDrafts] = useState<Record<number, QualifierDraft>>({});
  const [finalsDrafts, setFinalsDrafts] = useState<Record<number, FinalsDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");
  const [message, setMessage] = useState("");

  const canJudge = isStaffRole(profile?.role);

  useEffect(() => {
    if (token) {
      saveScorecardAccessToken(token);
    }
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const nextSnapshot = await getCompetitionSnapshot();
      setSnapshot(nextSnapshot);

      let selected: ClimberWithAttempts | null = null;
      if (token) {
        selected = (await getClimberByAccessToken(token))?.climber ?? null;
      } else if (climberId) {
        selected = (await getClimberById(climberId))?.climber ?? null;
      }

      setClimber(selected);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load the scorecard.");
    } finally {
      setLoading(false);
    }
  }, [climberId, token]);

  useEffect(() => {
    void load();
    getAuthState()
      .then((state) => setProfile(state.profile))
      .catch((nextError) => {
        setAuthError(nextError instanceof Error ? nextError.message : "Unable to read the staff session.");
      })
      .finally(() => setAuthLoading(false));
  }, [load]);

  useEffect(() => {
    if (!supabaseConfigured) {
      return;
    }

    const channel = publicSupabase
      .channel("scorecard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "climbers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "qualifier_attempts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "final_attempts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_finalists" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "active_event_config" }, load)
      .subscribe();

    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!climber || !snapshot) {
      setQualifierDrafts({});
      setFinalsDrafts({});
      return;
    }

    const nextQualifier: Record<number, QualifierDraft> = {};
    const nextFinals: Record<number, FinalsDraft> = {};

    getClimbs(snapshot.event.total_climbs).forEach((climb) => {
      const qualifierAttempt = climber.qualifier_attempts.find((attempt) => attempt.climb_number === climb.number);

      nextQualifier[climb.number] = {
        attemptCount: qualifierAttempt?.attempt_count ?? 0,
        topped: qualifierAttempt?.topped ?? false,
      };
    });

    getClimbs(snapshot.event.finals_problem_count).forEach((climb) => {
      const finalsAttempt = climber.final_attempts.find((attempt) => attempt.climb_number === climb.number);

      nextFinals[climb.number] = {
        top: finalsAttempt?.top ?? false,
        zone: finalsAttempt?.zone ?? false,
        attemptsToTop: finalsAttempt?.attempts_to_top ?? 0,
        attemptsToZone: finalsAttempt?.attempts_to_zone ?? 0,
      };
    });

    setQualifierDrafts(nextQualifier);
    setFinalsDrafts(nextFinals);
  }, [climber, snapshot]);

  const climberEntry = useMemo(() => {
    if (!snapshot || !climber) {
      return null;
    }

    return snapshot.qualifierLeaderboard.find((entry) => entry.climber_id === climber.id) ?? null;
  }, [climber, snapshot]);

  const finalists = useMemo(() => {
    if (!snapshot) {
      return new Set<string>();
    }

    return new Set(snapshot.finalists.map((entry) => entry.climber_id));
  }, [snapshot]);

  const finalsEntry = useMemo(() => {
    if (!snapshot || !climber) {
      return null;
    }

    return snapshot.finalsLeaderboard.find((entry) => entry.climber_id === climber.id) ?? null;
  }, [climber, snapshot]);

  const finalsEligible = climber
    ? snapshot
      ? isFinalsEligibleCategory(snapshot.event, climber.gender_division, climber.age_group)
      : false
    : false;
  const qualifierLocked = snapshot?.event.stage_mode === "finals";
  const activeScheduleBlock = useMemo(
    () => (snapshot ? getActiveScheduleBlock(snapshot.event) : null),
    [snapshot]
  );
  const qualifierSelfScoringOpen = snapshot ? canClimberSelfScoreQualifier(snapshot.event) : false;
  const qualifierStaffScoringOpen = snapshot ? canStaffScoreQualifier(snapshot.event) : false;
  const finalsStaffScoringOpen = snapshot ? canStaffScoreFinals(snapshot.event) : false;
  const workflowGuide = useMemo(
    () => (snapshot ? getEventWorkflowGuide(snapshot.event) : null),
    [snapshot]
  );
  const liveFinalProblemResults = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return buildFinalProblemResults(
      Object.entries(finalsDrafts).map(([climbNumber, draft]) => ({
        event_id: snapshot.event.id,
        climber_id: climber?.id ?? "",
        climb_number: Number(climbNumber),
        top: draft.top,
        zone: draft.zone,
        attempts_to_top: draft.top ? draft.attemptsToTop : null,
        attempts_to_zone: draft.zone ? draft.attemptsToZone : null,
        entered_by: "staff" as const,
      })),
      snapshot.event.finals_problem_count
    );
  }, [climber?.id, finalsDrafts, snapshot]);
  const liveFinalTotalPoints = useMemo(() => {
    return liveFinalProblemResults.reduce((sum, problem) => sum + problem.points, 0);
  }, [liveFinalProblemResults]);

  const runLookup = async (query: string) => {
    try {
      const next = await searchClimbers(query);
      setResults(next);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to search climbers.");
    }
  };

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const state = await signInWithRole(email, password);
      setProfile(state.profile);
      setPassword("");
    } catch (nextError) {
      setAuthError(nextError instanceof Error ? nextError.message : "Unable to sign in.");
    } finally {
      setAuthLoading(false);
    }
  };

  const saveQualifier = async (climbNumber: number) => {
    if (!climber || qualifierLocked || (!canJudge && !qualifierSelfScoringOpen) || (canJudge && !qualifierStaffScoringOpen)) {
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const draft = qualifierDrafts[climbNumber];
      if (canJudge) {
        await updateQualifierAttemptByStaff(climber.id, climbNumber, draft.attemptCount, draft.topped);
      } else {
        await updateQualifierAttemptByToken(token, climbNumber, draft.attemptCount, draft.topped);
      }
      await load();
      setMessage(`Qualifier score saved for boulder ${climbNumber}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save the qualifier score.");
    } finally {
      setSaving(false);
    }
  };

  const saveFinals = async (climbNumber: number) => {
    if (!climber || !canJudge || !finalsStaffScoringOpen) {
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const draft = finalsDrafts[climbNumber];
      await updateFinalAttempt(
        climber.id,
        climbNumber,
        draft.top,
        draft.zone,
        draft.top ? draft.attemptsToTop : null,
        draft.zone ? draft.attemptsToZone : null
      );
      await load();
      setMessage(`Finals score saved for boulder ${climbNumber}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save the finals score.");
    } finally {
      setSaving(false);
    }
  };

  if (!climber) {
    return (
      <main className="page-shell">
        <div className="content-frame space-y-6">
          <SiteHeader />

          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="eyebrow">Private qualifier access</div>
                <h1 className="section-title mt-4 text-4xl sm:text-5xl">Open a climber scorecard</h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                  Private qualifier links open directly for climbers. Judges can sign in to search by name or number, override qualifier entries, and open finals scoring.
                </p>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                  Once a climber opens their private link on this device, the navigation keeps a My Scorecard shortcut so they can jump back after checking the leaderboard.
                </p>
                {workflowGuide ? (
                  <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                    <div className="meta-label">What happens in this round</div>
                    <div className="mt-2 text-xl font-semibold text-chalk">{workflowGuide.headline}</div>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{workflowGuide.summary}</p>
                  </div>
                ) : null}
              </div>
              <Link href="/register" className="btn-primary">
                Register climber
              </Link>
            </div>

            {!canJudge ? (
              <form onSubmit={handleAuthSubmit} className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="judge@gym.com" className="input-field" />
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="input-field" />
                <button type="submit" disabled={authLoading} className="btn-primary">
                  {authLoading ? "Signing in..." : "Judge sign in"}
                </button>
              </form>
            ) : (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <div className="status-pill border-green-500/20 bg-green-500/10 text-green-200">
                  {profile?.role} session active
                </div>
                <button onClick={() => void signOutUser().then(() => setProfile(null))} className="btn-ghost">
                  Sign out
                </button>
              </div>
            )}

            {authError ? <div className="mt-4 rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{authError}</div> : null}
            {error ? <div className="mt-4 rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{error}</div> : null}

            {canJudge ? (
              <div className="mt-6 space-y-4">
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await runLookup(lookup);
                  }}
                  className="grid gap-3 md:grid-cols-[1fr_auto]"
                >
                  <input type="text" value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Search by climber number, name, or province" className="input-field" />
                  <button type="submit" className="btn-primary">Search climbers</button>
                </form>

                <div className="space-y-3">
                  {results.map((entry) => (
                    <div key={entry.id} className="card-muted flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-chalk">{entry.name}</div>
                        <div className="mt-1 text-sm text-slate-300">
                          #{entry.climber_number} | {entry.display_category} | {entry.province}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/scorecard?id=${entry.id}`} className="btn-ghost">Qualifier</Link>
                        <Link href={`/scorecard?id=${entry.id}&stage=finals`} className="btn-primary">Finals</Link>
                      </div>
                    </div>
                  ))}
                  {!results.length && !loading ? <p className="text-sm text-slate-300">Search results will appear here.</p> : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="content-frame space-y-6">
        <SiteHeader
          status={
            <>
              {snapshot ? (
                <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                  {snapshot.event.name}
                </div>
              ) : null}
              {token ? (
                <div className="status-pill border-blue-500/20 bg-blue-500/10 text-blue-200">
                  Private qualifier link
                </div>
              ) : null}
              {canJudge ? (
                <div className="status-pill border-green-500/20 bg-green-500/10 text-green-200">
                  Staff override enabled
                </div>
              ) : null}
            </>
          }
        />

        <section className="card">
          <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="eyebrow">Climber #{climber.climber_number}</div>
              <h1 className="section-title mt-4 text-5xl sm:text-6xl">{climber.name}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="status-pill border-white/10 bg-white/[0.03] text-slate-300">{climber.display_category}</span>
                <span className="status-pill border-white/10 bg-white/[0.03] text-slate-300">{climber.province}</span>
                {snapshot ? <span className="status-pill border-white/10 bg-white/[0.03] text-slate-300">{getTimeSlotLabel(climber.time_slot_id, snapshot.event)}</span> : null}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={token ? `/scorecard?token=${token}` : `/scorecard?id=${climber.id}`} className={`btn-ghost ${stage === "qualifier" ? "border-yellow-400/30 text-yellow-200" : ""}`}>Qualifier</Link>
                {snapshot && formatSupportsFinals(snapshot.event.format) ? (
                  <Link href={token ? `/scorecard?token=${token}&stage=finals` : `/scorecard?id=${climber.id}&stage=finals`} className={`btn-ghost ${stage === "finals" ? "border-yellow-400/30 text-yellow-200" : ""}`}>Finals</Link>
                ) : null}
              </div>
              {workflowGuide ? (
                <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="meta-label">Round workflow</div>
                  <div className="mt-2 text-xl font-semibold text-chalk">{workflowGuide.headline}</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{workflowGuide.summary}</p>
                  <p className="mt-3 text-sm text-slate-400">
                    {canJudge
                      ? workflowGuide.roles.find((entry) => entry.role === "Judge")?.detail
                      : workflowGuide.roles.find((entry) => entry.role === "Climber")?.detail}
                  </p>
                </div>
              ) : null}
              {activeScheduleBlock ? (
                <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="meta-label">Live schedule block</div>
                  <div className="mt-2 text-xl font-semibold text-chalk">{activeScheduleBlock.label}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                      {formatSchedulePhaseLabel(activeScheduleBlock.phase_type)}
                    </span>
                    {activeScheduleBlock.audience_label ? (
                      <span className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                        {activeScheduleBlock.audience_label}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
              {stage === "qualifier" ? (
                <>
                  <div className="meta-label">Qualifier status</div>
                  <div className="mt-3 font-display text-5xl text-chalk">{climberEntry?.total_score.toLocaleString() ?? 0}</div>
                  <div className="mt-3 text-sm text-slate-300">
                    {climberEntry ? `Overall #${climberEntry.overall_rank} | Category #${climberEntry.category_rank}` : "Waiting for first score"}
                  </div>
                  {qualifierLocked ? (
                    <div className="mt-3 text-sm text-yellow-100">
                      Qualifiers are archived because this event has already advanced to finals.
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {climberEntry?.counting_climbs.map((entry) => (
                      <span key={entry.climb_number} className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-xs uppercase tracking-[0.22em] text-yellow-100">
                        B{entry.climb_number.toString().padStart(2, "0")} - {entry.score}
                      </span>
                    ))}
                    {!climberEntry?.counting_climbs.length ? <span className="text-sm text-slate-300">No counting tops yet.</span> : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="meta-label">Finals status</div>
                  <div className="mt-3 font-display text-5xl text-chalk">{finalsEntry ? formatFinalPoints(finalsEntry.total_points) : "0.0"}</div>
                  <div className="mt-3 text-sm text-slate-300">
                    {!finalsEligible
                      ? "This category does not advance to finals."
                      : finalists.has(climber.id)
                      ? finalsEntry
                        ? `Overall #${finalsEntry.overall_rank} | Category #${finalsEntry.category_rank}`
                        : "Qualified for finals"
                      : "Not currently inside the finals field"}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="card-muted p-3"><div className="meta-label">Tops</div><div className="mt-2 text-3xl font-semibold text-chalk">{finalsEntry?.tops ?? 0}</div></div>
                    <div className="card-muted p-3"><div className="meta-label">Zones</div><div className="mt-2 text-3xl font-semibold text-chalk">{finalsEntry?.zones ?? 0}</div></div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {message ? <div className="rounded-[1.3rem] border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-200">{message}</div> : null}
        {error ? <div className="rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{error}</div> : null}

        {stage === "qualifier" ? (
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Qualifiers</div>
                <h2 className="section-title mt-4 text-3xl">
                  {snapshot && canJudge ? "Judge-operated qualifier scoring" : "Qualifier attempts by boulder"}
                </h2>
              </div>
              <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                {qualifierLocked
                  ? "Qualifier round closed"
                  : canJudge
                  ? qualifierStaffScoringOpen
                    ? "Judge entry live"
                    : "Judge entry paused"
                  : qualifierSelfScoringOpen
                  ? "Saving from private link"
                  : "Read-only right now"}
              </div>
            </div>

            {qualifierLocked ? (
              <p className="mt-4 text-sm text-slate-300">
                Qualifier entries are read-only because the event has already advanced to finals.
              </p>
            ) : !canJudge && !qualifierSelfScoringOpen ? (
              <p className="mt-4 text-sm text-slate-300">
                Private qualifier scoring is only open during a live scramble qualifier block. For competitive qualifier formats, judges should record scores from staff devices.
              </p>
            ) : canJudge && !qualifierStaffScoringOpen ? (
              <p className="mt-4 text-sm text-slate-300">
                The current schedule block is not a qualifier climbing window, so qualifier scoring is paused.
              </p>
            ) : null}

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {(snapshot ? getClimbs(snapshot.event.total_climbs) : []).map((climb) => {
                const draft = qualifierDrafts[climb.number] ?? { attemptCount: 0, topped: false };
                return (
                  <div key={climb.number} className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="meta-label">Boulder {climb.number.toString().padStart(2, "0")}</div>
                        <div className="mt-2 text-xl font-semibold text-chalk">{climb.base_points} base points</div>
                      </div>
                      <button type="button" onClick={() => void saveQualifier(climb.number)} disabled={saving || qualifierLocked || (canJudge ? !qualifierStaffScoringOpen : !qualifierSelfScoringOpen)} className="btn-primary">
                        Save
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm text-slate-300">
                        Attempts
                        <input
                          type="number"
                          min={0}
                          value={draft.attemptCount}
                          onChange={(event) =>
                            setQualifierDrafts((current) => ({
                              ...current,
                              [climb.number]: {
                                ...draft,
                                attemptCount: Number(event.target.value) || 0,
                              },
                            }))
                          }
                          disabled={qualifierLocked || (canJudge ? !qualifierStaffScoringOpen : !qualifierSelfScoringOpen)}
                          className="input-field mt-2"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={draft.topped}
                          disabled={qualifierLocked || (canJudge ? !qualifierStaffScoringOpen : !qualifierSelfScoringOpen)}
                          onChange={(event) =>
                            setQualifierDrafts((current) => ({
                              ...current,
                              [climb.number]: {
                                ...draft,
                                topped: event.target.checked,
                              },
                            }))
                          }
                        />
                        Top recorded
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Finals</div>
                <h2 className="section-title mt-4 text-3xl">Judge-operated IFSC points scoring</h2>
              </div>
              <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                {canJudge ? (finalsStaffScoringOpen ? "Judge entry only" : "Judge entry paused") : "Read-only"}
              </div>
            </div>

            {!canJudge ? (
              <p className="mt-4 text-sm text-slate-300">Finals scoring requires a judge or admin session.</p>
            ) : !finalsEligible ? (
              <p className="mt-4 text-sm text-slate-300">This climber&apos;s age group is not enabled for finals in the current event setup.</p>
            ) : !finalists.has(climber.id) ? (
              <p className="mt-4 text-sm text-slate-300">This climber has not advanced into finals for the current cutoff.</p>
            ) : !finalsStaffScoringOpen ? (
              <p className="mt-4 text-sm text-slate-300">
                Finals scoring is paused until the live schedule block is set to a finals round or custom block.
              </p>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="meta-label">Live finals points</div>
                  <div className="mt-3 font-display text-5xl text-chalk">{formatFinalPoints(liveFinalTotalPoints)}</div>
                  <div className="mt-3 text-sm text-slate-300">
                    Ranked by finals points, then count-back to qualifier rank #{finalsEntry?.previous_round_rank ?? 0}.
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {(snapshot ? getClimbs(snapshot.event.finals_problem_count) : []).map((climb) => {
                    const draft = finalsDrafts[climb.number] ?? {
                      top: false,
                      zone: false,
                      attemptsToTop: 0,
                      attemptsToZone: 0,
                    };
                    const problemPoints = calculateFinalAttemptPoints({
                      climb_number: climb.number,
                      top: draft.top,
                      zone: draft.zone,
                      attempts_to_top: draft.top ? draft.attemptsToTop : null,
                      attempts_to_zone: draft.zone ? draft.attemptsToZone : null,
                    });

                    return (
                      <div key={climb.number} className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="meta-label">Boulder {climb.number.toString().padStart(2, "0")}</div>
                            <div className="mt-2 text-xl font-semibold text-chalk">Finals attempt</div>
                            <div className="mt-2 text-sm text-slate-300">Current points: {formatFinalPoints(problemPoints)}</div>
                          </div>
                          <button type="button" onClick={() => void saveFinals(climb.number)} disabled={saving || !finalsStaffScoringOpen} className="btn-primary">
                            Save
                          </button>
                        </div>
                        <div className="mt-4 space-y-3">
                          <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                              type="checkbox"
                              checked={draft.zone}
                              onChange={(event) =>
                                setFinalsDrafts((current) => ({
                                  ...current,
                                  [climb.number]: {
                                    ...draft,
                                    zone: event.target.checked,
                                  },
                                }))
                              }
                            />
                            Zone secured
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                              type="checkbox"
                              checked={draft.top}
                              onChange={(event) =>
                                setFinalsDrafts((current) => ({
                                  ...current,
                                  [climb.number]: {
                                    ...draft,
                                    top: event.target.checked,
                                    zone: event.target.checked ? true : draft.zone,
                                  },
                                }))
                              }
                            />
                            Top secured
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <input type="number" min={0} value={draft.attemptsToZone} onChange={(event) => setFinalsDrafts((current) => ({ ...current, [climb.number]: { ...draft, attemptsToZone: Number(event.target.value) || 0 } }))} className="input-field" placeholder="Attempts to zone" />
                            <input type="number" min={0} value={draft.attemptsToTop} onChange={(event) => setFinalsDrafts((current) => ({ ...current, [climb.number]: { ...draft, attemptsToTop: Number(event.target.value) || 0 } }))} className="input-field" placeholder="Attempts to top" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

export default function ScorecardPage() {
  return (
    <Suspense fallback={<main className="page-shell"><div className="content-frame"><div className="card text-sm text-slate-300">Loading scorecard...</div></div></main>}>
      <ScorecardContent />
    </Suspense>
  );
}
