import { describe, expect, it } from "vitest";
import { getDemoLoadingCopyForHref } from "@/lib/demo-loading";

describe("demo loading copy", () => {
  it("chooses handoff copy for demo act routes", () => {
    expect(getDemoLoadingCopyForHref("/staff/new?demo=act1")).toMatchObject({
      title: "Opening event setup...",
    });
    expect(getDemoLoadingCopyForHref("/staff/c/summit-demo/judge?demo=act2")).toMatchObject({
      title: "Opening judge panel...",
    });
    expect(getDemoLoadingCopyForHref("/staff/c/summit-demo?demo=act3")).toMatchObject({
      title: "Opening organizer dashboard...",
    });
    expect(getDemoLoadingCopyForHref("/c/summit-demo?demo=act4")).toMatchObject({
      title: "Opening public results...",
    });
  });

  it("uses finish and detour copy for demo support links", () => {
    expect(getDemoLoadingCopyForHref("/demo")).toMatchObject({
      text: "Taking you back to the walkthrough start.",
    });
    expect(getDemoLoadingCopyForHref("/staff/new")).toMatchObject({
      title: "Opening real event setup...",
    });
    expect(getDemoLoadingCopyForHref("/c/summit-demo/leaderboard?demo=act4")).toMatchObject({
      title: "Opening live leaderboard...",
    });
  });
});
