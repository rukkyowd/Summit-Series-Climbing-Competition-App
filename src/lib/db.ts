import { assertSupabaseConfigured, publicSupabase, supabase } from "./supabase";
import { isDemoCompetitionRecord } from "./demo";
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
  canRegisterForScheduleBlock,
  competitionHasFinals,
  createCompetitionRoundId,
  createCategoryKey,
  getCompetitionRoundById,
  getActiveQueueSessionBlock,
  getActiveFinalsRound,
  getActiveScheduleBlock,
  getActiveQualifierStyleRound,
  getFinalsStyleRounds,
  getQualifierStyleRounds,
  isRoundActiveForCompetitionPhase,
  isValidClimberNumber,
  isQualifierEligibleCategory,
  isCompetitionLiveNow,
  isFinalsStage,
  isQualifierStage,
  normalizeCompetition,
  normalizeCompetitionRounds,
  schedulePhaseAllowsRegistration,
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
  is_demo?: boolean;
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
  activeQualifierRound?: CompetitionRound | null;
  activeFinalsRound?: CompetitionRound | null;
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

export type ScoreWriteStatus = "accepted" | "projected" | "conflicted" | "ignored_as_stale";

export interface ScoreWriteResult<TAttempt> {
  attempt: TAttempt;
  status: ScoreWriteStatus;
  conflictReason: string | null;
  clientEventId: string;
  scoredAt: string;
}

type RegisteredClimberResult = Climber & {
  competition_slug: string;
  scorecard_path: string;
};

type ReadOptions = { authenticated?: boolean };
type SupabaseReadClient = typeof publicSupabase | typeof supabase;

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

function getReadClient(options?: ReadOptions): SupabaseReadClient {
  return options?.authenticated ? supabase : publicSupabase;
}

async function postAdminCompetitionAction<TResponse extends Record<string, unknown> = Record<string, unknown>>(
  payload: Record<string, unknown>
) {
  const response = await fetch("/api/staff/competitions/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;

  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "Unable to complete admin action.");
  }

  return (body ?? {}) as TResponse;
}

function cleanString(value: string) {
  return value.trim();
}

function cleanOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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

function parseScoreWriteResult<TAttempt>(payload: unknown) {
  const normalizedPayload =
    Array.isArray(payload) ? payload[0] : payload;

  if (!normalizedPayload || typeof normalizedPayload !== "object") {
    throw new Error("Score save completed without a valid payload.");
  }

  const record = normalizedPayload as Record<string, unknown>;
  const attempt = record.attempt;
  if (!attempt || typeof attempt !== "object") {
    throw new Error("Score save completed without a projected attempt row.");
  }

  return {
    attempt: attempt as TAttempt,
    status: (record.status as ScoreWriteStatus | undefined) ?? "accepted",
    conflictReason:
      typeof record.conflict_reason === "string"
        ? record.conflict_reason
        : typeof record.conflictReason === "string"
          ? record.conflictReason
          : null,
    clientEventId:
      typeof record.client_event_id === "string"
        ? record.client_event_id
        : typeof record.clientEventId === "string"
          ? record.clientEventId
          : "",
    scoredAt:
      typeof record.scored_at === "string"
        ? record.scored_at
        : typeof record.scoredAt === "string"
          ? record.scoredAt
          : new Date().toISOString(),
  } satisfies ScoreWriteResult<TAttempt>;
}

async function postStaffScore<TAttempt>(path: string, payload: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Unable to save score.";
    throw new Error(message);
  }

  return parseScoreWriteResult<TAttempt>(data);
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

function requireActiveQualifierStyleRound(competition: Competition) {
  const round = getActiveQualifierStyleRound(competition);
  if (!round) {
    throw new Error("No active qualifier-style round is configured for scoring.");
  }

  return round;
}

function requireActiveFinalsRound(competition: Competition) {
  const round = getActiveFinalsRound(competition);
  if (!round) {
    throw new Error("No active finals round is configured for scoring.");
  }

  return round;
}

async function fetchCompetitionRows(includeArchived = false, readClient: SupabaseReadClient = publicSupabase) {
  let query = readClient.from("competitions").select("*").order("start_date", { ascending: false }).order("name");

  if (!includeArchived) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) {
    return [] as any[];
  }

  return data ?? [];
}

async function fetchCompetitionRowBySlug(slug: string, readClient: SupabaseReadClient = publicSupabase) {
  const { data, error } = await readClient.from("competitions").select("*").eq("slug", slug).maybeSingle();
  if (error) {
    return null;
  }

  return data;
}

async function fetchCompetitionRowById(id: string, readClient: SupabaseReadClient = publicSupabase) {
  const { data, error } = await readClient.from("competitions").select("*").eq("id", id).maybeSingle();
  if (error) {
    return null;
  }

  return data;
}

async function fetchCompetitionCategories(competitionIds: string[], readClient: SupabaseReadClient = publicSupabase) {
  if (!competitionIds.length) {
    return [] as CompetitionCategory[];
  }

  const { data, error } = await readClient
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

async function fetchCompetitionScheduleBlocks(competitionIds: string[], readClient: SupabaseReadClient = publicSupabase) {
  if (!competitionIds.length) {
    return [] as CompetitionScheduleBlock[];
  }

  const { data, error } = await readClient
    .from("competition_schedule_blocks")
    .select("*")
    .in("competition_id", competitionIds)
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return [] as CompetitionScheduleBlock[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id ?? createId(),
    competition_id: row.competition_id,
    round_id: row.round_id ?? null,
    sort_order: row.sort_order ?? 0,
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

async function fetchCompetitionRounds(competitionIds: string[], readClient: SupabaseReadClient = publicSupabase) {
  if (!competitionIds.length) {
    return [] as CompetitionRound[];
  }

  const { data, error } = await readClient
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

async function fetchClimberRows(competitionIds: string[], readClient: SupabaseReadClient = publicSupabase) {
  if (!competitionIds.length) {
    return [] as Climber[];
  }

  const { data, error } = await readClient
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

async function fetchClimberRowById(
  competitionId: string,
  climberId: string,
  readClient: SupabaseReadClient = publicSupabase
) {
  const { data, error } = await readClient
    .from("climbers")
    .select("*")
    .eq("competition_id", competitionId)
    .eq("id", climberId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    competition_id: data.competition_id,
    name: data.name ?? "Unknown climber",
    climber_number: data.climber_number ?? "",
    province: data.province ?? "",
    category_id: data.category_id ?? null,
    gender_division: data.gender_division ?? "",
    age_group: data.age_group ?? "",
    display_category: data.display_category ?? "",
    time_slot_id: data.time_slot_id ?? null,
    access_token: data.access_token ?? "",
    access_token_created_at: data.access_token_created_at ?? undefined,
    registered_at: data.registered_at ?? undefined,
  } satisfies Climber;
}

async function fetchQualifierAttempts(competitionIds: string[], readClient: SupabaseReadClient = publicSupabase) {
  if (!competitionIds.length) {
    return [] as QualifierAttempt[];
  }

  const { data, error } = await readClient
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
    round_id: row.round_id ?? null,
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

async function fetchFinalAttempts(competitionIds: string[], readClient: SupabaseReadClient = publicSupabase) {
  if (!competitionIds.length) {
    return [] as FinalAttempt[];
  }

  const { data, error } = await readClient
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
    round_id: row.round_id ?? null,
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

async function fetchFinalists(competitionIds: string[], readClient: SupabaseReadClient = publicSupabase) {
  if (!competitionIds.length) {
    return [] as (FinalistSelection & { competition_id: string })[];
  }

  const { data, error } = await readClient
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

async function fetchBoulderQueueRows(
  competitionId: string,
  scheduleBlockId: string | null,
  readClient: SupabaseReadClient = publicSupabase
) {
  if (!scheduleBlockId) {
    return [] as BoulderQueueRow[];
  }

  const freshAfter = new Date(Date.now() - LIVE_BOULDER_QUEUE_STALE_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await readClient
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
  return isDemoCompetitionRecord({ slug, is_demo: false });
}

async function fetchBoulderQueueRowsForCompetition(
  competition: Competition,
  scheduleBlockId: string | null,
  readClient: SupabaseReadClient = publicSupabase
) {
  const freshRows = await fetchBoulderQueueRows(competition.id, scheduleBlockId, readClient);

  if (freshRows.length || !scheduleBlockId || !isDemoCompetitionSlug(competition.slug)) {
    return freshRows;
  }

  const { data, error } = await readClient
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

async function fetchOfficialQualifierLeaderboard(
  competitionId: string,
  roundId: string | null,
  readClient: SupabaseReadClient = publicSupabase
) {
  const { data, error } = await readClient.rpc("compute_qualifier_standings", {
    p_competition_id: competitionId,
    p_round_id: roundId,
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

async function fetchProjectedFinalists(
  competitionId: string,
  sourceRoundId: string | null,
  cutoff: number | null = null,
  readClient: SupabaseReadClient = publicSupabase
) {
  const { data, error } = await readClient.rpc("compute_finalist_selection", {
    p_competition_id: competitionId,
    p_source_round_id: sourceRoundId,
    p_cutoff_override: cutoff,
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

const ROUND_VALIDATION_ERRORS = {
  missingLinkedRound: "That schedule block is no longer linked to a valid round.",
  disabledLinkedRound: "That schedule block belongs to a round that is currently disabled.",
  inactiveLinkedRound: "That schedule block belongs to a round that is not active for the current phase.",
  wrongLinkedRoundBucket: "That schedule block is not connected to a qualifier scoring round.",
  missingClimberSlot: "This climber must be assigned to a session before qualifier scores can be recorded.",
  missingClimberSlotBlock: "This climber is assigned to a session that no longer exists.",
  missingClimberSlotRound: "This climber's assigned session is not linked to a scoring round.",
  mismatchedClimberRound: "This climber is assigned to a different round or session than the one currently being scored.",
} as const;

function resolveLinkedRoundForScheduleBlock(competition: Competition, slot: CompetitionScheduleBlock) {
  if (!slot.round_id) {
    return null;
  }

  return getCompetitionRoundById(competition, slot.round_id);
}

function assertRegistrationBlockOpenForRound(competition: Competition, slot: CompetitionScheduleBlock) {
  if (!schedulePhaseAllowsRegistration(slot.phase_type)) {
    throw new Error("That schedule block is not open for registration.");
  }

  if (!slot.round_id) {
    if (!canRegisterForScheduleBlock(competition, slot)) {
      throw new Error(ROUND_VALIDATION_ERRORS.inactiveLinkedRound);
    }

    return null;
  }

  const round = resolveLinkedRoundForScheduleBlock(competition, slot);
  if (!round) {
    throw new Error(ROUND_VALIDATION_ERRORS.missingLinkedRound);
  }

  if (round.scoring_bucket !== "qualifier") {
    throw new Error(ROUND_VALIDATION_ERRORS.wrongLinkedRoundBucket);
  }

  if (!round.is_enabled) {
    throw new Error(ROUND_VALIDATION_ERRORS.disabledLinkedRound);
  }

  if (!isRoundActiveForCompetitionPhase(competition, round)) {
    throw new Error(ROUND_VALIDATION_ERRORS.inactiveLinkedRound);
  }

  return round;
}

function resolveClimberAssignedQualifierRound(
  competition: Competition,
  climber: Pick<Climber, "time_slot_id">
) {
  if (!climber.time_slot_id) {
    throw new Error(ROUND_VALIDATION_ERRORS.missingClimberSlot);
  }

  const slot = competition.schedule_blocks.find((entry) => entry.id === climber.time_slot_id) ?? null;
  if (!slot) {
    throw new Error(ROUND_VALIDATION_ERRORS.missingClimberSlotBlock);
  }

  const round = resolveLinkedRoundForScheduleBlock(competition, slot);
  if (!round) {
    throw new Error(ROUND_VALIDATION_ERRORS.missingClimberSlotRound);
  }

  if (round.scoring_bucket !== "qualifier") {
    throw new Error(ROUND_VALIDATION_ERRORS.wrongLinkedRoundBucket);
  }

  if (!round.is_enabled) {
    throw new Error(ROUND_VALIDATION_ERRORS.disabledLinkedRound);
  }

  if (!isRoundActiveForCompetitionPhase(competition, round)) {
    throw new Error(ROUND_VALIDATION_ERRORS.inactiveLinkedRound);
  }

  return { slot, round };
}

export async function listCompetitions(includeArchived = false, options?: ReadOptions) {
  ensureConfigured();
  const readClient = getReadClient(options);

  const rows = await fetchCompetitionRows(includeArchived, readClient);
  const competitionIds = rows.map((row) => row.id as string);
  const [categories, scheduleBlocks, rounds] = await Promise.all([
    fetchCompetitionCategories(competitionIds, readClient),
    fetchCompetitionScheduleBlocks(competitionIds, readClient),
    fetchCompetitionRounds(competitionIds, readClient),
  ]);

  return hydrateCompetitions(rows, categories, scheduleBlocks, rounds);
}

export async function listCompetitionSummaries(
  includeArchived = false,
  options?: ReadOptions
): Promise<CompetitionSummary[]> {
  ensureConfigured();
  const readClient = getReadClient(options);

  const competitions = await listCompetitions(includeArchived, options);
  const competitionIds = competitions.map((competition) => competition.id);
  const [climbers, finalists] = await Promise.all([
    fetchClimberRows(competitionIds, readClient),
    fetchFinalists(competitionIds, readClient),
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

export async function getCompetitionBySlug(slug: string, options?: ReadOptions) {
  ensureConfigured();
  const readClient = getReadClient(options);

  const row = await fetchCompetitionRowBySlug(cleanString(slug), readClient);
  if (!row) {
    return null;
  }

  const [categories, scheduleBlocks, rounds] = await Promise.all([
    fetchCompetitionCategories([row.id], readClient),
    fetchCompetitionScheduleBlocks([row.id], readClient),
    fetchCompetitionRounds([row.id], readClient),
  ]);

  return hydrateCompetitions([row], categories, scheduleBlocks, rounds)[0] ?? null;
}

export async function getCompetitionById(id: string, options?: ReadOptions) {
  ensureConfigured();
  const readClient = getReadClient(options);

  const row = await fetchCompetitionRowById(id, readClient);
  if (!row) {
    return null;
  }

  const [categories, scheduleBlocks, rounds] = await Promise.all([
    fetchCompetitionCategories([row.id], readClient),
    fetchCompetitionScheduleBlocks([row.id], readClient),
    fetchCompetitionRounds([row.id], readClient),
  ]);

  return hydrateCompetitions([row], categories, scheduleBlocks, rounds)[0] ?? null;
}

async function resolveCompetition(identifier: string, options?: ReadOptions) {
  const bySlug = await getCompetitionBySlug(identifier, options);
  if (bySlug) {
    return bySlug;
  }

  return getCompetitionById(identifier, options);
}

export async function getCompetitionSnapshot(
  identifier: string,
  options?: ReadOptions
): Promise<CompetitionSnapshot> {
  ensureConfigured();
  const readClient = getReadClient(options);

  const competition = await resolveCompetition(identifier, options);
  if (!competition) {
    throw new Error("Competition not found.");
  }

  const currentRounds = normalizeCompetitionRounds(competition.rounds ?? [], competition);
  const finalsRound = getFinalsStyleRounds(currentRounds)[0] ?? null;
  const qualifierStyleRounds = getQualifierStyleRounds(currentRounds);
  const advancementSourceRound =
    qualifierStyleRounds.find((round) => round.id === finalsRound?.advancement_source_round_id) ??
    qualifierStyleRounds[qualifierStyleRounds.length - 1] ??
    null;
  const activeQualifierRound = getActiveQualifierStyleRound({
    ...competition,
    rounds: currentRounds,
  });
  const activeFinalsRound = getActiveFinalsRound({
    ...competition,
    rounds: currentRounds,
  });
  const activeQueueSession = getActiveQueueSessionBlock(competition);

  const [climbers, qualifierAttempts, finalAttempts, finalists, queueRows, officialQualifierLeaderboard, projectedFinalists, undoAvailability, rounds] = await Promise.all([
    fetchClimberRows([competition.id], readClient),
    fetchQualifierAttempts([competition.id], readClient),
    fetchFinalAttempts([competition.id], readClient),
    fetchFinalists([competition.id], readClient),
    fetchBoulderQueueRowsForCompetition(competition, activeQueueSession?.id ?? null, readClient),
    fetchOfficialQualifierLeaderboard(competition.id, activeQualifierRound?.id ?? null, readClient),
    fetchProjectedFinalists(
      competition.id,
      advancementSourceRound?.id ?? activeQualifierRound?.id ?? null,
      finalsRound?.advancement_cutoff ?? finalsRound?.finals_cutoff ?? null,
      readClient
    ),
    fetchUndoAvailability(competition.id).catch(() => ({
      available: false,
      expires_at: null,
      operation_type: null,
    })),
    fetchCompetitionRounds([competition.id], readClient),
  ]);
  const resolvedRounds = normalizeCompetitionRounds(rounds, competition);
  const resolvedCompetition = {
    ...competition,
    rounds: resolvedRounds,
  };
  const resolvedActiveQualifierRound = getActiveQualifierStyleRound(resolvedCompetition);
  const resolvedActiveFinalsRound = getActiveFinalsRound(resolvedCompetition);

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
  const localQualifierLeaderboard = buildQualifierLeaderboard(joined, resolvedCompetition, resolvedActiveQualifierRound);
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
    resolvedCompetition.current_phase === "qualifier_open"
      ? projectedFinalists.filter((entry) => !entry.advanced_with_tie)
      : projectedFinalists;
  const competitionFinalists = dedupeFinalists(
    selectedFinalists.length ? selectedFinalists : liveProjectedFinalists
  );
  const finalsLeaderboard = isFinalsStage(resolvedCompetition)
    ? buildFinalsLeaderboard(joined, competitionFinalists, resolvedCompetition, resolvedActiveFinalsRound)
    : [];

  return {
    competition: resolvedCompetition,
    climbers: joined,
    boulderQueue,
    qualifierLeaderboard,
    finalsLeaderboard,
    finalists: competitionFinalists,
    finalistsPersisted: selectedFinalists.length > 0,
    registrationChoices: buildRegistrationChoices(resolvedCompetition, joined.map((climber) => climber)),
    undoAvailability,
    rounds: resolvedRounds,
    activeQualifierRound: resolvedActiveQualifierRound,
    activeFinalsRound: resolvedActiveFinalsRound,
  };
}

export async function createCompetitionFromTemplate(input: CreateCompetitionInput) {
  ensureConfigured();
  const result = await postAdminCompetitionAction<{ competitionId?: string }>({
    action: "create",
    input,
  });
  if (!result.competitionId) {
    throw new Error("Competition was created but no id was returned.");
  }

  const competition = await getCompetitionById(result.competitionId, { authenticated: true });
  if (!competition) {
    throw new Error("Competition was created but could not be loaded.");
  }

  return competition;
}

export async function saveCompetitionConfig(competitionId: string, input: SaveCompetitionConfigInput) {
  ensureConfigured();
  await postAdminCompetitionAction({
    action: "save_config",
    competitionId,
    input,
  });

  return getCompetitionById(competitionId, { authenticated: true });
}

export async function setCompetitionLiveScheduleBlock(competitionId: string, blockId: string) {
  ensureConfigured();
  await postAdminCompetitionAction({
    action: "set_live_schedule_block",
    competitionId,
    blockId,
  });
}

export async function setCompetitionStatus(competitionId: string, status: CompetitionStatus) {
  ensureConfigured();
  await postAdminCompetitionAction({
    action: "set_status",
    competitionId,
    status,
  });
}

export async function setCompetitionPhase(competitionId: string, nextPhase: CompetitionPhase, note?: string) {
  ensureConfigured();
  await postAdminCompetitionAction({
    action: "set_phase",
    competitionId,
    nextPhase,
    note,
  });

  return getCompetitionSnapshot(competitionId, { authenticated: true });
}

export async function undoCompetitionOperation(competitionId: string) {
  ensureConfigured();
  await postAdminCompetitionAction({
    action: "undo",
    competitionId,
  });

  return getCompetitionSnapshot(competitionId, { authenticated: true });
}

export async function deleteCompetition(competitionId: string) {
  ensureConfigured();
  await postAdminCompetitionAction({
    action: "delete",
    competitionId,
  });
}

export async function advanceCompetitionToFinals(competitionId: string) {
  ensureConfigured();
  await postAdminCompetitionAction({
    action: "advance_to_finals",
    competitionId,
  });

  return getCompetitionSnapshot(competitionId, { authenticated: true });
}

export async function updateFinalistClimbingOrder(competitionId: string, orderedClimberIds: string[]) {
  ensureConfigured();
  await postAdminCompetitionAction({
    action: "update_finalist_order",
    competitionId,
    orderedClimberIds,
  });

  return getCompetitionSnapshot(competitionId, { authenticated: true });
}

export async function saveFinalistField(
  competitionId: string,
  orderedFinalists: FinalistSelection[]
) {
  ensureConfigured();
  await postAdminCompetitionAction({
    action: "save_finalist_field",
    competitionId,
    orderedFinalists,
  });

  return getCompetitionSnapshot(competitionId, { authenticated: true });
}

export async function resetCompetition(competitionId: string) {
  ensureConfigured();
  await postAdminCompetitionAction({
    action: "reset",
    competitionId,
  });

  return getCompetitionSnapshot(competitionId, { authenticated: true });
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

    assertRegistrationBlockOpenForRound(snapshot.competition, slot);

    if (!validateSlotForCategory(slot, category.id)) {
      throw new Error("That schedule block is not available for the selected category.");
    }

    const slotCount = snapshot.climbers.filter((climber) => climber.time_slot_id === slot?.id).length;
    if (slotCount >= slot.capacity) {
      throw new Error("That schedule block is already full.");
    }
  } else if (
    snapshot.competition.schedule_blocks.filter(
      (block) => block.capacity > 0 && canRegisterForScheduleBlock(snapshot.competition, block)
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
    clientEventId?: string;
    scoredAt?: string;
    judgeDeviceId?: string | null;
    judgeSessionId?: string | null;
    replayedFromOffline?: boolean;
  }
) {
  ensureConfigured();

  const competition = await getCompetitionById(competitionId);
  if (!competition) {
    throw new Error("Competition not found.");
  }
  assertStaffQualifierWindowOpen(competition);
  const climber = await fetchClimberRowById(competitionId, climberId);
  if (!climber) {
    throw new Error("Climber not found.");
  }
  const { round: linkedRound } = resolveClimberAssignedQualifierRound(competition, climber);
  const activeRound = requireActiveQualifierStyleRound(competition);
  if (activeRound.id !== linkedRound.id) {
    throw new Error(ROUND_VALIDATION_ERRORS.mismatchedClimberRound);
  }
  const normalized = normalizeQualifierAttemptInput({
    attemptCount,
    topped,
    zone: options?.zone,
    attemptsToTop: options?.attemptsToTop,
    attemptsToZone: options?.attemptsToZone,
  });

  return postStaffScore<QualifierAttempt>("/api/staff/scores/qualifier", {
    competitionId,
    climberId,
    climbNumber,
    attemptCount: normalized.attemptCount,
    topped: normalized.topped,
    zone: normalized.zone,
    attemptsToTop: normalized.attemptsToTop,
    attemptsToZone: normalized.attemptsToZone,
    clientEventId: options?.clientEventId,
    scoredAt: options?.scoredAt,
    judgeDeviceId: cleanOptionalString(options?.judgeDeviceId),
    judgeSessionId: cleanOptionalString(options?.judgeSessionId),
    replayedFromOffline: options?.replayedFromOffline ?? false,
  });
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
  attemptsToZone: number | null,
  options?: {
    clientEventId?: string;
    scoredAt?: string;
    judgeDeviceId?: string | null;
    judgeSessionId?: string | null;
    replayedFromOffline?: boolean;
  }
) {
  ensureConfigured();

  const snapshot = await getCompetitionSnapshot(competitionId);
  assertFinalsWindowOpen(snapshot.competition);
  requireActiveFinalsRound(snapshot.competition);
  const normalized = normalizeFinalAttemptInput({
    top,
    zone,
    attemptsToTop,
    attemptsToZone,
  });

  if (!snapshot.finalists.some((entry) => entry.climber_id === climberId)) {
    throw new Error("Only finalists can receive finals scores.");
  }

  return postStaffScore<FinalAttempt>("/api/staff/scores/final", {
    competitionId,
    climberId,
    climbNumber,
    top: normalized.top,
    zone: normalized.zone,
    attemptsToTop: normalized.attemptsToTop,
    attemptsToZone: normalized.attemptsToZone,
    clientEventId: options?.clientEventId,
    scoredAt: options?.scoredAt,
    judgeDeviceId: cleanOptionalString(options?.judgeDeviceId),
    judgeSessionId: cleanOptionalString(options?.judgeSessionId),
    replayedFromOffline: options?.replayedFromOffline ?? false,
  });
}
