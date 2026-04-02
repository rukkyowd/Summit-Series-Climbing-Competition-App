"use client";

import Link from "next/link";
import {
  buildCompetitionPath,
  buildHeroAccent,
  formatDateRange,
  formatDateTimeLabel,
  getCompetitionLifecycleLabel,
  getFormatTemplate,
  isCompetitionLiveNow,
  type Competition,
} from "@/lib/scoring";

function sanitizeDisplayText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "undefined" || trimmed === "null") {
    return "";
  }

  return trimmed;
}

function isGenericRegistrationUrl(value: string) {
  return (
    value.includes("/compete/#register") ||
    value.includes("/compete/") ||
    value.includes("memberships")
  );
}

export default function CompetitionHero({
  competition,
}: {
  competition: Competition;
}) {
  const summary = getFormatTemplate(competition.format);
  const liveNow = isCompetitionLiveNow(competition);
  const lifecycleLabel = getCompetitionLifecycleLabel(competition);
  const description = sanitizeDisplayText(competition.description);
  const officialEventUrl = sanitizeDisplayText(competition.official_event_url);
  const officialRegistrationUrl = sanitizeDisplayText(competition.official_registration_url);
  const officialScheduleUrl = sanitizeDisplayText(competition.official_schedule_url);
  const usableRegistrationUrl =
    officialRegistrationUrl && !isGenericRegistrationUrl(officialRegistrationUrl)
      ? officialRegistrationUrl
      : "";
  const registrationOpensLabel = competition.registration_opens_at
    ? formatDateTimeLabel(competition.registration_opens_at)
    : "";
  const registrationDeadlineLabel = competition.registration_closes_at
    ? formatDateTimeLabel(competition.registration_closes_at)
    : "";
  const registrationFallbackUrl = usableRegistrationUrl || officialEventUrl;

  return (
    <section className="results-card overflow-hidden">
      <div
        className="results-hero"
        style={{
          backgroundImage: competition.hero_image_url
            ? `${buildHeroAccent(competition)}, url(${competition.hero_image_url})`
            : `${buildHeroAccent(competition)}, linear-gradient(135deg, #dbe7f8, #f4f7fb)`,
        }}
      >
        <div className="results-hero__overlay">
          <div className="results-kicker">Competition</div>
          <h1 className="results-editorial-title mt-3 max-w-4xl text-4xl font-semibold text-slate-950 sm:text-6xl">
            {competition.name}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="results-chip">{competition.discipline_label}</span>
            <span className="results-chip">{summary.label}</span>
            <span className={`results-chip ${liveNow ? "results-chip-live" : ""}`}>
              {liveNow ? <span className="results-live-dot" aria-hidden="true" /> : null}
              {lifecycleLabel}
            </span>
          </div>
          <div className="mt-5 text-sm font-medium text-slate-700">
            Venue, dates, registration details, and official links in one place.
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="results-kicker">About</div>
          <p className="results-soft-text mt-3 max-w-3xl text-[1.02rem] leading-7 sm:text-lg sm:leading-8">
            {description || "Competition details will appear here once staff adds the event description."}
          </p>

          <div className="results-button-row mt-6">
            <Link href={buildCompetitionPath(competition.slug, "register")} className="results-primary-button w-full sm:w-auto">
              Register for competition
            </Link>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.share) {
                  void navigator.share({
                    title: competition.name,
                    text: `Join ${competition.name}`,
                    url: window.location.href,
                  });
                  return;
                }

                void navigator.clipboard?.writeText(window.location.href);
              }}
              className="results-secondary-button w-full sm:w-auto"
            >
              Share competition
            </button>
            {officialEventUrl ? (
              <a
                href={officialEventUrl}
                target="_blank"
                rel="noreferrer"
                className="results-secondary-button w-full sm:w-auto"
              >
                Official event page
              </a>
            ) : null}
            {officialScheduleUrl ? (
              <a
                href={officialScheduleUrl}
                target="_blank"
                rel="noreferrer"
                className="results-secondary-button w-full sm:w-auto"
              >
                Official schedule
              </a>
            ) : null}
          </div>

          <div className="results-subtle-divider mt-7" />
          <div className="mt-5 text-sm leading-7 text-slate-600">
            Public pages stay athlete-friendly while official source links remain one tap away for venue details, registration notes, and governing-body updates.
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="results-meta-card">
            <div className="results-kicker">Location</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">{competition.location_name || "Location TBD"}</div>
          </div>
          <div className="results-meta-card">
            <div className="results-kicker">Date</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">{formatDateRange(competition.start_date, competition.end_date)}</div>
          </div>
          <div className="results-meta-card">
            <div className="results-kicker">Registration opens</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">
              {registrationOpensLabel || registrationFallbackUrl ? (
                registrationOpensLabel ? (
                  registrationOpensLabel
                ) : (
                  <a
                    href={registrationFallbackUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-700 underline-offset-4 hover:underline"
                  >
                    {usableRegistrationUrl ? "Official registration" : "Official event page"}
                  </a>
                )
              ) : (
                "Not scheduled"
              )}
            </div>
          </div>
          <div className="results-meta-card">
            <div className="results-kicker">Registration deadline</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">
              {registrationDeadlineLabel || registrationFallbackUrl ? (
                registrationDeadlineLabel ? (
                  registrationDeadlineLabel
                ) : (
                  <a
                    href={registrationFallbackUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-700 underline-offset-4 hover:underline"
                  >
                    {usableRegistrationUrl ? "See official registration" : "See official event page"}
                  </a>
                )
              ) : (
                "Not scheduled"
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
