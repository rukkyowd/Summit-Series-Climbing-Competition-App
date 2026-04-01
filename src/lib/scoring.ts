export const DEFAULT_TOTAL_CLIMBS = 30;
export const DEFAULT_MAX_CLIMBERS = 80;
export const DEFAULT_QUALIFIER_COUNTING_CLIMBS = 6;
export const DEFAULT_FINALS_CUTOFF = 6;
export const DEFAULT_FINALS_PROBLEM_COUNT = 4;
export const DEFAULT_FINALS_ELIGIBLE_AGE_GROUPS = ["Open"] as const;
export const QUALIFIER_PENALTY_PER_EXTRA_ATTEMPT = 200;
export const QUALIFIER_MAX_PENALIZED_EXTRA_ATTEMPTS = 3;
export const FINAL_TOP_POINTS = 25;
export const FINAL_ZONE_POINTS = 10;
export const FINAL_ATTEMPT_DEDUCTION = 0.1;
export const ACTIVE_EVENT_ID = 1;

export const EVENT_FORMATS = [
  "scramble",
  "five_on_five_off",
  "flash_format",
  "ifsc_finals_format",
] as const;

export const SCHEDULE_PHASE_TYPES = [
  "check_in",
  "technical_meeting",
  "isolation",
  "qualifier_round",
  "wall_reset",
  "observation",
  "finals_round",
  "results",
  "custom",
] as const;

export const CATEGORY_DIVISIONS = ["Men", "Women", "X"] as const;
export const CATEGORY_AGE_GROUPS = [
  "Youth D",
  "Youth C",
  "Youth B",
  "Youth A",
  "Junior",
  "Rec",
  "Masters",
  "Open",
] as const;

export type EventFormat = (typeof EVENT_FORMATS)[number];
export type AttemptEnteredBy = "climber" | "staff";
export type FinalEnteredBy = "staff";
export type StageMode = "qualifier" | "finals";
export type CategoryDivision = (typeof CATEGORY_DIVISIONS)[number];
export type CategoryAgeGroup = (typeof CATEGORY_AGE_GROUPS)[number];
export type SchedulePhaseType = (typeof SCHEDULE_PHASE_TYPES)[number];

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
  phase_type: SchedulePhaseType;
  audience_label: string;
  is_active: boolean;
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
  stage_mode: StageMode;
  total_climbs: number;
  max_climbers: number;
  qualifier_counting_climbs: number;
  finals_cutoff: 6 | 8;
  finals_tie_advances: boolean;
  finals_eligible_age_groups: string[];
  qualifier_locked_at: string | null;
  finals_started_at: string | null;
  finals_problem_count: number;
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

export interface FinalProblemResult {
  climb_number: number;
  top: boolean;
  zone: boolean;
  attempts_to_top: number | null;
  attempts_to_zone: number | null;
  points: number;
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
  total_points: number;
  previous_round_rank: number;
  tops: number;
  zones: number;
  attempts_to_top: number;
  attempts_to_zone: number;
  overall_rank: number;
  category_rank: number;
  attempts: FinalAttempt[];
  problem_results: FinalProblemResult[];
}

export interface FinalistSelection {
  climber_id: string;
  name: string;
  category_id: string | null;
  display_category: string;
  gender_division: string;
  age_group: string;
  qualifier_rank: number;
  advanced_with_tie: boolean;
  created_at?: string;
}

export interface RegistrationChoice {
  category: EventCategory;
  slots: Array<EventTimeSlot & { remaining_capacity: number }>;
}

export interface FinalsSummary {
  total_points: number;
  tops: number;
  zones: number;
  attempts_to_top: number;
  attempts_to_zone: number;
}

export interface WorkflowRoleGuide {
  role: string;
  title: string;
  detail: string;
}

export interface EventWorkflowGuide {
  headline: string;
  summary: string;
  notes: string[];
  roles: WorkflowRoleGuide[];
}

export interface SchedulePhaseOption {
  value: SchedulePhaseType;
  label: string;
  description: string;
}

export function createCategoryKey(genderDivision: string, ageGroup: string) {
  return `${genderDivision}::${ageGroup}`;
}

export function getDefaultEventCategories(): EventCategory[] {
  return CATEGORY_DIVISIONS.flatMap((division, divisionIndex) =>
    CATEGORY_AGE_GROUPS.map((ageGroup, ageIndex) => ({
      id: createCategoryKey(division, ageGroup),
      event_id: ACTIVE_EVENT_ID,
      gender_division: division,
      age_group: ageGroup,
      display_name: buildDisplayCategory(division, ageGroup),
      sort_order: divisionIndex * CATEGORY_AGE_GROUPS.length + ageIndex,
    }))
  );
}

export function normalizeFinalsEligibleAgeGroups(value: unknown) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_FINALS_ELIGIBLE_AGE_GROUPS];
  }

  const allowed = new Set(CATEGORY_AGE_GROUPS);
  const normalized = value.filter((entry): entry is string => typeof entry === "string" && allowed.has(entry as CategoryAgeGroup));

  return normalized.length ? normalized : [...DEFAULT_FINALS_ELIGIBLE_AGE_GROUPS];
}

export function isFinalsEligibleCategory(
  event: Pick<EventConfig, "finals_eligible_age_groups">,
  genderDivision: string,
  ageGroup: string
) {
  return (
    (genderDivision === "Men" || genderDivision === "Women") &&
    event.finals_eligible_age_groups.includes(ageGroup)
  );
}

export const FORMAT_TEMPLATES: FormatTemplate[] = [
  {
    value: "scramble",
    label: "Scramble",
    short_label: "Scramble",
    description: "Open qualifier scoring built for recreational scramble sessions with self-scoring and live rankings.",
    supports_finals: false,
    scheduling_hint: "Best for recreational check-in windows and flexible scramble sessions where climbers score from their phone.",
  },
  {
    value: "five_on_five_off",
    label: "Five on five off",
    short_label: "5 on / 5 off",
    description: "Competitive qualifier mode for fixed start lists, five-on and five-off rotations, and stricter session timing.",
    supports_finals: false,
    scheduling_hint: "Best when athletes rotate through fixed groups, transit zones, and official time windows.",
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
    description: "Judge-operated finals mode with four finals boulders and the 2025 IFSC points system.",
    supports_finals: true,
    scheduling_hint: "Best when finalists move together through a dedicated finals round after qualifiers.",
  },
];

export const SCHEDULE_PHASE_OPTIONS: SchedulePhaseOption[] = [
  {
    value: "check_in",
    label: "Check-in",
    description: "Good for arrival windows, late registration, waivers, and athlete check-in.",
  },
  {
    value: "technical_meeting",
    label: "Technical meeting",
    description: "Use for rules briefings or round instructions before climbing starts.",
  },
  {
    value: "isolation",
    label: "Isolation",
    description: "Use when athletes must be present in isolation before the round can begin.",
  },
  {
    value: "qualifier_round",
    label: "Qualifier round",
    description: "The live qualifier climbing window.",
  },
  {
    value: "wall_reset",
    label: "Wall reset",
    description: "Use for strip and reset blocks when the gym is between rounds.",
  },
  {
    value: "observation",
    label: "Observation",
    description: "Use for finals observation or a scheduled preview block.",
  },
  {
    value: "finals_round",
    label: "Finals round",
    description: "The live finals climbing window.",
  },
  {
    value: "results",
    label: "Results",
    description: "Results posting, raffle, prizing, or awards.",
  },
  {
    value: "custom",
    label: "Custom",
    description: "A flexible block for anything else in the day-of schedule.",
  },
];

export const DEFAULT_EVENT_CONFIG: EventConfig = {
  id: ACTIVE_EVENT_ID,
  name: "Current Event",
  format: "scramble",
  stage_mode: "qualifier",
  total_climbs: DEFAULT_TOTAL_CLIMBS,
  max_climbers: DEFAULT_MAX_CLIMBERS,
  qualifier_counting_climbs: DEFAULT_QUALIFIER_COUNTING_CLIMBS,
  finals_cutoff: DEFAULT_FINALS_CUTOFF,
  finals_tie_advances: true,
  finals_eligible_age_groups: [...DEFAULT_FINALS_ELIGIBLE_AGE_GROUPS],
  qualifier_locked_at: null,
  finals_started_at: null,
  finals_problem_count: DEFAULT_FINALS_PROBLEM_COUNT,
  categories: [],
  time_slots: [],
};

export function getFormatTemplate(format: EventFormat): FormatTemplate {
  return FORMAT_TEMPLATES.find((template) => template.value === format) ?? FORMAT_TEMPLATES[0];
}

export function formatSupportsFinals(format: EventFormat) {
  return getFormatTemplate(format).supports_finals;
}

export function formatUsesSelfScoredQualifiers(format: EventFormat) {
  return format === "scramble";
}

export function isQualifierStage(event: Pick<EventConfig, "stage_mode">) {
  return event.stage_mode === "qualifier";
}

export function isFinalsStage(event: Pick<EventConfig, "stage_mode">) {
  return event.stage_mode === "finals";
}

export function getEventWorkflowGuide(
  event: Pick<EventConfig, "format" | "stage_mode">
): EventWorkflowGuide {
  if (event.stage_mode === "finals") {
    return {
      headline: "Finals round live",
      summary:
        "Registration is closed, finalists move as one group through four finals boulders, and judges control all scoring.",
      notes: [
        "Finals advancement follows the event's configured finals age groups across Men and Women divisions.",
        "Finals scoring uses the 2025 IFSC points system, with qualifier rank used for count-back.",
        "Climbers should follow the official presentation, observation, transit, and start order instead of self-scoring.",
      ],
      roles: [
        {
          role: "Admin",
          title: "Run the finals session",
          detail: "Keep the public finals board live, confirm finalists, and avoid reopening qualifier edits.",
        },
        {
          role: "Judge",
          title: "Enter top and zone results",
          detail: "Use the scorecard page to record zone, top, and attempts for each finalist on each finals boulder.",
        },
        {
          role: "Climber",
          title: "Follow finals call-up",
          detail: "Finalists do not self-score. They wait for their group movement and judge-recorded attempts.",
        },
      ],
    };
  }

  if (event.format === "five_on_five_off") {
    return {
      headline: "Competitive qualifier with fixed rotations",
      summary:
        "This mode fits youth competitive qualifiers with an official start list, a prescribed order, and a five-on, five-off rhythm.",
      notes: [
        "Athletes should start on the assigned boulder and rotate in order; no ad hoc rescheduling.",
        "Rest periods match the rotation window, and climbers move through transit without watching unattempted boulders.",
        "Use time slots as check-in, isolation, and round windows so the phone view mirrors the day-of schedule.",
      ],
      roles: [
        {
          role: "Admin",
          title: "Publish the running order",
          detail: "Set clear slot labels for check-in, isolation, technical meeting, and qualifier blocks so athletes know where they belong.",
        },
        {
          role: "Judge",
          title: "Operate by start list",
          detail: "Open the scorecard page by climber and follow the official rotation instead of treating the round like an open scramble.",
        },
        {
          role: "Climber",
          title: "Check the schedule first",
          detail: "Use the website to confirm category, slot, and timing, then follow the official order on the wall.",
        },
      ],
    };
  }

  if (event.format === "flash_format") {
    return {
      headline: "Flash-format qualifier",
      summary:
        "This mode keeps qualifier scoring but is better for scheduled sessions where athletes move with set observation and start information.",
      notes: [
        "Use time slots to publish session timing, observation windows, and athlete groupings.",
        "The website should guide athletes to the right session rather than make them guess which page matters next.",
        "Staff can still review qualifier scoring while public users mainly need schedule clarity and live standings.",
      ],
      roles: [
        {
          role: "Admin",
          title: "Label each session clearly",
          detail: "Make slot names read like schedule blocks so families and athletes can quickly see what happens next.",
        },
        {
          role: "Judge",
          title: "Keep scoring aligned to the session",
          detail: "Use the scorecard page during the assigned flash round and avoid mixing athletes between sessions.",
        },
        {
          role: "Climber",
          title: "Watch your session timing",
          detail: "Check in for the published block, then follow staff instruction for observation and attempts.",
        },
      ],
    };
  }

  return {
    headline: "Open scramble qualifier",
    summary:
      "This mode is best for recreational climbers who register themselves, grab a private scorecard link, and log attempts live from their phone.",
    notes: [
      "Use time slots as check-in windows or scramble sessions so the public page feels like a clear day-of schedule.",
      "Climbers can move more freely than in competitive qualifiers, but they should still see exactly where to register and where to return for scoring.",
      "If you later advance to finals, the app freezes qualifier edits and switches the board into judge-run finals mode.",
    ],
    roles: [
      {
        role: "Admin",
        title: "Set up the day flow",
        detail: "Name the sessions in plain language like check-in, scramble block, or raffle so mobile users do not have to decode the schedule.",
      },
      {
        role: "Judge",
        title: "Override only when needed",
        detail: "Most qualifier scoring can happen from private climber links, with staff stepping in only for corrections.",
      },
      {
        role: "Climber",
        title: "Register and self-score",
        detail: "Register on your phone, save the private scorecard link, and use My Scorecard to jump back after viewing standings.",
      },
    ],
  };
}

export function formatSchedulePhaseLabel(phaseType: SchedulePhaseType) {
  return SCHEDULE_PHASE_OPTIONS.find((option) => option.value === phaseType)?.label ?? "Custom";
}

export function getSchedulePhaseDescription(phaseType: SchedulePhaseType) {
  return (
    SCHEDULE_PHASE_OPTIONS.find((option) => option.value === phaseType)?.description ??
    "This block helps explain what is happening right now."
  );
}

export function getActiveScheduleBlock(event: Pick<EventConfig, "time_slots">) {
  return event.time_slots.find((slot) => slot.is_active) ?? null;
}

export function schedulePhaseAllowsRegistration(phaseType: SchedulePhaseType) {
  return (
    phaseType === "check_in" ||
    phaseType === "technical_meeting" ||
    phaseType === "qualifier_round" ||
    phaseType === "custom"
  );
}

export function schedulePhaseAllowsQualifierScoring(phaseType: SchedulePhaseType) {
  return phaseType === "qualifier_round" || phaseType === "custom";
}

export function schedulePhaseAllowsFinalsScoring(phaseType: SchedulePhaseType) {
  return phaseType === "finals_round" || phaseType === "custom";
}

export function schedulePhaseBlocksMovement(phaseType: SchedulePhaseType) {
  return phaseType === "isolation" || phaseType === "wall_reset" || phaseType === "results";
}

export function canRegisterDuringEvent(event: Pick<EventConfig, "stage_mode" | "time_slots">) {
  if (event.stage_mode !== "qualifier") {
    return false;
  }

  const activeBlock = getActiveScheduleBlock(event);
  return activeBlock ? schedulePhaseAllowsRegistration(activeBlock.phase_type) : true;
}

export function canClimberSelfScoreQualifier(
  event: Pick<EventConfig, "format" | "stage_mode" | "time_slots">
) {
  if (event.stage_mode !== "qualifier" || !formatUsesSelfScoredQualifiers(event.format)) {
    return false;
  }

  const activeBlock = getActiveScheduleBlock(event);
  return activeBlock ? schedulePhaseAllowsQualifierScoring(activeBlock.phase_type) : true;
}

export function canStaffScoreQualifier(event: Pick<EventConfig, "stage_mode" | "time_slots">) {
  if (event.stage_mode !== "qualifier") {
    return false;
  }

  const activeBlock = getActiveScheduleBlock(event);
  return activeBlock ? schedulePhaseAllowsQualifierScoring(activeBlock.phase_type) : true;
}

export function canStaffScoreFinals(event: Pick<EventConfig, "stage_mode" | "time_slots">) {
  if (event.stage_mode !== "finals") {
    return false;
  }

  const activeBlock = getActiveScheduleBlock(event);
  return activeBlock ? schedulePhaseAllowsFinalsScoring(activeBlock.phase_type) : true;
}

function parseScheduleTimeToMinutes(value: string | null | undefined) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const hourValue = Number(match[1]);
  const minuteValue = Number(match[2]);
  const meridiem = match[3];

  if (
    Number.isNaN(hourValue) ||
    Number.isNaN(minuteValue) ||
    hourValue < 1 ||
    hourValue > 12 ||
    minuteValue < 0 ||
    minuteValue > 59
  ) {
    return Number.MAX_SAFE_INTEGER;
  }

  let hour24 = hourValue % 12;
  if (meridiem === "PM") {
    hour24 += 12;
  }

  return hour24 * 60 + minuteValue;
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
  const normalizedCategories = (categories.length ? categories : getDefaultEventCategories())
    .map((category, index) => ({
      ...category,
      id: createCategoryKey(category.gender_division, category.age_group),
      event_id: ACTIVE_EVENT_ID,
      sort_order: category.sort_order ?? index,
      display_name: buildDisplayCategory(category.gender_division, category.age_group),
    }))
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order || left.display_name.localeCompare(right.display_name)
    );

  const nextStageMode = (event?.stage_mode ?? DEFAULT_EVENT_CONFIG.stage_mode) as StageMode;
  let activeSlotSeen = false;

  return {
    id: ACTIVE_EVENT_ID,
    name: event?.name?.trim() || DEFAULT_EVENT_CONFIG.name,
    format: nextFormat,
    stage_mode: nextStageMode === "finals" ? "finals" : "qualifier",
    total_climbs: clampNumber(event?.total_climbs, 1, 200, DEFAULT_TOTAL_CLIMBS),
    max_climbers: clampNumber(event?.max_climbers, 1, 1000, DEFAULT_MAX_CLIMBERS),
    qualifier_counting_climbs: clampNumber(
      event?.qualifier_counting_climbs,
      1,
      20,
      DEFAULT_QUALIFIER_COUNTING_CLIMBS
    ),
    finals_cutoff:
      clampNumber(event?.finals_cutoff, 6, 8, DEFAULT_FINALS_CUTOFF) >= 8 ? 8 : 6,
    finals_tie_advances: event?.finals_tie_advances ?? true,
    finals_eligible_age_groups: normalizeFinalsEligibleAgeGroups(event?.finals_eligible_age_groups),
    qualifier_locked_at: event?.qualifier_locked_at ?? null,
    finals_started_at: event?.finals_started_at ?? null,
    finals_problem_count: clampNumber(
      event?.finals_problem_count,
      DEFAULT_FINALS_PROBLEM_COUNT,
      DEFAULT_FINALS_PROBLEM_COUNT,
      DEFAULT_FINALS_PROBLEM_COUNT
    ),
    updated_at: event?.updated_at,
    categories: normalizedCategories,
    time_slots: timeSlots
      .map((slot) => ({
        ...slot,
        event_id: ACTIVE_EVENT_ID,
        phase_type: (slot.phase_type ?? "custom") as SchedulePhaseType,
        audience_label: slot.audience_label?.trim() ?? "",
        is_active: (() => {
          if (!slot.is_active || activeSlotSeen) {
            return false;
          }

          activeSlotSeen = true;
          return true;
        })(),
        eligible_category_ids: [...(slot.eligible_category_ids ?? [])],
      }))
      .sort((left, right) => {
        if (left.is_active !== right.is_active) {
          return left.is_active ? -1 : 1;
        }

        const leftStart = parseScheduleTimeToMinutes(left.start_time);
        const rightStart = parseScheduleTimeToMinutes(right.start_time);
        if (leftStart !== rightStart) {
          return leftStart - rightStart;
        }

        return left.label.localeCompare(right.label);
      }),
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

export function normalizeSuccessfulAttempts(attemptCount: number | null | undefined) {
  if (typeof attemptCount !== "number" || Number.isNaN(attemptCount)) {
    return 1;
  }

  return Math.max(1, Math.round(attemptCount));
}

function roundTenths(value: number) {
  return Math.round(value * 10) / 10;
}

export function calculateFinalAttemptPoints(attempt: Partial<FinalAttempt>) {
  const topPoints = attempt.top
    ? FINAL_TOP_POINTS - (normalizeSuccessfulAttempts(attempt.attempts_to_top) - 1) * FINAL_ATTEMPT_DEDUCTION
    : 0;
  const zonePoints = attempt.zone
    ? FINAL_ZONE_POINTS - (normalizeSuccessfulAttempts(attempt.attempts_to_zone) - 1) * FINAL_ATTEMPT_DEDUCTION
    : 0;

  return Math.max(0, roundTenths(Math.max(topPoints, zonePoints)));
}

export function buildFinalProblemResults(
  attempts: FinalAttempt[],
  finalsProblemCount: number
): FinalProblemResult[] {
  const attemptMap = new Map<number, FinalAttempt>();

  attempts.forEach((attempt) => {
    attemptMap.set(attempt.climb_number, attempt);
  });

  return Array.from({ length: finalsProblemCount }, (_, index) => {
    const climbNumber = index + 1;
    const attempt = attemptMap.get(climbNumber);

    return {
      climb_number: climbNumber,
      top: attempt?.top ?? false,
      zone: attempt?.zone ?? false,
      attempts_to_top: attempt?.top ? normalizeSuccessfulAttempts(attempt.attempts_to_top) : null,
      attempts_to_zone: attempt?.zone ? normalizeSuccessfulAttempts(attempt.attempts_to_zone) : null,
      points: calculateFinalAttemptPoints(attempt ?? { climb_number: climbNumber, top: false, zone: false }),
    };
  });
}

export function summarizeFinalProblemResults(problemResults: FinalProblemResult[]): FinalsSummary {
  return problemResults.reduce<FinalsSummary>(
    (summary, problem) => {
      summary.total_points = roundTenths(summary.total_points + problem.points);

      if (problem.top) {
        summary.tops += 1;
        summary.attempts_to_top += problem.attempts_to_top ?? 0;
      }

      if (problem.zone) {
        summary.zones += 1;
        summary.attempts_to_zone += problem.attempts_to_zone ?? 0;
      }

      return summary;
    },
    {
      total_points: 0,
      tops: 0,
      zones: 0,
      attempts_to_top: 0,
      attempts_to_zone: 0,
    }
  );
}

export function buildFinalsLeaderboard(
  climbers: ClimberWithAttempts[],
  finalists: FinalistSelection[],
  event: EventConfig
): FinalsLeaderboardEntry[] {
  const climberMap = new Map(climbers.map((climber) => [climber.id, climber]));

  const entries = finalists.flatMap((finalist) => {
    const climber = climberMap.get(finalist.climber_id);
    if (!climber) {
      return [];
    }

    const problemResults = buildFinalProblemResults(climber.final_attempts, event.finals_problem_count);
    const summary = summarizeFinalProblemResults(problemResults);

    return [
      {
        climber_id: climber.id,
        name: climber.name,
        climber_number: climber.climber_number,
        province: climber.province,
        category_id: climber.category_id,
        display_category: climber.display_category,
        gender_division: climber.gender_division,
        age_group: climber.age_group,
        total_points: summary.total_points,
        previous_round_rank: finalist.qualifier_rank,
        tops: summary.tops,
        zones: summary.zones,
        attempts_to_top: summary.attempts_to_top,
        attempts_to_zone: summary.attempts_to_zone,
        overall_rank: 0,
        category_rank: 0,
        attempts: [...climber.final_attempts].sort((left, right) => left.climb_number - right.climb_number),
        problem_results: problemResults,
      },
    ];
  });

  entries.sort(compareFinalsEntries);
  return assignRanks(entries, "overall_rank", "category_rank");
}

export function compareFinalsEntries(left: FinalsLeaderboardEntry, right: FinalsLeaderboardEntry) {
  if (right.total_points !== left.total_points) {
    return right.total_points - left.total_points;
  }

  if (left.previous_round_rank !== right.previous_round_rank) {
    return left.previous_round_rank - right.previous_round_rank;
  }

  return left.name.localeCompare(right.name);
}

export function pickFinalists(
  qualifierEntries: QualifierLeaderboardEntry[],
  event: EventConfig
): FinalistSelection[] {
  const byCategory = new Map<string, QualifierLeaderboardEntry[]>();

  qualifierEntries.forEach((entry) => {
    if (!isFinalsEligibleCategory(event, entry.gender_division, entry.age_group)) {
      return;
    }

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
          gender_division: entry.gender_division,
          age_group: entry.age_group,
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
          gender_division: entry.gender_division,
          age_group: entry.age_group,
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

    if (left.qualifier_rank !== right.qualifier_rank) {
      return left.qualifier_rank - right.qualifier_rank;
    }

    return left.name.localeCompare(right.name);
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
      .filter((slot) => schedulePhaseAllowsRegistration(slot.phase_type))
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
    return "No schedule block";
  }

  return event.time_slots.find((slot) => slot.id === slotId)?.label ?? "No schedule block";
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

export function formatFinalPoints(points: number) {
  return points.toFixed(1);
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
    finalsLeft.total_points === finalsRight.total_points &&
    finalsLeft.previous_round_rank === finalsRight.previous_round_rank
  );
}
