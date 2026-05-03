import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockState = vi.hoisted(() => ({
  competition: { id: "competition-1", is_demo: true } as { id: string; is_demo: boolean } | null,
  deleteCalled: false,
  from: vi.fn(),
}));

vi.mock("@/lib/server-supabase", () => ({
  createServiceRoleSupabaseClient: () => ({
    from: mockState.from,
  }),
}));

import { POST } from "./route";

function jsonRequest(payload: unknown) {
  return new Request("http://localhost/api/demo/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }) as NextRequest;
}

beforeEach(() => {
  mockState.competition = { id: "competition-1", is_demo: true };
  mockState.deleteCalled = false;
  mockState.from.mockReset();
  mockState.from.mockImplementation((table: string) => {
    if (table !== "competitions") {
      throw new Error(`Unexpected table ${table}`);
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: mockState.competition,
            error: null,
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async () => {
          mockState.deleteCalled = true;
          return { error: null };
        }),
      })),
    };
  });
});

describe("demo complete route", () => {
  it("deletes demo competitions through the service-role path", async () => {
    const response = await POST(jsonRequest({ competitionId: "competition-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, competitionId: "competition-1", deleted: true });
    expect(mockState.deleteCalled).toBe(true);
  });

  it("refuses to delete real competitions", async () => {
    mockState.competition = { id: "competition-1", is_demo: false };

    const response = await POST(jsonRequest({ competitionId: "competition-1" }));

    expect(response.status).toBe(403);
    expect(mockState.deleteCalled).toBe(false);
  });

  it("requires a competition id", async () => {
    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(400);
    expect(mockState.from).not.toHaveBeenCalled();
  });
});
