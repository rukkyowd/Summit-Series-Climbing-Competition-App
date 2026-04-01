import { assertSupabaseConfigured, publicSupabase, supabase } from "./supabase";
import {
  DEFAULT_COMPETITION,
  buildCompetitionPath,
  buildDisplayCategory,
  buildFinalsLeaderboard,
  buildRegistrationChoices,
  buildQualifierLeaderboard,
  canClimberSelfScoreQualifier,
  canRegisterDuringCompetition,
  canStaffScoreFinals,
  canStaffScoreQualifier,
  createCategoryKey,
  createCompetitionId,
  getActiveScheduleBlock,
  getDefaultCompetitionCategories,
  isCompetitionLiveNow,
  isFinalsStage,
  isQualifierStage,
  normalizeCompetition,
  slugifyCompetitionName,
  type Climber,
  type ClimberWithAttempts,
  type Competition,
  type CompetitionCategory,
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
  location_name?: string;
  start_date?: string | null;
  end_date?: string | null;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
  description?: string;
  hero_image_url?: string;
  discipline_label?: string;
}

export interface RegisterClimberInput {
  competitionId: string;
  name: string;
  climberNumber: string;
  province: string;
  categoryId: string;
  timeSlotId: string | null;
}

export interface SaveCompetitionConfigInput extends Omit<Competition, "categories" | "schedule_blocks"> {
  schedule_blocks: CompetitionScheduleBlock[];
}

export interface CompetitionSnapshot {
  competition: Competition;
  climbers: ClimberWithAttempts[];
  qualifierLeaderboard: QualifierLeaderboardEntry[];
  finalsLeaderboard: FinalsLeaderboardEntry[];
  finalists: FinalistSelection[];
  registrationChoices: RegistrationChoice[];
}

export interface CompetitionSummary {
  competition: Competition;
  climber_count: number;
  finalist_count: number;
  active_schedule_block: CompetitionScheduleBlock | null;
  registration_open: boolean;
  live_now: boolean;
}

function ensureConfigured() {
  assertSupabaseConfigured();
}

function cleanString(value: string) {
  return value.trim();
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
    throw new Error("Registration is not open during the current schedule block.");
  }
}

function assertStaffQualifierWindowOpen(competition: Competition) {
  assertQualifierOpen(competition, "Qualifier scoring is locked because this competition has advanced to finals.");

  if (!canStaffScoreQualifier(competition)) {
    throw new Error("Qualifier scoring is not open during the current schedule block.");
  }
}

function assertClimberQualifierWindowOpen(competition: Competition) {
  assertQualifierOpen(competition, "Qualifier scoring is locked because this competition has advanced to finals.");

  if (!canClimberSelfScoreQualifier(competition)) {
    throw new Error("Private qualifier scoring is only open during the live scramble round.");
  }
}

function assertFinalsWindowOpen(competition: Competition) {
  assertFinalsOpen(competition, "Finals scoring is not available until this competition advances to finals.");

  if (!canStaffScoreFinals(competition)) {
    throw new Error("Finals scoring is not open during the current schedule block.");
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

function hydrateCompetitions(rows: any[], categories: CompetitionCategory[], scheduleBlocks: CompetitionScheduleBlock[]) {
  return rows.map((row) => {
    const competitionId = row.id;
    return normalizeCompetition(
      row,
      categories.filter((category) => category.competition_id === competitionId),
      scheduleBlocks.filter((block) => block.competition_id === competitionId)
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
    topped: row.topped ?? false,
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
    created_at: row.created_at ?? undefined,
  }));
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

export async function listCompetitions(includeArchived = false) {
  ensureConfigured();

  const rows = await fetchCompetitionRows(includeArchived);
  const competitionIds = rows.map((row) => row.id as string);
  const [categories, scheduleBlocks] = await Promise.all([
    fetchCompetitionCategories(competitionIds),
    fetchCompetitionScheduleBlocks(competitionIds),
  ]);

  return hydrateCompetitions(rows, categories, scheduleBlocks);
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

  const [categories, scheduleBlocks] = await Promise.all([
    fetchCompetitionCategories([row.id]),
    fetchCompetitionScheduleBlocks([row.id]),
  ]);

  return hydrateCompetitions([row], categories, scheduleBlocks)[0] ?? null;
}

export async function getCompetitionById(id: string) {
  ensureConfigured();

  const row = await fetchCompetitionRowById(id);
  if (!row) {
    return null;
  }

  const [categories, scheduleBlocks] = await Promise.all([
    fetchCompetitionCategories([row.id]),
    fetchCompetitionScheduleBlocks([row.id]),
  ]);

  return hydrateCompetitions([row], categories, scheduleBlocks)[0] ?? null;
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

  const [climbers, qualifierAttempts, finalAttempts, finalists] = await Promise.all([
    fetchClimberRows([competition.id]),
    fetchQualifierAttempts([competition.id]),
    fetchFinalAttempts([competition.id]),
    fetchFinalists([competition.id]),
  ]);

  const joined = joinCompetitionData(climbers, qualifierAttempts, finalAttempts);
  const qualifierLeaderboard = buildQualifierLeaderboard(joined, competition);
  const competitionFinalists = finalists
    .filter((entry) => entry.competition_id === competition.id)
    .map(({ competition_id, ...entry }) => entry);
  const finalsLeaderboard = isFinalsStage(competition)
    ? buildFinalsLeaderboard(joined, competitionFinalists, competition)
    : [];

  return {
    competition,
    climbers: joined,
    qualifierLeaderboard,
    finalsLeaderboard,
    finalists: competitionFinalists,
    registrationChoices: buildRegistrationChoices(competition, joined.map((climber) => climber)),
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
    discipline_label: input.discipline_label ?? "Boulder",
    location_name: input.location_name ?? "",
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    registration_opens_at: input.registration_opens_at ?? null,
    registration_closes_at: input.registration_closes_at ?? null,
    description: input.description ?? "",
    hero_image_url: input.hero_image_url ?? "",
    status: "active",
    stage_mode: "qualifier",
  });

  const { error } = await supabase.from("competitions").insert({
    id: competition.id,
    slug: competition.slug,
    name: competition.name,
    status: competition.status,
    format: competition.format,
    discipline_label: competition.discipline_label,
    stage_mode: competition.stage_mode,
    location_name: competition.location_name,
    start_date: competition.start_date,
    end_date: competition.end_date,
    registration_opens_at: competition.registration_opens_at,
    registration_closes_at: competition.registration_closes_at,
    description: competition.description,
    hero_image_url: competition.hero_image_url,
    total_climbs: competition.total_climbs,
    max_climbers: competition.max_climbers,
    qualifier_counting_climbs: competition.qualifier_counting_climbs,
    finals_cutoff: competition.finals_cutoff,
    finals_tie_advances: competition.finals_tie_advances,
    finals_eligible_age_groups: competition.finals_eligible_age_groups,
    qualifier_locked_at: null,
    finals_started_at: null,
    finals_problem_count: competition.finals_problem_count,
  });

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

  return competition;
}

export async function saveCompetitionConfig(competitionId: string, input: SaveCompetitionConfigInput) {
  ensureConfigured();

  const payload = normalizeCompetition(
    {
      ...input,
      id: competitionId,
      slug: input.slug,
    },
    getDefaultCompetitionCategories(competitionId),
    input.schedule_blocks
  );

  const { error } = await supabase.from("competitions").upsert({
    id: payload.id,
    slug: payload.slug,
    name: payload.name,
    status: payload.status,
    format: payload.format,
    discipline_label: payload.discipline_label,
    stage_mode: payload.stage_mode,
    location_name: payload.location_name,
    start_date: payload.start_date,
    end_date: payload.end_date,
    registration_opens_at: payload.registration_opens_at,
    registration_closes_at: payload.registration_closes_at,
    description: payload.description,
    hero_image_url: payload.hero_image_url,
    total_climbs: payload.total_climbs,
    max_climbers: payload.max_climbers,
    qualifier_counting_climbs: payload.qualifier_counting_climbs,
    finals_cutoff: payload.finals_cutoff,
    finals_tie_advances: payload.finals_tie_advances,
    finals_eligible_age_groups: payload.finals_eligible_age_groups,
    qualifier_locked_at: payload.qualifier_locked_at,
    finals_started_at: payload.finals_started_at,
    finals_problem_count: payload.finals_problem_count,
  });

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
      }))
    );

    if (scheduleError) {
      throw new Error(scheduleError.message);
    }
  }

  return getCompetitionById(competitionId);
}

export async function setCompetitionStatus(competitionId: string, status: CompetitionStatus) {
  ensureConfigured();

  const { error } = await supabase.from("competitions").update({ status }).eq("id", competitionId);
  if (error) {
    throw new Error(error.message);
  }
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
    path: `${buildCompetitionPath(snapshot.competition.slug, "scorecard")}?token=${climber.access_token}`,
  };
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
    throw new Error(`Climber number ${input.climberNumber} is already registered.`);
  }

  if (snapshot.climbers.length >= snapshot.competition.max_climbers) {
    throw new Error("This competition is already at the configured climber capacity.");
  }

  const category = snapshot.competition.categories.find((entry) => entry.id === input.categoryId);
  if (!category) {
    throw new Error("Please choose a valid category.");
  }

  let slot: CompetitionScheduleBlock | null = null;
  if (input.timeSlotId) {
    slot = snapshot.competition.schedule_blocks.find((entry) => entry.id === input.timeSlotId) ?? null;
    if (!slot) {
      throw new Error("Please choose a valid schedule block.");
    }

    if (!validateSlotForCategory(slot, category.id)) {
      throw new Error("That schedule block is not available for the selected category.");
    }

    const slotCount = snapshot.climbers.filter((climber) => climber.time_slot_id === slot?.id).length;
    if (slotCount >= slot.capacity) {
      throw new Error("That schedule block is already full.");
    }
  } else if (snapshot.competition.schedule_blocks.filter((block) => block.capacity > 0).length > 0) {
    throw new Error("Please choose a schedule block.");
  }

  const payload = {
    competition_id: snapshot.competition.id,
    name: cleanString(input.name),
    climber_number: cleanString(input.climberNumber),
    province: cleanString(input.province),
    category_id: category.id,
    gender_division: cleanString(category.gender_division),
    age_group: cleanString(category.age_group),
    display_category: category.display_name,
    time_slot_id: slot?.id ?? null,
    access_token: createAccessToken(),
  };

  const { data, error } = await supabase.from("climbers").insert(payload).select("*").single();
  if (error) {
    throw new Error(error.message);
  }

  return {
    ...(data as Climber),
    competition_slug: snapshot.competition.slug,
    scorecard_path: `${buildCompetitionPath(snapshot.competition.slug, "scorecard")}?token=${data.access_token}`,
  };
}

export async function updateQualifierAttemptByStaff(
  competitionId: string,
  climberId: string,
  climbNumber: number,
  attemptCount: number,
  topped: boolean
) {
  ensureConfigured();

  const competition = await getCompetitionById(competitionId);
  if (!competition) {
    throw new Error("Competition not found.");
  }
  assertStaffQualifierWindowOpen(competition);

  const { data, error } = await supabase
    .from("qualifier_attempts")
    .upsert(
      {
        competition_id: competitionId,
        climber_id: climberId,
        climb_number: climbNumber,
        attempt_count: attemptCount,
        topped,
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

  const climberLookup = await getClimberByAccessToken(accessToken);
  if (!climberLookup?.climber) {
    throw new Error("Private qualifier link not recognized.");
  }

  const { data: fallbackData, error: fallbackError } = await publicSupabase
    .from("qualifier_attempts")
    .upsert(
      {
        competition_id: competitionId,
        climber_id: climberLookup.climber.id,
        climb_number: climbNumber,
        attempt_count: attemptCount,
        topped,
        entered_by: "climber",
      },
      { onConflict: "climber_id,climb_number" }
    )
    .select("*")
    .single();

  if (fallbackError) {
    throw new Error(error.message || fallbackError.message);
  }

  return fallbackData as QualifierAttempt;
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
        top,
        zone,
        attempts_to_top: top ? attemptsToTop : null,
        attempts_to_zone: zone ? attemptsToZone : null,
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
