"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import CompetitionHero from "@/components/competition-hero";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";
import {
  buildCompetitionPath,
  formatDateRange,
  formatSchedulePhaseLabel,
  formatTimeRange,
  getActiveScheduleBlock,
  getEventWorkflowGuide,
  getTimeSlotLabel,
} from "@/lib/scoring";

export default function CompetitionOverviewPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_schedule_blocks", filter: `competition_id=eq.${competitionId}` }, refresh)
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
  const workflowGuide = useMemo(
    () => (snapshot ? getEventWorkflowGuide(snapshot.competition) : null),
    [snapshot]
  );

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light competitionSlug={slug} />

        {error ? <div className="results-alert results-alert-error">{error}</div> : null}

        {snapshot ? (
          <>
            <CompetitionHero competition={snapshot.competition} />

            <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="results-card">
                <div className="results-kicker">Live schedule</div>
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
                  </>
                ) : (
                  <p className="mt-4 text-base text-slate-600">
                    Staff has not marked a live schedule block yet.
                  </p>
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
                {workflowGuide ? (
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
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="results-meta-card">
                    <div className="results-kicker">Climbers</div>
                    <div className="mt-2 text-3xl font-semibold text-slate-950">{snapshot.climbers.length}</div>
                  </div>
                  <div className="results-meta-card">
                    <div className="results-kicker">Finalists</div>
                    <div className="mt-2 text-3xl font-semibold text-slate-950">{snapshot.finalists.length}</div>
                  </div>
                  <div className="results-meta-card">
                    <div className="results-kicker">Competition dates</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">
                      {formatDateRange(snapshot.competition.start_date, snapshot.competition.end_date)}
                    </div>
                  </div>
                  <div className="results-meta-card">
                    <div className="results-kicker">Scorecard access</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">
                      Private links per climber
                    </div>
                  </div>
                </div>

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
                  <div className="results-kicker">Registered climbers</div>
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
