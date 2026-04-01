"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";

function buildChecks(snapshot: CompetitionSnapshot) {
  const checks = [
    {
      label: "Schedule blocks configured",
      ok: snapshot.competition.schedule_blocks.length > 0,
      detail: snapshot.competition.schedule_blocks.length
        ? `${snapshot.competition.schedule_blocks.length} blocks configured`
        : "Add schedule blocks for public timing and capacity context.",
    },
    {
      label: "Categories configured",
      ok: snapshot.competition.categories.length > 0,
      detail: `${snapshot.competition.categories.length} categories available`,
    },
    {
      label: "Registration window set",
      ok: Boolean(snapshot.competition.registration_opens_at || snapshot.competition.registration_closes_at),
      detail: snapshot.competition.registration_closes_at
        ? `Closes ${new Date(snapshot.competition.registration_closes_at).toLocaleString()}`
        : "Set open/close times to help staff and climbers.",
    },
    {
      label: "Finalists and finals order ready",
      ok: snapshot.finalists.length === 0 || snapshot.finalists.every((entry) => (entry.climbing_order ?? 0) > 0),
      detail: snapshot.finalists.length ? `${snapshot.finalists.length} finalists loaded` : "No finalists selected yet.",
    },
    {
      label: "Registration still in the future",
      ok: !snapshot.competition.registration_closes_at || new Date(snapshot.competition.registration_closes_at).getTime() > Date.now(),
      detail: snapshot.competition.registration_closes_at
        ? `Closes ${new Date(snapshot.competition.registration_closes_at).toLocaleString()}`
        : "No close time configured.",
    },
  ];

  return checks;
}

export default function StaffPreflightPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void getCompetitionSnapshot(slug)
      .then((nextSnapshot) => setSnapshot(nextSnapshot))
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load preflight checks."));
  }, [slug]);

  const checks = snapshot ? buildChecks(snapshot) : [];

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light competitionSlug={slug} status={<div className="results-chip">Preflight</div>} />

        {error ? <div className="results-alert results-alert-error">{error}</div> : null}

        <section className="results-card">
          <div className="results-kicker">Event-day preflight</div>
          <h1 className="mt-2 text-4xl font-semibold text-slate-950">{snapshot?.competition.name ?? "Checking competition..."}</h1>
          <div className="mt-6 space-y-3">
            {checks.map((check) => (
              <div key={check.label} className={`results-meta-card ${check.ok ? "" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">{check.label}</div>
                    <div className="mt-1 text-sm text-slate-600">{check.detail}</div>
                  </div>
                  <div className="results-chip">{check.ok ? "Ready" : "Needs attention"}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
