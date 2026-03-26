"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAllClimbersWithAttempts } from "@/lib/db";
import { buildLeaderboard, formatTime, type ClimberWithAttempts } from "@/lib/scoring";
import { SUPABASE_BROWSER_KEY_ERROR, SUPABASE_ENV_ERROR, supabase, supabaseConfigured } from "@/lib/supabase";

type ActivityItem = {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  tone: string;
};

function formatRelativeTime(timestamp: string) {
  const deltaMs = Date.now() - new Date(timestamp).getTime();
  const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000));

  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export default function HomeOperations() {
  const [climbers, setClimbers] = useState<ClimberWithAttempts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = async () => {
    try {
      const rows = await getAllClimbersWithAttempts();
      setClimbers(rows);
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load event status.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const channel = supabase
      .channel("home-operations")
      .on("postgres_changes", { event: "*", schema: "public", table: "climbers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "climb_attempts" }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totals = useMemo(() => {
    const attempts = climbers.flatMap((climber) => climber.climb_attempts);
    const completedRoutes = attempts.filter((attempt) => attempt.completed).length;
    const loggedAttempts = attempts.filter(
      (attempt) => attempt.completed || attempt.failed_attempts > 0
    ).length;
    const leaderboard = buildLeaderboard(climbers);

    const activities: ActivityItem[] = [
      ...climbers
        .filter((climber) => climber.registered_at)
        .map((climber) => ({
          id: `reg-${climber.id}`,
          label: "Registered",
          detail: `${climber.name} joined as #${climber.climber_number}`,
          timestamp: climber.registered_at as string,
          tone: "border-blue-500/20 bg-blue-500/10 text-blue-300",
        })),
      ...attempts
        .filter((attempt) => attempt.completed && attempt.completed_at)
        .map((attempt) => {
          const climber = climbers.find((entry) => entry.id === attempt.climber_id);
          return {
            id: `finish-${attempt.id ?? `${attempt.climber_id}-${attempt.climb_number}`}`,
            label: `Route ${attempt.climb_number}`,
            detail: `${climber?.name ?? "Unknown athlete"} finished in ${formatTime(
              attempt.completion_time_seconds ?? 0
            )}`,
            timestamp: attempt.completed_at as string,
            tone: "border-green-500/20 bg-green-500/10 text-green-300",
          };
        }),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    return {
      athleteCount: climbers.length,
      completedRoutes,
      loggedAttempts,
      leaderboard,
      activities,
    };
  }, [climbers]);

  const liveStatus = !supabaseConfigured
    ? "Configuration needed"
    : totals.athleteCount === 0
    ? "Waiting for athletes"
    : totals.completedRoutes === 0
    ? "Check-in active"
    : "Competition live";
  const hasConfigIssue = !supabaseConfigured || error === SUPABASE_BROWSER_KEY_ERROR;

  const statusTone = !supabaseConfigured
    ? "border-accent/20 bg-accent/10 text-red-100"
    : totals.completedRoutes > 0
    ? "border-green-500/20 bg-green-500/10 text-green-200"
    : "border-yellow-500/20 bg-yellow-500/10 text-yellow-100";

  const lastUpdatedLabel = lastUpdated?.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="eyebrow">Live event status</span>
          <div className={`rounded-full border px-4 py-2 text-xs font-mono uppercase tracking-widest ${statusTone}`}>
            {liveStatus}
          </div>
        </div>

        {hasConfigIssue && (
          <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-4 text-sm text-red-100">
            {error || (!supabaseConfigured ? SUPABASE_ENV_ERROR : SUPABASE_BROWSER_KEY_ERROR)}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="stat-card">
            <div className="meta-label">Athletes</div>
            <div className="mt-2 font-display text-4xl text-chalk">{totals.athleteCount}</div>
            <p className="mt-2 font-body text-sm text-slate-300">Total competitors currently checked in.</p>
          </div>
          <div className="stat-card">
            <div className="meta-label">Routes complete</div>
            <div className="mt-2 font-display text-4xl text-chalk">{totals.completedRoutes}</div>
            <p className="mt-2 font-body text-sm text-slate-300">Finished routes across the whole event.</p>
          </div>
          <div className="stat-card">
            <div className="meta-label">Recorded attempts</div>
            <div className="mt-2 font-display text-4xl text-chalk">{totals.loggedAttempts}</div>
            <p className="mt-2 font-body text-sm text-slate-300">Routes with fails or completed times entered.</p>
          </div>
          <div className="stat-card">
            <div className="meta-label">Board updated</div>
            <div className="mt-2 font-display text-4xl text-chalk">{lastUpdatedLabel ?? "--:--"}</div>
            <p className="mt-2 font-body text-sm text-slate-300">Latest refresh from the live scoring feed.</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="meta-label">Current leader</div>
              <div className="mt-2 font-display text-3xl text-chalk">
                {totals.leaderboard[0]?.name?.toUpperCase() ?? "No leader yet"}
              </div>
            </div>
            <div className="text-right">
              <div className="meta-label">Top score</div>
              <div className="mt-2 font-display text-3xl text-chalk">
                {totals.leaderboard[0]?.total_score?.toLocaleString() ?? "0"}
              </div>
            </div>
          </div>
          <p className="mt-3 font-body text-sm text-slate-300">
            {totals.leaderboard[0]
              ? `Time tie-break currently sits at ${formatTime(totals.leaderboard[0].total_time_seconds)}.`
              : "Leaderboard will update here once routes start getting completed."}
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="eyebrow">Recent activity</span>
            <span className="meta-label">{loading ? "syncing" : "live feed"}</span>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              [0, 1, 2, 3].map((index) => (
                <div key={index} className="skeleton-block h-16 w-full rounded-2xl" />
              ))
            ) : totals.activities.length > 0 ? (
              totals.activities.map((activity) => (
                <div key={activity.id} className="card-muted flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest ${activity.tone}`}>
                      {activity.label}
                    </span>
                    <p className="mt-3 font-body text-sm text-slate-200">{activity.detail}</p>
                  </div>
                  <div className="meta-label whitespace-nowrap">{formatRelativeTime(activity.timestamp)}</div>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="meta-label">No activity yet</div>
                <p className="mt-3 font-body text-sm text-slate-300">
                  As athletes register and routes are completed, the event feed will appear here.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="eyebrow">Quick actions</span>
            <span className="meta-label">Ops shortcuts</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Link href="/register" className="btn-primary w-full">
              Register athlete
            </Link>
            <Link href="/scorecard" className="btn-ghost w-full">
              Judge routes
            </Link>
            <Link href="/leaderboard" className="btn-ghost w-full">
              Show leaderboard
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
