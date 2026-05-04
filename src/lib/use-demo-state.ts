"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DemoTargetAttemptState } from "@/lib/demo-scenario";

export type DemoStateTarget = {
  climberId: string | null;
  climberNumber: string;
  name: string | null;
  climbNumber: number;
  roundName: string;
  before: string;
  after: string;
  attempt: DemoTargetAttemptState;
  seeded: boolean;
  corrected: boolean;
};

export type DemoStateProgress = {
  eventReady: boolean;
  dataPopulated: boolean;
  keyScoreCorrected: boolean;
  organizerAdvanced: boolean;
  publicReady: boolean;
};

export type DemoStateCounts = {
  climbers: number;
  attempts: number;
  finalists: number;
  finalAttempts: number;
};

export type DemoStatePayload = {
  ok: boolean;
  competition?: { id: string; slug: string };
  progress?: DemoStateProgress;
  target?: DemoStateTarget;
  counts?: DemoStateCounts;
  error?: string;
};

export type UseDemoStateOptions = {
  pollMs?: number;
};

export type UseDemoStateResult = {
  state: DemoStatePayload | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useDemoState(
  competitionId: string | null | undefined,
  options: UseDemoStateOptions = {}
): UseDemoStateResult {
  const [state, setState] = useState<DemoStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const pollMs = options.pollMs ?? 0;

  const refetch = useCallback(async () => {
    if (!competitionId) {
      setState(null);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/demo/state?competitionId=${encodeURIComponent(competitionId)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as DemoStatePayload;

      if (!mountedRef.current) {
        return;
      }

      if (payload.ok) {
        setState(payload);
        setError(null);
      } else {
        setError(payload.error ?? "Failed to load demo state.");
      }
    } catch {
      if (mountedRef.current) {
        setError("Network error loading demo state.");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [competitionId]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void refetch();

    if (pollMs > 0) {
      intervalRef.current = setInterval(() => void refetch(), pollMs);
    }

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [pollMs, refetch]);

  return { state, loading, error, refetch };
}
