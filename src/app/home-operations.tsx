"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAllClimbersWithAttempts } from "@/lib/db";
import {
  buildLeaderboard,
  formatTime,
  getCompetitionSettings,
  type ClimberWithAttempts,
  type CompetitionSettings,
} from "@/lib/scoring";
import {
  SUPABASE_BROWSER_KEY_ERROR,
  SUPABASE_ENV_ERROR,
  publicSupabase,
  supabaseConfigured,
} from "@/lib/supabase";

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
  const [settings, setSettings] = useState<CompetitionSettings>({
    penalty_per_fail: 200,
    max_penalized_fails: 3,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = async () => {
    try {
      const [rows, nextSettings] = await Promise.all([
        getAllClimbersWithAttempts(),
        getCompetitionSettings(true),
      ]);
      setClimbers(rows);
      setSettings(nextSettings);
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
    void refresh();
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const channel = publicSupabase
      .channel("home-operations")
      .on("postgres_changes", { event: "*", schema: "public", table: "climbers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "climb_attempts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_settings" }, refresh)
      .subscribe();

    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, []);

  const totals = useMemo(() => {
    const attempts = climbers.flatMap((climber) => climber.climb_attempts);
    const completedRoutes = attempts.filter((attempt) => attempt.completed).length;
    const loggedAttempts = attempts.filter(
      (attempt) => attempt.completed || attempt.failed_attempts > 0
    ).length;
    const leaderboard = buildLeaderboard(climbers, settings);

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
            label: `Climb ${attempt.climb_number}`,
            detail: `${climber?.name ?? "Unknown athlete"} just topped Climb #${attempt.climb_number} in ${formatTime(
              attempt.completion_time_seconds ?? 0
            )}`,
            timestamp: attempt.completed_at as string,
            tone: "border-green-500/20 bg-green-500/10 text-green-300",
          };
        }),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 6);

    return {
      athleteCount: climbers.length,
      completedRoutes,
      loggedAttempts,
      leaderboard,
      activities,
    };
  }, [climbers, settings]);

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

  const boardUpdatedLabel = lastUpdated?.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const tickerItems = totals.activities.slice(0, 5);

  return (
    <>
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="eyebrow border-fbc-yellow/20 bg-fbc-yellow/10 text-fbc-yellow">
            FBC live feed
          </span>
          <span className="meta-label">{loading ? "syncing activity" : "community pulse"}</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-max items-center gap-3 pr-4">
            {loading ? (
              [0, 1, 2].map((index) => (
                <div key={index} className="skeleton-block h-14 w-72 rounded-[1.3rem]" />
              ))
            ) : tickerItems.length > 0 ? (
              tickerItems.map((activity) => (
                <div
                  key={activity.id}
                  className="card-muted flex min-w-[18rem] items-center gap-3 px-4 py-3"
                >
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] ${activity.tone}`}
                  >
                    {activity.label}
                  </span>
                  <p className="truncate text-sm text-slate-200">{activity.detail}</p>
                </div>
              ))
            ) : (
              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-300">
                Latest tops and registrations will stream here once the session starts.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="eyebrow">Operations board</span>
              <h2 className="section-title mt-4 text-4xl sm:text-5xl">See the room at a glance.</h2>
            </div>
            <div className={`status-pill ${statusTone}`}>
              <span
                className={`h-2 w-2 rounded-full ${
                  totals.completedRoutes > 0 ? "bg-green-400" : "bg-yellow-300"
                }`}
              />
              {liveStatus}
            </div>
          </div>

          {hasConfigIssue && (
            <div className="mt-5 rounded-[1.5rem] border border-accent/20 bg-accent/10 px-4 py-4 text-sm text-red-100">
              {error || (!supabaseConfigured ? SUPABASE_ENV_ERROR : SUPABASE_BROWSER_KEY_ERROR)}
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="hero-stat">
              <div className="meta-label">Athletes checked in</div>
              <div className="mt-3 font-display text-5xl text-chalk">{totals.athleteCount}</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Competitors currently in the event.
              </p>
            </div>
            <div className="hero-stat">
              <div className="meta-label">Routes completed</div>
              <div className="mt-3 font-display text-5xl text-chalk">{totals.completedRoutes}</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Finished routes logged across the field.
              </p>
            </div>
            <div className="hero-stat">
              <div className="meta-label">Recorded attempts</div>
              <div className="mt-3 font-display text-5xl text-chalk">{totals.loggedAttempts}</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Routes with failures or completion times entered.
              </p>
            </div>
            <div className="hero-stat">
              <div className="meta-label">Board last updated</div>
              <div className="mt-3 font-display text-5xl text-chalk">
                {boardUpdatedLabel ?? "--:--"}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Latest refresh from the scoring feed.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="meta-label">Current leader</div>
                  <div className="mt-2 font-display text-4xl text-chalk">
                    {totals.leaderboard[0]?.name?.toUpperCase() ?? "NO LEADER YET"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="meta-label">Top score</div>
                  <div className="mt-2 font-display text-4xl text-chalk">
                    {totals.leaderboard[0]?.total_score?.toLocaleString() ?? "0"}
                  </div>
                </div>
              </div>

              <p className="mt-3 text-sm leading-7 text-slate-300">
                {totals.leaderboard[0]
                  ? `Current tie-break time is ${formatTime(totals.leaderboard[0].total_time_seconds)}.`
                  : "Leaderboard details will snap into place as soon as athletes complete routes."}
              </p>
            </div>

            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="meta-label">Board pulse</div>
                  <div className="mt-2 font-display text-3xl text-chalk">Top three snapshot</div>
                </div>
                <span className="meta-label">Score then time</span>
              </div>

              <div className="mt-4 space-y-3">
                {loading ? (
                  [0, 1, 2].map((index) => (
                    <div key={index} className="skeleton-block h-16 w-full rounded-[1.3rem]" />
                  ))
                ) : totals.leaderboard.length > 0 ? (
                  totals.leaderboard.slice(0, 3).map((entry) => (
                    <div
                      key={entry.climber_id}
                      className="card-muted flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="meta-label">Rank {entry.rank}</div>
                        <div className="mt-2 truncate text-lg font-semibold text-chalk">
                          {entry.name.toUpperCase()}
                        </div>
                        <div className="mt-1 text-sm text-slate-300">
                          #{entry.climber_number} | {formatTime(entry.total_time_seconds)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="meta-label">Score</div>
                        <div className="mt-2 font-display text-3xl text-chalk">
                          {entry.total_score.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                    <div className="meta-label">Standings idle</div>
                    <p className="mt-3 text-sm leading-7 text-slate-300">
                      Once routes begin closing out, the top athletes will appear here immediately.
                    </p>
                  </div>
                )}
              </div>
            </div>
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
                  <div key={index} className="skeleton-block h-16 w-full rounded-[1.3rem]" />
                ))
              ) : totals.activities.length > 0 ? (
                totals.activities.map((activity) => (
                  <div key={activity.id} className="card-muted flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] ${activity.tone}`}
                      >
                        {activity.label}
                      </span>
                      <p className="mt-3 text-sm leading-6 text-slate-200">{activity.detail}</p>
                    </div>
                    <div className="meta-label whitespace-nowrap">
                      {formatRelativeTime(activity.timestamp)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                  <div className="meta-label">No activity yet</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    Registrations and route completions will show up here as soon as the event starts moving.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="eyebrow">Quick actions</span>
              <span className="meta-label">Operational shortcuts</span>
            </div>

            <div className="mt-5 grid gap-3">
              <Link href="/register" className="command-link">
                <div>
                  <div className="meta-label">Front desk</div>
                  <div className="mt-2 text-lg font-semibold text-chalk">Register a competitor</div>
                </div>
                <span className="text-sm font-semibold text-accent">Go</span>
              </Link>

              <Link href="/scorecard" className="command-link">
                <div>
                  <div className="meta-label">Judge view</div>
                  <div className="mt-2 text-lg font-semibold text-chalk">Open route controls</div>
                </div>
                <span className="text-sm font-semibold text-fbc-blue">Go</span>
              </Link>

              <Link href="/leaderboard" className="command-link">
                <div>
                  <div className="meta-label">Projection</div>
                  <div className="mt-2 text-lg font-semibold text-chalk">Show live board</div>
                </div>
                <span className="text-sm font-semibold text-fbc-yellow">Go</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
