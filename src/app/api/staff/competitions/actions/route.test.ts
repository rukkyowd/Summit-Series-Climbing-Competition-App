import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockState = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  role: "admin" as string | null,
  getUser: vi.fn(),
  routeFrom: vi.fn(),
  serviceFrom: vi.fn(),
  serviceRpc: vi.fn(),
  updatePayload: null as unknown,
}));

vi.mock("@/lib/server-supabase", () => ({
  createRouteSupabaseClient: () => ({
    auth: {
      getUser: mockState.getUser,
    },
    from: mockState.routeFrom,
  }),
  createServiceRoleSupabaseClient: () => ({
    from: mockState.serviceFrom,
    rpc: mockState.serviceRpc,
  }),
}));

import { POST } from "./route";

function jsonRequest(payload: unknown) {
  return new Request("http://localhost/api/staff/competitions/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }) as NextRequest;
}

beforeEach(() => {
  mockState.user = { id: "user-1" };
  mockState.role = "admin";
  mockState.updatePayload = null;
  mockState.getUser.mockReset();
  mockState.getUser.mockImplementation(async () => ({
    data: { user: mockState.user },
    error: null,
  }));
  mockState.routeFrom.mockReset();
  mockState.routeFrom.mockImplementation((table: string) => {
    if (table !== "profiles") {
      throw new Error(`Unexpected route table ${table}`);
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
  mockState.serviceFrom.mockReset();
  mockState.serviceFrom.mockImplementation((table: string) => {
    if (table !== "competitions") {
      throw new Error(`Unexpected service table ${table}`);
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { id: "competition-1", status: "active" },
            error: null,
          })),
        })),
      })),
      update: vi.fn((payload: unknown) => {
        mockState.updatePayload = payload;
        return {
          eq: vi.fn(async () => ({ error: null })),
        };
      }),
    };
  });
  mockState.serviceRpc.mockReset();
  mockState.serviceRpc.mockImplementation(async () => ({ data: null, error: null }));
});

describe("admin competition action route security boundaries", () => {
  it("returns 401 for unauthenticated admin actions", async () => {
    mockState.user = null;

    const response = await POST(jsonRequest({ action: "set_status", competitionId: "competition-1", status: "archived" }));

    expect(response.status).toBe(401);
    expect(mockState.serviceFrom).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin staff actions", async () => {
    mockState.role = "judge";

    const response = await POST(jsonRequest({ action: "set_status", competitionId: "competition-1", status: "archived" }));

    expect(response.status).toBe(403);
    expect(mockState.serviceFrom).not.toHaveBeenCalled();
  });

  it("runs admin actions through the service-role server path", async () => {
    const response = await POST(jsonRequest({ action: "set_status", competitionId: "competition-1", status: "archived" }));

    expect(response.status).toBe(200);
    expect(mockState.serviceFrom).toHaveBeenCalledWith("competitions");
    expect(mockState.updatePayload).toEqual({ status: "archived" });
  });
});
