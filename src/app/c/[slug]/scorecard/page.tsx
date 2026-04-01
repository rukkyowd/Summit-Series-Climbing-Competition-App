"use client";

import { Suspense, useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import CompetitionSubnav from "@/components/competition-subnav";
import { getClimberByAccessToken, getClimberWithAttempts, getCompetitionSnapshot, updateQualifierAttemptByToken, type CompetitionSnapshot } from "@/lib/db";
import { saveScorecardAccessToken } from "@/lib/scorecard-access";
import {
  buildCompetitionPath,
  buildQualifierLeaderboard,
  canClimberSelfScoreQualifier,
  formatCompetitionPhaseLabel,
  formatFinalPoints,
  getClimbs,
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

function ScorecardContent() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const token = searchParams.get("token") ?? "";
  const legacyClimberId = searchParams.get("id") ?? "";
  const stage = searchParams.get("stage") === "finals" ? "finals" : "qualifier";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [climber, setClimber] = useState<ClimberWithAttempts | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, dispatch] = useReducer(draftReducer, {});

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
    void Promise.all([getCompetitionSnapshot(slug), getClimberByAccessToken(token)])
      .then(([nextSnapshot, nextClimberLookup]) => {
        setSnapshot(nextSnapshot);
        setClimber(nextClimberLookup?.climber ?? null);
        dispatch({
          type: "initialize",
          climber: nextClimberLookup?.climber ?? null,
          totalClimbs: nextSnapshot.competition.total_climbs,
        });
        setError("");
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Unable to load the scorecard.");
      })
      .finally(() => setLoading(false));
  }, [slug, token]);

  const qualifierEntry = useMemo(
    () => snapshot?.qualifierLeaderboard.find((entry) => entry.climber_id === climber?.id) ?? null,
    [climber?.id, snapshot]
  );
  const finalsEntry = useMemo(
    () => snapshot?.finalsLeaderboard.find((entry) => entry.climber_id === climber?.id) ?? null,
    [climber?.id, snapshot]
  );
  const qualifierOpen = snapshot ? canClimberSelfScoreQualifier(snapshot.competition) : false;
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

  const saveQualifier = async (climbNumber: number) => {
    if (!snapshot || !climber) {
      return;
    }

    const draft = drafts[climbNumber] ?? { attemptCount: 0, topped: false };
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await updateQualifierAttemptByToken(token, snapshot.competition.id, climbNumber, draft.attemptCount, draft.topped);
      const refreshedClimber = await getClimberWithAttempts(snapshot.competition.id, climber.id);
      if (refreshedClimber) {
        const nextClimbers = snapshot.climbers.map((entry) => (entry.id === climber.id ? refreshedClimber : entry));
        const nextQualifierLeaderboard = buildQualifierLeaderboard(nextClimbers, snapshot.competition);
        setClimber(refreshedClimber);
        setSnapshot({
          ...snapshot,
          climbers: nextClimbers,
          qualifierLeaderboard: nextQualifierLeaderboard,
        });
      }
      setMessage(`Saved boulder ${climbNumber}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save qualifier score.");
    } finally {
      setSaving(false);
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
          <CompetitionSubnav competitionSlug={slug} />
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
          <CompetitionSubnav competitionSlug={slug} />
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
        <CompetitionSubnav competitionSlug={slug} />

        {message ? <div className="results-alert results-alert-success">{message}</div> : null}
        {error ? <div className="results-alert results-alert-error">{error}</div> : null}

        <section className="results-card">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="results-kicker">Climber #{climber.climber_number}</div>
              <h1 className="mt-2 text-5xl font-semibold text-slate-950">{climber.name}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="results-chip">{climber.display_category}</span>
                <span className="results-chip">{climber.province}</span>
                <span className="results-chip">Private scorecard</span>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href={`${buildCompetitionPath(slug, "scorecard")}?token=${token}`} className={`results-secondary-button ${stage === "qualifier" ? "results-secondary-button-active" : ""}`}>Qualifier</Link>
                <Link href={`${buildCompetitionPath(slug, "scorecard")}?token=${token}&stage=finals`} className={`results-secondary-button ${stage === "finals" ? "results-secondary-button-active" : ""}`}>Finals</Link>
              </div>
            </div>

            <div className="results-meta-card">
              <div className="results-kicker">Competition phase</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{formatCompetitionPhaseLabel(snapshot.competition.current_phase)}</div>
              {stage === "qualifier" ? (
                <div className="mt-4 text-sm text-slate-600">
                  {qualifierEntry
                    ? `Overall #${qualifierEntry.overall_rank} | Category #${qualifierEntry.category_rank}`
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

            {!qualifierOpen ? (
              <div className="results-meta-card mt-5 text-slate-600">
                Private self-scoring is currently closed. Your saved score for each boulder remains visible here in read-only mode.
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {qualifierOpen
                ? getClimbs(snapshot.competition.total_climbs).map((climb) => {
                    const draft = drafts[climb.number] ?? { attemptCount: 0, topped: false };
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
