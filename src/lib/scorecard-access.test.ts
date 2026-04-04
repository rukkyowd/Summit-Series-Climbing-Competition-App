import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SCORECARD_ACCESS_TOKEN_KEY,
  clearScorecardAccessToken,
  readScorecardAccess,
  saveScorecardAccessToken,
} from "./scorecard-access";

class MemoryStorage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("scorecard access storage", () => {
  const originalWindow = (globalThis as { window?: Window & typeof globalThis }).window;

  beforeEach(() => {
    (globalThis as { window?: Window & typeof globalThis }).window = {
      localStorage: new MemoryStorage() as unknown as Storage,
    } as Window & typeof globalThis;
  });

  afterEach(() => {
    if (originalWindow) {
      (globalThis as { window?: Window & typeof globalThis }).window = originalWindow;
      return;
    }

    delete (globalThis as { window?: Window & typeof globalThis }).window;
  });

  it("stores scorecard access per competition slug", () => {
    saveScorecardAccessToken("token-one", "spring-send");
    saveScorecardAccessToken("token-two", "granite-open");

    expect(readScorecardAccess("spring-send")).toEqual({
      token: "token-one",
      competitionSlug: "spring-send",
    });
    expect(readScorecardAccess("granite-open")).toEqual({
      token: "token-two",
      competitionSlug: "granite-open",
    });
  });

  it("migrates the legacy scorecard key when the slug matches", () => {
    window.localStorage.setItem(
      SCORECARD_ACCESS_TOKEN_KEY,
      JSON.stringify({
        token: "legacy-token",
        competitionSlug: "spring-send",
      })
    );

    expect(readScorecardAccess("spring-send")).toEqual({
      token: "legacy-token",
      competitionSlug: "spring-send",
    });
    expect(window.localStorage.getItem(SCORECARD_ACCESS_TOKEN_KEY)).toBeNull();
  });

  it("clears all scoped scorecard access tokens when requested", () => {
    saveScorecardAccessToken("token-one", "spring-send");
    saveScorecardAccessToken("token-two", "granite-open");

    clearScorecardAccessToken();

    expect(readScorecardAccess("spring-send")).toBeNull();
    expect(readScorecardAccess("granite-open")).toBeNull();
  });
});
