"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import { Alert } from "@/components/ui/alert";
import { Surface } from "@/components/ui/surface";
import { saveScorecardAccessToken } from "@/lib/scorecard-access";
import { buildCompetitionPath } from "@/lib/scoring";

type DemoScorecardAccessPayload = {
  token: string;
  competitionSlug: string;
  climber: {
    id: string;
    name: string;
    climberNumber: string;
  };
};

export default function DemoCompetitorPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Preparing a seeded private scorecard...");

  useEffect(() => {
    let active = true;

    void fetch("/api/demo/scorecard-access?scenario=competitor")
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | ({ error?: string } & Partial<DemoScorecardAccessPayload>)
          | null;

        if (!response.ok || !payload?.token || !payload.competitionSlug) {
          throw new Error(payload?.error || "Unable to open the competitor demo.");
        }

        if (!active) {
          return;
        }

        saveScorecardAccessToken(payload.token, payload.competitionSlug);
        setStatus(`Opening ${payload.climber?.name ?? "the seeded climber"}'s scorecard...`);
        router.replace(`${buildCompetitionPath(payload.competitionSlug, "scorecard")}?demo=competitor`);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : "Unable to open the competitor demo.");
      });

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light />
        {error ? (
          <Alert variant="error">{error}</Alert>
        ) : (
          <Surface variant="card" className="space-y-4">
            <div className="results-kicker">Competitor demo</div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Opening a seeded climber scorecard
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
              This route fetches a canonical demo scorecard token at runtime, stores it in session, and
              drops you into the athlete-facing flow without exposing a raw access token in the URL or
              markup.
            </p>
            <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-700">
              {status}
            </div>
          </Surface>
        )}
      </div>
    </main>
  );
}
