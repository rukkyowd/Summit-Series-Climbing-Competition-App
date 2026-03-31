"use client";

export const SCORECARD_ACCESS_TOKEN_KEY = "scorecard_access_token";

export function saveScorecardAccessToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = token.trim();
  if (!normalized) {
    return;
  }

  window.localStorage.setItem(SCORECARD_ACCESS_TOKEN_KEY, normalized);
}

export function readScorecardAccessToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(SCORECARD_ACCESS_TOKEN_KEY) ?? "";
}

export function clearScorecardAccessToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SCORECARD_ACCESS_TOKEN_KEY);
}
