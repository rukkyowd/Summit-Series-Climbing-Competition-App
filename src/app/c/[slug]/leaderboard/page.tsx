"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { DemoWizardSidebar } from "@/components/demo-wizard-sidebar";
import FinalsResultsTable from "@/components/finals-results-table";
import SiteHeader from "@/components/site-header";
import { Alert } from "@/components/ui/alert";
import { Surface } from "@/components/ui/surface";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { getDemoPublicWizardGuidance } from "@/lib/demo-wizard";
import { getLiveLeaderboardCopy, getPublicResultsState } from "@/lib/public-results";
import { sortQualifierLeaderboardForDisplay } from "@/lib/scoring";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";

export default function CompetitionLeaderboardPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const presentationMode = searchParams?.get("presentation") === "1";
  const demoGuideActive = searchParams?.get("demo") === "act4";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);
  const [selectedFinalsCategory, setSelectedFinalsCategory] = useState("");

  const refresh = useCallback(async () => {
    if (!slug) {
      return;
    }

    try {
      const nextSnapshot = await getCompetitionSnapshot(slug);
      setSnapshot(nextSnapshot);
      setLastUpdatedAt(Date.now());
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load rankings.");
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
    const refreshLeaderboard = () => {
      void refresh();
    };
    const channel = publicSupabase
      .channel(`leaderboard-${competitionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "qualifier_attempts", filter: `competition_id=eq.${competitionId}` },
        refreshLeaderboard
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "competition_finalists", filter: `competition_id=eq.${competitionId}` },
        refreshLeaderboard
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "final_attempts", filter: `competition_id=eq.${competitionId}` },
        refreshLeaderboard
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "competitions", filter: `id=eq.${competitionId}` }, refreshLeaderboard)
      .subscribe();

    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, [refresh, snapshot]);

  const qualifierGroups = snapshot
    ? Array.from(
        sortQualifierLeaderboardForDisplay(snapshot.qualifierLeaderboard, snapshot.competition.categories).reduce((groups, row) => {
          const rows = groups.get(row.display_category) ?? [];
          rows.push(row);
          groups.set(row.display_category, rows);
          return groups;
        }, new Map<string, CompetitionSnapshot["qualifierLeaderboard"]>())
      ).map(([category, rows]) => ({ category, rows }))
    : [];
  const rowAnimationKey = useMemo(() => (demoGuideActive ? lastUpdatedAt : 0), [demoGuideActive, lastUpdatedAt]);
  const demoOverlayActive = demoGuideActive && Boolean(snapshot?.competition.is_demo);
  const finalsGroups = useMemo(() => {
    const groups = new Map<string, CompetitionSnapshot["finalsLeaderboard"]>();
    snapshot?.finalsLeaderboard.forEach((entry) => {
      const rows = groups.get(entry.display_category) ?? [];
      rows.push(entry);
      groups.set(entry.display_category, rows);
    });
    return groups;
  }, [snapshot?.finalsLeaderboard]);
  const finalsCategories = useMemo(() => Array.from(finalsGroups.keys()).sort(), [finalsGroups]);
  const activeFinalsCategory = selectedFinalsCategory || finalsCategories[0] || "";
  const selectedFinalsRows = finalsGroups.get(activeFinalsCategory) ?? [];
  const publicResultsState = useMemo(
    () =>
      getPublicResultsState({
        phase: snapshot?.competition.current_phase,
        finalsLeaderboard: snapshot?.finalsLeaderboard ?? [],
      }),
    [snapshot?.competition.current_phase, snapshot?.finalsLeaderboard]
  );
  const liveLeaderboardCopy = getLiveLeaderboardCopy(publicResultsState);
  const finalsVisible = publicResultsState.finalsStarted;
  const finalsScorePresent = publicResultsState.hasFinalsScores;
  const demoPublicReady = Boolean(finalsVisible && (snapshot?.finalists.length ?? 0) > 0 && finalsScorePresent);
  const demoWizardGuidance = useMemo(
    () => getDemoPublicWizardGuidance(demoPublicReady),
    [demoPublicReady]
  );

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
        {!presentationMode ? <SiteHeader light competitionSlug={slug} /> : null}

        {error ? <Alert variant="error">{error}</Alert> : null}
        {snapshot?.competition.is_demo ? (
          <div className="results-alert results-alert-success">
            Demo event: this public leaderboard refreshes every few seconds from the same scores saved by the real judge panel.
          </div>
        ) : null}
        {demoOverlayActive ? (
          <DemoWizardSidebar
            currentStep={demoPublicReady ? "finish" : "public"}
            title={demoWizardGuidance.title}
            instruction="This live leaderboard uses the same public results surface climbers and spectators can open during the event."
            why={demoWizardGuidance.why}
            blockingMessage={demoWizardGuidance.blockingMessage}
            progress={{
              eventReady: true,
              dataPopulated: true,
              keyScoreCorrected: true,
              organizerAdvanced: (snapshot?.finalists.length ?? 0) > 0,
              publicReady: demoPublicReady,
            }}
            primaryAction={
              demoPublicReady
                ? { label: "Public Page", href: `/c/${slug}?demo=act4` }
                : { label: "Review Standings", targetAnchor: "leaderboard-standings" }
            }
            secondaryActions={[{ label: "Demo Home", href: "/demo" }]}
          />
        ) : null}

        {snapshot ? (
          <>
            {!presentationMode ? (
              <Surface variant="card">
                <div className="results-kicker">{liveLeaderboardCopy.kicker}</div>
                <h1 className="mt-2 text-4xl font-semibold text-slate-950 sm:text-5xl">
                  {snapshot.competition.name}
                </h1>
                <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600">
                  {liveLeaderboardCopy.description}
                </p>
              </Surface>
            ) : null}
            <div className="grid gap-4" data-demo-anchor="leaderboard-standings">
              {publicResultsState.mode === "finals" ? (
                publicResultsState.finalsPending ? (
                  <Surface variant="card">
                    <div className="results-kicker">Finals standings</div>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-950">{liveLeaderboardCopy.pendingTitle}</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
                      {liveLeaderboardCopy.pendingText}
                    </p>
                  </Surface>
                ) : finalsCategories.length ? (
                  <>
                    <Surface variant="card">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="results-kicker">Finals standings</div>
                          <h2 className="text-2xl font-semibold text-slate-950">
                            {activeFinalsCategory || "Final standings"}
                          </h2>
                        </div>
                      </div>
                      <div className="finals-category-picker mt-5">
                        {finalsCategories.map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setSelectedFinalsCategory(category)}
                            className={
                              category === activeFinalsCategory
                                ? "finals-category-pill finals-category-pill-active"
                                : "finals-category-pill"
                            }
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                    </Surface>
                    <FinalsResultsTable title={activeFinalsCategory} rows={selectedFinalsRows} />
                  </>
                ) : (
                  <Surface variant="card" className="text-slate-600">
                    Finals are active, but finalists are not available yet.
                  </Surface>
                )
              ) : qualifierGroups.length ? (
                qualifierGroups.map((group) => (
                  <Surface key={group.category} variant="card">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="results-kicker">Qualifier standings</div>
                        <h2 className="text-2xl font-semibold text-slate-950">{group.category}</h2>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[42rem] text-left text-sm">
                        <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          <tr>
                            <th className="py-2 pr-3">Rank</th>
                            <th className="py-2 pr-3">Climber</th>
                            <th className="py-2 pr-3">Tops</th>
                            <th className="py-2 pr-3">Zones</th>
                            <th className="py-2 pr-3">Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {group.rows.map((row) => (
                            <tr
                              key={`${row.climber_id}:${rowAnimationKey}`}
                              className={demoGuideActive ? "demo-leaderboard-row-update" : undefined}
                              style={demoGuideActive ? { animationDelay: `${Math.min(0.45, row.category_rank * 0.035)}s` } : undefined}
                              data-update-key={rowAnimationKey}
                            >
                              <td className="py-3 pr-3 font-semibold text-slate-950">#{row.category_rank}</td>
                              <td className="py-3 pr-3">
                                <div className="font-medium text-slate-950">{row.name}</div>
                                <div className="text-xs text-slate-500">#{row.climber_number}</div>
                              </td>
                              <td className="py-3 pr-3">{row.topped_count}</td>
                              <td className="py-3 pr-3">{row.zone_count}</td>
                              <td className="py-3 pr-3">{row.total_score.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Surface>
                ))
              ) : (
                <Surface variant="card" className="text-slate-600">
                  {liveLeaderboardCopy.pendingText}
                </Surface>
              )}
            </div>
          </>
        ) : (
          <Surface variant="card" className="text-slate-600">
            Loading rankings...
          </Surface>
        )}
      </div>
    </main>
  );
}
