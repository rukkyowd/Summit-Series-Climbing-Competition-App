"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  buildLeaderboard,
  formatTime,
  MAX_TOTAL_SCORE,
  TOTAL_CLIMBS,
  type LeaderboardEntry,
} from "@/lib/scoring";
import { getAllClimbersWithAttempts } from "@/lib/db";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import SiteHeader from "@/components/site-header";

const TOP_N = 10;

const RANK_BADGES: Record<number, { label: string; tone: string }> = {
  1: { label: "1st", tone: "text-yellow-300 border-yellow-400/20 bg-yellow-400/10" },
  2: { label: "2nd", tone: "text-slate-200 border-slate-300/20 bg-slate-300/10" },
  3: { label: "3rd", tone: "text-amber-300 border-amber-400/20 bg-amber-400/10" },
};

function AnimatedNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      previousValue.current = value;
      setDisplayValue(value);
      return;
    }

    const startValue = previousValue.current;
    const endValue = value;

    if (startValue === endValue) return;

    let frame = 0;
    const duration = 550;
    const startedAt = performance.now();

    const tick = (timestamp: number) => {
      const progress = Math.min((timestamp - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(startValue + (endValue - startValue) * eased);
      setDisplayValue(nextValue);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previousValue.current = endValue;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{displayValue.toLocaleString()}</span>;
}

function LeaderboardSkeleton({ presentationMode }: { presentationMode: boolean }) {
  return (
    <div className="divide-y divide-white/5">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className={`px-4 py-5 sm:px-6 ${presentationMode ? "lg:py-8" : ""}`}>
          <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
            <div className="flex items-center justify-center gap-3">
              <div className="skeleton-block h-12 w-16 rounded-full" />
              <div className="skeleton-block h-12 w-20 rounded-full" />
            </div>
            <div className="space-y-3">
              <div className="skeleton-block mx-auto h-8 w-48" />
              <div className="skeleton-block mx-auto h-3 w-full max-w-sm" />
            </div>
            <div className="skeleton-block mx-auto h-20 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoreBar({
  totalScore,
  presentationMode,
}: {
  totalScore: number;
  presentationMode: boolean;
}) {
  const width = Math.max(0, Math.min((totalScore / MAX_TOTAL_SCORE) * 100, 100));

  return (
    <div className={`overflow-hidden rounded-full bg-slate-800 ${presentationMode ? "h-3 w-full max-w-64" : "h-2 w-full max-w-44"}`}>
      <div
        className="progress-bar h-full rounded-full transition-all duration-700"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function StatChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-slate-300">
      {label} {value}
    </span>
  );
}

function LeaderboardRow({
  entry,
  index,
  prevRank,
  presentationMode,
}: {
  entry: LeaderboardEntry;
  index: number;
  prevRank: number | undefined;
  presentationMode: boolean;
}) {
  const badge = RANK_BADGES[entry.rank];
  const rankChanged = prevRank !== undefined && prevRank !== entry.rank;
  const rowStyle = {
    animationDelay: `${index * 0.05}s`,
    viewTransitionName: `leaderboard-${entry.climber_id}`,
  } as CSSProperties;

  const topTier = presentationMode && entry.rank <= 3;
  const nameClass = topTier ? "text-5xl sm:text-6xl" : presentationMode ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl";
  const scoreClass = topTier ? "text-5xl sm:text-6xl" : presentationMode ? "text-4xl sm:text-5xl" : "text-4xl";

  return (
    <div
      className={`leaderboard-row px-4 py-4 sm:px-6 ${presentationMode ? "lg:px-8 lg:py-6" : ""} ${
        rankChanged ? "animate-pulse" : ""
      } ${entry.rank === 1 ? "bg-yellow-400/5" : ""}`}
      style={rowStyle}
    >
      <div className="grid gap-4 text-center md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="flex items-center justify-center gap-3">
          <div
            className={`inline-flex min-w-14 items-center justify-center rounded-full border px-3 py-2 text-sm font-mono uppercase tracking-[0.22em] ${
              badge ? badge.tone : "border-white/10 bg-white/[0.03] text-slate-400"
            } ${presentationMode ? "min-w-16 px-4 py-3 text-base" : ""}`}
          >
            {badge ? badge.label : `#${entry.rank}`}
          </div>
          <div
            className={`rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-mono uppercase tracking-[0.22em] text-slate-300 ${
              presentationMode ? "px-4 py-3 text-sm" : ""
            }`}
          >
            #{entry.climber_number}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <h3 className={`section-title ${nameClass}`}>{entry.name.toUpperCase()}</h3>
            {rankChanged && (
              <span className="status-pill border-accent/20 bg-accent/10 text-red-100">
                Position Changed
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            <ScoreBar totalScore={entry.total_score} presentationMode={presentationMode} />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <StatChip label="Completed" value={`${entry.completed_routes}/${TOTAL_CLIMBS}`} />
              <StatChip label="Highest" value={entry.highest_completed_climb ? `C${entry.highest_completed_climb}` : "--"} />
              <StatChip label="Time" value={formatTime(entry.total_time_seconds)} />
            </div>
          </div>
        </div>

        <div
          className={`rounded-[1.6rem] border border-white/10 bg-black/20 px-4 py-3 text-center ${
            presentationMode ? "mx-auto min-w-48 px-6 py-5" : ""
          }`}
        >
          <div className="meta-label">Total</div>
          <AnimatedNumber value={entry.total_score} className={`mt-2 block font-display leading-none text-chalk ${scoreClass}`} />
          <div className={`mt-2 text-slate-300 ${presentationMode ? "text-base" : "text-sm"}`}>
            {entry.completed_routes} Climbs Completed
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [presentationMode, setPresentationMode] = useState(false);
  const prevRanksRef = useRef<Record<string, number>>({});

  const refreshLeaderboard = async () => {
    try {
      const climbers = await getAllClimbersWithAttempts();
      const board = buildLeaderboard(climbers).slice(0, TOP_N);
      const applyUpdate = () => {
        setLeaderboard(board);
        setLastUpdate(new Date());
        setPulse(true);
        setTimeout(() => setPulse(false), 500);
      };

      if ("startViewTransition" in document) {
        (
          document as Document & {
            startViewTransition?: (update: () => void) => void;
          }
        ).startViewTransition?.(applyUpdate);
      } else {
        applyUpdate();
      }

      setLoadError("");
    } catch (err) {
      console.error("Failed to refresh leaderboard:", err);
      setLoadError(err instanceof Error ? err.message : "Unable to load leaderboard.");
    }
  };

  useEffect(() => {
    refreshLeaderboard().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const channel = supabase
      .channel("leaderboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "climb_attempts" }, refreshLeaderboard)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "climbers" }, refreshLeaderboard)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const nextRanks: Record<string, number> = {};
    leaderboard.forEach((entry) => {
      nextRanks[entry.climber_id] = entry.rank;
    });
    prevRanksRef.current = nextRanks;
  }, [leaderboard]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setPresentationMode(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const lastUpdateLabel = lastUpdate?.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const liveBadge = (
    <div
      className={`status-pill ${
        pulse
          ? "border-green-400/30 bg-green-500/10 text-green-300"
          : "border-white/10 bg-white/[0.03] text-slate-300"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${pulse ? "bg-green-400" : "bg-slate-600"}`} />
      Live
      {lastUpdateLabel ? <span className="text-slate-200">{lastUpdateLabel}</span> : null}
    </div>
  );

  const togglePresentationMode = async () => {
    const nextMode = !presentationMode;
    setPresentationMode(nextMode);

    try {
      if (nextMode && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      }

      if (!nextMode && document.fullscreenElement) {
        await document.exitFullscreen?.();
      }
    } catch {
      // Fall back to layout-only presentation mode when the Fullscreen API is unavailable.
    }
  };

  const boardStatus = (
    <>
      <button onClick={togglePresentationMode} className="nav-pill">
        {presentationMode ? "Exit Presentation" : "Presentation Mode"}
      </button>
      {liveBadge}
    </>
  );

  return (
    <main className={`page-shell ${presentationMode ? "lg:px-4 lg:py-4" : ""}`}>
      <div className={`content-frame space-y-5 ${presentationMode ? "max-w-none" : ""}`}>
        {!presentationMode ? (
          <SiteHeader status={boardStatus} />
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {boardStatus}
          </div>
        )}

        {!presentationMode && (
          <div className="space-y-4 text-center">
            <div className="meta-label">Summit Series Standings</div>
            <h1 className="section-title text-4xl sm:text-5xl">Live Leaderboard</h1>
          </div>
        )}

        <section className={`card overflow-hidden p-0 ${presentationMode ? "border-white/5 bg-black/30" : ""}`}>
          <div className="border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3 text-center sm:text-left">
              <div className="w-full sm:w-auto">
                <div className="meta-label">{presentationMode ? "Live Standings" : "Current Order"}</div>
                <h2 className={`section-title mt-2 ${presentationMode ? "text-4xl sm:text-5xl" : "text-3xl"}`}>
                  Top {TOP_N}
                </h2>
              </div>
              {!presentationMode && (
                <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                  Score First, Lowest Time Second
                </div>
              )}
            </div>
          </div>

          {loadError && (
            <div className="border-b border-accent/20 bg-accent/10 px-6 py-4 text-sm text-accent">
              {loadError}
            </div>
          )}

          {loading ? (
            <LeaderboardSkeleton presentationMode={presentationMode} />
          ) : leaderboard.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="mx-auto mb-8 flex w-full max-w-sm items-end justify-center gap-4">
                <div className="podium-glow h-20 w-16 rounded-t-3xl border border-white/10 bg-white/[0.03]" />
                <div className="podium-glow h-28 w-20 rounded-t-3xl border border-yellow-400/20 bg-yellow-400/10" />
                <div className="podium-glow h-16 w-16 rounded-t-3xl border border-white/10 bg-white/[0.03]" />
              </div>
              <div className="meta-label">Waiting for Scores</div>
              <h3 className="section-title mt-4 text-4xl text-slate-300">No leaderboard entries yet.</h3>
              <p className="mt-3 text-sm text-slate-300">
                Scores will populate here as soon as climbers start completing routes.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {leaderboard.map((entry, index) => (
                <LeaderboardRow
                  key={entry.climber_id}
                  entry={entry}
                  index={index}
                  prevRank={prevRanksRef.current[entry.climber_id]}
                  presentationMode={presentationMode}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
