"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { clearDemoSalesSession } from "@/lib/demo-sales-session";
import type { DemoStoryState } from "@/lib/demo-story";

type ActStatus = "locked" | "ready" | "complete";
type DemoPrepareAct = "act2" | "act3" | "act4";

type StoryAct = {
  id: "create" | "judge" | "organizer" | "public";
  number: number;
  title: string;
  description: string;
  why: string;
  hrefKey: keyof DemoStoryState["links"];
  prepareTarget?: DemoPrepareAct;
  primaryLabel: string;
};

type DemoApiResponse = {
  ok?: boolean;
  state?: DemoStoryState;
  judgeUrl?: string;
  publicUrl?: string;
  leaderboardUrl?: string;
  error?: string;
};

const LOCAL_PROGRESS_KEY = "summit_demo_story_progress_v1";
const STALE_DEMO_STORAGE_KEYS = [
  LOCAL_PROGRESS_KEY,
  "demo_sales_session_v1",
  "scorecard_demo_tour_step",
  "scorecard_demo_tour_dismissed",
  "organizer_demo_tour_state_v2",
  "organizer_demo_tour_state_v3",
] as const;

const STORY_ACTS: StoryAct[] = [
  {
    id: "create",
    number: 1,
    title: "Organizer: Build Event",
    description: "Create the competition through the real staff setup form.",
    why: "The demo starts where a real organizer starts: event basics, registration, preset, categories, finals, rounds, and schedule.",
    hrefKey: "setup",
    primaryLabel: "Start Organizer Setup",
  },
  {
    id: "judge",
    number: 2,
    title: "Judge: Correct Key Score",
    description: "Use the real mobile judge screen to correct Athlete C on B3 from Top in 3 to Top in 1.",
    why: "A single judge correction can change the finalist cut line.",
    hrefKey: "judge",
    prepareTarget: "act2",
    primaryLabel: "Open judge station",
  },
  {
    id: "organizer",
    number: 3,
    title: "Organizer: Advance Finalists",
    description: "Review leaderboard impact, lock qualifiers, advance finalists, and open finals.",
    why: "This act teaches organizer confidence and phase control after a real score correction.",
    hrefKey: "organizer",
    prepareTarget: "act3",
    primaryLabel: "Open organizer view",
  },
  {
    id: "public",
    number: 4,
    title: "Public: View Results",
    description: "View the public event, schedule, leaderboard, finalists, and results.",
    why: "This closes the loop for athletes, parents, coaches, and spectators.",
    hrefKey: "publicEvent",
    prepareTarget: "act4",
    primaryLabel: "View public event",
  },
];

function readLocalPublicViewed() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_PROGRESS_KEY) ?? "{}") as {
      publicViewed?: unknown;
    };
    return parsed.publicViewed === true;
  } catch {
    return false;
  }
}

function writeLocalPublicViewed() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify({ publicViewed: true }));
}

function clearDemoRuntimeState() {
  if (typeof window === "undefined") {
    return;
  }

  STALE_DEMO_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  clearDemoSalesSession();
}

function resetClientStoryState(state: DemoStoryState): DemoStoryState {
  return {
    ...state,
    available: false,
    error: null,
    competition: null,
    metadata: null,
    targetAttempt: null,
    finalistCount: 0,
    progress: {
      eventCreated: false,
      dataPopulated: false,
      finalsSetupReady: false,
      keyScoreCorrected: false,
      finalistsAdvanced: false,
      finalsStarted: false,
      publicViewed: false,
    },
    links: {
      setup: "/staff/demo/new",
      judge: null,
      organizer: null,
      publicEvent: null,
      leaderboard: null,
      scorecard: null,
    },
  };
}

function getActStatus(act: StoryAct, state: DemoStoryState, publicViewed: boolean): ActStatus {
  const progress = state.progress;

  if (act.id === "create") {
    return progress.eventCreated && progress.dataPopulated ? "complete" : "ready";
  }

  if (act.id === "judge") {
    if (progress.keyScoreCorrected) return "complete";
    return progress.eventCreated && progress.dataPopulated ? "ready" : "locked";
  }

  if (act.id === "organizer") {
    if (progress.finalistsAdvanced && progress.finalsStarted) return "complete";
    return progress.keyScoreCorrected && progress.finalsSetupReady ? "ready" : "locked";
  }

  if (progress.finalsStarted && publicViewed) {
    return "complete";
  }

  return progress.finalistsAdvanced && progress.finalsStarted ? "ready" : "locked";
}

function getStatusLabel(status: ActStatus) {
  switch (status) {
    case "complete":
      return "Complete";
    case "ready":
      return "Ready";
    default:
      return "Locked";
  }
}

function statusStyles(status: ActStatus) {
  switch (status) {
    case "complete":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "ready":
      return "border-sky-200 bg-sky-50 text-sky-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function getMissingDependencyText(act: StoryAct, state: DemoStoryState) {
  if (act.id === "judge") {
    return "Create and populate the demo event first.";
  }

  if (act.id === "organizer") {
    if (!state.progress.eventCreated) return "Missing demo event.";
    if (!state.progress.dataPopulated) return "Missing simulated climbers and seeded scores.";
    if (!state.progress.finalsSetupReady) return "Missing finals-capable setup.";
    if (!state.progress.keyScoreCorrected) return "Complete the key judge score correction first.";
  }

  if (act.id === "public") {
    return "Complete organizer finalist advancement before viewing public results.";
  }

  return "Complete the previous act first.";
}

export function DemoCommandCenter({ initialState }: { initialState: DemoStoryState }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(initialState.error);
  const [notice, setNotice] = useState<string | null>(null);
  const [publicViewed, setPublicViewed] = useState(false);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy = isPending || Boolean(pendingLabel);

  useEffect(() => {
    setPublicViewed(readLocalPublicViewed());
    clearDemoSalesSession();
  }, []);

  async function postDemoPrepare(targetAct: DemoPrepareAct) {
    const response = await fetch("/api/demo/prepare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetAct }),
    });
    const payload = (await response.json().catch(() => null)) as DemoApiResponse | null;

    if (!response.ok || !payload?.ok || !payload.state) {
      throw new Error(payload?.error ?? "Unable to prepare demo state.");
    }

    return payload;
  }

  async function refreshProgress(messageOnIncomplete?: string) {
    setPendingLabel("Checking demo progress...");
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/demo/prepare");
      const payload = (await response.json().catch(() => null)) as DemoApiResponse | null;
      if (!response.ok || !payload?.ok || !payload.state) {
        throw new Error(payload?.error ?? "Unable to refresh demo progress.");
      }

      setState(payload.state);
      setError(payload.state.error);
      if (messageOnIncomplete && !payload.state.progress.keyScoreCorrected) {
        setNotice(messageOnIncomplete);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to refresh demo progress.");
    } finally {
      setPendingLabel(null);
    }
  }

  async function startFullStory() {
    clearDemoRuntimeState();
    setPublicViewed(false);
    setError(null);
    setNotice(null);
    setPendingLabel("Clearing old demo state...");
    setState((current) => resetClientStoryState(current));

    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as DemoApiResponse | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Unable to clear old demo state.");
      }

      setNotice("Opening Act 1 in a clean organizer setup flow.");
      startTransition(() => {
        router.push("/staff/demo/new");
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to clear old demo state.");
    } finally {
      setPendingLabel(null);
    }
  }

  async function launchReadyMadeDemo() {
    setPendingLabel("Creating ready-made demo event...");
    setError(null);
    setNotice(null);
    clearDemoSalesSession();

    try {
      const payload = await postDemoPrepare("act2");
      setState(payload.state!);
      setError(payload.state!.error);
      const href = payload.judgeUrl ?? payload.state!.links.judge;
      if (href) {
        startTransition(() => router.push(href));
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create ready-made demo.");
    } finally {
      setPendingLabel(null);
    }
  }

  async function resetDemo() {
    const shouldReset = window.confirm("Reset the canonical demo event? This only affects demo-safe data.");
    if (!shouldReset) {
      return;
    }

    setPendingLabel("Resetting demo...");
    setError(null);
    setNotice(null);
    clearDemoRuntimeState();
    setPublicViewed(false);

    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as DemoApiResponse | null;
      if (!response.ok || !payload?.ok || !payload.state) {
        throw new Error(payload?.error ?? "Unable to reset demo.");
      }
      setState(resetClientStoryState(payload.state));
      setNotice("Demo reset. Act 1 is ready; Acts 2, 3, and 4 are locked again.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to reset demo.");
    } finally {
      setPendingLabel(null);
    }
  }

  async function prepareAndNavigate(act: StoryAct) {
    if (!act.prepareTarget) {
      return;
    }

    setPendingLabel("Preparing demo state...");
    setError(null);
    setNotice(null);

    try {
      const payload = await postDemoPrepare(act.prepareTarget);
      setState(payload.state!);
      setError(payload.state!.error);
      const href = payload.state!.links[act.hrefKey];
      if (act.id === "public" && href) {
        writeLocalPublicViewed();
        setPublicViewed(true);
      }
      if (href) {
        startTransition(() => router.push(href));
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to prepare demo state.");
    } finally {
      setPendingLabel(null);
    }
  }

  function handleActClick(act: StoryAct, status: ActStatus) {
    if (act.id === "create") {
      startTransition(() => router.push("/staff/demo/new"));
      return;
    }

    const href = state.links[act.hrefKey];
    if (status === "locked" || !href) {
      void prepareAndNavigate(act);
      return;
    }

    if (act.id === "public") {
      writeLocalPublicViewed();
      setPublicViewed(true);
    }
    router.push(href);
  }

  const currentAct = STORY_ACTS.find((act) => getActStatus(act, state, publicViewed) !== "complete") ?? STORY_ACTS[3];
  const currentStatus = getActStatus(currentAct, state, publicViewed);
  const metadata = state.metadata;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_34%),linear-gradient(135deg,#f8fafc,#eef6ff_46%,#fff7ed)] text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-sky-200 bg-sky-50/90 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-700">Demo Mode</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                The demo guides real app screens: setup, judge scoring, organizer controls, and public results.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="compact" variant="danger" onClick={resetDemo} disabled={busy}>
                Reset Demo
              </Button>
              <Link href="/" className={buttonStyles({ variant: "ghost", size: "compact" })}>
                Exit Demo
              </Link>
            </div>
          </div>
        </div>

        <Surface variant="card" density="public" className="relative overflow-hidden">
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-sky-200/40 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] xl:items-end">
            <div className="space-y-5">
              <Badge>Guided product story</Badge>
              <div className="space-y-3">
                <h1 className="max-w-4xl text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-6xl">
                  Summit Series Demo
                </h1>
                <p className="max-w-3xl text-lg leading-8 text-slate-600">
                  Create a youth championship, correct a key score on the real judge screen, advance finalists, and view the public result.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" size="lg" onClick={() => void startFullStory()} disabled={busy}>
                  Start Full Story
                </Button>
                <Button variant="secondary" size="lg" onClick={() => void launchReadyMadeDemo()} disabled={busy}>
                  Use Ready-Made Demo Event
                </Button>
                <Button variant="danger" size="lg" onClick={resetDemo} disabled={busy}>
                  Reset Demo
                </Button>
              </div>
              <div className="grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
                  <span className="font-black text-slate-950">Start Full Story:</span> opens the real organizer setup form first. Demo data is populated only after creation.
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
                  <span className="font-black text-slate-950">Use Ready-Made Demo Event:</span> creates and populates the canonical demo immediately for quick testing.
                </div>
              </div>
              {(pendingLabel || error || notice) ? (
                <div
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold",
                    error
                      ? "border-red-200 bg-red-50 text-red-700"
                      : notice
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-sky-200 bg-sky-50 text-sky-800"
                  )}
                  role="status"
                >
                  {error ?? notice ?? pendingLabel}
                </div>
              ) : null}
            </div>

            <div className="rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Current act</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-black tracking-tight text-slate-950">
                    Act {currentAct.number}: {currentAct.title}
                  </h2>
                  <span className={cn("rounded-full border px-3 py-1 text-xs font-black", statusStyles(currentStatus))}>
                    {getStatusLabel(currentStatus)}
                  </span>
                </div>
                <p className="text-sm leading-6 text-slate-600">{currentAct.description}</p>
                {currentStatus === "locked" ? (
                  <p className="text-xs font-semibold leading-5 text-amber-700">
                    {getMissingDependencyText(currentAct, state)}
                  </p>
                ) : null}
                <Button variant="primary" fullWidth onClick={() => handleActClick(currentAct, currentStatus)} disabled={busy}>
                  {currentStatus === "locked" ? "Prepare demo state and skip ahead" : currentAct.primaryLabel}
                </Button>
              </div>
            </div>
          </div>
        </Surface>

        <section className="grid gap-4 lg:grid-cols-4">
          {STORY_ACTS.map((act) => {
            const status = getActStatus(act, state, publicViewed);
            return (
              <Surface key={act.id} variant="row" density="organizer" className="flex h-full flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">
                    {status === "complete" ? "OK" : act.number}
                  </span>
                  <span className={cn("rounded-full border px-3 py-1 text-xs font-black", statusStyles(status))}>
                    {getStatusLabel(status)}
                  </span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-black tracking-tight text-slate-950">{act.title}</h3>
                  <p className="text-sm leading-6 text-slate-600">{act.description}</p>
                  <p className="text-xs font-semibold leading-5 text-slate-500">{act.why}</p>
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <Button
                    variant={status === "locked" ? "secondary" : "primary"}
                    size="compact"
                    onClick={() => handleActClick(act, status)}
                    disabled={busy}
                  >
                    {status === "locked" ? "Prepare demo state and skip ahead" : act.primaryLabel}
                  </Button>
                  {act.id === "judge" && state.progress.dataPopulated && !state.progress.keyScoreCorrected ? (
                    <Button
                      variant="secondary"
                      size="compact"
                      onClick={() =>
                        void refreshProgress("Not complete yet. Save Athlete C on B3 as Top on attempt 1, then check again.")
                      }
                      disabled={busy}
                    >
                      I completed this
                    </Button>
                  ) : null}
                  {status === "locked" ? (
                    <p className="text-xs font-semibold leading-5 text-amber-700">
                      {getMissingDependencyText(act, state)}
                    </p>
                  ) : null}
                </div>
              </Surface>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)]">
          <Surface variant="panel" density="public" className="space-y-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Derived demo state</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                Database-backed progress
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Act 1, Act 2, and Act 3 are derived from the canonical demo competition, not localStorage.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Event created", state.progress.eventCreated],
                ["Data populated", state.progress.dataPopulated],
                ["Key score corrected", state.progress.keyScoreCorrected],
                ["Finals setup ready", state.progress.finalsSetupReady],
                ["Finalists advanced", state.progress.finalistsAdvanced],
                ["Finals started", state.progress.finalsStarted],
              ].map(([label, complete]) => (
                <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <p className="text-xs font-bold text-slate-500">{label}</p>
                  <p className={cn("mt-1 text-sm font-black", complete ? "text-emerald-700" : "text-slate-500")}>
                    {complete ? "Ready" : "Not yet"}
                  </p>
                </div>
              ))}
            </div>
          </Surface>

          <Surface variant="meta" density="organizer" className="space-y-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Cut-line story</p>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                {metadata?.drama_target_climber_name ?? "Athlete C"} on Boulder {metadata?.drama_target_climb_number ?? 3}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {metadata?.drama_description ??
                  "Create or prepare the demo to seed the score correction story."}
              </p>
            </div>
            {state.links.leaderboard ? (
              <Link href={state.links.leaderboard} className={buttonStyles({ variant: "secondary", size: "compact", fullWidth: true })}>
                Open leaderboard
              </Link>
            ) : null}
            {state.links.scorecard ? (
              <Link href={state.links.scorecard} className={buttonStyles({ variant: "ghost", size: "compact", fullWidth: true })}>
                Open demo scorecard
              </Link>
            ) : null}
          </Surface>
        </section>
      </div>
    </main>
  );
}
