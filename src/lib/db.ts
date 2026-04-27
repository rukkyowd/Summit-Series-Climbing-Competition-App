import { assertSupabaseConfigured, publicSupabase, supabase } from "./supabase";
import { sanitizeExternalUrl } from "./security";
import { normalizeFinalAttemptInput, normalizeQualifierAttemptInput } from "./attempts";
import {
  DEFAULT_COMPETITION,
  buildCompetitionPath,
  buildStaffCompetitionPath,
  canUseLiveBoulderQueue,
  buildDisplayCategory,
  buildFinalsLeaderboard,
  buildRegistrationChoices,
  buildQualifierLeaderboard,
  canClimberSelfScoreQualifier,
  canRegisterDuringCompetition,
  canStaffScoreFinals,
  canStaffScoreQualifier,
  competitionHasFinals,
  createCompetitionRoundId,
  createCategoryKey,
  createCompetitionId,
  getActiveQueueSessionBlock,
  getRecommendedFinalsCutoff,
  getRecommendedQualifierClimbCount,
  getRecommendedQualifierCountingClimbs,
  getActiveScheduleBlock,
  getDefaultCompetitionCategories,
  getRoundStatusForCompetition,
  isValidClimberNumber,
  isQualifierEligibleCategory,
  isCompetitionLiveNow,
  isFinalsStage,
  isQualifierStage,
  normalizeCompetition,
  normalizeCompetitionRounds,
  phaseToStageMode,
  schedulePhaseAllowsRegistration,
  slugifyCompetitionName,
  type BoulderQueueEntry,
  type Climber,
  type ClimberWithAttempts,
  type Competition,
  type CompetitionCategory,
  type CompetitionRound,
  type CompetitionRoundScoringBucket,
  type CompetitionPhase,
  type CompetitionRoundStatus,
  type CompetitionRoundType,
  type CompetitionScheduleBlock,
  type CompetitionStatus,
  type FinalAttempt,
  type FinalsLeaderboardEntry,
  type FinalistSelection,
  type QualifierAttempt,
  type QualifierLeaderboardEntry,
  type RegistrationChoice,
} from "./scoring";

export interface CreateCompetitionInput {
  name: string;
  format: Competition["format"];
  has_finals?: boolean;
  location_name?: string;
  start_date?: string | null;
  end_date?: string | null;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
  description?: string;
  hero_image_url?: string;
  discipline_label?: string;
  official_event_url?: string;
  official_registration_url?: string;
  official_schedule_url?: string;
}

export interface RegisterClimberInput {
  competitionId: string;
  name: string;
  climberNumber: string;
  province: string;
  categoryId: string;
  timeSlotId: string | null;
}

export interface SaveCompetitionConfigInput extends Omit<Competition, "categories" | "schedule_blocks" | "rounds"> {
  schedule_blocks: CompetitionScheduleBlock[];
  rounds: CompetitionRound[];
}

export interface CompetitionSnapshot {
  competition: Competition;
  climbers: ClimberWithAttempts[];
  boulderQueue: BoulderQueueEntry[];
  qualifierLeaderboard: QualifierLeaderboardEntry[];
  finalsLeaderboard: FinalsLeaderboardEntry[];
  finalists: FinalistSelection[];
  finalistsPersisted: boolean;
  registrationChoices: RegistrationChoice[];
  undoAvailability?: CompetitionUndoAvailability;
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

export interface CompetitionUndoAvailability {
  available: boolean;
  expires_at: string | null;
  operation_type: "advance" | "reset" | null;
}

type RegisteredClimberResult = Climber & {
  competition_slug: string;
  scorecard_path: string;
};

const LIVE_BOULDER_QUEUE_STALE_MINUTES = 3;

interface BoulderQueueRow {
  id: string;
  competition_id: string;
  climber_id: string;
  schedule_block_id: string;
  climb_number: number;
  checked_in_at: string;
}

function dedupeFinalists<T extends FinalistSelection>(finalists: T[]) {
  const seen = new Set<string>();

  return finalists.filter((finalist) => {
    if (!finalist.climber_id || seen.has(finalist.climber_id)) {
      return false;
    }

    seen.add(finalist.climber_id);
    return true;
  });
}

function ensureConfigured() {
  assertSupabaseConfigured();
}

function cleanString(value: string) {
  return value.trim();
}

function cleanOptionalExternalUrl(value: string | null | undefined) {
  return sanitizeExternalUrl(value) || "";
}

const OPTIONAL_COMPETITION_LINK_COLUMNS = [
  "official_event_url",
  "official_registration_url",
  "official_schedule_url",
] as const;

function stripOptionalCompetitionLinkColumns<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload };
  OPTIONAL_COMPETITION_LINK_COLUMNS.forEach((column) => {
    delete next[column];
  });
  return next;
}

function isMissingCompetitionLinkColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  if (!message) {
    return false;
  }

  return OPTIONAL_COMPETITION_LINK_COLUMNS.some((column) => message.includes(column));
}

function createAccessToken() {
  const safeRandom =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

  return safeRandom.slice(0, 32);
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `generated-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function arrayifyIds(value: unknown) {
  if (!value) {
    return [] as string[];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  return [] as string[];
}

function assertQualifierOpen(competition: Competition, message: string) {
  if (!isQualifierStage(competition)) {
    throw new Error(message);
  }
}

function assertFinalsOpen(competition: Competition, message: string) {
  if (!isFinalsStage(competition)) {
    throw new Error(message);
  }
}

function assertRegistrationWindowOpen(competition: Competition) {
  assertQualifierOpen(competition, "Registration is closed because this competition has already advanced to finals.");

  if (!canRegisterDuringCompetition(competition)) {
    throw new Error("Registration is not open for this competition.");
  }
}

function assertStaffQualifierWindowOpen(competition: Competition) {
  assertQualifierOpen(competition, "Qualifier scoring is locked because this competition has advanced to finals.");

  if (!canStaffScoreQualifier(competition)) {
    throw new Error("Qualifier scoring is not open during the current competition phase.");
  }
}

function assertClimberQualifierWindowOpen(competition: Competition) {
  assertQualifierOpen(competition, "Qualifier scoring is locked because this competition has advanced to finals.");

  if (!canClimberSelfScoreQualifier(competition)) {
    throw new Error("Private qualifier scoring is only open while qualifier scoring is live.");
  }
}

function assertFinalsWindowOpen(competition: Competition) {
  assertFinalsOpen(competition, "Finals scoring is not available until this competition advances to finals.");

  if (!canStaffScoreFinals(competition)) {
    throw new Error("Finals scoring is not open during the current competition phase.");
  }
}

async function fetchCompetitionRows(includeArchived = false) {
  let query = publicSupabase.from("competitions").select("*").order("start_date", { ascending: false }).order("name");

  if (!includeArchived) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) {
    return [] as any[];
  }

  return data ?? [];
}

async function fetchCompetitionRowBySlug(slug: string) {
  const { data, error } = await publicSupabase.from("competitions").select("*").eq("slug", slug).maybeSingle();
  if (error) {
    return null;
  }

  return data;
}

async function fetchCompetitionRowById(id: string) {
  const { data, error } = await publicSupabase.from("competitions").select("*").eq("id", id).maybeSingle();
  if (error) {
    return null;
  }

  return data;
}

async function fetchCompetitionCategories(competitionIds: string[]) {
  if (!competitionIds.length) {
    return [] as CompetitionCategory[];
  }

  const { data, error } = await publicSupabase
    .from("competition_categories")
    .select("*")
    .in("competition_id", competitionIds)
    .order("sort_order", { ascending: true });

  if (error) {
    return [] as CompetitionCategory[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id ?? createCategoryKey(row.gender_division ?? "Open", row.age_group ?? "Open"),
    competition_id: row.competition_id,
    gender_division: row.gender_division ?? "Open",
    age_group: row.age_group ?? "Open",
    display_name: row.display_name ?? buildDisplayCategory(row.gender_division ?? "Open", row.age_group ?? "Open"),
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at ?? undefined,
  }));
}

async function fetchCompetitionScheduleBlocks(competitionIds: string[]) {
  if (!competitionIds.length) {
    return [] as CompetitionScheduleBlock[];
  }

  const { data, error } = await publicSupabase
    .from("competition_schedule_blocks")
    .select("*")
    .in("competition_id", competitionIds)
    .order("start_time", { ascending: true });

  if (error) {
    return [] as CompetitionScheduleBlock[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id ?? createId(),
    competition_id: row.competition_id,
    round_id: row.round_id ?? null,
    label: row.label ?? "Open block",
    phase_type: row.phase_type ?? "custom",
    audience_label: row.audience_label ?? "",
    is_active: row.is_active ?? false,
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    capacity: row.capacity ?? DEFAULT_COMPETITION.max_climbers,
    eligible_category_ids: arrayifyIds(row.eligible_category_ids),
    created_at: row.created_at ?? undefined,
  }));
}

async function fetchCompetitionRounds(competitionIds: string[]) {
  if (!competitionIds.length) {
    return [] as CompetitionRound[];
  }

  const { data, error } = await publicSupabase
    .from("competition_rounds")
    .select("*")
    .in("competition_id", competitionIds)
    .order("round_number", { ascending: true });

  if (error) {
    return [] as CompetitionRound[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id ?? createCompetitionRoundId(),
    competition_id: row.competition_id,
    round_number: row.round_number ?? 1,
    sort_order: row.sort_order ?? row.round_number ?? 1,
    name: row.name ?? "Round",
    round_type: row.round_type ?? "qualifier",
    format: row.format ?? "scramble",
    status: row.status ?? "pending",
    runtime_phase: row.runtime_phase ?? "qualifier_open",
    is_enabled: row.is_enabled ?? true,
    is_active: row.is_active ?? false,
    activated_at: row.activated_at ?? null,
    problem_count: row.problem_count ?? 4,
    counting_climbs: row.counting_climbs ?? null,
    finals_cutoff: row.finals_cutoff ?? null,
    eligible_category_ids: arrayifyIds(row.eligible_category_ids),
    advancement_source_round_id: row.advancement_source_round_id ?? null,
    advancement_cutoff: row.advancement_cutoff ?? null,
    scoring_bucket: row.scoring_bucket ?? "none",
    scoring_config:
      row.scoring_config && typeof row.scoring_config === "object" && !Array.isArray(row.scoring_config)
        ? row.scoring_config
        : {},
    started_at: row.started_at ?? null,
    closed_at: row.closed_at ?? null,
    created_at: row.created_at ?? undefined,
  }));
}

function hydrateCompetitions(
  rows: any[],
  categories: CompetitionCategory[],
  scheduleBlocks: CompetitionScheduleBlock[],
  rounds: CompetitionRound[]
) {
  return rows.map((row) => {
    const competitionId = row.id;
    return normalizeCompetition(
      row,
      categories.filter((category) => category.competition_id === competitionId),
      scheduleBlocks.filter((block) => block.competition_id === competitionId),
      rounds.filter((round) => round.competition_id === competitionId)
    );
  });
}

async function fetchClimberRows(competitionIds: string[]) {
  if (!competitionIds.length) {
    return [] as Climber[];
  }

  const { data, error } = await publicSupabase
    .from("climbers")
    .select("*")
    .in("competition_id", competitionIds)
    .order("registered_at", { ascending: true });

  if (error) {
    return [] as Climber[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    competition_id: row.competition_id,
    name: row.name ?? "Unknown climber",
    climber_number: row.climber_number ?? "",
    province: row.province ?? "",
    category_id: row.category_id ?? createCategoryKey(row.gender_division ?? "Open", row.age_group ?? "Open"),
    gender_division: row.gender_division ?? "Open",
    age_group: row.age_group ?? "Open",
    display_category: row.display_category ?? buildDisplayCategory(row.gender_division ?? "Open", row.age_group ?? "Open"),
    time_slot_id: row.time_slot_id ?? null,
    access_token: row.access_token ?? "",
    access_token_created_at: row.access_token_created_at ?? undefined,
    registered_at: row.registered_at ?? undefined,
  }));
}

async function fetchQualifierAttempts(competitionIds: string[]) {
  if (!competitionIds.length) {
    return [] as QualifierAttempt[];
  }

  const { data, error } = await publicSupabase
    .from("qualifier_attempts")
    .select("*")
    .in("competition_id", competitionIds)
    .order("climb_number", { ascending: true });

  if (error) {
    return [] as QualifierAttempt[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    competition_id: row.competition_id,
    climber_id: row.climber_id,
    climb_number: row.climb_number ?? 1,
    attempt_count: row.attempt_count ?? 0,
    zone: row.zone ?? row.topped ?? false,
    topped: row.topped ?? false,
    attempts_to_top: row.attempts_to_top ?? null,
    attempts_to_zone: row.attempts_to_zone ?? null,
    entered_by: row.entered_by ?? "climber",
    updated_at: row.updated_at ?? undefined,
  }));
}

async function fetchFinalAttempts(competitionIds: string[]) {
  if (!competitionIds.length) {
    return [] as FinalAttempt[];
  }

  const { data, error } = await publicSupabase
    .from("final_attempts")
    .select("*")
    .in("competition_id", competitionIds)
    .order("climb_number", { ascending: true });

  if (error) {
    return [] as FinalAttempt[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    competition_id: row.competition_id,
    climber_id: row.climber_id,
    climb_number: row.climb_number ?? 1,
    top: row.top ?? false,
    zone: row.zone ?? false,
    attempts_to_top: row.attempts_to_top ?? null,
    attempts_to_zone: row.attempts_to_zone ?? null,
    entered_by: "staff" as const,
    updated_at: row.updated_at ?? undefined,
  }));
}

async function fetchFinalists(competitionIds: string[]) {
  if (!competitionIds.length) {
    return [] as (FinalistSelection & { competition_id: string })[];
  }

  const { data, error } = await publicSupabase
    .from("competition_finalists")
    .select("*")
    .in("competition_id", competitionIds)
    .order("display_category", { ascending: true })
    .order("climbing_order", { ascending: true })
    .order("qualifier_rank", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return [] as (FinalistSelection & { competition_id: string })[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    competition_id: row.competition_id,
    climber_id: row.climber_id,
    name: row.name ?? "Unknown climber",
    category_id: row.category_id ?? null,
    display_category: row.display_category ?? "Open",
    gender_division: row.gender_division ?? "Open",
    age_group: row.age_group ?? "Open",
    qualifier_rank: row.qualifier_rank ?? 0,
    advanced_with_tie: row.advanced_with_tie ?? false,
    climbing_order: row.climbing_order ?? row.qualifier_rank ?? 0,
    created_at: row.created_at ?? undefined,
  }));
}

async function fetchBoulderQueueRows(competitionId: string, scheduleBlockId: string | null) {
  if (!scheduleBlockId) {
    return [] as BoulderQueueRow[];
  }

  const freshAfter = new Date(Date.now() - LIVE_BOULDER_QUEUE_STALE_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await publicSupabase
    .from("competition_boulder_queue")
    .select("*")
    .eq("competition_id", competitionId)
    .eq("schedule_block_id", scheduleBlockId)
    .gt("checked_in_at", freshAfter)
    .order("checked_in_at", { ascending: true });

  if (error) {
    return [] as BoulderQueueRow[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    competition_id: row.competition_id,
    climber_id: row.climber_id,
    schedule_block_id: row.schedule_block_id,
    climb_number: row.climb_number ?? 1,
    checked_in_at: row.checked_in_at ?? row.created_at ?? new Date().toISOString(),
  }));
}

function isDemoCompetitionSlug(slug: string) {
  return slug.startsWith("mock-") || slug.startsWith("spring-send-");
}

async function fetchBoulderQueueRowsForCompetition(competition: Competition, scheduleBlockId: string | null) {
  const freshRows = await fetchBoulderQueueRows(competition.id, scheduleBlockId);

  if (freshRows.length || !scheduleBlockId || !isDemoCompetitionSlug(competition.slug)) {
    return freshRows;
  }

  const { data, error } = await publicSupabase
    .from("competition_boulder_queue")
    .select("*")
    .eq("competition_id", competition.id)
    .eq("schedule_block_id", scheduleBlockId)
    .order("checked_in_at", { ascending: true })
    .limit(12);

  if (error) {
    return [] as BoulderQueueRow[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    competition_id: row.competition_id,
    climber_id: row.climber_id,
    schedule_block_id: row.schedule_block_id,
    climb_number: row.climb_number ?? 1,
    checked_in_at: row.checked_in_at ?? row.created_at ?? new Date().toISOString(),
  }));
}

async function fetchOfficialQualifierLeaderboard(competitionId: string) {
  const { data, error } = await publicSupabase.rpc("compute_qualifier_standings", {
    p_competition_id: competitionId,
  });

  if (error) {
    return [] as QualifierLeaderboardEntry[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    climber_id: row.climber_id,
    name: row.name ?? "Unknown climber",
    climber_number: row.climber_number ?? "",
    province: row.province ?? "",
    category_id: row.category_id ?? null,
    display_category: row.display_category ?? "Open",
    gender_division: row.gender_division ?? "Open",
    age_group: row.age_group ?? "Open",
    time_slot_id: row.time_slot_id ?? null,
    total_score: Number(row.total_score ?? 0),
    counting_climbs: [],
    all_climbs: [],
    topped_count: row.topped_count ?? 0,
    zone_count: row.zone_count ?? 0,
    counting_attempt_total: row.counting_attempt_total ?? 0,
    overall_rank: row.overall_rank ?? 0,
    category_rank: row.category_rank ?? 0,
  }));
}

async function fetchProjectedFinalists(competitionId: string) {
  const { data, error } = await publicSupabase.rpc("compute_finalist_selection", {
    p_competition_id: competitionId,
  });

  if (error) {
    return [] as FinalistSelection[];
  }

  return dedupeFinalists(((data ?? []) as any[]).map((row) => ({
    climber_id: row.climber_id,
    name: row.name ?? "Unknown climber",
    category_id: row.category_id ?? null,
    display_category: row.display_category ?? "Open",
    gender_division: row.gender_division ?? "Open",
    age_group: row.age_group ?? "Open",
    qualifier_rank: row.qualifier_rank ?? 0,
    advanced_with_tie: row.advanced_with_tie ?? false,
    climbing_order: row.climbing_order ?? row.qualifier_rank ?? 0,
  })));
}

async function fetchUndoAvailability(competitionId: string): Promise<CompetitionUndoAvailability> {
  const { data, error } = await supabase
    .from("competition_operations")
    .select("operation_type, expires_at")
    .eq("competition_id", competitionId)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      available: false,
      expires_at: null,
      operation_type: null,
    };
  }

  return {
    available: true,
    expires_at: data.expires_at ?? null,
    operation_type: (data.operation_type as "advance" | "reset") ?? null,
  };
}

function joinCompetitionData(
  climbers: Climber[],
  qualifierAttempts: QualifierAttempt[],
  finalAttempts: FinalAttempt[]
) {
  const qualifierMap = new Map<string, QualifierAttempt[]>();
  const finalsMap = new Map<string, FinalAttempt[]>();

  qualifierAttempts.forEach((attempt) => {
    const list = qualifierMap.get(attempt.climber_id) ?? [];
    list.push(attempt);
    qualifierMap.set(attempt.climber_id, list);
  });

  finalAttempts.forEach((attempt) => {
    const list = finalsMap.get(attempt.climber_id) ?? [];
    list.push(attempt);
    finalsMap.set(attempt.climber_id, list);
  });

  return climbers.map((climber) => ({
    ...climber,
    qualifier_attempts: qualifierMap.get(climber.id) ?? [],
    final_attempts: finalsMap.get(climber.id) ?? [],
  }));
}

function validateSlotForCategory(slot: CompetitionScheduleBlock, categoryId: string) {
  return !slot.eligible_category_ids.length || slot.eligible_category_ids.includes(categoryId);
}

function getScoreBearingRounds(rounds: CompetitionRound[]) {
  const qualifierRound = rounds.find((round) => round.scoring_bucket === "qualifier") ?? null;
  const finalsRound = rounds.find((round) => round.scoring_bucket === "finals") ?? null;

  return { qualifierRound, finalsRound };
}

function assertValidCompetitionRounds(rounds: CompetitionRound[]) {
  const qualifierScoreRounds = rounds.filter((round) => round.scoring_bucket === "qualifier");
  const finalsScoreRounds = rounds.filter((round) => round.scoring_bucket === "finals");
  const activeRounds = rounds.filter((round) => round.is_active);

  if (qualifierScoreRounds.length > 1) {
    throw new Error("Only one round can use the qualifier scoring bucket in v1.");
  }

  if (finalsScoreRounds.length > 1) {
    throw new Error("Only one round can use the finals scoring bucket in v1.");
  }

  if (rounds.some((round) => round.round_type === "semifinal" && round.scoring_bucket !== "none")) {
    throw new Error("Semifinal rounds are planning-only in v1 and cannot be score-bearing.");
  }

  if (activeRounds.length > 1) {
    throw new Error("Only one round can be active at a time.");
  }
}

function projectLegacyCompetitionFields(
  competition: Competition,
  rounds: CompetitionRound[]
) {
  const { qualifierRound, finalsRound } = getScoreBearingRounds(rounds);

  return {
    format: qualifierRound?.format ?? competition.format,
    total_climbs: qualifierRound?.problem_count ?? competition.total_climbs,
    qualifier_counting_climbs: qualifierRound?.counting_climbs ?? competition.qualifier_counting_climbs,
    finals_cutoff:
      finalsRound?.finals_cutoff ??
      qualifierRound?.finals_cutoff ??
      competition.finals_cutoff,
    finals_problem_count: finalsRound?.problem_count ?? competition.finals_problem_count,
    has_finals: finalsRound !== null ? true : competition.has_finals,
  };
}

async function persistCompetitionRounds(competition: Competition, rounds: CompetitionRound[]) {
  const normalizedRounds = normalizeCompetitionRounds(rounds, competition);
  assertValidCompetitionRounds(normalizedRounds);
  const { error } = await supabase.rpc("save_competition_rounds", {
    p_competition_id: competition.id,
    p_rounds: normalizedRounds.map((round, index) => ({
      id: round.id || createCompetitionRoundId(),
      competition_id: competition.id,
      round_number: round.round_number ?? index + 1,
      sort_order: round.sort_order ?? round.round_number ?? index + 1,
      name: cleanString(round.name),
      round_type: round.round_type,
      format: round.format,
      status: round.status,
      runtime_phase: round.runtime_phase,
      is_enabled: round.is_enabled,
      is_active: round.is_active,
      activated_at: round.activated_at,
      problem_count: round.problem_count,
      counting_climbs: round.counting_climbs,
      finals_cutoff: round.finals_cutoff,
      eligible_category_ids: round.eligible_category_ids,
      advancement_source_round_id: round.advancement_source_round_id,
      advancement_cutoff: round.advancement_cutoff,
      scoring_bucket: round.scoring_bucket,
      scoring_config: round.scoring_config,
      started_at: round.started_at,
      closed_at: round.closed_at,
    })),
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function syncCompetitionRoundRuntimeState(competitionId: string) {
  const competition = await getCompetitionById(competitionId);
  if (!competition) {
    return;
  }

  const rounds = normalizeCompetitionRounds(competition.rounds ?? [], competition);
  if (!rounds.length) {
    return;
  }

  const now = new Date().toISOString();
  const stageMode = phaseToStageMode(competition.current_phase);
  const preferredActiveRound =
    rounds.find((round) => (stageMode === "qualifier" ? round.scoring_bucket === "qualifier" : round.scoring_bucket === "finals")) ??
    rounds.find((round) => round.runtime_phase === competition.current_phase) ??
    rounds.find((round) => round.is_enabled) ??
    rounds[0];

  const updatedRounds = rounds.map((round) => {
    const status: CompetitionRoundStatus =
      round.scoring_bucket === "qualifier"
        ? getRoundStatusForCompetition(competition, "qualifier")
        : round.scoring_bucket === "finals"
          ? getRoundStatusForCompetition(competition, "finals")
          : round.status;

    const isActive = round.id === preferredActiveRound?.id;
    return {
      ...round,
      status,
      is_active: isActive,
      activated_at: isActive ? round.activated_at ?? now : round.activated_at,
    };
  });

  await persistCompetitionRounds(competition, updatedRounds);
}

async function getCompetitionEditState(competitionId: string) {
  const snapshot = await getCompetitionSnapshot(competitionId);
  return {
    hasRegistrations: snapshot.climbers.length > 0,
    hasQualifierAttempts: snapshot.climbers.some((climber) => climber.qualifier_attempts.length > 0),
    hasFinalAttempts: snapshot.climbers.some((climber) => climber.final_attempts.length > 0),
    hasFinalists: snapshot.finalistsPersisted,
    isHistorical: snapshot.competition.current_phase === "results" || snapshot.competition.current_phase === "finals_closed",
  };
}

function assertStructuralEditsAllowed(
  previous: Competition,
  next: Competition,
  editState: Awaited<ReturnType<typeof getCompetitionEditState>>
) {
  const previousRounds = normalizeCompetitionRounds(previous.rounds ?? [], previous);
  const nextRounds = normalizeCompetitionRounds(next.rounds ?? [], next);
  const structureChanged =
    JSON.stringify(
      previousRounds.map((round) => ({
        id: round.id,
        round_type: round.round_type,
        scoring_bucket: round.scoring_bucket,
        format: round.format,
        problem_count: round.problem_count,
        counting_climbs: round.counting_climbs,
        finals_cutoff: round.finals_cutoff,
        advancement_source_round_id: round.advancement_source_round_id,
        advancement_cutoff: round.advancement_cutoff,
      }))
    ) !==
    JSON.stringify(
      nextRounds.map((round) => ({
        id: round.id,
        round_type: round.round_type,
        scoring_bucket: round.scoring_bucket,
        format: round.format,
        problem_count: round.problem_count,
        counting_climbs: round.counting_climbs,
        finals_cutoff: round.finals_cutoff,
        advancement_source_round_id: round.advancement_source_round_id,
        advancement_cutoff: round.advancement_cutoff,
      }))
    );

  if (!structureChanged) {
    return;
  }

  if (editState.hasQualifierAttempts || editState.hasFinalAttempts || editState.hasFinalists) {
    throw new Error("Round structure is locked after scoring or finalist creation begins.");
  }

  if (editState.hasRegistrations) {
    throw new Error("Round structure is locked after registrations begin. You can still adjust schedule details.");
  }

  if (editState.isHistorical) {
    throw new Error("Historical competitions cannot change round structure.");
  }
}

export async function listCompetitions(includeArchived = false) {
  ensureConfigured();

  const rows = await fetchCompetitionRows(includeArchived);
  const competitionIds = rows.map((row) => row.id as string);
  const [categories, scheduleBlocks, rounds] = await Promise.all([
    fetchCompetitionCategories(competitionIds),
    fetchCompetitionScheduleBlocks(competitionIds),
    fetchCompetitionRounds(competitionIds),
  ]);

  return hydrateCompetitions(rows, categories, scheduleBlocks, rounds);
}

export async function listCompetitionSummaries(includeArchived = false): Promise<CompetitionSummary[]> {
  ensureConfigured();

  const competitions = await listCompetitions(includeArchived);
  const competitionIds = competitions.map((competition) => competition.id);
  const [climbers, finalists] = await Promise.all([
    fetchClimberRows(competitionIds),
    fetchFinalists(competitionIds),
  ]);

  return competitions.map((competition) => ({
    competition,
    climber_count: climbers.filter((climber) => climber.competition_id === competition.id).length,
    finalist_count: finalists.filter((finalist) => finalist.competition_id === competition.id).length,
    active_schedule_block: getActiveScheduleBlock(competition),
    registration_open: canRegisterDuringCompetition(competition),
    live_now: isCompetitionLiveNow(competition),
  }));
}

export async function getCompetitionBySlug(slug: string) {
  ensureConfigured();

  const row = await fetchCompetitionRowBySlug(cleanString(slug));
  if (!row) {
    return null;
  }

  const [categories, scheduleBlocks, rounds] = await Promise.all([
    fetchCompetitionCategories([row.id]),
    fetchCompetitionScheduleBlocks([row.id]),
    fetchCompetitionRounds([row.id]),
  ]);

  return hydrateCompetitions([row], categories, scheduleBlocks, rounds)[0] ?? null;
}

export async function getCompetitionById(id: string) {
  ensureConfigured();

  const row = await fetchCompetitionRowById(id);
  if (!row) {
    return null;
  }

  const [categories, scheduleBlocks, rounds] = await Promise.all([
    fetchCompetitionCategories([row.id]),
    fetchCompetitionScheduleBlocks([row.id]),
    fetchCompetitionRounds([row.id]),
  ]);

  return hydrateCompetitions([row], categories, scheduleBlocks, rounds)[0] ?? null;
}

async function resolveCompetition(identifier: string) {
  const bySlug = await getCompetitionBySlug(identifier);
  if (bySlug) {
    return bySlug;
  }

  return getCompetitionById(identifier);
}

export async function getCompetitionSnapshot(identifier: string): Promise<CompetitionSnapshot> {
  ensureConfigured();

  const competition = await resolveCompetition(identifier);
  if (!competition) {
    throw new Error("Competition not found.");
  }

  const activeQueueSession = getActiveQueueSessionBlock(competition);

  const [climbers, qualifierAttempts, finalAttempts, finalists, queueRows, officialQualifierLeaderboard, projectedFinalists, undoAvailability, rounds] = await Promise.all([
    fetchClimberRows([competition.id]),
    fetchQualifierAttempts([competition.id]),
    fetchFinalAttempts([competition.id]),
    fetchFinalists([competition.id]),
    fetchBoulderQueueRowsForCompetition(competition, activeQueueSession?.id ?? null),
    fetchOfficialQualifierLeaderboard(competition.id),
    fetchProjectedFinalists(competition.id),
    fetchUndoAvailability(competition.id).catch(() => ({
      available: false,
      expires_at: null,
      operation_type: null,
    })),
    fetchCompetitionRounds([competition.id]),
  ]);

  const joined = joinCompetitionData(climbers, qualifierAttempts, finalAttempts);
  const climberMap = new Map(joined.map((climber) => [climber.id, climber]));
  const boulderQueue = queueRows
    .map<BoulderQueueEntry | null>((row) => {
      const climber = climberMap.get(row.climber_id);
      if (!climber) {
        return null;
      }

      return {
        id: row.id,
        competition_id: row.competition_id,
        climber_id: row.climber_id,
        schedule_block_id: row.schedule_block_id,
        climb_number: row.climb_number,
        checked_in_at: row.checked_in_at,
        climber_name: climber.name,
        climber_number: climber.climber_number,
        display_category: climber.display_category,
        province: climber.province,
        time_slot_id: climber.time_slot_id,
      } satisfies BoulderQueueEntry;
    })
    .filter((entry): entry is BoulderQueueEntry => entry !== null);
  const localQualifierLeaderboard = buildQualifierLeaderboard(joined, competition);
  const officialQualifierMap = new Map(officialQualifierLeaderboard.map((entry) => [entry.climber_id, entry]));
  const qualifierLeaderboard = localQualifierLeaderboard.map((entry) => {
    const official = officialQualifierMap.get(entry.climber_id);
    if (!official) {
      return entry;
    }

    return {
      ...entry,
      total_score: official.total_score,
      topped_count: official.topped_count,
      zone_count: official.zone_count,
      counting_attempt_total: official.counting_attempt_total,
      overall_rank: official.overall_rank,
      category_rank: official.category_rank,
    };
  });
  const selectedFinalists = finalists
    .filter((entry) => entry.competition_id === competition.id)
    .map(({ competition_id, ...entry }) => entry);
  const liveProjectedFinalists =
    competition.current_phase === "qualifier_open"
      ? projectedFinalists.filter((entry) => !entry.advanced_with_tie)
      : projectedFinalists;
  const competitionFinalists = dedupeFinalists(
    selectedFinalists.length ? selectedFinalists : liveProjectedFinalists
  );
  const finalsLeaderboard = isFinalsStage(competition)
    ? buildFinalsLeaderboard(joined, competitionFinalists, competition)
    : [];

  return {
    competition,
    climbers: joined,
    boulderQueue,
    qualifierLeaderboard,
    finalsLeaderboard,
    finalists: competitionFinalists,
    finalistsPersisted: selectedFinalists.length > 0,
    registrationChoices: buildRegistrationChoices(competition, joined.map((climber) => climber)),
    undoAvailability,
    rounds,
  };
}

export async function createCompetitionFromTemplate(input: CreateCompetitionInput) {
  ensureConfigured();

  const baseId = createCompetitionId();
  const name = cleanString(input.name);
  const slugBase = slugifyCompetitionName(name);
  const existingCompetitions = await listCompetitions(true);
  const existingSlugs = new Set(existingCompetitions.map((competition) => competition.slug));
  let slug = slugBase;
  let suffix = 2;
  while (existingSlugs.has(slug)) {
    slug = `${slugBase}-${suffix}`;
    suffix += 1;
  }

  const competition = normalizeCompetition({
    id: baseId,
    slug,
    name,
    format: input.format,
    has_finals: input.has_finals,
    current_phase: "qualifier_open",
    discipline_label: input.discipline_label ?? "Boulder",
    location_name: input.location_name ?? "",
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
      registration_opens_at: input.registration_opens_at ?? null,
      registration_closes_at: input.registration_closes_at ?? null,
      description: input.description ?? "",
      hero_image_url: cleanOptionalExternalUrl(input.hero_image_url),
      official_event_url: cleanOptionalExternalUrl(input.official_event_url),
      official_registration_url: cleanOptionalExternalUrl(input.official_registration_url),
      official_schedule_url: cleanOptionalExternalUrl(input.official_schedule_url),
      status: "active",
    stage_mode: "qualifier",
    total_climbs: getRecommendedQualifierClimbCount(input.format),
    qualifier_counting_climbs: getRecommendedQualifierCountingClimbs(input.format),
    finals_cutoff: getRecommendedFinalsCutoff(input.format),
  });
  const legacyProjection = projectLegacyCompetitionFields(competition, competition.rounds ?? []);

  const insertPayload = {
    id: competition.id,
    slug: competition.slug,
    name: competition.name,
    status: competition.status,
    format: legacyProjection.format,
    current_phase: competition.current_phase,
    discipline_label: competition.discipline_label,
    stage_mode: competition.stage_mode,
    location_name: competition.location_name,
    start_date: competition.start_date,
    end_date: competition.end_date,
      registration_opens_at: competition.registration_opens_at,
      registration_closes_at: competition.registration_closes_at,
      description: competition.description,
      hero_image_url: competition.hero_image_url,
      official_event_url: competition.official_event_url,
      official_registration_url: competition.official_registration_url,
      official_schedule_url: competition.official_schedule_url,
      total_climbs: legacyProjection.total_climbs,
    max_climbers: competition.max_climbers,
    qualifier_counting_climbs: legacyProjection.qualifier_counting_climbs,
    has_finals: legacyProjection.has_finals,
    finals_cutoff: legacyProjection.finals_cutoff,
    finals_tie_advances: competition.finals_tie_advances,
    qualifier_eligible_age_groups: competition.qualifier_eligible_age_groups,
    finals_eligible_age_groups: competition.finals_eligible_age_groups,
    qualifier_locked_at: null,
    finals_started_at: null,
    finals_problem_count: legacyProjection.finals_problem_count,
  };

  let { error } = await supabase.from("competitions").insert(insertPayload);

  if (error && isMissingCompetitionLinkColumnError(error)) {
    ({ error } = await supabase.from("competitions").insert(stripOptionalCompetitionLinkColumns(insertPayload)));
  }

  if (error) {
    throw new Error(error.message);
  }

  const categories = getDefaultCompetitionCategories(competition.id);
  const { error: categoryError } = await supabase.from("competition_categories").insert(
    categories.map((category) => ({
      id: category.id,
      competition_id: competition.id,
      gender_division: category.gender_division,
      age_group: category.age_group,
      display_name: category.display_name,
      sort_order: category.sort_order,
    }))
  );

  if (categoryError) {
    throw new Error(categoryError.message);
  }

  await persistCompetitionRounds(competition, competition.rounds ?? []);

  return (await getCompetitionById(competition.id)) ?? competition;
}

export async function saveCompetitionConfig(competitionId: string, input: SaveCompetitionConfigInput) {
  ensureConfigured();
  const existingCompetition = await getCompetitionById(competitionId);
  if (!existingCompetition) {
    throw new Error("Competition not found.");
  }

  const payload = normalizeCompetition(
    {
      ...input,
      id: competitionId,
      slug: input.slug,
      hero_image_url: cleanOptionalExternalUrl(input.hero_image_url),
      official_event_url: cleanOptionalExternalUrl(input.official_event_url),
      official_registration_url: cleanOptionalExternalUrl(input.official_registration_url),
      official_schedule_url: cleanOptionalExternalUrl(input.official_schedule_url),
    },
    getDefaultCompetitionCategories(competitionId),
    input.schedule_blocks,
    input.rounds
  );
  await assertStructuralEditsAllowed(existingCompetition, payload, await getCompetitionEditState(competitionId));
  const legacyProjection = projectLegacyCompetitionFields(payload, payload.rounds ?? []);

  const upsertPayload = {
    id: payload.id,
    slug: payload.slug,
    name: payload.name,
    status: payload.status,
    format: legacyProjection.format,
    current_phase: payload.current_phase,
    discipline_label: payload.discipline_label,
    stage_mode: payload.stage_mode,
    location_name: payload.location_name,
    start_date: payload.start_date,
    end_date: payload.end_date,
      registration_opens_at: payload.registration_opens_at,
      registration_closes_at: payload.registration_closes_at,
      description: payload.description,
      hero_image_url: payload.hero_image_url,
      official_event_url: payload.official_event_url,
      official_registration_url: payload.official_registration_url,
      official_schedule_url: payload.official_schedule_url,
      total_climbs: legacyProjection.total_climbs,
    max_climbers: payload.max_climbers,
    qualifier_counting_climbs: legacyProjection.qualifier_counting_climbs,
    has_finals: legacyProjection.has_finals,
    finals_cutoff: legacyProjection.finals_cutoff,
    finals_tie_advances: payload.finals_tie_advances,
    qualifier_eligible_age_groups: payload.qualifier_eligible_age_groups,
    finals_eligible_age_groups: payload.finals_eligible_age_groups,
    qualifier_locked_at: payload.qualifier_locked_at,
    finals_started_at: payload.finals_started_at,
    finals_problem_count: legacyProjection.finals_problem_count,
  };

  let { error } = await supabase.from("competitions").upsert(upsertPayload);

  if (error && isMissingCompetitionLinkColumnError(error)) {
    ({ error } = await supabase.from("competitions").upsert(stripOptionalCompetitionLinkColumns(upsertPayload)));
  }

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("competition_schedule_blocks").delete().eq("competition_id", competitionId);

  if (payload.schedule_blocks.length) {
    const { error: scheduleError } = await supabase.from("competition_schedule_blocks").insert(
      payload.schedule_blocks.map((block) => ({
        id: block.id || createId(),
        competition_id: competitionId,
        label: cleanString(block.label),
        phase_type: block.phase_type,
        audience_label: cleanString(block.audience_label),
        is_active: block.is_active,
        start_time: block.start_time ? cleanString(block.start_time) : null,
        end_time: block.end_time ? cleanString(block.end_time) : null,
        capacity: block.capacity,
        eligible_category_ids: block.eligible_category_ids,
        round_id: block.round_id ?? null,
      }))
    );

    if (scheduleError) {
      throw new Error(scheduleError.message);
    }
  }

  await persistCompetitionRounds(payload, payload.rounds ?? []);

  return getCompetitionById(competitionId);
}

export async function setCompetitionLiveScheduleBlock(competitionId: string, blockId: string) {
  ensureConfigured();

  const { error: clearError } = await supabase
    .from("competition_schedule_blocks")
    .update({ is_active: false })
    .eq("competition_id", competitionId);

  if (clearError) {
    throw new Error(clearError.message);
  }

  const { error: setError } = await supabase
    .from("competition_schedule_blocks")
    .update({ is_active: true })
    .eq("competition_id", competitionId)
    .eq("id", blockId);

  if (setError) {
    throw new Error(setError.message);
  }
}

export async function setCompetitionStatus(competitionId: string, status: CompetitionStatus) {
  ensureConfigured();

  const { error } = await supabase.from("competitions").update({ status }).eq("id", competitionId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function setCompetitionPhase(competitionId: string, nextPhase: CompetitionPhase, note?: string) {
  ensureConfigured();

  const payload: {
    p_competition_id: string;
    p_next_phase: CompetitionPhase;
    p_note?: string;
  } = {
    p_competition_id: competitionId,
    p_next_phase: nextPhase,
  };

  if (note?.trim()) {
    payload.p_note = note.trim();
  }

  let { error } = await supabase.rpc("set_competition_phase", payload);

  if (
    error &&
    error.message.includes("Could not find the function public.set_competition_phase") &&
    "p_note" in payload
  ) {
    ({ error } = await supabase.rpc("set_competition_phase", {
      p_competition_id: competitionId,
      p_next_phase: nextPhase,
    }));
  }

  if (error && error.message.includes("Could not find the function public.set_competition_phase")) {
    const competition = await getCompetitionById(competitionId);
    if (!competition) {
      throw new Error("Competition not found.");
    }

    const now = new Date().toISOString();
    const qualifierLockedAt =
      nextPhase === "qualifier_open"
        ? null
        : nextPhase === "observation" || nextPhase === "finals_open" || nextPhase === "finals_closed" || nextPhase === "results"
          ? competition.qualifier_locked_at ?? now
          : competition.qualifier_locked_at;
    const finalsStartedAt =
      nextPhase === "finals_open"
        ? competition.finals_started_at ?? now
        : nextPhase === "qualifier_open" || nextPhase === "qualifier_closed" || nextPhase === "wall_reset"
          ? null
          : competition.finals_started_at;

    const fallback = await supabase
      .from("competitions")
      .update({
        current_phase: nextPhase,
        stage_mode: phaseToStageMode(nextPhase),
        qualifier_locked_at: qualifierLockedAt,
        finals_started_at: finalsStartedAt,
      })
      .eq("id", competitionId);

    error = fallback.error ?? null;
  }

  if (error) {
    throw new Error(error.message);
  }

  await syncCompetitionRoundRuntimeState(competitionId);

  return getCompetitionSnapshot(competitionId);
}

export async function undoCompetitionOperation(competitionId: string) {
  ensureConfigured();

  const { error } = await supabase.rpc("undo_last_competition_operation", {
    p_competition_id: competitionId,
  });

  if (error) {
    throw new Error(error.message);
  }

  await syncCompetitionRoundRuntimeState(competitionId);

  return getCompetitionSnapshot(competitionId);
}

export async function deleteCompetition(competitionId: string) {
  ensureConfigured();

  const { error } = await supabase.from("competitions").delete().eq("id", competitionId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function advanceCompetitionToFinals(competitionId: string) {
  ensureConfigured();

  const { error } = await supabase.rpc("advance_competition_to_finals", {
    p_competition_id: competitionId,
  });

  if (error) {
    throw new Error(error.message);
  }

  await syncCompetitionRoundRuntimeState(competitionId);

  return getCompetitionSnapshot(competitionId);
}

export async function updateFinalistClimbingOrder(competitionId: string, orderedClimberIds: string[]) {
  ensureConfigured();

  const { count, error: countError } = await supabase
    .from("competition_finalists")
    .select("climber_id", { count: "exact", head: true })
    .eq("competition_id", competitionId);

  if (countError) {
    throw new Error(countError.message);
  }

  if (!count) {
    throw new Error("Advance the competition to finals before changing the finals climbing order.");
  }

  for (let index = 0; index < orderedClimberIds.length; index += 1) {
    const climberId = orderedClimberIds[index];
    const { error } = await supabase
      .from("competition_finalists")
      .update({ climbing_order: index + 1 })
      .eq("competition_id", competitionId)
      .eq("climber_id", climberId);

    if (error) {
      throw new Error(error.message);
    }
  }

  return getCompetitionSnapshot(competitionId);
}

export async function saveFinalistField(
  competitionId: string,
  orderedFinalists: FinalistSelection[]
) {
  ensureConfigured();

  const { error: deleteError } = await supabase
    .from("competition_finalists")
    .delete()
    .eq("competition_id", competitionId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!orderedFinalists.length) {
    return getCompetitionSnapshot(competitionId);
  }

  const { error: insertError } = await supabase
    .from("competition_finalists")
    .insert(
      orderedFinalists.map((finalist, index) => ({
        competition_id: competitionId,
        climber_id: finalist.climber_id,
        name: finalist.name,
        category_id: finalist.category_id,
        display_category: finalist.display_category,
        gender_division: finalist.gender_division,
        age_group: finalist.age_group,
        qualifier_rank: finalist.qualifier_rank,
        advanced_with_tie: finalist.advanced_with_tie,
        climbing_order: index + 1,
      }))
    );

  if (insertError) {
    throw new Error(insertError.message);
  }

  return getCompetitionSnapshot(competitionId);
}

export async function resetCompetition(competitionId: string) {
  ensureConfigured();

  const { error } = await supabase.rpc("reset_competition", {
    p_competition_id: competitionId,
  });

  if (error) {
    throw new Error(error.message);
  }

  await syncCompetitionRoundRuntimeState(competitionId);

  return getCompetitionSnapshot(competitionId);
}

export async function getClimberById(id: string) {
  ensureConfigured();

  const { data, error } = await publicSupabase.from("climbers").select("*").eq("id", id).maybeSingle();
  if (error || !data) {
    return null;
  }

  const snapshot = await getCompetitionSnapshot(data.competition_id);
  const climber = snapshot.climbers.find((entry) => entry.id === id) ?? null;

  if (!climber) {
    return null;
  }

  return {
    climber,
    competition: snapshot.competition,
    path: buildCompetitionPath(snapshot.competition.slug, "scorecard"),
  };
}

export async function getClimberByAccessToken(token: string) {
  ensureConfigured();

  const { data, error } = await publicSupabase
    .from("climbers")
    .select("*")
    .eq("access_token", cleanString(token))
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const snapshot = await getCompetitionSnapshot(data.competition_id);
  const climber = snapshot.climbers.find((entry) => entry.id === data.id) ?? null;
  if (!climber) {
    return null;
  }

  return {
    climber,
    competition: snapshot.competition,
    path: buildCompetitionPath(snapshot.competition.slug, "scorecard"),
  };
}

export async function getClimberWithAttempts(competitionId: string, climberId: string) {
  ensureConfigured();

  const [climbers, qualifierAttempts, finalAttempts] = await Promise.all([
    fetchClimberRows([competitionId]),
    fetchQualifierAttempts([competitionId]),
    fetchFinalAttempts([competitionId]),
  ]);

  const joined = joinCompetitionData(climbers, qualifierAttempts, finalAttempts);
  return joined.find((entry) => entry.id === climberId) ?? null;
}

export async function searchClimbers(competitionId: string, query: string) {
  ensureConfigured();

  const snapshot = await getCompetitionSnapshot(competitionId);
  const normalized = cleanString(query).toLowerCase();
  if (!normalized) {
    return snapshot.climbers;
  }

  return snapshot.climbers.filter((climber) => {
    return (
      climber.name.toLowerCase().includes(normalized) ||
      climber.climber_number.toLowerCase().includes(normalized) ||
      climber.province.toLowerCase().includes(normalized) ||
      climber.display_category.toLowerCase().includes(normalized)
    );
  });
}

export async function registerClimber(input: RegisterClimberInput) {
  ensureConfigured();

  const snapshot = await getCompetitionSnapshot(input.competitionId);
  assertRegistrationWindowOpen(snapshot.competition);

  const existing = snapshot.climbers.find(
    (climber) => climber.climber_number.toLowerCase() === cleanString(input.climberNumber).toLowerCase()
  );
  if (existing) {
    throw new Error(`Climber number ${input.climberNumber} is already registered as ${existing.name}.`);
  }

  if (!isValidClimberNumber(input.climberNumber)) {
    throw new Error("Climber numbers must be 1 to 4 digits.");
  }

  if (snapshot.climbers.length >= snapshot.competition.max_climbers) {
    throw new Error("This competition is already at the configured climber capacity.");
  }

  const category = snapshot.competition.categories.find((entry) => entry.id === input.categoryId);
  if (!category) {
    throw new Error("Please choose a valid category.");
  }
  if (!isQualifierEligibleCategory(snapshot.competition, category.age_group)) {
    throw new Error("That age group is not enabled for qualifier registration in this competition.");
  }

  let slot: CompetitionScheduleBlock | null = null;
  if (input.timeSlotId) {
    slot = snapshot.competition.schedule_blocks.find((entry) => entry.id === input.timeSlotId) ?? null;
    if (!slot) {
      throw new Error("Please choose a valid schedule block.");
    }

    if (!schedulePhaseAllowsRegistration(slot.phase_type)) {
      throw new Error("That schedule block is not open for registration.");
    }

    if (!validateSlotForCategory(slot, category.id)) {
      throw new Error("That schedule block is not available for the selected category.");
    }

    const slotCount = snapshot.climbers.filter((climber) => climber.time_slot_id === slot?.id).length;
    if (slotCount >= slot.capacity) {
      throw new Error("That schedule block is already full.");
    }
  } else if (
    snapshot.competition.schedule_blocks.filter(
      (block) => block.capacity > 0 && schedulePhaseAllowsRegistration(block.phase_type)
    ).length > 0
  ) {
    throw new Error("Please choose a schedule block.");
  }

  const accessToken = createAccessToken();
  const rpcPayload = {
    p_competition_id: snapshot.competition.id,
    p_name: cleanString(input.name),
    p_climber_number: cleanString(input.climberNumber),
    p_province: cleanString(input.province),
    p_category_id: category.id,
    p_time_slot_id: slot?.id ?? null,
    p_access_token: accessToken,
  };

  const { data, error } = await supabase.rpc("register_climber_for_competition", rpcPayload);

  if (
    error &&
    error.message.includes("Could not find the function public.register_climber_for_competition")
  ) {
    throw new Error(
      "Registration is unavailable because the latest database migration has not been applied yet."
    );
  }

  if (error) {
    throw new Error(error.message);
  }

  const climber = (Array.isArray(data) ? data[0] : data) as Climber | null;
  if (!climber) {
    throw new Error("Registration succeeded but no climber record was returned.");
  }

  return {
    ...climber,
    competition_slug: snapshot.competition.slug,
    scorecard_path: buildCompetitionPath(snapshot.competition.slug, "scorecard"),
  };
}

export async function updateQualifierAttemptByStaff(
  competitionId: string,
  climberId: string,
  climbNumber: number,
  attemptCount: number,
  topped: boolean,
  options?: {
    zone?: boolean;
    attemptsToTop?: number | null;
    attemptsToZone?: number | null;
  }
) {
  ensureConfigured();

  const competition = await getCompetitionById(competitionId);
  if (!competition) {
    throw new Error("Competition not found.");
  }
  assertStaffQualifierWindowOpen(competition);
  const normalized = normalizeQualifierAttemptInput({
    attemptCount,
    topped,
    zone: options?.zone,
    attemptsToTop: options?.attemptsToTop,
    attemptsToZone: options?.attemptsToZone,
  });

  const { data, error } = await supabase
    .from("qualifier_attempts")
    .upsert(
      {
        competition_id: competitionId,
        climber_id: climberId,
        climb_number: climbNumber,
        attempt_count: normalized.attemptCount,
        zone: normalized.zone,
        topped: normalized.topped,
        attempts_to_top: normalized.attemptsToTop,
        attempts_to_zone: normalized.attemptsToZone,
        entered_by: "staff",
      },
      { onConflict: "climber_id,climb_number" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as QualifierAttempt;
}

export async function updateQualifierAttemptByToken(
  accessToken: string,
  competitionId: string,
  climbNumber: number,
  attemptCount: number,
  topped: boolean
) {
  ensureConfigured();

  const competition = await getCompetitionById(competitionId);
  if (!competition) {
    throw new Error("Competition not found.");
  }
  assertClimberQualifierWindowOpen(competition);

  const { data, error } = await publicSupabase.rpc("submit_qualifier_attempt", {
    p_access_token: cleanString(accessToken),
    p_competition_id: competitionId,
    p_climb_number: climbNumber,
    p_attempt_count: attemptCount,
    p_topped: topped,
  });

  if (!error) {
    return data;
  }
  throw new Error(error.message || "Unable to save qualifier attempt.");
}

export async function joinLiveBoulderQueue(
  accessToken: string,
  competitionId: string,
  climbNumber: number
) {
  ensureConfigured();

  const competition = await getCompetitionById(competitionId);
  if (!competition) {
    throw new Error("Competition not found.");
  }

  if (!canUseLiveBoulderQueue(competition)) {
    throw new Error("The live boulder queue opens only during an active scramble session.");
  }

  const { data, error } = await publicSupabase.rpc("join_live_boulder_queue", {
    p_access_token: cleanString(accessToken),
    p_competition_id: competitionId,
    p_climb_number: climbNumber,
  });

  if (error) {
    throw new Error(error.message || "Unable to join the live boulder queue.");
  }

  return data;
}

export async function leaveLiveBoulderQueue(accessToken: string, competitionId: string) {
  ensureConfigured();

  const { error } = await publicSupabase.rpc("leave_live_boulder_queue", {
    p_access_token: cleanString(accessToken),
    p_competition_id: competitionId,
  });

  if (error) {
    throw new Error(error.message || "Unable to leave the live boulder queue.");
  }
}

export async function updateFinalAttempt(
  competitionId: string,
  climberId: string,
  climbNumber: number,
  top: boolean,
  zone: boolean,
  attemptsToTop: number | null,
  attemptsToZone: number | null
) {
  ensureConfigured();

  const snapshot = await getCompetitionSnapshot(competitionId);
  assertFinalsWindowOpen(snapshot.competition);
  const normalized = normalizeFinalAttemptInput({
    top,
    zone,
    attemptsToTop,
    attemptsToZone,
  });

  if (!snapshot.finalists.some((entry) => entry.climber_id === climberId)) {
    throw new Error("Only finalists can receive finals scores.");
  }

  const { data, error } = await supabase
    .from("final_attempts")
    .upsert(
      {
        competition_id: competitionId,
        climber_id: climberId,
        climb_number: climbNumber,
        top: normalized.top,
        zone: normalized.zone,
        attempts_to_top: normalized.attemptsToTop,
        attempts_to_zone: normalized.attemptsToZone,
        entered_by: "staff",
      },
      { onConflict: "climber_id,climb_number" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as FinalAttempt;
}
