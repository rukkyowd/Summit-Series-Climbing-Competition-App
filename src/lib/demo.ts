import type { Competition } from "./scoring";

export const DEMO_COMPETITION_SLUG = "spring-open-2026-demo";
export const DEMO_COMPETITION_NAME = "Spring Open 2026 - Demo";
export const LEGACY_DEMO_SLUG_PREFIXES = ["mock-", "spring-send-"] as const;

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

  return Boolean(competition.is_demo) || isCanonicalDemoCompetitionSlug(competition.slug) || isLegacyDemoCompetitionSlug(competition.slug);
}
