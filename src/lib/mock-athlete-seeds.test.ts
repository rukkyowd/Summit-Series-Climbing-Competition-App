import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  MOCK_ATHLETE_CURATED_FULL_NAMES,
  MOCK_ATHLETE_FIRST_NAMES,
  MOCK_ATHLETE_FULL_NAME_POOL,
  MOCK_ATHLETE_LAST_NAMES,
} from "./mock-athlete-name-pool";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("mock athlete name pool", () => {
  it("ships a large deterministic pool with low repetition risk", () => {
    expect(MOCK_ATHLETE_CURATED_FULL_NAMES.length).toBeGreaterThan(200);
    expect(MOCK_ATHLETE_FIRST_NAMES.length).toBeGreaterThan(200);
    expect(MOCK_ATHLETE_LAST_NAMES.length).toBeGreaterThan(200);
    expect(MOCK_ATHLETE_FULL_NAME_POOL.length).toBeGreaterThan(800);

    const normalized = new Set(MOCK_ATHLETE_FULL_NAME_POOL.map((name) => name.toLowerCase()));
    expect(normalized.size).toBe(MOCK_ATHLETE_FULL_NAME_POOL.length);
    expect(MOCK_ATHLETE_FULL_NAME_POOL.some((name) => name.includes("'"))).toBe(true);
  });
});

describe("mock seed sql", () => {
  it("uses the expanded name pool instead of the old tiny inline rotations", () => {
    const mockEventsSql = readFileSync(path.join(repoRoot, "sql", "mock-events-seed.sql"), "utf8");
    const springSendRegistrationSql = readFileSync(
      path.join(repoRoot, "sql", "spring-send", "02-seed-registrations.sql"),
      "utf8"
    );

    expect(mockEventsSql).not.toContain("'Avery','Jordan','Parker'");
    expect(mockEventsSql).toContain(`% ${MOCK_ATHLETE_FULL_NAME_POOL.length})] as name`);

    expect(springSendRegistrationSql).not.toContain("case ((series.n * 17) % 24)");
    expect(springSendRegistrationSql).toContain(`% ${MOCK_ATHLETE_FULL_NAME_POOL.length})] as athlete_name`);
  });

  it("keeps the richer multi-factor scoring model in both mock pipelines", () => {
    const mockEventsSql = readFileSync(path.join(repoRoot, "sql", "mock-events-seed.sql"), "utf8");
    const springSendAttemptsSql = readFileSync(
      path.join(repoRoot, "sql", "spring-send", "03-seed-qualifier-attempts.sql"),
      "utf8"
    );

    expect(mockEventsSql).toContain("athlete_profiles as");
    expect(mockEventsSql).toContain("base_strength");
    expect(mockEventsSql).toContain("consistency_band");
    expect(mockEventsSql).toContain("performance_rating");
    expect(mockEventsSql).toContain("finalist_profiles as");

    expect(springSendAttemptsSql).toContain("base_strength");
    expect(springSendAttemptsSql).toContain("consistency_band");
    expect(springSendAttemptsSql).toContain("performance_score");
    expect(springSendAttemptsSql).not.toContain("strength_band");
  });
});
