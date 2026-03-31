export const DEFAULT_TOTAL_CLIMBS = 30;
export const DEFAULT_MAX_CLIMBERS = 80;
export const DEFAULT_QUALIFIER_COUNTING_CLIMBS = 6;
export const DEFAULT_FINALS_CUTOFF = 6;
export const QUALIFIER_PENALTY_PER_EXTRA_ATTEMPT = 200;
export const QUALIFIER_MAX_PENALIZED_EXTRA_ATTEMPTS = 3;
export const ACTIVE_EVENT_ID = 1;

export const EVENT_FORMATS = [
  "scramble",
  "five_on_five_off",
  "flash_format",
  "ifsc_finals_format",
] as const;

export type EventFormat = (typeof EVENT_FORMATS)[number];
export type AttemptEnteredBy = "climber" | "staff";
export type FinalEnteredBy = "staff";
export type StageMode = "qualifier" | "finals";

export interface EventCategory {
  id: string;
  event_id: number;
  gender_division: string;
  age_group: string;
  display_name: string;
  sort_order: number;
  created_at?: string;
}

export interface EventTimeSlot {
  id: string;
  event_id: number;
  label: string;
  start_time: string | null;
  end_time: string | null;
  capacity: number;
  eligible_category_ids: string[];
  created_at?: string;
}

export interface EventConfig {
  id: number;
  name: string;
  format: EventFormat;
  total_climbs: number;
  max_climbers: number;
  qualifier_counting_climbs: number;
  finals_cutoff: 6 | 8;
  finals_tie_advances: boolean;
  updated_at?: string;
  categories: EventCategory[];
  time_slots: EventTimeSlot[];
}

export interface Climber {
  id: string;
  event_id: number;
  name: string;
  climber_number: string;
  province: string;
  category_id: string | null;
  gender_division: string;
  age_group: string;
  display_category: string;
  time_slot_id: string | null;
  access_token: string;
  access_token_created_at?: string;
  registered_at?: string;
}

export interface QualifierAttempt {
  id?: string;
  event_id: number;
  climber_id: string;
  climb_number: number;
  attempt_count: number;
  topped: boolean;
  entered_by: AttemptEnteredBy;
  updated_at?: string;
}

export interface FinalAttempt {
  id?: string;
  event_id: number;
  climber_id: string;
  climb_number: number;
  top: boolean;
  zone: boolean;
  attempts_to_top: number | null;
  attempts_to_zone: number | null;
  entered_by: FinalEnteredBy;
  updated_at?: string;
}

export interface ClimberWithAttempts extends Climber {
  qualifier_attempts: QualifierAttempt[];
  final_attempts: FinalAttempt[];
}

export interface FormatTemplate {
  value: EventFormat;
  label: string;
  short_label: string;
  description: string;
  supports_finals: boolean;
  scheduling_hint: string;
}

export interface ClimbDefinition {
  number: number;
  label: string;
  base_points: number;
}

export interface QualifierClimbScore {
  climb_number: number;
  topped: boolean;
  attempt_count: number;
  extra_attempts: number;
  base_points: number;
  score: number;
  counting: boolean;
}

export interface QualifierLeaderboardEntry {
  climber_id: string;
  name: string;
  climber_number: string;
  province: string;
  category_id: string | null;
  display_category: string;
  gender_division: string;
  age_group: string;
  time_slot_id: string | null;
  total_score: number;
  counting_climbs: QualifierClimbScore[];
  all_climbs: QualifierClimbScore[];
  topped_count: number;
  counting_attempt_total: number;
  overall_rank: number;
  category_rank: number;
}

export interface FinalsLeaderboardEntry {
  climber_id: string;
  name: string;
  climber_number: string;
  province: string;
  category_id: string | null;
  display_category: string;
  gender_division: string;
  age_group: string;
  tops: number;
  zones: number;
  attempts_to_top: number;
  attempts_to_zone: number;
  overall_rank: number;
  category_rank: number;
  attempts: FinalAttempt[];
}

export interface FinalistSelection {
  climber_id: string;
  name: string;
  category_id: string | null;
  display_category: string;
  qualifier_rank: number;
  advanced_with_tie: boolean;
}

export interface RegistrationChoice {
  category: EventCategory;
  slots: Array<EventTimeSlot & { remaining_capacity: number }>;
}

export interface FinalsSummary {
  tops: number;
  zones: number;
  attempts_to_top: number;
  attempts_to_zone: number;
}

export const FORMAT_TEMPLATES: FormatTemplate[] = [
  {
    value: "scramble",
    label: "Scramble",
    short_label: "Scramble",
    description: "Open qualifier scoring with self-scored best-six counting climbs and live rankings.",
    supports_finals: false,
    scheduling_hint: "Best for open gym sessions with flexible arrival and broad live visibility.",
  },
  {
    value: "five_on_five_off",
    label: "Five on five off",
    short_label: "5 on / 5 off",
    description: "Qualifier scoring with the same best-six ranking model plus slot-aware rotation planning.",
    supports_finals: false,
    scheduling_hint: "Best when athletes rotate through fixed groups and time windows.",
  },
  {
    value: "flash_format",
    label: "Flash format",
    short_label: "Flash",
    description: "Qualifier scoring with flash-format labeling and scheduled session metadata.",
    supports_finals: false,
    scheduling_hint: "Best for sessioned rounds where athletes move with set start information.",
  },
  {
    value: "ifsc_finals_format",
    label: "IFSC finals format",
    short_label: "IFSC finals",
    description: "Qualifier best-six scoring that feeds a separate IFSC-style finals stage.",
    supports_finals: true,
    scheduling_hint: "Best when the event includes a judge-operated finals round after qualifiers.",
  },
];

export const DEFAULT_EVENT_CONFIG: EventConfig = {
  id: ACTIVE_EVENT_ID,
  name: "Current Event",
  format: "scramble",
  total_climbs: DEFAULT_TOTAL_CLIMBS,
  max_climbers: DEFAULT_MAX_CLIMBERS,
  qualifier_counting_climbs: DEFAULT_QUALIFIER_COUNTING_CLIMBS,
  finals_cutoff: DEFAULT_FINALS_CUTOFF,
  finals_tie_advances: true,
  categories: [],
  time_slots: [],
};

export function getFormatTemplate(format: EventFormat): FormatTemplate {
  return FORMAT_TEMPLATES.find((template) => template.value === format) ?? FORMAT_TEMPLATES[0];
}

export function formatSupportsFinals(format: EventFormat) {
  return getFormatTemplate(format).supports_finals;
}

export function buildDisplayCategory(genderDivision: string, ageGroup: string) {
  return [genderDivision.trim(), ageGroup.trim()].filter(Boolean).join(" / ") || "Open";
}

export function normalizeCategoryDisplay(category: Partial<EventCategory>) {
  if (category.display_name?.trim()) {
    return category.display_name.trim();
  }

  return buildDisplayCategory(category.gender_division ?? "", category.age_group ?? "");
}

export function normalizeEventConfig(
  event: Partial<EventConfig> | null | undefined,
  categories: EventCategory[] = [],
  timeSlots: EventTimeSlot[] = []
): EventConfig {
  const nextFormat = (event?.format ?? DEFAULT_EVENT_CONFIG.format) as EventFormat;
  const supportsFinals = formatSupportsFinals(nextFormat);

  return {
    id: ACTIVE_EVENT_ID,
    name: event?.name?.trim() || DEFAULT_EVENT_CONFIG.name,
    format: nextFormat,
    total_climbs: clampNumber(event?.total_climbs, 1, 200, DEFAULT_TOTAL_CLIMBS),
    max_climbers: clampNumber(event?.max_climbers, 1, 1000, DEFAULT_MAX_CLIMBERS),
    qualifier_counting_climbs: clampNumber(
      event?.qualifier_counting_climbs,
      1,
      20,
      DEFAULT_QUALIFIER_COUNTING_CLIMBS
    ),
    finals_cutoff: supportsFinals
      ? (clampNumber(event?.finals_cutoff, 6, 8, DEFAULT_FINALS_CUTOFF) >= 8 ? 8 : 6)
      : DEFAULT_FINALS_CUTOFF,
    finals_tie_advances: event?.finals_tie_advances ?? true,
    updated_at: event?.updated_at,
    categories: categories
      .map((category, index) => ({
        ...category,
        event_id: ACTIVE_EVENT_ID,
        sort_order: category.sort_order ?? index,
        display_name: normalizeCategoryDisplay(category),
      }))
      .sort((left, right) => left.sort_order - right.sort_order || left.display_name.localeCompare(right.display_name)),
    time_slots: timeSlots
      .map((slot) => ({
        ...slot,
        event_id: ACTIVE_EVENT_ID,
        eligible_category_ids: [...(slot.eligible_category_ids ?? [])],
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  };
}

export function getClimbs(totalClimbs: number): ClimbDefinition[] {
  return Array.from({ length: totalClimbs }, (_, index) => {
    const number = index + 1;

    return {
      number,
      label: `Boulder ${number.toString().padStart(2, "0")}`,
      base_points: number * 1000,
    };
  });
}

export function getClimbByNumber(totalClimbs: number, climbNumber: number) {
  return getClimbs(totalClimbs).find((climb) => climb.number === climbNumber) ?? null;
}

export function calculateQualifierClimbScore(climbNumber: number, attemptCount: number, topped: boolean) {
  if (!topped) {
    return 0;
  }

  const climb = getClimbByNumber(Math.max(climbNumber, DEFAULT_TOTAL_CLIMBS), climbNumber);
  const basePoints = climb?.base_points ?? climbNumber * 1000;
  const extraAttempts = Math.max(0, attemptCount - 1);
  const cappedAttempts = Math.min(extraAttempts, QUALIFIER_MAX_PENALIZED_EXTRA_ATTEMPTS);

  return Math.max(0, basePoints - cappedAttempts * QUALIFIER_PENALTY_PER_EXTRA_ATTEMPT);
}

export function buildQualifierScoreList(
  attempts: QualifierAttempt[],
  totalClimbs: number,
  countingClimbCount: number
): QualifierClimbScore[] {
  const attemptMap = new Map<number, QualifierAttempt>();

  attempts.forEach((attempt) => {
    attemptMap.set(attempt.climb_number, attempt);
  });

  const scores = getClimbs(totalClimbs).map((climb) => {
    const attempt = attemptMap.get(climb.number);
    const topped = attempt?.topped ?? false;
    const attemptCount = attempt?.attempt_count ?? 0;
    const extraAttempts = topped ? Math.max(0, attemptCount - 1) : Math.max(0, attemptCount);

    return {
      climb_number: climb.number,
      topped,
      attempt_count: attemptCount,
      extra_attempts: extraAttempts,
      base_points: climb.base_points,
      score: calculateQualifierClimbScore(climb.number, attemptCount, topped),
      counting: false,
    };
  });

  const countingNumbers = new Set(
    [...scores]
      .filter((score) => score.score > 0)
      .sort(compareQualifierClimbScores)
      .slice(0, countingClimbCount)
      .map((score) => score.climb_number)
  );

  return scores.map((score) => ({
    ...score,
    counting: countingNumbers.has(score.climb_number),
  }));
}

export function compareQualifierClimbScores(left: QualifierClimbScore, right: QualifierClimbScore) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (right.climb_number !== left.climb_number) {
    return right.climb_number - left.climb_number;
  }

  return left.attempt_count - right.attempt_count;
}

export function buildQualifierLeaderboard(
  climbers: ClimberWithAttempts[],
  event: EventConfig
): QualifierLeaderboardEntry[] {
  const entries = climbers.map((climber) => {
    const allClimbs = buildQualifierScoreList(
      climber.qualifier_attempts,
      event.total_climbs,
      event.qualifier_counting_climbs
    );
    const countingClimbs = [...allClimbs]
      .filter((climb) => climb.counting)
      .sort(compareQualifierClimbScores);
    const totalScore = countingClimbs.reduce((sum, climb) => sum + climb.score, 0);
    const toppedCount = countingClimbs.filter((climb) => climb.topped).length;
    const countingAttemptTotal = countingClimbs.reduce((sum, climb) => sum + climb.attempt_count, 0);

    return {
      climber_id: climber.id,
      name: climber.name,
      climber_number: climber.climber_number,
      province: climber.province,
      category_id: climber.category_id,
      display_category: climber.display_category,
      gender_division: climber.gender_division,
      age_group: climber.age_group,
      time_slot_id: climber.time_slot_id,
      total_score: totalScore,
      counting_climbs: countingClimbs,
      all_climbs: allClimbs,
      topped_count: toppedCount,
      counting_attempt_total: countingAttemptTotal,
      overall_rank: 0,
      category_rank: 0,
    };
  });

  entries.sort(compareQualifierEntries);

  return assignRanks(entries, "overall_rank", "category_rank");
}

export function compareQualifierEntries(left: QualifierLeaderboardEntry, right: QualifierLeaderboardEntry) {
  if (right.total_score !== left.total_score) {
    return right.total_score - left.total_score;
  }

  if (right.topped_count !== left.topped_count) {
    return right.topped_count - left.topped_count;
  }

  if (left.counting_attempt_total !== right.counting_attempt_total) {
    return left.counting_attempt_total - right.counting_attempt_total;
  }

  const leftHighest = left.counting_climbs[0]?.climb_number ?? 0;
  const rightHighest = right.counting_climbs[0]?.climb_number ?? 0;
  if (rightHighest !== leftHighest) {
    return rightHighest - leftHighest;
  }

  return left.name.localeCompare(right.name);
}

export function summarizeFinalsAttempts(attempts: FinalAttempt[]): FinalsSummary {
  return attempts.reduce<FinalsSummary>(
    (summary, attempt) => {
      if (attempt.top) {
        summary.tops += 1;
        summary.attempts_to_top += attempt.attempts_to_top ?? 0;
      }

      if (attempt.zone) {
        summary.zones += 1;
        summary.attempts_to_zone += attempt.attempts_to_zone ?? 0;
      }

      return summary;
    },
    {
      tops: 0,
      zones: 0,
      attempts_to_top: 0,
      attempts_to_zone: 0,
    }
  );
}

export function buildFinalsLeaderboard(climbers: ClimberWithAttempts[]): FinalsLeaderboardEntry[] {
  const entries = climbers.map((climber) => {
    const summary = summarizeFinalsAttempts(climber.final_attempts);

    return {
      climber_id: climber.id,
      name: climber.name,
      climber_number: climber.climber_number,
      province: climber.province,
      category_id: climber.category_id,
      display_category: climber.display_category,
      gender_division: climber.gender_division,
      age_group: climber.age_group,
      tops: summary.tops,
      zones: summary.zones,
      attempts_to_top: summary.attempts_to_top,
      attempts_to_zone: summary.attempts_to_zone,
      overall_rank: 0,
      category_rank: 0,
      attempts: [...climber.final_attempts].sort((left, right) => left.climb_number - right.climb_number),
    };
  });

  entries.sort(compareFinalsEntries);
  return assignRanks(entries, "overall_rank", "category_rank");
}

export function compareFinalsEntries(left: FinalsLeaderboardEntry, right: FinalsLeaderboardEntry) {
  if (right.tops !== left.tops) {
    return right.tops - left.tops;
  }

  if (right.zones !== left.zones) {
    return right.zones - left.zones;
  }

  if (left.attempts_to_top !== right.attempts_to_top) {
    return left.attempts_to_top - right.attempts_to_top;
  }

  if (left.attempts_to_zone !== right.attempts_to_zone) {
    return left.attempts_to_zone - right.attempts_to_zone;
  }

  return left.name.localeCompare(right.name);
}

export function pickFinalists(
  qualifierEntries: QualifierLeaderboardEntry[],
  event: EventConfig
): FinalistSelection[] {
  if (!formatSupportsFinals(event.format)) {
    return [];
  }

  const byCategory = new Map<string, QualifierLeaderboardEntry[]>();

  qualifierEntries.forEach((entry) => {
    const key = entry.category_id ?? "__uncategorized__";
    const next = byCategory.get(key) ?? [];
    next.push(entry);
    byCategory.set(key, next);
  });

  const finalists: FinalistSelection[] = [];

  byCategory.forEach((entries) => {
    const cutoffIndex = event.finals_cutoff - 1;
    const cutoffEntry = entries[cutoffIndex];

    if (!cutoffEntry) {
      entries.forEach((entry) => {
        finalists.push({
          climber_id: entry.climber_id,
          name: entry.name,
          category_id: entry.category_id,
          display_category: entry.display_category,
          qualifier_rank: entry.category_rank,
          advanced_with_tie: false,
        });
      });
      return;
    }

    entries.forEach((entry) => {
      const withinCutoff = entry.category_rank <= event.finals_cutoff;
      const tiedAtCutoff =
        event.finals_tie_advances &&
        entry.total_score === cutoffEntry.total_score &&
        entry.topped_count === cutoffEntry.topped_count &&
        entry.counting_attempt_total === cutoffEntry.counting_attempt_total;

      if (withinCutoff || tiedAtCutoff) {
        finalists.push({
          climber_id: entry.climber_id,
          name: entry.name,
          category_id: entry.category_id,
          display_category: entry.display_category,
          qualifier_rank: entry.category_rank,
          advanced_with_tie: !withinCutoff,
        });
      }
    });
  });

  return finalists.sort((left, right) => {
    if (left.display_category !== right.display_category) {
      return left.display_category.localeCompare(right.display_category);
    }

    return left.qualifier_rank - right.qualifier_rank;
  });
}

export function buildRegistrationChoices(event: EventConfig, climbers: Climber[]): RegistrationChoice[] {
  const slotCounts = new Map<string, number>();
  climbers.forEach((climber) => {
    if (climber.time_slot_id) {
      slotCounts.set(climber.time_slot_id, (slotCounts.get(climber.time_slot_id) ?? 0) + 1);
    }
  });

  return event.categories.map((category) => {
    const slots = event.time_slots
      .filter((slot) => {
        if (!slot.eligible_category_ids.length) {
          return true;
        }

        return slot.eligible_category_ids.includes(category.id);
      })
      .map((slot) => ({
        ...slot,
        remaining_capacity: Math.max(0, slot.capacity - (slotCounts.get(slot.id) ?? 0)),
      }));

    return {
      category,
      slots,
    };
  });
}

export function getCategoryName(
  categoryId: string | null | undefined,
  event: EventConfig,
  fallback?: string
) {
  if (!categoryId) {
    return fallback ?? "Uncategorized";
  }

  return event.categories.find((category) => category.id === categoryId)?.display_name ?? fallback ?? "Uncategorized";
}

export function getTimeSlotLabel(slotId: string | null | undefined, event: EventConfig) {
  if (!slotId) {
    return "No slot";
  }

  return event.time_slots.find((slot) => slot.id === slotId)?.label ?? "No slot";
}

export function formatAttemptsLabel(attemptCount: number, succeeded: boolean) {
  if (!attemptCount) {
    return succeeded ? "Top on first go" : "No attempts";
  }

  const label = attemptCount === 1 ? "1 attempt" : `${attemptCount} attempts`;
  return succeeded ? label : `${label} logged`;
}

export function formatStageLabel(stage: StageMode) {
  return stage === "finals" ? "Finals" : "Qualifiers";
}

export function formatTimeRange(startTime: string | null, endTime: string | null) {
  if (startTime && endTime) {
    return `${startTime} - ${endTime}`;
  }

  return startTime ?? endTime ?? "Time TBD";
}

function clampNumber(value: number | null | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function assignRanks<T extends { category_id: string | null }>(
  entries: T[],
  overallKey: keyof T,
  categoryKey: keyof T
) {
  let overallRank = 1;
  const categoryPosition = new Map<string, number>();
  const categorySeen = new Map<string, number>();

  entries.forEach((entry, index) => {
    if (index > 0 && !sameRank(entries[index - 1], entry)) {
      overallRank = index + 1;
    }

    const categoryId = entry.category_id ?? "__uncategorized__";
    const seen = (categorySeen.get(categoryId) ?? 0) + 1;
    categorySeen.set(categoryId, seen);

    if (seen === 1 || !sameRank(findPreviousInCategory(entries, index - 1, categoryId), entry)) {
      categoryPosition.set(categoryId, seen);
    }

    (entry as unknown as Record<string, number>)[overallKey as string] = overallRank;
    (entry as unknown as Record<string, number>)[categoryKey as string] =
      categoryPosition.get(categoryId) ?? seen;
  });

  return entries;
}

function findPreviousInCategory<T extends { category_id: string | null }>(
  entries: T[],
  index: number,
  categoryId: string
) {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const entry = entries[cursor];
    if ((entry.category_id ?? "__uncategorized__") === categoryId) {
      return entry;
    }
  }

  return null;
}

function sameRank(left: unknown, right: unknown) {
  if (!left || !right) {
    return false;
  }

  if ("total_score" in (left as Record<string, unknown>) && "total_score" in (right as Record<string, unknown>)) {
    const qualifierLeft = left as QualifierLeaderboardEntry;
    const qualifierRight = right as QualifierLeaderboardEntry;

    return (
      qualifierLeft.total_score === qualifierRight.total_score &&
      qualifierLeft.topped_count === qualifierRight.topped_count &&
      qualifierLeft.counting_attempt_total === qualifierRight.counting_attempt_total
    );
  }

  const finalsLeft = left as FinalsLeaderboardEntry;
  const finalsRight = right as FinalsLeaderboardEntry;

  return (
    finalsLeft.tops === finalsRight.tops &&
    finalsLeft.zones === finalsRight.zones &&
    finalsLeft.attempts_to_top === finalsRight.attempts_to_top &&
    finalsLeft.attempts_to_zone === finalsRight.attempts_to_zone
  );
}
