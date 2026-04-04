"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import CompetitionHero from "@/components/competition-hero";
import FinalsResultsTable from "@/components/finals-results-table";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";
import {
  buildCompetitionPath,
  formatCompetitionPhaseLabel,
  formatSchedulePhaseLabel,
  formatTimeRange,
  formatUsesSelfScoredQualifiers,
  getActiveQueueSessionBlock,
  getActiveScheduleBlock,
} from "@/lib/scoring";

export default function CompetitionOverviewPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    if (!supabaseConfigured || !snapshot) {
      return;
    }

    const competitionId = snapshot.competition.id;
    const channel = publicSupabase
      .channel(`competition-${competitionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "competitions", filter: `id=eq.${competitionId}` }, refresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "competition_schedule_blocks", filter: `competition_id=eq.${competitionId}` },
        refresh
      )
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
  const orderedScheduleBlocks = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const toTimestamp = (value: string | null) => {
      if (!value) {
        return Number.MAX_SAFE_INTEGER;
      }

      const timestamp = new Date(value).getTime();
      return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
    };

    return [...snapshot.competition.schedule_blocks].sort((left, right) => {
      const startDiff = toTimestamp(left.start_time) - toTimestamp(right.start_time);
      if (startDiff !== 0) {
        return startDiff;
      }

      const endDiff = toTimestamp(left.end_time) - toTimestamp(right.end_time);
      if (endDiff !== 0) {
        return endDiff;
      }

      return left.label.localeCompare(right.label);
    });
  }, [snapshot]);
  const queueByClimb = useMemo(() => {
    const grouped = new Map<number, CompetitionSnapshot["boulderQueue"]>();
    snapshot?.boulderQueue.forEach((entry) => {
      const next = grouped.get(entry.climb_number) ?? [];
      next.push(entry);
      grouped.set(entry.climb_number, next);
    });
    return grouped;
  }, [snapshot]);
  const categoryById = useMemo(
    () => new Map(snapshot?.competition.categories.map((category) => [category.id, category]) ?? []),
    [snapshot]
  );
  const getBlockAgeGroups = useCallback(
    (blockIdList: string[]) => {
      const ageGroups = new Set<string>();
      blockIdList.forEach((categoryId) => {
        const category = categoryById.get(categoryId);
        if (category?.age_group) {
          ageGroups.add(category.age_group);
        }
      });
      return Array.from(ageGroups);
    },
    [categoryById]
  );
  const nextBlock = useMemo(() => {
    if (!activeBlock) {
      return null;
    }

    const activeIndex = orderedScheduleBlocks.findIndex((block) => block.id === activeBlock.id);
    if (activeIndex < 0) {
      return null;
    }

    return orderedScheduleBlocks[activeIndex + 1] ?? null;
  }, [activeBlock, orderedScheduleBlocks]);
  const activeBlockIndex = useMemo(
    () => (activeBlock ? orderedScheduleBlocks.findIndex((block) => block.id === activeBlock.id) : -1),
    [activeBlock, orderedScheduleBlocks]
  );
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
    snapshot?.competition.current_phase === "finals_open" ||
    snapshot?.competition.current_phase === "finals_closed" ||
    snapshot?.competition.current_phase === "results";

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
                  </section>
                  <FinalsResultsTable title={selectedFinalsCategory} rows={finalsRows} />
                </>
              ) : (
                <section className="results-card text-slate-600">
                  Finals are active, but no finals scores have been entered yet.
                </section>
              )
            ) : null}

            <section className="results-card">
              <div className="results-kicker">{activeScrambleSession ? "Active scramble session" : "Live schedule"}</div>
              <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                {activeBlock ? activeBlock.label : "No block live"}
              </h2>

              {!activeBlock ? (
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
              ) : null}

              {orderedScheduleBlocks.length ? (
                <div className="results-schedule-list mt-6 grid gap-3">
                  {orderedScheduleBlocks.map((block, index) => {
                    const blockAgeGroups = getBlockAgeGroups(block.eligible_category_ids);
                    const isPastBlock = activeBlockIndex >= 0 && index < activeBlockIndex;
                    const isNextBlock = activeBlockIndex >= 0 && index === activeBlockIndex + 1;

                    if (block.is_active) {
                      return (
                        <div key={block.id} className="results-live-stage">
                          <div className="results-live-stage__grid">
                            <div className="min-w-0">
                              <div className="flex flex-wrap gap-2">
                                <span className="results-chip results-chip-live">
                                  <span className="results-live-dot" aria-hidden="true" />
                                  Now live
                                </span>
                                <span className="results-chip">{formatSchedulePhaseLabel(block.phase_type)}</span>
                                {block.audience_label ? <span className="results-chip">{block.audience_label}</span> : null}
                              </div>

                              <div className="results-live-stage__headline">
                                <div className="results-kicker">Live Block</div>
                                <div className="results-live-stage__title">{block.label}</div>
                                <div className="results-live-stage__time">
                                  {formatTimeRange(block.start_time, block.end_time)}
                                </div>
                              </div>

                              {blockAgeGroups.length ? (
                                <div className="results-live-stage__categories">
                                  <div className="results-kicker">Live Categories</div>
                                  <div className="results-live-stage__category-row">
                                    {blockAgeGroups.map((ageGroup) => (
                                      <span key={`${block.id}-${ageGroup}`} className="results-live-stage__category-pill">
                                        {ageGroup}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            {nextBlock ? (
                              <div className="results-live-stage__next">
                                <div className="results-kicker">Up Next</div>
                                <div className="results-live-stage__next-label">{nextBlock.label}</div>
                                <div className="results-live-stage__next-time">
                                  {formatTimeRange(nextBlock.start_time, nextBlock.end_time)}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={block.id}
                        className={[
                          "results-meta-card",
                          isPastBlock ? "results-schedule-block-past" : "",
                          isNextBlock ? "results-schedule-block-next" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold text-slate-950">{block.label}</div>
                            <div className="mt-1 text-sm text-slate-600">
                              {formatTimeRange(block.start_time, block.end_time)}
                            </div>
                            {blockAgeGroups.length ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {blockAgeGroups.map((ageGroup) => (
                                  <span key={`${block.id}-${ageGroup}`} className="results-chip">
                                    {ageGroup}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {isNextBlock ? <span className="results-chip border-sky-200 bg-sky-50 text-sky-700">Up next</span> : null}
                            <span className="results-chip">{formatSchedulePhaseLabel(block.phase_type)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {activeScrambleSession ? (
                <div className="results-alert results-alert-success mt-4">
                  This is the live shared session window. Multiple climbers can score across the wall during this block.
                </div>
              ) : null}

              {activeScrambleSession && queueByClimb.size ? (
                <div className="mt-4 rounded-[1.35rem] border border-slate-200 bg-white/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Wall traffic</div>
                      <div className="mt-2 text-lg font-semibold text-slate-950">Live boulder check-ins</div>
                    </div>
                    <div className="results-chip">
                      {snapshot.boulderQueue.length} live {snapshot.boulderQueue.length === 1 ? "check-in" : "check-ins"}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {Array.from(queueByClimb.entries())
                      .sort(([left], [right]) => left - right)
                      .map(([climbNumber, entries]) => (
                        <div key={climbNumber} className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold text-slate-950">Boulder {climbNumber}</div>
                            <div className="results-chip">{entries.length} checked in</div>
                          </div>
                          <div className="mt-3 text-sm text-slate-600">
                            {entries.length <= 1
                              ? "Open wall. Little to no wait right now."
                              : entries.length <= 3
                                ? "Light traffic. A short queue is forming."
                                : "Busy wall. Expect a bit of a wait."}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="results-card">
              <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <div className="results-kicker">Categories</div>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-950">Competition categories</h2>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                    Public standings stay separate by category. Open the rankings page for the current results.
                  </p>
                </div>
                <Link href={buildCompetitionPath(slug, "leaderboard")} className="results-secondary-button w-full sm:w-auto">
                  View standings
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {snapshot.competition.categories.map((category) => (
                  <span key={category.id} className="results-chip">
                    {category.display_name}
                  </span>
                ))}
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="results-meta-card results-meta-card-compact">
                  <div className="results-kicker">Scorecards</div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {scrambleFormat ? "Private scorecards" : "Private links"}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {scrambleFormat ? "Each climber gets a live self-scoring link." : "Each climber gets a secure scoring link."}
                  </div>
                </div>
                <div className="results-meta-card results-meta-card-compact">
                  <div className="results-kicker">Current phase</div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {formatCompetitionPhaseLabel(snapshot.competition.current_phase)}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Rankings and event status update here as the competition moves through the day.
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : loading ? (
          <section className="results-card text-slate-600">Loading competition...</section>
        ) : null}
      </div>
    </main>
  );
}
