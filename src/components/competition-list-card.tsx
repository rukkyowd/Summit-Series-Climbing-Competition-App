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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { surfaceStyles } from "@/components/ui/surface";

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
    <Link
      href={buildCompetitionPath(competition.slug)}
      className={cn(surfaceStyles("row"), "results-list-row", liveNow && "results-list-row-live")}
    >
      <div className="min-w-0">
        <div className="break-words text-xl font-semibold text-slate-950 sm:text-2xl">{competition.name}</div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
          <span>{competition.discipline_label}</span>
          <span>{getFormatTemplate(competition.format).label}</span>
          <Badge variant={liveNow ? "live" : "default"}>
            {liveNow ? (
              <>
                <span className="results-live-dot" aria-hidden="true" />
                Live now
              </>
            ) : (
              lifecycleLabel
            )}
          </Badge>
          {summary.active_schedule_block ? <span>{summary.active_schedule_block.label}</span> : null}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:contents">
        <div className="min-w-0">
          <div className="results-kicker md:hidden">Location</div>
          <div className="break-words text-sm leading-relaxed text-slate-600">{competition.location_name || "Location TBD"}</div>
        </div>
        <div className="min-w-0">
          <div className="results-kicker md:hidden">Registration deadline</div>
          <div className="break-words text-sm leading-relaxed text-slate-600">
            {competition.registration_closes_at ? formatDateLabel(competition.registration_closes_at) : "Open"}
          </div>
        </div>
        <div className="min-w-0 md:justify-self-end">
          <div className="results-kicker md:hidden">Date</div>
          <div className="mt-1 flex items-start gap-3 md:mt-0 md:justify-end">
            <div className="results-date-badge shrink-0">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{badge.month}</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">{badge.day}</div>
            </div>
            <div className="min-w-0 break-words pt-2 text-sm leading-relaxed text-slate-600 md:hidden">{formatDateRange(competition.start_date, competition.end_date)}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}
