"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { DemoWizardSidebar } from "@/components/demo-wizard-sidebar";
import SiteHeader from "@/components/site-header";
import { Alert } from "@/components/ui/alert";
import { Surface } from "@/components/ui/surface";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import {
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NAME,
  DEMO_TARGET_CLIMBER_NUMBER,
  isDemoTargetCorrected,
} from "@/lib/demo-scenario";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";
import { filterAttemptsForRound, getActiveQualifierStyleRound } from "@/lib/scoring";

export default function CompetitionLeaderboardPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const presentationMode = searchParams?.get("presentation") === "1";
  const demoGuideActive = searchParams?.get("demo") === "1";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "competitions", filter: `id=eq.${competitionId}` }, refreshLeaderboard)
      .subscribe();

    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, [refresh, snapshot]);

  const qualifierGroups = snapshot
    ? Array.from(
        snapshot.qualifierLeaderboard.reduce((groups, row) => {
          const rows = groups.get(row.display_category) ?? [];
          rows.push(row);
          groups.set(row.display_category, rows);
          return groups;
        }, new Map<string, CompetitionSnapshot["qualifierLeaderboard"]>())
      ).map(([category, rows]) => ({ category, rows }))
    : [];
  const rowAnimationKey = useMemo(() => (demoGuideActive ? lastUpdatedAt : 0), [demoGuideActive, lastUpdatedAt]);
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
  const demoTargetCorrected = isDemoTargetCorrected(demoTargetAttempt);
  const demoWizardActive = demoGuideActive && Boolean(snapshot?.competition.is_demo);

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
        {demoWizardActive ? (
          <DemoWizardSidebar
            currentStep="judge"
            title="Watch the cut line move"
            instruction="Use this leaderboard to show how Maya's B3 correction changes the standings story."
            why="The sales moment is seeing one judge save ripple into public rankings without rebuilding the event."
            progress={{
              eventReady: true,
              dataPopulated: Boolean(snapshot?.climbers.length),
              keyScoreCorrected: demoTargetCorrected,
              organizerAdvanced: false,
              publicReady: false,
            }}
            primaryAction={
              demoTargetClimber
                ? { label: "Jump to Maya row", targetAnchor: "leaderboard-maya-row" }
                : { label: "Jump to standings", targetAnchor: "leaderboard-standings" }
            }
            secondaryActions={[
              { label: "Back to Organizer", href: `/staff/c/${slug}?demo=1` },
              { label: "Judge panel", href: `/staff/c/${slug}/judge?demo=1` },
              { label: "Demo home", href: "/demo" },
            ]}
          />
        ) : null}

        {snapshot ? (
          <>
            {!presentationMode ? (
              <Surface variant="card">
                <div className="results-kicker">Live leaderboard</div>
                <h1 className="mt-2 text-4xl font-semibold text-slate-950 sm:text-5xl">
                  {snapshot.competition.name}
                </h1>
                <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600">
                  This is the public-facing leaderboard for climbers, coaches, parents, and spectators. It stays in sync with the same event record the judge station writes to.
                </p>
              </Surface>
            ) : null}
            <div className="grid gap-4" data-demo-anchor="leaderboard-standings">
              {qualifierGroups.map((group) => (
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
                            data-demo-anchor={
                              row.climber_number === DEMO_TARGET_CLIMBER_NUMBER ||
                              row.name.toLowerCase() === DEMO_TARGET_CLIMBER_NAME.toLowerCase()
                                ? "leaderboard-maya-row"
                                : undefined
                            }
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
              ))}
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
