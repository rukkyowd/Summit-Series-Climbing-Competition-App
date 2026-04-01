"use client";

export type OfflineQueueItem =
  | {
      id: string;
      type: "qualifier";
      competitionId: string;
      climberId: string;
      climbNumber: number;
      attemptCount: number;
      topped: boolean;
      createdAt: string;
    }
  | {
      id: string;
      type: "finals";
      competitionId: string;
      climberId: string;
      climbNumber: number;
      top: boolean;
      zone: boolean;
      attemptsToTop: number | null;
      attemptsToZone: number | null;
      createdAt: string;
    };

const STORAGE_KEY = "staff_offline_queue";

export function readOfflineQueue(): OfflineQueueItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

export function writeOfflineQueue(items: OfflineQueueItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function enqueueOfflineItem(item: OfflineQueueItem) {
  const queue = readOfflineQueue();
  const deduped = queue.filter((entry) => !(entry.type === item.type && entry.competitionId === item.competitionId && entry.climberId === item.climberId && entry.climbNumber === item.climbNumber));
  deduped.push(item);
  writeOfflineQueue(deduped);
}

export function removeOfflineItem(id: string) {
  writeOfflineQueue(readOfflineQueue().filter((entry) => entry.id !== id));
}
