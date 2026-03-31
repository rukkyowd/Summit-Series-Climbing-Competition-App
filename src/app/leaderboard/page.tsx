"use client";

import { useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/site-header";
import { getAuthState, isStaffRole, signInWithRole, signOutUser, type Profile } from "@/lib/auth";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";
import { FORMAT_TEMPLATES, formatFinalPoints, formatSupportsFinals, getTimeSlotLabel, type FinalsLeaderboardEntry } from "@/lib/scoring";

const ALL_CATEGORIES = "all";

function FinalsResultCell({
  top,
  zone,
  attemptsToTop,
  attemptsToZone,
}: {
  top: boolean;
  zone: boolean;
  attemptsToTop: number | null;
  attemptsToZone: number | null;
}) {
  if (!top && !zone) {
    return <div className="finals-problem-box" />;
  }

  if (top) {
    return (
      <div className="finals-problem-box finals-problem-box-top">
        <div className="finals-problem-box__top">{attemptsToTop ?? 1}</div>
        <div className="finals-problem-box__bottom">{attemptsToZone ?? attemptsToTop ?? 1}</div>
      </div>
    );
  }

  return (
    <div className="finals-problem-box">
      <div className="finals-problem-box__bottom finals-problem-box__bottom-zone">{attemptsToZone ?? 1}</div>
    </div>
  );
}

function FinalsResultsTable({
  title,
  rows,
}: {
  title: string;
  rows: FinalsLeaderboardEntry[];
}) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Finals</div>
          <h2 className="section-title mt-4 text-3xl">{title}</h2>
        </div>
        <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
          2025 IFSC points
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[980px] rounded-[1.6rem] border border-black/10 bg-[#f7f5f0] p-4 text-black shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
          <div className="grid finals-grid gap-3 rounded-[1.2rem] bg-black px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white">
            <div>Rank</div>
            <div>Name</div>
            <div>Province</div>
            <div>1</div>
            <div>2</div>
            <div>3</div>
            <div>4</div>
            <div>Points</div>
            <div>T</div>
            <div>Z</div>
            <div>A.T</div>
            <div>A.Z</div>
          </div>

          <div className="divide-y divide-black/10">
            {rows.map((entry) => (
              <div key={entry.climber_id} className="grid finals-grid items-center gap-3 px-4 py-5">
                <div className="text-4xl font-semibold leading-none">{entry.category_rank}</div>
                <div>
                  <div className="text-2xl font-semibold leading-tight">{entry.name}</div>
                  <div className="mt-1 text-xs font-mono uppercase tracking-[0.18em] text-black/55">
                    Qualifier rank #{entry.previous_round_rank}
                  </div>
                </div>
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-black/70">{entry.province}</div>
                {entry.problem_results.map((problem) => (
                  <FinalsResultCell
                    key={problem.climb_number}
                    top={problem.top}
                    zone={problem.zone}
                    attemptsToTop={problem.attempts_to_top}
                    attemptsToZone={problem.attempts_to_zone}
                  />
                ))}
                <div className="text-3xl font-semibold">{formatFinalPoints(entry.total_points)}</div>
                <div className="text-3xl font-semibold">{entry.tops}</div>
                <div className="text-3xl font-semibold">{entry.zones}</div>
                <div className="text-3xl font-semibold">{entry.attempts_to_top}</div>
                <div className="text-3xl font-semibold">{entry.attempts_to_zone}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LeaderboardPage() {
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const refresh = async () => {
    try {
      const nextSnapshot = await getCompetitionSnapshot();
      setSnapshot(nextSnapshot);
      setUpdatedAt(new Date());
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load the public standings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    getAuthState()
      .then((state) => setProfile(state.profile))
      .catch((nextError) => {
        setAuthError(nextError instanceof Error ? nextError.message : "Unable to read the staff session.");
      })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      return;
    }

    const channel = publicSupabase
      .channel("public-competition")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_event_config" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_categories" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_time_slots" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "climbers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "qualifier_attempts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "final_attempts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_finalists" }, refresh)
      .subscribe();

    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, []);

  const canSeeStaffDetails = isStaffRole(profile?.role);
  const showingAllCategories = selectedCategory === ALL_CATEGORIES;

  const categories = useMemo(() => snapshot?.event.categories ?? [], [snapshot]);

  const qualifierRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.qualifierLeaderboard.filter((entry) => {
      return selectedCategory === ALL_CATEGORIES || entry.category_id === selectedCategory;
    });
  }, [selectedCategory, snapshot]);

  const finalsRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.finalsLeaderboard.filter((entry) => {
      return selectedCategory === ALL_CATEGORIES || entry.category_id === selectedCategory;
    });
  }, [selectedCategory, snapshot]);

  const finalists = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.finalists.filter((entry) => {
      return selectedCategory === ALL_CATEGORIES || entry.category_id === selectedCategory;
    });
  }, [selectedCategory, snapshot]);

  const finalsGroups = useMemo(() => {
    const men = finalsRows.filter((entry) => entry.display_category === "Men / Open");
    const women = finalsRows.filter((entry) => entry.display_category === "Women / Open");

    return {
      men,
      women,
    };
  }, [finalsRows]);

  const lastUpdated = updatedAt?.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

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

  return (
    <main className="page-shell">
      <div className="content-frame space-y-6">
        <SiteHeader
          status={
            <>
              <div className="status-pill border-green-500/20 bg-green-500/10 text-green-200">
                Live {lastUpdated ?? ""}
              </div>
              <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                {snapshot ? FORMAT_TEMPLATES.find((item) => item.value === snapshot.event.format)?.label : "Loading"}
              </div>
              {snapshot ? (
                <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                  {snapshot.event.stage_mode === "finals" ? "Finals active" : "Qualifiers live"}
                </div>
              ) : null}
            </>
          }
        />

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Competition board</div>
              <h1 className="section-title mt-4 text-4xl sm:text-5xl">
                {snapshot?.event.name ?? "Live standings"}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                Public users see qualifier totals during the scramble, then the full 2025 IFSC-style finals points board after the event advances. Judge and admin accounts can still reveal the qualifier counting-climb breakdown.
              </p>
            </div>
            <div
              className={`status-pill ${
                canSeeStaffDetails
                  ? "border-green-500/20 bg-green-500/10 text-green-200"
                  : "border-white/10 bg-white/[0.03] text-slate-300"
              }`}
            >
              {canSeeStaffDetails ? "Staff detail view" : "Public summary view"}
            </div>
          </div>

          <div className="mt-5 max-w-sm">
            <label className="meta-label mb-2 block">Category view</label>
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="input-field"
            >
              <option value={ALL_CATEGORIES}>All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.display_name}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Leaderboard access</div>
              <h2 className="section-title mt-4 text-3xl">
                {canSeeStaffDetails ? `Signed in as ${profile?.role}` : "Public leaderboard mode"}
              </h2>
              <p className="mt-3 text-sm text-slate-300">
                {canSeeStaffDetails
                  ? "Qualifier counting top-six climbs are visible. Finals are public and already show the full IFSC points board."
                  : "Sign in as a judge or admin to reveal the qualifier counting top-six climb breakdown."}
              </p>
            </div>
            {canSeeStaffDetails ? (
              <button onClick={() => void signOutUser().then(() => setProfile(null))} className="btn-ghost">
                Sign out
              </button>
            ) : null}
          </div>

          {!canSeeStaffDetails ? (
            <form onSubmit={handleAuthSubmit} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="judge@gym.com"
                className="input-field"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                className="input-field"
              />
              <button type="submit" disabled={authLoading} className="btn-primary">
                {authLoading ? "Signing in..." : "Staff sign in"}
              </button>
            </form>
          ) : null}

          {authError ? (
            <div className="mt-4 rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
              {authError}
            </div>
          ) : null}
        </section>

        {error ? (
          <div className="rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <section className="card">
            <div>
              <div className="eyebrow">Participants</div>
              <h2 className="section-title mt-4 text-3xl">Category roster</h2>
            </div>

            {loading ? (
              <p className="mt-4 text-sm text-slate-300">Loading participants...</p>
            ) : qualifierRows.length ? (
              <div className="mt-5 space-y-3">
                {qualifierRows.map((entry) => (
                  <div key={entry.climber_id} className="card-muted">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-chalk">{entry.name}</div>
                        <div className="mt-1 text-sm text-slate-300">
                          #{entry.climber_number} | {entry.display_category} | {entry.province}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="meta-label">
                          {showingAllCategories ? "Overall rank" : "Category rank"}
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-chalk">
                          #{showingAllCategories ? entry.overall_rank : entry.category_rank}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {snapshot ? getTimeSlotLabel(entry.time_slot_id, snapshot.event) : "No slot"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-300">No climbers in this category yet.</p>
            )}
          </section>

          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Qualifiers</div>
                <h2 className="section-title mt-4 text-3xl">Qualifier rankings</h2>
              </div>
              <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                {canSeeStaffDetails ? `Best-${snapshot?.event.qualifier_counting_climbs ?? 6} detail shown` : "Totals only"}
              </div>
            </div>

            {loading ? (
              <p className="mt-4 text-sm text-slate-300">Loading qualifier rankings...</p>
            ) : qualifierRows.length ? (
              <div className="mt-5 space-y-4">
                {qualifierRows.map((entry) => (
                  <div key={entry.climber_id} className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="meta-label">#{entry.overall_rank} overall | #{entry.category_rank} category</div>
                        <div className="mt-2 text-2xl font-semibold text-chalk">{entry.name}</div>
                        <div className="mt-1 text-sm text-slate-300">
                          {entry.display_category} | {entry.province}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="meta-label">Qualifier total</div>
                        <div className="mt-2 font-display text-4xl text-chalk">
                          {entry.total_score.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {canSeeStaffDetails ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {entry.counting_climbs.length ? (
                          entry.counting_climbs.map((climb) => (
                            <span
                              key={climb.climb_number}
                              className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-yellow-100"
                            >
                              B{climb.climb_number.toString().padStart(2, "0")} - {climb.score} - {climb.attempt_count} att
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-300">No counting tops yet.</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-300">Qualifier rankings will appear here once scores are entered.</p>
            )}
          </section>
        </section>

        {snapshot && snapshot.event.stage_mode === "finals" && formatSupportsFinals(snapshot.event.format) ? (
          <>
            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="eyebrow">Finalists</div>
                  <h2 className="section-title mt-4 text-3xl">Advancement list</h2>
                </div>
                <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                  Cutoff: top {snapshot.event.finals_cutoff}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {finalists.length ? (
                  finalists.map((entry) => (
                    <div key={entry.climber_id} className="card-muted flex items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-chalk">{entry.name}</div>
                        <div className="mt-1 text-sm text-slate-300">
                          {entry.display_category} | Qualifier rank #{entry.qualifier_rank}
                        </div>
                      </div>
                      {entry.advanced_with_tie ? (
                        <span className="status-pill border-yellow-400/20 bg-yellow-400/10 text-yellow-200">
                          Tie advance
                        </span>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-300">No finalists have been stored for this event yet.</p>
                )}
              </div>
            </section>

            {finalsGroups.men.length ? (
              <FinalsResultsTable title="Men / Open Finals" rows={finalsGroups.men} />
            ) : null}

            {finalsGroups.women.length ? (
              <FinalsResultsTable title="Women / Open Finals" rows={finalsGroups.women} />
            ) : null}

            {!finalsGroups.men.length && !finalsGroups.women.length ? (
              <section className="card">
                <p className="text-sm text-slate-300">Finals standings will appear here after finalists are advanced and judge scoring begins.</p>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
