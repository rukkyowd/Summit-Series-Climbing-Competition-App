"use client";

export const SCORECARD_ACCESS_TOKEN_KEY = "scorecard_access_token";
export const SCORECARD_ACCESS_TOKEN_PREFIX = "scorecard_access_";

export interface SavedScorecardAccess {
  token: string;
  competitionSlug: string;
}

function getSessionStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

function getLegacyStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function buildScorecardAccessKey(competitionSlug: string) {
  return `${SCORECARD_ACCESS_TOKEN_PREFIX}${competitionSlug}`;
}

function parseSavedScorecardAccess(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SavedScorecardAccess>;
    if (typeof parsed.token !== "string" || typeof parsed.competitionSlug !== "string") {
      return null;
    }

    return {
      token: parsed.token,
      competitionSlug: parsed.competitionSlug,
    };
  } catch {
    return null;
  }
}

export function saveScorecardAccessToken(token: string, competitionSlug?: string) {
  const normalizedToken = token.trim();
  const normalizedSlug = competitionSlug?.trim() ?? "";
  const storage = getSessionStorage();
  if (!storage || !normalizedToken || !normalizedSlug) {
    return;
  }

  const payload: SavedScorecardAccess = {
    token: normalizedToken,
    competitionSlug: normalizedSlug,
  };

  storage.setItem(buildScorecardAccessKey(normalizedSlug), JSON.stringify(payload));
  getLegacyStorage()?.removeItem(SCORECARD_ACCESS_TOKEN_KEY);
}

export function readScorecardAccess(competitionSlug?: string) {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }

  const normalizedSlug = competitionSlug?.trim() ?? "";
  if (normalizedSlug) {
    const scoped = parseSavedScorecardAccess(storage.getItem(buildScorecardAccessKey(normalizedSlug)));
    if (scoped) {
      return scoped;
    }
  }

  const legacyStorage = getLegacyStorage();
  const legacy = parseSavedScorecardAccess(legacyStorage?.getItem(SCORECARD_ACCESS_TOKEN_KEY) ?? null);
  if (legacy && (!normalizedSlug || legacy.competitionSlug === normalizedSlug)) {
    storage.setItem(buildScorecardAccessKey(legacy.competitionSlug), JSON.stringify(legacy));
    legacyStorage?.removeItem(SCORECARD_ACCESS_TOKEN_KEY);
    return legacy;
  }

  if (!normalizedSlug) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(SCORECARD_ACCESS_TOKEN_PREFIX)) {
        continue;
      }

      const scoped = parseSavedScorecardAccess(storage.getItem(key));
      if (scoped) {
        return scoped;
      }
    }

    return null;
  }

  return null;
}

export function readScorecardAccessToken(competitionSlug?: string) {
  return readScorecardAccess(competitionSlug)?.token ?? "";
}

export function clearScorecardAccessToken(competitionSlug?: string) {
  const storage = getSessionStorage();
  const legacyStorage = getLegacyStorage();
  if (!storage) {
    return;
  }

  const normalizedSlug = competitionSlug?.trim() ?? "";
  if (normalizedSlug) {
    storage.removeItem(buildScorecardAccessKey(normalizedSlug));
    const legacy = parseSavedScorecardAccess(legacyStorage?.getItem(SCORECARD_ACCESS_TOKEN_KEY) ?? null);
    if (legacy?.competitionSlug === normalizedSlug) {
      legacyStorage?.removeItem(SCORECARD_ACCESS_TOKEN_KEY);
    }
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(SCORECARD_ACCESS_TOKEN_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => storage.removeItem(key));
  legacyStorage?.removeItem(SCORECARD_ACCESS_TOKEN_KEY);
}
