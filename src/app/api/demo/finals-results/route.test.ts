import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

type QueryResult = { data?: unknown; error: { message: string } | null };

const mockState = vi.hoisted(() => ({
  competition: {
    id: "competition-1",
    is_demo: true,
    finals_problem_count: 4,
  },
  finalsRound: {
    id: "round-finals",
    problem_count: 4,
  },
  finalists: [
    { climber_id: "climber-1", qualifier_rank: 1, climbing_order: 1 },
    { climber_id: "climber-2", qualifier_rank: 2, climbing_order: 2 },
  ],
  upsertedFinalAttempts: [] as Array<Record<string, unknown>>,
  from: vi.fn(),
}));

class SupabaseQueryMock {
  private operation: "select" | "upsert" | null = null;
  private payload: unknown = null;

  constructor(private readonly table: string) {}

  select() {
    this.operation = "select";
    return this;
  }

  upsert(payload: unknown) {
    this.operation = "upsert";
    this.payload = payload;
    return this;
  }

  eq() {
    return this;
  }

  or() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  async maybeSingle(): Promise<QueryResult> {
    if (this.table === "competitions") {
      return { data: mockState.competition, error: null };
    }
    if (this.table === "competition_rounds") {
      return { data: mockState.finalsRound, error: null };
    }
    return { data: null, error: null };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.resolve().then(onfulfilled, onrejected);
  }

  private async resolve(): Promise<QueryResult> {
    if (this.table === "competition_finalists" && this.operation === "select") {
      return { data: mockState.finalists, error: null };
    }

    if (this.table === "final_attempts" && this.operation === "upsert") {
      mockState.upsertedFinalAttempts = Array.isArray(this.payload)
        ? (this.payload as Array<Record<string, unknown>>)
        : [];
      return { error: null };
    }

    return { data: null, error: null };
  }
}

vi.mock("@/lib/server-supabase", () => ({
  createServiceRoleSupabaseClient: () => ({
    from: mockState.from,
  }),
}));

import { POST } from "./route";

function jsonRequest(payload: unknown) {
  return new Request("http://localhost/api/demo/finals-results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }) as NextRequest;
}

beforeEach(() => {
  mockState.competition = {
    id: "competition-1",
    is_demo: true,
    finals_problem_count: 4,
  };
  mockState.finalsRound = {
    id: "round-finals",
    problem_count: 4,
  };
  mockState.finalists = [
    { climber_id: "climber-1", qualifier_rank: 1, climbing_order: 1 },
    { climber_id: "climber-2", qualifier_rank: 2, climbing_order: 2 },
  ];
  mockState.upsertedFinalAttempts = [];
  mockState.from.mockReset();
  mockState.from.mockImplementation((table: string) => new SupabaseQueryMock(table));
});

describe("demo finals results route", () => {
  it("refuses to seed finals results into non-demo competitions", async () => {
    mockState.competition = {
      ...mockState.competition,
      is_demo: false,
    };

    const response = await POST(jsonRequest({ competitionId: "competition-1" }));

    expect(response.status).toBe(403);
    expect(mockState.upsertedFinalAttempts).toEqual([]);
  });

  it("requires finalists before seeding demo finals scores", async () => {
    mockState.finalists = [];

    const response = await POST(jsonRequest({ competitionId: "competition-1" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("finalists");
    expect(mockState.upsertedFinalAttempts).toEqual([]);
  });

  it("inserts deterministic finals attempts for demo finalists", async () => {
    const response = await POST(jsonRequest({ competitionId: "competition-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      competitionId: "competition-1",
      inserted: {
        finalists: 2,
        attempts: 8,
      },
    });
    expect(mockState.upsertedFinalAttempts).toHaveLength(8);
    expect(mockState.upsertedFinalAttempts[0]).toMatchObject({
      competition_id: "competition-1",
      round_id: "round-finals",
      climber_id: "climber-1",
      climb_number: 1,
      entered_by: "staff",
    });
  });
});
