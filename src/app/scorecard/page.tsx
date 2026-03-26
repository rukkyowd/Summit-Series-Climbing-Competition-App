"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  getClimberById,
  getClimberByNumber,
  removeLastFail,
  resetClimb,
  startClimbAttempt,
} from "@/lib/db";
import {
  applyOptimisticQueueAction,
  buildQueueActionId,
  isNetworkLikeError,
  readActiveTimers,
  readOfflineQueue,
  writeActiveTimers,
  writeOfflineQueue,
  type QueueAction,
} from "@/lib/offline-scorecard";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import {
  CLIMBS,
  calculateClimbScore,
  calculateTotalScore,
  calculateTotalTime,
  countCompletedRoutes,
  formatTime,
  getCompetitionSettings,
  TOTAL_CLIMBS,
  type ClimbAttempt,
  type ClimbNumber,
  type ClimberWithAttempts,
  type CompetitionSettings,
} from "@/lib/scoring";

const RECENT_LOOKUPS_KEY = "scorecard-recent-lookups";

type Notice = { tone: "error" | "success"; message: string };
type DangerTarget = "climber" | "all" | null;
type RecentLookup = { id: string; name: string; climber_number: string };

function getAttempt(attempts: ClimbAttempt[], climbNumber: number) {
  return attempts.find((attempt) => attempt.climb_number === climbNumber);
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
  onStart: () => void;
  onAddFail: () => void;
  onUndoFail: () => void;
  onComplete: (seconds: number) => void;
  onReset: () => void;
}) {
  const fails = attempt?.failed_attempts ?? 0;
  const completed = attempt?.completed ?? false;
  const cappedFails = Math.min(fails, settings.max_penalized_fails);
  const score = calculateClimbScore(climb.number, fails, completed, settings);
  const timerSeconds = timerStartedAt ? Math.max(1, Math.floor((now - new Date(timerStartedAt).getTime()) / 1000)) : 0;

  return (
    <article id={`climb-card-${climb.number}`} className="card border border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">Climb {climb.number.toString().padStart(2, "0")}</div>
          <h3 className="section-title mt-4 text-3xl">{climb.label}</h3>
          <p className="mt-2 text-sm text-slate-300">{climb.basePoints.toLocaleString()} base points</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-right">
          <div className="meta-label">Score</div>
          <AnimatedNumber value={completed ? score : 0} className="mt-2 block font-display text-4xl text-chalk" />
          <div className="mt-2 text-sm text-slate-300">{attempt?.completion_time_seconds ? formatTime(attempt.completion_time_seconds) : "No finish yet"}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="meta-label">Live timer</div>
              <div className="mt-2 font-display text-4xl text-chalk">{timerStartedAt ? formatTime(timerSeconds) : "0:00"}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-mono uppercase tracking-widest">
              {timerStartedAt ? <span className="rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-green-200">running</span> : null}
              {pendingSync ? <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-yellow-100">pending sync</span> : null}
              {completed ? <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-blue-200">complete</span> : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-mono uppercase tracking-widest text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">fails {fails}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">penalized {cappedFails}/{settings.max_penalized_fails}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">penalty -{cappedFails * settings.penalty_per_fail}</span>
          </div>
        </div>
        {completed && canJudge ? <button onClick={onReset} disabled={loading} className="btn-ghost w-full justify-center lg:w-auto">Reset</button> : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button onClick={onStart} disabled={loading || !canJudge || Boolean(timerStartedAt) || completed} className="btn-primary w-full justify-center">{timerStartedAt ? "Attempt running" : "Start attempt"}</button>
        <button onClick={onAddFail} disabled={loading || !canJudge || completed} className="btn-ghost w-full justify-center">Add fail</button>
        <button onClick={onUndoFail} disabled={loading || !canJudge || completed || fails === 0} className="btn-ghost w-full justify-center">Undo fail</button>
        <button onClick={() => onComplete(timerSeconds)} disabled={loading || !canJudge || !timerStartedAt || completed} className="btn-ghost w-full justify-center">Stop and complete</button>
      </div>

      <p className="mt-4 text-sm text-slate-300">{canJudge ? "Completion time is written automatically from the live timer. Offline writes are queued and synced later." : "Sign in as a judge or admin to start timers and record results."}</p>
    </article>
  );
}

function ScorecardLoading() {
  return (
    <main className="page-shell">
      <div className="content-frame">
        <section className="card">
          <div className="skeleton-block h-12 w-48" />
          <div className="skeleton-block mt-4 h-24 w-full" />
        </section>
      </div>
    </main>
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
  const syncRef = useRef(false);

  const canJudge = isStaffRole(profile?.role);
  const attempts = climber?.climb_attempts ?? [];
  const totalScore = calculateTotalScore(attempts, settings);
  const totalTime = calculateTotalTime(attempts);
  const completedCount = countCompletedRoutes(attempts);
  const totalFails = attempts.reduce((sum, attempt) => sum + attempt.failed_attempts, 0);
  const progressPercent = (completedCount / TOTAL_CLIMBS) * 100;

  const matchingClimbers = useMemo(() => {
    const query = lookupInput.trim().toLowerCase();
    if (!query) return [];
    return knownClimbers.filter((entry) => entry.climber_number.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query)).slice(0, 8);
  }, [knownClimbers, lookupInput]);

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
  };

  const runAction = async (action: QueueAction, message: string) => {
    if (!climber || !canJudge) {
      setNotice({ tone: "error", message: "Judge or admin login is required for score updates." });
      return;
    }

    if (!online) {
      queueAction(action, message);
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      await performAction(action);
      await refreshCurrentClimber(action.climberId);
      await refreshKnownClimbers();
      setNotice({ tone: "success", message });
    } catch (error) {
      if (isNetworkLikeError(error)) {
        queueAction(action, message);
      } else {
        setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to update the scorecard." });
      }
    } finally {
      setLoading(false);
    }
  };

  const syncOfflineActions = useCallback(async () => {
    if (!online || !canJudge || syncRef.current) return;
    const queued = readOfflineQueue();
    if (!queued.length) return;

    syncRef.current = true;
    setSyncingQueue(true);
    let remaining = [...queued];

    try {
      for (const action of queued) {
        try {
          await performAction(action);
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

      if (queued.length !== remaining.length) {
        setNotice({ tone: "success", message: `Synced ${queued.length - remaining.length} queued update${queued.length - remaining.length === 1 ? "" : "s"}.` });
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
          supabaseConfigured ? getAuthState() : Promise.resolve({ session: null, profile: null }),
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
  }, [urlId]);

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
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
    const { data } = supabase.auth.onAuthStateChange(async () => {
      const authState = await getAuthState();
      setProfile(authState.profile);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const refreshSettings = async () => setSettings(await getCompetitionSettings(true));
    const channel = supabase
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
      supabase.removeChannel(channel);
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
    setActiveTimers((current) => ({ ...current, [climbNumber]: startedAtIso }));
    await runAction({ id: buildQueueActionId(), kind: "start", climberId: climber.id, climbNumber, startedAtIso, createdAtIso: new Date().toISOString() }, `${CLIMBS[climbNumber - 1].label} started.`);
  };

  const completeTimedClimb = async (climbNumber: ClimbNumber, seconds: number) => {
    if (!climber) return;
    const startedAtIso = activeTimers[climbNumber];
    setActiveTimers((current) => {
      const next = { ...current };
      delete next[climbNumber];
      return next;
    });
    await runAction({ id: buildQueueActionId(), kind: "complete", climberId: climber.id, climbNumber, completionTimeSeconds: seconds, startedAtIso, createdAtIso: new Date().toISOString() }, `${CLIMBS[climbNumber - 1].label} completed in ${formatTime(seconds)}.`);
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
            }}
            error={authError}
          />

          <section className="card">
            <div className="text-center">
              <div className="eyebrow">Athlete search</div>
              <h1 className="section-title mt-4 text-4xl sm:text-5xl">Find a competitor</h1>
              <p className="mt-4 text-sm text-slate-300">Search by climber number or athlete name. Public users can view scorecards. Judges can score them.</p>
            </div>

            {notice ? <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${notice.tone === "error" ? "border-accent/30 bg-accent/10 text-accent" : "border-green-500/20 bg-green-500/10 text-green-200"}`}>{notice.message}</div> : null}

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
      <div className="content-frame space-y-6">
        <SiteHeader
          status={
            <>
              <Link href="/leaderboard" className="nav-pill">View leaderboard</Link>
              <div className={`status-pill ${online ? "border-green-500/20 bg-green-500/10 text-green-200" : "border-yellow-500/20 bg-yellow-500/10 text-yellow-100"}`}>{online ? "Online" : "Offline mode"}</div>
              {syncingQueue ? <div className="status-pill border-blue-500/20 bg-blue-500/10 text-blue-200">Syncing queue</div> : null}
              {offlineQueue.length ? <div className="status-pill border-yellow-500/20 bg-yellow-500/10 text-yellow-100">{offlineQueue.length} pending sync</div> : null}
              <div className={`status-pill ${canJudge ? "border-green-500/20 bg-green-500/10 text-green-200" : "border-white/10 bg-white/[0.03] text-slate-300"}`}>{canJudge ? `Judge role: ${profile?.role}` : "Read-only"}</div>
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
          }}
          error={authError}
        />

        <section className="card">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="eyebrow">Climber #{climber.climber_number}</div>
              <h1 className="section-title mt-4 text-5xl sm:text-6xl">{climber.name.toUpperCase()}</h1>
              <p className="mt-4 text-sm text-slate-300">Category-aware scoring with Supabase-authenticated writes, live attempt timers, and offline fail logging.</p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-mono uppercase tracking-widest">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-300">{climber.category}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-300">fails {totalFails}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-300">complete {completedCount}/{TOTAL_CLIMBS}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-300">time {formatTime(totalTime)}</span>
              </div>
            </div>

            <div className="rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="meta-label">Progress</div>
                  <div className="mt-2 section-title text-4xl">{progressPercent.toFixed(0)}%</div>
                </div>
                <div className="text-right">
                  <div className="meta-label">Total score</div>
                  <AnimatedNumber value={totalScore} className="mt-2 block font-display text-4xl text-chalk" />
                </div>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-800"><div className="progress-bar h-full rounded-full" style={{ width: `${progressPercent}%` }} /></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="card-muted p-3"><div className="meta-label">Completed</div><div className="mt-2 font-display text-3xl text-chalk">{completedCount}</div></div>
                <div className="card-muted p-3"><div className="meta-label">Penalty</div><div className="mt-2 font-display text-3xl text-chalk">{settings.penalty_per_fail}</div></div>
                <div className="card-muted p-3"><div className="meta-label">Cap</div><div className="mt-2 font-display text-3xl text-chalk">{settings.max_penalized_fails}</div></div>
              </div>
            </div>
          </div>
        </section>

        {notice ? <div className={`rounded-3xl border px-5 py-4 text-sm ${notice.tone === "error" ? "border-accent/30 bg-accent/10 text-accent" : "border-green-500/20 bg-green-500/10 text-green-200"}`}>{notice.message}</div> : null}

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="meta-label">Climb navigator</div><p className="mt-2 text-sm text-slate-300">Jump to any route.</p></div>
            <div className="meta-label">{TOTAL_CLIMBS} climbs</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">{CLIMBS.map((climb) => { const attempt = getAttempt(attempts, climb.number); return <a key={climb.number} href={`#climb-card-${climb.number}`} className={`rounded-full border px-3 py-2 text-xs font-mono uppercase tracking-[0.22em] ${attempt?.completed ? "border-green-500/20 bg-green-500/10 text-green-200" : "border-white/10 bg-white/[0.03] text-slate-300"}`}>{climb.number.toString().padStart(2, "0")}</a>; })}</div>
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
              pendingSync={offlineQueue.some((item) => item.climberId === climber.id && item.climbNumber === climb.number)}
              onStart={() => startTimer(climb.number)}
              onAddFail={() => runAction({ id: buildQueueActionId(), kind: "add-fail", climberId: climber.id, climbNumber: climb.number, createdAtIso: new Date().toISOString() }, `${climb.label} fail logged.`)}
              onUndoFail={() => runAction({ id: buildQueueActionId(), kind: "undo-fail", climberId: climber.id, climbNumber: climb.number, createdAtIso: new Date().toISOString() }, `${climb.label} fail removed.`)}
              onComplete={(seconds) => completeTimedClimb(climb.number, seconds)}
              onReset={() => runAction({ id: buildQueueActionId(), kind: "reset", climberId: climber.id, climbNumber: climb.number, createdAtIso: new Date().toISOString() }, `${climb.label} reset.`)}
            />
          ))}
        </section>

        {canJudge ? (
          <section className="card border-accent/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="eyebrow">Admin reset tools</div><h2 className="section-title mt-4 text-3xl">Clear test entries</h2></div>
              <div className="status-pill border-accent/20 bg-accent/10 text-red-100">Destructive</div>
            </div>
            <div className="mt-6 grid gap-3 xl:grid-cols-[1fr_1fr_auto]">
              <button onClick={() => setDangerTarget((current) => (current === "climber" ? null : "climber"))} className="btn-ghost w-full justify-center border-accent/20 text-red-100">Delete this climber</button>
              <button onClick={() => setDangerTarget((current) => (current === "all" ? null : "all"))} className="btn-ghost w-full justify-center border-accent/20 text-red-100">Reset all data</button>
              <button onClick={() => setDangerTarget(null)} className="btn-ghost w-full justify-center xl:w-auto">Cancel</button>
            </div>
            {dangerTarget === "climber" ? <div className="mt-5 rounded-3xl border border-accent/30 bg-accent/10 p-5"><p className="text-sm text-red-50/90">This removes {climber.name} and all linked attempts.</p><button onClick={handleDeleteCurrentClimber} disabled={loading} className="btn-primary mt-4 bg-red-700 hover:bg-red-600">Confirm delete climber</button></div> : null}
            {dangerTarget === "all" ? <div className="mt-5 rounded-3xl border border-accent/30 bg-accent/10 p-5"><p className="text-sm text-red-50/90">This removes every climber and every recorded attempt.</p><button onClick={handleDeleteAllData} disabled={loading} className="btn-primary mt-4 bg-red-700 hover:bg-red-600">Confirm reset all data</button></div> : null}
          </section>
        ) : null}

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="meta-label">Need a different athlete?</div><p className="mt-2 text-sm text-slate-300">Return to lookup mode without losing the judge session.</p></div>
            <button onClick={() => { setClimber(null); setDangerTarget(null); setLookupError(""); setNotice(null); }} className="btn-ghost w-full justify-center lg:w-auto">Switch athlete</button>
          </div>
        </section>
      </div>
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

