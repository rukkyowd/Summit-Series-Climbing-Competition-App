"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
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

function fireConfetti() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.className = "pointer-events-none fixed inset-0 z-[70] overflow-hidden";
  document.body.appendChild(layer);

  const colors = ["#38bdf8", "#34d399", "#a78bfa", "#fbbf24", "#fb7185"];
  for (let index = 0; index < 72; index += 1) {
    const piece = document.createElement("span");
    const size = 6 + Math.random() * 7;
    const left = 10 + Math.random() * 80;
    const drift = (Math.random() - 0.5) * 42;
    piece.className = "absolute block rounded-sm";
    piece.style.left = `${left}%`;
    piece.style.top = "48%";
    piece.style.width = `${size}px`;
    piece.style.height = `${size * 0.65}px`;
    piece.style.background = colors[index % colors.length];
    piece.style.opacity = "0.9";
    piece.animate(
      [
        { transform: "translate3d(0, 0, 0) rotate(0deg)", opacity: 1 },
        {
          transform: `translate3d(${drift}vw, ${38 + Math.random() * 32}vh, 0) rotate(${180 + Math.random() * 360}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 1100 + Math.random() * 700,
        easing: "cubic-bezier(.18,.8,.32,1)",
        fill: "forwards",
      }
    );
    layer.appendChild(piece);
  }

  window.setTimeout(() => layer.remove(), 2100);
}

export type FinalsResultsTableProps = {
  title: string;
  rows: FinalsLeaderboardEntry[];
  revealMode?: boolean;
  revealedCount?: number;
};

export default function FinalsResultsTable({
  title,
  rows,
  revealMode = false,
  revealedCount,
}: FinalsResultsTableProps) {
  const problemCount = Math.max(1, ...rows.map((entry) => entry.problem_results.length), 4);
  const mobileProblemGridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${problemCount}, minmax(0, 1fr))`,
  };
  const desktopGridStyle: CSSProperties = {
    gridTemplateColumns: `0.7fr 2.3fr 1fr repeat(${problemCount}, 0.8fr) 1fr 0.7fr 0.7fr 0.8fr 0.8fr`,
  };
  const desktopTableMinWidth = `${760 + problemCount * 76}px`;
  const visibleRows = revealMode ? rows.slice(0, revealedCount ?? rows.length) : rows;
  const revealComplete = revealMode && (revealedCount ?? 0) >= rows.length && rows.length > 0;
  const confettiFiredRef = useRef(false);

  useEffect(() => {
    if (!revealComplete || confettiFiredRef.current) {
      return;
    }

    confettiFiredRef.current = true;
    fireConfetti();
  }, [revealComplete]);

  return (
    <section className="results-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="results-kicker">Finals rankings</div>
          <h2 className="results-editorial-title mt-2 break-words text-3xl font-semibold text-slate-950 sm:text-4xl">{title}</h2>
        </div>
        <div className="results-chip">2025 IFSC points</div>
      </div>

      <div className="mt-5 space-y-3 md:hidden">
        <AnimatePresence>
        {visibleRows.map((entry, index) => (
          <motion.div
            key={entry.climber_id}
            layout
            initial={revealMode ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: revealMode ? 0 : index * 0.04 }}
            className="results-meta-card min-w-0"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="results-kicker">Rank #{entry.category_rank}</div>
                <div className="mt-2 break-words text-xl font-semibold text-slate-950">{entry.name}</div>
                <div className="mt-1 break-words text-sm leading-relaxed text-slate-600">
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
          </motion.div>
        ))}
        </AnimatePresence>
      </div>

      <div className="results-data-scroll mt-5 hidden md:block">
        <div className="results-table-scroll-hint">
          <span>Score column shows finals points.</span>
          <span>Scroll sideways for the full finals table.</span>
        </div>
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
            <AnimatePresence>
            {visibleRows.map((entry, index) => (
              <motion.div
                key={entry.climber_id}
                layout
                initial={revealMode ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: revealMode ? 0 : index * 0.04 }}
                className="grid finals-table-row items-center"
                style={desktopGridStyle}
              >
                <div className="finals-rank">{entry.category_rank}</div>
                <div className="min-w-0">
                  <div className="finals-athlete-name break-words">{entry.name}</div>
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
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {revealMode && !revealComplete ? (
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-sky-500 transition-all duration-300"
              style={{
                width: rows.length > 0
                  ? `${Math.round(((revealedCount ?? 0) / rows.length) * 100)}%`
                  : "0%",
              }}
            />
          </div>
          <span className="shrink-0 text-xs font-semibold text-slate-500">
            {revealedCount ?? 0} / {rows.length}
          </span>
        </div>
      ) : null}
    </section>
  );
}
