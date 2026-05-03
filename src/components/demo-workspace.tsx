"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { clearOfflineQueueForCompetition } from "@/lib/staff-offline-queue";

type DemoCompetition = {
  id: string;
  slug: string;
  name: string;
  created_at: string | null;
};

type DemoSeedResponse = {
  ok?: boolean;
  judgeUrl?: string;
  publicUrl?: string;
  leaderboardUrl?: string;
  error?: string;
  target?: {
    name: string;
    climberNumber: string;
    climbNumber: number;
    before: string;
    after: string;
  };
};

type DemoStateResponse = {
  ok?: boolean;
  progress?: {
    eventReady: boolean;
    dataPopulated: boolean;
    keyScoreCorrected: boolean;
    organizerAdvanced: boolean;
  };
  target?: {
    seeded: boolean;
    corrected: boolean;
  };
};

async function seedDemo(competitionId: string) {
  const response = await fetch("/api/demo/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ competitionId }),
  });
  const payload = (await response.json().catch(() => null)) as DemoSeedResponse | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "Unable to prepare demo scenario.");
  }

  return payload;
}

async function completeDemo(competitionId: string) {
  const response = await fetch("/api/demo/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ competitionId }),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Unable to delete demo.");
  }
}

export function DemoWorkspace({ demos }: { demos: DemoCompetition[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [demoStates, setDemoStates] = useState<Record<string, DemoStateResponse>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadStates() {
      const entries = await Promise.all(
        demos.map(async (demo) => {
          const response = await fetch(`/api/demo/state?competitionId=${encodeURIComponent(demo.id)}`, {
            cache: "no-store",
          });
          const payload = (await response.json().catch(() => null)) as DemoStateResponse | null;
          return [demo.id, payload?.ok ? payload : {}] as const;
        })
      );

      if (!cancelled) {
        setDemoStates(Object.fromEntries(entries));
      }
    }

    void loadStates();

    return () => {
      cancelled = true;
    };
  }, [demos]);

  function runWithFeedback(action: () => Promise<void>) {
    setMessage("");
    setError("");
    startTransition(() => {
      void action().catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Unable to update the demo.");
      });
    });
  }

  const latestDemo = demos[0] ?? null;

  return (
    <div className="space-y-6">
      <Surface variant="card" className="space-y-6">
        <div className="space-y-3">
          <div className="results-kicker text-sky-700">Scorecard demo workspace</div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
            Run the real app with a guided overlay.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-600">
            Create a real demo competition, seed a field with one intentional scoring mistake,
            correct Maya Chen on the real judge panel, advance finalists, then finish the demo to
            delete the sample event.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["1. Organizer", "Create the demo event through the normal staff form."],
            ["2. Judge", "Correct #104 Maya Chen on B3 from Top in 3 to Top in 1."],
            ["3. Organizer", "Use the staff controls to lock qualifiers and advance finalists."],
            ["4. Public", "View the public event, then finish and delete the demo."],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-[1.25rem] border border-slate-200 bg-white/80 p-4">
              <div className="text-sm font-semibold text-slate-950">{title}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="primary" onClick={() => router.push("/staff/new?demo=act1")}>
            Start Demo
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!latestDemo || isPending}
            onClick={() =>
              latestDemo &&
              runWithFeedback(async () => {
                const payload = await seedDemo(latestDemo.id);
                router.push(payload.judgeUrl ?? `/staff/c/${latestDemo.slug}/judge?demo=1`);
              })
            }
          >
            Skip to Judge
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!latestDemo}
            onClick={() => latestDemo && router.push(`/c/${latestDemo.slug}?demo=1`)}
          >
            Skip to Public
          </Button>
        </div>

        {!latestDemo ? (
          <p className="text-sm leading-6 text-slate-500">
            Start Demo creates the first demo competition. Skip links activate after a demo event exists.
          </p>
        ) : null}
        {message ? <div className="results-alert results-alert-success">{message}</div> : null}
        {error ? <div className="results-alert results-alert-error">{error}</div> : null}
      </Surface>

      <Surface variant="card" className="space-y-4">
        <div>
          <div className="results-kicker">Active demo events</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Demo workspace only</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Demo competitions are hidden from the main homepage and normal staff lists. Finish a demo
            when you are done to delete the sample event and all seeded climbers/scores.
          </p>
        </div>

        {demos.length ? (
          <div className="grid gap-3">
            {demos.map((demo) => (
              <div key={demo.id} className="rounded-[1.25rem] border border-slate-200 bg-white/80 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">{demo.name}</div>
                    <div className="mt-1 text-sm text-slate-500">/{demo.slug}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="results-chip">
                        {demoStates[demo.id]?.progress?.dataPopulated ? "Seeded" : "Needs seed"}
                      </span>
                      <span className="results-chip">
                        {demoStates[demo.id]?.progress?.keyScoreCorrected ? "Maya corrected" : "Maya Top in 3"}
                      </span>
                      <span className="results-chip">
                        {demoStates[demo.id]?.progress?.organizerAdvanced ? "Finals started" : "Organizer pending"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isPending}
                      onClick={() =>
                        runWithFeedback(async () => {
                          const payload = await seedDemo(demo.id);
                          setMessage(
                            payload.target
                              ? `Scenario reset: #${payload.target.climberNumber} ${payload.target.name} B${payload.target.climbNumber} is back to ${payload.target.before}.`
                              : "Scenario reset."
                          );
                          router.refresh();
                        })
                      }
                    >
                      Restart Scenario
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={isPending}
                      onClick={() =>
                        runWithFeedback(async () => {
                          const payload = await seedDemo(demo.id);
                          router.push(payload.judgeUrl ?? `/staff/c/${demo.slug}/judge?demo=1`);
                        })
                      }
                    >
                      Open Judge Demo
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => router.push(`/staff/c/${demo.slug}?demo=1`)}>
                      Organizer Demo
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => router.push(`/c/${demo.slug}?demo=1`)}>
                      Public Demo
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={isPending}
                      onClick={() =>
                        runWithFeedback(async () => {
                          await completeDemo(demo.id);
                          await clearOfflineQueueForCompetition(demo.id);
                          setMessage("Demo deleted.");
                          router.refresh();
                        })
                      }
                    >
                      Delete Demo
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            No active demo events yet.
          </div>
        )}
      </Surface>
    </div>
  );
}
