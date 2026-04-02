"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import FinalsResultsTable from "@/components/finals-results-table";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { formatCompetitionPhaseLabel, formatFinalPoints, formatUsesSelfScoredQualifiers } from "@/lib/scoring";

export default function CompetitionLeaderboardPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedFinalsCategory, setSelectedFinalsCategory] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void getCompetitionSnapshot(slug)
      .then((nextSnapshot) => setSnapshot(nextSnapshot))
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load rankings."));
  }, [slug]);

  const categories = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const offeredCategories = snapshot.registrationChoices.map((choice) => choice.category);
    return offeredCategories.length ? offeredCategories : snapshot.competition.categories;
  }, [snapshot]);
  const qualifierRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.qualifierLeaderboard.filter((entry) => !selectedCategory || entry.category_id === selectedCategory);
  }, [selectedCategory, snapshot]);

  const finalsGroups = useMemo(() => {
    const groups = new Map<string, CompetitionSnapshot["finalsLeaderboard"]>();
    snapshot?.finalsLeaderboard.forEach((entry) => {
      const next = groups.get(entry.display_category) ?? [];
      next.push(entry);
      groups.set(entry.display_category, next);
    });
    return groups;
  }, [snapshot]);

  const finalsCategories = useMemo(() => Array.from(finalsGroups.keys()).sort(), [finalsGroups]);

  useEffect(() => {
    if (!selectedFinalsCategory && finalsCategories.length) {
      setSelectedFinalsCategory(finalsCategories[0]);
    }
  }, [finalsCategories, selectedFinalsCategory]);

  useEffect(() => {
    if (!selectedCategory && categories.length) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  const finalsRows = finalsGroups.get(selectedFinalsCategory) ?? [];
  const finalsActive = snapshot?.competition.current_phase === "finals_open" || snapshot?.competition.current_phase === "finals_closed" || snapshot?.competition.current_phase === "results";
  const scrambleFormat = snapshot ? formatUsesSelfScoredQualifiers(snapshot.competition.format) : false;

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light competitionSlug={slug} />

        {error ? <div className="results-alert results-alert-error">{error}</div> : null}

        {snapshot ? (
          finalsActive ? (
            finalsRows.length ? (
              <>
                <section className="results-card">
                  <div className="results-kicker">Finals</div>
                  <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">Finals standings</h1>
                  <div className="mt-3 text-sm text-slate-600">Competition phase: {formatCompetitionPhaseLabel(snapshot.competition.current_phase)}</div>
                  <div className="finals-category-picker mt-5">
                    {finalsCategories.map((category) => (
                      <button key={category} type="button" onClick={() => setSelectedFinalsCategory(category)} className={category === selectedFinalsCategory ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}>
                        {category}
                      </button>
                    ))}
                  </div>
                </section>
                <FinalsResultsTable title={selectedFinalsCategory} rows={finalsRows} />
              </>
            ) : (
              <section className="results-card text-slate-600">Finals are active, but no finals scores have been entered yet.</section>
            )
          ) : (
            <section className="results-card">
              <div className="results-kicker">Qualifier standings</div>
              <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">
                {scrambleFormat ? "Live scramble standings" : "Live qualifier rankings"}
              </h1>
              {scrambleFormat ? (
                <div className="results-alert results-alert-success mt-4">
                  Rankings update as climbers submit scores during the shared scramble session window.
                </div>
              ) : null}

              <div className="sticky top-20 z-20 mt-5 flex flex-wrap gap-2 bg-white/95 py-2 backdrop-blur sm:top-24">
                {categories.map((category) => (
                  <button key={category.id} type="button" onClick={() => setSelectedCategory(category.id)} className={selectedCategory === category.id ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}>
                    {category.display_name}
                  </button>
                ))}
              </div>

              {!qualifierRows.length ? (
                <div className="results-meta-card mt-5 text-slate-600">
                  {scrambleFormat
                    ? "This session has not recorded any scores yet. Check back once climbers start logging attempts."
                    : "Scoring has not started yet. Check back during the qualifier round."}
                </div>
              ) : (
                <>
                  <div className="mt-6 space-y-3 md:hidden">
                    {qualifierRows.map((entry) => (
                      <div key={entry.climber_id} className="results-meta-card">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="results-kicker">Rank #{entry.category_rank}</div>
                            <div className="mt-2 text-lg font-semibold text-slate-950">{entry.name}</div>
                            <div className="mt-1 text-sm text-slate-600">
                              #{entry.climber_number} | {entry.province}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="results-kicker">Score</div>
                            <div className="font-semibold text-slate-950">
                              {Number.isInteger(entry.total_score) ? entry.total_score.toLocaleString() : formatFinalPoints(entry.total_score)}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="results-chip">{entry.display_category}</span>
                          <span className="results-chip">{entry.topped_count} tops</span>
                          <span className="results-chip">{entry.zone_count} zones</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 hidden overflow-x-auto md:block">
                    <div className="min-w-[920px]">
                      <div className="grid grid-cols-[0.7fr_1.6fr_1fr_1fr_1fr_1.2fr] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <div>Rank</div>
                        <div>Name</div>
                        <div>Province</div>
                        <div>Category</div>
                        <div>Score</div>
                        <div>Summary</div>
                      </div>
                      {qualifierRows.map((entry) => (
                        <div key={entry.climber_id} className="grid grid-cols-[0.7fr_1.6fr_1fr_1fr_1fr_1.2fr] gap-4 border-b border-slate-100 px-5 py-4 text-sm text-slate-700">
                          <div className="text-xl font-semibold text-slate-950">{entry.category_rank}</div>
                          <div>
                            <div className="text-lg font-semibold text-slate-950">{entry.name}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">#{entry.climber_number}</div>
                          </div>
                          <div>{entry.province}</div>
                          <div>{entry.display_category}</div>
                          <div className="font-semibold text-slate-950">{Number.isInteger(entry.total_score) ? entry.total_score.toLocaleString() : formatFinalPoints(entry.total_score)}</div>
                          <div>{entry.topped_count} tops / {entry.zone_count} zones</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>
          )
        ) : (
          <section className="results-card text-slate-600">Loading rankings...</section>
        )}
      </div>
    </main>
  );
}
