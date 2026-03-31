"use client";

import { useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/site-header";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";
import { FORMAT_TEMPLATES, formatSupportsFinals, getTimeSlotLabel } from "@/lib/scoring";

const ALL_CATEGORIES = "all";

export default function LeaderboardPage() {
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

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
      .subscribe();

    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, []);

  const categories = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.event.categories;
  }, [snapshot]);

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

  const lastUpdated = updatedAt?.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

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
            </>
          }
        />

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="eyebrow">Public competition board</div>
              <h1 className="section-title mt-4 text-4xl sm:text-5xl">{snapshot?.event.name ?? "Live standings"}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                Public category pages show participants, live qualifier rankings, exact counting climbs, and finals results when the event format includes them.
              </p>
            </div>
            <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
              {snapshot?.event.qualifier_counting_climbs ?? 6} counting climbs
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory(ALL_CATEGORIES)}
              className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.22em] ${selectedCategory === ALL_CATEGORIES ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200" : "border-white/10 bg-white/[0.03] text-slate-300"}`}
            >
              All categories
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.22em] ${selectedCategory === category.id ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200" : "border-white/10 bg-white/[0.03] text-slate-300"}`}
              >
                {category.display_name}
              </button>
            ))}
          </div>
        </section>

        {error ? <div className="rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{error}</div> : null}

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
                        <div className="meta-label">Category rank</div>
                        <div className="mt-2 text-2xl font-semibold text-chalk">#{entry.category_rank}</div>
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
                <h2 className="section-title mt-4 text-3xl">Best-{snapshot?.event.qualifier_counting_climbs ?? 6} live rankings</h2>
              </div>
              <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                Exact counting climbs shown
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
                        <div className="mt-1 text-sm text-slate-300">{entry.display_category} | {entry.province}</div>
                      </div>
                      <div className="text-right">
                        <div className="meta-label">Qualifier total</div>
                        <div className="mt-2 font-display text-4xl text-chalk">{entry.total_score.toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {entry.counting_climbs.length ? (
                        entry.counting_climbs.map((climb) => (
                          <span key={climb.climb_number} className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-yellow-100">
                            B{climb.climb_number.toString().padStart(2, "0")} · {climb.score} · {climb.attempt_count} att
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-300">No counting tops yet.</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-300">Qualifier rankings will appear here once scores are entered.</p>
            )}
          </section>
        </section>

        {snapshot && formatSupportsFinals(snapshot.event.format) ? (
          <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
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
                        <span className="status-pill border-yellow-400/20 bg-yellow-400/10 text-yellow-200">Tie advance</span>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-300">No finalists have qualified yet.</p>
                )}
              </div>
            </section>

            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="eyebrow">Finals</div>
                  <h2 className="section-title mt-4 text-3xl">IFSC standings</h2>
                </div>
                <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                  Tops, zones, attempts
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {finalsRows.length ? (
                  finalsRows.map((entry) => (
                    <div key={entry.climber_id} className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="meta-label">#{entry.overall_rank} overall | #{entry.category_rank} category</div>
                          <div className="mt-2 text-2xl font-semibold text-chalk">{entry.name}</div>
                          <div className="mt-1 text-sm text-slate-300">{entry.display_category}</div>
                        </div>
                        <div className="grid gap-2 text-right sm:grid-cols-2">
                          <div><div className="meta-label">Tops</div><div className="mt-1 text-3xl font-semibold text-chalk">{entry.tops}</div></div>
                          <div><div className="meta-label">Zones</div><div className="mt-1 text-3xl font-semibold text-chalk">{entry.zones}</div></div>
                          <div><div className="meta-label">Att. to top</div><div className="mt-1 text-xl font-semibold text-chalk">{entry.attempts_to_top}</div></div>
                          <div><div className="meta-label">Att. to zone</div><div className="mt-1 text-xl font-semibold text-chalk">{entry.attempts_to_zone}</div></div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-300">Finals standings will appear here after judge scoring begins.</p>
                )}
              </div>
            </section>
          </section>
        ) : null}
      </div>
    </main>
  );
}
