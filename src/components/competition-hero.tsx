"use client";

import Link from "next/link";
import {
  buildCompetitionPath,
  buildHeroAccent,
  formatDateRange,
  formatDateTimeLabel,
  getFormatTemplate,
  type Competition,
} from "@/lib/scoring";

export default function CompetitionHero({
  competition,
}: {
  competition: Competition;
}) {
  const summary = getFormatTemplate(competition.format);

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
          <h1 className="mt-3 text-4xl font-semibold text-slate-950 sm:text-5xl">{competition.name}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="results-chip">{competition.discipline_label}</span>
            <span className="results-chip">{summary.label}</span>
            <span className="results-chip">{competition.stage_mode === "finals" ? "Finals active" : "Qualifiers live"}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="results-kicker">About</div>
          <p className="mt-3 text-base leading-8 text-slate-700">
            {competition.description || "Competition details will appear here once staff adds the event description."}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={buildCompetitionPath(competition.slug, "register")} className="results-primary-button">
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
              className="results-secondary-button"
            >
              Share competition
            </button>
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
              {formatDateTimeLabel(competition.registration_opens_at)}
            </div>
          </div>
          <div className="results-meta-card">
            <div className="results-kicker">Registration deadline</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">
              {formatDateTimeLabel(competition.registration_closes_at)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
