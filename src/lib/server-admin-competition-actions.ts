import { createServiceRoleSupabaseClient } from "./server-supabase";
import { sanitizeExternalUrl } from "./security";
import {
  DEFAULT_COMPETITION,
  buildDisplayCategory,
  createCategoryKey,
  createCompetitionId,
  createCompetitionRoundId,
  getDefaultCompetitionCategories,
  getFinalsStyleRounds,
  getQualifierStyleRounds,
  getRecommendedFinalsCutoff,
  getRecommendedQualifierClimbCount,
  getRecommendedQualifierCountingClimbs,
  normalizeCompetition,
  normalizeCompetitionRounds,
  slugifyCompetitionName,
  type Competition,
  type CompetitionCategory,
  type CompetitionPhase,
  type CompetitionRound,
  type CompetitionScheduleBlock,
  type CompetitionStatus,
  type FinalistSelection,
} from "./scoring";

type CompetitionFormat = Competition["format"];
type ServiceRoleSupabaseClient = ReturnType<typeof createServiceRoleSupabaseClient>;

export type AdminCompetitionActionRequest = {
  action?: string;
  competitionId?: string;
  input?: Record<string, unknown>;
  blockId?: string;
  status?: CompetitionStatus;
  nextPhase?: CompetitionPhase;
  note?: string;
  orderedClimberIds?: string[];
  orderedFinalists?: FinalistSelection[];
};

const OPTIONAL_COMPETITION_LINK_COLUMNS = [
  "official_event_url",
  "official_registration_url",
  "official_schedule_url",
] as const;

const COMPETITION_PHASES: CompetitionPhase[] = [
  "qualifier_open",
  "qualifier_closed",
  "wall_reset",
  "observation",
  "finals_open",
  "finals_closed",
  "results",
];

const COMPETITION_STATUSES: CompetitionStatus[] = ["active", "archived"];
const COMPETITION_FORMATS: CompetitionFormat[] = [
  "scramble",
  "five_on_five_off",
  "flash_format",
  "ifsc_finals_format",
];

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptionalExternalUrl(value: unknown) {
  return sanitizeExternalUrl(typeof value === "string" ? value : null) || "";
}

function arrayifyIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function isMissingCompetitionLinkColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return OPTIONAL_COMPETITION_LINK_COLUMNS.some((column) => message.includes(column));
}

function stripOptionalCompetitionLinkColumns<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload };
  OPTIONAL_COMPETITION_LINK_COLUMNS.forEach((column) => {
    delete next[column];
  });
  return next;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function requireString(value: unknown, label: string) {
  const normalized = cleanString(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function getScoreBearingRounds(rounds: CompetitionRound[]) {
  return {
    qualifierRound: getQualifierStyleRounds(rounds)[0] ?? null,
    finalsRound: getFinalsStyleRounds(rounds)[0] ?? null,
  };
}

function assertValidCompetitionRounds(rounds: CompetitionRound[]) {
  const finalsScoreRounds = getFinalsStyleRounds(rounds);
  const activeRounds = rounds.filter((round) => round.is_active);

  if (finalsScoreRounds.length > 1) {
    throw new Error("Only one round can use the finals scoring bucket.");
  }

  if (rounds.some((round) => round.round_type === "finals" && round.scoring_bucket === "qualifier")) {
    throw new Error("Finals rounds must use the finals scoring bucket or remain planning-only.");
  }

  if (rounds.some((round) => round.round_type !== "finals" && round.scoring_bucket === "finals")) {
    throw new Error("Only finals rounds can use the finals scoring bucket.");
  }

  if (activeRounds.length > 1) {
    throw new Error("Only one round can be active at a time.");
  }
}

function projectLegacyCompetitionFields(competition: Competition, rounds: CompetitionRound[]) {
  const { qualifierRound, finalsRound } = getScoreBearingRounds(rounds);

  return {
    format: qualifierRound?.format ?? competition.format,
    total_climbs: qualifierRound?.problem_count ?? competition.total_climbs,
    qualifier_counting_climbs: qualifierRound?.counting_climbs ?? competition.qualifier_counting_climbs,
    finals_cutoff: finalsRound?.finals_cutoff ?? qualifierRound?.finals_cutoff ?? competition.finals_cutoff,
    finals_problem_count: finalsRound?.problem_count ?? competition.finals_problem_count,
    has_finals: finalsRound !== null ? true : competition.has_finals,
  };
}

function mapCategoryRows(rows: any[]) {
  return rows.map((row) => ({
    id: row.id ?? createCategoryKey(row.gender_division ?? "Open", row.age_group ?? "Open"),
    competition_id: row.competition_id,
    gender_division: row.gender_division ?? "Open",
    age_group: row.age_group ?? "Open",
    display_name: row.display_name ?? buildDisplayCategory(row.gender_division ?? "Open", row.age_group ?? "Open"),
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at ?? undefined,
  })) satisfies CompetitionCategory[];
}

function mapScheduleBlockRows(rows: any[]) {
  return rows.map((row) => ({
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
  })) satisfies CompetitionScheduleBlock[];
}

function mapRoundRows(rows: any[]) {
  return rows.map((row) => ({
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
  })) satisfies CompetitionRound[];
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

function normalizeScheduleBlocks(input: unknown) {
  if (!Array.isArray(input)) {
    return [] as CompetitionScheduleBlock[];
  }

  return input.map((block, index) => {
    const row = block as Partial<CompetitionScheduleBlock>;
    return {
      id: row.id || createId(),
      competition_id: row.competition_id ?? "",
      round_id: row.round_id ?? null,
      sort_order: row.sort_order ?? index,
      label: cleanString(row.label) || "Open block",
      phase_type: row.phase_type ?? "custom",
      audience_label: cleanString(row.audience_label),
      is_active: Boolean(row.is_active),
      start_time: row.start_time ? cleanString(row.start_time) : null,
      end_time: row.end_time ? cleanString(row.end_time) : null,
      capacity: Number.isFinite(row.capacity) ? Number(row.capacity) : 0,
      eligible_category_ids: Array.isArray(row.eligible_category_ids) ? row.eligible_category_ids : [],
      created_at: row.created_at,
    } satisfies CompetitionScheduleBlock;
  });
}

function normalizeInputRounds(input: unknown, competition: Competition) {
  return normalizeCompetitionRounds(Array.isArray(input) ? (input as CompetitionRound[]) : [], competition);
}

async function fetchAdminCompetitionRows(
  supabase: ServiceRoleSupabaseClient,
  includeArchived: boolean
) {
  let query = supabase.from("competitions").select("*").order("start_date", { ascending: false }).order("name");
  if (!includeArchived) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function fetchAdminCompetitionCategories(
  supabase: ServiceRoleSupabaseClient,
  competitionIds: string[]
) {
  if (!competitionIds.length) {
    return [] as CompetitionCategory[];
  }

  const { data, error } = await supabase
    .from("competition_categories")
    .select("*")
    .in("competition_id", competitionIds)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return mapCategoryRows(data ?? []);
}

async function fetchAdminCompetitionScheduleBlocks(
  supabase: ServiceRoleSupabaseClient,
  competitionIds: string[]
) {
  if (!competitionIds.length) {
    return [] as CompetitionScheduleBlock[];
  }

  const { data, error } = await supabase
    .from("competition_schedule_blocks")
    .select("*")
    .in("competition_id", competitionIds)
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return mapScheduleBlockRows(data ?? []);
}

async function fetchAdminCompetitionRounds(
  supabase: ServiceRoleSupabaseClient,
  competitionIds: string[]
) {
  if (!competitionIds.length) {
    return [] as CompetitionRound[];
  }

  const { data, error } = await supabase
    .from("competition_rounds")
    .select("*")
    .in("competition_id", competitionIds)
    .order("round_number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return mapRoundRows(data ?? []);
}

export async function listAdminCompetitions(includeArchived = true) {
  const supabase = createServiceRoleSupabaseClient();
  const rows = await fetchAdminCompetitionRows(supabase, includeArchived);
  const competitionIds = rows.map((row) => row.id as string);
  const [categories, scheduleBlocks, rounds] = await Promise.all([
    fetchAdminCompetitionCategories(supabase, competitionIds),
    fetchAdminCompetitionScheduleBlocks(supabase, competitionIds),
    fetchAdminCompetitionRounds(supabase, competitionIds),
  ]);

  return hydrateCompetitions(rows, categories, scheduleBlocks, rounds);
}

async function loadCompetitionRecord(supabase: ServiceRoleSupabaseClient, competitionId: string) {
  const { data, error } = await supabase
    .from("competitions")
    .select("*")
    .eq("id", competitionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Competition not found.");
  }

  return data;
}

async function loadCompetitionRounds(supabase: ServiceRoleSupabaseClient, competitionId: string) {
  const { data, error } = await supabase
    .from("competition_rounds")
    .select("*")
    .eq("competition_id", competitionId)
    .order("round_number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return mapRoundRows(data ?? []);
}

async function assertStructuralEditsAllowed(
  supabase: ServiceRoleSupabaseClient,
  previous: Competition,
  next: Competition
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

  const [registrations, qualifierAttempts, finalAttempts, finalists] = await Promise.all([
    supabase.from("climbers").select("id", { count: "exact", head: true }).eq("competition_id", previous.id),
    supabase.from("qualifier_attempts").select("id", { count: "exact", head: true }).eq("competition_id", previous.id),
    supabase.from("final_attempts").select("id", { count: "exact", head: true }).eq("competition_id", previous.id),
    supabase.from("competition_finalists").select("climber_id", { count: "exact", head: true }).eq("competition_id", previous.id),
  ]);

  for (const result of [registrations, qualifierAttempts, finalAttempts, finalists]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  if ((qualifierAttempts.count ?? 0) > 0 || (finalAttempts.count ?? 0) > 0 || (finalists.count ?? 0) > 0) {
    throw new Error("Round structure is locked after scoring or finalist creation begins.");
  }

  if ((registrations.count ?? 0) > 0) {
    throw new Error("Round structure is locked after registrations begin. You can still adjust schedule details.");
  }

  if (previous.current_phase === "results" || previous.current_phase === "finals_closed") {
    throw new Error("Historical competitions cannot change round structure.");
  }
}

async function persistCompetitionRounds(
  supabase: ServiceRoleSupabaseClient,
  competition: Competition,
  rounds: CompetitionRound[]
) {
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

async function syncCompetitionRoundRuntimeState(
  supabase: ServiceRoleSupabaseClient,
  competitionId: string
) {
  const { error } = await supabase.rpc("sync_competition_round_runtime_state", {
    p_competition_id: competitionId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function createCompetition(
  supabase: ServiceRoleSupabaseClient,
  input: Record<string, unknown>
) {
  const format = input.format;
  if (!COMPETITION_FORMATS.includes(format as CompetitionFormat)) {
    throw new Error("A valid competition format is required.");
  }

  const name = requireString(input.name, "Competition name");
  const slugBase = slugifyCompetitionName(name);
  const { data: existingRows, error: existingError } = await supabase
    .from("competitions")
    .select("slug");

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingSlugs = new Set((existingRows ?? []).map((row) => row.slug as string));
  let slug = slugBase;
  let suffix = 2;
  while (existingSlugs.has(slug)) {
    slug = `${slugBase}-${suffix}`;
    suffix += 1;
  }

  const competition = normalizeCompetition({
    id: createCompetitionId(),
    slug,
    name,
    is_demo: Boolean(input.is_demo),
    format: format as CompetitionFormat,
    has_finals: typeof input.has_finals === "boolean" ? input.has_finals : undefined,
    current_phase: "qualifier_open",
    discipline_label: cleanString(input.discipline_label) || "Boulder",
    location_name: cleanString(input.location_name),
    start_date: typeof input.start_date === "string" ? input.start_date : null,
    end_date: typeof input.end_date === "string" ? input.end_date : null,
    registration_opens_at: typeof input.registration_opens_at === "string" ? input.registration_opens_at : null,
    registration_closes_at: typeof input.registration_closes_at === "string" ? input.registration_closes_at : null,
    description: cleanString(input.description),
    hero_image_url: cleanOptionalExternalUrl(input.hero_image_url),
    official_event_url: cleanOptionalExternalUrl(input.official_event_url),
    official_registration_url: cleanOptionalExternalUrl(input.official_registration_url),
    official_schedule_url: cleanOptionalExternalUrl(input.official_schedule_url),
    status: "active",
    stage_mode: "qualifier",
    total_climbs: getRecommendedQualifierClimbCount(format as CompetitionFormat),
    qualifier_counting_climbs: getRecommendedQualifierCountingClimbs(format as CompetitionFormat),
    finals_cutoff: getRecommendedFinalsCutoff(format as CompetitionFormat),
  });
  const legacyProjection = projectLegacyCompetitionFields(competition, competition.rounds ?? []);
  const insertPayload = {
    id: competition.id,
    slug: competition.slug,
    name: competition.name,
    is_demo: competition.is_demo,
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

  await persistCompetitionRounds(supabase, competition, competition.rounds ?? []);
  return { competitionId: competition.id };
}

async function saveCompetitionConfig(
  supabase: ServiceRoleSupabaseClient,
  competitionId: string,
  input: Record<string, unknown>
) {
  const current = await loadCompetitionRecord(supabase, competitionId);
  const existingRounds = await loadCompetitionRounds(supabase, competitionId);
  const previous = normalizeCompetition({ ...current, id: competitionId }, [], [], existingRounds);
  const scheduleBlocks = normalizeScheduleBlocks(input.schedule_blocks).map((block) => ({
    ...block,
    competition_id: competitionId,
  }));
  const draft = normalizeCompetition(
    {
      ...input,
      id: competitionId,
      slug: cleanString(input.slug) || current.slug,
      name: cleanString(input.name) || current.name,
      hero_image_url: cleanOptionalExternalUrl(input.hero_image_url),
      official_event_url: cleanOptionalExternalUrl(input.official_event_url),
      official_registration_url: cleanOptionalExternalUrl(input.official_registration_url),
      official_schedule_url: cleanOptionalExternalUrl(input.official_schedule_url),
    },
    getDefaultCompetitionCategories(competitionId),
    scheduleBlocks,
    []
  );
  const nextRounds = normalizeInputRounds(input.rounds, draft);
  const payload = { ...draft, rounds: nextRounds };

  await assertStructuralEditsAllowed(supabase, previous, payload);
  const legacyProjection = projectLegacyCompetitionFields(payload, payload.rounds ?? []);
  const upsertPayload = {
    id: payload.id,
    slug: payload.slug,
    name: payload.name,
    is_demo: payload.is_demo,
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

  const { error: deleteScheduleError } = await supabase
    .from("competition_schedule_blocks")
    .delete()
    .eq("competition_id", competitionId);
  if (deleteScheduleError) {
    throw new Error(deleteScheduleError.message);
  }

  await persistCompetitionRounds(supabase, payload, payload.rounds ?? []);

  if (scheduleBlocks.length) {
    const { error: scheduleError } = await supabase.from("competition_schedule_blocks").insert(
      scheduleBlocks.map((block, index) => ({
        id: block.id || createId(),
        competition_id: competitionId,
        sort_order: block.sort_order ?? index,
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

  return { competitionId };
}

export async function handleAdminCompetitionAction(payload: AdminCompetitionActionRequest) {
  const supabase = createServiceRoleSupabaseClient();
  const competitionId = payload.competitionId ? cleanString(payload.competitionId) : "";

  switch (payload.action) {
    case "create":
      return createCompetition(supabase, payload.input ?? {});
    case "save_config":
      return saveCompetitionConfig(supabase, requireString(competitionId, "Competition id"), payload.input ?? {});
    case "set_live_schedule_block": {
      const id = requireString(competitionId, "Competition id");
      const blockId = requireString(payload.blockId, "Schedule block id");
      await loadCompetitionRecord(supabase, id);
      const { error: clearError } = await supabase
        .from("competition_schedule_blocks")
        .update({ is_active: false })
        .eq("competition_id", id);
      if (clearError) throw new Error(clearError.message);
      const { error: setError } = await supabase
        .from("competition_schedule_blocks")
        .update({ is_active: true })
        .eq("competition_id", id)
        .eq("id", blockId);
      if (setError) throw new Error(setError.message);
      await syncCompetitionRoundRuntimeState(supabase, id);
      return { competitionId: id };
    }
    case "set_status": {
      const id = requireString(competitionId, "Competition id");
      if (!COMPETITION_STATUSES.includes(payload.status as CompetitionStatus)) {
        throw new Error("Invalid competition status.");
      }
      await loadCompetitionRecord(supabase, id);
      const { error } = await supabase.from("competitions").update({ status: payload.status }).eq("id", id);
      if (error) throw new Error(error.message);
      return { competitionId: id };
    }
    case "set_phase": {
      const id = requireString(competitionId, "Competition id");
      if (!COMPETITION_PHASES.includes(payload.nextPhase as CompetitionPhase)) {
        throw new Error("Invalid competition phase.");
      }
      await loadCompetitionRecord(supabase, id);
      const rpcPayload: Record<string, unknown> = {
        p_competition_id: id,
        p_next_phase: payload.nextPhase,
      };
      if (payload.note?.trim()) {
        rpcPayload.p_note = payload.note.trim();
      }
      const { error } = await supabase.rpc("set_competition_phase", rpcPayload);
      if (error) throw new Error(error.message);
      await syncCompetitionRoundRuntimeState(supabase, id);
      return { competitionId: id };
    }
    case "undo": {
      const id = requireString(competitionId, "Competition id");
      await loadCompetitionRecord(supabase, id);
      const { error } = await supabase.rpc("undo_last_competition_operation", { p_competition_id: id });
      if (error) throw new Error(error.message);
      await syncCompetitionRoundRuntimeState(supabase, id);
      return { competitionId: id };
    }
    case "get_undo_availability": {
      const id = requireString(competitionId, "Competition id");
      await loadCompetitionRecord(supabase, id);
      const { data, error } = await supabase
        .from("competition_operations")
        .select("operation_type, expires_at")
        .eq("competition_id", id)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);

      return {
        competitionId: id,
        undoAvailability: data
          ? {
              available: true,
              expires_at: data.expires_at ?? null,
              operation_type: (data.operation_type as "advance" | "reset") ?? null,
            }
          : {
              available: false,
              expires_at: null,
              operation_type: null,
            },
      };
    }
    case "delete": {
      const id = requireString(competitionId, "Competition id");
      await loadCompetitionRecord(supabase, id);
      const { error } = await supabase.from("competitions").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return { competitionId: id, deleted: true };
    }
    case "advance_to_finals": {
      const id = requireString(competitionId, "Competition id");
      await loadCompetitionRecord(supabase, id);
      const { error } = await supabase.rpc("advance_competition_to_finals", { p_competition_id: id });
      if (error) throw new Error(error.message);
      await syncCompetitionRoundRuntimeState(supabase, id);
      return { competitionId: id };
    }
    case "reset": {
      const id = requireString(competitionId, "Competition id");
      await loadCompetitionRecord(supabase, id);
      const { error } = await supabase.rpc("reset_competition", { p_competition_id: id });
      if (error) throw new Error(error.message);
      await syncCompetitionRoundRuntimeState(supabase, id);
      return { competitionId: id };
    }
    case "update_finalist_order": {
      const id = requireString(competitionId, "Competition id");
      if (!Array.isArray(payload.orderedClimberIds)) {
        throw new Error("Finalist order is required.");
      }
      await loadCompetitionRecord(supabase, id);
      const { count, error: countError } = await supabase
        .from("competition_finalists")
        .select("climber_id", { count: "exact", head: true })
        .eq("competition_id", id);
      if (countError) throw new Error(countError.message);
      if (!count) throw new Error("Advance the competition to finals before changing the finals climbing order.");
      for (let index = 0; index < payload.orderedClimberIds.length; index += 1) {
        const climberId = requireString(payload.orderedClimberIds[index], "Climber id");
        const { error } = await supabase
          .from("competition_finalists")
          .update({ climbing_order: index + 1 })
          .eq("competition_id", id)
          .eq("climber_id", climberId);
        if (error) throw new Error(error.message);
      }
      return { competitionId: id };
    }
    case "save_finalist_field": {
      const id = requireString(competitionId, "Competition id");
      const finalists = Array.isArray(payload.orderedFinalists) ? payload.orderedFinalists : [];
      await loadCompetitionRecord(supabase, id);
      const { error: deleteError } = await supabase.from("competition_finalists").delete().eq("competition_id", id);
      if (deleteError) throw new Error(deleteError.message);
      if (finalists.length) {
        const { error: insertError } = await supabase.from("competition_finalists").insert(
          finalists.map((finalist, index) => ({
            competition_id: id,
            climber_id: requireString(finalist.climber_id, "Finalist climber id"),
            name: cleanString(finalist.name),
            category_id: finalist.category_id,
            display_category: finalist.display_category,
            gender_division: finalist.gender_division,
            age_group: finalist.age_group,
            qualifier_rank: finalist.qualifier_rank,
            advanced_with_tie: finalist.advanced_with_tie,
            climbing_order: index + 1,
          }))
        );
        if (insertError) throw new Error(insertError.message);
      }
      return { competitionId: id };
    }
    default:
      throw new Error("Unsupported admin competition action.");
  }
}

export function getAdminCompetitionActionErrorStatus(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("required") || normalized.includes("invalid") || normalized.includes("unsupported")) {
    return 400;
  }
  if (normalized.includes("not found")) {
    return 404;
  }
  if (normalized.includes("locked") || normalized.includes("advance")) {
    return 409;
  }
  return 500;
}
