import { describe, expect, it } from "vitest";
import {
  getStaffScoreErrorStatus,
  isStaffRole,
  normalizeStaffScoreRpcResult,
} from "./staff-score-api";

describe("staff score API helpers", () => {
  it("recognizes the current global staff roles", () => {
    expect(isStaffRole("admin")).toBe(true);
    expect(isStaffRole("judge")).toBe(true);
    expect(isStaffRole("organizer")).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });

  it("normalizes snake_case RPC score metadata into the route response shape", () => {
    expect(
      normalizeStaffScoreRpcResult({
        attempt: { id: "attempt-1" },
        status: "conflicted",
        conflict_reason: "replaced_existing_score",
        client_event_id: "event-1",
        scored_at: "2026-05-01T12:00:00.000Z",
      })
    ).toEqual({
      attempt: { id: "attempt-1" },
      status: "conflicted",
      conflictReason: "replaced_existing_score",
      clientEventId: "event-1",
      scoredAt: "2026-05-01T12:00:00.000Z",
    });
  });

  it("falls back to safe metadata for empty RPC responses", () => {
    expect(
      normalizeStaffScoreRpcResult(null, {
        clientEventId: "client-event",
        scoredAt: "2026-05-01T12:00:00.000Z",
      })
    ).toEqual({
      attempt: null,
      status: "accepted",
      conflictReason: null,
      clientEventId: "client-event",
      scoredAt: "2026-05-01T12:00:00.000Z",
    });
  });

  it("maps staff scoring guard failures to non-500 response classes", () => {
    expect(getStaffScoreErrorStatus("Only staff can record qualifier scores")).toBe(403);
    expect(getStaffScoreErrorStatus("Climber not found.")).toBe(404);
    expect(getStaffScoreErrorStatus("Finals scoring is not open during the current competition phase.")).toBe(409);
  });
});
