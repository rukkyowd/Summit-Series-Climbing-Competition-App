export const DEMO_STORY_TARGET_ROLE_KEY = "athlete_c";
export const DEMO_STORY_AFFECTED_ROLE_KEY = "athlete_b";
export const DEMO_STORY_TARGET_CATEGORY = {
  genderDivision: "Men",
  ageGroup: "Youth B",
  displayCategory: "Men / Youth B",
} as const;

export type DemoStoryClimberIdentity = {
  id: string;
  competition_id?: string;
  name: string;
  climber_number: string;
  gender_division?: string | null;
  age_group?: string | null;
  display_category?: string | null;
};

export type DemoStoryTargetMetadata = {
  scenario_version?: string;
  preset_id?: string;
  preset_name?: string;
  story_step?: string;
  finals_ineligible_age_groups?: string[];
  drama_pair?: string[];
  drama_target_climber?: string;
  target_climber_id?: string;
  drama_target_climber_name?: string;
  target_climber_name?: string;
  drama_target_climber_number?: string;
  target_climber_number?: string;
  drama_target_role?: string;
  target_role?: string;
  drama_target_category?: string;
  target_category?: string;
  drama_target_climb_number?: number;
  target_climb_number?: number;
  drama_target_attempts_before?: number;
  target_attempts_before?: number;
  drama_target_attempts_after?: number;
  target_attempts_after?: number;
  drama_description?: string;
  drama_affected_climber?: string;
  affected_climber_id?: string;
  drama_affected_climber_name?: string;
  affected_climber_name?: string;
  drama_affected_climber_number?: string;
  affected_climber_number?: string;
  drama_affected_role?: string;
  affected_role?: string;
  [key: string]: unknown;
};

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function matchesTargetCategory(climber: DemoStoryClimberIdentity) {
  return (
    normalizeText(climber.gender_division) === normalizeText(DEMO_STORY_TARGET_CATEGORY.genderDivision) &&
    normalizeText(climber.age_group) === normalizeText(DEMO_STORY_TARGET_CATEGORY.ageGroup)
  );
}

export function findDemoStoryClimberFromMetadata(
  climbers: readonly DemoStoryClimberIdentity[],
  metadata: DemoStoryTargetMetadata | null | undefined,
  role: "target" | "affected" = "target"
) {
  const source = metadata ?? {};

  const id =
    role === "target"
      ? source.target_climber_id ?? source.drama_target_climber
      : source.affected_climber_id ?? source.drama_affected_climber;
  const byId = id ? climbers.find((climber) => climber.id === id) ?? null : null;
  if (byId) {
    return byId;
  }

  const number =
    role === "target"
      ? source.target_climber_number ?? source.drama_target_climber_number
      : source.affected_climber_number ?? source.drama_affected_climber_number;
  const name =
    role === "target"
      ? source.target_climber_name ?? source.drama_target_climber_name
      : source.affected_climber_name ?? source.drama_affected_climber_name;
  const roleKey =
    role === "target"
      ? source.target_role ?? source.drama_target_role ?? DEMO_STORY_TARGET_ROLE_KEY
      : source.affected_role ?? source.drama_affected_role ?? DEMO_STORY_AFFECTED_ROLE_KEY;

  const categoryMatches = climbers.filter(matchesTargetCategory);
  const scopedClimbers = categoryMatches.length ? categoryMatches : climbers;

  if (number) {
    const byNumber = scopedClimbers.find((climber) => climber.climber_number === number) ?? null;
    if (byNumber) {
      return byNumber;
    }
  }

  if (name) {
    const normalizedName = normalizeText(name);
    const byName = scopedClimbers.find((climber) => normalizeText(climber.name) === normalizedName) ?? null;
    if (byName) {
      return byName;
    }
  }

  if (roleKey === DEMO_STORY_TARGET_ROLE_KEY) {
    return [...scopedClimbers].sort((left, right) =>
      left.climber_number.localeCompare(right.climber_number, undefined, { numeric: true })
    )[2] ?? null;
  }

  if (roleKey === DEMO_STORY_AFFECTED_ROLE_KEY) {
    return [...scopedClimbers].sort((left, right) =>
      left.climber_number.localeCompare(right.climber_number, undefined, { numeric: true })
    )[1] ?? null;
  }

  return null;
}

export function buildDemoStoryMetadataForClimbers(input: {
  baseMetadata: DemoStoryTargetMetadata;
  targetClimber: DemoStoryClimberIdentity;
  affectedClimber: DemoStoryClimberIdentity;
}) {
  const { baseMetadata, targetClimber, affectedClimber } = input;

  return {
    ...baseMetadata,
    drama_pair: [affectedClimber.id, targetClimber.id],
    drama_target_climber: targetClimber.id,
    target_climber_id: targetClimber.id,
    drama_target_climber_name: targetClimber.name,
    target_climber_name: targetClimber.name,
    drama_target_climber_number: targetClimber.climber_number,
    target_climber_number: targetClimber.climber_number,
    drama_target_role: DEMO_STORY_TARGET_ROLE_KEY,
    target_role: DEMO_STORY_TARGET_ROLE_KEY,
    drama_target_category: DEMO_STORY_TARGET_CATEGORY.displayCategory,
    target_category: DEMO_STORY_TARGET_CATEGORY.displayCategory,
    drama_target_climb_number: 3,
    target_climb_number: 3,
    drama_target_attempts_before: 3,
    target_attempts_before: 3,
    drama_target_attempts_after: 1,
    target_attempts_after: 1,
    drama_description: `${targetClimber.name} tops Boulder 3 in 1 attempt instead of 3 and jumps past ${affectedClimber.name} at the finals cut line on attempts.`,
    drama_affected_climber: affectedClimber.id,
    affected_climber_id: affectedClimber.id,
    drama_affected_climber_name: affectedClimber.name,
    affected_climber_name: affectedClimber.name,
    drama_affected_climber_number: affectedClimber.climber_number,
    affected_climber_number: affectedClimber.climber_number,
    drama_affected_role: DEMO_STORY_AFFECTED_ROLE_KEY,
    affected_role: DEMO_STORY_AFFECTED_ROLE_KEY,
  } satisfies DemoStoryTargetMetadata;
}
