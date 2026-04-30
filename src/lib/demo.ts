import type { Competition } from "./scoring";

export const DEMO_COMPETITION_SLUG = "spring-open-2026-demo";
export const DEMO_COMPETITION_NAME = "Spring Open 2026 - Demo";
export const LEGACY_DEMO_SLUG_PREFIXES = ["mock-", "spring-send-"] as const;
export const DEMO_PITCH_CLIMBS = [
  { number: 1, shortLabel: "Blue V6", label: "Blue V6 · JS" },
  { number: 2, shortLabel: "Red V5", label: "Red V5 · ML" },
  { number: 3, shortLabel: "White V4", label: "White V4 · AB" },
  { number: 4, shortLabel: "Black V7", label: "Black V7 · CR" },
] as const;

export function getDemoPitchClimb(climbNumber: number) {
  return DEMO_PITCH_CLIMBS.find((climb) => climb.number === climbNumber) ?? null;
}

export function isLegacyDemoCompetitionSlug(slug: string | null | undefined) {
  const normalized = slug?.trim().toLowerCase() ?? "";
  return LEGACY_DEMO_SLUG_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function isCanonicalDemoCompetitionSlug(slug: string | null | undefined) {
  return (slug?.trim().toLowerCase() ?? "") === DEMO_COMPETITION_SLUG;
}

export function isDemoCompetitionRecord(
  competition:
    | Pick<Competition, "slug"> & {
        is_demo?: boolean | null;
      }
    | null
    | undefined
) {
  if (!competition) {
    return false;
  }

  if (typeof competition.is_demo === "boolean") {
    return competition.is_demo || isCanonicalDemoCompetitionSlug(competition.slug);
  }

  return isCanonicalDemoCompetitionSlug(competition.slug) || isLegacyDemoCompetitionSlug(competition.slug);
}
