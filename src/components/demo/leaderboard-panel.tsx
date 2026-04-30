"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import FinalsResultsTable from "@/components/finals-results-table";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import type { LeaderboardImpact, LeaderboardToast } from "@/components/demo/types";
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
  targetClimberId?: string | null;
  impact?: LeaderboardImpact | null;
  lastUpdatedAt?: string | null;
  toast?: LeaderboardToast | null;
  presentationFocus?: "judge" | "save" | "leaderboard" | "offline" | "sync" | "complete" | null;
};

export function LeaderboardPanel({
  snapshot,
  embedded = false,
  highlightedClimberId = null,
  targetClimberId = null,
  impact = null,
  lastUpdatedAt = null,
  toast = null,
  presentationFocus = null,
}: LeaderboardPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedFinalsCategory, setSelectedFinalsCategory] = useState("");
  const [relativeNow, setRelativeNow] = useState(() => Date.now());
  const reduceMotion = useReducedMotion();

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

  useEffect(() => {
    const timer = window.setInterval(() => setRelativeNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) {
      return "Updated just now";
    }

    const timestamp = new Date(lastUpdatedAt).getTime();
    if (Number.isNaN(timestamp)) {
      return "Updated live";
    }

    const seconds = Math.max(0, Math.round((relativeNow - timestamp) / 1000));
    if (seconds <= 1) {
      return "Updated just now";
    }
    if (seconds < 60) {
      return `Updated ${seconds}s ago`;
    }

    const minutes = Math.round(seconds / 60);
    return `Updated ${minutes}m ago`;
  }, [lastUpdatedAt, relativeNow]);

  const getImpactLabel = (climberId: string) => {
    if (!impact || impact.climberId !== climberId) {
      return null;
    }

    if (impact.beforeRank !== null && impact.afterRank !== null && impact.delta > 0) {
      return `Moved up ${impact.delta}`;
    }

    if (impact.beforeRank !== null && impact.afterRank !== null && impact.delta < 0) {
      return `Dropped ${Math.abs(impact.delta)}`;
    }

    if (impact.beforeRank !== null && impact.afterRank !== null) {
      return "Rank updated";
    }

    return "New score";
  };

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
          className={`${embedded ? "flex h-full min-h-0 min-w-0 flex-col" : ""} ${
            presentationFocus === "leaderboard" || presentationFocus === "sync"
              ? "demo-pitch-focus-surface"
              : ""
          }`}
          data-demo-anchor={embedded ? "interactive-leaderboard" : "leaderboard-overview"}
        >
          <div className="results-kicker">{activeQualifierRoundName} standings</div>
          <h2 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950">
            {scrambleFormat ? "Live scramble standings" : `Live ${activeQualifierRoundName.toLowerCase()} rankings`}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <div className="demo-live-badge">
              <span className="demo-live-dot" aria-hidden="true" />
              <span>LIVE</span>
            </div>
            <div>{lastUpdatedLabel}</div>
            <div>{qualifierScoreContextLabel}</div>
          </div>

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
              <motion.div layout className="mt-6 space-y-3 md:hidden">
                {qualifierRows.map((entry) => {
                  const impactLabel = getImpactLabel(entry.climber_id);
                  const impacted = Boolean(impactLabel);
                  return (
                    <motion.div
                      key={entry.climber_id}
                      layout
                      transition={{ duration: reduceMotion ? 0.18 : 0.55, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <Surface
                        variant="meta"
                        className={`min-w-0 ${highlightedClimberId === entry.climber_id ? "ring-2 ring-sky-400/50" : ""} ${impacted ? "demo-rank-impact-card" : ""}`}
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
                          {targetClimberId === entry.climber_id ? <Badge>Demo target</Badge> : null}
                          {impactLabel ? <Badge variant="live">{impactLabel}</Badge> : null}
                          {impact?.climberId === entry.climber_id && impact.reason ? (
                            <Badge variant="live">{impact.reason}</Badge>
                          ) : null}
                          <Badge>{entry.topped_count} tops</Badge>
                          <Badge>{entry.zone_count} zones</Badge>
                        </div>
                      </Surface>
                    </motion.div>
                  );
                })}
              </motion.div>

              <div
                className={`results-data-scroll mt-6 hidden md:block ${embedded ? "relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden" : ""}`}
                data-demo-anchor={embedded ? "interactive-leaderboard-table" : "leaderboard-table"}
              >
                <div className="results-table-scroll-hint">
                  <span>{qualifierScoreContextLabel}</span>
                  <span>Scroll sideways for the full standings table.</span>
                </div>
                <motion.div layout className="min-w-[920px]">
                  <div className="grid grid-cols-[0.7fr_1.6fr_1fr_1fr_1fr_1.2fr] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <div>Rank</div>
                    <div>Name</div>
                    <div>Province</div>
                    <div>Category</div>
                    <div>Score</div>
                    <div>Summary</div>
                  </div>
                  {qualifierRows.map((entry) => {
                    const impactLabel = getImpactLabel(entry.climber_id);
                    const impacted = Boolean(impactLabel);
                    return (
                      <motion.div
                        key={entry.climber_id}
                        layout
                        transition={{ duration: reduceMotion ? 0.18 : 0.55, ease: [0.16, 1, 0.3, 1] }}
                        className={`grid grid-cols-[0.7fr_1.6fr_1fr_1fr_1fr_1.2fr] gap-4 border-b border-slate-100 px-5 py-4 text-sm text-slate-700 transition-colors ${
                          highlightedClimberId === entry.climber_id ? "bg-sky-50/80" : ""
                        } ${impacted ? "demo-rank-impact-row" : ""}`}
                      >
                        <div className="demo-rank-number text-slate-950">{entry.category_rank}</div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="break-words text-lg font-semibold text-slate-950">{entry.name}</div>
                            {targetClimberId === entry.climber_id ? <Badge>Demo target</Badge> : null}
                            {impactLabel ? <Badge variant="live">{impactLabel}</Badge> : null}
                            {impact?.climberId === entry.climber_id && impact.reason ? (
                              <Badge variant="live">{impact.reason}</Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">#{entry.climber_number}</div>
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
                      </motion.div>
                    );
                  })}
                </motion.div>
                <AnimatePresence>
                  {toast ? (
                    <motion.div
                      key={toast.id}
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
                      transition={{ duration: reduceMotion ? 0.18 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="demo-leaderboard-toast"
                    >
                      <div className="results-kicker text-emerald-200">Last score logged</div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {toast.climberName} - {toast.climbLabel}
                      </div>
                      <div className="mt-1 text-sm text-emerald-100">{toast.resultLabel}</div>
                      {toast.detail ? <div className="mt-2 text-xs text-slate-300">{toast.detail}</div> : null}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </>
          )}
        </Surface>
      )}
    </div>
  );
}
