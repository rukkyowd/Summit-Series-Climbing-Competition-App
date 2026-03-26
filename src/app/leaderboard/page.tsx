"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteHeader from "@/components/site-header";
import { getCompetitionCategories, getLeaderboardRows } from "@/lib/db";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import {
  formatTime,
  mapLeaderboardViewRowToEntry,
  TOTAL_CLIMBS,
  type LeaderboardEntry,
} from "@/lib/scoring";

const TOP_N = 10;
const ALL_CATEGORIES = "All Categories";

const RANK_BADGES: Record<number, { label: string; tone: string }> = {
  1: { label: "1st", tone: "text-yellow-300 border-yellow-400/20 bg-yellow-400/10" },
  2: { label: "2nd", tone: "text-slate-200 border-slate-300/20 bg-slate-300/10" },
  3: { label: "3rd", tone: "text-amber-300 border-amber-400/20 bg-amber-400/10" },
};

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    const startValue = previousValue.current;
    const endValue = value;

    if (startValue === endValue) {
      return;
    }

    let frame = 0;
    const duration = 500;
    const startedAt = performance.now();

    const tick = (timestamp: number) => {
      const progress = Math.min((timestamp - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + (endValue - startValue) * eased));

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

function LeaderboardSkeleton() {
  return (
    <div className="divide-y divide-white/5">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="px-4 py-5 sm:px-6">
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

function StatChip({ label, value }: { label: string; value: string }) {
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
}: {
  entry: LeaderboardEntry;
  index: number;
  prevRank: number | undefined;
}) {
  const badge = RANK_BADGES[entry.rank];
  const rankChanged = prevRank !== undefined && prevRank !== entry.rank;
  const rowStyle = {
    animationDelay: `${index * 0.05}s`,
    viewTransitionName: `leaderboard-${entry.climber_id}`,
  } as CSSProperties;

  return (
    <div
      className={`leaderboard-row px-4 py-4 sm:px-6 ${rankChanged ? "animate-pulse" : ""} ${
        entry.rank === 1 ? "bg-yellow-400/5" : ""
      }`}
      style={rowStyle}
    >
      <div className="grid gap-4 text-center md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="flex items-center justify-center gap-3">
          <div
            className={`inline-flex min-w-14 items-center justify-center rounded-full border px-3 py-2 text-sm font-mono uppercase tracking-[0.22em] ${
              badge ? badge.tone : "border-white/10 bg-white/[0.03] text-slate-400"
            }`}
          >
            {badge ? badge.label : `#${entry.rank}`}
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-mono uppercase tracking-[0.22em] text-slate-300">
            #{entry.climber_number}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <h3 className="section-title text-3xl sm:text-4xl">{entry.name.toUpperCase()}</h3>
            <span className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
              {entry.category}
            </span>
            {rankChanged ? (
              <span className="status-pill border-accent/20 bg-accent/10 text-red-100">
                Position Changed
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <StatChip label="Completed" value={`${entry.completed_routes}/${TOTAL_CLIMBS}`} />
            <StatChip
              label="Highest"
              value={entry.highest_completed_climb ? `C${entry.highest_completed_climb}` : "--"}
            />
            <StatChip label="Time" value={formatTime(entry.total_time_seconds)} />
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-white/10 bg-black/20 px-4 py-3 text-center">
          <div className="meta-label">Total</div>
          <AnimatedNumber
            value={entry.total_score}
            className="mt-2 block font-display text-4xl leading-none text-chalk"
          />
          <div className="mt-2 text-sm text-slate-300">{entry.completed_routes} Climbs Completed</div>
        </div>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(false);
  const [loadError, setLoadError] = useState("");
  const prevRanksRef = useRef<Record<string, number>>({});

  const categoryScoped = selectedCategory !== ALL_CATEGORIES;

  const refreshLeaderboard = useCallback(async () => {
    try {
      const [rows, availableCategories] = await Promise.all([
        getLeaderboardRows(categoryScoped ? selectedCategory : null),
        getCompetitionCategories(),
      ]);

      const board = rows
        .map((row) => mapLeaderboardViewRowToEntry(row, categoryScoped))
        .slice(0, TOP_N);

      const applyUpdate = () => {
        setLeaderboard(board);
        setCategories(availableCategories);
        setLastUpdate(new Date());
        setPulse(true);
        window.setTimeout(() => setPulse(false), 500);
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
    } catch (error) {
      console.error("Failed to refresh leaderboard:", error);
      setLoadError(error instanceof Error ? error.message : "Unable to load leaderboard.");
    } finally {
      setLoading(false);
    }
  }, [categoryScoped, selectedCategory]);

  useEffect(() => {
    refreshLeaderboard();
  }, [refreshLeaderboard]);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const channel = supabase
      .channel("leaderboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "climb_attempts" }, refreshLeaderboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "climbers" }, refreshLeaderboard)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "competition_settings" },
        refreshLeaderboard
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshLeaderboard]);

  useEffect(() => {
    const nextRanks: Record<string, number> = {};
    leaderboard.forEach((entry) => {
      nextRanks[entry.climber_id] = entry.rank;
    });
    prevRanksRef.current = nextRanks;
  }, [leaderboard]);

  const filterOptions = useMemo(
    () => [ALL_CATEGORIES, ...categories.filter((category) => category !== ALL_CATEGORIES)],
    [categories]
  );

  const lastUpdateLabel = lastUpdate?.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const status = (
    <>
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
      <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
        {categoryScoped ? selectedCategory : "All divisions"}
      </div>
    </>
  );

  return (
    <main className="page-shell">
      <div className="content-frame space-y-5">
        <SiteHeader status={status} />

        <div className="space-y-4 text-center">
          <div className="meta-label">Summit Series Standings</div>
          <h1 className="section-title text-4xl sm:text-5xl">Live Leaderboard</h1>
          <p className="mx-auto max-w-2xl text-sm text-slate-300">
            Filter by category to compare climbers inside a division, or stay on the full board for
            overall standings.
          </p>
        </div>

        <section className="card overflow-hidden p-0">
          <div className="border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-center sm:text-left">
                <div>
                  <div className="meta-label">Current Order</div>
                  <h2 className="section-title mt-2 text-3xl">
                    Top {TOP_N} {categoryScoped ? selectedCategory : "Across All Categories"}
                  </h2>
                </div>
                <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                  Score First, Lowest Time Second
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {filterOptions.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`rounded-full border px-4 py-2 text-xs font-mono uppercase tracking-[0.22em] transition-colors ${
                      selectedCategory === category
                        ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
                        : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loadError ? (
            <div className="border-b border-accent/20 bg-accent/10 px-6 py-4 text-sm text-accent">
              {loadError}
            </div>
          ) : null}

          {loading ? (
            <LeaderboardSkeleton />
          ) : leaderboard.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="meta-label">Waiting for Scores</div>
              <h3 className="section-title mt-4 text-4xl text-slate-300">
                No entries in this category yet.
              </h3>
              <p className="mt-3 text-sm text-slate-300">
                Score updates will appear here as soon as climbers in this division finish routes.
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
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
