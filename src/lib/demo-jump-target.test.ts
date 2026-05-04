import { describe, expect, it } from "vitest";
import { escapeDemoAnchorValue, getDemoAnchorSelector, jumpToDemoAnchor } from "./demo-jump-target";

describe("demo jump targets", () => {
  it("builds a data-anchor selector for normal demo anchors", () => {
    expect(getDemoAnchorSelector("organizer-create-name")).toBe('[data-demo-anchor="organizer-create-name"]');
  });

  it("escapes selector-breaking characters", () => {
    expect(escapeDemoAnchorValue('judge\\"target')).toBe('judge\\\\\\"target');
  });

  it("is safe when called outside the browser", () => {
    expect(jumpToDemoAnchor("missing")).toBe(false);
  });
});
