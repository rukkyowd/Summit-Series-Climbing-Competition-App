"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GuidedDemoEventSetupFlow } from "@/components/demo/guided-demo-event-setup-flow";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { getGuidedDemoPreset } from "@/lib/competition-presets";
import { clearDemoSalesSession } from "@/lib/demo-sales-session";
import type { DemoStoryState, DemoStoryTargetAct } from "@/lib/demo-story";

type ActStatus = "locked" | "ready" | "in_progress" | "complete";
type DemoCommandView = "home" | "act1_setup";
type BuildTransitionState = {
  active: boolean;
  stepIndex: number;
  complete: boolean;
};

type StoryAct = {
  id: "create" | "judge" | "organizer" | "public";
  number: number;
  title: string;
  description: string;
  why: string;
  targetAct: DemoStoryTargetAct;
  hrefKey: keyof DemoStoryState["links"];
  primaryLabel: string;
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
const ACT_1_BUILD_STEPS = [
  "Saving event setup",
  "Simulating 150 climber registrations",
  "Generating qualifier routes and seeded scores",
  "Opening judge workspaces",
  "Launching the live judge panel",
] as const;
const ACT_1_DIVISIONS = ["Men", "Women"] as const;
const youthChampionshipPreset = getGuidedDemoPreset();
const DEMO_STORY_COPY = {
  title: "Summit Series Demo",
} as const;

const storyActs: StoryAct[] = [
  {
    id: "create",
    number: 1,
    title: "Create Event",
    description:
      "Create the canonical youth championship demo with presets, categories, rounds, and schedule.",
    why: "The setup story shows how a real event gets configured before anyone scores a climb.",
    targetAct: "event_created",
    hrefKey: "setup",
    primaryLabel: "Review event setup",
  },
  {
    id: "judge",
    number: 2,
    title: "Correct Key Score",
    description:
      "Find Athlete C, select B3, change Top from attempt 3 to attempt 1, then save.",
    why: "A single judge correction can change the finalist cut line. The demo makes that visible.",
    targetAct: "score_corrected",
    hrefKey: "judge",
    primaryLabel: "Open judge station",
  },
  {
    id: "organizer",
    number: 3,
    title: "Advance Finalists / Start Finals",
    description:
      "Review the cut-line movement, lock qualifiers, advance finalists, and open finals.",
    why: "Complete the key score correction first, or prepare demo state and skip ahead.",
    targetAct: "finalists_started",
    hrefKey: "organizer",
    primaryLabel: "Open organizer view",
  },
  {
    id: "public",
    number: 4,
    title: "View Public Result",
    description:
      "See the competition as a climber, parent, coach, or spectator on the public event pages.",
    why: "The public view closes the loop: setup, scoring, organizer control, and results all line up.",
    targetAct: "public_ready",
    hrefKey: "publicEvent",
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

function clearDemoStoryLocalProgress() {
  if (typeof window === "undefined") {
    return;
  }

  STALE_DEMO_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  clearDemoSalesSession();
}

function clearDemoStoryRuntimeState() {
  clearDemoStoryLocalProgress();
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getJudgeRouteReadinessError(state: DemoStoryState) {
  if (state.error) {
    return state.error;
  }

  if (!state.competition) {
    return "Create the canonical demo event before opening the judge panel.";
  }

  if (!state.competition.is_demo) {
    return "The canonical demo slug is not marked as demo-safe. Refusing to open the judge panel.";
  }

  if (!state.metadata?.drama_target_climber || !state.metadata.drama_target_climb_number) {
    return "The demo is missing the target athlete or boulder metadata. Repair the demo state before opening the judge panel.";
  }

  if (!state.links.judge) {
    return "The demo judge route is missing target athlete or qualifier route prerequisites. Repair the demo state before opening the judge panel.";
  }

  return null;
}

function resetClientStoryState(state: DemoStoryState): DemoStoryState {
  return {
    ...state,
    error: null,
    targetAttempt: null,
    finalistCount: 0,
    progress: {
      eventCreated: false,
      finalsSetupReady: false,
      keyScoreCorrected: false,
      finalistsAdvanced: false,
      finalsStarted: false,
      publicViewed: false,
    },
    links: {
      ...state.links,
      judge: null,
      scorecard: null,
    },
  };
}

function getActStatus(act: StoryAct, state: DemoStoryState, publicViewed: boolean): ActStatus {
  const progress = state.progress;

  if (act.id === "create") {
    return progress.eventCreated ? "complete" : "ready";
  }

  if (act.id === "judge") {
    if (progress.keyScoreCorrected) return "complete";
    return progress.eventCreated ? "ready" : "locked";
  }

  if (act.id === "organizer") {
    if (progress.finalistsAdvanced && progress.finalsStarted) return "complete";
    return progress.keyScoreCorrected && progress.finalsSetupReady ? "ready" : "locked";
  }

  if (progress.finalsStarted && publicViewed) {
    return "complete";
  }

  return progress.finalsStarted ? "ready" : "locked";
}

function getStatusLabel(status: ActStatus) {
  switch (status) {
    case "complete":
      return "Complete";
    case "ready":
      return "Ready";
    case "in_progress":
      return "In progress";
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
    case "in_progress":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function getActButtonLabel(act: StoryAct, status: ActStatus, state: DemoStoryState) {
  if (act.id === "organizer" && state.progress.eventCreated && !state.progress.finalsSetupReady) {
    return "Reset demo and restart Act 1";
  }

  return status === "locked" ? "Prepare demo state and skip ahead" : act.primaryLabel;
}

export function DemoCommandCenter({ initialState }: { initialState: DemoStoryState }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(initialState.error);
  const [notice, setNotice] = useState<string | null>(null);
  const [publicViewed, setPublicViewed] = useState(false);
  const [act2CompletionVisible, setAct2CompletionVisible] = useState(initialState.progress.keyScoreCorrected);
  const [activeView, setActiveView] = useState<DemoCommandView>("home");
  const [buildTransition, setBuildTransition] = useState<BuildTransitionState>({
    active: false,
    stepIndex: 0,
    complete: false,
  });
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPublicViewed(readLocalPublicViewed());
    clearDemoSalesSession();
  }, []);

  async function postPrepareState(
    targetAct: DemoStoryTargetAct,
    options?: {
      reset?: boolean;
      resetOnly?: boolean;
    }
  ) {
    const response = await fetch("/api/demo/prepare-state", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        targetAct,
        reset: options?.reset === true,
        resetOnly: options?.resetOnly === true,
      }),
    });
    const payload = (await response.json()) as { ok?: boolean; state?: DemoStoryState; error?: string };

    if (!response.ok || !payload.ok || !payload.state) {
      throw new Error(payload.error ?? "Unable to prepare the demo story.");
    }

    return payload.state;
  }

  async function prepareState(
    targetAct: DemoStoryTargetAct,
    options?: {
      reset?: boolean;
      resetOnly?: boolean;
      redirectTo?: string | null;
      redirectKey?: keyof DemoStoryState["links"];
    }
  ) {
    setError(null);
    setNotice(null);
    setPendingLabel(options?.reset ? "Resetting demo..." : "Preparing demo...");
    if (options?.reset) {
      clearDemoStoryRuntimeState();
      setPublicViewed(false);
      setAct2CompletionVisible(false);
    } else {
      clearDemoSalesSession();
    }

    try {
      const nextState = await postPrepareState(targetAct, options);
      setState(nextState);
      setError(nextState.error);
      setActiveView("home");
      setAct2CompletionVisible(nextState.progress.keyScoreCorrected);
      if (targetAct === "public_ready" && !options?.resetOnly) {
        writeLocalPublicViewed();
        setPublicViewed(true);
      }

      const redirectHref = options?.redirectTo ?? (options?.redirectKey ? nextState.links[options.redirectKey] : null);
      if (redirectHref) {
        startTransition(() => {
          router.push(redirectHref);
        });
      }
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : "Unable to prepare the demo story.");
    } finally {
      setPendingLabel(null);
    }
  }

  function startFullStory() {
    setError(null);
    setNotice(null);
    setPendingLabel(null);
    setBuildTransition({ active: false, stepIndex: 0, complete: false });
    clearDemoStoryRuntimeState();
    setPublicViewed(false);
    setAct2CompletionVisible(false);
    setState((current) => resetClientStoryState(current));
    setActiveView("act1_setup");
    setNotice("Act 1 is ready. Review the real setup-style flow, then create the demo event.");
  }

  function openAct1Setup() {
    setError(null);
    setNotice(null);
    setActiveView("act1_setup");
  }

  async function runAct1BuildTransition(options?: { reset?: boolean }) {
    setError(null);
    setNotice(null);
    setPendingLabel(null);
    clearDemoStoryRuntimeState();
    setPublicViewed(false);
    setAct2CompletionVisible(false);
    setBuildTransition({ active: true, stepIndex: 0, complete: false });

    try {
      const preparePromise = postPrepareState("event_created", { reset: options?.reset === true }).then(
        (nextState) => ({ nextState, error: null }),
        (buildError: unknown) => ({ nextState: null, error: buildError })
      );

      for (let index = 0; index < ACT_1_BUILD_STEPS.length; index += 1) {
        setBuildTransition({ active: true, stepIndex: index, complete: false });
        await wait(index === 0 ? 320 : 520);
      }

      const { nextState, error: prepareError } = await preparePromise;
      if (prepareError || !nextState) {
        throw prepareError instanceof Error ? prepareError : new Error("Unable to prepare the judge demo.");
      }

      const readinessError = getJudgeRouteReadinessError(nextState);
      if (readinessError) {
        throw new Error(readinessError);
      }

      setState(nextState);
      setBuildTransition({
        active: true,
        stepIndex: ACT_1_BUILD_STEPS.length - 1,
        complete: true,
      });
      await wait(420);

      startTransition(() => {
        router.push(nextState.links.judge!);
      });
    } catch (buildError) {
      setBuildTransition({ active: false, stepIndex: 0, complete: false });
      setError(buildError instanceof Error ? buildError.message : "Unable to prepare the judge demo.");
    }
  }

  async function refreshStoryState(messageOnIncomplete?: string) {
    setError(null);
    setNotice(null);
    setPendingLabel("Checking demo progress...");

    try {
      const response = await fetch("/api/demo/prepare-state", {
        method: "GET",
      });
      const payload = (await response.json()) as { ok?: boolean; state?: DemoStoryState; error?: string };

      if (!response.ok || !payload.ok || !payload.state) {
        throw new Error(payload.error ?? "Unable to refresh demo progress.");
      }

      setState(payload.state);
      setError(payload.state.error);
      setAct2CompletionVisible(payload.state.progress.keyScoreCorrected);
      if (messageOnIncomplete && !payload.state.progress.keyScoreCorrected) {
        setNotice(messageOnIncomplete);
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh demo progress.");
    } finally {
      setPendingLabel(null);
    }
  }

  function handleReset() {
    const shouldReset = window.confirm(
      "Reset the canonical demo event? This only affects demo-safe data and will recreate the guided story seed."
    );
    if (!shouldReset) {
      return;
    }

    setActiveView("home");
    void prepareState("event_created", { reset: true, resetOnly: true });
  }

  function handleActClick(act: StoryAct, status: ActStatus) {
    const href = state.links[act.hrefKey];

    if (act.id === "create") {
      openAct1Setup();
      return;
    }

    if (act.id === "organizer" && state.progress.eventCreated && !state.progress.finalsSetupReady) {
      void startFullStory();
      return;
    }

    if (act.id === "public" && status !== "locked" && href) {
      writeLocalPublicViewed();
      setPublicViewed(true);
      router.push(href);
      return;
    }

    if (status === "locked" || !href) {
      if (act.id === "judge") {
        openAct1Setup();
        return;
      }
      void prepareState(act.targetAct, { redirectTo: href, redirectKey: act.hrefKey });
      return;
    }

    router.push(href);
  }

  const currentAct =
    activeView === "act1_setup"
      ? storyActs[0]
      : storyActs.find((act) => getActStatus(act, state, publicViewed) !== "complete") ??
        storyActs[storyActs.length - 1];
  const currentStatus =
    activeView === "act1_setup" && !state.progress.eventCreated
      ? "in_progress"
      : getActStatus(currentAct, state, publicViewed);
  const metadata = state.metadata;
  const busy = isPending || Boolean(pendingLabel) || buildTransition.active;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_34%),linear-gradient(135deg,#f8fafc,#eef6ff_46%,#fff7ed)] text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-sky-200 bg-sky-50/90 px-5 py-4 shadow-[0_16px_38px_rgba(14,116,144,0.08)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-700">
                Demo Mode
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                Changes are safe and resettable. This guide only prepares the canonical demo competition.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="compact" variant="secondary" onClick={() => router.push("/demo")}>
                View Guide
              </Button>
              <Button size="compact" variant="danger" onClick={handleReset} disabled={busy}>
                Reset Demo
              </Button>
              <Link href="/" className={buttonStyles({ variant: "ghost", size: "compact" })}>
                Exit Demo
              </Link>
            </div>
          </div>
        </div>

        {buildTransition.active ? (
          <Surface variant="card" density="public" className="overflow-hidden border-sky-200 bg-white/95">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(18rem,0.55fr)] lg:items-center">
              <div className="space-y-3">
                <Badge>Launching Act 2</Badge>
                <h2 className="text-3xl font-black tracking-[-0.03em] text-slate-950 sm:text-4xl">
                  The organizer setup is becoming a live comp.
                </h2>
                <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
                  The demo is restoring a clean, judge-ready event in the background so the next
                  screen opens on categories, boulders, schedule blocks, and public results that all
                  line up.
                </p>
                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {error}
                  </div>
                ) : null}
              </div>
              <ol className="space-y-2" aria-live="polite">
                {ACT_1_BUILD_STEPS.map((step, index) => {
                  const isComplete = buildTransition.complete || index < buildTransition.stepIndex;
                  const isActive = !buildTransition.complete && index === buildTransition.stepIndex;
                  return (
                    <li
                      key={step}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold transition",
                        isComplete
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : isActive
                            ? "border-sky-200 bg-sky-50 text-sky-800"
                            : "border-slate-200 bg-slate-50 text-slate-500"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black",
                          isComplete
                            ? "bg-emerald-600 text-white"
                            : isActive
                              ? "bg-sky-600 text-white"
                              : "bg-slate-200 text-slate-600"
                        )}
                      >
                        {isComplete ? "OK" : index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </Surface>
        ) : null}

        <Surface variant="card" density="public" className="relative overflow-hidden">
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-sky-200/40 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] xl:items-end">
            <div className="space-y-5">
              <Badge>Guided product story</Badge>
              <div className="space-y-3">
                <h1 className="max-w-4xl text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-6xl">
                  {DEMO_STORY_COPY.title}
                </h1>
                <p className="max-w-3xl text-lg leading-8 text-slate-600">
                  Run a complete youth championship in five minutes. You&apos;ll create the event,
                  correct a key score as a judge, advance finalists as the organizer, and view
                  the public result.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => void startFullStory()}
                  disabled={busy}
                >
                  Start Full Story
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => prepareState("event_created")}
                  disabled={busy}
                >
                  Use Ready-Made Demo Event
                </Button>
                <Button
                  variant="danger"
                  size="lg"
                  onClick={handleReset}
                  disabled={busy}
                >
                  Reset Demo
                </Button>
                {error ? (
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => prepareState("event_created", { reset: true })}
                    disabled={busy}
                  >
                    Repair demo state
                  </Button>
                ) : null}
              </div>

              {(pendingLabel || error || notice) && (
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
              )}
            </div>

            <div className="rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">
                Current act
              </p>
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
                <Button
                  variant="primary"
                  fullWidth
                  onClick={() => handleActClick(currentAct, currentStatus)}
                  disabled={busy}
                >
                  {getActButtonLabel(currentAct, currentStatus, state)}
                </Button>
              </div>
            </div>
          </div>
        </Surface>

        {activeView === "act1_setup" ? (
          <GuidedDemoEventSetupFlow
            busy={busy}
            onBack={() => setActiveView("home")}
            onCreateDemoEvent={() => void runAct1BuildTransition({ reset: true })}
          />
        ) : null}

        {act2CompletionVisible && state.progress.keyScoreCorrected ? (
          <Surface variant="panel" density="judge" className="border-emerald-200 bg-emerald-50/90">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-700">
                  Act 2 complete
                </p>
                <h2 className="text-2xl font-black tracking-tight text-emerald-950">
                  Act 2 complete: key score corrected.
                </h2>
                <p className="max-w-3xl text-sm leading-6 text-emerald-900">
                  You corrected Athlete C&apos;s B3 score to Top in 1 attempt. That change can move the
                  finalist cut line, which is what the organizer reviews next.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <Button
                  variant="primary"
                  onClick={() => {
                    const href = state.links.organizer;
                    if (href) {
                      router.push(href);
                    }
                  }}
                  disabled={busy || !state.links.organizer}
                >
                  Continue to Organizer Demo
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const href = state.links.leaderboard;
                    if (href) {
                      router.push(href);
                    }
                  }}
                  disabled={busy || !state.links.leaderboard}
                >
                  View leaderboard impact
                </Button>
                <Button variant="ghost" onClick={() => router.push("/demo")} disabled={busy}>
                  Back to Demo Home
                </Button>
              </div>
            </div>
          </Surface>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-4">
          {storyActs.map((act) => {
            const computedStatus = getActStatus(act, state, publicViewed);
            const status =
              activeView === "act1_setup" && act.id === "create" && !state.progress.eventCreated
                ? "in_progress"
                : computedStatus;
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
                    {getActButtonLabel(act, status, state)}
                  </Button>
                  {act.id === "judge" && state.progress.eventCreated && !state.progress.keyScoreCorrected ? (
                    <Button
                      variant="secondary"
                      size="compact"
                      onClick={() =>
                        void refreshStoryState(
                          "Not complete yet. Save Athlete C on B3 as Top on attempt 1, then check again."
                        )
                      }
                      disabled={busy}
                    >
                      I completed this
                    </Button>
                  ) : null}
                  {status === "locked" && (act.id === "organizer" || act.id === "public") ? (
                    <p className="text-xs font-semibold leading-5 text-amber-700">
                      {act.id === "organizer" && state.progress.eventCreated && !state.progress.finalsSetupReady
                        ? "The guided story needs finals setup for Act 3. Reset the demo to restore the finals-capable story preset."
                        : "This skips the hands-on task and prepares only canonical demo data."}
                    </p>
                  ) : null}
                  {status !== "locked" && act.id === "public" && state.links.leaderboard && (
                    <Link
                      href={state.links.leaderboard}
                      onClick={() => {
                        writeLocalPublicViewed();
                        setPublicViewed(true);
                      }}
                      className={buttonStyles({ variant: "ghost", size: "compact" })}
                    >
                      Open leaderboard
                    </Link>
                  )}
                </div>
              </Surface>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)]">
          <Surface variant="panel" density="public" className="space-y-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">
                Act 1 setup preview
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                Youth Championship with Finals
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The preset creates youth categories, keeps Youth D and Youth C in qualifiers only,
                and makes Youth B, Youth A, and Junior finals-eligible.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <h3 className="font-black text-slate-950">Generated categories</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {youthChampionshipPreset.defaultCategories.flatMap((ageGroup) =>
                    ACT_1_DIVISIONS.map((division) => (
                      <span
                        key={`${division}-${ageGroup}`}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700"
                      >
                        {division} / {ageGroup}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <h3 className="font-black text-slate-950">Finals eligible</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {youthChampionshipPreset.finalsEligibleCategories.flatMap((ageGroup) =>
                    ACT_1_DIVISIONS.map((division) => (
                      <span
                        key={`${division}-${ageGroup}`}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800"
                      >
                        {division} / {ageGroup}
                      </span>
                    ))
                  )}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Youth D and Youth C still compete, but they do not advance to finals by default.
                </p>
              </div>
            </div>
          </Surface>

          <Surface variant="meta" density="organizer" className="space-y-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">
                Cut-line drama
              </p>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                {metadata?.drama_target_climber_name ?? "Athlete C"} on Boulder{" "}
                {metadata?.drama_target_climb_number ?? 3}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {metadata?.drama_description ??
                  "Athlete C tops B3 in 1 attempt instead of 3 and leapfrogs Athlete B at the finals cut line."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-100 p-4">
                <p className="text-xs font-bold text-slate-500">Before</p>
                <p className="mt-1 text-xl font-black text-slate-950">
                  Top in {metadata?.drama_target_attempts_before ?? 3}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-bold text-emerald-700">After</p>
                <p className="mt-1 text-xl font-black text-emerald-900">
                  Top in {metadata?.drama_target_attempts_after ?? 1}
                </p>
              </div>
            </div>
            {state.links.scorecard && (
              <Link
                href={state.links.scorecard}
                onClick={() => {
                  writeLocalPublicViewed();
                  setPublicViewed(true);
                }}
                className={buttonStyles({ variant: "secondary", size: "compact", fullWidth: true })}
              >
                Open demo athlete scorecard
              </Link>
            )}
          </Surface>
        </section>
      </div>
    </main>
  );
}
