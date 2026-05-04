"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DemoLoadingOverlay, useDemoNavigation } from "@/components/demo-loading-overlay";
import { buttonStyles } from "@/components/ui/button";

type DemoSummary = {
  id: string;
  slug: string;
  name: string;
  created_at: string | null;
  canSkipToJudge: boolean;
  canSkipToResults: boolean;
};

type DemoCompleteResponse = {
  ok?: boolean;
  error?: string;
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

export function DemoEntry({ demos }: { demos: DemoSummary[] }) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [deletingDemoId, setDeletingDemoId] = useState<string | null>(null);
  const [deletedDemoIds, setDeletedDemoIds] = useState<Set<string>>(() => new Set());
  const router = useRouter();
  const { loadingCopy, navigateWithDemoLoading } = useDemoNavigation();
  const navigationPending = Boolean(loadingCopy);
  const actionPending = navigationPending || deletingDemoId !== null;
  const visibleDemos = demos.filter((demo) => !deletedDemoIds.has(demo.id));
  const latestDemo = visibleDemos[0] ?? null;

  function startFullDemo() {
    setError("");
    setStatus("");
    void navigateWithDemoLoading("/staff/new?demo=act1");
  }

  function skipToJudge() {
    if (!latestDemo?.canSkipToJudge) {
      setError("Finish setup and seed the demo before skipping to the judge panel.");
      return;
    }

    setError("");
    setStatus("");
    void navigateWithDemoLoading(`/staff/c/${latestDemo.slug}/judge?demo=act2`);
  }

  function skipToResults() {
    if (!latestDemo?.canSkipToResults) {
      setError("Advance finalists before skipping to the public results page.");
      return;
    }

    setError("");
    setStatus("");
    void navigateWithDemoLoading(`/c/${latestDemo.slug}?demo=act4`);
  }

  function openDemoJudge(demo: DemoSummary) {
    if (!demo.canSkipToJudge) {
      setError("Finish setup and add seeded scores before opening this judge panel.");
      return;
    }

    setError("");
    setStatus("");
    void navigateWithDemoLoading(`/staff/c/${demo.slug}/judge?demo=act2`);
  }

  function openDemoResults(demo: DemoSummary) {
    if (!demo.canSkipToResults) {
      setError("Advance finalists and add finals scores before opening these public results.");
      return;
    }

    setError("");
    setStatus("");
    void navigateWithDemoLoading(`/c/${demo.slug}?demo=act4`);
  }

  async function deleteDemo(demo: DemoSummary) {
    if (!window.confirm(`Delete "${demo.name}" and all of its demo climbers, scores, and results?`)) {
      return;
    }

    setError("");
    setStatus("");
    setDeletingDemoId(demo.id);

    try {
      const response = await fetch("/api/demo/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionId: demo.id }),
      });
      const payload = (await response.json().catch(() => null)) as DemoCompleteResponse | null;

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error ?? "Unable to delete this demo.");
      }

      setDeletedDemoIds((current) => {
        const next = new Set(current);
        next.add(demo.id);
        return next;
      });
      setStatus(`Deleted ${demo.name}.`);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete this demo.");
    } finally {
      setDeletingDemoId(null);
    }
  }

  return (
    <section className="results-card">
      <div className="max-w-3xl">
        <div className="results-kicker">Guided walkthrough</div>
        <h1 className="mt-2 break-words text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Summit Series Demo
        </h1>
        <div className="mt-5 text-base leading-7 text-slate-700">
          <div>Run a full climbing competition:</div>
          <ul className="mt-3 space-y-1">
            <li>Create an event</li>
            <li>Score athletes as a judge</li>
            <li>Advance finalists</li>
            <li>View public results</li>
          </ul>
        </div>
      </div>

      {latestDemo ? (
        <div className="mt-6 rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Latest demo event: <span className="font-semibold text-slate-950">{latestDemo.name}</span>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-[1.1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {error}
        </div>
      ) : null}
      {status ? (
        <div className="mt-4 rounded-[1.1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {status}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={startFullDemo}
          disabled={actionPending}
          className={buttonStyles({ variant: "primary" })}
        >
          Start Full Demo
        </button>
        <button
          type="button"
          onClick={skipToJudge}
          disabled={actionPending || !latestDemo?.canSkipToJudge}
          className={buttonStyles({ variant: "secondary" })}
        >
          Skip to Judge
        </button>
        <button
          type="button"
          onClick={skipToResults}
          disabled={actionPending || !latestDemo?.canSkipToResults}
          className={buttonStyles({ variant: "secondary" })}
        >
          Skip to Results
        </button>
      </div>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Saved demo events</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Clean up old walkthrough events here. Only demo events can be deleted from this page.
            </p>
          </div>
          <div className="text-sm font-semibold text-slate-500">
            {visibleDemos.length} active {visibleDemos.length === 1 ? "demo" : "demos"}
          </div>
        </div>

        {visibleDemos.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white/70">
            {visibleDemos.map((demo) => (
              <div
                key={demo.id}
                className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 last:border-b-0 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="break-words text-base font-semibold text-slate-950">{demo.name}</div>
                    {demo.id === latestDemo?.id ? (
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-sky-700">
                        Latest
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                    <span>{demo.slug}</span>
                    <span>{formatCreatedDate(demo.created_at)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={
                        demo.canSkipToJudge
                          ? "rounded-full bg-emerald-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-700"
                          : "rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
                      }
                    >
                      {demo.canSkipToJudge ? "Judge ready" : "Setup needed"}
                    </span>
                    <span
                      className={
                        demo.canSkipToResults
                          ? "rounded-full bg-emerald-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-700"
                          : "rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500"
                      }
                    >
                      {demo.canSkipToResults ? "Results ready" : "Results pending"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openDemoJudge(demo)}
                    disabled={actionPending || !demo.canSkipToJudge}
                    className={buttonStyles({ variant: "ghost", size: "sm" })}
                  >
                    Open Judge
                  </button>
                  <button
                    type="button"
                    onClick={() => openDemoResults(demo)}
                    disabled={actionPending || !demo.canSkipToResults}
                    className={buttonStyles({ variant: "ghost", size: "sm" })}
                  >
                    View Results
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteDemo(demo)}
                    disabled={actionPending}
                    className={buttonStyles({ variant: "danger", size: "sm" })}
                  >
                    {deletingDemoId === demo.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            No saved demo events yet.
          </div>
        )}
      </div>

      <DemoLoadingOverlay
        active={Boolean(loadingCopy)}
        title={loadingCopy?.title ?? "Opening next step..."}
        text={loadingCopy?.text ?? "Bringing the next demo screen into view."}
      />
    </section>
  );
}
