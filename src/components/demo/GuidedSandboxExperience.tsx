"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { loadDemoEventAction } from "@/app/demo/actions";
import { DemoChecklist, type DemoChecklistStepId } from "@/components/demo/DemoChecklist";
import { DemoControlBar } from "@/components/demo/DemoControlBar";
import { formatDemoSimulationResult } from "@/components/demo/DemoSimulation";
import { HighlightBox } from "@/components/demo/HighlightBox";
import { Button, buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useDemoRole, type DemoRole } from "@/hooks/useDemoRole";
import { useDemoSimulation } from "@/hooks/useDemoSimulation";
import { cn } from "@/lib/cn";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import {
  buildCompetitionPath,
  buildStaffCompetitionPath,
  filterAttemptsForRound,
  formatCompetitionPhaseLabel,
  sortQualifierLeaderboardForDisplay,
} from "@/lib/scoring";

type DemoSummary = {
  id: string;
  slug: string;
  name: string;
  created_at: string | null;
  canSkipToJudge: boolean;
  canSkipToResults: boolean;
};

type DemoSeedResponse = {
  ok?: boolean;
  error?: string;
  inserted?: {
    climbers?: number;
    attempts?: number;
    qualifierRounds?: number;
  };
};

type BusyAction = "load" | "reset" | null;

const stepRole: Record<DemoChecklistStepId, DemoRole> = {
  create: "admin",
  register: "admin",
  score: "judge",
  leaderboard: "public",
};

const stepAnchor: Record<DemoChecklistStepId, string> = {
  create: "demo-create-competition",
  register: "demo-register-athletes",
  score: "demo-score-input",
  leaderboard: "demo-live-leaderboard",
};

function formatCreatedDate(value: string | null) {
  if (!value) return "Created recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Created recently";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getBusyLabel(action: BusyAction) {
  if (action === "load") return "Loading demo...";
  if (action === "reset") return "Resetting demo...";
  return "";
}

async function seedDemo(competitionId: string) {
  const response = await fetch("/api/demo/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ competitionId }),
  });
  const payload = (await response.json().catch(() => null)) as DemoSeedResponse | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "Unable to seed the demo event.");
  }

  return payload;
}

async function deleteDemo(competitionId: string) {
  const response = await fetch("/api/demo/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ competitionId }),
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? "Unable to reset the demo event.");
  }
}

function upsertDemo(demos: DemoSummary[], demo: DemoSummary) {
  const withoutDemo = demos.filter((entry) => entry.id !== demo.id);
  return [demo, ...withoutDemo];
}

function scrollToStep(stepId: DemoChecklistStepId) {
  window.requestAnimationFrame(() => {
    document.getElementById(stepAnchor[stepId])?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });
}

function countScoredQualifierCells(snapshot: CompetitionSnapshot | null) {
  if (!snapshot) return 0;
  const activeRoundId = snapshot.activeQualifierRound?.id ?? null;
  return snapshot.climbers.reduce((total, climber) => {
    const scored = filterAttemptsForRound(climber.qualifier_attempts, activeRoundId).filter(
      (attempt) => attempt.attempt_count > 0 || attempt.topped || attempt.zone,
    );
    return total + scored.length;
  }, 0);
}

function DemoSkeleton() {
  return (
    <section className="results-card">
      <div className="skeleton-block h-8 w-48" />
      <div className="skeleton-block mt-4 h-20 w-full" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="skeleton-block h-28 w-full" />
        <div className="skeleton-block h-28 w-full" />
        <div className="skeleton-block h-28 w-full" />
      </div>
    </section>
  );
}

function Breadcrumbs({ roleLabel }: { roleLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
      <span>Demo Event</span>
      <span aria-hidden="true">-&gt;</span>
      <span className="text-slate-950">{roleLabel}</span>
    </div>
  );
}

function RouteLinks({ demo }: { demo: DemoSummary }) {
  const links = [
    { label: "Organizer", href: `${buildStaffCompetitionPath(demo.slug)}?demo=act3` },
    { label: "Judge", href: `${buildStaffCompetitionPath(demo.slug, "judge")}?demo=act2` },
    { label: "Public page", href: `${buildCompetitionPath(demo.slug)}?demo=act4` },
    { label: "Leaderboard", href: `${buildCompetitionPath(demo.slug, "leaderboard")}?demo=act4` },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={buttonStyles({ variant: "ghost", size: "sm" })}>
          {link.label}
        </Link>
      ))}
    </div>
  );
}

type ViewProps = {
  activeDemo: DemoSummary | null;
  activeStep: DemoChecklistStepId;
  lastUpdatedClimberId: string | null;
  onLoadDemo: () => void;
  onManualScore: () => void;
  onResetDemo: () => void;
  showAdvanced: boolean;
  simulation: ReturnType<typeof useDemoSimulation>;
  snapshot: CompetitionSnapshot | null;
  snapshotError: string;
  snapshotLoading: boolean;
};

function AdminSandboxView({
  activeDemo,
  activeStep,
  onLoadDemo,
  onResetDemo,
  showAdvanced,
  snapshot,
  snapshotError,
  snapshotLoading,
}: ViewProps) {
  if (snapshotLoading) {
    return <DemoSkeleton />;
  }

  if (!activeDemo || !snapshot) {
    return (
      <EmptyState
        eyebrow="No competitions yet"
        title="Load demo event to begin"
        description="The sandbox will create or fetch a demo competition, register sample athletes, and open the qualifier phase."
        action={<Button type="button" variant="primary" onClick={onLoadDemo}>Load Demo Event</Button>}
      />
    );
  }

  const activeRound = snapshot.activeQualifierRound;
  const scoredCells = countScoredQualifierCells(snapshot);
  const athletePreview = snapshot.climbers.slice(0, 8);

  return (
    <div className="space-y-5">
      {snapshotError ? <div className="results-alert results-alert-error">{snapshotError}</div> : null}

      <HighlightBox active={activeStep === "create"} id="demo-create-competition">
        <section className="results-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="results-kicker">Admin View</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {snapshot.competition.name}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                This is a real demo competition record with the live qualifier phase, schedule, rounds, categories,
                athletes, and scores loaded through the same system paths as production events.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="results-chip">{formatCompetitionPhaseLabel(snapshot.competition.current_phase)}</span>
                <span className="results-chip">{snapshot.competition.format.replaceAll("_", " ")}</span>
                <span className="results-chip">{formatCreatedDate(activeDemo.created_at)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={onLoadDemo}>Reload Seed</Button>
              <Button type="button" variant="danger" onClick={onResetDemo}>Reset Demo</Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="results-meta-card results-meta-card-compact">
              <div className="results-kicker">Athletes</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{snapshot.climbers.length}</div>
              <div className="mt-1 text-sm text-slate-600">Seeded sample field</div>
            </div>
            <div className="results-meta-card results-meta-card-compact">
              <div className="results-kicker">Scored cells</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{scoredCells}</div>
              <div className="mt-1 text-sm text-slate-600">Qualifier attempts</div>
            </div>
            <div className="results-meta-card results-meta-card-compact">
              <div className="results-kicker">Active stage</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{activeRound?.name ?? "Qualifier"}</div>
              <div className="mt-1 text-sm text-slate-600">
                {activeRound?.problem_count ?? snapshot.competition.total_climbs} boulders
              </div>
            </div>
          </div>
        </section>
      </HighlightBox>

      <HighlightBox active={activeStep === "register"} id="demo-register-athletes">
        <section className="results-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="results-kicker">Registration</div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">Seeded athletes</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                The sandbox avoids an empty registration state by starting with realistic athletes across categories.
              </p>
            </div>
            <Link href={`${buildCompetitionPath(activeDemo.slug, "register")}?demo=act4`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Public Registration
            </Link>
          </div>

          {athletePreview.length ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {athletePreview.map((climber) => (
                <div key={climber.id} className="rounded-[1rem] border border-slate-200 bg-white/82 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-words font-semibold text-slate-950">{climber.name}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                        #{climber.climber_number} / {climber.province}
                      </div>
                    </div>
                    <span className="results-chip">{climber.display_category}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No athletes yet"
              description="Load demo event to register a realistic sample field before scoring starts."
              action={<Button type="button" variant="primary" onClick={onLoadDemo}>Load Demo Event</Button>}
            />
          )}
        </section>
      </HighlightBox>

      {showAdvanced ? (
        <section className="results-card">
          <div className="results-kicker">Real routes</div>
          <div className="mt-3">
            <RouteLinks demo={activeDemo} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function JudgeSandboxView({
  activeDemo,
  activeStep,
  onLoadDemo,
  onManualScore,
  showAdvanced,
  simulation,
  snapshot,
  snapshotError,
  snapshotLoading,
}: ViewProps) {
  if (snapshotLoading) {
    return <DemoSkeleton />;
  }

  if (!activeDemo || !snapshot) {
    return (
      <EmptyState
        eyebrow="No scores yet"
        title="Load demo event to start judging"
        description="The judge sandbox needs a seeded competition before it can submit realistic scores."
        action={<Button type="button" variant="primary" onClick={onLoadDemo}>Load Demo Event</Button>}
      />
    );
  }

  const activeRoundId = snapshot.activeQualifierRound?.id ?? null;
  const targetClimber =
    snapshot.climbers.find((climber) => climber.id === simulation.lastEvent?.climberId) ?? snapshot.climbers[0] ?? null;
  const targetAttempts = filterAttemptsForRound(targetClimber?.qualifier_attempts ?? [], activeRoundId);
  const targetScoreCount = targetAttempts.filter((attempt) => attempt.attempt_count > 0 || attempt.topped || attempt.zone).length;

  return (
    <div className="space-y-5">
      {snapshotError ? <div className="results-alert results-alert-error">{snapshotError}</div> : null}

      <HighlightBox active={activeStep === "score"} id="demo-score-input">
        <section className="results-card">
          <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr] lg:items-start">
            <div>
              <div className="results-kicker">Judge View</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Score a live boulder</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Submit a sample score or turn on Simulate Live. Scores go through the existing scoring path and
                the leaderboard refreshes from the saved competition state.
              </p>
            </div>
            <div className="rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="results-kicker">Round status</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">
                {formatCompetitionPhaseLabel(snapshot.competition.current_phase)}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {countScoredQualifierCells(snapshot)} official qualifier cells saved
              </div>
            </div>
          </div>

          {targetClimber ? (
            <div className="mt-6 rounded-[1.25rem] border border-slate-200 bg-white/82 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-500">Selected athlete</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-950">
                    #{targetClimber.climber_number} {targetClimber.name}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="results-chip">{targetClimber.display_category}</span>
                    <span className="results-chip">{targetScoreCount} scored boulders</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  disabled={simulation.status === "submitting"}
                  onClick={onManualScore}
                >
                  {simulation.status === "submitting" ? "Saving score..." : "Submit Sample Score"}
                </Button>
              </div>

              {simulation.lastEvent ? (
                <div className="results-alert results-alert-success mt-4">
                  Saved just now: #{simulation.lastEvent.climberNumber} {simulation.lastEvent.climberName}, B
                  {simulation.lastEvent.climbNumber} {formatDemoSimulationResult(simulation.lastEvent)}.
                </div>
              ) : (
                <div className="mt-4 rounded-[1.1rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  No live score submitted in this session yet. Submit one score to see the feedback loop.
                </div>
              )}

              {simulation.error ? (
                <div className="results-alert results-alert-error mt-4">{simulation.error}</div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="No athletes yet"
              description="Load demo event to create the sample field before opening scoring."
              action={<Button type="button" variant="primary" onClick={onLoadDemo}>Load Demo Event</Button>}
            />
          )}
        </section>
      </HighlightBox>

      {showAdvanced ? (
        <section className="results-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="results-kicker">Real judge route</div>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Open the production judge panel</h3>
            </div>
            <RouteLinks demo={activeDemo} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PublicSandboxView({
  activeDemo,
  activeStep,
  lastUpdatedClimberId,
  onLoadDemo,
  onManualScore,
  showAdvanced,
  simulation,
  snapshot,
  snapshotError,
  snapshotLoading,
}: ViewProps) {
  if (snapshotLoading) {
    return <DemoSkeleton />;
  }

  if (!activeDemo || !snapshot) {
    return (
      <EmptyState
        eyebrow="No leaderboard yet"
        title="Load demo event to see rankings"
        description="The public view will show seeded standings and live movement once scoring begins."
        action={<Button type="button" variant="primary" onClick={onLoadDemo}>Load Demo Event</Button>}
      />
    );
  }

  const leaderboardRows = sortQualifierLeaderboardForDisplay(
    snapshot.qualifierLeaderboard,
    snapshot.competition.categories,
  ).slice(0, 12);

  return (
    <div className="space-y-5">
      {snapshotError ? <div className="results-alert results-alert-error">{snapshotError}</div> : null}

      <HighlightBox active={activeStep === "leaderboard"} id="demo-live-leaderboard">
        <section className="results-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="results-kicker">Public View</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Live leaderboard</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Rankings reorder with Framer Motion layout animation as scores are saved. The highlighted row is the
                most recent live update from this sandbox session.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {simulation.lastEvent ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Updated just now
                </span>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={simulation.status === "submitting"}
                onClick={onManualScore}
              >
                {simulation.status === "submitting" ? "Updating..." : "Add Live Score"}
              </Button>
            </div>
          </div>

          {leaderboardRows.length ? (
            <div className="mt-6 overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white/82">
              <div className="grid grid-cols-[0.55fr_1.45fr_1fr_0.65fr_0.65fr_0.85fr] gap-3 border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <div>Rank</div>
                <div>Athlete</div>
                <div>Category</div>
                <div>Tops</div>
                <div>Zones</div>
                <div>Score</div>
              </div>
              <AnimatePresence initial={false}>
                {leaderboardRows.map((row) => {
                  const updated = row.climber_id === lastUpdatedClimberId;
                  return (
                    <motion.div
                      layout
                      key={row.climber_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className={cn(
                        "grid grid-cols-[0.55fr_1.45fr_1fr_0.65fr_0.65fr_0.85fr] gap-3 border-b border-slate-100 px-4 py-4 text-sm text-slate-700 last:border-b-0",
                        updated && "bg-emerald-50/90 text-emerald-900",
                      )}
                    >
                      <div className="font-semibold text-slate-950">#{row.category_rank}</div>
                      <div className="min-w-0">
                        <div className="break-words font-semibold text-slate-950">{row.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">#{row.climber_number}</div>
                        {updated ? <div className="mt-1 text-xs font-semibold text-emerald-700">Updated just now</div> : null}
                      </div>
                      <div className="break-words">{row.display_category}</div>
                      <div>{row.topped_count}</div>
                      <div>{row.zone_count}</div>
                      <div>{row.total_score.toFixed(1)}</div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <EmptyState
              eyebrow="No scores yet"
              title="Start judging to see rankings"
              description="Submit a sample score or enable Simulate Live to populate the public leaderboard."
              action={<Button type="button" variant="primary" onClick={onManualScore}>Start Judging</Button>}
            />
          )}
        </section>
      </HighlightBox>

      {showAdvanced ? (
        <section className="results-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="results-kicker">Public routes</div>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Open spectator surfaces</h3>
            </div>
            <RouteLinks demo={activeDemo} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function GuidedSandboxExperience({ demos }: { demos: DemoSummary[] }) {
  const [demoList, setDemoList] = useState<DemoSummary[]>(demos);
  const [activeDemoId, setActiveDemoId] = useState(demos[0]?.id ?? "");
  const [activeStep, setActiveStep] = useState<DemoChecklistStepId>(demos[0] ? "leaderboard" : "create");
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [simulateLive, setSimulateLive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(Boolean(demos[0]));
  const [snapshotError, setSnapshotError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [lastUpdatedClimberId, setLastUpdatedClimberId] = useState<string | null>(null);
  const { role, setRole, roleLabel } = useDemoRole(demos[0] ? "public" : "admin");

  const activeDemo = useMemo(
    () => demoList.find((demo) => demo.id === activeDemoId) ?? demoList[0] ?? null,
    [activeDemoId, demoList],
  );
  const activeDemoIdentifier = activeDemo?.id ?? "";

  const loadSnapshot = useCallback(async (identifier: string, showSkeleton = false) => {
    if (showSkeleton) {
      setSnapshotLoading(true);
    }
    try {
      const nextSnapshot = await getCompetitionSnapshot(identifier);
      setSnapshot(nextSnapshot);
      setSnapshotError("");
    } catch (error) {
      setSnapshotError(error instanceof Error ? error.message : "Unable to load demo competition.");
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  const refreshSnapshot = useCallback(async () => {
    if (!activeDemo) {
      setSnapshot(null);
      setSnapshotLoading(false);
      return;
    }

    await loadSnapshot(activeDemo.id);
  }, [activeDemo, loadSnapshot]);

  const simulation = useDemoSimulation({
    enabled: simulateLive,
    snapshot,
    onRefresh: refreshSnapshot,
    onEvent: (event) => {
      setLastUpdatedClimberId(event.climberId);
      setStatusMessage(
        `Live update: #${event.climberNumber} ${event.climberName} saved B${event.climbNumber} ${formatDemoSimulationResult(event)}.`,
      );
    },
    onError: setActionError,
  });

  useEffect(() => {
    if (!activeDemoIdentifier) {
      setSnapshot(null);
      setSnapshotLoading(false);
      return;
    }

    void loadSnapshot(activeDemoIdentifier, true);
  }, [activeDemoIdentifier, loadSnapshot]);

  const completedSteps = useMemo(() => {
    const completed = new Set<DemoChecklistStepId>();
    if (activeDemo) completed.add("create");
    if ((snapshot?.climbers.length ?? 0) > 0) completed.add("register");
    if (countScoredQualifierCells(snapshot) > 0) completed.add("score");
    if ((snapshot?.qualifierLeaderboard.length ?? 0) > 0 || (snapshot?.finalsLeaderboard.length ?? 0) > 0) {
      completed.add("leaderboard");
    }
    return completed;
  }, [activeDemo, snapshot]);

  const runLoadDemo = useCallback(async () => {
    const actionResult = await loadDemoEventAction();
    if (!actionResult.ok) {
      throw new Error(actionResult.error);
    }

    const seedResult = await seedDemo(actionResult.demo.id);
    const nextDemo: DemoSummary = {
      ...actionResult.demo,
      canSkipToJudge: true,
      canSkipToResults: false,
    };
    setDemoList((current) => upsertDemo(current, nextDemo));
    setActiveDemoId(nextDemo.id);
    setActiveStep("register");
    setRole("admin");
    setLastUpdatedClimberId(null);
    await loadSnapshot(nextDemo.id, true);
    setStatusMessage(
      `${actionResult.created ? "Created" : "Loaded"} ${nextDemo.name} with ${
        seedResult.inserted?.climbers ?? "sample"
      } athletes and live qualifier scores.`,
    );
  }, [loadSnapshot, setRole]);

  const handleLoadDemo = useCallback(() => {
    setBusyAction("load");
    setActionError("");
    setStatusMessage("");
    setSimulateLive(false);
    void runLoadDemo()
      .catch((error) => {
        setActionError(error instanceof Error ? error.message : "Unable to load the demo event.");
      })
      .finally(() => setBusyAction(null));
  }, [runLoadDemo]);

  const handleResetDemo = useCallback(() => {
    setBusyAction("reset");
    setActionError("");
    setStatusMessage("");
    setSimulateLive(false);
    void (async () => {
      if (activeDemo) {
        await deleteDemo(activeDemo.id);
        setDemoList((current) => current.filter((demo) => demo.id !== activeDemo.id));
        setActiveDemoId("");
      }
      await runLoadDemo();
      setActiveStep("create");
      setRole("admin");
      setStatusMessage("Demo reset to a clean seeded state.");
    })()
      .catch((error) => {
        setActionError(error instanceof Error ? error.message : "Unable to reset the demo.");
      })
      .finally(() => setBusyAction(null));
  }, [activeDemo, runLoadDemo, setRole]);

  const handleSelectStep = useCallback((stepId: DemoChecklistStepId) => {
    setActiveStep(stepId);
    setRole(stepRole[stepId]);
    scrollToStep(stepId);
  }, [setRole]);

  const handleRoleChange = useCallback((nextRole: DemoRole) => {
    setRole(nextRole);
    const nextStep = nextRole === "judge" ? "score" : nextRole === "public" ? "leaderboard" : "create";
    setActiveStep(nextStep);
  }, [setRole]);

  const handleSimulateLiveChange = useCallback((nextValue: boolean) => {
    if (nextValue && !snapshot) {
      setActionError("Load a demo event before turning on live simulation.");
      return;
    }

    setActionError("");
    setSimulateLive(nextValue);
    if (nextValue) {
      setRole("public");
      setActiveStep("leaderboard");
    }
  }, [setRole, snapshot]);

  const handleManualScore = useCallback(() => {
    setActionError("");
    setActiveStep(role === "public" ? "leaderboard" : "score");
    void simulation.runOnce();
  }, [role, simulation]);

  const currentViewProps: ViewProps = {
    activeDemo,
    activeStep,
    lastUpdatedClimberId,
    onLoadDemo: handleLoadDemo,
    onManualScore: handleManualScore,
    onResetDemo: handleResetDemo,
    showAdvanced,
    simulation,
    snapshot,
    snapshotError,
    snapshotLoading,
  };

  return (
    <div className="space-y-6">
      <DemoControlBar
        activeDemoName={activeDemo?.name ?? null}
        busyLabel={getBusyLabel(busyAction)}
        role={role}
        simulateLive={simulateLive}
        simulationDisabled={!activeDemo || snapshotLoading}
        showAdvanced={showAdvanced}
        onLoadDemo={handleLoadDemo}
        onResetDemo={handleResetDemo}
        onRoleChange={handleRoleChange}
        onShowAdvancedChange={setShowAdvanced}
        onSimulateLiveChange={handleSimulateLiveChange}
      />

      <section className="results-card">
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <div className="results-kicker">Full Event Workflow</div>
            <h1 className="mt-2 break-words text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Guided Sandbox Experience
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              Load a real demo event, switch roles locally, submit live scores, and watch the public leaderboard
              move without leaving the guided workspace.
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
            <Breadcrumbs roleLabel={roleLabel} />
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="results-chip">{roleLabel}</span>
              <span className="results-chip">
                {simulateLive ? "Simulation running" : "Simulation paused"}
              </span>
              {activeDemo ? <span className="results-chip">{snapshot?.climbers.length ?? 0} athletes</span> : null}
            </div>
          </div>
        </div>
      </section>

      {statusMessage ? <div className="results-alert results-alert-success">{statusMessage}</div> : null}
      {actionError || simulation.error ? (
        <div className="results-alert results-alert-error">{actionError || simulation.error}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <DemoChecklist
          activeStep={activeStep}
          completedSteps={completedSteps}
          onSelectStep={handleSelectStep}
        />

        <div className="min-w-0">
          {role === "admin" ? <AdminSandboxView {...currentViewProps} /> : null}
          {role === "judge" ? <JudgeSandboxView {...currentViewProps} /> : null}
          {role === "public" ? <PublicSandboxView {...currentViewProps} /> : null}
        </div>
      </div>
    </div>
  );
}
