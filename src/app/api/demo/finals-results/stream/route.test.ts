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
  finalists: [{ climber_id: "climber-1", qualifier_rank: 1, climbing_order: 1 }],
  finalAttempts: [
    {
      competition_id: "competition-1",
      round_id: "round-finals",
      climber_id: "climber-1",
      climb_number: 1,
      top: true,
      zone: true,
      attempts_to_top: 1,
      attempts_to_zone: 1,
      entered_by: "staff",
      updated_at: "2026-06-01T15:00:00Z",
    },
  ],
  deletedFinalAttempts: false,
  insertedFinalAttempts: false,
  from: vi.fn(),
}));

class SupabaseQueryMock {
  private operation: "select" | "delete" | "insert" | null = null;

  constructor(private readonly table: string) {}

  select() {
    this.operation = "select";
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  insert() {
    this.operation = "insert";
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

    if (this.table === "final_attempts" && this.operation === "select") {
      return { data: mockState.finalAttempts, error: null };
    }

    if (this.table === "final_attempts" && this.operation === "delete") {
      mockState.deletedFinalAttempts = true;
      return { error: null };
    }

    if (this.table === "final_attempts" && this.operation === "insert") {
      mockState.insertedFinalAttempts = true;
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
  return new Request("http://localhost/api/demo/finals-results/stream", {
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
  mockState.finalists = [{ climber_id: "climber-1", qualifier_rank: 1, climbing_order: 1 }];
  mockState.finalAttempts = [
    {
      competition_id: "competition-1",
      round_id: "round-finals",
      climber_id: "climber-1",
      climb_number: 1,
      top: true,
      zone: true,
      attempts_to_top: 1,
      attempts_to_zone: 1,
      entered_by: "staff",
      updated_at: "2026-06-01T15:00:00Z",
    },
  ];
  mockState.deletedFinalAttempts = false;
  mockState.insertedFinalAttempts = false;
  mockState.from.mockReset();
  mockState.from.mockImplementation((table: string) => new SupabaseQueryMock(table));
});

describe("demo finals results stream route", () => {
  it("streams existing finals attempts without mutating score data", async () => {
    const response = await POST(jsonRequest({ competitionId: "competition-1" }));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("event: start");
    expect(body).toContain("event: score");
    expect(body).toContain("event: complete");
    expect(mockState.deletedFinalAttempts).toBe(false);
    expect(mockState.insertedFinalAttempts).toBe(false);
  });

  it("requires seeded finals scores before streaming", async () => {
    mockState.finalAttempts = [];

    const response = await POST(jsonRequest({ competitionId: "competition-1" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("finals scores");
    expect(mockState.deletedFinalAttempts).toBe(false);
    expect(mockState.insertedFinalAttempts).toBe(false);
  });
});
