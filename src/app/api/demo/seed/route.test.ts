import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  DEMO_TARGET_AFTER_LABEL,
  DEMO_TARGET_BEFORE_LABEL,
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NUMBER,
} from "@/lib/demo-scenario";

type QueryResult = { data?: unknown; error: { message: string } | null };

const mockState = vi.hoisted(() => ({
  competition: {
    id: "competition-1",
    slug: "demo-comp",
    is_demo: true,
    format: "five_on_five_off",
    total_climbs: 4,
    qualifier_counting_climbs: 4,
    finals_eligible_age_groups: [],
  },
  qualifierRound: { id: "round-qualifier", round_type: "qualifier", scoring_bucket: "qualifier" } as {
    id: string;
    round_type: string;
    scoring_bucket: string;
  } | null,
  finalsRound: null as {
    id: string;
    round_number: number;
    sort_order: number;
    round_type: string;
    scoring_bucket: string;
  } | null,
  competitionUpdates: [] as Array<Record<string, unknown>>,
  roundUpdates: [] as Array<Record<string, unknown>>,
  roundInserts: [] as Array<Record<string, unknown>>,
  operationLog: [] as string[],
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
  private orFilter = "";

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

  upsert(payload: unknown) {
    this.operation = "insert";
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

  or(filter?: string) {
    this.orFilter = filter ?? "";
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

    if (this.table === "competition_categories") {
      return {
        data: {
          id: "Men::Youth B",
          competition_id: "competition-1",
          gender_division: "Men",
          age_group: "Youth B",
          display_name: "Men / Youth B",
        },
        error: null,
      };
    }

    if (this.table === "competition_rounds") {
      if (this.orFilter.includes("finals")) {
        return { data: mockState.finalsRound, error: null };
      }
      return { data: mockState.qualifierRound, error: null };
    }

    return { data: null, error: null };
  }

  async single(): Promise<QueryResult> {
    if (this.table === "competition_rounds" && this.operation === "insert") {
      mockState.roundInserts.push(this.payload as Record<string, unknown>);
      return { data: { id: "round-finals" }, error: null };
    }

    return { data: { id: "session-1" }, error: null };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.resolve().then(onfulfilled, onrejected);
  }

  private async resolve(): Promise<QueryResult> {
    if (this.operation === "update" || this.operation === "delete") {
      if (this.table === "competitions" && this.operation === "update") {
        mockState.operationLog.push("competition:update");
        mockState.competitionUpdates.push(this.payload as Record<string, unknown>);
      }
      if (this.table === "competition_rounds" && this.operation === "update") {
        const payload = this.payload as Record<string, unknown>;
        mockState.roundUpdates.push(payload);
        mockState.operationLog.push(payload.is_active ? "rounds:activate" : "rounds:deactivate");
      }
      return { error: null };
    }

    if (this.table === "competition_rounds" && this.operation === "insert") {
      mockState.roundInserts.push(this.payload as Record<string, unknown>);
      return { data: { id: "round-finals" }, error: null };
    }

    if (this.table === "competition_schedule_blocks") {
      return {
        data: [
          {
            id: "session-1",
            round_id: "round-qualifier",
            phase_type: "qualifier_round",
            eligible_category_ids: ["Men::Youth B"],
            capacity: 24,
            sort_order: 1,
          },
        ],
        error: null,
      };
    }

    if (this.table === "climbers" && this.operation === "select") {
      return { data: [], error: null };
    }

    if (this.table === "climbers" && this.operation === "insert") {
      mockState.operationLog.push("climbers:insert");
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
      mockState.operationLog.push("attempts:insert");
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
    slug: "demo-comp",
    is_demo: true,
    format: "five_on_five_off",
    total_climbs: 4,
    qualifier_counting_climbs: 4,
    finals_eligible_age_groups: [],
  };
  mockState.qualifierRound = { id: "round-qualifier", round_type: "qualifier", scoring_bucket: "qualifier" };
  mockState.finalsRound = null;
  mockState.competitionUpdates = [];
  mockState.roundUpdates = [];
  mockState.roundInserts = [];
  mockState.operationLog = [];
  mockState.insertedClimbers = [];
  mockState.insertedAttempts = [];
  mockState.from.mockReset();
  mockState.from.mockImplementation((table: string) => new SupabaseQueryMock(table));
});

describe("demo seed route", () => {
  it("refuses to seed non-demo competitions", async () => {
    mockState.competition = {
      ...mockState.competition,
      slug: "real-comp",
      is_demo: false,
    };

    const response = await POST(jsonRequest({ competitionId: "competition-1" }));

    expect(response.status).toBe(403);
    expect(mockState.insertedAttempts).toEqual([]);
    expect(mockState.competitionUpdates).toEqual([]);
  });

  it("reseeds Maya B3 as Top in 3 and returns a preselected judge URL", async () => {
    const response = await POST(jsonRequest({ competitionId: "competition-1" }));
    const body = await response.json();
    const maya = mockState.insertedClimbers.find(
      (climber) => climber.climber_number === DEMO_TARGET_CLIMBER_NUMBER
    );
    const mayaB3 = mockState.insertedAttempts.find(
      (attempt) => attempt.climber_id === maya?.id && attempt.climb_number === DEMO_TARGET_CLIMB_NUMBER
    );

    expect(response.status).toBe(200);
    expect(mayaB3).toMatchObject({
      attempt_count: 3,
      topped: true,
      zone: true,
      attempts_to_top: 3,
      attempts_to_zone: 1,
    });
    expect(body).toMatchObject({
      ok: true,
      competitionId: "competition-1",
      slug: "demo-comp",
      target: {
        climberNumber: DEMO_TARGET_CLIMBER_NUMBER,
        before: DEMO_TARGET_BEFORE_LABEL,
        after: DEMO_TARGET_AFTER_LABEL,
      },
    });
    expect(body.judgeUrl).toContain("/staff/c/demo-comp/judge?demo=1");
    expect(body.judgeUrl).toContain("boulder=3");
    expect(body.judgeUrl).toContain(`climberId=${maya?.id}`);
  });

  it("repairs finals-capable demo config before inserting climbers and scores", async () => {
    const response = await POST(jsonRequest({ competitionId: "competition-1" }));

    expect(response.status).toBe(200);
    expect(mockState.competitionUpdates[0]).toMatchObject({
      has_finals: true,
      finals_cutoff: 6,
      finals_tie_advances: false,
      finals_problem_count: 4,
      finals_eligible_age_groups: ["Youth B"],
    });
    expect(mockState.operationLog[0]).toBe("competition:update");
    expect(mockState.operationLog.indexOf("climbers:insert")).toBeGreaterThan(0);
    expect(mockState.operationLog.indexOf("attempts:insert")).toBeGreaterThan(
      mockState.operationLog.indexOf("climbers:insert")
    );
  });

  it("creates a finals round linked to the qualifier round when missing", async () => {
    const response = await POST(jsonRequest({ competitionId: "competition-1" }));

    expect(response.status).toBe(200);
    expect(mockState.roundInserts).toContainEqual(
      expect.objectContaining({
        competition_id: "competition-1",
        name: "Finals",
        round_type: "finals",
        scoring_bucket: "finals",
        advancement_source_round_id: "round-qualifier",
        advancement_cutoff: 6,
        problem_count: 4,
      })
    );
  });

  it("deactivates existing active rounds before activating the qualifier round", async () => {
    const response = await POST(jsonRequest({ competitionId: "competition-1" }));

    expect(response.status).toBe(200);
    expect(mockState.operationLog.indexOf("rounds:deactivate")).toBeGreaterThan(-1);
    expect(mockState.operationLog.indexOf("rounds:activate")).toBeGreaterThan(-1);
    expect(mockState.operationLog.indexOf("rounds:deactivate")).toBeLessThan(
      mockState.operationLog.indexOf("rounds:activate")
    );
  });
});
