"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonStyles } from "@/components/ui/button";

type DemoSummary = {
  id: string;
  slug: string;
  name: string;
  created_at: string | null;
  canSkipToJudge: boolean;
  canSkipToResults: boolean;
};

export function DemoEntry({ latestDemo }: { latestDemo: DemoSummary | null }) {
  const router = useRouter();
  const [error, setError] = useState("");

  function skipToJudge() {
    if (!latestDemo?.canSkipToJudge) {
      setError("Finish setup and seed the demo before skipping to the judge panel.");
      return;
    }

    router.push(`/staff/c/${latestDemo.slug}/judge?demo=act2`);
  }

  function skipToResults() {
    if (!latestDemo?.canSkipToResults) {
      setError("Advance finalists before skipping to the public results page.");
      return;
    }

    router.push(`/c/${latestDemo.slug}?demo=act4`);
  }

  return (
    <section className="results-card">
      <div className="max-w-3xl">
        <div className="results-kicker">Guided walkthrough</div>
        <h1 className="mt-2 break-words text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Summit Series Demo
        </h1>
        <div className="mt-5 text-base leading-7 text-slate-700">
          <div>Run a full climbing competition:</div>
          <ul className="mt-3 space-y-1">
            <li>Create an event</li>
            <li>Score athletes as a judge</li>
            <li>Advance finalists</li>
            <li>View public results</li>
          </ul>
        </div>
      </div>

      {latestDemo ? (
        <div className="mt-6 rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Latest demo event: <span className="font-semibold text-slate-950">{latestDemo.name}</span>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-[1.1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <a href="/staff/new?demo=act1" className={buttonStyles({ variant: "primary" })}>
          Start Full Demo
        </a>
        <button
          type="button"
          onClick={skipToJudge}
          disabled={!latestDemo?.canSkipToJudge}
          className={buttonStyles({ variant: "secondary" })}
        >
          Skip to Judge
        </button>
        <button
          type="button"
          onClick={skipToResults}
          disabled={!latestDemo?.canSkipToResults}
          className={buttonStyles({ variant: "secondary" })}
        >
          Skip to Results
        </button>
      </div>
    </section>
  );
}
