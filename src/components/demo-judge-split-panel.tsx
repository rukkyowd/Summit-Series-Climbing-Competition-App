"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompetitionSnapshot } from "@/lib/db";
import {
  DEMO_TARGET_CLIMBER_NAME,
  DEMO_TARGET_CLIMBER_NUMBER,
  isDemoTargetCorrected,
} from "@/lib/demo-scenario";
import { cn } from "@/lib/cn";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";
import { filterAttemptsForRound, getActiveQualifierStyleRound } from "@/lib/scoring";

type DemoJudgeSplitPanelProps = {
  competitionId: string;
  competitionSlug: string;
  initialSnapshot: CompetitionSnapshot;
};

type SnapshotResponse = {
  snapshot?: CompetitionSnapshot;
  error?: unknown;
};

async function fetchStaffSnapshot(identifier: string) {
  const response = await fetch(`/api/staff/competitions/snapshot?identifier=${encodeURIComponent(identifier)}`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as SnapshotResponse | null;

  if (!response.ok || !payload?.snapshot) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to refresh demo leaderboard.");
  }

  return payload.snapshot;
}

function findDemoTarget(snapshot: CompetitionSnapshot) {
  return snapshot.climbers.find(
    (climber) =>
      climber.climber_number === DEMO_TARGET_CLIMBER_NUMBER ||
      climber.name.toLowerCase() === DEMO_TARGET_CLIMBER_NAME.toLowerCase()
  );
}

export function DemoJudgeSplitPanel({
  competitionId,
  competitionSlug,
  initialSnapshot,
}: DemoJudgeSplitPanelProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [flashingClimberIds, setFlashingClimberIds] = useState<Set<string>>(() => new Set());
  const previousTargetCorrectedRef = useRef(false);

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  const flashClimber = useCallback((climberId: string | null | undefined) => {
    if (!climberId) {
      return;
    }

    setFlashingClimberIds((current) => {
      const next = new Set(current);
      next.add(climberId);
      return next;
    });
    window.setTimeout(() => {
      setFlashingClimberIds((current) => {
        const next = new Set(current);
        next.delete(climberId);
        return next;
      });
    }, 1800);
  }, []);

  useEffect(() => {
    const target = findDemoTarget(initialSnapshot);
    const activeQualifierRoundId =
      initialSnapshot.activeQualifierRound?.id ??
      getActiveQualifierStyleRound(initialSnapshot.competition)?.id ??
      null;
    const targetAttempt =
      target && activeQualifierRoundId
        ? filterAttemptsForRound(target.qualifier_attempts, activeQualifierRoundId).find((attempt) => attempt.climb_number === 3) ?? null
        : null;
    const corrected = isDemoTargetCorrected(targetAttempt);

    if (corrected && !previousTargetCorrectedRef.current) {
      flashClimber(target?.id);
    }
    previousTargetCorrectedRef.current = corrected;
  }, [flashClimber, initialSnapshot]);

  useEffect(() => {
    if (!supabaseConfigured) {
      return;
    }

    const refreshLeaderboard = async (changedClimberId?: string | null) => {
      try {
        const refreshed = await fetchStaffSnapshot(competitionSlug);
        setSnapshot(refreshed);
        flashClimber(changedClimberId);
      } catch {
        // The parent judge page owns visible load/save errors; this panel stays non-blocking.
      }
    };

    const channel = publicSupabase
      .channel(`demo-judge-leaderboard-${competitionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "qualifier_attempts", filter: `competition_id=eq.${competitionId}` },
        (payload: { new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => {
          const changedClimberId =
            (typeof payload.new?.climber_id === "string" ? payload.new.climber_id : null) ??
            (typeof payload.old?.climber_id === "string" ? payload.old.climber_id : null);
          void refreshLeaderboard(changedClimberId);
        }
      )
      .subscribe();

    return () => {
      publicSupabase.removeChannel(channel);
    };
  }, [competitionId, competitionSlug, flashClimber]);

  const targetClimber = findDemoTarget(snapshot);
  const targetEntry = snapshot.qualifierLeaderboard.find((row) => row.climber_id === targetClimber?.id);
  const targetCategory = targetEntry?.display_category ?? targetClimber?.display_category ?? "";
  const finalsCutoff = snapshot.competition.finals_cutoff ?? 6;
  const leaderboardRows = useMemo(() => {
    const categoryRows = targetCategory
      ? snapshot.qualifierLeaderboard.filter((row) => row.display_category === targetCategory)
      : snapshot.qualifierLeaderboard;
    return categoryRows.slice(0, Math.max(finalsCutoff + 2, 8));
  }, [finalsCutoff, snapshot.qualifierLeaderboard, targetCategory]);

  return (
    <aside
      className="rounded-[1.6rem] border border-sky-100 bg-white/92 p-4 shadow-[0_18px_44px_rgba(14,116,215,0.12)] xl:sticky xl:top-24"
      data-demo-anchor="judge-leaderboard-split"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="results-kicker text-sky-700">Live leaderboard</div>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Maya&apos;s cut-line impact</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Save Maya&apos;s B3 correction and watch this ranking panel update without leaving the judge screen.
          </p>
        </div>
        <span className="results-chip">Top {finalsCutoff}</span>
      </div>

      {targetEntry ? (
        <div className="mt-4 rounded-[1rem] border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          <span className="font-semibold">Target now: </span>
          #{targetEntry.category_rank} in {targetEntry.display_category}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {leaderboardRows.map((row) => {
          const isTarget = row.climber_id === targetClimber?.id;
          const isFinalist = row.category_rank <= finalsCutoff;
          const flashing = flashingClimberIds.has(row.climber_id);

          return (
            <div
              key={row.climber_id}
              className={cn(
                "rounded-[1rem] border px-3 py-2 text-sm transition",
                flashing && "demo-leaderboard-row-update",
                isTarget
                  ? "border-sky-300 bg-sky-50 shadow-[0_14px_30px_rgba(14,116,215,0.12)]"
                  : isFinalist
                    ? "border-emerald-200 bg-emerald-50/80"
                    : "border-slate-200 bg-slate-50/80"
              )}
              data-demo-anchor={isTarget ? "judge-leaderboard-maya-row" : undefined}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    isFinalist ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                  )}
                >
                  {row.category_rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-950">
                    {row.name} <span className="font-normal text-slate-500">#{row.climber_number}</span>
                  </div>
                  <div className="truncate text-xs text-slate-500">{row.display_category}</div>
                </div>
                <div className="shrink-0 text-right text-xs font-semibold text-slate-600">
                  <div>{row.topped_count}T / {row.zone_count}Z</div>
                  <div>{row.total_score.toFixed(1)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-dashed border-slate-200 pt-3 text-xs leading-5 text-slate-500">
        The cut line is Top {finalsCutoff}. Rows above the line stay green; Maya flashes when the saved score changes.
      </div>
    </aside>
  );
}
