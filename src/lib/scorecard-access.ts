"use client";

export const SCORECARD_ACCESS_TOKEN_KEY = "scorecard_access_token";
export const SCORECARD_ACCESS_TOKEN_PREFIX = "scorecard_access_";

export interface SavedScorecardAccess {
  token: string;
  competitionSlug: string;
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
  if (typeof window === "undefined") {
    return;
  }

  const normalizedToken = token.trim();
  const normalizedSlug = competitionSlug?.trim() ?? "";
  if (!normalizedToken || !normalizedSlug) {
    return;
  }

  const payload: SavedScorecardAccess = {
    token: normalizedToken,
    competitionSlug: normalizedSlug,
  };

  window.localStorage.setItem(buildScorecardAccessKey(normalizedSlug), JSON.stringify(payload));
  window.localStorage.removeItem(SCORECARD_ACCESS_TOKEN_KEY);
}

export function readScorecardAccess(competitionSlug?: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const normalizedSlug = competitionSlug?.trim() ?? "";
  if (normalizedSlug) {
    const scoped = parseSavedScorecardAccess(window.localStorage.getItem(buildScorecardAccessKey(normalizedSlug)));
    if (scoped) {
      return scoped;
    }
  }

  const legacy = parseSavedScorecardAccess(window.localStorage.getItem(SCORECARD_ACCESS_TOKEN_KEY));
  if (legacy && (!normalizedSlug || legacy.competitionSlug === normalizedSlug)) {
    window.localStorage.setItem(buildScorecardAccessKey(legacy.competitionSlug), JSON.stringify(legacy));
    window.localStorage.removeItem(SCORECARD_ACCESS_TOKEN_KEY);
    return legacy;
  }

  if (!normalizedSlug) {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(SCORECARD_ACCESS_TOKEN_PREFIX)) {
        continue;
      }

      const scoped = parseSavedScorecardAccess(window.localStorage.getItem(key));
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
  if (typeof window === "undefined") {
    return;
  }

  const normalizedSlug = competitionSlug?.trim() ?? "";
  if (normalizedSlug) {
    window.localStorage.removeItem(buildScorecardAccessKey(normalizedSlug));
    const legacy = parseSavedScorecardAccess(window.localStorage.getItem(SCORECARD_ACCESS_TOKEN_KEY));
    if (legacy?.competitionSlug === normalizedSlug) {
      window.localStorage.removeItem(SCORECARD_ACCESS_TOKEN_KEY);
    }
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(SCORECARD_ACCESS_TOKEN_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.removeItem(SCORECARD_ACCESS_TOKEN_KEY);
}
