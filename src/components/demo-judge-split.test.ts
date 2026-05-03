import { describe, expect, it } from "vitest";
import { getChangedDemoClimberId } from "@/lib/demo-judge-split";

describe("demo judge split helpers", () => {
  it("extracts the changed climber id from realtime new rows", () => {
    expect(getChangedDemoClimberId({ new: { climber_id: "climber-104" } })).toBe("climber-104");
  });

  it("falls back to realtime old rows for deletes", () => {
    expect(getChangedDemoClimberId({ old: { climber_id: "climber-104" } })).toBe("climber-104");
  });

  it("ignores malformed realtime payloads without mutating anything", () => {
    expect(getChangedDemoClimberId({ new: { climber_id: 104 }, old: null })).toBeNull();
  });
});
