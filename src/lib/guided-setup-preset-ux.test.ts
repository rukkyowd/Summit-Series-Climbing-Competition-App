import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getGuidedDemoPreset } from "@/lib/competition-presets";
import { getFormatTemplate } from "@/lib/scoring";

const rootDir = process.cwd();
const creationFormSource = readFileSync(
  join(rootDir, "src", "components", "staff-event-creation-form.tsx"),
  "utf8"
);
const staffDashboardSource = readFileSync(
  join(rootDir, "src", "components", "staff-dashboard.tsx"),
  "utf8"
);

describe("guided setup preset-first UX", () => {
  it("hides the creation-shell format dropdown in guided demo setup", () => {
    expect(creationFormSource).toContain("hideFormat?: boolean");
    expect(creationFormSource).toContain('{!hideFormat ? (');
    expect(staffDashboardSource).toContain("hideFormat={demoSeedOnCreate}");
  });

  it("defaults the guided demo creation shell to the guided preset scoring rules", () => {
    const guidedPreset = getGuidedDemoPreset();

    expect(guidedPreset.format).toBe("five_on_five_off");
    expect(getFormatTemplate(guidedPreset.format).label).toBe("Five on five off");
    expect(staffDashboardSource).toContain("demoSeedOnCreate ? GUIDED_DEMO_INITIAL_PRESET.format");
  });

  it("renders preset-selected scoring rules as read-only summary copy", () => {
    expect(staffDashboardSource).toContain("Scoring rules");
    expect(staffDashboardSource).toContain('selectedGuidedSetupPreset.id !== "custom"');
    expect(staffDashboardSource).toContain(
      "The preset controls this so scoring, schedule, and stages stay aligned."
    );
  });

  it("unlocks an editable scoring-rules dropdown only for Custom setup", () => {
    expect(staffDashboardSource).toContain('selectedGuidedSetupPreset.id === "custom"');
    expect(staffDashboardSource).toContain("custom-event-scoring-rules");
    expect(staffDashboardSource).toContain('aria-label="Scoring rules"');
  });
});
