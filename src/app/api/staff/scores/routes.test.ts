import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockState = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  role: "judge" as string | null,
  rpcData: {
    attempt: { id: "attempt-1" },
    status: "accepted",
    conflict_reason: null,
    client_event_id: "event-1",
    scored_at: "2026-05-01T12:00:00.000Z",
  } as unknown,
  rpcError: null as { message: string } | null,
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/server-supabase", () => ({
  createRouteSupabaseClient: () => ({
    auth: {
      getUser: mockState.getUser,
    },
    from: mockState.from,
    rpc: mockState.rpc,
  }),
}));

import { POST as postFinalScore } from "./final/route";
import { POST as postQualifierScore } from "./qualifier/route";

const qualifierPayload = {
  competitionId: "competition-1",
  climberId: "climber-1",
  climbNumber: 1,
  attemptCount: 1,
  topped: true,
  zone: true,
  attemptsToTop: 1,
  attemptsToZone: 1,
  clientEventId: "event-1",
  scoredAt: "2026-05-01T12:00:00.000Z",
};

const finalPayload = {
  competitionId: "competition-1",
  climberId: "climber-1",
  climbNumber: 1,
  top: true,
  zone: true,
  attemptsToTop: 1,
  attemptsToZone: 1,
  clientEventId: "event-1",
  scoredAt: "2026-05-01T12:00:00.000Z",
};

function jsonRequest(payload: unknown) {
  return new Request("http://localhost/api/staff/scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }) as NextRequest;
}

function setRpcError(message: string) {
  mockState.rpcData = null;
  mockState.rpcError = { message };
}

beforeEach(() => {
  mockState.user = { id: "user-1" };
  mockState.role = "judge";
  mockState.rpcData = {
    attempt: { id: "attempt-1" },
    status: "accepted",
    conflict_reason: null,
    client_event_id: "event-1",
    scored_at: "2026-05-01T12:00:00.000Z",
  };
  mockState.rpcError = null;
  mockState.getUser.mockReset();
  mockState.getUser.mockImplementation(async () => ({
    data: { user: mockState.user },
    error: null,
  }));
  mockState.from.mockReset();
  mockState.from.mockImplementation((table: string) => {
    if (table !== "profiles") {
      throw new Error(`Unexpected table ${table}`);
    }

    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: mockState.role ? { role: mockState.role } : null,
        error: null,
      })),
    };
    return query;
  });
  mockState.rpc.mockReset();
  mockState.rpc.mockImplementation(async () => ({
    data: mockState.rpcData,
    error: mockState.rpcError,
  }));
});

describe("staff score route security boundaries", () => {
  it("returns 401 for unauthenticated qualifier score writes", async () => {
    mockState.user = null;

    const response = await postQualifierScore(jsonRequest(qualifierPayload));

    expect(response.status).toBe(401);
    expect(mockState.rpc).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-staff score writes", async () => {
    mockState.role = "climber";

    const response = await postQualifierScore(jsonRequest(qualifierPayload));

    expect(response.status).toBe(403);
    expect(mockState.rpc).not.toHaveBeenCalled();
  });

  it.each(["judge", "admin"])("allows %s qualifier score writes", async (role) => {
    mockState.role = role;

    const response = await postQualifierScore(jsonRequest(qualifierPayload));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockState.rpc).toHaveBeenCalledWith(
      "submit_staff_qualifier_score_event",
      expect.objectContaining({
        p_client_event_id: "event-1",
        p_competition_id: "competition-1",
        p_climber_id: "climber-1",
      })
    );
    expect(body).toMatchObject({
      status: "accepted",
      clientEventId: "event-1",
    });
  });

  it("returns 409 when qualifier scoring is phase-closed", async () => {
    setRpcError("Qualifier scoring is not open during the current competition phase.");

    const response = await postQualifierScore(jsonRequest(qualifierPayload));

    expect(response.status).toBe(409);
  });

  it("returns 409 when final scoring is phase-closed", async () => {
    setRpcError("Finals scoring is not open during the current competition phase.");

    const response = await postFinalScore(jsonRequest(finalPayload));

    expect(response.status).toBe(409);
  });

  it("returns 404 for invalid qualifier climbers", async () => {
    setRpcError("Climber not found.");

    const response = await postQualifierScore(jsonRequest(qualifierPayload));

    expect(response.status).toBe(404);
  });

  it("returns 409 for non-finalist finals scoring", async () => {
    setRpcError("Only finalists can receive finals scores.");

    const response = await postFinalScore(jsonRequest(finalPayload));

    expect(response.status).toBe(409);
  });

  it("returns 400 when clientEventId is missing", async () => {
    const { clientEventId: _clientEventId, ...payload } = qualifierPayload;

    const response = await postQualifierScore(jsonRequest(payload));

    expect(response.status).toBe(400);
    expect(mockState.rpc).not.toHaveBeenCalled();
  });
});
