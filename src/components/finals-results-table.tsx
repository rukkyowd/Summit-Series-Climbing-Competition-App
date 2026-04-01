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
    return <div className="finals-problem-box" />;
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

      <div className="mt-5 min-w-[980px] rounded-[1.6rem] border border-black/10 bg-[#f7f5f0] p-4 text-black shadow-[0_24px_60px_rgba(0,0,0,0.12)]">
        <div className="grid finals-grid gap-3 rounded-[1.2rem] bg-black px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white">
          <div>Rank</div>
          <div>Name</div>
          <div>Province</div>
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
            <div key={entry.climber_id} className="grid finals-grid items-center gap-3 px-4 py-5">
              <div className="text-4xl font-semibold leading-none">{entry.category_rank}</div>
              <div>
                <div className="text-2xl font-semibold leading-tight">{entry.name}</div>
                <div className="mt-1 text-xs font-mono uppercase tracking-[0.18em] text-black/55">
                  Qualifier rank #{entry.previous_round_rank}
                </div>
              </div>
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-black/70">{entry.province}</div>
              {entry.problem_results.map((problem) => (
                <FinalsResultCell
                  key={problem.climb_number}
                  top={problem.top}
                  zone={problem.zone}
                  attemptsToTop={problem.attempts_to_top}
                  attemptsToZone={problem.attempts_to_zone}
                />
              ))}
              <div className="text-3xl font-semibold">{formatFinalPoints(entry.total_points)}</div>
              <div className="text-3xl font-semibold">{entry.tops}</div>
              <div className="text-3xl font-semibold">{entry.zones}</div>
              <div className="text-3xl font-semibold">{entry.attempts_to_top}</div>
              <div className="text-3xl font-semibold">{entry.attempts_to_zone}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
