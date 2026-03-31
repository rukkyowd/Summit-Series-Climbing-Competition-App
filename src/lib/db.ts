import { assertSupabaseConfigured, publicSupabase, supabase } from "./supabase";
import {
  ACTIVE_EVENT_ID,
  DEFAULT_EVENT_CONFIG,
  buildDisplayCategory,
  buildFinalsLeaderboard,
  buildQualifierLeaderboard,
  buildRegistrationChoices,
  canClimberSelfScoreQualifier,
  canRegisterDuringEvent,
  canStaffScoreFinals,
  canStaffScoreQualifier,
  createCategoryKey,
  isFinalsStage,
  isQualifierStage,
  normalizeEventConfig,
  type Climber,
  type ClimberWithAttempts,
  type EventConfig,
  type EventTimeSlot,
  type FinalAttempt,
  type FinalsLeaderboardEntry,
  type FinalistSelection,
  type QualifierAttempt,
  type QualifierLeaderboardEntry,
  type RegistrationChoice,
} from "./scoring";

export interface RegisterClimberInput {
  name: string;
  climberNumber: string;
  province: string;
  categoryId: string;
  timeSlotId: string | null;
}

export interface SaveEventConfigInput extends Omit<EventConfig, "id" | "updated_at"> {}

export interface CompetitionSnapshot {
  event: EventConfig;
  climbers: ClimberWithAttempts[];
  qualifierLeaderboard: QualifierLeaderboardEntry[];
  finalsLeaderboard: FinalsLeaderboardEntry[];
  finalists: FinalistSelection[];
  registrationChoices: RegistrationChoice[];
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

function assertQualifierOpen(event: EventConfig, message: string) {
  if (!isQualifierStage(event)) {
    throw new Error(message);
  }
}

function assertFinalsOpen(event: EventConfig, message: string) {
  if (!isFinalsStage(event)) {
    throw new Error(message);
  }
}

async function fetchEventRow() {
  const { data, error } = await publicSupabase
    .from("active_event_config")
    .select("*")
    .eq("id", ACTIVE_EVENT_ID)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

async function fetchTimeSlots() {
  const { data, error } = await publicSupabase
    .from("event_time_slots")
    .select("*")
    .eq("event_id", ACTIVE_EVENT_ID)
    .order("label", { ascending: true });

  if (error) {
    return [] as EventTimeSlot[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id ?? createId(),
    event_id: ACTIVE_EVENT_ID,
    label: row.label ?? "Open slot",
    phase_type: row.phase_type ?? "custom",
    audience_label: row.audience_label ?? "",
    is_active: row.is_active ?? false,
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    capacity: row.capacity ?? DEFAULT_EVENT_CONFIG.max_climbers,
    eligible_category_ids: arrayifyIds(row.eligible_category_ids),
    created_at: row.created_at,
  }));
}

async function fetchClimberRows() {
  const { data, error } = await publicSupabase
    .from("climbers")
    .select(
      "id, event_id, name, climber_number, province, category_id, gender_division, age_group, display_category, time_slot_id, registered_at"
    )
    .eq("event_id", ACTIVE_EVENT_ID)
    .order("registered_at", { ascending: true });

  if (error) {
    return [] as Climber[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    event_id: ACTIVE_EVENT_ID,
    name: row.name ?? "Unknown climber",
    climber_number: row.climber_number ?? "",
    province: row.province ?? "",
    category_id: createCategoryKey(row.gender_division ?? "Open", row.age_group ?? "Open"),
    gender_division: row.gender_division ?? "Open",
    age_group: row.age_group ?? "Open",
    display_category:
      row.display_category ?? buildDisplayCategory(row.gender_division ?? "Open", row.age_group ?? "Open"),
    time_slot_id: row.time_slot_id ?? null,
    access_token: "",
    access_token_created_at: undefined,
    registered_at: row.registered_at ?? undefined,
  }));
}

async function fetchQualifierAttempts() {
  const { data, error } = await publicSupabase
    .from("qualifier_attempts")
    .select("*")
    .eq("event_id", ACTIVE_EVENT_ID)
    .order("climb_number", { ascending: true });

  if (error) {
    return [] as QualifierAttempt[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    event_id: ACTIVE_EVENT_ID,
    climber_id: row.climber_id,
    climb_number: row.climb_number ?? 1,
    attempt_count: row.attempt_count ?? 0,
    topped: row.topped ?? false,
    entered_by: row.entered_by ?? "climber",
    updated_at: row.updated_at ?? undefined,
  }));
}

async function fetchFinalAttempts() {
  const { data, error } = await publicSupabase
    .from("final_attempts")
    .select("*")
    .eq("event_id", ACTIVE_EVENT_ID)
    .order("climb_number", { ascending: true });

  if (error) {
    return [] as FinalAttempt[];
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    event_id: ACTIVE_EVENT_ID,
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

async function fetchFinalists() {
  const { data, error } = await publicSupabase
    .from("event_finalists")
    .select("*")
    .eq("event_id", ACTIVE_EVENT_ID)
    .order("display_category", { ascending: true })
    .order("qualifier_rank", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return [] as FinalistSelection[];
  }

  return ((data ?? []) as any[]).map((row) => ({
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

function validateSlotForCategory(slot: EventTimeSlot, categoryId: string) {
  return !slot.eligible_category_ids.length || slot.eligible_category_ids.includes(categoryId);
}

function assertRegistrationWindowOpen(event: EventConfig) {
  assertQualifierOpen(event, "Registration is closed because the event has already advanced to finals.");

  if (!canRegisterDuringEvent(event)) {
    throw new Error("Registration is not open during the current schedule block.");
  }
}

function assertStaffQualifierWindowOpen(event: EventConfig) {
  assertQualifierOpen(event, "Qualifier scoring is locked because the event has advanced to finals.");

  if (!canStaffScoreQualifier(event)) {
    throw new Error("Qualifier scoring is not open during the current schedule block.");
  }
}

function assertClimberQualifierWindowOpen(event: EventConfig) {
  assertQualifierOpen(event, "Qualifier scoring is locked because the event has advanced to finals.");

  if (!canClimberSelfScoreQualifier(event)) {
    throw new Error("Private qualifier scoring is only open during the live scramble round.");
  }
}

function assertFinalsWindowOpen(event: EventConfig) {
  assertFinalsOpen(event, "Finals scoring is not available until the event advances to finals.");

  if (!canStaffScoreFinals(event)) {
    throw new Error("Finals scoring is not open during the current schedule block.");
  }
}

export async function getActiveEventConfig() {
  ensureConfigured();

  const [eventRow, timeSlots] = await Promise.all([fetchEventRow(), fetchTimeSlots()]);

  return normalizeEventConfig(eventRow, [], timeSlots);
}

export async function getAllClimbersWithAttempts() {
  ensureConfigured();

  const [climbers, qualifierAttempts, finalAttempts] = await Promise.all([
    fetchClimberRows(),
    fetchQualifierAttempts(),
    fetchFinalAttempts(),
  ]);

  return joinCompetitionData(climbers, qualifierAttempts, finalAttempts);
}

export async function getCompetitionSnapshot(): Promise<CompetitionSnapshot> {
  ensureConfigured();

  const [event, climbers, finalists] = await Promise.all([
    getActiveEventConfig(),
    getAllClimbersWithAttempts(),
    fetchFinalists(),
  ]);
  const qualifierLeaderboard = buildQualifierLeaderboard(climbers, event);
  const finalsLeaderboard = isFinalsStage(event)
    ? buildFinalsLeaderboard(climbers, finalists, event)
    : [];

  return {
    event,
    climbers,
    qualifierLeaderboard,
    finalsLeaderboard,
    finalists,
    registrationChoices: buildRegistrationChoices(
      event,
      climbers.map((climber) => climber)
    ),
  };
}

export async function getClimberById(id: string) {
  ensureConfigured();

  const [event, climbers] = await Promise.all([getActiveEventConfig(), getAllClimbersWithAttempts()]);
  const climber = climbers.find((entry) => entry.id === id) ?? null;

  if (!climber) {
    return null;
  }

  return {
    climber,
    event,
  };
}

export async function getClimberByNumber(climberNumber: string) {
  ensureConfigured();

  const [event, climbers] = await Promise.all([getActiveEventConfig(), getAllClimbersWithAttempts()]);
  const normalized = cleanString(climberNumber).toLowerCase();
  const climber =
    climbers.find((entry) => entry.climber_number.toLowerCase() === normalized) ?? null;

  if (!climber) {
    return null;
  }

  return {
    climber,
    event,
  };
}

export async function getClimberByAccessToken(token: string) {
  ensureConfigured();

  const [event, qualifierAttempts, finalAttempts, climberRow] = await Promise.all([
    getActiveEventConfig(),
    fetchQualifierAttempts(),
    fetchFinalAttempts(),
    publicSupabase
      .from("climbers")
      .select("*")
      .eq("event_id", ACTIVE_EVENT_ID)
      .eq("access_token", cleanString(token))
      .maybeSingle(),
  ]);

  if (climberRow.error || !climberRow.data) {
    return null;
  }

  const climber = joinCompetitionData(
    [
      {
        id: climberRow.data.id,
        event_id: ACTIVE_EVENT_ID,
        name: climberRow.data.name ?? "Unknown climber",
        climber_number: climberRow.data.climber_number ?? "",
        province: climberRow.data.province ?? "",
        category_id: createCategoryKey(
          climberRow.data.gender_division ?? "Open",
          climberRow.data.age_group ?? "Open"
        ),
        gender_division: climberRow.data.gender_division ?? "Open",
        age_group: climberRow.data.age_group ?? "Open",
        display_category:
          climberRow.data.display_category ??
          buildDisplayCategory(climberRow.data.gender_division ?? "Open", climberRow.data.age_group ?? "Open"),
        time_slot_id: climberRow.data.time_slot_id ?? null,
        access_token: climberRow.data.access_token ?? "",
        access_token_created_at: climberRow.data.access_token_created_at ?? undefined,
        registered_at: climberRow.data.registered_at ?? undefined,
      },
    ],
    qualifierAttempts,
    finalAttempts
  )[0];

  return {
    climber,
    event,
  };
}

export async function searchClimbers(query: string) {
  ensureConfigured();

  const climbers = await getAllClimbersWithAttempts();
  const normalized = cleanString(query).toLowerCase();

  if (!normalized) {
    return climbers;
  }

  return climbers.filter((climber) => {
    return (
      climber.name.toLowerCase().includes(normalized) ||
      climber.climber_number.toLowerCase().includes(normalized) ||
      climber.province.toLowerCase().includes(normalized) ||
      climber.display_category.toLowerCase().includes(normalized)
    );
  });
}

export async function saveEventConfig(input: SaveEventConfigInput) {
  ensureConfigured();

  const payload = normalizeEventConfig(
    {
      ...input,
      id: ACTIVE_EVENT_ID,
    },
    input.categories,
    input.time_slots
  );

  const { error: eventError } = await supabase.from("active_event_config").upsert({
    id: ACTIVE_EVENT_ID,
    name: payload.name,
    format: payload.format,
    stage_mode: payload.stage_mode,
    total_climbs: payload.total_climbs,
    max_climbers: payload.max_climbers,
    qualifier_counting_climbs: payload.qualifier_counting_climbs,
    finals_cutoff: payload.finals_cutoff,
    finals_tie_advances: payload.finals_tie_advances,
    qualifier_locked_at: payload.qualifier_locked_at,
    finals_started_at: payload.finals_started_at,
    finals_problem_count: payload.finals_problem_count,
  });

  if (eventError) {
    throw new Error(eventError.message);
  }

  await supabase.from("event_categories").delete().eq("event_id", ACTIVE_EVENT_ID);
  await supabase.from("event_time_slots").delete().eq("event_id", ACTIVE_EVENT_ID);

  if (payload.time_slots.length) {
    const { error } = await supabase.from("event_time_slots").insert(
      payload.time_slots.map((slot) => ({
        id: slot.id || createId(),
        event_id: ACTIVE_EVENT_ID,
        label: cleanString(slot.label),
        phase_type: slot.phase_type,
        audience_label: cleanString(slot.audience_label),
        is_active: slot.is_active,
        start_time: slot.start_time ? cleanString(slot.start_time) : null,
        end_time: slot.end_time ? cleanString(slot.end_time) : null,
        capacity: slot.capacity,
        eligible_category_ids: [],
      }))
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  return getActiveEventConfig();
}

export async function advanceEventToFinals() {
  ensureConfigured();

  const { error } = await supabase.rpc("advance_event_to_finals");
  if (error) {
    throw new Error(error.message);
  }

  return getCompetitionSnapshot();
}

export async function resetActiveEvent() {
  ensureConfigured();

  const { error } = await supabase.rpc("reset_active_event");
  if (error) {
    throw new Error(error.message);
  }

  return getCompetitionSnapshot();
}

export async function registerClimber(input: RegisterClimberInput) {
  ensureConfigured();

  const snapshot = await getCompetitionSnapshot();
  assertRegistrationWindowOpen(snapshot.event);

  const existing = snapshot.climbers.find(
    (climber) => climber.climber_number.toLowerCase() === cleanString(input.climberNumber).toLowerCase()
  );

  if (existing) {
    throw new Error(`Climber number ${input.climberNumber} is already registered.`);
  }

  if (snapshot.climbers.length >= snapshot.event.max_climbers) {
    throw new Error("This event is already at the configured climber capacity.");
  }

  const category = snapshot.event.categories.find((entry) => entry.id === input.categoryId);
  if (!category) {
    throw new Error("Please choose a valid category.");
  }

  let slot: EventTimeSlot | null = null;
  if (input.timeSlotId) {
    slot = snapshot.event.time_slots.find((entry) => entry.id === input.timeSlotId) ?? null;
    if (!slot) {
      throw new Error("Please choose a valid time slot.");
    }

    if (!validateSlotForCategory(slot, category.id)) {
      throw new Error("That time slot is not available for the selected category.");
    }

    const slotCount = snapshot.climbers.filter((climber) => climber.time_slot_id === slot?.id).length;
    if (slotCount >= slot.capacity) {
      throw new Error("That time slot is already full.");
    }
  } else if (snapshot.event.time_slots.length > 0) {
    throw new Error("Please choose a time slot.");
  }

  const payload = {
    event_id: ACTIVE_EVENT_ID,
    name: cleanString(input.name),
    climber_number: cleanString(input.climberNumber),
    province: cleanString(input.province),
    category_id: null,
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

  return data as Climber;
}

export async function updateQualifierAttemptByStaff(
  climberId: string,
  climbNumber: number,
  attemptCount: number,
  topped: boolean
) {
  ensureConfigured();

  const event = await getActiveEventConfig();
  assertStaffQualifierWindowOpen(event);

  const { data, error } = await supabase
    .from("qualifier_attempts")
    .upsert(
      {
        event_id: ACTIVE_EVENT_ID,
        climber_id: climberId,
        climb_number: climbNumber,
        attempt_count: attemptCount,
        topped,
        entered_by: "staff",
      },
      {
        onConflict: "climber_id,climb_number",
      }
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
  climbNumber: number,
  attemptCount: number,
  topped: boolean
) {
  ensureConfigured();

  const event = await getActiveEventConfig();
  assertClimberQualifierWindowOpen(event);

  const { data, error } = await publicSupabase.rpc("submit_qualifier_attempt", {
    p_access_token: cleanString(accessToken),
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
        event_id: ACTIVE_EVENT_ID,
        climber_id: climberLookup.climber.id,
        climb_number: climbNumber,
        attempt_count: attemptCount,
        topped,
        entered_by: "climber",
      },
      {
        onConflict: "climber_id,climb_number",
      }
    )
    .select("*")
    .single();

  if (fallbackError) {
    throw new Error(error.message || fallbackError.message);
  }

  return fallbackData as QualifierAttempt;
}

export async function updateFinalAttempt(
  climberId: string,
  climbNumber: number,
  top: boolean,
  zone: boolean,
  attemptsToTop: number | null,
  attemptsToZone: number | null
) {
  ensureConfigured();

  const snapshot = await getCompetitionSnapshot();
  assertFinalsWindowOpen(snapshot.event);

  if (!snapshot.finalists.some((entry) => entry.climber_id === climberId)) {
    throw new Error("Only finalists can receive finals scores.");
  }

  const { data, error } = await supabase
    .from("final_attempts")
    .upsert(
      {
        event_id: ACTIVE_EVENT_ID,
        climber_id: climberId,
        climb_number: climbNumber,
        top,
        zone,
        attempts_to_top: top ? attemptsToTop : null,
        attempts_to_zone: zone ? attemptsToZone : null,
        entered_by: "staff",
      },
      {
        onConflict: "climber_id,climb_number",
      }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as FinalAttempt;
}

export async function deleteClimber(climberId: string) {
  ensureConfigured();

  const { error } = await supabase.from("climbers").delete().eq("id", climberId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteAllClimbers() {
  ensureConfigured();

  const { error } = await supabase.from("climbers").delete().eq("event_id", ACTIVE_EVENT_ID);
  if (error) {
    throw new Error(error.message);
  }
}
