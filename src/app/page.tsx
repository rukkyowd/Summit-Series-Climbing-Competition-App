"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import CompetitionListCard from "@/components/competition-list-card";
import { getAuthState, isStaffRole, type Profile } from "@/lib/auth";
import { listCompetitionSummaries, type CompetitionSummary } from "@/lib/db";
import { sanitizeExternalUrl } from "@/lib/security";
import { buildCompetitionPath, formatDateRange, getCompetitionLifecycleLabel } from "@/lib/scoring";

type OfficialEvent = {
  id: string;
  title: string;
  series: string;
  location: string;
  disciplines: string;
  start_date: string;
  end_date: string;
  description: string;
  source_name: string;
  source_url: string;
  official_event_url: string;
  official_registration_url: string;
  official_schedule_url: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  hero_image_url: string;
};

function buildOfficialImportHref(event: OfficialEvent) {
  const params = new URLSearchParams({
    importOfficialEvent: event.id,
    createName: event.title,
    createLocation: event.location,
    createStartDate: event.start_date,
    createEndDate: event.end_date,
    createDescription: event.description,
    createOfficialEventUrl: sanitizeExternalUrl(event.official_event_url),
    createOfficialRegistrationUrl: sanitizeExternalUrl(event.official_registration_url),
    createOfficialScheduleUrl: sanitizeExternalUrl(event.official_schedule_url),
    createHeroImageUrl: sanitizeExternalUrl(event.hero_image_url),
    createDisciplineLabel: event.disciplines,
    createFormat: "flash_format",
  });

  if (event.registration_opens_at) {
    params.set("createRegistrationOpensAt", event.registration_opens_at);
  }

  if (event.registration_closes_at) {
    params.set("createRegistrationClosesAt", event.registration_closes_at);
  }

  return `/staff/dashboard?${params.toString()}`;
}

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
              <Link href="/staff/demo" className="results-secondary-button">
                View demo dashboard
              </Link>
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

        <section className="results-editorial-panel">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div className="min-w-0">
              <div className="results-kicker">Climbing competitions</div>
              <h1 className="results-editorial-title mt-3 max-w-4xl break-words text-4xl font-semibold text-slate-950 sm:text-6xl">
                Everything you need for comp day, all in one place.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg sm:leading-8">
                Set up the event, share registration, track scores, and keep climbers, parents, and spectators up to date without juggling a bunch of separate tools.
              </p>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {featured ? (
                <Link href={buildCompetitionPath(featured.competition.slug)} className="results-primary-button w-full">
                  Open live competition
                </Link>
              ) : null}
              <Link href="/staff/demo" className="results-secondary-button w-full">
                Preview organizer workflow
              </Link>
            </div>
          </div>

          {featured ? (
            <div className="results-feature mt-6">
              <div className="grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-end">
                <div className="min-w-0 max-w-2xl">
                  <div className="results-kicker text-white/80">Live event spotlight</div>
                  <h2 className="results-editorial-title mt-3 break-words text-4xl font-semibold text-white sm:text-5xl">
                    {featured.competition.name}
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="results-chip border-white/30 bg-white/15 text-white shadow-none">
                      {featured.competition.discipline_label}
                    </span>
                    <span className="results-chip border-white/30 bg-white/15 text-white shadow-none">
                      {formatDateRange(featured.competition.start_date, featured.competition.end_date)}
                    </span>
                    <span className="results-chip border-white/30 bg-white/15 text-white shadow-none">
                      {featured.competition.location_name || "Location TBD"}
                    </span>
                  </div>
                </div>
                <div className="results-feature-card min-w-0">
                  {featuredLiveNow ? (
                    <>
                      <span className="results-live-indicator results-live-indicator--featured" aria-hidden="true">
                        <span className="results-live-indicator__dot" />
                      </span>
                      <span className="sr-only">{featuredLifecycle}</span>
                    </>
                  ) : null}
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">What people can do now</div>
                  <div className="mt-3 break-words text-2xl font-semibold text-slate-950">{featuredLifecycle}</div>
                  <div className="mt-4 space-y-2 text-sm leading-relaxed text-slate-600">
                    <div className="break-words">Registration, scorecards, live standings, and display all live under one event.</div>
                    <div className="break-words">{featured.competition.location_name || "Location TBD"}</div>
                    <div className="break-words">{formatDateRange(featured.competition.start_date, featured.competition.end_date)}</div>
                  </div>
                  <Link href={buildCompetitionPath(featured.competition.slug)} className="results-secondary-button mt-5 w-full">
                    Enter event
                  </Link>
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
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="min-w-0">
              <div className="results-kicker">Official calendar</div>
              <h2 className="results-editorial-title mt-3 max-w-4xl break-words text-4xl font-semibold text-slate-950 sm:text-5xl">
                Official bouldering calendar.
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg sm:leading-8">
                Read-only events pulled from official World Climbing and Climbing Escalade Canada calendars. These are source-linked references, not in-app scoring competitions.
              </p>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="results-meta-card">
                <div className="results-kicker">Sources</div>
                <div className="mt-3 text-lg font-semibold text-slate-950">World Climbing + CEC</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  Imported as reference data so staff can spin up local competition drafts without retyping basics.
                </div>
              </div>
              <div className="results-chip w-fit">{officialEvents.length} official events</div>
            </div>
          </div>

          {officialEventsError ? <div className="results-alert results-alert-error mt-6">{officialEventsError}</div> : null}

          <div className="mt-8 space-y-4">
            {officialEvents.map((event) => {
              const sourceUrl = sanitizeExternalUrl(event.source_url);

              return (
                <div key={event.id} className="results-list-row">
                  <div className="min-w-0">
                    <div className="break-words text-xl font-semibold text-slate-950 sm:text-2xl">{event.title}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">
                      <span>{event.series}</span>
                      <span>{event.disciplines}</span>
                      <span className="results-chip">{event.source_name}</span>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 md:contents">
                    <div className="min-w-0">
                      <div className="results-kicker md:hidden">Location</div>
                      <div className="break-words text-sm leading-relaxed text-slate-600">{event.location}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="results-kicker md:hidden">Source</div>
                      {sourceUrl ? (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-sky-700 underline-offset-4 hover:underline"
                        >
                          Official event page
                        </a>
                      ) : (
                        <span className="text-sm text-slate-500">Official link unavailable</span>
                      )}
                    </div>
                    <div className="min-w-0 md:justify-self-end">
                      <div className="results-kicker md:hidden">Date</div>
                      <div className="flex flex-col items-start gap-3 pt-2 md:items-end md:pt-0">
                        <div className="break-words text-sm leading-relaxed text-slate-600">
                          {formatDateRange(event.start_date, event.end_date)}
                        </div>
                        {isStaffRole(profile?.role) ? (
                          <Link href={buildOfficialImportHref(event)} className="results-secondary-button">
                            Import to dashboard
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
