"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import FinalsResultsTable from "@/components/finals-results-table";
import { getAuthState, isStaffRole, signInWithRole, signOutUser, type Profile } from "@/lib/auth";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";
import { formatFinalPoints, formatSupportsFinals, formatUsesOfficialQualifierPoints, type FinalsLeaderboardEntry } from "@/lib/scoring";

export default function CompetitionLeaderboardPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedFinalsCategory, setSelectedFinalsCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const refresh = useCallback(async () => {
    try {
      const nextSnapshot = await getCompetitionSnapshot(slug);
      setSnapshot(nextSnapshot);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load rankings.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
    getAuthState()
      .then((state) => setProfile(state.profile))
      .catch((nextError) => {
        setAuthError(nextError instanceof Error ? nextError.message : "Unable to read the staff session.");
      })
      .finally(() => setAuthLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!supabaseConfigured || !snapshot) {
      return;
    }

    const competitionId = snapshot.competition.id;
    const channel = publicSupabase
      .channel(`leaderboard-${competitionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "competitions", filter: `id=eq.${competitionId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "climbers", filter: `competition_id=eq.${competitionId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "qualifier_attempts", filter: `competition_id=eq.${competitionId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "final_attempts", filter: `competition_id=eq.${competitionId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_finalists", filter: `competition_id=eq.${competitionId}` }, refresh)
      .subscribe();

    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, [refresh, snapshot]);

  const canSeeStaff = isStaffRole(profile?.role);
  const finalsActive = snapshot?.competition.stage_mode === "finals" && !!snapshot && formatSupportsFinals(snapshot.competition.format);
  const officialQualifierFormat = snapshot ? formatUsesOfficialQualifierPoints(snapshot.competition.format) : false;
  const categories = useMemo(() => snapshot?.competition.categories ?? [], [snapshot]);
  const qualifierRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.qualifierLeaderboard.filter((entry) => selectedCategory === "all" || entry.category_id === selectedCategory);
  }, [selectedCategory, snapshot]);

  const finalsGroups = useMemo(() => {
    const groups = new Map<string, FinalsLeaderboardEntry[]>();
    snapshot?.finalsLeaderboard.forEach((entry) => {
      const next = groups.get(entry.display_category) ?? [];
      next.push(entry);
      groups.set(entry.display_category, next);
    });
    return groups;
  }, [snapshot]);
  const finalsCategories = useMemo(() => Array.from(finalsGroups.keys()).sort(), [finalsGroups]);

  useEffect(() => {
    if (!finalsCategories.length) {
      setSelectedFinalsCategory("");
      return;
    }

    setSelectedFinalsCategory((current) => (finalsCategories.includes(current) ? current : finalsCategories[0]));
  }, [finalsCategories]);

  const finalsRows = finalsGroups.get(selectedFinalsCategory) ?? [];

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const state = await signInWithRole(email, password);
      setProfile(state.profile);
    } catch (nextError) {
      setAuthError(nextError instanceof Error ? nextError.message : "Unable to sign in.");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light competitionSlug={slug} />

        {error ? <div className="results-alert results-alert-error">{error}</div> : null}

        {finalsActive ? (
          finalsRows.length ? (
            <>
              {finalsCategories.length > 1 ? (
                <section className="results-card">
                  <div className="results-kicker">Finals categories</div>
                  <div className="finals-category-picker mt-4">
                    {finalsCategories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setSelectedFinalsCategory(category)}
                        className={category === selectedFinalsCategory ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              <FinalsResultsTable title={selectedFinalsCategory} rows={finalsRows} />
            </>
          ) : (
            <section className="results-card text-slate-600">Finals are active, but no finals scores have been entered yet.</section>
          )
        ) : (
          <section className="results-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="results-kicker">Rankings</div>
                <h1 className="mt-2 text-4xl font-semibold text-slate-950">Qualifier standings</h1>
              </div>
              <div className="results-chip">{canSeeStaff ? "Staff detail view" : "Public totals"}</div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
              <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="results-input">
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.display_name}
                  </option>
                ))}
              </select>

              {canSeeStaff ? (
                <button type="button" onClick={() => void signOutUser().then(() => setProfile(null))} className="results-secondary-button">
                  Sign out
                </button>
              ) : null}
            </div>

            {!canSeeStaff ? (
              <form onSubmit={signIn} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="judge@gym.com" className="results-input" />
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="results-input" />
                <button type="submit" disabled={authLoading} className="results-secondary-button">
                  {authLoading ? "Signing in..." : "Staff sign in"}
                </button>
              </form>
            ) : null}

            {authError ? <div className="results-alert results-alert-error mt-4">{authError}</div> : null}

            <div className="mt-6 overflow-x-auto">
              <div className="min-w-[920px]">
                <div className="grid grid-cols-[0.7fr_1.6fr_1fr_1fr_1fr_1.4fr] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <div>Rank</div>
                  <div>Name</div>
                  <div>Province</div>
                  <div>Category</div>
                  <div>{officialQualifierFormat ? "Points" : "Score"}</div>
                  <div>
                    {canSeeStaff
                      ? officialQualifierFormat
                        ? "Round breakdown"
                        : "Counting climbs"
                      : officialQualifierFormat
                        ? "T / Z"
                        : "Tops"}
                  </div>
                </div>
                {qualifierRows.map((entry) => (
                  <div key={entry.climber_id} className="grid grid-cols-[0.7fr_1.6fr_1fr_1fr_1fr_1.4fr] gap-4 border-b border-slate-100 px-5 py-4 text-sm text-slate-700">
                    <div className="text-xl font-semibold text-slate-950">
                      {selectedCategory === "all" ? entry.overall_rank : entry.category_rank}
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-slate-950">{entry.name}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">#{entry.climber_number}</div>
                    </div>
                    <div>{entry.province}</div>
                    <div>{entry.display_category}</div>
                    <div className="font-semibold text-slate-950">
                      {officialQualifierFormat ? formatFinalPoints(entry.total_score) : entry.total_score.toLocaleString()}
                    </div>
                    <div>
                      {canSeeStaff
                        ? entry.counting_climbs
                            .map((climb) =>
                              officialQualifierFormat
                                ? `B${String(climb.climb_number).padStart(2, "0")} ${formatFinalPoints(climb.score)}`
                                : `B${String(climb.climb_number).padStart(2, "0")} ${climb.score}`
                            )
                            .join(", ")
                        : officialQualifierFormat
                          ? `${entry.topped_count}T / ${entry.zone_count}Z`
                          : `${entry.topped_count} tops`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {loading && !snapshot ? <section className="results-card text-slate-600">Loading rankings...</section> : null}
      </div>
    </main>
  );
}
