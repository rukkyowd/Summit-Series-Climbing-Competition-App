import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NUMBER,
} from "@/lib/demo-scenario";

type QueryResult = { data?: unknown; count?: number | null; error: { message: string } | null };

const mockState = vi.hoisted(() => ({
  competition: {
    id: "competition-1",
    slug: "summit-demo",
    is_demo: true,
    current_phase: "finals_open",
    qualifier_locked_at: "2026-06-01T14:00:00Z",
    finals_started_at: "2026-06-01T15:00:00Z",
  } as {
    id: string;
    slug: string;
    is_demo: boolean;
    current_phase: string | null;
    qualifier_locked_at: string | null;
    finals_started_at: string | null;
  },
  climberCount: 12,
  attemptCount: 24,
  finalistCount: 6,
  targetClimber: {
    id: "climber-c",
    name: "Athlete C",
    climber_number: "103",
  } as { id: string; name: string; climber_number: string },
  targetAttempt: {
    attempt_count: 1,
    topped: true,
    zone: true,
    attempts_to_top: 1,
    attempts_to_zone: 1,
  } as {
    attempt_count: number | null;
    topped: boolean | null;
    zone: boolean | null;
    attempts_to_top: number | null;
    attempts_to_zone: number | null;
  },
  from: vi.fn(),
}));

class SupabaseQueryMock {
  private filters: Record<string, unknown> = {};
  private selectOptions: { count?: string; head?: boolean } | undefined;

  constructor(private readonly table: string) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.selectOptions = options;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  limit() {
    return this;
  }

  async maybeSingle(): Promise<QueryResult> {
    if (this.table === "competitions") {
      return { data: mockState.competition, error: null };
    }

    if (this.table === "climbers" && this.filters.climber_number === DEMO_TARGET_CLIMBER_NUMBER) {
      return { data: mockState.targetClimber, error: null };
    }

    if (
      this.table === "qualifier_attempts" &&
      this.filters.climber_id === mockState.targetClimber.id &&
      this.filters.climb_number === DEMO_TARGET_CLIMB_NUMBER
    ) {
      return { data: mockState.targetAttempt, error: null };
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
    if (this.selectOptions?.head && this.table === "climbers") {
      return { count: mockState.climberCount, error: null };
    }

    if (this.selectOptions?.head && this.table === "qualifier_attempts") {
      return { count: mockState.attemptCount, error: null };
    }

    if (this.selectOptions?.head && this.table === "competition_finalists") {
      return { count: mockState.finalistCount, error: null };
    }

    return { data: null, error: null };
  }
}

vi.mock("@/lib/server-supabase", () => ({
  createServiceRoleSupabaseClient: () => ({
    from: mockState.from,
  }),
}));

import { GET } from "./route";

function stateRequest(query: string) {
  return {
    nextUrl: new URL(`http://localhost/api/demo/state?${query}`),
  } as NextRequest;
}

beforeEach(() => {
  mockState.competition = {
    id: "competition-1",
    slug: "summit-demo",
    is_demo: true,
    current_phase: "finals_open",
    qualifier_locked_at: "2026-06-01T14:00:00Z",
    finals_started_at: "2026-06-01T15:00:00Z",
  };
  mockState.climberCount = 12;
  mockState.attemptCount = 24;
  mockState.finalistCount = 6;
  mockState.targetClimber = {
    id: "climber-c",
    name: "Athlete C",
    climber_number: DEMO_TARGET_CLIMBER_NUMBER,
  };
  mockState.targetAttempt = {
    attempt_count: 1,
    topped: true,
    zone: true,
    attempts_to_top: 1,
    attempts_to_zone: 1,
  };
  mockState.from.mockReset();
  mockState.from.mockImplementation((table: string) => new SupabaseQueryMock(table));
});

describe("demo state route", () => {
  it("returns publicReady when finalists exist and finals are visible", async () => {
    const response = await GET(stateRequest("competitionId=competition-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.progress).toMatchObject({
      dataPopulated: true,
      keyScoreCorrected: true,
      organizerAdvanced: true,
      publicReady: true,
    });
  });

  it("keeps publicReady false until finalists exist", async () => {
    mockState.finalistCount = 0;

    const response = await GET(stateRequest("slug=summit-demo"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.progress).toMatchObject({
      organizerAdvanced: false,
      publicReady: false,
    });
  });

  it("refuses non-demo competitions", async () => {
    mockState.competition = {
      ...mockState.competition,
      is_demo: false,
    };

    const response = await GET(stateRequest("competitionId=competition-1"));

    expect(response.status).toBe(403);
  });
});
