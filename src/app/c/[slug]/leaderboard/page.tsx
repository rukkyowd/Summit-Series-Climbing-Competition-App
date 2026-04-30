"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import DemoExperience from "@/components/demo-experience";
import { LeaderboardPanel } from "@/components/demo/leaderboard-panel";
import SiteHeader from "@/components/site-header";
import { Alert } from "@/components/ui/alert";
import { Surface } from "@/components/ui/surface";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { isDemoCompetitionRecord } from "@/lib/demo";

export default function CompetitionLeaderboardPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const presentationMode = searchParams?.get("presentation") === "1";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void getCompetitionSnapshot(slug)
      .then((nextSnapshot) => setSnapshot(nextSnapshot))
      .catch((nextError) =>
        setError(nextError instanceof Error ? nextError.message : "Unable to load rankings.")
      );
  }, [slug]);

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        {!presentationMode ? <SiteHeader light competitionSlug={slug} /> : null}

        {error ? <Alert variant="error">{error}</Alert> : null}
        {snapshot && isDemoCompetitionRecord(snapshot.competition) ? (
          <DemoExperience
            enabled
            routeId="leaderboard"
            competitionSlug={snapshot.competition.slug}
            bannerTitle="Live leaderboard demo"
            bannerDescription="This is the page climbers, parents, and spectators can open during the event. It updates from the same competition model the judge panel writes to."
            bannerTip="Change categories or refresh after a saved score to show how public results stay in sync."
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
            <LeaderboardPanel snapshot={snapshot} />
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
