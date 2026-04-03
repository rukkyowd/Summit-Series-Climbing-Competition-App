"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import CompetitionHero from "@/components/competition-hero";
import FinalsResultsTable from "@/components/finals-results-table";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { getAuthState, isStaffRole } from "@/lib/auth";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";
import {
  buildCompetitionPath,
  formatUsesSelfScoredQualifiers,
  formatCompetitionPhaseLabel,
  formatDateRange,
  formatSchedulePhaseLabel,
  formatTimeRange,
  competitionHasFinals,
  getActiveQueueSessionBlock,
  getActiveScheduleBlock,
  getEventWorkflowGuide,
  getTimeSlotLabel,
  isFinalsStage,
} from "@/lib/scoring";

function hasRecordedQualifierScore(snapshot: CompetitionSnapshot, climberId: string) {
  const climber = snapshot.climbers.find((entry) => entry.id === climberId);
  if (!climber) {
    return false;
  }

  return climber.qualifier_attempts.some(
    (attempt) =>
      attempt.attempt_count > 0 ||
      attempt.topped ||
      attempt.zone ||
      attempt.attempts_to_top != null ||
      attempt.attempts_to_zone != null
  );
}

export default function CompetitionOverviewPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFormatGuide, setShowFormatGuide] = useState(false);
  const [selectedFinalsCategory, setSelectedFinalsCategory] = useState("");

  const refresh = useCallback(async () => {
    if (!slug) {
      return;
    }

    try {
      const nextSnapshot = await getCompetitionSnapshot(slug);
      setSnapshot(nextSnapshot);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load the competition.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void getAuthState()
      .then((authState) => setShowFormatGuide(isStaffRole(authState.profile?.role)))
      .catch(() => setShowFormatGuide(false));
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !snapshot) {
      return;
    }

    const competitionId = snapshot.competition.id;
    const channel = publicSupabase
      .channel(`competition-${competitionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "competitions", filter: `id=eq.${competitionId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_schedule_blocks", filter: `competition_id=eq.${competitionId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_boulder_queue", filter: `competition_id=eq.${competitionId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "climbers", filter: `competition_id=eq.${competitionId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_finalists", filter: `competition_id=eq.${competitionId}` }, refresh)
      .subscribe();

    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, [refresh, snapshot]);

  const activeBlock = useMemo(
    () => (snapshot ? getActiveScheduleBlock(snapshot.competition) : null),
    [snapshot]
  );
  const scrambleFormat = snapshot ? formatUsesSelfScoredQualifiers(snapshot.competition.format) : false;
  const activeScrambleSession = useMemo(
    () => (snapshot ? getActiveQueueSessionBlock(snapshot.competition) : null),
    [snapshot]
  );
  const queueByClimb = useMemo(() => {
    const grouped = new Map<number, CompetitionSnapshot["boulderQueue"]>();
    snapshot?.boulderQueue.forEach((entry) => {
      const next = grouped.get(entry.climb_number) ?? [];
      next.push(entry);
      grouped.set(entry.climb_number, next);
    });
    return grouped;
  }, [snapshot]);
  const workflowGuide = useMemo(
    () => (snapshot ? getEventWorkflowGuide(snapshot.competition) : null),
    [snapshot]
  );
  const finalsEnabled = snapshot ? competitionHasFinals(snapshot.competition) : false;
  const finalistsLabel = snapshot
    ? snapshot.finalistsPersisted || isFinalsStage(snapshot.competition)
      ? "Finalists"
      : "Projected finalists"
    : "Finalists";
  const finalsProjectionRows = useMemo(() => {
    if (!snapshot || !finalsEnabled) {
      return [];
    }

    const registeredCounts = new Map<string, number>();
    const scoredCounts = new Map<string, number>();
    const projectedCounts = new Map<string, number>();
    const qualifierGroups = new Map<string, CompetitionSnapshot["qualifierLeaderboard"]>();

    snapshot.climbers.forEach((climber) => {
      const finalsEligible =
        (climber.gender_division === "Men" || climber.gender_division === "Women") &&
        snapshot.competition.finals_eligible_age_groups.includes(climber.age_group);

      if (!finalsEligible) {
        return;
      }

      registeredCounts.set(climber.display_category, (registeredCounts.get(climber.display_category) ?? 0) + 1);

      if (hasRecordedQualifierScore(snapshot, climber.id)) {
        scoredCounts.set(climber.display_category, (scoredCounts.get(climber.display_category) ?? 0) + 1);
      }
    });

    snapshot.finalists.forEach((finalist) => {
      projectedCounts.set(finalist.display_category, (projectedCounts.get(finalist.display_category) ?? 0) + 1);
    });

    snapshot.qualifierLeaderboard.forEach((entry) => {
      if (
        (entry.gender_division !== "Men" && entry.gender_division !== "Women") ||
        !snapshot.competition.finals_eligible_age_groups.includes(entry.age_group)
      ) {
        return;
      }

      const next = qualifierGroups.get(entry.display_category) ?? [];
      next.push(entry);
      qualifierGroups.set(entry.display_category, next);
    });

    return Array.from(registeredCounts.entries())
      .map(([displayCategory, registeredCount]) => {
        const scoredCount = scoredCounts.get(displayCategory) ?? 0;
        const projectedCount = projectedCounts.get(displayCategory) ?? 0;
        const qualifierEntries = qualifierGroups.get(displayCategory) ?? [];
        const cutoff = snapshot.competition.finals_cutoff;
        const allTiedAtZero =
          qualifierEntries.length > 0 &&
          qualifierEntries.every((entry) => entry.category_rank === 1 && entry.total_score === 0);

        let status = "Projected";
        let detail = "Current qualifier standings are shaping the finalist field in this category.";

        if (snapshot.finalistsPersisted || isFinalsStage(snapshot.competition)) {
          status = "Locked";
          detail = "This category's finals field is locked and follows the saved finals order.";
        } else if (registeredCount <= cutoff) {
          status = "Everyone advances";
          detail = "This category has at or below the finals cutoff, so every registered climber currently advances.";
        } else if (allTiedAtZero && scoredCount === 0) {
          status = "Awaiting scores";
          detail = "No qualifier scores are recorded yet, so everyone in this category is still tied.";
        } else if (projectedCount > cutoff) {
          status = "Tie at cutoff";
          detail = "More climbers are currently projected because the cutline is still tied in live standings.";
        }

        return {
          displayCategory,
          registeredCount,
          scoredCount,
          projectedCount,
          cutoff,
          status,
          detail,
          allTiedAtZero,
        };
      })
      .sort((left, right) => left.displayCategory.localeCompare(right.displayCategory));
  }, [finalsEnabled, snapshot]);
  const finalsProjectionSummary = useMemo(() => {
    if (!snapshot || !finalsEnabled) {
      return null;
    }

    const eligibleCategoryCount = finalsProjectionRows.length;
    const scoredCount = finalsProjectionRows.reduce((sum, row) => sum + row.scoredCount, 0);
    const registeredCount = finalsProjectionRows.reduce((sum, row) => sum + row.registeredCount, 0);
    const unresolvedCount = finalsProjectionRows.filter((row) => row.projectedCount > row.cutoff).length;
    const awaitingScores = finalsProjectionRows.every((row) => row.scoredCount === 0);

    if (snapshot.finalistsPersisted || isFinalsStage(snapshot.competition)) {
      return {
        headline: `${snapshot.finalists.length} finalists locked`,
        detail: `Top ${snapshot.competition.finals_cutoff} per category across ${eligibleCategoryCount} eligible categories.`,
        progress: `${scoredCount}/${registeredCount} eligible climbers have qualifier scores recorded.`,
      };
    }

    if (awaitingScores) {
      return {
        headline: "Too early to project finalists",
        detail: `No eligible climbers have recorded qualifier scores yet. Top ${snapshot.competition.finals_cutoff} per category will advance once standings start to separate.`,
        progress: `${scoredCount}/${registeredCount} eligible climbers have qualifier scores recorded.`,
      };
    }

    return {
      headline: `${snapshot.finalists.length} projected across ${eligibleCategoryCount} categories`,
      detail:
        unresolvedCount > 0
          ? `${unresolvedCount} ${unresolvedCount === 1 ? "category is" : "categories are"} still tied above the cutline.`
          : `Current standings are projecting the top ${snapshot.competition.finals_cutoff} in each eligible category.`,
      progress: `${scoredCount}/${registeredCount} eligible climbers have qualifier scores recorded.`,
    };
  }, [finalsEnabled, finalsProjectionRows, snapshot]);
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
  const finalsRows = finalsGroups.get(selectedFinalsCategory) ?? [];
  const finalsActive =
    finalsEnabled &&
    (snapshot?.competition.current_phase === "finals_open" ||
      snapshot?.competition.current_phase === "finals_closed" ||
      snapshot?.competition.current_phase === "results");
  const showFinalsClimbingOrder =
    finalsEnabled &&
    (snapshot?.competition.current_phase === "observation" ||
      snapshot?.competition.current_phase === "finals_open");
  const finalsOrderRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const climberMap = new Map(snapshot.climbers.map((climber) => [climber.id, climber]));

    return [...snapshot.finalists]
      .sort((left, right) => {
        const leftOrder = left.climbing_order ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.climbing_order ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        if (left.qualifier_rank !== right.qualifier_rank) {
          return left.qualifier_rank - right.qualifier_rank;
        }

        return left.name.localeCompare(right.name);
      })
      .map((finalist, index) => {
        const climber = climberMap.get(finalist.climber_id);
        const completedProblems =
          climber?.final_attempts.filter((attempt) => {
            return (
              attempt.top ||
              attempt.zone ||
              attempt.attempts_to_top != null ||
              attempt.attempts_to_zone != null
            );
          }).length ?? 0;

        return {
          climber,
          finalist,
          completedProblems,
          displayOrder: finalist.climbing_order ?? index + 1,
        };
      });
  }, [snapshot]);
  const currentFinalistIndex = useMemo(() => {
    if (!showFinalsClimbingOrder || !snapshot || !finalsOrderRows.length) {
      return -1;
    }

    if (snapshot.competition.current_phase === "observation") {
      return 0;
    }

    return finalsOrderRows.findIndex(
      (entry) => entry.completedProblems < snapshot.competition.finals_problem_count
    );
  }, [finalsOrderRows, showFinalsClimbingOrder, snapshot]);
  const currentFinalist =
    currentFinalistIndex >= 0 ? finalsOrderRows[currentFinalistIndex] ?? null : null;
  const nextFinalist =
    currentFinalistIndex >= 0 ? finalsOrderRows[currentFinalistIndex + 1] ?? null : null;

  useEffect(() => {
    if (!selectedFinalsCategory && finalsCategories.length) {
      setSelectedFinalsCategory(finalsCategories[0]);
      return;
    }

    if (selectedFinalsCategory && !finalsGroups.has(selectedFinalsCategory)) {
      setSelectedFinalsCategory(finalsCategories[0] ?? "");
    }
  }, [finalsCategories, finalsGroups, selectedFinalsCategory]);

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light competitionSlug={slug} />

        {error ? <div className="results-alert results-alert-error">{error}</div> : null}

        {snapshot ? (
          <>
            <CompetitionHero competition={snapshot.competition} />

            {finalsActive ? (
              finalsRows.length ? (
                <>
                  <section className="results-card">
                    <div className="results-kicker">Finals results</div>
                    <h2 className="mt-2 text-3xl font-semibold text-slate-950">Final standings</h2>
                    <div className="mt-3 text-sm text-slate-600">
                      Competition phase: {formatCompetitionPhaseLabel(snapshot.competition.current_phase)}
                    </div>
                    <div className="finals-category-picker mt-5">
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
                  <FinalsResultsTable title={selectedFinalsCategory} rows={finalsRows} />
                </>
              ) : (
                <section className="results-card text-slate-600">
                  Finals are active, but no finals scores have been entered yet.
                </section>
              )
            ) : null}

            <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="results-card">
                <div className="results-kicker">{activeScrambleSession ? "Active scramble session" : "Live schedule"}</div>
                <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                  {activeBlock ? activeBlock.label : "No block live"}
                </h2>
                {activeBlock ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="results-chip">{formatSchedulePhaseLabel(activeBlock.phase_type)}</span>
                      {activeBlock.audience_label ? <span className="results-chip">{activeBlock.audience_label}</span> : null}
                    </div>
                    <div className="mt-4 text-base text-slate-600">
                      {formatTimeRange(activeBlock.start_time, activeBlock.end_time)}
                    </div>
                    {activeScrambleSession ? (
                        <div className="results-alert results-alert-success mt-4">
                        This is the live shared session window. Multiple climbers can score across the wall during this block.
                      </div>
                    ) : null}
                    {activeScrambleSession ? (
                      <div className="mt-4 rounded-[1.35rem] border border-slate-200 bg-white/80 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="results-kicker">Per-boulder guide</div>
                            <div className="mt-2 text-lg font-semibold text-slate-950">Live wall traffic</div>
                          </div>
                          <div className="results-chip">
                            {snapshot.boulderQueue.length} live {snapshot.boulderQueue.length === 1 ? "check-in" : "check-ins"}
                          </div>
                        </div>

                        {queueByClimb.size ? (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {Array.from(queueByClimb.entries())
                              .sort(([left], [right]) => left - right)
                              .map(([climbNumber, entries]) => (
                                <div key={climbNumber} className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="font-semibold text-slate-950">Boulder {climbNumber}</div>
                                    <div className="results-chip">{entries.length} checked in</div>
                                  </div>
                                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                                    <div>
                                      {entries.length <= 1
                                        ? "Open wall. Little to no wait right now."
                                        : entries.length <= 3
                                          ? "Light traffic. A short queue is forming."
                                          : "Busy wall. Expect a bit of a wait."}
                                    </div>
                                    {entries.slice(0, 4).map((entry) => (
                                      <div key={entry.climber_id} className="flex items-center justify-between gap-3">
                                        <span className="truncate">
                                          {entry.climber_name}
                                        </span>
                                        <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                          #{entry.climber_number}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <div className="mt-4 text-sm text-slate-600">
                            No climbers are checked into a boulder yet for this session.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-4 space-y-3">
                    <p className="text-base text-slate-600">
                      {snapshot.competition.official_schedule_url
                        ? "No in-app schedule blocks are live yet. The official event schedule is available below."
                        : "Staff has not marked a live schedule block yet."}
                    </p>
                    {snapshot.competition.official_schedule_url ? (
                      <a
                        href={snapshot.competition.official_schedule_url}
                        target="_blank"
                        rel="noreferrer"
                        className="results-secondary-button inline-flex"
                      >
                        Open official schedule
                      </a>
                    ) : null}
                  </div>
                )}

                <div className="mt-6 grid gap-3">
                  {snapshot.competition.schedule_blocks.map((block) => (
                    <div key={block.id} className="results-meta-card">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-slate-950">{block.label}</div>
                          <div className="mt-1 text-sm text-slate-600">
                            {formatTimeRange(block.start_time, block.end_time)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="results-chip">{formatSchedulePhaseLabel(block.phase_type)}</span>
                          {block.is_active ? <span className="results-chip">Live</span> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="results-card">
                {workflowGuide && showFormatGuide ? (
                  <div className="results-meta-card">
                    <div className="results-kicker">Format guide</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{workflowGuide.headline}</div>
                    <p className="mt-3 text-slate-600">{workflowGuide.summary}</p>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      {workflowGuide.notes.map((note) => (
                        <div key={note}>{note}</div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="results-kicker">Competition snapshot</div>
                <div className="mt-4 grid auto-rows-fr gap-4 sm:grid-cols-2">
                  <div className="results-meta-card self-start">
                    <div className="results-kicker">Climbers</div>
                    <div className="mt-2 text-3xl font-semibold text-slate-950">{snapshot.climbers.length}</div>
                  </div>
                  {finalsEnabled ? (
                    <div className="results-meta-card self-start">
                      <div className="results-kicker">Scores recorded</div>
                      <div className="mt-2 text-3xl font-semibold text-slate-950">
                        {finalsProjectionRows.reduce((sum, row) => sum + row.scoredCount, 0)}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        {finalsProjectionSummary?.progress ?? "Qualifier scoring progress updates live."}
                      </div>
                    </div>
                  ) : (
                    <div className="results-meta-card self-start">
                      <div className="results-kicker">Round structure</div>
                      <div className="mt-2 text-lg font-semibold text-slate-950">Qualifier only</div>
                      <div className="mt-2 text-sm text-slate-600">
                        This event ends after qualifier rankings without a separate finals round.
                      </div>
                    </div>
                  )}
                  {finalsEnabled ? (
                    <div className="results-meta-card self-start">
                      <div className="results-kicker">Eligible finals categories</div>
                      <div className="mt-2 text-3xl font-semibold text-slate-950">{finalsProjectionRows.length}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Top {snapshot.competition.finals_cutoff} per category can advance to finals.
                      </div>
                    </div>
                  ) : null}
                  <div className="results-meta-card self-start">
                    <div className="results-kicker">Scorecard access</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">
                      {scrambleFormat ? "Private scorecards per climber" : "Private links per climber"}
                    </div>
                    {scrambleFormat ? (
                      <div className="mt-2 text-sm text-slate-600">
                        Climbers self-score inside their session while the public leaderboard can keep updating live.
                      </div>
                    ) : null}
                  </div>
                  {finalsEnabled ? (
                    <div className="results-meta-card self-start sm:col-span-2">
                      <div className="results-kicker">{finalistsLabel}</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {finalsProjectionSummary?.headline ?? `${snapshot.finalists.length} ${finalistsLabel.toLowerCase()}`}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        {finalsProjectionSummary?.detail}
                      </div>
                      {!snapshot.finalistsPersisted && !isFinalsStage(snapshot.competition) ? (
                        <div className="mt-4 rounded-[1.15rem] border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-600">
                          Live qualifier projections stay category-based. Tie advances do not expand until the qualifier round is closed.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="results-meta-card self-start">
                    <div className="results-kicker">{scrambleFormat ? "Live leaderboard" : "Standings"}</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">
                      {scrambleFormat ? "Live session rankings" : "Public rankings"}
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      {scrambleFormat
                        ? "Standings update as climbers submit scores during the active scramble session."
                        : "Open the standings page to follow qualifier or finals rankings."}
                    </div>
                    <Link href={buildCompetitionPath(slug, "leaderboard")} className="results-secondary-button mt-4">
                      View standings
                    </Link>
                  </div>
                </div>

                {finalsEnabled && finalsProjectionRows.length ? (
                  <div className="mt-6">
                    <div className="results-kicker">Finals projection by category</div>
                    <div className="mt-3 space-y-3">
                      {finalsProjectionRows.map((row) => (
                        <div key={row.displayCategory} className="results-meta-card">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-lg font-semibold text-slate-950">{row.displayCategory}</div>
                              <div className="mt-1 text-sm text-slate-600">
                                {row.registeredCount} registered | Top {row.cutoff} advance
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="results-kicker">{finalistsLabel}</div>
                              <div className="mt-2 text-2xl font-semibold text-slate-950">{row.projectedCount}</div>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="results-chip">
                              {row.scoredCount}/{row.registeredCount} scored
                            </span>
                            <span
                              className={
                                row.status === "Locked"
                                  ? "results-chip border-sky-200 bg-sky-50 text-sky-700"
                                  : row.status === "Tie at cutoff"
                                    ? "results-chip border-amber-200 bg-amber-50 text-amber-700"
                                    : row.status === "Awaiting scores"
                                      ? "results-chip border-slate-200 bg-slate-50 text-slate-700"
                                      : "results-chip"
                              }
                            >
                              {row.status}
                            </span>
                            {row.allTiedAtZero ? (
                              <span className="results-chip border-slate-200 bg-slate-50 text-slate-700">
                                Everyone tied
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 text-sm text-slate-600">{row.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-6">
                  <div className="results-kicker">Categories</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {snapshot.competition.categories.map((category) => (
                      <span key={category.id} className="results-chip">
                        {category.display_name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-6">
                  <div className="results-kicker">
                    {showFinalsClimbingOrder ? "Finals climbing order" : "Registered climbers"}
                  </div>
                  {showFinalsClimbingOrder ? (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-[24px] border border-sky-200 bg-sky-50/70 px-5 py-4 text-sm text-slate-700">
                        {currentFinalist ? (
                          <>
                            <span className="font-semibold text-slate-950">
                              {snapshot.competition.current_phase === "observation"
                                ? "First out"
                                : "Currently climbing"}
                              :{" "}
                              {currentFinalist.finalist.name}
                            </span>
                            {" · "}
                            {currentFinalist.finalist.display_category}
                            {nextFinalist ? (
                              <>
                                {" · On deck: "}
                                <span className="font-semibold text-slate-950">{nextFinalist.finalist.name}</span>
                              </>
                            ) : null}
                          </>
                        ) : (
                          "All finalists have recorded scores."
                        )}
                      </div>

                      {finalsOrderRows.map((entry, index) => {
                        const isCurrent = index === currentFinalistIndex;
                        const isNext = index === currentFinalistIndex + 1 && currentFinalistIndex >= 0;

                        return (
                          <div
                            key={entry.finalist.climber_id}
                            className={
                              isCurrent
                                ? "results-meta-card border-sky-300 bg-sky-50/70"
                                : isNext
                                  ? "results-meta-card border-amber-200 bg-amber-50/70"
                                  : "results-meta-card"
                            }
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="results-chip">#{entry.displayOrder}</span>
                                  {isCurrent ? (
                                    <span className="results-chip">
                                      {snapshot.competition.current_phase === "observation" ? "First out" : "Current"}
                                    </span>
                                  ) : null}
                                  {isNext ? <span className="results-chip">On deck</span> : null}
                                </div>
                                <div className="mt-3 text-lg font-semibold text-slate-950">{entry.finalist.name}</div>
                                <div className="mt-1 text-sm text-slate-600">
                                  {entry.climber
                                    ? `#${entry.climber.climber_number} | ${entry.finalist.display_category} | ${entry.climber.province}`
                                    : entry.finalist.display_category}
                                </div>
                              </div>
                              <div className="text-sm text-slate-600">
                                {snapshot.competition.current_phase === "finals_open"
                                  ? `${entry.completedProblems}/${snapshot.competition.finals_problem_count} boulders scored`
                                  : `Qualifier rank #${entry.finalist.qualifier_rank}`}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <Link href={`${buildCompetitionPath(slug, "leaderboard")}`} className="results-secondary-button">
                        View standings
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {snapshot.climbers.slice(0, 6).map((climber) => (
                        <div key={climber.id} className="results-meta-card">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-lg font-semibold text-slate-950">{climber.name}</div>
                              <div className="mt-1 text-sm text-slate-600">
                                #{climber.climber_number} | {climber.display_category} | {climber.province}
                              </div>
                            </div>
                            <div className="text-sm text-slate-600">
                              {getTimeSlotLabel(climber.time_slot_id, snapshot.competition)}
                            </div>
                          </div>
                        </div>
                      ))}
                      {snapshot.climbers.length > 6 ? (
                        <Link href={`${buildCompetitionPath(slug, "leaderboard")}`} className="results-secondary-button">
                          View all rankings
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>
              </section>
            </section>

          </>
        ) : loading ? (
          <section className="results-card text-slate-600">Loading competition...</section>
        ) : null}
      </div>
    </main>
  );
}
