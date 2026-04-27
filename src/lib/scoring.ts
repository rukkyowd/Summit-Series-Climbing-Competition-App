export const DEFAULT_TOTAL_CLIMBS = 30;
export const DEFAULT_MAX_CLIMBERS = 80;
export const DEFAULT_QUALIFIER_COUNTING_CLIMBS = 6;
export const DEFAULT_FINALS_CUTOFF = 6;
export const DEFAULT_FINALS_PROBLEM_COUNT = 4;
export const DEFAULT_FINALS_ELIGIBLE_AGE_GROUPS = ["Open"] as const;
export const DEFAULT_CEC_FLASH_PROBLEMS = 6;
export const DEFAULT_CEC_SENIOR_NATIONALS_PROBLEMS = 12;
export const QUALIFIER_PENALTY_PER_EXTRA_ATTEMPT = 200;
export const QUALIFIER_MAX_PENALIZED_EXTRA_ATTEMPTS = 3;
export const FINAL_TOP_POINTS = 25;
export const FINAL_ZONE_POINTS = 10;
export const FINAL_ATTEMPT_DEDUCTION = 0.1;
export const CLIMBER_NUMBER_PATTERN = /^\d{1,4}$/;

export const COMPETITION_STATUSES = ["active", "archived"] as const;
export const EVENT_FORMATS = [
  "scramble",
  "five_on_five_off",
  "flash_format",
  "ifsc_finals_format",
] as const;
export const COMPETITION_PHASES = [
  "qualifier_open",
  "qualifier_closed",
  "wall_reset",
  "observation",
  "finals_open",
  "finals_closed",
  "results",
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
export const DEFAULT_QUALIFIER_ELIGIBLE_AGE_GROUPS = [...CATEGORY_AGE_GROUPS] as const;

export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];
export type EventFormat = (typeof EVENT_FORMATS)[number];
export type CompetitionPhase = (typeof COMPETITION_PHASES)[number];
export type StageMode = "qualifier" | "finals";
export type AttemptEnteredBy = "climber" | "staff";
export type FinalEnteredBy = "staff";
export type SchedulePhaseType = (typeof SCHEDULE_PHASE_TYPES)[number];
export type CategoryAgeGroup = (typeof CATEGORY_AGE_GROUPS)[number];
export type CompetitionRoundType = "qualifier" | "semifinal" | "finals";
export type CompetitionRoundStatus = "pending" | "active" | "scoring" | "closed" | "results";
export type CompetitionRoundScoringBucket = "none" | "qualifier" | "finals";

export interface FormatCapabilities {
  selfScoredQualifier: boolean;
  officialPointsQualifier: boolean;
  supportsZone: boolean;
  supportsFinals: boolean;
  finalsIsolation: boolean;
  roundBased: boolean;
  countingClimbsFixed: boolean;
  qualifierScoringUnit: "climb_points" | "ifsc_points";
}

export interface CompetitionCategory {
  id: string;
  competition_id: string;
  gender_division: string;
  age_group: string;
  display_name: string;
  sort_order: number;
  created_at?: string;
}

export interface CompetitionScheduleBlock {
  id: string;
  competition_id: string;
  round_id?: string | null;
  sort_order?: number;
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

export interface CompetitionRound {
  id: string;
  competition_id: string;
  round_number: number;
  sort_order: number;
  name: string;
  round_type: CompetitionRoundType;
  format: EventFormat;
  status: CompetitionRoundStatus;
  runtime_phase: CompetitionPhase;
  is_enabled: boolean;
  is_active: boolean;
  activated_at: string | null;
  problem_count: number;
  counting_climbs: number | null;
  finals_cutoff: 6 | 8 | null;
  eligible_category_ids: string[];
  advancement_source_round_id: string | null;
  advancement_cutoff: number | null;
  scoring_bucket: CompetitionRoundScoringBucket;
  scoring_config: Record<string, unknown>;
  started_at: string | null;
  closed_at: string | null;
  created_at?: string;
}

export interface Competition {
  id: string;
  slug: string;
  name: string;
  status: CompetitionStatus;
  format: EventFormat;
  current_phase: CompetitionPhase;
  discipline_label: string;
  stage_mode: StageMode;
  location_name: string;
  start_date: string | null;
  end_date: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  description: string;
  hero_image_url: string;
  official_event_url: string;
  official_registration_url: string;
  official_schedule_url: string;
  total_climbs: number;
  max_climbers: number;
  qualifier_counting_climbs: number;
  has_finals: boolean;
  finals_cutoff: 6 | 8;
  finals_tie_advances: boolean;
  qualifier_eligible_age_groups: string[];
  finals_eligible_age_groups: string[];
  qualifier_locked_at: string | null;
  finals_started_at: string | null;
  finals_problem_count: number;
  updated_at?: string;
  categories: CompetitionCategory[];
  schedule_blocks: CompetitionScheduleBlock[];
  rounds?: CompetitionRound[];
}

export interface CompetitionSummary {
  competition: Competition;
  climber_count: number;
  finalist_count: number;
  active_schedule_block: CompetitionScheduleBlock | null;
  registration_open: boolean;
  live_now: boolean;
}

export interface Climber {
  id: string;
  competition_id: string;
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
  competition_id: string;
  round_id: string | null;
  climber_id: string;
  climb_number: number;
  attempt_count: number;
  zone: boolean;
  topped: boolean;
  attempts_to_top: number | null;
  attempts_to_zone: number | null;
  entered_by: AttemptEnteredBy;
  updated_at?: string;
}

export interface FinalAttempt {
  id?: string;
  competition_id: string;
  round_id: string | null;
  climber_id: string;
  climb_number: number;
  top: boolean;
  zone: boolean;
  attempts_to_top: number | null;
  attempts_to_zone: number | null;
  entered_by: FinalEnteredBy;
  updated_at?: string;
}

export interface BoulderQueueEntry {
  id?: string;
  competition_id: string;
  climber_id: string;
  schedule_block_id: string;
  climb_number: number;
  checked_in_at: string;
  climber_name: string;
  climber_number: string;
  display_category: string;
  province: string;
  time_slot_id: string | null;
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

export interface SchedulePhaseOption {
  value: SchedulePhaseType;
  label: string;
  description: string;
}

export interface ClimbDefinition {
  number: number;
  label: string;
  base_points: number;
}

export interface QualifierClimbScore {
  climb_number: number;
  zone: boolean;
  topped: boolean;
  attempt_count: number;
  extra_attempts: number;
  attempts_to_top: number | null;
  attempts_to_zone: number | null;
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
  zone_count: number;
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
  climbing_order?: number;
  created_at?: string;
}

export interface RegistrationChoice {
  category: CompetitionCategory;
  slots: Array<CompetitionScheduleBlock & { remaining_capacity: number }>;
}

export interface FinalsSummary {
  total_points: number;
  tops: number;
  zones: number;
  attempts_to_top: number;
  attempts_to_zone: number;
}

export type CompetitionLifecycleLabel = "Live / Ongoing" | "Upcoming" | "Future" | "Past";

export function createCategoryKey(genderDivision: string, ageGroup: string) {
  return `${genderDivision}::${ageGroup}`;
}

export function slugifyCompetitionName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "competition";
}

export function buildCompetitionPath(slug: string, section?: "" | "register" | "scorecard" | "leaderboard") {
  const cleanSlug = slug.trim();
  if (!section) {
    return `/c/${cleanSlug}`;
  }

  return `/c/${cleanSlug}/${section}`;
}

export function buildDisplayPath(slug: string) {
  return `/c/${slug.trim()}/display`;
}

export function buildStaffCompetitionPath(slug: string, section?: "" | "judge" | "preflight") {
  const cleanSlug = slug.trim();
  if (!section) {
    return `/staff/c/${cleanSlug}`;
  }

  return `/staff/c/${cleanSlug}/${section}`;
}

export function buildDisplayCategory(genderDivision: string, ageGroup: string) {
  return [genderDivision.trim(), ageGroup.trim()].filter(Boolean).join(" / ") || "Open";
}

export function getRoundStatusForCompetition(competition: Pick<Competition, "current_phase">, roundType: "qualifier" | "finals") {
  if (roundType === "qualifier") {
    switch (competition.current_phase) {
      case "qualifier_open":
        return "active" as const;
      case "qualifier_closed":
      case "wall_reset":
      case "observation":
      case "finals_open":
      case "finals_closed":
      case "results":
        return "closed" as const;
      default:
        return "pending" as const;
    }
  }

  switch (competition.current_phase) {
    case "observation":
      return "scoring" as const;
    case "finals_open":
      return "active" as const;
    case "finals_closed":
      return "closed" as const;
    case "results":
      return "results" as const;
    default:
      return "pending" as const;
  }
}

export function createCompetitionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `competition-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getDefaultCompetitionCategories(competitionId: string): CompetitionCategory[] {
  return CATEGORY_DIVISIONS.flatMap((division, divisionIndex) =>
    CATEGORY_AGE_GROUPS.map((ageGroup, ageIndex) => ({
      id: createCategoryKey(division, ageGroup),
      competition_id: competitionId,
      gender_division: division,
      age_group: ageGroup,
      display_name: buildDisplayCategory(division, ageGroup),
      sort_order: divisionIndex * CATEGORY_AGE_GROUPS.length + ageIndex,
    }))
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
    description:
      "Competitive qualifier mode for fixed start lists, five minutes on and five minutes off, judge-run scoring, and official 2025 points-based top and zone results.",
    supports_finals: true,
    scheduling_hint: "Best when athletes rotate through fixed groups, transit zones, and official time windows.",
  },
  {
    value: "flash_format",
    label: "CEC Boulder Flash Qualifier",
    short_label: "CEC Flash",
    description:
      "Official-style CEC boulder qualifier with six problems, four minutes on and four minutes off, 15-second transitions, and 2025 points scoring.",
    supports_finals: true,
    scheduling_hint:
      "Best for sanctioned-style flash qualifiers where staff score tops, zones, and attempts while athletes rotate through fixed problems.",
  },
  {
    value: "ifsc_finals_format",
    label: "CEC / IFSC Isolation Finals",
    short_label: "Isolation finals",
    description:
      "Judge-operated isolation final with four boulders, eight finalists by default, overlapping athlete flow, and the 2025 IFSC points system.",
    supports_finals: true,
    scheduling_hint: "Best when finalists move together through a dedicated finals round after qualifiers.",
  },
];

const FORMAT_CAPABILITIES: Record<EventFormat, FormatCapabilities> = {
  scramble: {
    selfScoredQualifier: true,
    officialPointsQualifier: false,
    supportsZone: false,
    supportsFinals: false,
    finalsIsolation: false,
    roundBased: false,
    countingClimbsFixed: false,
    qualifierScoringUnit: "climb_points",
  },
  five_on_five_off: {
    selfScoredQualifier: false,
    officialPointsQualifier: true,
    supportsZone: true,
    supportsFinals: true,
    finalsIsolation: false,
    roundBased: true,
    countingClimbsFixed: true,
    qualifierScoringUnit: "ifsc_points",
  },
  flash_format: {
    selfScoredQualifier: false,
    officialPointsQualifier: true,
    supportsZone: true,
    supportsFinals: true,
    finalsIsolation: false,
    roundBased: true,
    countingClimbsFixed: true,
    qualifierScoringUnit: "ifsc_points",
  },
  ifsc_finals_format: {
    selfScoredQualifier: false,
    officialPointsQualifier: true,
    supportsZone: true,
    supportsFinals: true,
    finalsIsolation: true,
    roundBased: true,
    countingClimbsFixed: true,
    qualifierScoringUnit: "ifsc_points",
  },
};

const RECOMMENDED_FINALS_CUTOFFS: Record<EventFormat, 6 | 8> = {
  scramble: DEFAULT_FINALS_CUTOFF,
  five_on_five_off: DEFAULT_FINALS_CUTOFF,
  flash_format: 8,
  ifsc_finals_format: 8,
};

export const SCHEDULE_PHASE_OPTIONS: SchedulePhaseOption[] = [
  { value: "check_in", label: "Check-in", description: "Good for arrival windows, late registration, waivers, and athlete check-in." },
  { value: "technical_meeting", label: "Technical meeting", description: "Use for rules briefings or round instructions before climbing starts." },
  { value: "isolation", label: "Isolation", description: "Use when athletes must be present in isolation before the round can begin." },
  { value: "qualifier_round", label: "Qualifier round", description: "The live qualifier climbing window." },
  { value: "wall_reset", label: "Wall reset", description: "Use for strip and reset blocks when the gym is between rounds." },
  { value: "observation", label: "Observation", description: "Use for finals observation or a scheduled preview block." },
  { value: "finals_round", label: "Finals round", description: "The live finals climbing window." },
  { value: "results", label: "Results", description: "Results posting, raffle, prizing, or awards." },
  { value: "custom", label: "Custom", description: "A flexible block for anything else in the day-of schedule." },
];

export const DEFAULT_COMPETITION: Competition = {
  id: "placeholder-competition",
  slug: "competition",
  name: "Current Competition",
  status: "active",
  format: "scramble",
  current_phase: "qualifier_open",
  discipline_label: "Boulder",
  stage_mode: "qualifier",
  location_name: "",
  start_date: null,
  end_date: null,
  registration_opens_at: null,
  registration_closes_at: null,
  description: "",
  hero_image_url: "",
  official_event_url: "",
  official_registration_url: "",
  official_schedule_url: "",
  total_climbs: DEFAULT_TOTAL_CLIMBS,
  max_climbers: DEFAULT_MAX_CLIMBERS,
  qualifier_counting_climbs: DEFAULT_QUALIFIER_COUNTING_CLIMBS,
  has_finals: true,
  finals_cutoff: DEFAULT_FINALS_CUTOFF,
  finals_tie_advances: true,
  qualifier_eligible_age_groups: [...DEFAULT_QUALIFIER_ELIGIBLE_AGE_GROUPS],
  finals_eligible_age_groups: [...DEFAULT_FINALS_ELIGIBLE_AGE_GROUPS],
  qualifier_locked_at: null,
  finals_started_at: null,
  finals_problem_count: DEFAULT_FINALS_PROBLEM_COUNT,
  categories: [],
  schedule_blocks: [],
};

type DemoCompetitionTiming = {
  startOffsetDays: number;
  endOffsetDays?: number;
  registrationOpensOffsetMs?: number;
  registrationClosesOffsetMs?: number;
  qualifierLockedOffsetMs?: number;
  finalsStartedOffsetMs?: number;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const DEMO_COMPETITION_TIMINGS: Record<string, DemoCompetitionTiming> = {
  "spring-send-recreational": {
    startOffsetDays: 0,
    endOffsetDays: 0,
    registrationOpensOffsetMs: -14 * DAY,
    registrationClosesOffsetMs: 5 * HOUR,
  },
  "spring-send-youth": {
    startOffsetDays: 7,
    endOffsetDays: 7,
    registrationOpensOffsetMs: -7 * DAY,
    registrationClosesOffsetMs: 6 * DAY,
  },
  "mock-rec-scramble-live": {
    startOffsetDays: 0,
    endOffsetDays: 0,
    registrationOpensOffsetMs: -18 * DAY,
    registrationClosesOffsetMs: 2 * HOUR,
  },
  "mock-youth-series-live": {
    startOffsetDays: 0,
    endOffsetDays: 0,
    registrationOpensOffsetMs: -32 * DAY,
    registrationClosesOffsetMs: 90 * 60 * 1000,
  },
  "mock-flash-upcoming": {
    startOffsetDays: 14,
    endOffsetDays: 15,
    registrationOpensOffsetMs: 2 * DAY,
    registrationClosesOffsetMs: 12 * DAY,
  },
  "mock-national-finals-live": {
    startOffsetDays: 0,
    endOffsetDays: 0,
    registrationOpensOffsetMs: -30 * DAY,
    registrationClosesOffsetMs: -8 * HOUR,
    qualifierLockedOffsetMs: -4 * HOUR,
    finalsStartedOffsetMs: -40 * 60 * 1000,
  },
  "mock-city-boulder-results": {
    startOffsetDays: -7,
    endOffsetDays: -7,
    registrationOpensOffsetMs: -40 * DAY,
    registrationClosesOffsetMs: -8 * DAY,
    qualifierLockedOffsetMs: -(7 * DAY + 5 * HOUR),
    finalsStartedOffsetMs: -(7 * DAY + 2 * HOUR),
  },
  "mock-scramble-upcoming": {
    startOffsetDays: 30,
    endOffsetDays: 30,
    registrationOpensOffsetMs: 7 * DAY,
    registrationClosesOffsetMs: 28 * DAY,
  },
};

function formatDateOnly(date: Date) {
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function applyOffset(date: Date, offsetMs: number) {
  return new Date(date.getTime() + offsetMs).toISOString();
}

function realignDemoCompetitionTimeline(competition: Competition): Competition {
  const timing = DEMO_COMPETITION_TIMINGS[competition.slug];
  if (!timing) {
    return competition;
  }

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + timing.startOffsetDays);

  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + (timing.endOffsetDays ?? timing.startOffsetDays));

  return {
    ...competition,
    start_date: formatDateOnly(start),
    end_date: formatDateOnly(end),
    registration_opens_at:
      timing.registrationOpensOffsetMs !== undefined
        ? applyOffset(now, timing.registrationOpensOffsetMs)
        : competition.registration_opens_at,
    registration_closes_at:
      timing.registrationClosesOffsetMs !== undefined
        ? applyOffset(now, timing.registrationClosesOffsetMs)
        : competition.registration_closes_at,
    qualifier_locked_at:
      timing.qualifierLockedOffsetMs !== undefined
        ? applyOffset(now, timing.qualifierLockedOffsetMs)
        : competition.qualifier_locked_at,
    finals_started_at:
      timing.finalsStartedOffsetMs !== undefined
        ? applyOffset(now, timing.finalsStartedOffsetMs)
        : competition.finals_started_at,
  };
}

export function getFormatTemplate(format: EventFormat) {
  return FORMAT_TEMPLATES.find((template) => template.value === format) ?? FORMAT_TEMPLATES[0];
}

export function getFormatCapabilities(format: EventFormat): FormatCapabilities {
  return FORMAT_CAPABILITIES[format] ?? FORMAT_CAPABILITIES.scramble;
}

export function formatSupportsFinals(format: EventFormat) {
  return getFormatCapabilities(format).supportsFinals;
}

export function competitionAllowsOptionalFinals(format: EventFormat) {
  return format === "scramble";
}

export function competitionHasFinals(competition: Pick<Competition, "format" | "has_finals">) {
  if (competitionAllowsOptionalFinals(competition.format)) {
    return competition.has_finals;
  }

  return true;
}

export function formatUsesOfficialQualifierPoints(format: EventFormat) {
  return getFormatCapabilities(format).officialPointsQualifier;
}

export function formatUsesSelfScoredQualifiers(format: EventFormat) {
  return getFormatCapabilities(format).selfScoredQualifier;
}

export function getRecommendedQualifierClimbCount(format: EventFormat) {
  return formatUsesOfficialQualifierPoints(format) ? DEFAULT_CEC_FLASH_PROBLEMS : DEFAULT_TOTAL_CLIMBS;
}

export function getRecommendedQualifierCountingClimbs(format: EventFormat) {
  return formatUsesOfficialQualifierPoints(format)
    ? getRecommendedQualifierClimbCount(format)
    : DEFAULT_QUALIFIER_COUNTING_CLIMBS;
}

export function getRecommendedFinalsCutoff(format: EventFormat) {
  return RECOMMENDED_FINALS_CUTOFFS[format] ?? DEFAULT_FINALS_CUTOFF;
}

export function createCompetitionRoundId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `round-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getRoundRuntimePhase(roundType: CompetitionRoundType): CompetitionPhase {
  switch (roundType) {
    case "qualifier":
      return "qualifier_open";
    case "semifinal":
      return "wall_reset";
    case "finals":
      return "finals_open";
    default:
      return "qualifier_open";
  }
}

export function getRoundDefaultScoringBucket(roundType: CompetitionRoundType): CompetitionRoundScoringBucket {
  switch (roundType) {
    case "qualifier":
    case "semifinal":
      return "qualifier";
    case "finals":
      return "finals";
    default:
      return "none";
  }
}

export function getRoundLabel(roundType: CompetitionRoundType, index: number) {
  switch (roundType) {
    case "qualifier":
      return index === 0 ? "Qualifier" : `Qualifier ${index + 1}`;
    case "semifinal":
      return index === 0 ? "Semifinal" : `Semifinal ${index + 1}`;
    case "finals":
      return index === 0 ? "Finals" : `Finals ${index + 1}`;
    default:
      return `Round ${index + 1}`;
  }
}

export function buildDefaultCompetitionRounds(
  competition: Pick<
    Competition,
    | "id"
    | "format"
    | "current_phase"
    | "registration_opens_at"
    | "total_climbs"
    | "qualifier_counting_climbs"
    | "finals_cutoff"
    | "finals_problem_count"
    | "has_finals"
    | "qualifier_eligible_age_groups"
    | "finals_eligible_age_groups"
    | "qualifier_locked_at"
    | "finals_started_at"
  >
): CompetitionRound[] {
  const baseRounds: CompetitionRound[] = [
    {
      id: createCompetitionRoundId(),
      competition_id: competition.id,
      round_number: 1,
      sort_order: 1,
      name: "Qualifier",
      round_type: "qualifier",
      format: competition.format,
      status: getRoundStatusForCompetition(competition, "qualifier"),
      runtime_phase: "qualifier_open",
      is_enabled: true,
      is_active: phaseToStageMode(competition.current_phase) === "qualifier",
      activated_at: competition.current_phase === "qualifier_open" ? competition.registration_opens_at ?? null : null,
      problem_count: competition.total_climbs,
      counting_climbs: competition.qualifier_counting_climbs,
      finals_cutoff: competitionHasFinals(competition) ? competition.finals_cutoff : null,
      eligible_category_ids: [],
      advancement_source_round_id: null,
      advancement_cutoff: competitionHasFinals(competition) ? competition.finals_cutoff : null,
      scoring_bucket: "qualifier",
      scoring_config: {},
      started_at: competition.current_phase === "qualifier_open" ? competition.registration_opens_at ?? null : null,
      closed_at: competition.current_phase === "qualifier_open" ? null : competition.qualifier_locked_at ?? null,
    },
  ];

  if (!competitionHasFinals(competition)) {
    return baseRounds;
  }

  return [
    ...baseRounds,
    {
      id: createCompetitionRoundId(),
      competition_id: competition.id,
      round_number: 2,
      sort_order: 2,
      name: "Finals",
      round_type: "finals",
      format: "ifsc_finals_format",
      status: getRoundStatusForCompetition(competition, "finals"),
      runtime_phase: "finals_open",
      is_enabled: true,
      is_active: phaseToStageMode(competition.current_phase) === "finals",
      activated_at:
        competition.current_phase === "observation" ||
        competition.current_phase === "finals_open" ||
        competition.current_phase === "finals_closed" ||
        competition.current_phase === "results"
          ? competition.finals_started_at ?? null
          : null,
      problem_count: competition.finals_problem_count,
      counting_climbs: null,
      finals_cutoff: competition.finals_cutoff,
      eligible_category_ids: [],
      advancement_source_round_id: baseRounds[0].id,
      advancement_cutoff: competition.finals_cutoff,
      scoring_bucket: "finals",
      scoring_config: {},
      started_at: competition.finals_started_at ?? null,
      closed_at:
        competition.current_phase === "finals_closed" || competition.current_phase === "results"
          ? competition.finals_started_at ?? null
          : null,
    },
  ];
}

export function normalizeCompetitionRounds(
  rounds: CompetitionRound[] | null | undefined,
  competition: Pick<
    Competition,
    | "id"
    | "format"
    | "current_phase"
    | "registration_opens_at"
    | "total_climbs"
    | "qualifier_counting_climbs"
    | "finals_cutoff"
    | "finals_problem_count"
    | "has_finals"
    | "qualifier_eligible_age_groups"
    | "finals_eligible_age_groups"
    | "qualifier_locked_at"
    | "finals_started_at"
  >
): CompetitionRound[] {
  const sourceRounds = rounds?.length ? rounds : buildDefaultCompetitionRounds(competition);
  const explicitActiveRoundId = sourceRounds.find((round) => round.is_active)?.id ?? null;
  let activeRoundSeen = false;
  const qualifierFallbackCount = clampNumber(
    competition.qualifier_counting_climbs,
    1,
    20,
    getRecommendedQualifierCountingClimbs(competition.format)
  );

  return sourceRounds
    .map((round, index) => {
      const roundType = (round.round_type ?? "qualifier") as CompetitionRoundType;
      const scoringBucket = (round.scoring_bucket ?? getRoundDefaultScoringBucket(roundType)) as CompetitionRoundScoringBucket;
      const normalizedRuntimePhase = (round.runtime_phase ?? getRoundRuntimePhase(roundType)) as CompetitionPhase;
      const activeForPhase =
        phaseToStageMode(competition.current_phase) === "qualifier"
          ? scoringBucket === "qualifier"
          : scoringBucket === "finals";
      const isActive = explicitActiveRoundId
        ? round.id === explicitActiveRoundId
        : round.is_active && !activeRoundSeen
          ? true
          : !activeRoundSeen && activeForPhase;

      if (isActive) {
        activeRoundSeen = true;
      }

      return {
        ...round,
        id: round.id || createCompetitionRoundId(),
        competition_id: competition.id,
        round_number: round.round_number ?? index + 1,
        sort_order: round.sort_order ?? round.round_number ?? index + 1,
        name: round.name?.trim() || getRoundLabel(roundType, index),
        round_type: roundType,
        format: (round.format ?? (roundType === "finals" ? "ifsc_finals_format" : competition.format)) as EventFormat,
        status: (round.status ?? (roundType === "finals"
          ? getRoundStatusForCompetition(competition, "finals")
          : roundType === "qualifier"
            ? getRoundStatusForCompetition(competition, "qualifier")
            : "pending")) as CompetitionRoundStatus,
        runtime_phase: normalizedRuntimePhase,
        is_enabled: round.is_enabled ?? true,
        is_active: isActive,
        activated_at: round.activated_at ?? (isActive ? round.started_at ?? null : null),
        problem_count: clampNumber(
          round.problem_count,
          1,
          roundType === "finals" ? 8 : 200,
          roundType === "finals" ? competition.finals_problem_count : competition.total_climbs
        ),
        counting_climbs:
          roundType === "finals"
            ? null
            : clampNumber(round.counting_climbs, 1, 20, qualifierFallbackCount),
        finals_cutoff:
          roundType === "qualifier" || roundType === "finals"
            ? ((clampNumber(round.finals_cutoff, 6, 8, competition.finals_cutoff) >= 8 ? 8 : 6) as 6 | 8)
            : null,
        eligible_category_ids: [...(round.eligible_category_ids ?? [])],
        advancement_source_round_id: round.advancement_source_round_id ?? null,
        advancement_cutoff: round.advancement_cutoff ?? (scoringBucket === "finals" ? competition.finals_cutoff : null),
        scoring_bucket:
          roundType === "finals"
            ? scoringBucket === "none"
              ? "none"
              : "finals"
            : scoringBucket === "qualifier"
              ? "qualifier"
              : "none",
        scoring_config:
          round.scoring_config && typeof round.scoring_config === "object" && !Array.isArray(round.scoring_config)
            ? round.scoring_config
            : {},
        started_at: round.started_at ?? null,
        closed_at: round.closed_at ?? null,
      } satisfies CompetitionRound;
    })
    .sort((left, right) => left.sort_order - right.sort_order || left.round_number - right.round_number);
}

export function phaseToStageMode(phase: CompetitionPhase): StageMode {
  if (phase === "observation" || phase === "finals_open" || phase === "finals_closed" || phase === "results") {
    return "finals";
  }

  return "qualifier";
}

export function formatCompetitionPhaseLabel(phase: CompetitionPhase) {
  switch (phase) {
    case "qualifier_open":
      return "Qualifier live";
    case "qualifier_closed":
      return "Qualifier closed";
    case "wall_reset":
      return "Wall reset";
    case "observation":
      return "Observation";
    case "finals_open":
      return "Finals live";
    case "finals_closed":
      return "Finals closed";
    case "results":
      return "Results";
    default:
      return "Qualifier live";
  }
}

export function getNextCompetitionPhase(phase: CompetitionPhase): CompetitionPhase | null {
  const phases: CompetitionPhase[] = [
    "qualifier_open",
    "qualifier_closed",
    "wall_reset",
    "observation",
    "finals_open",
    "finals_closed",
    "results",
  ];
  const index = phases.indexOf(phase);
  return index >= 0 && index < phases.length - 1 ? phases[index + 1] : null;
}

export function getPreviousCompetitionPhase(phase: CompetitionPhase): CompetitionPhase | null {
  const phases: CompetitionPhase[] = [
    "qualifier_open",
    "qualifier_closed",
    "wall_reset",
    "observation",
    "finals_open",
    "finals_closed",
    "results",
  ];
  const index = phases.indexOf(phase);
  return index > 0 ? phases[index - 1] : null;
}

export function compareCompetitionPhases(left: CompetitionPhase, right: CompetitionPhase) {
  return COMPETITION_PHASES.indexOf(left) - COMPETITION_PHASES.indexOf(right);
}

export function getCompetitionPhaseForSchedulePhase(phaseType: SchedulePhaseType): CompetitionPhase | null {
  switch (phaseType) {
    case "qualifier_round":
      return "qualifier_open";
    case "wall_reset":
      return "wall_reset";
    case "isolation":
    case "observation":
      return "observation";
    case "finals_round":
      return "finals_open";
    case "results":
      return "results";
    default:
      return null;
  }
}

export function getCompetitionPhaseSequenceFromScheduleBlocks(
  scheduleBlocks: Pick<CompetitionScheduleBlock, "label" | "phase_type" | "start_time">[]
) {
  const ordered = scheduleBlocks
    .map((block, index) => ({
      block,
      index,
      phase: getCompetitionPhaseForSchedulePhase(block.phase_type),
    }))
    .filter(
      (
        entry
      ): entry is {
        block: Pick<CompetitionScheduleBlock, "label" | "phase_type" | "start_time">;
        index: number;
        phase: CompetitionPhase;
      } => entry.phase !== null
    )
    .sort((left, right) => {
      const startDiff =
        parseScheduleTimeToMinutes(left.block.start_time) - parseScheduleTimeToMinutes(right.block.start_time);
      if (startDiff !== 0) {
        return startDiff;
      }

      return left.index - right.index;
    });

  const seen = new Set<CompetitionPhase>();
  return ordered.flatMap((entry) => {
    if (seen.has(entry.phase)) {
      return [];
    }

    seen.add(entry.phase);
    return [entry.phase];
  });
}

export function normalizeQualifierEligibleAgeGroups(value: unknown) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_QUALIFIER_ELIGIBLE_AGE_GROUPS];
  }

  const allowed = new Set(CATEGORY_AGE_GROUPS);
  const normalized = value.filter(
    (entry): entry is string => typeof entry === "string" && allowed.has(entry as CategoryAgeGroup)
  );

  return normalized.length ? normalized : [...DEFAULT_QUALIFIER_ELIGIBLE_AGE_GROUPS];
}

export function normalizeFinalsEligibleAgeGroups(value: unknown) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_FINALS_ELIGIBLE_AGE_GROUPS];
  }

  const allowed = new Set(CATEGORY_AGE_GROUPS);
  const normalized = value.filter(
    (entry): entry is string => typeof entry === "string" && allowed.has(entry as CategoryAgeGroup)
  );

  return normalized.length ? normalized : [...DEFAULT_FINALS_ELIGIBLE_AGE_GROUPS];
}

export function isFinalsEligibleCategory(
  competition: Pick<Competition, "finals_eligible_age_groups">,
  genderDivision: string,
  ageGroup: string
) {
  return (
    (genderDivision === "Men" || genderDivision === "Women") &&
    competition.finals_eligible_age_groups.includes(ageGroup)
  );
}

export function isQualifierEligibleCategory(
  competition: Pick<Competition, "qualifier_eligible_age_groups">,
  ageGroup: string
) {
  return competition.qualifier_eligible_age_groups.includes(ageGroup);
}

export function parseScheduleTimeToMinutes(value: string | null | undefined) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const normalized = value.trim().toUpperCase();
  const twelveHourMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (twelveHourMatch) {
    const hourValue = Number(twelveHourMatch[1]);
    const minuteValue = Number(twelveHourMatch[2]);
    const meridiem = twelveHourMatch[3];
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

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hourValue = Number(twentyFourHourMatch[1]);
    const minuteValue = Number(twentyFourHourMatch[2]);
    if (
      Number.isNaN(hourValue) ||
      Number.isNaN(minuteValue) ||
      hourValue < 0 ||
      hourValue > 23 ||
      minuteValue < 0 ||
      minuteValue > 59
    ) {
      return Number.MAX_SAFE_INTEGER;
    }

    return hourValue * 60 + minuteValue;
  }

  return Number.MAX_SAFE_INTEGER;
}

export function compareScheduleBlocks(left: CompetitionScheduleBlock, right: CompetitionScheduleBlock) {
  const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const leftStart = parseScheduleTimeToMinutes(left.start_time);
  const rightStart = parseScheduleTimeToMinutes(right.start_time);
  if (leftStart !== rightStart) {
    return leftStart - rightStart;
  }

  return left.label.localeCompare(right.label);
}

export function normalizeCompetition(
  competition: Partial<Competition> | null | undefined,
  categories: CompetitionCategory[] = [],
  scheduleBlocks: CompetitionScheduleBlock[] = [],
  rounds: CompetitionRound[] = []
): Competition {
  const id = competition?.id ?? createCompetitionId();
  const name = competition?.name?.trim() || DEFAULT_COMPETITION.name;
  const nextFormat = (competition?.format ?? DEFAULT_COMPETITION.format) as EventFormat;
  const defaultClimbCount = getRecommendedQualifierClimbCount(nextFormat);
  const defaultCountingClimbs = getRecommendedQualifierCountingClimbs(nextFormat);
  const defaultFinalsCutoff = getRecommendedFinalsCutoff(nextFormat);
  const nextHasFinals =
    competitionAllowsOptionalFinals(nextFormat)
      ? competition?.has_finals ?? DEFAULT_COMPETITION.has_finals
      : true;
  let activeBlockSeen = false;

  const normalized: Competition = {
    id,
    slug: slugifyCompetitionName(competition?.slug?.trim() || name),
    name,
    status: (competition?.status ?? "active") as CompetitionStatus,
    format: nextFormat,
    current_phase: (competition?.current_phase ?? (competition?.stage_mode === "finals" ? "finals_open" : "qualifier_open")) as CompetitionPhase,
    discipline_label: competition?.discipline_label?.trim() || "Boulder",
    stage_mode: phaseToStageMode(
      (competition?.current_phase ?? (competition?.stage_mode === "finals" ? "finals_open" : "qualifier_open")) as CompetitionPhase
    ),
    location_name: competition?.location_name?.trim() || "",
    start_date: competition?.start_date ?? null,
    end_date: competition?.end_date ?? null,
      registration_opens_at: competition?.registration_opens_at ?? null,
      registration_closes_at: competition?.registration_closes_at ?? null,
      description: competition?.description?.trim() || "",
      hero_image_url: competition?.hero_image_url?.trim() || "",
      official_event_url: competition?.official_event_url?.trim() || "",
      official_registration_url: competition?.official_registration_url?.trim() || "",
      official_schedule_url: competition?.official_schedule_url?.trim() || "",
      total_climbs: clampNumber(competition?.total_climbs, 1, 200, defaultClimbCount),
    max_climbers: clampNumber(competition?.max_climbers, 1, 1000, DEFAULT_MAX_CLIMBERS),
      qualifier_counting_climbs: clampNumber(
        competition?.qualifier_counting_climbs,
        1,
        20,
        defaultCountingClimbs
      ),
      has_finals: nextHasFinals,
      finals_cutoff: (clampNumber(competition?.finals_cutoff, 6, 8, defaultFinalsCutoff) >= 8 ? 8 : 6) as 6 | 8,
      finals_tie_advances: competition?.finals_tie_advances ?? true,
      qualifier_eligible_age_groups: normalizeQualifierEligibleAgeGroups(competition?.qualifier_eligible_age_groups),
      finals_eligible_age_groups: normalizeFinalsEligibleAgeGroups(competition?.finals_eligible_age_groups),
    qualifier_locked_at: competition?.qualifier_locked_at ?? null,
    finals_started_at: competition?.finals_started_at ?? null,
    finals_problem_count: clampNumber(competition?.finals_problem_count, 1, 8, DEFAULT_FINALS_PROBLEM_COUNT),
    updated_at: competition?.updated_at,
    categories: (categories.length ? categories : getDefaultCompetitionCategories(id))
      .map((category, index) => ({
        ...category,
        id: createCategoryKey(category.gender_division, category.age_group),
        competition_id: id,
        display_name: buildDisplayCategory(category.gender_division, category.age_group),
        sort_order: category.sort_order ?? index,
      }))
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order || left.display_name.localeCompare(right.display_name)
      ),
    schedule_blocks: scheduleBlocks
      .map((block, index) => ({
        ...block,
        competition_id: id,
        round_id: block.round_id ?? null,
        sort_order: block.sort_order ?? index,
        audience_label: block.audience_label?.trim() ?? "",
        phase_type: (block.phase_type ?? "custom") as SchedulePhaseType,
        is_active: (() => {
          if (!block.is_active || activeBlockSeen) {
            return false;
          }
          activeBlockSeen = true;
          return true;
        })(),
        eligible_category_ids: [...(block.eligible_category_ids ?? [])],
      }))
      .sort(compareScheduleBlocks),
    rounds: [],
  };

  normalized.rounds = normalizeCompetitionRounds(rounds, normalized);

  return realignDemoCompetitionTimeline(normalized);
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

export function getActiveScheduleBlock(competition: Pick<Competition, "schedule_blocks">) {
  return competition.schedule_blocks.find((block) => block.is_active) ?? null;
}

export function schedulePhaseAllowsRegistration(phaseType: SchedulePhaseType) {
  return phaseType === "qualifier_round";
}

export function getRegistrationAssignmentLabel(competition: Pick<Competition, "format">) {
  return formatUsesSelfScoredQualifiers(competition.format) ? "Session" : "Start group";
}

export function getRegistrationAssignmentHelpText(competition: Pick<Competition, "format">) {
  return formatUsesSelfScoredQualifiers(competition.format)
    ? "Choose the open session window you will climb in. Many climbers can score during the same session."
    : "Choose the qualifier wave or start group. Staff can still publish the full official start list separately.";
}

export function normalizeClimberNumberInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function isValidClimberNumber(value: string) {
  return CLIMBER_NUMBER_PATTERN.test(value.trim());
}

export function schedulePhaseAllowsQualifierScoring(phaseType: SchedulePhaseType) {
  return phaseType === "qualifier_round" || phaseType === "custom";
}

export function schedulePhaseAllowsFinalsScoring(phaseType: SchedulePhaseType) {
  return phaseType === "finals_round" || phaseType === "custom";
}

export function canRegisterDuringCompetition(competition: Pick<Competition, "current_phase">) {
  return canRegisterForCompetition(competition);
}

export function canClimberSelfScoreQualifier(
  competition: Pick<Competition, "format" | "current_phase">
) {
  return competition.current_phase === "qualifier_open" && formatUsesSelfScoredQualifiers(competition.format);
}

export function getActiveQueueSessionBlock(
  competition: Pick<Competition, "format" | "current_phase" | "schedule_blocks">
) {
  if (!canClimberSelfScoreQualifier(competition)) {
    return null;
  }

  const activeBlock = getActiveScheduleBlock(competition);
  if (!activeBlock) {
    return null;
  }

  return schedulePhaseAllowsQualifierScoring(activeBlock.phase_type) ? activeBlock : null;
}

export function canUseLiveBoulderQueue(
  competition: Pick<Competition, "format" | "current_phase" | "schedule_blocks">
) {
  return getActiveQueueSessionBlock(competition) !== null;
}

export function canStaffScoreQualifier(competition: Pick<Competition, "current_phase">) {
  return competition.current_phase === "qualifier_open";
}

export function canStaffScoreFinals(competition: Pick<Competition, "current_phase">) {
  return competition.current_phase === "finals_open";
}

function parseDateTimeBoundary(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function canRegisterForCompetition(
  competition: Pick<Competition, "current_phase"> &
    Partial<Pick<Competition, "status" | "registration_opens_at" | "registration_closes_at">>
) {
  const status = competition.status ?? "active";
  if (status !== "active") {
    return false;
  }

  if (!["qualifier_open", "qualifier_closed"].includes(competition.current_phase)) {
    return false;
  }

  const opensAt = parseDateTimeBoundary(competition.registration_opens_at);
  const closesAt = parseDateTimeBoundary(competition.registration_closes_at);
  const hasExplicitWindow = Boolean(opensAt || closesAt);
  const now = new Date();

  if (opensAt && now < opensAt) {
    return false;
  }

  if (closesAt && now > closesAt) {
    return false;
  }

  if (hasExplicitWindow) {
    return true;
  }

  return competition.current_phase === "qualifier_open";
}

export function isCompetitionLiveNow(
  competition: Pick<Competition, "current_phase" | "status"> & {
    schedule_blocks?: Pick<CompetitionScheduleBlock, "phase_type" | "is_active">[];
  }
) {
  if (competition.status !== "active") {
    return false;
  }

  if (competition.current_phase === "qualifier_open" || competition.current_phase === "finals_open") {
    return true;
  }

  const activeScheduleBlock = competition.schedule_blocks?.find((block) => block.is_active);
  if (!activeScheduleBlock) {
    return false;
  }

  return activeScheduleBlock.phase_type === "qualifier_round" || activeScheduleBlock.phase_type === "finals_round";
}

function parseDateOnlyBoundary(value: string | null | undefined, endOfDay = false) {
  if (!value) {
    return null;
  }

  const normalized = endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00.000`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getCompetitionLifecycleLabel(
  competition: Pick<Competition, "status" | "current_phase" | "start_date" | "end_date"> & {
    schedule_blocks?: Pick<CompetitionScheduleBlock, "phase_type" | "is_active">[];
  }
): CompetitionLifecycleLabel {
  const now = new Date();
  const start = parseDateOnlyBoundary(competition.start_date, false);
  const end = parseDateOnlyBoundary(competition.end_date ?? competition.start_date, true);

  if (isCompetitionLiveNow(competition)) {
    return "Live / Ongoing";
  }

  if (end && now > end) {
    return "Past";
  }

  if (start && start > now) {
    const daysUntilStart = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilStart <= 14 ? "Upcoming" : "Future";
  }

  return competition.status === "active" ? "Upcoming" : "Past";
}

export function isQualifierStage(competition: Pick<Competition, "current_phase" | "stage_mode">) {
  return phaseToStageMode(competition.current_phase) === "qualifier";
}

export function isFinalsStage(competition: Pick<Competition, "current_phase" | "stage_mode">) {
  return phaseToStageMode(competition.current_phase) === "finals";
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

export function calculateQualifierAttemptPoints(attempt: Partial<QualifierAttempt>) {
  const topPoints = attempt.topped
    ? FINAL_TOP_POINTS - (normalizeSuccessfulAttempts(attempt.attempts_to_top) - 1) * FINAL_ATTEMPT_DEDUCTION
    : 0;
  const zonePoints = attempt.zone
    ? FINAL_ZONE_POINTS - (normalizeSuccessfulAttempts(attempt.attempts_to_zone) - 1) * FINAL_ATTEMPT_DEDUCTION
    : 0;

  return Math.max(0, roundTenths(Math.max(topPoints, zonePoints)));
}

export function buildQualifierScoreList(
  attempts: QualifierAttempt[],
  competition: Pick<Competition, "format" | "total_climbs" | "qualifier_counting_climbs">
): QualifierClimbScore[] {
  const officialPointsQualifier = formatUsesOfficialQualifierPoints(competition.format);
  const attemptMap = new Map<number, QualifierAttempt>();
  attempts.forEach((attempt) => {
    attemptMap.set(attempt.climb_number, attempt);
  });

  const scores = getClimbs(competition.total_climbs).map((climb) => {
    const attempt = attemptMap.get(climb.number);
    const topped = attempt?.topped ?? false;
    const zone = attempt?.zone ?? topped;
    const attemptsToTop = topped ? normalizeSuccessfulAttempts(attempt?.attempts_to_top ?? attempt?.attempt_count) : null;
    const attemptsToZone = zone
      ? normalizeSuccessfulAttempts(attempt?.attempts_to_zone ?? attempt?.attempts_to_top ?? attempt?.attempt_count)
      : null;
    const attemptCount = officialPointsQualifier
      ? topped
        ? attemptsToTop ?? 0
        : attemptsToZone ?? 0
      : attempt?.attempt_count ?? 0;
    const extraAttempts = topped ? Math.max(0, attemptCount - 1) : Math.max(0, attemptCount);

    return {
      climb_number: climb.number,
      zone,
      topped,
      attempt_count: attemptCount,
      extra_attempts: extraAttempts,
      attempts_to_top: attemptsToTop,
      attempts_to_zone: attemptsToZone,
      base_points: climb.base_points,
      score: officialPointsQualifier
        ? calculateQualifierAttemptPoints(
            attempt ?? {
              competition_id: "",
              round_id: null,
              climber_id: "",
              climb_number: climb.number,
              attempt_count: 0,
              zone: false,
              topped: false,
              attempts_to_top: null,
              attempts_to_zone: null,
              entered_by: "staff",
            }
          )
        : calculateQualifierClimbScore(climb.number, attemptCount, topped),
      counting: false,
    };
  });

  const countingNumbers = new Set(
    officialPointsQualifier
      ? scores.map((score) => score.climb_number)
      : [...scores]
          .filter((score) => score.score > 0)
          .sort(compareQualifierClimbScores)
          .slice(0, competition.qualifier_counting_climbs)
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

function buildQualifierRoundCompetition(
  competition: Competition,
  round?: Pick<CompetitionRound, "format" | "problem_count" | "counting_climbs"> | null
): Competition {
  if (!round) {
    return competition;
  }

  return {
    ...competition,
    format: round.format,
    total_climbs: round.problem_count,
    qualifier_counting_climbs: round.counting_climbs ?? competition.qualifier_counting_climbs,
  };
}

export function filterAttemptsForRound<T extends { round_id: string | null }>(attempts: T[], roundId?: string | null) {
  if (!roundId) {
    return attempts;
  }

  return attempts.filter((attempt) => attempt.round_id === roundId);
}

export function getQualifierStyleRounds(rounds: CompetitionRound[] | null | undefined) {
  return (rounds ?? []).filter((round) => round.scoring_bucket === "qualifier");
}

export function getFinalsStyleRounds(rounds: CompetitionRound[] | null | undefined) {
  return (rounds ?? []).filter((round) => round.scoring_bucket === "finals");
}

export function getPreferredActiveRound(
  competition: Pick<Competition, "rounds" | "schedule_blocks" | "current_phase">,
  scoringBucket: CompetitionRoundScoringBucket
) {
  const rounds = [...(competition.rounds ?? [])].sort(
    (left, right) => left.sort_order - right.sort_order || left.round_number - right.round_number
  );
  const activeBlockRoundId =
    competition.schedule_blocks.find((block) => block.is_active && block.round_id)?.round_id ?? null;

  const fromActiveBlock =
    rounds.find((round) => round.id === activeBlockRoundId && round.scoring_bucket === scoringBucket && round.is_enabled) ?? null;
  if (fromActiveBlock) {
    return fromActiveBlock;
  }

  const explicitActive =
    rounds.find((round) => round.scoring_bucket === scoringBucket && round.is_enabled && round.is_active) ?? null;
  if (explicitActive) {
    return explicitActive;
  }

  return rounds.find((round) => round.scoring_bucket === scoringBucket && round.is_enabled) ?? null;
}

export function getActiveQualifierStyleRound(
  competition: Pick<Competition, "rounds" | "schedule_blocks" | "current_phase">
) {
  return getPreferredActiveRound(competition, "qualifier");
}

export function getActiveFinalsRound(
  competition: Pick<Competition, "rounds" | "schedule_blocks" | "current_phase">
) {
  return getPreferredActiveRound(competition, "finals");
}

export function buildQualifierLeaderboard(
  climbers: ClimberWithAttempts[],
  competition: Competition,
  round?: CompetitionRound | null
): QualifierLeaderboardEntry[] {
  const scoringCompetition = buildQualifierRoundCompetition(competition, round);
  const officialPointsQualifier = formatUsesOfficialQualifierPoints(scoringCompetition.format);
  const entries = climbers.map((climber) => {
    const allClimbs = buildQualifierScoreList(
      filterAttemptsForRound(climber.qualifier_attempts, round?.id),
      scoringCompetition
    );
    const countingClimbs = [...allClimbs].filter((climb) => climb.counting).sort(compareQualifierClimbScores);
    const totalScore = officialPointsQualifier
      ? roundTenths(countingClimbs.reduce((sum, climb) => sum + climb.score, 0))
      : countingClimbs.reduce((sum, climb) => sum + climb.score, 0);
    const toppedCount = countingClimbs.filter((climb) => climb.topped).length;
    const zoneCount = countingClimbs.filter((climb) => climb.zone).length;
    const countingAttemptTotal = countingClimbs.reduce(
      (sum, climb) =>
        sum +
        (climb.topped
          ? climb.attempts_to_top ?? climb.attempt_count
          : climb.zone
            ? climb.attempts_to_zone ?? climb.attempt_count
            : climb.attempt_count),
      0
    );

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
      zone_count: zoneCount,
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
  if (right.zone_count !== left.zone_count) {
    return right.zone_count - left.zone_count;
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

export function buildFinalProblemResults(attempts: FinalAttempt[], finalsProblemCount: number): FinalProblemResult[] {
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
      points: calculateFinalAttemptPoints(
        attempt ?? { climb_number: climbNumber, competition_id: "", round_id: null, climber_id: "", top: false, zone: false }
      ),
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
  competition: Competition,
  round?: CompetitionRound | null
): FinalsLeaderboardEntry[] {
  const climberMap = new Map(climbers.map((climber) => [climber.id, climber]));
  const finalsProblemCount = round?.problem_count ?? competition.finals_problem_count;

  const entries = finalists.flatMap((finalist) => {
    const climber = climberMap.get(finalist.climber_id);
    if (!climber) {
      return [];
    }

    const scopedAttempts = filterAttemptsForRound(climber.final_attempts, round?.id);
    const problemResults = buildFinalProblemResults(scopedAttempts, finalsProblemCount);
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
        attempts: [...scopedAttempts].sort((left, right) => left.climb_number - right.climb_number),
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

export function pickPreferredQualifierCategory(
  categories: Array<Pick<CompetitionCategory, "id" | "sort_order" | "display_name">>,
  qualifierEntries: Array<Pick<QualifierLeaderboardEntry, "category_id">>
) {
  if (!categories.length) {
    return "";
  }

  const counts = new Map<string, number>();
  qualifierEntries.forEach((entry) => {
    if (!entry.category_id) {
      return;
    }

    counts.set(entry.category_id, (counts.get(entry.category_id) ?? 0) + 1);
  });

  return [...categories]
    .sort((left, right) => {
      const countDiff = (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0);
      if (countDiff !== 0) {
        return countDiff;
      }

      const sortDiff = left.sort_order - right.sort_order;
      if (sortDiff !== 0) {
        return sortDiff;
      }

      return left.display_name.localeCompare(right.display_name);
    })[0]?.id ?? "";
}

export function pickFinalists(
  qualifierEntries: QualifierLeaderboardEntry[],
  competition: Competition,
  targetRound?: Pick<CompetitionRound, "advancement_cutoff" | "finals_cutoff"> | null
) {
  const advancementCutoff =
    targetRound?.advancement_cutoff ??
    targetRound?.finals_cutoff ??
    competition.finals_cutoff;
  const byCategory = new Map<string, QualifierLeaderboardEntry[]>();

  qualifierEntries.forEach((entry) => {
    if (!isFinalsEligibleCategory(competition, entry.gender_division, entry.age_group)) {
      return;
    }

    const key = entry.category_id ?? "__uncategorized__";
    const next = byCategory.get(key) ?? [];
    next.push(entry);
    byCategory.set(key, next);
  });

  const finalists: FinalistSelection[] = [];
  byCategory.forEach((entries) => {
    const cutoffEntry = entries[advancementCutoff - 1];

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
      const withinCutoff = entry.category_rank <= advancementCutoff;
      const tiedAtCutoff =
        competition.finals_tie_advances &&
        entry.total_score === cutoffEntry.total_score &&
        entry.topped_count === cutoffEntry.topped_count &&
        entry.zone_count === cutoffEntry.zone_count &&
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

export function buildRegistrationChoices(competition: Competition, climbers: Climber[]) {
  const slotCounts = new Map<string, number>();
  climbers.forEach((climber) => {
    if (climber.time_slot_id) {
      slotCounts.set(climber.time_slot_id, (slotCounts.get(climber.time_slot_id) ?? 0) + 1);
    }
  });

  return competition.categories
    .filter((category) => isQualifierEligibleCategory(competition, category.age_group))
    .map((category) => {
      const slots = competition.schedule_blocks
        .filter((block) => schedulePhaseAllowsRegistration(block.phase_type))
        .filter((block) => !block.eligible_category_ids.length || block.eligible_category_ids.includes(category.id))
        .map((block) => ({
          ...block,
          remaining_capacity: Math.max(0, block.capacity - (slotCounts.get(block.id) ?? 0)),
        }));

      return { category, slots };
    })
    .sort((left, right) => {
      const leftFirstSlotIndex =
        left.slots.length > 0
          ? competition.schedule_blocks.findIndex((block) => block.id === left.slots[0]?.id)
          : Number.POSITIVE_INFINITY;
      const rightFirstSlotIndex =
        right.slots.length > 0
          ? competition.schedule_blocks.findIndex((block) => block.id === right.slots[0]?.id)
          : Number.POSITIVE_INFINITY;

      if (leftFirstSlotIndex !== rightFirstSlotIndex) {
        return leftFirstSlotIndex - rightFirstSlotIndex;
      }

      const sharedBlock = competition.schedule_blocks[leftFirstSlotIndex];
      if (sharedBlock?.eligible_category_ids.length) {
        const leftCategoryIndex = sharedBlock.eligible_category_ids.indexOf(left.category.id);
        const rightCategoryIndex = sharedBlock.eligible_category_ids.indexOf(right.category.id);
        const normalizedLeftCategoryIndex =
          leftCategoryIndex >= 0 ? leftCategoryIndex : Number.POSITIVE_INFINITY;
        const normalizedRightCategoryIndex =
          rightCategoryIndex >= 0 ? rightCategoryIndex : Number.POSITIVE_INFINITY;

        if (normalizedLeftCategoryIndex !== normalizedRightCategoryIndex) {
          return normalizedLeftCategoryIndex - normalizedRightCategoryIndex;
        }
      }

      const sortDiff = left.category.sort_order - right.category.sort_order;
      if (sortDiff !== 0) {
        return sortDiff;
      }

      return left.category.display_name.localeCompare(right.category.display_name);
    });
}

export function getTimeSlotLabel(slotId: string | null | undefined, competition: Competition) {
  if (!slotId) {
    return formatUsesSelfScoredQualifiers(competition.format) ? "No session selected" : "No schedule block";
  }
  return competition.schedule_blocks.find((slot) => slot.id === slotId)?.label ?? "No schedule block";
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

export function formatDateLabel(value: string | null | undefined) {
  if (!value) {
    return "Date TBD";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateRange(startDate: string | null, endDate: string | null) {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate()
    ) {
      return formatDateLabel(startDate);
    }

    return `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
  }
  return formatDateLabel(startDate ?? endDate);
}

export function formatDateTimeLabel(value: string | null | undefined) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatCompetitionDateBadge(competition: Pick<Competition, "start_date" | "end_date">) {
  if (!competition.start_date) {
    return { month: "TBD", day: "--" };
  }

  const start = new Date(competition.start_date);
  const end = competition.end_date ? new Date(competition.end_date) : null;
  const month = start.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
  const sameValidEndDate =
    end &&
    !Number.isNaN(end.getTime()) &&
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const day =
    end && !Number.isNaN(end.getTime()) && !sameValidEndDate
      ? `${start.getDate()} - ${end.getDate()}`
      : `${start.getDate()}`;
  return { month, day };
}

export function buildHeroAccent(competition: Pick<Competition, "format">) {
  switch (competition.format) {
    case "ifsc_finals_format":
      return "linear-gradient(135deg, rgba(0,0,0,0.18), rgba(10,43,66,0.45))";
    case "flash_format":
      return "linear-gradient(135deg, rgba(0,0,0,0.18), rgba(23,86,70,0.42))";
    case "five_on_five_off":
      return "linear-gradient(135deg, rgba(0,0,0,0.18), rgba(89,58,24,0.42))";
    default:
      return "linear-gradient(135deg, rgba(0,0,0,0.18), rgba(95,34,48,0.45))";
  }
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
    (entry as unknown as Record<string, number>)[categoryKey as string] = categoryPosition.get(categoryId) ?? seen;
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
      qualifierLeft.zone_count === qualifierRight.zone_count &&
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
