"use client";

import { useEffect, useRef, useState } from "react";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";
import { getChangedDemoClimberId, type RealtimeScorePayload } from "@/lib/demo-judge-split";
import { publicSupabase, supabaseConfigured } from "@/lib/supabase";

type DemoJudgeSplitPanelProps = {
  competitionId: string;
  competitionSlug: string;
  initialSnapshot: CompetitionSnapshot;
};

export function DemoJudgeSplitPanel({
  competitionId,
  competitionSlug,
  initialSnapshot,
}: DemoJudgeSplitPanelProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [flashedClimberIds, setFlashedClimberIds] = useState<Set<string>>(() => new Set());
  const flashTimersRef = useRef<Record<string, number>>({});
  const finalsCutoff = snapshot.competition.finals_cutoff ?? 6;

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    const timers = flashTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      return;
    }

    let cancelled = false;
    const flashClimber = (climberId: string) => {
      window.clearTimeout(flashTimersRef.current[climberId]);
      setFlashedClimberIds((current) => {
        const next = new Set(current);
        next.add(climberId);
        return next;
      });
      flashTimersRef.current[climberId] = window.setTimeout(() => {
        setFlashedClimberIds((current) => {
          const next = new Set(current);
          next.delete(climberId);
          return next;
        });
        delete flashTimersRef.current[climberId];
      }, 1800);
    };

    const refreshLeaderboard = async (payload: RealtimeScorePayload) => {
      const changedClimberId = getChangedDemoClimberId(payload);
      const refreshed = await getCompetitionSnapshot(competitionSlug).catch(() => null);
      if (cancelled || !refreshed) {
        return;
      }

      setSnapshot(refreshed);
      if (changedClimberId) {
        flashClimber(changedClimberId);
      }
    };

    const channel = publicSupabase
      .channel(`demo-judge-leaderboard-${competitionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "qualifier_attempts", filter: `competition_id=eq.${competitionId}` },
        (payload) => {
          void refreshLeaderboard(payload);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      publicSupabase.removeChannel(channel);
    };
  }, [competitionId, competitionSlug]);

  return (
    <div className="sticky top-6 space-y-3 rounded-[1.5rem] border border-sky-200 bg-white/95 p-4 shadow-[0_22px_60px_rgba(15,23,42,0.14)]">
      <div>
        <div className="results-kicker text-sky-700">Live leaderboard</div>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">Watch the cut line move</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          This panel refreshes when the judge save writes to qualifier attempts.
        </p>
      </div>

      <div className="space-y-2">
        {snapshot.qualifierLeaderboard.map((entry) => {
          const isFinalsCut = entry.category_rank <= finalsCutoff;
          const isFlashing = flashedClimberIds.has(entry.climber_id);
          return (
            <div
              key={entry.climber_id}
              className={[
                "flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition-colors duration-700",
                isFlashing
                  ? "border-sky-300 bg-sky-100"
                  : isFinalsCut
                    ? "border-slate-200 bg-white"
                    : "border-transparent bg-slate-50/80",
              ].join(" ")}
            >
              <div
                className={[
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  isFinalsCut ? "bg-sky-600 text-white" : "bg-slate-200 text-slate-500",
                ].join(" ")}
              >
                {entry.category_rank}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-950">{entry.name}</div>
                <div className="truncate text-xs text-slate-500">{entry.display_category}</div>
              </div>
              <div className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                {entry.topped_count}T {entry.zone_count}Z
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-dashed border-slate-300 pt-3 text-xs leading-5 text-slate-500">
        Cut line: top {finalsCutoff} in each finals-eligible category advance.
      </div>
    </div>
  );
}
