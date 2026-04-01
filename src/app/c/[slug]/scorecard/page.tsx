"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import CompetitionSubnav from "@/components/competition-subnav";
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
  buildCompetitionPath,
  canClimberSelfScoreQualifier,
  canStaffScoreFinals,
  canStaffScoreQualifier,
  calculateFinalAttemptPoints,
  formatFinalPoints,
  formatSchedulePhaseLabel,
  getActiveScheduleBlock,
  getClimbs,
  getTimeSlotLabel,
  isFinalsEligibleCategory,
  type ClimberWithAttempts,
} from "@/lib/scoring";

type QualifierDraft = { attemptCount: number; topped: boolean };
type FinalsDraft = { top: boolean; zone: boolean; attemptsToTop: number; attemptsToZone: number };

function ScorecardContent() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
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
      saveScorecardAccessToken(token, slug);
    }
  }, [slug, token]);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const nextSnapshot = await getCompetitionSnapshot(slug);
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
  }, [climberId, slug, token]);

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
    if (!supabaseConfigured || !snapshot) {
      return;
    }

    const competitionId = snapshot.competition.id;
    const channel = publicSupabase
      .channel(`scorecard-${competitionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "climbers", filter: `competition_id=eq.${competitionId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "qualifier_attempts", filter: `competition_id=eq.${competitionId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "final_attempts", filter: `competition_id=eq.${competitionId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_finalists", filter: `competition_id=eq.${competitionId}` }, load)
      .subscribe();

    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, [load, snapshot]);

  useEffect(() => {
    if (!climber || !snapshot) {
      setQualifierDrafts({});
      setFinalsDrafts({});
      return;
    }

    const nextQualifier: Record<number, QualifierDraft> = {};
    const nextFinals: Record<number, FinalsDraft> = {};

    getClimbs(snapshot.competition.total_climbs).forEach((climb) => {
      const qualifierAttempt = climber.qualifier_attempts.find((attempt) => attempt.climb_number === climb.number);
      nextQualifier[climb.number] = {
        attemptCount: qualifierAttempt?.attempt_count ?? 0,
        topped: qualifierAttempt?.topped ?? false,
      };
    });

    getClimbs(snapshot.competition.finals_problem_count).forEach((climb) => {
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

  const climberEntry = useMemo(() => snapshot?.qualifierLeaderboard.find((entry) => entry.climber_id === climber?.id) ?? null, [climber?.id, snapshot]);
  const finalists = useMemo(() => new Set(snapshot?.finalists.map((entry) => entry.climber_id) ?? []), [snapshot]);
  const finalsEntry = useMemo(() => snapshot?.finalsLeaderboard.find((entry) => entry.climber_id === climber?.id) ?? null, [climber?.id, snapshot]);
  const qualifierLocked = snapshot?.competition.stage_mode === "finals";
  const qualifierSelfScoringOpen = snapshot ? canClimberSelfScoreQualifier(snapshot.competition) : false;
  const qualifierStaffScoringOpen = snapshot ? canStaffScoreQualifier(snapshot.competition) : false;
  const finalsStaffScoringOpen = snapshot ? canStaffScoreFinals(snapshot.competition) : false;
  const activeScheduleBlock = useMemo(() => (snapshot ? getActiveScheduleBlock(snapshot.competition) : null), [snapshot]);
  const finalsEligible = climber && snapshot ? isFinalsEligibleCategory(snapshot.competition, climber.gender_division, climber.age_group) : false;

  const liveFinalTotalPoints = useMemo(() => {
    if (!snapshot || !climber) {
      return 0;
    }

    const results = buildFinalProblemResults(
      Object.entries(finalsDrafts).map(([climbNumber, draft]) => ({
        competition_id: snapshot.competition.id,
        climber_id: climber.id,
        climb_number: Number(climbNumber),
        top: draft.top,
        zone: draft.zone,
        attempts_to_top: draft.top ? draft.attemptsToTop : null,
        attempts_to_zone: draft.zone ? draft.attemptsToZone : null,
        entered_by: "staff" as const,
      })),
      snapshot.competition.finals_problem_count
    );

    return results.reduce((sum, result) => sum + result.points, 0);
  }, [climber, finalsDrafts, snapshot]);

  const signIn = async (event: React.FormEvent) => {
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

  const runLookup = async (query: string) => {
    if (!snapshot) {
      return;
    }

    try {
      const nextResults = await searchClimbers(snapshot.competition.id, query);
      setResults(nextResults);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to search climbers.");
    }
  };

  const saveQualifier = async (climbNumber: number) => {
    if (!climber || !snapshot) {
      return;
    }
    if (qualifierLocked || (!canJudge && !qualifierSelfScoringOpen) || (canJudge && !qualifierStaffScoringOpen)) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const draft = qualifierDrafts[climbNumber];
      if (canJudge) {
        await updateQualifierAttemptByStaff(snapshot.competition.id, climber.id, climbNumber, draft.attemptCount, draft.topped);
      } else {
        await updateQualifierAttemptByToken(token, snapshot.competition.id, climbNumber, draft.attemptCount, draft.topped);
      }
      await load();
      setMessage(`Qualifier score saved for boulder ${climbNumber}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save qualifier score.");
    } finally {
      setSaving(false);
    }
  };

  const saveFinals = async (climbNumber: number) => {
    if (!climber || !snapshot || !canJudge || !finalsStaffScoringOpen) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const draft = finalsDrafts[climbNumber];
      await updateFinalAttempt(
        snapshot.competition.id,
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
      setError(nextError instanceof Error ? nextError.message : "Unable to save finals score.");
    } finally {
      setSaving(false);
    }
  };

  if (!climber) {
    return (
      <main className="results-page">
        <div className="content-frame space-y-6">
          <SiteHeader light competitionSlug={slug} />
          <CompetitionSubnav competitionSlug={slug} />

          <section className="results-card">
            <div className="results-kicker">Scorecard access</div>
            <h1 className="mt-2 text-4xl font-semibold text-slate-950">Open a climber scorecard</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
              Private links open directly for climbers. Judges can sign in to search by name or number, open qualifier overrides, and enter finals attempts.
            </p>

            {!canJudge ? (
              <form onSubmit={signIn} className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="judge@gym.com" className="results-input" />
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="results-input" />
                <button type="submit" disabled={authLoading} className="results-primary-button">
                  {authLoading ? "Signing in..." : "Judge sign in"}
                </button>
              </form>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                <div className="results-chip">{profile?.role} session active</div>
                <button type="button" onClick={() => void signOutUser().then(() => setProfile(null))} className="results-secondary-button">
                  Sign out
                </button>
              </div>
            )}

            {authError ? <div className="results-alert results-alert-error mt-4">{authError}</div> : null}
            {error ? <div className="results-alert results-alert-error mt-4">{error}</div> : null}

            {canJudge ? (
              <div className="mt-6 space-y-4">
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await runLookup(lookup);
                  }}
                  className="grid gap-3 md:grid-cols-[1fr_auto]"
                >
                  <input value={lookup} onChange={(event) => setLookup(event.target.value)} className="results-input" placeholder="Search by climber number, name, or province" />
                  <button type="submit" className="results-primary-button">Search climbers</button>
                </form>
                <div className="space-y-3">
                  {results.map((entry) => (
                    <div key={entry.id} className="results-meta-card">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-slate-950">{entry.name}</div>
                          <div className="mt-1 text-sm text-slate-600">
                            #{entry.climber_number} | {entry.display_category} | {entry.province}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`${buildCompetitionPath(slug, "scorecard")}?id=${entry.id}`} className="results-secondary-button">Qualifier</Link>
                          <Link href={`${buildCompetitionPath(slug, "scorecard")}?id=${entry.id}&stage=finals`} className="results-primary-button">Finals</Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light competitionSlug={slug} />
        <CompetitionSubnav competitionSlug={slug} />

        <section className="results-card">
          <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="results-kicker">Climber #{climber.climber_number}</div>
              <h1 className="mt-2 text-5xl font-semibold text-slate-950">{climber.name}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="results-chip">{climber.display_category}</span>
                <span className="results-chip">{climber.province}</span>
                {snapshot ? <span className="results-chip">{getTimeSlotLabel(climber.time_slot_id, snapshot.competition)}</span> : null}
                {token ? <span className="results-chip">Private link</span> : null}
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href={token ? `${buildCompetitionPath(slug, "scorecard")}?token=${token}` : `${buildCompetitionPath(slug, "scorecard")}?id=${climber.id}`} className={`results-secondary-button ${stage === "qualifier" ? "results-secondary-button-active" : ""}`}>Qualifier</Link>
                <Link href={token ? `${buildCompetitionPath(slug, "scorecard")}?token=${token}&stage=finals` : `${buildCompetitionPath(slug, "scorecard")}?id=${climber.id}&stage=finals`} className={`results-secondary-button ${stage === "finals" ? "results-secondary-button-active" : ""}`}>Finals</Link>
              </div>
              {activeScheduleBlock ? (
                <div className="results-meta-card mt-6">
                  <div className="results-kicker">Live schedule block</div>
                  <div className="mt-2 text-xl font-semibold text-slate-950">{activeScheduleBlock.label}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="results-chip">{formatSchedulePhaseLabel(activeScheduleBlock.phase_type)}</span>
                    {activeScheduleBlock.audience_label ? <span className="results-chip">{activeScheduleBlock.audience_label}</span> : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="results-meta-card">
              {stage === "qualifier" ? (
                <>
                  <div className="results-kicker">Qualifier status</div>
                  <div className="mt-2 text-5xl font-semibold text-slate-950">{climberEntry?.total_score.toLocaleString() ?? 0}</div>
                  <div className="mt-3 text-sm text-slate-600">
                    {climberEntry ? `Overall #${climberEntry.overall_rank} | Category #${climberEntry.category_rank}` : "Waiting for first score"}
                  </div>
                </>
              ) : (
                <>
                  <div className="results-kicker">Finals status</div>
                  <div className="mt-2 text-5xl font-semibold text-slate-950">{finalsEntry ? formatFinalPoints(finalsEntry.total_points) : "0.0"}</div>
                  <div className="mt-3 text-sm text-slate-600">
                    {!finalsEligible
                      ? "This category does not advance to finals."
                      : finalists.has(climber.id)
                      ? finalsEntry
                        ? `Overall #${finalsEntry.overall_rank} | Category #${finalsEntry.category_rank}`
                        : "Qualified for finals"
                      : "Not currently inside the finals field"}
                  </div>
                  <div className="mt-4 text-sm text-slate-600">Live finals points: {formatFinalPoints(liveFinalTotalPoints)}</div>
                </>
              )}
            </div>
          </div>
        </section>

        {message ? <div className="results-alert results-alert-success">{message}</div> : null}
        {error ? <div className="results-alert results-alert-error">{error}</div> : null}

        {stage === "qualifier" ? (
          <section className="results-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="results-kicker">Qualifiers</div>
                <h2 className="mt-2 text-3xl font-semibold text-slate-950">Qualifier attempts by boulder</h2>
              </div>
              <div className="results-chip">
                {qualifierLocked ? "Qualifier round closed" : canJudge ? "Judge entry" : "Private scoring"}
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {(snapshot ? getClimbs(snapshot.competition.total_climbs) : []).map((climb) => {
                const draft = qualifierDrafts[climb.number] ?? { attemptCount: 0, topped: false };
                return (
                  <div key={climb.number} className="results-meta-card">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="results-kicker">Boulder {String(climb.number).padStart(2, "0")}</div>
                        <div className="mt-2 text-xl font-semibold text-slate-950">{climb.base_points} base points</div>
                      </div>
                      <button type="button" onClick={() => void saveQualifier(climb.number)} disabled={saving || qualifierLocked || (canJudge ? !qualifierStaffScoringOpen : !qualifierSelfScoringOpen)} className="results-primary-button">
                        Save
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-700">Attempts</span>
                        <input type="number" min={0} value={draft.attemptCount} onChange={(event) => setQualifierDrafts((current) => ({ ...current, [climb.number]: { ...draft, attemptCount: Number(event.target.value) || 0 } }))} className="results-input" />
                      </label>
                      <label className="results-toggle self-end">
                        <input type="checkbox" checked={draft.topped} onChange={(event) => setQualifierDrafts((current) => ({ ...current, [climb.number]: { ...draft, topped: event.target.checked } }))} />
                        <span>Top recorded</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="results-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="results-kicker">Finals</div>
                <h2 className="mt-2 text-3xl font-semibold text-slate-950">Judge-operated IFSC points scoring</h2>
              </div>
              <div className="results-chip">{canJudge ? "Judge entry only" : "Read-only"}</div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {(snapshot ? getClimbs(snapshot.competition.finals_problem_count) : []).map((climb) => {
                const draft = finalsDrafts[climb.number] ?? { top: false, zone: false, attemptsToTop: 0, attemptsToZone: 0 };
                const points = calculateFinalAttemptPoints({
                  competition_id: snapshot?.competition.id ?? "",
                  climber_id: climber.id,
                  climb_number: climb.number,
                  top: draft.top,
                  zone: draft.zone,
                  attempts_to_top: draft.top ? draft.attemptsToTop : null,
                  attempts_to_zone: draft.zone ? draft.attemptsToZone : null,
                });

                return (
                  <div key={climb.number} className="results-meta-card">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="results-kicker">Boulder {String(climb.number).padStart(2, "0")}</div>
                        <div className="mt-2 text-xl font-semibold text-slate-950">Current points: {formatFinalPoints(points)}</div>
                      </div>
                      <button type="button" onClick={() => void saveFinals(climb.number)} disabled={saving || !canJudge || !finalsStaffScoringOpen} className="results-primary-button">
                        Save
                      </button>
                    </div>
                    <div className="mt-4 space-y-3">
                      <label className="results-toggle">
                        <input type="checkbox" checked={draft.zone} onChange={(event) => setFinalsDrafts((current) => ({ ...current, [climb.number]: { ...draft, zone: event.target.checked } }))} />
                        <span>Zone secured</span>
                      </label>
                      <label className="results-toggle">
                        <input type="checkbox" checked={draft.top} onChange={(event) => setFinalsDrafts((current) => ({ ...current, [climb.number]: { ...draft, top: event.target.checked, zone: event.target.checked ? true : draft.zone } }))} />
                        <span>Top secured</span>
                      </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-sm font-medium text-slate-700">Attempts to zone</span>
                            <input type="number" min={0} value={draft.attemptsToZone} onChange={(event) => setFinalsDrafts((current) => ({ ...current, [climb.number]: { ...draft, attemptsToZone: Number(event.target.value) || 0 } }))} className="results-input" />
                          </label>
                          <label className="space-y-2">
                            <span className="text-sm font-medium text-slate-700">Attempts to top</span>
                            <input type="number" min={0} value={draft.attemptsToTop} onChange={(event) => setFinalsDrafts((current) => ({ ...current, [climb.number]: { ...draft, attemptsToTop: Number(event.target.value) || 0 } }))} className="results-input" />
                          </label>
                        </div>
                    </div>
                  </div>
                );
              })}
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
