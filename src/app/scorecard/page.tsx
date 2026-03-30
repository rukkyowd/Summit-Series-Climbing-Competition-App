"use client";

import { type CSSProperties, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import { getAuthState, isStaffRole, signInWithRole, signOutUser, type Profile } from "@/lib/auth";
import {
  addFailedAttempt,
  completeClimb,
  deleteAllClimbers,
  deleteClimber,
  getAllClimbersWithAttempts,
  getAttemptSnapshot,
  getClimberById,
  getClimberByNumber,
  removeLastFail,
  resetClimb,
  startClimbAttempt,
} from "@/lib/db";
import {
  applyOptimisticQueueAction,
  buildQueueActionId,
  captureAttemptSnapshot,
  hasAttemptConflict,
  isNetworkLikeError,
  readActiveTimers,
  readOfflineQueue,
  writeActiveTimers,
  writeOfflineQueue,
  type AttemptSnapshot,
  type QueueAction,
} from "@/lib/offline-scorecard";
import { publicSupabase, supabase, supabaseConfigured } from "@/lib/supabase";
import {
  CLIMBS,
  buildLeaderboard,
  calculateClimbScore,
  calculateTotalScore,
  calculateTotalTime,
  countCompletedRoutes,
  formatTime,
  getCompetitionSettings,
  getClimbDifficulty,
  TOTAL_CLIMBS,
  type ClimbAttempt,
  type ClimbDifficulty,
  type ClimbNumber,
  type ClimberWithAttempts,
  type CompetitionSettings,
  type LeaderboardEntry,
} from "@/lib/scoring";

const RECENT_LOOKUPS_KEY = "scorecard-recent-lookups";
const FAIL_UNDO_WINDOW_MS = 4500;

type Notice = { tone: "error" | "success" | "warning"; message: string };
type DangerTarget = "climber" | "all" | null;
type RecentLookup = { id: string; name: string; climber_number: string };
type UndoToast = { climbNumber: ClimbNumber; label: string; expiresAt: number };
type SyncToast = { message: string; expiresAt: number };

const DIFFICULTY_META: Record<
  ClimbDifficulty,
  {
    label: string;
    chipClass: string;
    navigatorClass: string;
  }
> = {
  easy: {
    label: "Easy",
    chipClass: "border-blue-500/20 bg-blue-500/10 text-blue-200",
    navigatorClass: "border-blue-500/20 bg-blue-500/10 text-blue-200",
  },
  medium: {
    label: "Medium",
    chipClass: "border-amber-500/20 bg-amber-500/10 text-amber-100",
    navigatorClass: "border-amber-500/20 bg-amber-500/10 text-amber-100",
  },
  hard: {
    label: "Hard",
    chipClass: "border-red-500/20 bg-red-500/10 text-red-100",
    navigatorClass: "border-red-500/20 bg-red-500/10 text-red-100",
  },
};

function getAttempt(attempts: ClimbAttempt[], climbNumber: number) {
  return attempts.find((attempt) => attempt.climb_number === climbNumber);
}

function getNoticeClass(tone: Notice["tone"]) {
  if (tone === "error") {
    return "border-accent/30 bg-accent/10 text-accent";
  }

  if (tone === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }

  return "border-green-500/20 bg-green-500/10 text-green-200";
}

function triggerHaptic(pattern: number | number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }

  navigator.vibrate(pattern);
}

function buildAttemptExpectedState(attempt?: ClimbAttempt): AttemptSnapshot {
  return captureAttemptSnapshot(attempt);
}

function getRankDeltaSummary(entry: LeaderboardEntry, leaderboard: LeaderboardEntry[]) {
  const entryIndex = leaderboard.findIndex((row) => row.climber_id === entry.climber_id);
  if (entryIndex <= 0) {
    return {
      label: "Field lead",
      detail: "Currently holding first place.",
    };
  }

  const ahead = leaderboard[entryIndex - 1];
  const scoreGap = ahead.total_score - entry.total_score;

  if (scoreGap > 0) {
    return {
      label: `${(scoreGap + 1).toLocaleString()} pts to move up`,
      detail: `Passing ${ahead.name} takes ${(scoreGap + 1).toLocaleString()} more points.`,
    };
  }

  const timeGap = Math.max(0, entry.total_time_seconds - ahead.total_time_seconds);
  return {
    label: timeGap ? `${formatTime(timeGap)} faster wins the tie` : "Tied on score and time",
    detail: timeGap
      ? `Matching score is already enough. ${formatTime(timeGap)} faster would take the next spot.`
      : `This score is tied exactly with ${ahead.name}.`,
  };
}

function getAuthBootstrapMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Judge session is unavailable right now. Public scorecards still work.";
  }

  if (error.message.toLowerCase().includes("timed out")) {
    return "Judge session lookup is taking too long. Public scorecards still work, and judges can try signing in again.";
  }

  return "Judge session is unavailable right now. Public scorecards still work.";
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    const start = previousValue.current;
    const end = value;
    if (start === end) return;

    let frame = 0;
    const startedAt = performance.now();
    const tick = (timestamp: number) => {
      const progress = Math.min((timestamp - startedAt) / 450, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(start + (end - start) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previousValue.current = end;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{displayValue.toLocaleString()}</span>;
}

function LongPressResetButton({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm: () => void;
}) {
  const HOLD_MS = 3000;
  const frameRef = useRef<number>();
  const startedAtRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);

  const stopHolding = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
    startedAtRef.current = null;
    firedRef.current = false;
    setHolding(false);
    setProgress(0);
  }, []);

  const startHolding = useCallback(() => {
    if (disabled) return;
    const startedAt = performance.now();
    startedAtRef.current = startedAt;
    firedRef.current = false;
    setHolding(true);

    const tick = (timestamp: number) => {
      if (!startedAtRef.current || firedRef.current) {
        return;
      }

      const elapsed = timestamp - startedAtRef.current;
      const nextProgress = Math.min(elapsed / HOLD_MS, 1);
      setProgress(nextProgress);

      if (nextProgress >= 1) {
        firedRef.current = true;
        stopHolding();
        onConfirm();
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [disabled, onConfirm, stopHolding]);

  useEffect(() => stopHolding, [stopHolding]);

  return (
    <button
      type="button"
      onPointerDown={startHolding}
      onPointerUp={stopHolding}
      onPointerLeave={stopHolding}
      onPointerCancel={stopHolding}
      onContextMenu={(event) => event.preventDefault()}
      disabled={disabled}
      className="btn-ghost relative w-full justify-center overflow-hidden border-accent/20 text-red-100"
    >
      <span
        className="absolute inset-y-0 left-0 bg-red-500/18 transition-[width] duration-100"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative z-10">
        {holding ? `Keep holding ${Math.max(1, Math.ceil((1 - progress) * 3))}s` : "Hold 3s to reset"}
      </span>
    </button>
  );
}

function AccessCard({
  profile,
  authLoading,
  email,
  password,
  setEmail,
  setPassword,
  onSubmit,
  onSignOut,
  error,
}: {
  profile: Profile | null;
  authLoading: boolean;
  email: string;
  password: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onSignOut: () => void;
  error: string;
}) {
  if (profile && isStaffRole(profile.role)) {
    return (
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Judge access</div>
            <h2 className="section-title mt-4 text-3xl">Signed in as {profile.role}</h2>
            <p className="mt-3 text-sm text-slate-300">
              Supabase Auth is active. Route updates and athlete registration are unlocked.
            </p>
          </div>
          <button onClick={onSignOut} className="btn-ghost">
            Sign out
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Judge access</div>
          <h2 className="section-title mt-4 text-3xl">Sign in with Supabase Auth</h2>
        </div>
        <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">Staff only</div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="judge@summitseries.com" className="input-field" autoComplete="email" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="input-field" autoComplete="current-password" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={authLoading} className="btn-primary">
          {authLoading ? "Checking session..." : "Sign in for route controls"}
        </button>
        <p className="text-sm text-slate-300">Public users can read scorecards. Only judge/admin roles can write.</p>
      </div>

      {error ? <p className="mt-3 text-sm text-accent">{error}</p> : null}
    </form>
  );
}

function ClimbCard({
  climb,
  attempt,
  canJudge,
  loading,
  now,
  settings,
  timerStartedAt,
  pendingSync,
  isActive,
  onStart,
  onAddFail,
  onUndoFail,
  onComplete,
  onReset,
}: {
  climb: (typeof CLIMBS)[number];
  attempt?: ClimbAttempt;
  canJudge: boolean;
  loading: boolean;
  now: number;
  settings: CompetitionSettings;
  timerStartedAt?: string;
  pendingSync: boolean;
  isActive: boolean;
  onStart: () => void;
  onAddFail: () => void;
  onUndoFail: () => void;
  onComplete: (seconds: number) => void;
  onReset: () => void;
}) {
  const fails = attempt?.failed_attempts ?? 0;
  const completed = attempt?.completed ?? false;
  const difficulty = getClimbDifficulty(climb.number);
  const difficultyMeta = DIFFICULTY_META[difficulty];
  const cappedFails = Math.min(fails, settings.max_penalized_fails);
  const score = calculateClimbScore(climb.number, fails, completed, settings);
  const timerSeconds = timerStartedAt
    ? Math.max(1, Math.floor((now - new Date(timerStartedAt).getTime()) / 1000))
    : 0;
  const articleClass = completed
    ? "border-green-500/20"
    : isActive
      ? "border-blue-500/20 shadow-[0_0_0_1px_rgba(52,152,219,0.14)]"
      : "border-white/10";

  return (
    <article id={`climb-card-${climb.number}`} className={`card border ${articleClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
              Climb {climb.number.toString().padStart(2, "0")}
            </div>
            <div className={`status-pill ${difficultyMeta.chipClass}`}>{difficultyMeta.label}</div>
            {isActive ? (
              <div className="status-pill border-blue-500/20 bg-blue-500/10 text-blue-200">
                Active climb
              </div>
            ) : null}
          </div>
          <h3 className="section-title mt-4 text-3xl">{climb.label}</h3>
          <p className="mt-2 text-sm text-slate-300">{climb.basePoints.toLocaleString()} base points</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-right">
          <div className="meta-label">Score</div>
          <AnimatedNumber value={completed ? score : 0} className="mt-2 block font-display text-4xl text-chalk" />
          <div className="mt-2 text-sm text-slate-300">{attempt?.completion_time_seconds ? formatTime(attempt.completion_time_seconds) : "No finish yet"}</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="meta-label">Live timer</div>
              <div className="mt-2 font-display text-4xl text-chalk">{timerStartedAt ? formatTime(timerSeconds) : "0:00"}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-mono uppercase tracking-widest">
              {timerStartedAt ? (
                <span className="rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-green-200">
                  running
                </span>
              ) : null}
              {pendingSync ? (
                <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-yellow-100">
                  pending sync
                </span>
              ) : null}
              {completed ? (
                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-blue-200">
                  complete
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-mono uppercase tracking-widest text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">fails {fails}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">penalized {cappedFails}/{settings.max_penalized_fails}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">penalty -{cappedFails * settings.penalty_per_fail}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
        <div className="meta-label">Judge controls</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            onClick={onStart}
            disabled={loading || !canJudge || Boolean(timerStartedAt) || completed}
            className="btn-primary w-full justify-center"
          >
            {timerStartedAt ? "Attempt running" : "Start attempt"}
          </button>
          <button
            onClick={onAddFail}
            disabled={loading || !canJudge || completed}
            className="btn-primary judge-action-secondary w-full justify-center"
          >
            Add fail
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            onClick={onUndoFail}
            disabled={loading || !canJudge || completed || fails === 0}
            className="btn-ghost w-full justify-center"
          >
            Undo fail
          </button>
          <button
            onClick={() => onComplete(timerSeconds)}
            disabled={loading || !canJudge || !timerStartedAt || completed}
            className="btn-ghost w-full justify-center"
          >
            Stop and complete
          </button>
        </div>
        {completed && canJudge ? (
          <div className="mt-3">
            <LongPressResetButton disabled={loading} onConfirm={onReset} />
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-sm text-slate-300">
        {canJudge
          ? "Completion time is written automatically from the live timer. Offline writes are queued and synced later."
          : "Sign in as a judge or admin to start timers and record results."}
      </p>
    </article>
  );
}

function ScorecardLoading() {
  return (
    <main className="page-shell">
      <div className="content-frame space-y-6">
        <section className="app-header">
          <div className="flex flex-col items-center gap-4">
            <div className="skeleton-block h-12 w-44" />
            <div className="flex flex-wrap justify-center gap-2">
              <div className="skeleton-block h-10 w-24 rounded-full" />
              <div className="skeleton-block h-10 w-24 rounded-full" />
              <div className="skeleton-block h-10 w-28 rounded-full" />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="skeleton-block h-8 w-32" />
              <div className="skeleton-block h-16 w-3/4" />
              <div className="skeleton-block h-20 w-full" />
            </div>
            <div className="rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
              <div className="skeleton-block h-10 w-full" />
              <div className="skeleton-block mt-5 h-3 w-full" />
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="skeleton-block h-24 w-full" />
                <div className="skeleton-block h-24 w-full" />
                <div className="skeleton-block h-24 w-full" />
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="skeleton-block h-8 w-48" />
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="skeleton-block h-10 w-16 rounded-full" />
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <article key={index} className="card border border-white/10">
              <div className="skeleton-block h-8 w-40" />
              <div className="skeleton-block mt-4 h-12 w-2/3" />
              <div className="skeleton-block mt-5 h-28 w-full" />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="skeleton-block h-12 w-full rounded-full" />
                <div className="skeleton-block h-12 w-full rounded-full" />
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function ActiveClimbBar({
  climb,
  timerSeconds,
  extraActiveCount,
  loading,
  onAddFail,
  onComplete,
}: {
  climb: (typeof CLIMBS)[number];
  timerSeconds: number;
  extraActiveCount: number;
  loading: boolean;
  onAddFail: () => void;
  onComplete: () => void;
}) {
  return (
    <div className="sticky-active-bar">
      <div className="sticky-active-bar__content">
        <div>
          <div className="meta-label">Active climb</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="section-title text-3xl">{climb.label}</span>
            <span className="status-pill border-blue-500/20 bg-blue-500/10 text-blue-200">
              {formatTime(timerSeconds)}
            </span>
            {extraActiveCount > 0 ? (
              <span className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                +{extraActiveCount} more running
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-1 flex-wrap gap-3 md:flex-none">
          <button
            onClick={onAddFail}
            disabled={loading}
            className="btn-ghost min-w-[9rem] flex-1 justify-center md:flex-none"
          >
            + Fail
          </button>
          <button
            onClick={onComplete}
            disabled={loading}
            className="btn-primary min-w-[11rem] flex-1 justify-center md:flex-none"
          >
            Stop and complete
          </button>
        </div>
      </div>
    </div>
  );
}

function UndoToastCard({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: UndoToast;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-[rgba(18,21,27,0.96)] p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="meta-label">Fail added</div>
          <p className="mt-1 text-sm text-slate-200">{toast.label} recorded. Undo is still available.</p>
        </div>
        <button onClick={onUndo} className="btn-ghost min-w-[7rem] justify-center">
          Undo
        </button>
        <button onClick={onDismiss} className="nav-pill">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function SyncToastCard({
  toast,
  onDismiss,
}: {
  toast: SyncToast;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-green-500/20 bg-[rgba(16,31,24,0.96)] p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="meta-label text-green-200">Sync complete</div>
          <p className="mt-1 text-sm text-green-50">{toast.message}</p>
        </div>
        <button onClick={onDismiss} className="nav-pill">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ScorecardContent() {
  const searchParams = useSearchParams();
  const urlId = searchParams.get("id");

  const [climber, setClimber] = useState<ClimberWithAttempts | null>(null);
  const [knownClimbers, setKnownClimbers] = useState<ClimberWithAttempts[]>([]);
  const [recentLookups, setRecentLookups] = useState<RecentLookup[]>([]);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [settings, setSettings] = useState<CompetitionSettings>({ penalty_per_fail: 200, max_penalized_fails: 3 });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<QueueAction[]>([]);
  const [activeTimers, setActiveTimers] = useState<Record<number, string>>({});
  const [now, setNow] = useState(Date.now());
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [dangerTarget, setDangerTarget] = useState<DangerTarget>(null);
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const [syncToast, setSyncToast] = useState<SyncToast | null>(null);
  const syncRef = useRef(false);

  const canJudge = isStaffRole(profile?.role);
  const attempts = climber?.climb_attempts ?? [];
  const totalScore = calculateTotalScore(attempts, settings);
  const totalTime = calculateTotalTime(attempts);
  const completedCount = countCompletedRoutes(attempts);
  const totalFails = attempts.reduce((sum, attempt) => sum + attempt.failed_attempts, 0);
  const progressPercent = (completedCount / TOTAL_CLIMBS) * 100;
  const hardTopCount = attempts.filter(
    (attempt) => attempt.completed && getClimbDifficulty(attempt.climb_number) === "hard"
  ).length;

  const activeClimbEntries = useMemo(
    () =>
      Object.entries(activeTimers)
        .map(([climbNumber, startedAt]) => ({
          climbNumber: Number(climbNumber) as ClimbNumber,
          startedAt,
        }))
        .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()),
    [activeTimers]
  );

  const primaryActiveClimbNumber = activeClimbEntries[0]?.climbNumber;
  const primaryActiveClimb = primaryActiveClimbNumber ? CLIMBS[primaryActiveClimbNumber - 1] : null;
  const primaryActiveTimerSeconds =
    primaryActiveClimbNumber && activeTimers[primaryActiveClimbNumber]
      ? Math.max(1, Math.floor((now - new Date(activeTimers[primaryActiveClimbNumber]).getTime()) / 1000))
      : 0;

  const matchingClimbers = useMemo(() => {
    const query = lookupInput.trim().toLowerCase();
    if (!query) return [];
    return knownClimbers.filter((entry) => entry.climber_number.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query)).slice(0, 8);
  }, [knownClimbers, lookupInput]);

  const liveLeaderboard = useMemo(() => {
    if (!climber) return [];

    const boardSource = knownClimbers.some((entry) => entry.id === climber.id)
      ? knownClimbers.map((entry) => (entry.id === climber.id ? climber : entry))
      : [...knownClimbers, climber];

    return buildLeaderboard(boardSource, settings);
  }, [climber, knownClimbers, settings]);

  const liveRankEntry = useMemo(
    () => liveLeaderboard.find((entry) => entry.climber_id === climber?.id) ?? null,
    [climber?.id, liveLeaderboard]
  );

  const liveRankDelta = useMemo(
    () => (liveRankEntry ? getRankDeltaSummary(liveRankEntry, liveLeaderboard) : null),
    [liveLeaderboard, liveRankEntry]
  );

  const auroraStyle = useMemo(
    () =>
      ({
        "--aurora-primary":
          hardTopCount >= 4 ? "rgba(230, 57, 70, 0.24)" : "rgba(52, 152, 219, 0.22)",
        "--aurora-secondary":
          hardTopCount >= 7 ? "rgba(244, 208, 63, 0.22)" : "rgba(230, 57, 70, 0.14)",
      }) as CSSProperties,
    [hardTopCount]
  );

  const rememberLookup = (entry: ClimberWithAttempts) => {
    const next = [{ id: entry.id, name: entry.name, climber_number: entry.climber_number }, ...recentLookups.filter((item) => item.id !== entry.id)].slice(0, 5);
    setRecentLookups(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RECENT_LOOKUPS_KEY, JSON.stringify(next));
    }
  };

  const openClimber = (entry: ClimberWithAttempts) => {
    setClimber(entry);
    setLookupInput("");
    setLookupError("");
    setDangerTarget(null);
    rememberLookup(entry);
  };

  const refreshKnownClimbers = useCallback(async () => {
    const rows = await getAllClimbersWithAttempts();
    setKnownClimbers(rows);
    return rows;
  }, []);

  const refreshCurrentClimber = useCallback(async (id: string) => {
    const next = await getClimberById(id);
    if (next) setClimber(next);
  }, []);

  const loadAuthStateSafe = useCallback(async () => {
    if (!supabaseConfigured) {
      return { session: null, profile: null };
    }

    try {
      const authState = await getAuthState();
      setAuthError("");
      return authState;
    } catch (error) {
      console.warn("Scorecard auth bootstrap failed:", error);
      setAuthError(getAuthBootstrapMessage(error));
      return { session: null, profile: null };
    }
  }, []);

  const performAction = async (action: QueueAction) => {
    switch (action.kind) {
      case "start":
        await startClimbAttempt(action.climberId, action.climbNumber, action.startedAtIso);
        break;
      case "add-fail":
        await addFailedAttempt(action.climberId, action.climbNumber);
        break;
      case "undo-fail":
        await removeLastFail(action.climberId, action.climbNumber);
        break;
      case "complete":
        await completeClimb(action.climberId, action.climbNumber, action.completionTimeSeconds, action.startedAtIso);
        break;
      case "reset":
        await resetClimb(action.climberId, action.climbNumber);
        break;
    }
  };

  const queueAction = (action: QueueAction, message: string) => {
    const next = [...offlineQueue, action];
    setOfflineQueue(next);
    writeOfflineQueue(next);
    if (climber?.id === action.climberId) {
      setClimber((current) => (current ? applyOptimisticQueueAction(current, action) : current));
    }
    setNotice({ tone: "success", message: `${message} Saved locally and queued for sync.` });
    return true;
  };

  const runAction = async (action: QueueAction, message: string) => {
    if (!climber || !canJudge) {
      setNotice({ tone: "error", message: "Judge or admin login is required for score updates." });
      return false;
    }

    if (!online) {
      return queueAction(action, message);
    }

    setLoading(true);
    setNotice(null);
    try {
      await performAction(action);
      await refreshCurrentClimber(action.climberId);
      await refreshKnownClimbers();
      setNotice({ tone: "success", message });
      return true;
    } catch (error) {
      if (isNetworkLikeError(error)) {
        return queueAction(action, message);
      } else {
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Unable to update the scorecard.",
        });
      }
    } finally {
      setLoading(false);
    }

    return false;
  };

  const syncOfflineActions = useCallback(async () => {
    if (!online || !canJudge || syncRef.current) return;
    const queued = readOfflineQueue();
    if (!queued.length) return;

    syncRef.current = true;
    setSyncingQueue(true);
    let remaining = [...queued];
    let syncedCount = 0;
    let conflictCount = 0;

    try {
      for (const action of queued) {
        try {
          if (action.expectedState) {
            const serverAttempt = await getAttemptSnapshot(action.climberId, action.climbNumber);
            if (hasAttemptConflict(action.expectedState, serverAttempt)) {
              conflictCount += 1;
            }
          }

          await performAction(action);
          syncedCount += 1;
          remaining = remaining.filter((item) => item.id !== action.id);
          setOfflineQueue(remaining);
          writeOfflineQueue(remaining);
        } catch (error) {
          if (isNetworkLikeError(error)) break;
          remaining = remaining.filter((item) => item.id !== action.id);
          setOfflineQueue(remaining);
          writeOfflineQueue(remaining);
        }
      }

      if (climber) await refreshCurrentClimber(climber.id);
      await refreshKnownClimbers();

      if (syncedCount > 0) {
        setNotice({
          tone: conflictCount ? "warning" : "success",
          message: conflictCount
            ? `Synced ${syncedCount} queued update${syncedCount === 1 ? "" : "s"}. ${conflictCount} conflict${conflictCount === 1 ? "" : "s"} detected, and the latest local update was applied.`
            : `Synced ${syncedCount} queued update${syncedCount === 1 ? "" : "s"}.`,
        });

        if (remaining.length === 0) {
          setSyncToast({
            message: "All queued score updates are now safely synced.",
            expiresAt: Date.now() + 4500,
          });
        }
      }
    } finally {
      syncRef.current = false;
      setSyncingQueue(false);
    }
  }, [canJudge, climber, online, refreshCurrentClimber, refreshKnownClimbers]);

  const runLookup = async (value: string, showErrors = true) => {
    setLoading(true);
    setLookupError("");
    try {
      const query = value.trim();
      const exact = await getClimberByNumber(query);
      if (exact) {
        openClimber(exact);
        return;
      }
      const match = knownClimbers.find((entry) => entry.name.toLowerCase() === query.toLowerCase());
      if (match) {
        openClimber(match);
        return;
      }
      if (showErrors) setLookupError("No climber matched that number or exact name.");
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [authState, climbers, competitionSettings] = await Promise.all([
          loadAuthStateSafe(),
          getAllClimbersWithAttempts(),
          getCompetitionSettings(),
        ]);
        setProfile(authState.profile);
        setKnownClimbers(climbers);
        setSettings(competitionSettings);
        setOfflineQueue(readOfflineQueue());

        if (typeof window !== "undefined") {
          const stored = window.localStorage.getItem(RECENT_LOOKUPS_KEY);
          if (stored) {
            try {
              setRecentLookups(JSON.parse(stored) as RecentLookup[]);
            } catch {
              window.localStorage.removeItem(RECENT_LOOKUPS_KEY);
            }
          }
        }

        if (urlId) {
          const next = await getClimberById(urlId);
          if (next) setClimber(next);
        }
      } catch (error) {
        setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to load the scorecard page." });
      } finally {
        setAuthLoading(false);
        setPageLoading(false);
      }
    };

    load();
  }, [loadAuthStateSafe, urlId]);

  useEffect(() => {
    if (!climber) {
      setActiveTimers({});
      return;
    }
    const stored = readActiveTimers(climber.id);
    const next = { ...stored };
    climber.climb_attempts.forEach((attempt) => {
      if (attempt.completed) delete next[attempt.climb_number];
    });
    setActiveTimers(next);
  }, [climber]);

  useEffect(() => {
    if (climber) writeActiveTimers(climber.id, activeTimers);
  }, [activeTimers, climber]);

  useEffect(() => {
    if (!activeClimbEntries.length) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeClimbEntries.length]);

  useEffect(() => {
    if (!undoToast) return;
    const remainingMs = Math.max(0, undoToast.expiresAt - Date.now());
    const timer = window.setTimeout(() => setUndoToast(null), remainingMs);
    return () => window.clearTimeout(timer);
  }, [undoToast]);

  useEffect(() => {
    if (!syncToast) return;
    const remainingMs = Math.max(0, syncToast.expiresAt - Date.now());
    const timer = window.setTimeout(() => setSyncToast(null), remainingMs);
    return () => window.clearTimeout(timer);
  }, [syncToast]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      void (async () => {
        const authState = await loadAuthStateSafe();
        setProfile(authState.profile);
      })();
    });
    return () => data.subscription.unsubscribe();
  }, [loadAuthStateSafe]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const refreshSettings = async () => setSettings(await getCompetitionSettings(true));
    const channel = publicSupabase
      .channel("scorecard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "climbers" }, async () => {
        await refreshKnownClimbers();
        if (climber) await refreshCurrentClimber(climber.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "climb_attempts" }, async () => {
        if (climber) await refreshCurrentClimber(climber.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_settings" }, refreshSettings)
      .subscribe();
    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, [climber, refreshCurrentClimber, refreshKnownClimbers]);

  useEffect(() => {
    if (online && canJudge) {
      syncOfflineActions();
    }
  }, [online, canJudge, syncOfflineActions]);

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const authState = await signInWithRole(email, password);
      setProfile(authState.profile);
      setPassword("");
      setNotice({ tone: "success", message: "Judge session ready." });
      await syncOfflineActions();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setAuthLoading(false);
    }
  };

  const startTimer = async (climbNumber: ClimbNumber) => {
    if (!climber) return;
    const startedAtIso = new Date().toISOString();
    const expectedState = buildAttemptExpectedState(getAttempt(attempts, climbNumber));
    setActiveTimers((current) => ({ ...current, [climbNumber]: startedAtIso }));
    const applied = await runAction(
      {
        id: buildQueueActionId(),
        kind: "start",
        climberId: climber.id,
        climbNumber,
        startedAtIso,
        createdAtIso: new Date().toISOString(),
        expectedState,
      },
      `${CLIMBS[climbNumber - 1].label} started.`
    );

    if (!applied) {
      setActiveTimers((current) => {
        const next = { ...current };
        delete next[climbNumber];
        return next;
      });
    }
  };

  const completeTimedClimb = async (climbNumber: ClimbNumber, seconds: number) => {
    if (!climber) return;
    const startedAtIso = activeTimers[climbNumber];
    const expectedState = buildAttemptExpectedState(getAttempt(attempts, climbNumber));
    setActiveTimers((current) => {
      const next = { ...current };
      delete next[climbNumber];
      return next;
    });
    const applied = await runAction(
      {
        id: buildQueueActionId(),
        kind: "complete",
        climberId: climber.id,
        climbNumber,
        completionTimeSeconds: seconds,
        startedAtIso,
        createdAtIso: new Date().toISOString(),
        expectedState,
      },
      `${CLIMBS[climbNumber - 1].label} completed in ${formatTime(seconds)}.`
    );

    if (applied) {
      triggerHaptic([18, 24, 18]);
    } else if (startedAtIso) {
      setActiveTimers((current) => ({ ...current, [climbNumber]: startedAtIso }));
    }
  };

  const logFail = async (climbNumber: ClimbNumber) => {
    if (!climber) return;
    const expectedState = buildAttemptExpectedState(getAttempt(attempts, climbNumber));
    const applied = await runAction(
      {
        id: buildQueueActionId(),
        kind: "add-fail",
        climberId: climber.id,
        climbNumber,
        createdAtIso: new Date().toISOString(),
        expectedState,
      },
      `${CLIMBS[climbNumber - 1].label} fail logged.`
    );

    if (applied) {
      triggerHaptic(16);
      setUndoToast({
        climbNumber,
        label: CLIMBS[climbNumber - 1].label,
        expiresAt: Date.now() + FAIL_UNDO_WINDOW_MS,
      });
    }
  };

  const undoFail = async (climbNumber: ClimbNumber) => {
    if (!climber) return;
    const expectedState = buildAttemptExpectedState(getAttempt(attempts, climbNumber));
    const applied = await runAction(
      {
        id: buildQueueActionId(),
        kind: "undo-fail",
        climberId: climber.id,
        climbNumber,
        createdAtIso: new Date().toISOString(),
        expectedState,
      },
      `${CLIMBS[climbNumber - 1].label} fail removed.`
    );

    if (applied && undoToast?.climbNumber === climbNumber) {
      setUndoToast(null);
    }
  };

  const resetAttempt = async (climbNumber: ClimbNumber) => {
    if (!climber) return;
    const expectedState = buildAttemptExpectedState(getAttempt(attempts, climbNumber));
    await runAction(
      {
        id: buildQueueActionId(),
        kind: "reset",
        climberId: climber.id,
        climbNumber,
        createdAtIso: new Date().toISOString(),
        expectedState,
      },
      `${CLIMBS[climbNumber - 1].label} reset.`
    );
  };

  const handleDeleteCurrentClimber = async () => {
    if (!climber) return;
    setLoading(true);
    try {
      await deleteClimber(climber.id);
      setClimber(null);
      setDangerTarget(null);
      await refreshKnownClimbers();
      setNotice({ tone: "success", message: "Climber removed from competition data." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to delete the current climber." });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllData = async () => {
    setLoading(true);
    try {
      await deleteAllClimbers();
      setClimber(null);
      setKnownClimbers([]);
      setDangerTarget(null);
      setNotice({ tone: "success", message: "All competition data cleared." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to clear competition data." });
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) return <ScorecardLoading />;

  if (!climber) {
    return (
      <main className="page-shell">
        <div className="content-frame space-y-6">
          <SiteHeader
            status={
              <>
                <div className={`status-pill ${online ? "border-green-500/20 bg-green-500/10 text-green-200" : "border-yellow-500/20 bg-yellow-500/10 text-yellow-100"}`}>
                  {online ? "Online" : "Offline queue ready"}
                </div>
                {offlineQueue.length ? <div className="status-pill border-yellow-500/20 bg-yellow-500/10 text-yellow-100">{offlineQueue.length} pending sync</div> : null}
              </>
            }
          />

          <AccessCard
            profile={profile}
            authLoading={authLoading}
            email={email}
            password={password}
            setEmail={setEmail}
            setPassword={setPassword}
            onSubmit={handleAuthSubmit}
            onSignOut={async () => {
              await signOutUser();
              setProfile(null);
              setSyncToast(null);
            }}
            error={authError}
          />

          <section className="card">
            <div className="text-center">
              <div className="eyebrow">Athlete search</div>
              <h1 className="section-title mt-4 text-4xl sm:text-5xl">Find a competitor</h1>
              <p className="mt-4 text-sm text-slate-300">Search by climber number or athlete name. Public users can view scorecards. Judges can score them.</p>
            </div>

            {notice ? (
              <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${getNoticeClass(notice.tone)}`}>
                {notice.message}
              </div>
            ) : null}

            <form onSubmit={async (event) => { event.preventDefault(); await runLookup(lookupInput); }} className="mt-6 space-y-5">
              <div>
                <label className="meta-label mb-2 block">Climber number or name</label>
                <input type="text" value={lookupInput} onChange={(event) => { setLookupInput(event.target.value); setLookupError(""); }} className="input-field text-lg" placeholder="Enter a number or name" autoFocus />
              </div>
              {lookupError ? <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{lookupError}</div> : null}
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Looking up..." : "Find scorecard"}</button>
                <Link href="/register" className="btn-ghost w-full justify-center sm:w-auto">Register athlete</Link>
              </div>
            </form>

            {matchingClimbers.length ? <div className="mt-6 grid gap-3 sm:grid-cols-2">{matchingClimbers.map((entry) => <button key={entry.id} onClick={() => runLookup(entry.climber_number, false)} className="command-link text-left"><div><div className="text-sm font-semibold text-chalk">{entry.name}</div><div className="mt-1 text-xs text-slate-300">#{entry.climber_number} • {entry.category}</div></div><span className="text-sm font-semibold text-blue-300">Open</span></button>)}</div> : null}
            {recentLookups.length ? <div className="mt-6 grid gap-3 sm:grid-cols-2">{recentLookups.map((entry) => <button key={entry.id} onClick={() => runLookup(entry.climber_number, false)} className="command-link text-left"><div><div className="text-sm font-semibold text-chalk">{entry.name}</div><div className="mt-1 text-xs text-slate-300">#{entry.climber_number}</div></div><span className="text-sm font-semibold text-accent">Open</span></button>)}</div> : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className={`content-frame space-y-6 ${canJudge && primaryActiveClimb ? "pb-28" : ""}`}>
        <SiteHeader
          status={
            <>
              <Link href="/leaderboard" className="nav-pill">
                View leaderboard
              </Link>
              <div
                className={`status-pill ${
                  online
                    ? "border-green-500/20 bg-green-500/10 text-green-200"
                    : "border-yellow-500/20 bg-yellow-500/10 text-yellow-100"
                }`}
              >
                {online ? "Online" : "Offline mode"}
              </div>
              {syncingQueue ? (
                <div className="status-pill border-blue-500/20 bg-blue-500/10 text-blue-200">
                  Syncing queue
                </div>
              ) : null}
              {offlineQueue.length ? (
                <div className="status-pill border-yellow-500/20 bg-yellow-500/10 text-yellow-100">
                  {offlineQueue.length} pending sync
                </div>
              ) : null}
              <div
                className={`status-pill ${
                  canJudge
                    ? "border-green-500/20 bg-green-500/10 text-green-200"
                    : "border-white/10 bg-white/[0.03] text-slate-300"
                }`}
              >
                {canJudge ? `Judge role: ${profile?.role}` : "Read-only"}
              </div>
            </>
          }
        />

        <AccessCard
          profile={profile}
          authLoading={authLoading}
          email={email}
          password={password}
          setEmail={setEmail}
          setPassword={setPassword}
          onSubmit={handleAuthSubmit}
          onSignOut={async () => {
            await signOutUser();
            setProfile(null);
            setDangerTarget(null);
            setUndoToast(null);
            setSyncToast(null);
          }}
          error={authError}
        />

        <section className="card">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="eyebrow">Climber #{climber.climber_number}</div>
              <h1 className="section-title mt-4 text-5xl sm:text-6xl">{climber.name.toUpperCase()}</h1>
              <p className="mt-4 max-w-2xl text-sm text-slate-300">
                Judge-first scoring with live timers, queued offline writes, and quick one-handed controls for the gym floor.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-mono uppercase tracking-widest">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-300">
                  {climber.category}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-300">
                  fails {totalFails}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-300">
                  complete {completedCount}/{TOTAL_CLIMBS}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-300">
                  time {formatTime(totalTime)}
                </span>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
              <div className="score-aurora aurora-ring" style={auroraStyle} />
              <div className="relative">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="meta-label">Progress</div>
                    <div className="mt-2 section-title text-4xl">{progressPercent.toFixed(0)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="meta-label">Total score</div>
                    <AnimatedNumber
                      value={totalScore}
                      className="mt-2 block font-display text-4xl text-chalk"
                    />
                  </div>
                </div>
                <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-800">
                  <div className="progress-bar h-full rounded-full" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="card-muted p-3">
                    <div className="meta-label">Completed</div>
                    <div className="mt-2 font-display text-3xl text-chalk">{completedCount}</div>
                  </div>
                  <div className="card-muted p-3">
                    <div className="meta-label">Live rank</div>
                    <div className="mt-2 font-display text-3xl text-chalk">
                      {liveRankEntry ? `#${liveRankEntry.rank}` : "--"}
                    </div>
                  </div>
                  <div className="card-muted p-3">
                    <div className="meta-label">Move up</div>
                    <div className="mt-2 text-sm font-semibold text-chalk">
                      {liveRankDelta?.label ?? "Waiting for field"}
                    </div>
                    <div className="mt-2 text-xs text-slate-300">
                      {liveRankDelta?.detail ?? "Rank updates as live scores change."}
                    </div>
                  </div>
                  <div className="card-muted p-3">
                    <div className="meta-label">Hard tops</div>
                    <div className="mt-2 font-display text-3xl text-chalk">{hardTopCount}</div>
                    <div className="mt-2 text-xs text-slate-300">Aurora shifts warmer as hard routes fall.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {notice ? (
          <div className={`rounded-3xl border px-5 py-4 text-sm ${getNoticeClass(notice.tone)}`}>
            {notice.message}
          </div>
        ) : null}

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="meta-label">Climb navigator</div>
              <p className="mt-2 text-sm text-slate-300">
                Jump to any route. Colors show difficulty before a climb is finished.
              </p>
            </div>
            <div className="meta-label">{TOTAL_CLIMBS} climbs</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`status-pill ${DIFFICULTY_META.easy.chipClass}`}>Easy</span>
            <span className={`status-pill ${DIFFICULTY_META.medium.chipClass}`}>Medium</span>
            <span className={`status-pill ${DIFFICULTY_META.hard.chipClass}`}>Hard</span>
            <span className="status-pill border-green-500/20 bg-green-500/10 text-green-200">Complete</span>
            <span className="status-pill border-blue-500/20 bg-blue-500/10 text-blue-200">Active</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {CLIMBS.map((climb) => {
              const attempt = getAttempt(attempts, climb.number);
              const difficulty = getClimbDifficulty(climb.number);
              const navigatorTone = attempt?.completed
                ? "border-green-500/20 bg-green-500/10 text-green-200"
                : activeTimers[climb.number]
                  ? "border-blue-500/20 bg-blue-500/10 text-blue-200"
                  : DIFFICULTY_META[difficulty].navigatorClass;

              return (
                <a
                  key={climb.number}
                  href={`#climb-card-${climb.number}`}
                  className={`rounded-full border px-3 py-2 text-xs font-mono uppercase tracking-[0.22em] ${navigatorTone}`}
                >
                  {climb.number.toString().padStart(2, "0")}
                </a>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {CLIMBS.map((climb) => (
            <ClimbCard
              key={climb.number}
              climb={climb}
              attempt={getAttempt(attempts, climb.number)}
              canJudge={canJudge}
              loading={loading}
              now={now}
              settings={settings}
              timerStartedAt={activeTimers[climb.number]}
              pendingSync={offlineQueue.some(
                (item) => item.climberId === climber.id && item.climbNumber === climb.number
              )}
              isActive={primaryActiveClimbNumber === climb.number}
              onStart={() => startTimer(climb.number)}
              onAddFail={() => logFail(climb.number)}
              onUndoFail={() => undoFail(climb.number)}
              onComplete={(seconds) => completeTimedClimb(climb.number, seconds)}
              onReset={() => resetAttempt(climb.number)}
            />
          ))}
        </section>

        {canJudge ? (
          <section className="card border-accent/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Admin reset tools</div>
                <h2 className="section-title mt-4 text-3xl">Clear test entries</h2>
              </div>
              <div className="status-pill border-accent/20 bg-accent/10 text-red-100">Destructive</div>
            </div>
            <div className="mt-6 grid gap-3 xl:grid-cols-[1fr_1fr_auto]">
              <button
                onClick={() => setDangerTarget((current) => (current === "climber" ? null : "climber"))}
                className="btn-ghost w-full justify-center border-accent/20 text-red-100"
              >
                Delete this climber
              </button>
              <button
                onClick={() => setDangerTarget((current) => (current === "all" ? null : "all"))}
                className="btn-ghost w-full justify-center border-accent/20 text-red-100"
              >
                Reset all data
              </button>
              <button
                onClick={() => setDangerTarget(null)}
                className="btn-ghost w-full justify-center xl:w-auto"
              >
                Cancel
              </button>
            </div>
            {dangerTarget === "climber" ? (
              <div className="mt-5 rounded-3xl border border-accent/30 bg-accent/10 p-5">
                <p className="text-sm text-red-50/90">This removes {climber.name} and all linked attempts.</p>
                <button
                  onClick={handleDeleteCurrentClimber}
                  disabled={loading}
                  className="btn-primary mt-4 bg-red-700 hover:bg-red-600"
                >
                  Confirm delete climber
                </button>
              </div>
            ) : null}
            {dangerTarget === "all" ? (
              <div className="mt-5 rounded-3xl border border-accent/30 bg-accent/10 p-5">
                <p className="text-sm text-red-50/90">
                  This removes every climber and every recorded attempt.
                </p>
                <button
                  onClick={handleDeleteAllData}
                  disabled={loading}
                  className="btn-primary mt-4 bg-red-700 hover:bg-red-600"
                >
                  Confirm reset all data
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="meta-label">Need a different athlete?</div>
              <p className="mt-2 text-sm text-slate-300">
                Return to lookup mode without losing the judge session.
              </p>
            </div>
            <button
              onClick={() => {
                setClimber(null);
                setDangerTarget(null);
                setLookupError("");
                setNotice(null);
                setUndoToast(null);
                setSyncToast(null);
              }}
              className="btn-ghost w-full justify-center lg:w-auto"
            >
              Switch athlete
            </button>
          </div>
        </section>
      </div>

      {undoToast || syncToast ? (
        <div className="floating-toast-stack">
          {syncToast ? <SyncToastCard toast={syncToast} onDismiss={() => setSyncToast(null)} /> : null}
          {undoToast ? (
            <UndoToastCard
              toast={undoToast}
              onUndo={() => void undoFail(undoToast.climbNumber)}
              onDismiss={() => setUndoToast(null)}
            />
          ) : null}
        </div>
      ) : null}

      {canJudge && primaryActiveClimb ? (
        <ActiveClimbBar
          climb={primaryActiveClimb}
          timerSeconds={primaryActiveTimerSeconds}
          extraActiveCount={Math.max(0, activeClimbEntries.length - 1)}
          loading={loading}
          onAddFail={() => void logFail(primaryActiveClimb.number)}
          onComplete={() => void completeTimedClimb(primaryActiveClimb.number, primaryActiveTimerSeconds)}
        />
      ) : null}
    </main>
  );
}

export default function ScorecardPage() {
  return (
    <Suspense fallback={<ScorecardLoading />}>
      <ScorecardContent />
    </Suspense>
  );
}

