import { describe, expect, it } from "vitest";
import { normalizeFinalAttemptInput, normalizeQualifierAttemptInput } from "./attempts";

describe("normalizeQualifierAttemptInput", () => {
  it("bumps topped qualifier saves to at least one attempt", () => {
    expect(
      normalizeQualifierAttemptInput({
        attemptCount: 0,
        topped: true,
      })
    ).toEqual({
      attemptCount: 1,
      topped: true,
      zone: true,
      attemptsToTop: 1,
      attemptsToZone: 1,
    });
  });

  it("keeps untopped qualifier saves at zero attempts when no score exists", () => {
    expect(
      normalizeQualifierAttemptInput({
        attemptCount: 0,
        topped: false,
      })
    ).toEqual({
      attemptCount: 0,
      topped: false,
      zone: false,
      attemptsToTop: null,
      attemptsToZone: null,
    });
  });
});

describe("normalizeFinalAttemptInput", () => {
  it("forces positive attempts for zone-only saves", () => {
    expect(
      normalizeFinalAttemptInput({
        top: false,
        zone: true,
        attemptsToZone: 0,
      })
    ).toEqual({
      top: false,
      zone: true,
      attemptsToTop: null,
      attemptsToZone: 1,
    });
  });

  it("keeps top and zone aligned for top saves", () => {
    expect(
      normalizeFinalAttemptInput({
        top: true,
        zone: false,
        attemptsToTop: 0,
        attemptsToZone: 0,
      })
    ).toEqual({
      top: true,
      zone: true,
      attemptsToTop: 1,
      attemptsToZone: 1,
    });
  });
});
