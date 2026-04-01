"use client";

import { formatFinalPoints, type FinalsLeaderboardEntry } from "@/lib/scoring";

function FinalsResultCell({
  top,
  zone,
  attemptsToTop,
  attemptsToZone,
}: {
  top: boolean;
  zone: boolean;
  attemptsToTop: number | null;
  attemptsToZone: number | null;
}) {
  if (!top && !zone) {
    return <div className="finals-problem-box finals-problem-box-empty">-</div>;
  }

  if (top) {
    return (
      <div className="finals-problem-box finals-problem-box-top">
        <div className="finals-problem-box__top">{attemptsToTop ?? 1}</div>
        <div className="finals-problem-box__bottom">{attemptsToZone ?? attemptsToTop ?? 1}</div>
      </div>
    );
  }

  return (
    <div className="finals-problem-box">
      <div className="finals-problem-box__bottom finals-problem-box__bottom-zone">{attemptsToZone ?? 1}</div>
    </div>
  );
}

function metricClassName(value: number) {
  return value === 0 ? "finals-metric finals-metric-dim" : "finals-metric finals-metric-strong";
}

export default function FinalsResultsTable({
  title,
  rows,
}: {
  title: string;
  rows: FinalsLeaderboardEntry[];
}) {
  return (
    <section className="results-card overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="results-kicker">Finals rankings</div>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">{title}</h2>
        </div>
        <div className="results-chip">2025 IFSC points</div>
      </div>

      <div className="finals-table-shell mt-5 min-w-[980px]">
        <div className="grid finals-grid finals-table-header">
          <div>#</div>
          <div>Athlete</div>
          <div>Prov</div>
          <div>1</div>
          <div>2</div>
          <div>3</div>
          <div>4</div>
          <div>Points</div>
          <div>T</div>
          <div>Z</div>
          <div>A.T</div>
          <div>A.Z</div>
        </div>

        <div className="divide-y divide-black/10">
          {rows.map((entry) => (
            <div key={entry.climber_id} className="grid finals-grid finals-table-row items-center">
              <div className="finals-rank">{entry.category_rank}</div>
              <div>
                <div className="finals-athlete-name">{entry.name}</div>
                <div className="finals-athlete-subline">
                  Qualifier #{entry.previous_round_rank}
                </div>
              </div>
              <div className="finals-province">{entry.province}</div>
              {entry.problem_results.map((problem) => (
                <FinalsResultCell
                  key={problem.climb_number}
                  top={problem.top}
                  zone={problem.zone}
                  attemptsToTop={problem.attempts_to_top}
                  attemptsToZone={problem.attempts_to_zone}
                />
              ))}
              <div className={metricClassName(entry.total_points)}>{formatFinalPoints(entry.total_points)}</div>
              <div className={metricClassName(entry.tops)}>{entry.tops}</div>
              <div className={metricClassName(entry.zones)}>{entry.zones}</div>
              <div className={metricClassName(entry.attempts_to_top)}>{entry.attempts_to_top}</div>
              <div className={metricClassName(entry.attempts_to_zone)}>{entry.attempts_to_zone}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
