"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import CompetitionListCard from "@/components/competition-list-card";
import { getAuthState, isStaffRole, type Profile } from "@/lib/auth";
import { listCompetitionSummaries, type CompetitionSummary } from "@/lib/db";
import { buildCompetitionPath, formatDateRange, getCompetitionLifecycleLabel } from "@/lib/scoring";

type OfficialEvent = {
  id: string;
  title: string;
  series: string;
  location: string;
  disciplines: string;
  start_date: string;
  end_date: string;
  source_name: string;
  source_url: string;
};

export default function HomePage() {
  const [summaries, setSummaries] = useState<CompetitionSummary[]>([]);
  const [officialEvents, setOfficialEvents] = useState<OfficialEvent[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [officialEventsError, setOfficialEventsError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSummaries, authState, officialEventsResponse] = await Promise.all([
        listCompetitionSummaries(false),
        getAuthState().catch(() => ({ session: null, profile: null })),
        fetch("/api/official-events")
          .then(async (response) => {
            const payload = (await response.json()) as { events?: OfficialEvent[]; error?: string };
            if (!response.ok) {
              throw new Error(payload.error ?? "Unable to load official events.");
            }
            return { events: payload.events ?? [], error: "" };
          })
          .catch((officialError) => {
            return {
              events: [] as OfficialEvent[],
              error: officialError instanceof Error ? officialError.message : "Unable to load official events.",
            };
          }),
      ]);
      setSummaries(nextSummaries);
      setOfficialEvents(officialEventsResponse.events);
      setProfile(authState.profile);
      setError("");
      setOfficialEventsError(officialEventsResponse.error);
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
  const featuredLiveNow = featuredLifecycle === "Live / Ongoing";

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
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <div className="results-kicker">Events</div>
              <h1 className="mt-3 text-3xl font-semibold text-slate-950 sm:text-5xl">Find your competition</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 sm:leading-8">
                Public routes now stay competition-first. Choose the event you are climbing in to open registration, scorecards, rankings, and the live display.
              </p>
            </div>
            {featured ? (
              <Link href={buildCompetitionPath(featured.competition.slug)} className="results-primary-button w-full sm:w-auto">
                Open featured competition
              </Link>
            ) : null}
          </div>

          {featured ? (
            <div className="results-feature mt-6">
              <div className="results-kicker text-white/80">Featured event</div>
              <div className="results-feature-card mt-4 max-w-md">
                {featuredLiveNow ? (
                  <>
                    <span className="results-live-indicator results-live-indicator--featured" aria-hidden="true">
                      <span className="results-live-indicator__dot" />
                    </span>
                    <span className="sr-only">{featuredLifecycle}</span>
                  </>
                ) : null}
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
            <div className="hidden grid-cols-[2fr_1fr_1fr_auto] gap-4 px-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 md:grid">
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

        <section className="results-card">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <div className="results-kicker">Official calendar</div>
              <h2 className="mt-3 text-3xl font-semibold text-slate-950 sm:text-4xl">Real bouldering events</h2>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 sm:leading-8">
                Read-only events pulled from official World Climbing and Climbing Escalade Canada calendars. These are source-linked references, not in-app scoring competitions.
              </p>
            </div>
            <div className="results-chip">{officialEvents.length} official events</div>
          </div>

          {officialEventsError ? <div className="results-alert results-alert-error mt-6">{officialEventsError}</div> : null}

          <div className="mt-8 space-y-4">
            {officialEvents.map((event) => (
              <a
                key={event.id}
                href={event.source_url}
                target="_blank"
                rel="noreferrer"
                className="results-list-row"
              >
                <div>
                  <div className="text-xl font-semibold text-slate-950 sm:text-2xl">{event.title}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">
                    <span>{event.series}</span>
                    <span>{event.disciplines}</span>
                    <span className="results-chip">{event.source_name}</span>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 md:contents">
                  <div>
                    <div className="results-kicker md:hidden">Location</div>
                    <div className="text-sm text-slate-600">{event.location}</div>
                  </div>
                  <div>
                    <div className="results-kicker md:hidden">Source</div>
                    <div className="text-sm text-slate-600">Official event page</div>
                  </div>
                  <div className="md:justify-self-end">
                    <div className="results-kicker md:hidden">Date</div>
                    <div className="pt-2 text-sm text-slate-600 md:pt-0">
                      {formatDateRange(event.start_date, event.end_date)}
                    </div>
                  </div>
                </div>
              </a>
            ))}
            {!officialEvents.length && !loading && !officialEventsError ? (
              <div className="results-card text-center text-slate-600">
                No official bouldering events were available from the configured source feeds.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
