"use client";

import type { CSSProperties } from "react";
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
        <div className="finals-problem-box__top-attempt">{attemptsToTop ?? 1}</div>
        <div className="finals-problem-box__zone-attempt">{attemptsToZone ?? attemptsToTop ?? 1}</div>
      </div>
    );
  }

  return (
    <div className="finals-problem-box finals-problem-box-zone-only">
      <div className="finals-problem-box__zone-band">
        <div className="finals-problem-box__zone-attempt">{attemptsToZone ?? 1}</div>
      </div>
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
  const problemCount = Math.max(1, ...rows.map((entry) => entry.problem_results.length), 4);
  const mobileProblemGridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${problemCount}, minmax(0, 1fr))`,
  };
  const desktopGridStyle: CSSProperties = {
    gridTemplateColumns: `0.7fr 2.3fr 1fr repeat(${problemCount}, 0.8fr) 1fr 0.7fr 0.7fr 0.8fr 0.8fr`,
  };
  const desktopTableMinWidth = `${760 + problemCount * 76}px`;

  return (
    <section className="results-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="results-kicker">Finals rankings</div>
          <h2 className="results-editorial-title mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">{title}</h2>
        </div>
        <div className="results-chip">2025 IFSC points</div>
      </div>

      <div className="mt-5 space-y-3 md:hidden">
        {rows.map((entry) => (
          <div key={entry.climber_id} className="results-meta-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="results-kicker">Rank #{entry.category_rank}</div>
                <div className="mt-2 text-xl font-semibold text-slate-950">{entry.name}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {entry.province} | Qualifier #{entry.previous_round_rank}
                </div>
              </div>
              <div className="text-right">
                <div className="results-kicker">Points</div>
                <div className={metricClassName(entry.total_points)}>{formatFinalPoints(entry.total_points)}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-2" style={mobileProblemGridStyle}>
              {entry.problem_results.map((problem) => (
                <div key={problem.climb_number} className="space-y-2">
                  <div className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    B{problem.climb_number}
                  </div>
                  <FinalsResultCell
                    top={problem.top}
                    zone={problem.zone}
                    attemptsToTop={problem.attempts_to_top}
                    attemptsToZone={problem.attempts_to_zone}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div><span className="font-semibold text-slate-950">{entry.tops}</span> tops</div>
              <div><span className="font-semibold text-slate-950">{entry.zones}</span> zones</div>
              <div><span className="font-semibold text-slate-950">{entry.attempts_to_top}</span> attempts to top</div>
              <div><span className="font-semibold text-slate-950">{entry.attempts_to_zone}</span> attempts to zone</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 hidden overflow-x-auto md:block">
        <div className="finals-table-shell" style={{ minWidth: desktopTableMinWidth }}>
          <div className="grid finals-table-header" style={desktopGridStyle}>
            <div>#</div>
            <div>Athlete</div>
            <div>Prov</div>
            {Array.from({ length: problemCount }, (_, index) => (
              <div key={`header-problem-${index + 1}`}>{index + 1}</div>
            ))}
            <div>Points</div>
            <div>T</div>
            <div>Z</div>
            <div>A.T</div>
            <div>A.Z</div>
          </div>

          <div className="divide-y divide-black/10">
            {rows.map((entry) => (
              <div key={entry.climber_id} className="grid finals-table-row items-center" style={desktopGridStyle}>
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
      </div>
    </section>
  );
}
