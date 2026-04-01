"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import CompetitionListCard from "@/components/competition-list-card";
import { getAuthState, isStaffRole, type Profile } from "@/lib/auth";
import { listCompetitionSummaries, type CompetitionSummary } from "@/lib/db";
import { buildCompetitionPath, formatDateRange, getCompetitionLifecycleLabel } from "@/lib/scoring";

export default function HomePage() {
  const [summaries, setSummaries] = useState<CompetitionSummary[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSummaries, authState] = await Promise.all([
        listCompetitionSummaries(false),
        getAuthState().catch(() => ({ session: null, profile: null })),
      ]);
      setSummaries(nextSummaries);
      setProfile(authState.profile);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load competitions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return summaries;
    }

    return summaries.filter((summary) => {
      return (
        summary.competition.name.toLowerCase().includes(query) ||
        summary.competition.location_name.toLowerCase().includes(query)
      );
    });
  }, [search, summaries]);

  const featured = filtered.find((summary) => summary.live_now) ?? filtered[0] ?? null;
  const featuredLifecycle = featured ? getCompetitionLifecycleLabel(featured.competition) : null;

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader
          light
          status={
            <div className="flex flex-wrap items-center gap-2">
              <div className="results-chip">{summaries.length} active competitions</div>
              {isStaffRole(profile?.role) ? (
                <Link href="/staff/dashboard" className="results-secondary-button">
                  Open staff dashboard
                </Link>
              ) : (
                <Link href="/staff/login" className="results-secondary-button">
                  Staff sign in
                </Link>
              )}
            </div>
          }
        />

        {error ? <div className="results-alert results-alert-error">{error}</div> : null}

        <section className="results-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="results-kicker">Events</div>
              <h1 className="mt-3 text-4xl font-semibold text-slate-950 sm:text-5xl">Find your competition</h1>
              <p className="mt-3 max-w-3xl text-base leading-8 text-slate-600">
                Public routes now stay competition-first. Choose the event you are climbing in to open registration, scorecards, rankings, and the live display.
              </p>
            </div>
            {featured ? (
              <Link href={buildCompetitionPath(featured.competition.slug)} className="results-primary-button">
                Open featured competition
              </Link>
            ) : null}
          </div>

          {featured ? (
            <div className="results-feature mt-6">
              <div className="results-kicker text-white/80">Featured event</div>
              <div className="mt-4 max-w-md rounded-[1.6rem] bg-white/90 p-5 shadow-xl">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {featured.competition.discipline_label}
                </div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{featured.competition.name}</div>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <div>{featuredLifecycle}</div>
                  <div>{formatDateRange(featured.competition.start_date, featured.competition.end_date)}</div>
                  <div>{featured.competition.location_name || "Location TBD"}</div>
                </div>
              </div>
            </div>
          ) : null}

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="results-input mt-6"
            placeholder="Search by competition name or location"
          />

          <div className="mt-8 space-y-4">
            <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <div>Event</div>
              <div>Location</div>
              <div>Registration deadline</div>
              <div>Date</div>
            </div>
            {filtered.map((summary) => (
              <CompetitionListCard key={summary.competition.id} summary={summary} />
            ))}
            {!filtered.length && !loading ? (
              <div className="results-card text-center text-slate-600">No active competitions match that search yet.</div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
