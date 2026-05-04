import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  DEMO_TARGET_BEFORE_LABEL,
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NUMBER,
} from "@/lib/demo-scenario";

type QueryResult = { data?: unknown; error: { message: string } | null };

const mockState = vi.hoisted(() => ({
  competition: {
    id: "competition-1",
    slug: "summit-demo",
    is_demo: true,
    format: "scramble",
    total_climbs: 6,
    qualifier_counting_climbs: 4,
    finals_cutoff: 6,
    finals_problem_count: 4,
    qualifier_eligible_age_groups: ["Open"],
    current_phase: "qualifier_open",
  },
  categories: [
    {
      id: "Men::Open",
      competition_id: "competition-1",
      gender_division: "Men",
      age_group: "Open",
      display_name: "Men / Open",
      sort_order: 1,
    },
    {
      id: "Women::Open",
      competition_id: "competition-1",
      gender_division: "Women",
      age_group: "Open",
      display_name: "Women / Open",
      sort_order: 2,
    },
  ],
  qualifierRound: {
    id: "round-qualifier",
    round_number: 1,
    sort_order: 1,
    problem_count: 6,
    counting_climbs: 4,
  } as Record<string, unknown> | null,
  scheduleBlocks: [
    {
      id: "session-1",
      round_id: "round-qualifier",
      capacity: 24,
      sort_order: 1,
    },
  ],
  existingClimbers: [] as Array<{ id: string }>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  deletes: [] as Array<{ table: string }>,
  inserts: [] as Array<{ table: string; payload: unknown }>,
  insertedClimbers: [] as Array<{ id: string; climber_number: string }>,
  insertedAttempts: [] as Array<{
    climber_id: string;
    climb_number: number;
    attempt_count: number;
    topped: boolean;
    zone: boolean;
    attempts_to_top: number | null;
    attempts_to_zone: number | null;
  }>,
  from: vi.fn(),
}));

class SupabaseQueryMock {
  private operation: "select" | "insert" | "update" | "delete" | null = null;
  private payload: unknown = null;

  constructor(private readonly table: string) {}

  select() {
    if (this.operation !== "insert") {
      this.operation = "select";
    }
    return this;
  }

  insert(payload: unknown) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq() {
    return this;
  }

  neq() {
    return this;
  }

  in() {
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
      return { data: mockState.qualifierRound, error: null };
    }

    return { data: null, error: null };
  }

  async single(): Promise<QueryResult> {
    if (this.table === "competition_rounds" && this.operation === "insert") {
      mockState.inserts.push({ table: this.table, payload: this.payload });
      return { data: { id: "round-qualifier" }, error: null };
    }

    if (this.table === "competition_schedule_blocks" && this.operation === "insert") {
      mockState.inserts.push({ table: this.table, payload: this.payload });
      return { data: { id: "session-1" }, error: null };
    }

    return { data: { id: "inserted" }, error: null };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.resolve().then(onfulfilled, onrejected);
  }

  private async resolve(): Promise<QueryResult> {
    if (this.operation === "update") {
      mockState.updates.push({ table: this.table, payload: this.payload as Record<string, unknown> });
      return { error: null };
    }

    if (this.operation === "delete") {
      mockState.deletes.push({ table: this.table });
      return { error: null };
    }

    if (this.table === "competition_categories") {
      return { data: mockState.categories, error: null };
    }

    if (this.table === "competition_schedule_blocks") {
      return { data: mockState.scheduleBlocks, error: null };
    }

    if (this.table === "climbers" && this.operation === "select") {
      return { data: mockState.existingClimbers, error: null };
    }

    if (this.table === "climbers" && this.operation === "insert") {
      mockState.inserts.push({ table: this.table, payload: this.payload });
      const payload = Array.isArray(this.payload)
        ? (this.payload as Array<{ id: string; climber_number: string }>)
        : [];
      mockState.insertedClimbers = payload.map((row) => ({
        id: row.id,
        climber_number: row.climber_number,
      }));
      return { data: mockState.insertedClimbers, error: null };
    }

    if (this.table === "qualifier_attempts" && this.operation === "insert") {
      mockState.inserts.push({ table: this.table, payload: this.payload });
      mockState.insertedAttempts = Array.isArray(this.payload)
        ? (this.payload as typeof mockState.insertedAttempts)
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
  return new Request("http://localhost/api/demo/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }) as NextRequest;
}

beforeEach(() => {
  mockState.competition = {
    id: "competition-1",
    slug: "summit-demo",
    is_demo: true,
    format: "scramble",
    total_climbs: 6,
    qualifier_counting_climbs: 4,
    finals_cutoff: 6,
    finals_problem_count: 4,
    qualifier_eligible_age_groups: ["Open"],
    current_phase: "qualifier_open",
  };
  mockState.categories = [
    {
      id: "Men::Open",
      competition_id: "competition-1",
      gender_division: "Men",
      age_group: "Open",
      display_name: "Men / Open",
      sort_order: 1,
    },
    {
      id: "Women::Open",
      competition_id: "competition-1",
      gender_division: "Women",
      age_group: "Open",
      display_name: "Women / Open",
      sort_order: 2,
    },
  ];
  mockState.qualifierRound = {
    id: "round-qualifier",
    round_number: 1,
    sort_order: 1,
    problem_count: 6,
    counting_climbs: 4,
  };
  mockState.scheduleBlocks = [
    {
      id: "session-1",
      round_id: "round-qualifier",
      capacity: 24,
      sort_order: 1,
    },
  ];
  mockState.existingClimbers = [];
  mockState.updates = [];
  mockState.deletes = [];
  mockState.inserts = [];
  mockState.insertedClimbers = [];
  mockState.insertedAttempts = [];
  mockState.from.mockReset();
  mockState.from.mockImplementation((table: string) => new SupabaseQueryMock(table));
});

describe("demo seed route", () => {
  it("refuses to seed non-demo competitions", async () => {
    mockState.competition = {
      ...mockState.competition,
      is_demo: false,
    };

    const response = await POST(jsonRequest({ competitionId: "competition-1" }));

    expect(response.status).toBe(403);
    expect(mockState.insertedClimbers).toEqual([]);
    expect(mockState.insertedAttempts).toEqual([]);
  });

  it("requires at least one selected category", async () => {
    mockState.competition = {
      ...mockState.competition,
      qualifier_eligible_age_groups: [],
    };

    const response = await POST(jsonRequest({ competitionId: "competition-1" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("You must add at least one category");
    expect(mockState.insertedClimbers).toEqual([]);
  });

  it("seeds Summit Series climbers, scores, and the Athlete C correction target", async () => {
    const response = await POST(jsonRequest({ competitionId: "competition-1" }));
    const body = await response.json();
    const target = mockState.insertedClimbers.find(
      (climber) => climber.climber_number === DEMO_TARGET_CLIMBER_NUMBER
    );
    const targetB3 = mockState.insertedAttempts.find(
      (attempt) => attempt.climber_id === target?.id && attempt.climb_number === DEMO_TARGET_CLIMB_NUMBER
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      competitionId: "competition-1",
      slug: "summit-demo",
      activeRoundId: "round-qualifier",
      target: {
        climberNumber: DEMO_TARGET_CLIMBER_NUMBER,
        before: DEMO_TARGET_BEFORE_LABEL,
      },
      inserted: {
        climbers: 12,
        attempts: 72,
      },
    });
    expect(targetB3).toMatchObject({
      attempt_count: 3,
      topped: true,
      zone: true,
      attempts_to_top: 3,
      attempts_to_zone: 1,
    });
    expect(body.judgeUrl).toContain("/staff/c/summit-demo/judge?demo=act2");
    expect(body.judgeUrl).toContain("boulder=3");
    expect(body.judgeUrl).toContain(`climberId=${target?.id}`);
    expect(body.organizerUrl).toBe("/staff/c/summit-demo?demo=act3");
    expect(body.publicUrl).toBe("/c/summit-demo?demo=act4");
  });

  it("clears previous seeded rows before inserting fresh demo data", async () => {
    mockState.existingClimbers = [{ id: "old-athlete-c" }];

    const response = await POST(jsonRequest({ competitionId: "competition-1" }));

    expect(response.status).toBe(200);
    expect(mockState.deletes.map((entry) => entry.table)).toEqual(
      expect.arrayContaining(["competition_finalists", "final_attempts", "qualifier_attempts", "climbers"])
    );
    expect(mockState.insertedClimbers).toHaveLength(12);
  });
});
