"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { submitDemoSimulationScoreAction } from "@/app/demo/actions";
import { updateQualifierAttemptByToken, type CompetitionSnapshot } from "@/lib/db";
import {
  buildDemoSimulationScore,
  getDemoSimulationDelayMs,
  type DemoSimulationEvent,
  type DemoSimulationScore,
} from "@/components/demo/DemoSimulation";

type SubmitResult = {
  mode: DemoSimulationEvent["mode"];
  score: DemoSimulationScore;
};

export type DemoSimulationStatus = "idle" | "waiting" | "submitting" | "error";

export type UseDemoSimulationOptions = {
  enabled: boolean;
  snapshot: CompetitionSnapshot | null;
  onRefresh?: () => Promise<void>;
  onEvent?: (event: DemoSimulationEvent) => void;
  onError?: (message: string) => void;
};

function createClientEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `demo-sim-${crypto.randomUUID()}`;
  }

  return `demo-sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function submitStaffScore(score: DemoSimulationScore) {
  const response = await fetch("/api/staff/scores/qualifier", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      competitionId: score.competitionId,
      climberId: score.climberId,
      climbNumber: score.climbNumber,
      attemptCount: score.attemptCount,
      topped: score.topped,
      zone: score.zone,
      attemptsToTop: score.attemptsToTop,
      attemptsToZone: score.attemptsToZone,
      clientEventId: createClientEventId(),
      scoredAt: new Date().toISOString(),
      judgeDeviceId: "guided-demo-sandbox",
      judgeSessionId: "guided-demo-live-sim",
    }),
  });

  if (response.ok) {
    return;
  }

  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  const message = typeof payload?.error === "string" ? payload.error : "Unable to submit a simulated score.";
  const error = new Error(message) as Error & { status?: number };
  error.status = response.status;
  throw error;
}

async function submitDemoScore(score: DemoSimulationScore): Promise<SubmitResult> {
  try {
    await submitStaffScore(score);
    return { mode: "staff", score };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 401 && status !== 403) {
      throw error;
    }

    if (score.accessToken) {
      try {
        await updateQualifierAttemptByToken(
          score.accessToken,
          score.competitionId,
          score.climbNumber,
          score.attemptCount,
          score.topped
        );

        return {
          mode: "climber-scorecard",
          score: {
            ...score,
            zone: score.topped,
            attemptsToZone: score.topped ? score.attemptsToTop : null,
          },
        };
      } catch {
        // Judge-scored demo formats intentionally block private scorecard writes.
      }
    }

    const result = await submitDemoSimulationScoreAction({
      competitionId: score.competitionId,
      climberId: score.climberId,
      climbNumber: score.climbNumber,
      attemptCount: score.attemptCount,
      topped: score.topped,
      zone: score.zone,
      attemptsToTop: score.attemptsToTop,
      attemptsToZone: score.attemptsToZone,
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    return { mode: "demo-service-role", score };
  }
}

export function useDemoSimulation({
  enabled,
  snapshot,
  onRefresh,
  onEvent,
  onError,
}: UseDemoSimulationOptions) {
  const [status, setStatus] = useState<DemoSimulationStatus>("idle");
  const [error, setError] = useState("");
  const [lastEvent, setLastEvent] = useState<DemoSimulationEvent | null>(null);
  const runningRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const runOnce = useCallback(async () => {
    if (runningRef.current) {
      return null;
    }

    if (!snapshot) {
      const message = "Load a demo event before simulating live scores.";
      setError(message);
      setStatus("error");
      onError?.(message);
      return null;
    }

    const nextScore = buildDemoSimulationScore(snapshot);
    if (!nextScore) {
      const message = "No demo athletes are available for simulation yet.";
      setError(message);
      setStatus("error");
      onError?.(message);
      return null;
    }

    runningRef.current = true;
    setStatus("submitting");
    setError("");

    try {
      const submitted = await submitDemoScore(nextScore);
      const event: DemoSimulationEvent = {
        ...submitted.score,
        mode: submitted.mode,
        submittedAt: Date.now(),
      };
      setLastEvent(event);
      onEvent?.(event);
      await onRefresh?.();
      setStatus(enabled ? "waiting" : "idle");
      return event;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Unable to submit a simulated score.";
      setError(message);
      setStatus("error");
      onError?.(message);
      return null;
    } finally {
      runningRef.current = false;
    }
  }, [enabled, onError, onEvent, onRefresh, snapshot]);

  useEffect(() => {
    clearTimer();

    if (!enabled) {
      setStatus((current) => (current === "submitting" ? current : "idle"));
      return;
    }

    let cancelled = false;
    setStatus("waiting");

    const scheduleNext = () => {
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        if (cancelled) {
          return;
        }
        void runOnce().finally(() => {
          if (!cancelled) {
            scheduleNext();
          }
        });
      }, getDemoSimulationDelayMs());
    };

    scheduleNext();

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [clearTimer, enabled, runOnce]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    error,
    lastEvent,
    runOnce,
    status,
  };
}
