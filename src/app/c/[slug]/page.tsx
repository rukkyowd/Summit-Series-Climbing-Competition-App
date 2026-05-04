"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import CompetitionHero from "@/components/competition-hero";
import { DemoWizardSidebar } from "@/components/demo-wizard-sidebar";
import FinalsResultsTable from "@/components/finals-results-table";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { Surface } from "@/components/ui/surface";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import {
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NAME,
  DEMO_TARGET_CLIMBER_NUMBER,
  isDemoTargetCorrected,
} from "@/lib/demo-scenario";
import { clearOfflineQueueForCompetition } from "@/lib/staff-offline-queue";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";
import {
  buildCompetitionPath,
  buildDisplayPath,
  formatCompetitionPhaseLabel,
  formatSchedulePhaseLabel,
  formatTimeRange,
  formatUsesSelfScoredQualifiers,
  getActiveQueueSessionBlock,
  getActiveQualifierStyleRound,
  getActiveScheduleBlock,
  getTimeSlotLabel,
  filterAttemptsForRound,
  parseScheduleTimeToMinutes,
} from "@/lib/scoring";

export default function CompetitionOverviewPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const demoGuideActive = searchParams?.get("demo") === "1";
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
      .on("postgres_changes", { event: "*", schema: "public", table: "final_attempts", filter: `competition_id=eq.${competitionId}` }, refresh)
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

    return [...snapshot.competition.schedule_blocks].sort((left, right) => {
      const startDiff = parseScheduleTimeToMinutes(left.start_time) - parseScheduleTimeToMinutes(right.start_time);
      if (startDiff !== 0) {
        return startDiff;
      }

      const endDiff = parseScheduleTimeToMinutes(left.end_time) - parseScheduleTimeToMinutes(right.end_time);
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
  const resultsPublished = snapshot?.competition.current_phase === "results";
  const activeQualifierRoundId =
    snapshot?.activeQualifierRound?.id ??
    (snapshot ? getActiveQualifierStyleRound(snapshot.competition)?.id : null);
  const demoTargetClimber = snapshot?.climbers.find(
    (climber) =>
      climber.climber_number === DEMO_TARGET_CLIMBER_NUMBER ||
      climber.name.toLowerCase() === DEMO_TARGET_CLIMBER_NAME.toLowerCase()
  );
  const demoTargetAttempt =
    demoTargetClimber && activeQualifierRoundId
      ? filterAttemptsForRound(demoTargetClimber.qualifier_attempts, activeQualifierRoundId).find(
          (attempt) => attempt.climb_number === DEMO_TARGET_CLIMB_NUMBER
        ) ?? null
      : null;
  const demoWizardActive = demoGuideActive && Boolean(snapshot?.competition.is_demo);
  const demoWizardProgress = {
    eventReady: Boolean(snapshot),
    dataPopulated: Boolean(snapshot?.climbers.length),
    keyScoreCorrected: isDemoTargetCorrected(demoTargetAttempt),
    organizerAdvanced: resultsPublished,
    publicReady: resultsPublished,
  };
  const liveCategoryCount = activeBlock ? getBlockAgeGroups(activeBlock.eligible_category_ids).length : 0;
  const overviewNavItems = useMemo(
    () => [
      { href: buildCompetitionPath(slug), label: "Overview" },
      { href: `${buildCompetitionPath(slug)}#start-list`, label: "Start list" },
      { href: buildCompetitionPath(slug, "register"), label: "Register" },
      { href: buildCompetitionPath(slug, "scorecard"), label: "Scorecard" },
      { href: buildCompetitionPath(slug, "leaderboard"), label: "Live leaderboard" },
    ],
    [slug]
  );
  const sortedStartList = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const scheduleIndex = new Map(
      snapshot.competition.schedule_blocks.map((block, index) => [block.id, index] as const)
    );

    return [...snapshot.climbers].sort((left, right) => {
      const leftSlotIndex =
        left.time_slot_id && scheduleIndex.has(left.time_slot_id)
          ? (scheduleIndex.get(left.time_slot_id) ?? Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;
      const rightSlotIndex =
        right.time_slot_id && scheduleIndex.has(right.time_slot_id)
          ? (scheduleIndex.get(right.time_slot_id) ?? Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;

      if (leftSlotIndex !== rightSlotIndex) {
        return leftSlotIndex - rightSlotIndex;
      }

      const leftCategoryOrder = categoryById.get(left.category_id ?? "")?.sort_order ?? Number.MAX_SAFE_INTEGER;
      const rightCategoryOrder = categoryById.get(right.category_id ?? "")?.sort_order ?? Number.MAX_SAFE_INTEGER;

      if (leftCategoryOrder !== rightCategoryOrder) {
        return leftCategoryOrder - rightCategoryOrder;
      }

      const leftNumber = Number.parseInt(left.climber_number, 10);
      const rightNumber = Number.parseInt(right.climber_number, 10);
      const leftNumberValid = Number.isFinite(leftNumber);
      const rightNumberValid = Number.isFinite(rightNumber);

      if (leftNumberValid && rightNumberValid && leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }

      return left.name.localeCompare(right.name);
    });
  }, [categoryById, snapshot]);

  useEffect(() => {
    if (!selectedFinalsCategory && finalsCategories.length) {
      setSelectedFinalsCategory(finalsCategories[0]);
      return;
    }

    if (selectedFinalsCategory && !finalsGroups.has(selectedFinalsCategory)) {
      setSelectedFinalsCategory(finalsCategories[0] ?? "");
    }
  }, [finalsCategories, finalsGroups, selectedFinalsCategory]);

  const finishDemo = useCallback(async () => {
    if (!snapshot?.competition.id) {
      throw new Error("Demo competition is not loaded yet.");
    }

    const response = await fetch("/api/demo/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitionId: snapshot.competition.id }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? "Unable to finish demo.");
    }

    await clearOfflineQueueForCompetition(snapshot.competition.id);
    router.push("/demo");
  }, [router, snapshot?.competition.id]);

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light competitionSlug={slug} navItems={overviewNavItems} />

        {error ? <Alert variant="error">{error}</Alert> : null}

        {snapshot ? (
          <>
            {snapshot.competition.is_demo ? (
              <div className="results-alert results-alert-success">
                Demo event: use this page to view the public schedule, leaderboard links, and results exactly
                as competitors and spectators would see them.
              </div>
            ) : null}
            {demoWizardActive ? (
              <DemoWizardSidebar
                currentStep="public"
                title={resultsPublished ? "View public results" : "Public page preview"}
                instruction={
                  resultsPublished
                    ? "Review the schedule and final standings, then finish the demo when you are done."
                    : "The public page is available now. Publish results from Organizer Operations for the full ending."
                }
                why="This is the buyer-facing payoff: athletes, parents, coaches, and spectators see one polished event page."
                progress={demoWizardProgress}
                primaryAction={
                  resultsPublished
                    ? { label: "Jump to public results", targetAnchor: "public-results" }
                    : { label: "Back to Organizer", href: `/staff/c/${slug}?demo=1` }
                }
                secondaryActions={[
                  { label: "Jump to schedule", targetAnchor: "public-schedule" },
                  { label: "Leaderboard", href: `/c/${slug}/leaderboard?demo=1` },
                  { label: "Finish Demo", onClick: finishDemo },
                  { label: "Demo home", href: "/demo" },
                ]}
              />
            ) : null}
            <CompetitionHero competition={snapshot.competition} />

            <section className="results-editorial-panel">
              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
                <SectionHeader
                  kicker="What should I do now?"
                  title={
                    resultsPublished
                      ? "Final results are published."
                      : activeBlock
                        ? `${activeBlock.label} is the current focus.`
                        : "The event page is ready even before the first live block starts."
                  }
                  description={
                    resultsPublished
                      ? "Athletes, coaches, parents, and spectators can review the final standings below."
                      : "Open the action you need first, then use the schedule and start list below for the deeper event details."
                  }
                />
                <div className="results-link-list">
                  <Link href={buildCompetitionPath(slug, "register")} className={buttonStyles({ variant: "primary", fullWidth: true })}>
                    Open registration
                  </Link>
                  <Link href={buildCompetitionPath(slug, "scorecard")} className={buttonStyles({ variant: "secondary", fullWidth: true })}>
                    Open scorecard
                  </Link>
                  <Link href={buildCompetitionPath(slug, "leaderboard")} className={buttonStyles({ variant: "secondary", fullWidth: true })}>
                    Open live leaderboard
                  </Link>
                  <Link href={buildDisplayPath(slug)} className={buttonStyles({ variant: "secondary", fullWidth: true })}>
                    Open big-screen display
                  </Link>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[1rem] border border-slate-200 bg-white/85 px-4 py-3">
                  <div className="results-kicker">Current phase</div>
                  <div className="mt-2 text-base font-semibold text-slate-950">
                    {formatCompetitionPhaseLabel(snapshot.competition.current_phase)}
                  </div>
                </div>
                <div className="rounded-[1rem] border border-slate-200 bg-white/85 px-4 py-3">
                  <div className="results-kicker">Field size</div>
                  <div className="mt-2 text-base font-semibold text-slate-950">
                    {snapshot.climbers.length} {snapshot.climbers.length === 1 ? "climber" : "climbers"}
                  </div>
                </div>
                <div className="rounded-[1rem] border border-slate-200 bg-white/85 px-4 py-3">
                  <div className="results-kicker">{resultsPublished ? "Results block" : "Live block"}</div>
                  <div className="mt-2 text-base font-semibold text-slate-950">
                    {activeBlock ? formatTimeRange(activeBlock.start_time, activeBlock.end_time) : "Waiting"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {activeBlock ? `${liveCategoryCount} live ${liveCategoryCount === 1 ? "group" : "groups"}` : "No schedule block is live yet."}
                  </div>
                </div>
                <div className="rounded-[1rem] border border-slate-200 bg-white/85 px-4 py-3">
                  <div className="results-kicker">Up next</div>
                  <div className="mt-2 text-base font-semibold text-slate-950">
                    {nextBlock ? nextBlock.label : "Nothing queued"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {nextBlock ? formatTimeRange(nextBlock.start_time, nextBlock.end_time) : "The current schedule has no later block."}
                  </div>
                </div>
              </div>
            </section>

            {finalsActive ? (
              finalsRows.length ? (
                <>
                  <section className="results-card" data-demo-anchor="public-results">
                    <div className="results-kicker">Finals results</div>
                    <h2 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950">Final standings</h2>
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
                <Surface variant="card" className="text-slate-600" data-demo-anchor="public-results">
                  Finals are active, but no finals scores have been entered yet.
                </Surface>
              )
            ) : null}

            <section className="results-card" data-demo-anchor="public-schedule">
              <div className="results-kicker">{activeScrambleSession ? "Active scramble session" : "Live schedule"}</div>
              <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                {activeBlock ? activeBlock.label : "No block live"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                The live block, the next block, and the public-facing schedule stay together here so athletes and spectators can orient themselves quickly.
              </p>

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
                <div className="results-schedule-list mt-4 grid gap-3">
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
                                <div className="results-live-stage__next-label break-words">{nextBlock.label}</div>
                                <div className="results-live-stage__next-time break-words">
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
                          <div className="min-w-0">
                            <div className="break-words text-lg font-semibold text-slate-950">{block.label}</div>
                            <div className="mt-1 break-words text-sm leading-relaxed text-slate-600">
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
                        <div key={climbNumber} className="min-w-0 rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold text-slate-950">Boulder {climbNumber}</div>
                            <div className="results-chip">{entries.length} checked in</div>
                          </div>
                          <div className="mt-3 break-words text-sm leading-relaxed text-slate-600">
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

            <section id="start-list" className="results-card scroll-mt-24">
              <div>
                <div className="results-kicker">Start list</div>
                <h2 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950">Registered athletes</h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                  See who is entered, which category they are in, and which session or wave they are assigned to.
                </p>
              </div>

              {!sortedStartList.length ? (
                <div className="results-meta-card mt-6 text-slate-600">
                  No athletes have registered yet.
                </div>
              ) : (
                <div className="results-data-scroll mt-6 hidden md:block">
                  <div className="min-w-[920px]">
                    <div className="grid grid-cols-[1.6fr_1fr_1.2fr_0.8fr] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <div>Athlete</div>
                      <div>Category</div>
                      <div>Session</div>
                      <div>Province</div>
                    </div>
                    {sortedStartList.map((climber) => (
                      <div key={climber.id} className="grid grid-cols-[1.6fr_1fr_1.2fr_0.8fr] gap-4 border-b border-slate-100 px-5 py-4 text-sm text-slate-700">
                        <div className="min-w-0">
                          <div className="break-words text-lg font-semibold text-slate-950">{climber.name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">#{climber.climber_number}</div>
                        </div>
                        <div>{climber.display_category}</div>
                        <div>{getTimeSlotLabel(climber.time_slot_id, snapshot.competition)}</div>
                        <div>{climber.province}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sortedStartList.length ? (
                <div className="mt-6 space-y-3 md:hidden">
                  {sortedStartList.map((climber) => (
                    <div key={climber.id} className="results-meta-card">
                      <div className="break-words text-lg font-semibold text-slate-950">{climber.name}</div>
                      <div className="mt-1 break-words text-sm leading-relaxed text-slate-600">
                        #{climber.climber_number} | {climber.province}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="results-chip">{climber.display_category}</span>
                        <span className="results-chip">{getTimeSlotLabel(climber.time_slot_id, snapshot.competition)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="results-card">
              <div>
                <div className="results-kicker">Categories</div>
                <h2 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950">Competition categories</h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                  Public standings stay separate by category. Open the rankings page for the current results.
                </p>
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
