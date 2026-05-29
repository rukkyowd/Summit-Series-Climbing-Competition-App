import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();
const demoPageSource = readFileSync(join(rootDir, "src", "app", "demo", "page.tsx"), "utf8");
const demoEntrySource = readFileSync(join(rootDir, "src", "components", "demo-entry.tsx"), "utf8");
const staffDashboardSource = readFileSync(join(rootDir, "src", "components", "staff-dashboard.tsx"), "utf8");
const publicOverviewSource = readFileSync(join(rootDir, "src", "app", "c", "[slug]", "page.tsx"), "utf8");
const publicLeaderboardSource = readFileSync(join(rootDir, "src", "app", "c", "[slug]", "leaderboard", "page.tsx"), "utf8");

describe("guided demo workflow UX", () => {
  it("uses the real workflow entry on /demo instead of the local sandbox", () => {
    expect(demoPageSource).toContain('import { DemoEntry } from "@/components/demo-entry"');
    expect(demoPageSource).toContain("<DemoEntry demos={demos} />");
    expect(demoPageSource).not.toContain("GuidedSandboxExperience");
    expect(demoEntrySource).toContain('navigateWithDemoLoading("/staff/new?demo=act1")');
  });

  it("shows organizer and result readiness from demo progress state", () => {
    expect(demoEntrySource).toContain("progress?:");
    expect(demoEntrySource).toContain("keyScoreCorrected");
    expect(demoEntrySource).toContain("organizerAdvanced");
    expect(demoEntrySource).toContain("Skip to Organizer");
    expect(demoEntrySource).toContain("Correction pending");
  });

  it("does not hard-code the judge correction as complete after act 2", () => {
    expect(staffDashboardSource).not.toContain("keyScoreCorrected: true");
    expect(publicOverviewSource).not.toContain("keyScoreCorrected: true");
    expect(publicLeaderboardSource).not.toContain("keyScoreCorrected: true");
    expect(staffDashboardSource).toContain("organizerDemoKeyScoreCorrected");
    expect(publicOverviewSource).toContain("publicDemoKeyScoreCorrected");
    expect(publicLeaderboardSource).toContain("leaderboardDemoKeyScoreCorrected");
  });

  it("keeps public act 4 reveal client-side instead of calling the write stream", () => {
    expect(publicOverviewSource).not.toContain('/api/demo/finals-results/stream');
    expect(publicOverviewSource).toContain("setRevealedFinalsScoreCount");
    expect(publicOverviewSource).toContain("Organizer Dashboard");
  });
});
