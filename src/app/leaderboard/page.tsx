"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buildLeaderboard, formatTime, type LeaderboardEntry } from "@/lib/scoring";
import { getAllClimbersWithAttempts } from "@/lib/db";
import { supabase, supabaseConfigured } from "@/lib/supabase";

const TOP_N = 6;

const SCORE_SEGMENTS = [
  { key: "route-1", start: 0, points: 1000, color: "bg-green-500" },
  { key: "route-2", start: 1000, points: 2000, color: "bg-blue-500" },
  { key: "route-3", start: 3000, points: 3000, color: "bg-accent" },
];

const RANK_BADGES: Record<number, { label: string; tone: string }> = {
  1: { label: "1st", tone: "text-yellow-300 border-yellow-400/20 bg-yellow-400/10" },
  2: { label: "2nd", tone: "text-slate-200 border-slate-300/20 bg-slate-300/10" },
  3: { label: "3rd", tone: "text-amber-300 border-amber-400/20 bg-amber-400/10" },
};

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex h-2 w-full max-w-36 gap-1">
      {SCORE_SEGMENTS.map((segment) => {
        const filled = Math.max(0, Math.min(score - segment.start, segment.points));
        const width = (filled / segment.points) * 100;

        return (
          <div key={segment.key} className="flex-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ${segment.color}`}
              style={{ width: `${width}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function ScorePill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  if (value <= 0) return null;

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest ${tone}`}>
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

  return (
    <div
      className={`leaderboard-row px-4 py-4 sm:px-6 ${rankChanged ? "animate-pulse" : ""} ${
        entry.rank === 1 ? "bg-yellow-400/5" : ""
      }`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="flex items-center gap-3">
          <div
            className={`inline-flex min-w-14 items-center justify-center rounded-full border px-3 py-2 text-sm font-mono uppercase tracking-widest ${
              badge ? badge.tone : "border-white/10 bg-white/[0.03] text-slate-400"
            }`}
          >
            {badge ? badge.label : `#${entry.rank}`}
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-mono uppercase tracking-widest text-slate-500">
            #{entry.climber_number}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="section-title text-3xl leading-none sm:text-4xl">{entry.name.toUpperCase()}</h3>
            {rankChanged && (
              <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-accent">
                position changed
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ScoreBar score={entry.total_score} />
            <ScorePill label="R1" value={entry.climb1_score} tone="border-green-500/20 bg-green-500/10 text-green-300" />
            <ScorePill label="R2" value={entry.climb2_score} tone="border-blue-500/20 bg-blue-500/10 text-blue-300" />
            <ScorePill label="R3" value={entry.climb3_score} tone="border-accent/20 bg-accent/10 text-red-200" />
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-right">
          <div className="text-xs font-mono uppercase tracking-widest text-slate-500">Total</div>
          <div className="section-title text-4xl leading-none text-chalk">{entry.total_score.toLocaleString()}</div>
          <div className="mt-2 text-xs font-mono uppercase tracking-widest text-slate-500">
            {entry.total_time_seconds > 0 ? formatTime(entry.total_time_seconds) : "No time yet"}
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
  const prevRanksRef = useRef<Record<string, number>>({});

  const refreshLeaderboard = async () => {
    try {
      const climbers = await getAllClimbersWithAttempts();
      const board = buildLeaderboard(climbers).slice(0, TOP_N);
      setLeaderboard(board);
      setLastUpdate(new Date());
      setPulse(true);
      setTimeout(() => setPulse(false), 500);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "climb_attempts" }, () => refreshLeaderboard())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "climbers" }, () => refreshLeaderboard())
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

  const lastUpdateLabel = lastUpdate?.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <main className="page-shell">
      <div className="content-frame space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="btn-ghost px-4 py-2 text-xs">
            Back home
          </Link>
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
              pulse ? "border-green-400/30 bg-green-500/10 text-green-300" : "border-white/10 bg-white/[0.03] text-slate-400"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${pulse ? "bg-green-400" : "bg-slate-600"}`} />
            Live
            {lastUpdateLabel && <span className="text-slate-500">{lastUpdateLabel}</span>}
          </div>
        </div>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="card">
            <span className="eyebrow">Broadcast board</span>
            <div className="mt-5 max-w-3xl">
              <p className="text-sm font-mono uppercase tracking-[0.35em] text-slate-500">
                Summit Series top six
              </p>
              <h1 className="section-title mt-4 text-5xl sm:text-6xl lg:text-7xl">
                The leaderboard now feels stage-ready.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Scores, route contribution, and tie-break time are grouped into one cleaner ranking
                surface so judges can verify placements and spectators can read the board from a
                distance.
              </p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="stat-card">
                <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                  Board depth
                </div>
                <div className="mt-2 font-display text-4xl text-chalk">{TOP_N}</div>
                <p className="mt-2 text-sm text-slate-400">Top competitors kept visible at all times.</p>
              </div>
              <div className="stat-card">
                <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                  Tie-break
                </div>
                <div className="mt-2 font-display text-4xl text-chalk">Time</div>
                <p className="mt-2 text-sm text-slate-400">Lowest combined completion time wins ties.</p>
              </div>
              <div className="stat-card">
                <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                  Update mode
                </div>
                <div className="mt-2 font-display text-4xl text-chalk">Live</div>
                <p className="mt-2 text-sm text-slate-400">Realtime refresh keeps the room synchronized.</p>
              </div>
            </div>
          </div>

          <aside className="card flex flex-col justify-between gap-5">
            <div>
              <span className="eyebrow">How to read it</span>
              <div className="mt-5 space-y-3 text-sm leading-7 text-slate-300">
                <p>Route bars show how much of the 6,000-point ceiling each athlete has locked in.</p>
                <p>Per-route chips make it obvious where the score came from without opening a detail view.</p>
                <p>Rank badges and large totals help the top three hold visual priority on a projector.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="card-muted">
                <div className="text-xs font-mono uppercase tracking-widest text-slate-500">Route palette</div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono uppercase tracking-widest">
                  <span className="rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-green-300">R1 1000</span>
                  <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-blue-300">R2 2000</span>
                  <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-red-200">R3 3000</span>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                  Event flow
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <p>Scores appear as soon as routes are completed.</p>
                  <p>Failed attempts affect score, but only the first three are penalized.</p>
                  <p>Time only matters once athletes begin stacking completed routes.</p>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className="card overflow-hidden p-0">
          <div className="border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                  Live standings
                </div>
                <h2 className="section-title mt-2 text-3xl">Current order</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-mono uppercase tracking-widest text-slate-500">
                score first, lowest time second
              </div>
            </div>
          </div>

          {loadError && (
            <div className="border-b border-accent/20 bg-accent/10 px-6 py-4 text-sm text-accent">
              {loadError}
            </div>
          )}

          {loading ? (
            <div className="px-6 py-20 text-center">
              <div className="mx-auto h-10 w-10 rounded-full border-2 border-white/10 border-t-accent animate-spin" />
              <p className="mt-4 text-sm font-mono uppercase tracking-widest text-slate-500">
                Loading rankings
              </p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                Waiting for scores
              </div>
              <h3 className="section-title mt-4 text-4xl text-slate-300">No leaderboard entries yet.</h3>
              <p className="mt-3 text-sm text-slate-400">
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
                />
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/register" className="btn-ghost px-4 py-2 text-xs">
            Register athletes
          </Link>
          <Link href="/scorecard" className="btn-ghost px-4 py-2 text-xs">
            Open scorecards
          </Link>
        </div>
      </div>
    </main>
  );
}
