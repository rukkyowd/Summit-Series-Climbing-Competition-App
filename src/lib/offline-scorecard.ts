import type { ClimbAttempt, ClimbNumber, ClimberWithAttempts } from "./scoring";

export interface AttemptSnapshot {
  exists: boolean;
  failedAttempts: number;
  completed: boolean;
  completionTimeSeconds: number | null;
  startedAtIso?: string;
  completedAtIso?: string | null;
}

export type QueueAction =
  | {
      id: string;
      kind: "start";
      climberId: string;
      climbNumber: ClimbNumber;
      startedAtIso: string;
      createdAtIso: string;
      expectedState?: AttemptSnapshot;
    }
  | {
      id: string;
      kind: "add-fail" | "undo-fail" | "reset";
      climberId: string;
      climbNumber: ClimbNumber;
      createdAtIso: string;
      expectedState?: AttemptSnapshot;
    }
  | {
      id: string;
      kind: "complete";
      climberId: string;
      climbNumber: ClimbNumber;
      completionTimeSeconds: number;
      startedAtIso?: string;
      createdAtIso: string;
      expectedState?: AttemptSnapshot;
    };

const OFFLINE_QUEUE_KEY = "scorecard-offline-queue";

export function buildQueueActionId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function readOfflineQueue(): QueueAction[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as QueueAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.removeItem(OFFLINE_QUEUE_KEY);
    return [];
  }
}

export function writeOfflineQueue(queue: QueueAction[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function readActiveTimers(climberId: string): Record<number, string> {
  if (typeof window === "undefined") return {};

  const raw = window.localStorage.getItem(`scorecard-active-timers:${climberId}`);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<number, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    window.localStorage.removeItem(`scorecard-active-timers:${climberId}`);
    return {};
  }
}

export function writeActiveTimers(climberId: string, timers: Record<number, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`scorecard-active-timers:${climberId}`, JSON.stringify(timers));
}

function buildAttempt(climberId: string, climbNumber: ClimbNumber, startedAtIso?: string): ClimbAttempt {
  return {
    climber_id: climberId,
    climb_number: climbNumber,
    failed_attempts: 0,
    completed: false,
    completion_time_seconds: null,
    started_at: startedAtIso,
    completed_at: null,
  };
}

export function captureAttemptSnapshot(attempt?: ClimbAttempt | null): AttemptSnapshot {
  if (!attempt) {
    return {
      exists: false,
      failedAttempts: 0,
      completed: false,
      completionTimeSeconds: null,
    };
  }

  return {
    exists: true,
    failedAttempts: attempt.failed_attempts,
    completed: attempt.completed,
    completionTimeSeconds: attempt.completion_time_seconds,
    startedAtIso: attempt.started_at,
    completedAtIso: attempt.completed_at,
  };
}

export function hasAttemptConflict(
  expectedState: AttemptSnapshot,
  attempt?: ClimbAttempt | null
): boolean {
  if (!expectedState.exists) {
    return Boolean(
      attempt &&
        (attempt.failed_attempts > 0 ||
          attempt.completed ||
          attempt.completion_time_seconds != null ||
          attempt.completed_at)
    );
  }

  if (!attempt) {
    return true;
  }

  return (
    expectedState.failedAttempts !== attempt.failed_attempts ||
    expectedState.completed !== attempt.completed ||
    expectedState.completionTimeSeconds !== attempt.completion_time_seconds ||
    expectedState.startedAtIso !== attempt.started_at ||
    (expectedState.completedAtIso ?? null) !== (attempt.completed_at ?? null)
  );
}

export function applyOptimisticQueueAction(
  climber: ClimberWithAttempts,
  action: QueueAction
): ClimberWithAttempts {
  const attempts = [...climber.climb_attempts];
  const index = attempts.findIndex((attempt) => attempt.climb_number === action.climbNumber);
  const currentAttempt =
    index >= 0 ? { ...attempts[index] } : buildAttempt(climber.id, action.climbNumber);

  switch (action.kind) {
    case "start": {
      currentAttempt.started_at = action.startedAtIso;
      currentAttempt.completed = false;
      currentAttempt.completed_at = null;
      currentAttempt.completion_time_seconds = null;
      break;
    }
    case "add-fail": {
      if (!currentAttempt.completed) {
        currentAttempt.failed_attempts += 1;
      }
      break;
    }
    case "undo-fail": {
      if (!currentAttempt.completed) {
        currentAttempt.failed_attempts = Math.max(0, currentAttempt.failed_attempts - 1);
      }
      break;
    }
    case "complete": {
      currentAttempt.completed = true;
      currentAttempt.completion_time_seconds = action.completionTimeSeconds;
      currentAttempt.started_at = action.startedAtIso ?? currentAttempt.started_at;
      currentAttempt.completed_at = new Date().toISOString();
      break;
    }
    case "reset": {
      currentAttempt.completed = false;
      currentAttempt.failed_attempts = 0;
      currentAttempt.completion_time_seconds = null;
      currentAttempt.started_at = new Date().toISOString();
      currentAttempt.completed_at = null;
      break;
    }
  }

  if (index >= 0) {
    attempts[index] = currentAttempt;
  } else {
    attempts.push(currentAttempt);
  }

  attempts.sort((left, right) => left.climb_number - right.climb_number);

  return {
    ...climber,
    climb_attempts: attempts,
  };
}

export function isNetworkLikeError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("offline")
  );
}
