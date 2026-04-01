"use client";

import Link from "next/link";
import {
  buildCompetitionPath,
  getCompetitionLifecycleLabel,
  formatCompetitionDateBadge,
  formatDateLabel,
  formatDateRange,
  getFormatTemplate,
  type CompetitionSummary,
} from "@/lib/scoring";

export default function CompetitionListCard({
  summary,
}: {
  summary: CompetitionSummary;
}) {
  const { competition } = summary;
  const badge = formatCompetitionDateBadge(competition);
  const lifecycleLabel = getCompetitionLifecycleLabel(competition);
  const liveNow = lifecycleLabel === "Live / Ongoing";

  return (
    <Link href={buildCompetitionPath(competition.slug)} className="results-list-row">
      <div>
        <div className="text-2xl font-semibold text-slate-950">{competition.name}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">
          <span>{competition.discipline_label}</span>
          <span>{getFormatTemplate(competition.format).label}</span>
          <span className={`results-chip ${liveNow ? "results-chip-live" : ""}`}>
            {liveNow ? <span className="results-live-dot" aria-hidden="true" /> : null}
            {lifecycleLabel}
          </span>
          {summary.active_schedule_block ? <span>{summary.active_schedule_block.label}</span> : null}
        </div>
      </div>
      <div className="text-sm text-slate-600">{competition.location_name || "Location TBD"}</div>
      <div className="text-sm text-slate-600">
        {competition.registration_closes_at ? formatDateLabel(competition.registration_closes_at) : "Open"}
      </div>
      <div className="results-date-badge">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{badge.month}</div>
        <div className="mt-1 text-2xl font-semibold text-slate-950">{badge.day}</div>
      </div>
      <div className="sr-only">{formatDateRange(competition.start_date, competition.end_date)}</div>
    </Link>
  );
}
