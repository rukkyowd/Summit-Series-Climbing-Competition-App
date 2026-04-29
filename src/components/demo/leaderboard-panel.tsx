"use client";

import { useEffect, useMemo, useState } from "react";
import FinalsResultsTable from "@/components/finals-results-table";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import type { CompetitionSnapshot } from "@/lib/db";
import {
  compareQualifierEntries,
  formatCompetitionPhaseLabel,
  formatFinalPoints,
  formatUsesSelfScoredQualifiers,
  getFormatCapabilities,
  pickPreferredQualifierCategory,
} from "@/lib/scoring";

type LeaderboardPanelProps = {
  snapshot: CompetitionSnapshot;
  embedded?: boolean;
  highlightedClimberId?: string | null;
};

export function LeaderboardPanel({
  snapshot,
  embedded = false,
  highlightedClimberId = null,
}: LeaderboardPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedFinalsCategory, setSelectedFinalsCategory] = useState("");

  const categories = useMemo(() => {
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
    () => pickPreferredQualifierCategory(categories, snapshot.qualifierLeaderboard),
    [categories, snapshot.qualifierLeaderboard]
  );

  useEffect(() => {
    if (!categories.length) {
      return;
    }

    if (!selectedCategory || !categories.some((category) => category.id === selectedCategory)) {
      setSelectedCategory(preferredCategoryId || categories[0].id);
    }
  }, [categories, preferredCategoryId, selectedCategory]);

  const qualifierRows = useMemo(() => {
    return snapshot.qualifierLeaderboard
      .filter((entry) => !selectedCategory || entry.category_id === selectedCategory)
      .sort((left, right) => {
        const rankDiff = left.category_rank - right.category_rank;
        if (rankDiff !== 0) {
          return rankDiff;
        }

        return compareQualifierEntries(left, right);
      });
  }, [selectedCategory, snapshot.qualifierLeaderboard]);

  const finalsGroups = useMemo(() => {
    const groups = new Map<string, CompetitionSnapshot["finalsLeaderboard"]>();
    snapshot.finalsLeaderboard.forEach((entry) => {
      const next = groups.get(entry.display_category) ?? [];
      next.push(entry);
      groups.set(entry.display_category, next);
    });
    return groups;
  }, [snapshot.finalsLeaderboard]);

  const finalsCategories = useMemo(() => Array.from(finalsGroups.keys()).sort(), [finalsGroups]);

  useEffect(() => {
    if (!selectedFinalsCategory && finalsCategories.length) {
      setSelectedFinalsCategory(finalsCategories[0]);
    }
  }, [finalsCategories, selectedFinalsCategory]);

  const finalsRows = finalsGroups.get(selectedFinalsCategory) ?? [];
  const finalsActive =
    snapshot.competition.current_phase === "finals_open" ||
    snapshot.competition.current_phase === "finals_closed" ||
    snapshot.competition.current_phase === "results";
  const activeQualifierFormat =
    snapshot.activeQualifierRound?.format ?? snapshot.competition.format ?? "scramble";
  const scrambleFormat = formatUsesSelfScoredQualifiers(activeQualifierFormat);
  const activeQualifierRoundName = snapshot.activeQualifierRound?.name ?? "Qualifier";
  const qualifierScoreContextLabel =
    getFormatCapabilities(activeQualifierFormat).qualifierScoringUnit === "climb_points"
      ? "Score column shows climb points."
      : "Score column shows official qualifier points.";

  const wrapperClass = embedded ? "h-full space-y-4" : "space-y-6";

  return (
    <div className={wrapperClass}>
      {finalsActive ? (
        finalsRows.length ? (
          <>
            <Surface
              variant="card"
              className={embedded ? "h-full min-h-0" : undefined}
              data-demo-anchor={embedded ? "interactive-leaderboard" : "leaderboard-overview"}
            >
              <div className="results-kicker">Finals</div>
              <h2 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950">
                Finals standings
              </h2>
              <div className="mt-3 text-sm text-slate-600">
                Competition phase: {formatCompetitionPhaseLabel(snapshot.competition.current_phase)}
              </div>
              <div className="mt-2 text-sm text-slate-600">Score column shows finals points.</div>
              <div className="finals-category-picker mt-5">
                {finalsCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedFinalsCategory(category)}
                    className={
                      category === selectedFinalsCategory
                        ? "finals-category-pill finals-category-pill-active"
                        : "finals-category-pill"
                    }
                  >
                    {category}
                  </button>
                ))}
              </div>
            </Surface>
            <FinalsResultsTable title={selectedFinalsCategory} rows={finalsRows} />
          </>
        ) : (
          <Surface
            variant="card"
            className="text-slate-600"
            data-demo-anchor={embedded ? "interactive-leaderboard" : "leaderboard-overview"}
          >
            Finals are active, but no finals scores have been entered yet.
          </Surface>
        )
      ) : (
        <Surface
          variant="card"
          className={embedded ? "flex h-full min-h-0 min-w-0 flex-col" : undefined}
          data-demo-anchor={embedded ? "interactive-leaderboard" : "leaderboard-overview"}
        >
          <div className="results-kicker">{activeQualifierRoundName} standings</div>
          <h2 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950">
            {scrambleFormat ? "Live scramble standings" : `Live ${activeQualifierRoundName.toLowerCase()} rankings`}
          </h2>
          <div className="mt-3 text-sm text-slate-600">{qualifierScoreContextLabel}</div>

          <div
            className={`mt-5 w-full overflow-x-auto rounded-[1.3rem] border border-slate-200/80 bg-white/72 px-2 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl ${embedded ? "" : "sticky top-20 z-20 sm:top-24"}`}
            data-demo-anchor={embedded ? undefined : "leaderboard-categories"}
          >
            <div className="flex min-w-max gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategory(category.id)}
                  className={
                    selectedCategory === category.id
                      ? "finals-category-pill finals-category-pill-active"
                      : "finals-category-pill"
                  }
                >
                  {category.display_name}
                </button>
              ))}
            </div>
          </div>

          {!qualifierRows.length ? (
            <Surface variant="meta" className="mt-5 text-slate-600">
              {scrambleFormat
                ? "This session has not recorded any scores yet. Check back once climbers start logging attempts."
                : `Scoring has not started yet. Check back during the ${activeQualifierRoundName.toLowerCase()} round.`}
            </Surface>
          ) : (
            <>
              <div className="mt-6 space-y-3 md:hidden">
                {qualifierRows.map((entry) => (
                  <Surface
                    key={entry.climber_id}
                    variant="meta"
                    className={`min-w-0 ${highlightedClimberId === entry.climber_id ? "ring-2 ring-sky-400/50" : ""}`}
                  >
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
                          {Number.isInteger(entry.total_score)
                            ? entry.total_score.toLocaleString()
                            : formatFinalPoints(entry.total_score)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge>{entry.display_category}</Badge>
                      <Badge>{entry.topped_count} tops</Badge>
                      <Badge>{entry.zone_count} zones</Badge>
                    </div>
                  </Surface>
                ))}
              </div>

              <div
                className={`results-data-scroll mt-6 hidden md:block ${embedded ? "min-w-0 flex-1 overflow-x-auto overflow-y-hidden" : ""}`}
                data-demo-anchor={embedded ? "interactive-leaderboard-table" : "leaderboard-table"}
              >
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
                    <div
                      key={entry.climber_id}
                      className={`grid grid-cols-[0.7fr_1.6fr_1fr_1fr_1fr_1.2fr] gap-4 border-b border-slate-100 px-5 py-4 text-sm text-slate-700 transition-colors ${
                        highlightedClimberId === entry.climber_id ? "bg-sky-50/80" : ""
                      }`}
                    >
                      <div className="text-xl font-semibold text-slate-950">{entry.category_rank}</div>
                      <div className="min-w-0">
                        <div className="break-words text-lg font-semibold text-slate-950">{entry.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          #{entry.climber_number}
                        </div>
                      </div>
                      <div>{entry.province}</div>
                      <div>{entry.display_category}</div>
                      <div className="font-semibold text-slate-950">
                        {Number.isInteger(entry.total_score)
                          ? entry.total_score.toLocaleString()
                          : formatFinalPoints(entry.total_score)}
                      </div>
                      <div>
                        {entry.topped_count} tops / {entry.zone_count} zones
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Surface>
      )}
    </div>
  );
}
