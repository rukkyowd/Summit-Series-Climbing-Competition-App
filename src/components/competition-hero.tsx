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
import { sanitizeExternalUrl } from "@/lib/security";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";

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
  const heroImageUrl = sanitizeExternalUrl(competition.hero_image_url, { allowDataImage: true });
  const officialEventUrl = sanitizeExternalUrl(sanitizeDisplayText(competition.official_event_url));
  const officialRegistrationUrl = sanitizeExternalUrl(sanitizeDisplayText(competition.official_registration_url));
  const officialScheduleUrl = sanitizeExternalUrl(sanitizeDisplayText(competition.official_schedule_url));
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
          backgroundImage: heroImageUrl
            ? `${buildHeroAccent(competition)}, url(${heroImageUrl})`
            : `${buildHeroAccent(competition)}, linear-gradient(135deg, #dbe7f8, #f4f7fb)`,
        }}
      >
        <div className="results-hero__overlay">
          <div className="results-kicker">Competition</div>
          <h1 className="results-editorial-title mt-3 max-w-4xl break-words text-4xl font-semibold text-slate-950 sm:text-6xl">
            {competition.name}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>{competition.discipline_label}</Badge>
            <Badge>{summary.label}</Badge>
            <Badge variant={liveNow ? "live" : "default"}>
              {liveNow ? <span className="results-live-dot" aria-hidden="true" /> : null}
              {lifecycleLabel}
            </Badge>
          </div>
          <div className="mt-5 max-w-3xl text-sm font-medium leading-relaxed text-slate-700">
            Venue, dates, registration details, and official links in one place.
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="min-w-0">
          <div className="results-kicker">About</div>
          <p className="results-soft-text mt-3 max-w-3xl break-words text-[1.02rem] leading-relaxed sm:text-lg sm:leading-8">
            {description || "Competition details will appear here once staff adds the event description."}
          </p>

          <div className="results-button-row mt-6">
            <Link href={buildCompetitionPath(competition.slug, "register")} className={buttonStyles({ variant: "primary" })}>
              Register for competition
            </Link>
            <Link href={buildCompetitionPath(competition.slug, "leaderboard")} className={buttonStyles({ variant: "secondary" })}>
              View standings
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
              className={buttonStyles({ variant: "secondary" })}
            >
              Share competition
            </button>
            {officialEventUrl ? (
              <a
                href={officialEventUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonStyles({ variant: "secondary" })}
              >
                Official event page
              </a>
            ) : null}
            {officialScheduleUrl ? (
              <a
                href={officialScheduleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonStyles({ variant: "secondary" })}
              >
                Official schedule
              </a>
            ) : null}
          </div>
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Surface variant="meta">
            <div className="results-kicker">Location</div>
            <div className="mt-2 break-words text-lg font-semibold text-slate-950">{competition.location_name || "Location TBD"}</div>
          </Surface>
          <Surface variant="meta">
            <div className="results-kicker">Date</div>
            <div className="mt-2 break-words text-lg font-semibold text-slate-950">{formatDateRange(competition.start_date, competition.end_date)}</div>
          </Surface>
          <Surface variant="meta">
            <div className="results-kicker">Registration opens</div>
            <div className="mt-2 break-words text-lg font-semibold text-slate-950">
              {registrationOpensLabel || registrationFallbackUrl ? (
                registrationOpensLabel ? (
                  registrationOpensLabel
                ) : (
                  <a
                    href={registrationFallbackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-700 underline-offset-4 hover:underline"
                  >
                    {usableRegistrationUrl ? "Official registration" : "Official event page"}
                  </a>
                )
              ) : (
                "Not scheduled"
              )}
            </div>
          </Surface>
          <Surface variant="meta">
            <div className="results-kicker">Registration deadline</div>
            <div className="mt-2 break-words text-lg font-semibold text-slate-950">
              {registrationDeadlineLabel || registrationFallbackUrl ? (
                registrationDeadlineLabel ? (
                  registrationDeadlineLabel
                ) : (
                  <a
                    href={registrationFallbackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-700 underline-offset-4 hover:underline"
                  >
                    {usableRegistrationUrl ? "See official registration" : "See official event page"}
                  </a>
                )
              ) : (
                "Not scheduled"
              )}
            </div>
          </Surface>
        </div>
      </div>
    </section>
  );
}
