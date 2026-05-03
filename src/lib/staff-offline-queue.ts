"use client";

import localforage from "localforage";

type OfflineQueueBase = {
  id: string;
  clientEventId: string;
  scoredAt: string;
  judgeDeviceId: string | null;
  judgeSessionId: string | null;
  createdAt: string;
  retryCount: number;
  lastTriedAt: string | null;
};

export type OfflineQueueItem =
  | (OfflineQueueBase & {
      type: "qualifier";
      competitionId: string;
      climberId: string;
      climbNumber: number;
      attemptCount: number;
      topped: boolean;
      zone?: boolean;
      attemptsToTop?: number | null;
      attemptsToZone?: number | null;
    })
  | (OfflineQueueBase & {
      type: "finals";
      competitionId: string;
      climberId: string;
      climbNumber: number;
      top: boolean;
      zone: boolean;
      attemptsToTop: number | null;
      attemptsToZone: number | null;
    });

const STORAGE_KEY = "staff_offline_queue";
const DEVICE_ID_KEY = "staff_offline_queue_device_id";
const SESSION_ID_KEY = "staff_offline_queue_session_id";

const queueStore = localforage.createInstance({
  name: "scorecard",
  storeName: "staff_offline_queue",
});

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `generated-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readStoredString(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = await queueStore.getItem<string>(key);
    return typeof value === "string" && value.trim() ? value : null;
  } catch {
    return null;
  }
}

async function writeStoredString(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  await queueStore.setItem(key, value);
}

export async function getJudgeDeviceId() {
  const existing = await readStoredString(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const next = generateId();
  await writeStoredString(DEVICE_ID_KEY, next);
  return next;
}

export async function getJudgeSessionId() {
  const existing = await readStoredString(SESSION_ID_KEY);
  if (existing) {
    return existing;
  }

  const next = generateId();
  await writeStoredString(SESSION_ID_KEY, next);
  return next;
}

export function createClientEventId() {
  return generateId();
}

export async function buildQueueMetadata() {
  const [judgeDeviceId, judgeSessionId] = await Promise.all([getJudgeDeviceId(), getJudgeSessionId()]);
  return {
    clientEventId: createClientEventId(),
    scoredAt: new Date().toISOString(),
    judgeDeviceId,
    judgeSessionId,
  };
}

export async function readOfflineQueue(): Promise<OfflineQueueItem[]> {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = await queueStore.getItem<unknown>(STORAGE_KEY);
    return Array.isArray(raw) ? (raw as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

export async function writeOfflineQueue(items: OfflineQueueItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  await queueStore.setItem(STORAGE_KEY, items);
}

export async function clearOfflineQueueForCompetition(competitionId: string) {
  const queue = await readOfflineQueue();
  await writeOfflineQueue(queue.filter((entry) => entry.competitionId !== competitionId));
}

export async function enqueueOfflineItem(item: OfflineQueueItem) {
  const queue = await readOfflineQueue();
  const deduped = queue.filter(
    (entry) =>
      !(
        entry.type === item.type &&
        entry.competitionId === item.competitionId &&
        entry.climberId === item.climberId &&
        entry.climbNumber === item.climbNumber
      )
  );
  deduped.push(item);
  deduped.sort((left, right) => left.scoredAt.localeCompare(right.scoredAt));
  await writeOfflineQueue(deduped);
}

export async function removeOfflineItem(id: string) {
  await writeOfflineQueue((await readOfflineQueue()).filter((entry) => entry.id !== id));
}

export async function markOfflineItemRetried(id: string) {
  const queue = await readOfflineQueue();
  await writeOfflineQueue(
    queue.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            retryCount: entry.retryCount + 1,
            lastTriedAt: new Date().toISOString(),
          }
        : entry
    )
  );
}
