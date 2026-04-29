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
            bannerTitle="Public leaderboard demo"
            bannerDescription="This is the page climbers, parents, and spectators can open during the event. It updates from the same competition model the judge panel writes to."
            bannerTip="Change categories or refresh after a saved judge call to show how public results stay in sync."
          />
        ) : null}

        {snapshot ? (
          <LeaderboardPanel snapshot={snapshot} />
        ) : (
          <Surface variant="card" className="text-slate-600">
            Loading rankings...
          </Surface>
        )}
      </div>
    </main>
  );
}
