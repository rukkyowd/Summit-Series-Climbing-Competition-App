"use client";

export const SCORECARD_ACCESS_TOKEN_KEY = "scorecard_access_token";

export interface SavedScorecardAccess {
  token: string;
  competitionSlug: string;
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

  window.localStorage.setItem(SCORECARD_ACCESS_TOKEN_KEY, JSON.stringify(payload));
}

export function readScorecardAccess() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SCORECARD_ACCESS_TOKEN_KEY);
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

export function readScorecardAccessToken() {
  return readScorecardAccess()?.token ?? "";
}

export function clearScorecardAccessToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SCORECARD_ACCESS_TOKEN_KEY);
}
