"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CLIMBS,
  MAX_PENALIZED_FAILS,
  PENALTY_PER_FAIL,
  calculateClimbScore,
  calculateTotalScore,
  calculateTotalTime,
  formatTime,
  parseTimeInput,
  type ClimbAttempt,
  type ClimbNumber,
  type ClimberWithAttempts,
} from "@/lib/scoring";
import {
  addFailedAttempt,
  completeClimb,
  deleteAllClimbers,
  deleteClimber,
  getClimberById,
  getClimberByNumber,
  removeLastFail,
  resetClimb,
} from "@/lib/db";
import { supabase, supabaseConfigured } from "@/lib/supabase";

const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "1234";

type Notice = {
  tone: "error" | "success";
  message: string;
};

type DangerTarget = "climber" | "all" | null;

function getAttempt(attempts: ClimbAttempt[], climbNumber: ClimbNumber) {
  return attempts.find((attempt) => attempt.climb_number === climbNumber);
}

function getClimbTheme(climbNumber: ClimbNumber) {
  switch (climbNumber) {
    case 1:
      return {
        badge: "text-green-300 border-green-500/20 bg-green-500/10",
        border: "border-green-500/25",
        text: "text-green-300",
        surface: "bg-green-500/10",
        button: "border-green-500/20 bg-green-500/10 text-green-200 hover:bg-green-500/20",
      };
    case 2:
      return {
        badge: "text-blue-300 border-blue-500/20 bg-blue-500/10",
        border: "border-blue-500/25",
        text: "text-blue-300",
        surface: "bg-blue-500/10",
        button: "border-blue-500/20 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20",
      };
    default:
      return {
        badge: "text-red-200 border-accent/20 bg-accent/10",
        border: "border-accent/25",
        text: "text-red-200",
        surface: "bg-accent/10",
        button: "border-accent/20 bg-accent/10 text-red-100 hover:bg-accent/20",
      };
  }
}

function ClimbCard({
  climb,
  attempt,
  isAdmin,
  loading,
  onAddFail,
  onUndoFail,
  onComplete,
  onReset,
}: {
  climb: (typeof CLIMBS)[number];
  attempt?: ClimbAttempt;
  isAdmin: boolean;
  loading: boolean;
  onAddFail: () => void;
  onUndoFail: () => void;
  onComplete: (seconds: number) => void;
  onReset: () => void;
}) {
  const [timeInput, setTimeInput] = useState("");
  const [timeError, setTimeError] = useState("");
  const [flash, setFlash] = useState(false);

  const theme = getClimbTheme(climb.number);
  const fails = attempt?.failed_attempts ?? 0;
  const completed = attempt?.completed ?? false;
  const penalizedFails = Math.min(fails, MAX_PENALIZED_FAILS);
  const extraFails = Math.max(0, fails - penalizedFails);
  const score = calculateClimbScore(climb.number, fails, completed);
  const penaltyApplied = penalizedFails * PENALTY_PER_FAIL;

  const handleComplete = () => {
    setTimeError("");
    const seconds = parseTimeInput(timeInput);

    if (seconds === null || seconds <= 0) {
      setTimeError("Enter MM:SS or a total seconds value like 83.");
      return;
    }

    setFlash(true);
    setTimeout(() => setFlash(false), 700);
    onComplete(seconds);
    setTimeInput("");
  };

  const handleAddFail = () => {
    const element = document.getElementById(`fail-btn-${climb.number}`);
    element?.classList.add("shake");
    setTimeout(() => element?.classList.remove("shake"), 300);
    onAddFail();
  };

  return (
    <div className={`card border ${theme.border} transition-all duration-300 ${flash ? "flash-complete" : ""}`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-3">
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-mono uppercase tracking-widest ${theme.badge}`}>
            Route {climb.number}
          </span>
          <div>
            <h2 className="section-title text-3xl">{climb.label}</h2>
            <p className="mt-2 text-sm text-slate-400">{climb.basePoints.toLocaleString()} base points</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-right">
          <div className="text-xs font-mono uppercase tracking-widest text-slate-500">Score</div>
          <div className={`section-title mt-2 text-4xl ${completed ? theme.text : "text-slate-500"}`}>
            {completed ? score.toLocaleString() : "--"}
          </div>
          <div className="mt-2 text-xs font-mono uppercase tracking-widest text-slate-500">
            {attempt?.completion_time_seconds ? formatTime(attempt.completion_time_seconds) : "No finish yet"}
          </div>
        </div>
      </div>

      {completed ? (
        <div className="space-y-4">
          <div className={`rounded-3xl border border-white/10 px-4 py-4 ${theme.surface}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-slate-500">Status</div>
                <div className={`mt-2 text-lg font-semibold ${theme.text}`}>Completed and scored</div>
              </div>
              <div className="text-right text-sm text-slate-300">
                <div>{attempt?.completion_time_seconds ? formatTime(attempt.completion_time_seconds) : "--"}</div>
                <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                  time logged
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs font-mono uppercase tracking-widest">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-slate-300">
                fails {fails}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-slate-300">
                penalty -{penaltyApplied}
              </span>
              {extraFails > 0 && (
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-slate-300">
                  extra fails +{extraFails}
                </span>
              )}
            </div>
          </div>

          {isAdmin ? (
            <button onClick={onReset} disabled={loading} className="btn-ghost w-full justify-center">
              Reset route
            </button>
          ) : (
            <p className="text-sm text-slate-400">
              Judges can reset this route if a score needs correction.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono uppercase tracking-widest text-slate-500">
                Failed attempts
              </span>
              <span className="text-xs font-mono uppercase tracking-widest text-slate-500">
                {penalizedFails}/{MAX_PENALIZED_FAILS} penalized
                {extraFails > 0 ? ` +${extraFails} extra` : ""}
              </span>
            </div>

            <div className="mt-4 flex gap-2">
              {[...Array(Math.max(fails, MAX_PENALIZED_FAILS))].map((_, index) => (
                <div
                  key={`${climb.number}-${index}`}
                  className={`h-2 flex-1 rounded-full transition-all duration-200 ${
                    index < fails
                      ? index < MAX_PENALIZED_FAILS
                        ? "bg-accent"
                        : "bg-slate-500"
                      : "bg-slate-800"
                  }`}
                />
              ))}
            </div>

            {!isAdmin && (
              <p className="mt-3 text-sm text-slate-400">
                Waiting on a judge to log fails or finish time for this route.
              </p>
            )}
          </div>

          {isAdmin ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <button
                  id={`fail-btn-${climb.number}`}
                  onClick={handleAddFail}
                  disabled={loading}
                  className="btn-ghost w-full justify-center"
                >
                  Add fail
                </button>
                <button
                  onClick={onUndoFail}
                  disabled={loading || fails === 0}
                  className="btn-ghost w-full justify-center px-4"
                >
                  Undo
                </button>
                <div className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-mono uppercase tracking-widest text-slate-500">
                  fail count {fails}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 text-xs font-mono uppercase tracking-widest text-slate-500">
                  Mark completion
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    value={timeInput}
                    onChange={(e) => {
                      setTimeInput(e.target.value);
                      setTimeError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleComplete()}
                    placeholder="MM:SS or seconds"
                    className="input-field font-mono"
                  />
                  <button
                    onClick={handleComplete}
                    disabled={loading || !timeInput.trim()}
                    className={`inline-flex items-center justify-center rounded-full border px-5 py-3 text-sm font-semibold uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-40 ${theme.button}`}
                  >
                    Complete route
                  </button>
                </div>
                {timeError && <p className="mt-3 text-sm text-accent">{timeError}</p>}
                <p className="mt-3 text-xs font-mono uppercase tracking-widest text-slate-500">
                  Example: 1:23 for one minute and twenty-three seconds.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              Judge tools are hidden until the event PIN is entered.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScorecardLoading() {
  return (
    <main className="page-shell">
      <div className="content-frame flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-white/10 border-t-accent animate-spin" />
          <p className="mt-4 text-xs font-mono uppercase tracking-widest text-slate-500">
            Loading scorecard
          </p>
        </div>
      </div>
    </main>
  );
}

function ScorecardContent() {
  const searchParams = useSearchParams();
  const urlId = searchParams.get("id");

  const [climber, setClimber] = useState<ClimberWithAttempts | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [dangerTarget, setDangerTarget] = useState<DangerTarget>(null);

  useEffect(() => {
    if (!urlId) {
      setPageLoading(false);
      return;
    }

    getClimberById(urlId)
      .then((result) => {
        setClimber(result);
      })
      .catch((err: unknown) => {
        setNotice({
          tone: "error",
          message: err instanceof Error ? err.message : "Unable to load this scorecard.",
        });
      })
      .finally(() => {
        setPageLoading(false);
      });
  }, [urlId]);

  useEffect(() => {
    if (!climber || !supabaseConfigured) return;

    const channel = supabase
      .channel(`scorecard-${climber.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "climb_attempts",
          filter: `climber_id=eq.${climber.id}`,
        },
        () => {
          getClimberById(climber.id)
            .then((updated) => {
              if (updated) setClimber(updated);
            })
            .catch((err: unknown) => {
              setNotice({
                tone: "error",
                message: err instanceof Error ? err.message : "Unable to refresh this scorecard.",
              });
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [climber?.id]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError("");
    setNotice(null);
    setLoading(true);

    try {
      const result = await getClimberByNumber(lookupInput.trim());
      if (!result) throw new Error("No climber found with that number.");
      setClimber(result);
      setLookupInput("");
    } catch (err: any) {
      setLookupError(err.message || "Lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (pinInput === ADMIN_PIN) {
      setIsAdmin(true);
      setShowPinEntry(false);
      setPinInput("");
      setPinError("");
      setDangerTarget(null);
      setNotice({ tone: "success", message: "Judge mode unlocked." });
      return;
    }

    setPinError("Incorrect PIN");
    setPinInput("");
  };

  const handleAction = useCallback(
    async (action: () => Promise<unknown>, successMessage: string) => {
      if (!climber) return;

      setLoading(true);
      setNotice(null);

      try {
        await action();
        const updated = await getClimberById(climber.id);
        if (updated) setClimber(updated);
        setDangerTarget(null);
        setNotice({ tone: "success", message: successMessage });
      } catch (err: any) {
        setNotice({ tone: "error", message: err.message || "Update failed." });
      } finally {
        setLoading(false);
      }
    },
    [climber]
  );

  const attempts = climber?.climb_attempts ?? [];
  const totalScore = calculateTotalScore(attempts);
  const totalTime = calculateTotalTime(attempts);
  const completedCount = attempts.filter((attempt) => attempt.completed).length;
  const totalFails = attempts.reduce((sum, attempt) => sum + attempt.failed_attempts, 0);
  const progressPercent = (completedCount / CLIMBS.length) * 100;

  const handleDeleteCurrentClimber = async () => {
    if (!climber) return;

    const climberId = climber.id;
    setLoading(true);
    setNotice(null);

    try {
      await deleteClimber(climberId);
      setClimber(null);
      setDangerTarget(null);
      setNotice({ tone: "success", message: "Climber removed from the competition data." });
    } catch (err: any) {
      setNotice({
        tone: "error",
        message: err.message || "Unable to delete the current climber.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllData = async () => {
    setLoading(true);
    setNotice(null);

    try {
      await deleteAllClimbers();
      setClimber(null);
      setDangerTarget(null);
      setLookupInput("");
      setLookupError("");
      setNotice({ tone: "success", message: "All competition data has been cleared." });
    } catch (err: any) {
      setNotice({
        tone: "error",
        message: err.message || "Unable to clear the competition data.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return <ScorecardLoading />;
  }

  if (!climber) {
    return (
      <main className="page-shell">
        <div className="content-frame">
          <div className="mb-6 flex items-center justify-between gap-4">
            <Link href="/" className="btn-ghost px-4 py-2 text-xs">
              Back home
            </Link>
            <span className="eyebrow">Scorecard lookup</span>
          </div>

          <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="card flex flex-col justify-between gap-6">
              <div>
                <p className="text-sm font-mono uppercase tracking-[0.35em] text-slate-500">
                  Athlete search
                </p>
                <h1 className="section-title mt-4 text-5xl sm:text-6xl">Find a competitor and jump into route tracking.</h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                  Search by climber number to reopen an athlete scorecard. Judges can unlock route
                  actions after loading the athlete view.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="stat-card">
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    Score
                  </div>
                  <div className="mt-2 font-display text-3xl text-chalk">Live</div>
                  <p className="mt-2 text-sm text-slate-400">Totals update as attempts are logged.</p>
                </div>
                <div className="stat-card">
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    Judge mode
                  </div>
                  <div className="mt-2 font-display text-3xl text-chalk">PIN</div>
                  <p className="mt-2 text-sm text-slate-400">Secure route controls for staff only.</p>
                </div>
                <div className="stat-card">
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    Tie-break
                  </div>
                  <div className="mt-2 font-display text-3xl text-chalk">Time</div>
                  <p className="mt-2 text-sm text-slate-400">Each completed route contributes to the total.</p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="mb-6">
                <span className="eyebrow">Open athlete card</span>
                <h2 className="section-title mt-4 text-4xl">Look up by climber number</h2>
              </div>

              {notice && (
                <div
                  className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
                    notice.tone === "error"
                      ? "border-accent/30 bg-accent/10 text-accent"
                      : "border-green-500/20 bg-green-500/10 text-green-200"
                  }`}
                >
                  {notice.message}
                </div>
              )}

              <form onSubmit={handleLookup} className="space-y-5">
                <div>
                  <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-slate-400">
                    Climber number
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={lookupInput}
                    onChange={(e) => setLookupInput(e.target.value)}
                    placeholder="Enter the athlete number"
                    className="input-field font-mono text-lg"
                    autoFocus
                  />
                </div>

                {lookupError && (
                  <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
                    {lookupError}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <button type="submit" disabled={loading} className="btn-primary w-full">
                    {loading ? "Looking up..." : "Find scorecard"}
                  </button>
                  <Link href="/register" className="btn-ghost w-full justify-center sm:w-auto">
                    Register athlete
                  </Link>
                </div>
              </form>

              <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                If the athlete is not registered yet, create the record first and this screen will
                become their route dashboard.
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="content-frame space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="btn-ghost px-4 py-2 text-xs">
            Back home
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/leaderboard" className="btn-ghost px-4 py-2 text-xs">
              View leaderboard
            </Link>
            {isAdmin ? (
              <button
                onClick={() => {
                  setIsAdmin(false);
                  setDangerTarget(null);
                  setNotice({ tone: "success", message: "Judge mode disabled." });
                }}
                className="inline-flex items-center justify-center rounded-full border border-green-500/20 bg-green-500/10 px-4 py-2 text-xs font-mono uppercase tracking-widest text-green-200"
              >
                Judge mode on
              </button>
            ) : (
              <button onClick={() => setShowPinEntry((current) => !current)} className="btn-ghost px-4 py-2 text-xs">
                Judge login
              </button>
            )}
          </div>
        </div>

        <section className="card">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <span className="eyebrow">Climber #{climber.climber_number}</span>
              <h1 className="section-title mt-4 text-5xl sm:text-6xl">{climber.name.toUpperCase()}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Route scoring is organized per climb, with fails, completion times, and total ranking
                impact visible from one screen.
              </p>

              <div className="mt-6 flex flex-wrap gap-2 text-xs font-mono uppercase tracking-widest">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-400">
                  total fails {totalFails}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-400">
                  routes complete {completedCount}/{CLIMBS.length}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-400">
                  total time {formatTime(totalTime)}
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    Progress
                  </div>
                  <div className="mt-2 section-title text-4xl">{progressPercent.toFixed(0)}%</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    Total score
                  </div>
                  <div className="mt-2 section-title text-4xl">{totalScore.toLocaleString()}</div>
                </div>
              </div>

              <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-800">
                <div className="progress-bar h-full rounded-full" style={{ width: `${progressPercent}%` }} />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="card-muted p-3">
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    Completed
                  </div>
                  <div className="mt-2 font-display text-3xl text-chalk">{completedCount}</div>
                </div>
                <div className="card-muted p-3">
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    Total time
                  </div>
                  <div className="mt-2 font-display text-3xl text-chalk">{formatTime(totalTime)}</div>
                </div>
                <div className="card-muted p-3">
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    Penalty cap
                  </div>
                  <div className="mt-2 font-display text-3xl text-chalk">3</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {notice && (
          <div
            className={`rounded-3xl border px-5 py-4 text-sm ${
              notice.tone === "error"
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-green-500/20 bg-green-500/10 text-green-200"
            }`}
          >
            {notice.message}
          </div>
        )}

        {showPinEntry && (
          <form onSubmit={handlePinSubmit} className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="eyebrow">Judge access</span>
                <h2 className="section-title mt-4 text-3xl">Unlock route controls</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-mono uppercase tracking-widest text-slate-500">
                Staff only
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                type="password"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError("");
                }}
                placeholder="Enter judge PIN"
                className="input-field font-mono"
                autoFocus
              />
              <button type="submit" className="btn-primary px-5">
                Unlock
              </button>
            </div>
            {pinError && <p className="mt-3 text-sm text-accent">{pinError}</p>}
          </form>
        )}

        <section className="grid gap-4 xl:grid-cols-3">
          {CLIMBS.map((climb) => (
            <ClimbCard
              key={climb.number}
              climb={climb}
              attempt={getAttempt(attempts, climb.number)}
              isAdmin={isAdmin}
              loading={loading}
              onAddFail={() =>
                handleAction(() => addFailedAttempt(climber.id, climb.number), `${climb.label} fail logged.`)
              }
              onUndoFail={() =>
                handleAction(() => removeLastFail(climber.id, climb.number), `${climb.label} fail removed.`)
              }
              onComplete={(seconds) =>
                handleAction(() => completeClimb(climber.id, climb.number, seconds), `${climb.label} completed.`)
              }
              onReset={() =>
                handleAction(() => resetClimb(climber.id, climb.number), `${climb.label} has been reset.`)
              }
            />
          ))}
        </section>

        {isAdmin && (
          <section className="card border-accent/20">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <span className="eyebrow">Admin reset tools</span>
                <h2 className="section-title mt-4 text-3xl">Clear test entries from the app</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                  Use these controls to remove the current climber or wipe all climbers and their
                  attempts. This is meant for test cleanup, not production-safe moderation.
                </p>
              </div>
              <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-xs font-mono uppercase tracking-widest text-red-100">
                Destructive actions
              </div>
            </div>

            <div className="mt-6 grid gap-3 xl:grid-cols-[1fr_1fr_auto]">
              <button
                onClick={() =>
                  setDangerTarget((current) => (current === "climber" ? null : "climber"))
                }
                disabled={loading}
                className="btn-ghost w-full justify-center border-accent/20 text-red-100 hover:bg-accent/10"
              >
                Delete this climber
              </button>
              <button
                onClick={() => setDangerTarget((current) => (current === "all" ? null : "all"))}
                disabled={loading}
                className="btn-ghost w-full justify-center border-accent/20 text-red-100 hover:bg-accent/10"
              >
                Reset all data
              </button>
              <button
                onClick={() => setDangerTarget(null)}
                disabled={loading || !dangerTarget}
                className="btn-ghost w-full justify-center xl:w-auto"
              >
                Cancel
              </button>
            </div>

            {dangerTarget === "climber" && (
              <div className="mt-5 rounded-3xl border border-accent/30 bg-accent/10 p-5">
                <div className="text-xs font-mono uppercase tracking-widest text-red-100">
                  Confirm current climber deletion
                </div>
                <p className="mt-3 text-sm leading-7 text-red-50/90">
                  This removes {climber.name} and all linked route attempts.
                </p>
                <button
                  onClick={handleDeleteCurrentClimber}
                  disabled={loading}
                  className="btn-primary mt-4 bg-red-700 hover:bg-red-600"
                >
                  Confirm delete climber
                </button>
              </div>
            )}

            {dangerTarget === "all" && (
              <div className="mt-5 rounded-3xl border border-accent/30 bg-accent/10 p-5">
                <div className="text-xs font-mono uppercase tracking-widest text-red-100">
                  Confirm full reset
                </div>
                <p className="mt-3 text-sm leading-7 text-red-50/90">
                  This removes every climber and every recorded attempt from the database.
                </p>
                <button
                  onClick={handleDeleteAllData}
                  disabled={loading}
                  className="btn-primary mt-4 bg-red-700 hover:bg-red-600"
                >
                  Confirm reset all data
                </button>
              </div>
            )}
          </section>
        )}

        <section className="card">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                Need a different athlete?
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Switch back to lookup mode to open another competitor scorecard without leaving the
                event control flow.
              </p>
            </div>
            <button
              onClick={() => {
                setClimber(null);
                setLookupError("");
                setNotice(null);
                setShowPinEntry(false);
                setDangerTarget(null);
              }}
              className="btn-ghost w-full justify-center lg:w-auto"
            >
              Switch athlete
            </button>
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
