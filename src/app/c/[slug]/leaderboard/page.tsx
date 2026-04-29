"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import DemoExperience from "@/components/demo-experience";
import SiteHeader from "@/components/site-header";
import FinalsResultsTable from "@/components/finals-results-table";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { isDemoCompetitionRecord } from "@/lib/demo";
import {
  compareQualifierEntries,
  formatCompetitionPhaseLabel,
  formatFinalPoints,
  formatUsesSelfScoredQualifiers,
  getFormatCapabilities,
  pickPreferredQualifierCategory,
} from "@/lib/scoring";

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
    const sourceCategories = offeredCategories.length ? offeredCategories : snapshot.competition.categories;
    return [...sourceCategories].sort((left, right) => {
      const sortDiff = left.sort_order - right.sort_order;
      if (sortDiff !== 0) {
        return sortDiff;
      }

      return left.display_name.localeCompare(right.display_name);
    });
  }, [snapshot]);
  const preferredCategoryId = useMemo(
    () => pickPreferredQualifierCategory(categories, snapshot?.qualifierLeaderboard ?? []),
    [categories, snapshot?.qualifierLeaderboard]
  );
  const qualifierRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.qualifierLeaderboard
      .filter((entry) => !selectedCategory || entry.category_id === selectedCategory)
      .sort((left, right) => {
        const rankDiff = left.category_rank - right.category_rank;
        if (rankDiff !== 0) {
          return rankDiff;
        }

        return compareQualifierEntries(left, right);
      });
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
    if (!categories.length) {
      return;
    }

    if (!selectedCategory) {
      setSelectedCategory(preferredCategoryId || categories[0].id);
      return;
    }

    if (!categories.some((category) => category.id === selectedCategory)) {
      setSelectedCategory(preferredCategoryId || categories[0].id);
    }
  }, [categories, preferredCategoryId, selectedCategory]);

  const finalsRows = finalsGroups.get(selectedFinalsCategory) ?? [];
  const finalsActive = snapshot?.competition.current_phase === "finals_open" || snapshot?.competition.current_phase === "finals_closed" || snapshot?.competition.current_phase === "results";
  const activeQualifierFormat = snapshot?.activeQualifierRound?.format ?? snapshot?.competition.format ?? "scramble";
  const scrambleFormat = snapshot ? formatUsesSelfScoredQualifiers(activeQualifierFormat) : false;
  const activeQualifierRoundName = snapshot?.activeQualifierRound?.name ?? "Qualifier";
  const qualifierScoreContextLabel = snapshot
    ? getFormatCapabilities(activeQualifierFormat).qualifierScoringUnit === "climb_points"
      ? "Score column shows climb points."
      : "Score column shows official qualifier points."
    : "";

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light competitionSlug={slug} />

        {error ? <div className="results-alert results-alert-error">{error}</div> : null}
        {snapshot && isDemoCompetitionRecord(snapshot.competition) ? (
          <DemoExperience
            enabled
            routeId="leaderboard"
            competitionSlug={snapshot.competition.slug}
            bannerTitle="Public leaderboard demo"
            bannerDescription="This is the page climbers, parents, and spectators can open during the event. It updates from the same competition model the judge panel writes to."
            bannerTip="Change categories or refresh after a saved judge call to show how public results stay in sync."
          />
        ) : null}

        {snapshot ? (
          finalsActive ? (
            finalsRows.length ? (
              <>
                <section className="results-card" data-demo-anchor="leaderboard-overview">
                  <div className="results-kicker">Finals</div>
                  <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Finals standings</h1>
                  <div className="mt-3 text-sm text-slate-600">Competition phase: {formatCompetitionPhaseLabel(snapshot.competition.current_phase)}</div>
                  <div className="mt-2 text-sm text-slate-600">Score column shows finals points.</div>
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
              <section className="results-card text-slate-600" data-demo-anchor="leaderboard-overview">Finals are active, but no finals scores have been entered yet.</section>
            )
          ) : (
            <section className="results-card" data-demo-anchor="leaderboard-overview">
              <div className="results-kicker">{activeQualifierRoundName} standings</div>
              <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                {scrambleFormat ? "Live scramble standings" : `Live ${activeQualifierRoundName.toLowerCase()} rankings`}
              </h1>
              <div className="mt-3 text-sm text-slate-600">{qualifierScoreContextLabel}</div>
              {scrambleFormat ? (
                <div className="results-alert results-alert-success mt-4">
                  Rankings update as climbers submit scores during the shared scramble session window.
                </div>
              ) : null}

              <div className="sticky top-20 z-20 mt-5 w-full overflow-x-auto rounded-[1.3rem] border border-slate-200/80 bg-white/72 px-2 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:top-24">
                <div className="flex min-w-max gap-2">
                  {categories.map((category) => (
                    <button key={category.id} type="button" onClick={() => setSelectedCategory(category.id)} className={selectedCategory === category.id ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}>
                      {category.display_name}
                    </button>
                  ))}
                </div>
              </div>

              {!qualifierRows.length ? (
                <div className="results-meta-card mt-5 text-slate-600">
                  {scrambleFormat
                    ? "This session has not recorded any scores yet. Check back once climbers start logging attempts."
                    : `Scoring has not started yet. Check back during the ${activeQualifierRoundName.toLowerCase()} round.`}
                </div>
              ) : (
                <>
                    <div className="mt-6 space-y-3 md:hidden">
                      {qualifierRows.map((entry) => (
                        <div key={entry.climber_id} className="results-meta-card min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="results-kicker">Rank #{entry.category_rank}</div>
                            <div className="mt-2 break-words text-lg font-semibold text-slate-950">{entry.name}</div>
                            <div className="mt-1 break-words text-sm leading-relaxed text-slate-600">
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

                  <div className="results-data-scroll mt-6 hidden md:block">
                    <div className="results-table-scroll-hint">
                      <span>{qualifierScoreContextLabel}</span>
                      <span>Scroll sideways for the full standings table.</span>
                    </div>
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
                          <div className="min-w-0">
                            <div className="break-words text-lg font-semibold text-slate-950">{entry.name}</div>
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
