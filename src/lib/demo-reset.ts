import { buildDisplayCategory, createCategoryKey } from "./scoring";
import { getCompetitionPreset } from "./competition-presets";
import { buildDemoStoryMetadataForClimbers } from "./demo-story-target";
import { DEMO_COMPETITION_NAME, DEMO_COMPETITION_SLUG } from "./demo";
import { createServiceRoleSupabaseClient } from "./server-supabase";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_LOCATION = "North Summit Climbing";
const DEMO_ACTIVE_BLOCK_LABEL = "Youth B qualifier wave";
const YOUTH_CHAMPIONSHIP_PRESET = getCompetitionPreset("youth_championship_finals");
const OPTIONAL_COMPETITION_LINK_COLUMNS = [
  "official_event_url",
  "official_registration_url",
  "official_schedule_url",
] as const;

type DemoCategorySeed = {
  ageGroup: string;
  division: string;
  climbers: Array<{
    name: string;
    number: string;
    province: string;
    scoredBoulders: number;
    seededAttempts?: Array<{
      climbNumber: number;
      attemptCount: number;
      zone: boolean;
      topped: boolean;
      attemptsToTop: number | null;
      attemptsToZone: number | null;
    }>;
  }>;
};

type DemoScheduleBlockRow = {
  id: string;
  competition_id: string;
  round_id: string | null;
  sort_order: number;
  label: string;
  phase_type: string;
  audience_label: string;
  is_active: boolean;
  start_time: string;
  end_time: string;
  capacity: number;
  eligible_category_ids: string[];
};

type DemoClimberRow = {
  id: string;
  competition_id: string;
  name: string;
  climber_number: string;
  province: string;
  category_id: string;
  gender_division: string;
  age_group: string;
  display_category: string;
  time_slot_id: string | null;
  access_token: string;
};

const OPTIONAL_QUEUE_COLUMNS = [
  "climber_name",
  "climber_number",
  "display_category",
  "province",
  "time_slot_id",
] as const;

const DEMO_PROVINCES = ["NS", "NB", "PE", "NL", "QC", "ON"] as const;

function createYouthSeed(ageGroup: string, division: string, startNumber: number, names: string[]): DemoCategorySeed {
  return {
    ageGroup,
    division,
    climbers: names.map((name, index) => ({
      name,
      number: String(startNumber + index),
      province: DEMO_PROVINCES[index % DEMO_PROVINCES.length],
      scoredBoulders: Math.max(1, 4 - Math.floor(index / 2)),
    })),
  };
}

const DEMO_CATEGORY_SEEDS: DemoCategorySeed[] = [
  createYouthSeed("Youth D", "Men", 501, [
    "Eli March",
    "Kai Bernard",
    "Theo Watts",
    "Owen Murphy",
    "Felix Young",
    "Remy Scott",
  ]),
  createYouthSeed("Youth D", "Women", 551, [
    "Ruby Walsh",
    "Iris Martin",
    "Ella Ross",
    "Nora Bell",
    "Ava Doyle",
    "Mila Green",
  ]),
  createYouthSeed("Youth C", "Men", 401, [
    "Sam Turner",
    "Leo Fraser",
    "Hugo King",
    "Finn Adams",
    "Caleb White",
    "Jude Mercer",
  ]),
  createYouthSeed("Youth C", "Women", 451, [
    "Zoe Gagnon",
    "Sofia Brooks",
    "Maya Foster",
    "Chloe Reid",
    "Emma Cote",
    "Sadie Bell",
  ]),
  createYouthSeed("Youth B", "Men", 102, [
    "Noah Patel",
    "Milo Fraser",
    "Maya Chen",
    "Declan White",
    "Lucas Martin",
    "Isaac Green",
    "Owen Murphy",
    "Theo Young",
  ]),
  createYouthSeed("Youth B", "Women", 151, [
    "Avery Chen",
    "Sofia Turner",
    "Emma Brooks",
    "Chloe Adams",
    "Nora Walsh",
    "Camille Bouchard",
    "Ruby King",
    "Mia Ross",
  ]),
  createYouthSeed("Youth A", "Men", 201, [
    "Julian Mercer",
    "Caleb King",
    "Ethan Ross",
    "Ari Singh",
    "Miles Grant",
    "Rowan Doyle",
  ]),
  createYouthSeed("Youth A", "Women", 251, [
    "Maya Foster",
    "Zoe Gagnon",
    "Sadie Bell",
    "Ivy Clarke",
    "Leah Adams",
    "June White",
  ]),
  createYouthSeed("Junior", "Men", 301, [
    "Declan White",
    "Isaac Green",
    "Theo Young",
    "Noel Brooks",
    "Alex Turner",
    "Jonah Kim",
  ]),
  createYouthSeed("Junior", "Women", 351, [
    "Camille Bouchard",
    "Nora Walsh",
    "Avery Chen",
    "Grace Martin",
    "Elise Roy",
    "Hannah Patel",
  ]),
];

function createId() {
  return crypto.randomUUID();
}

function createAccessToken(seed: string) {
  return `demo-${seed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function minutesToLabel(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = ((hours + 11) % 12) + 1;
  return `${twelveHour}:${minutes.toString().padStart(2, "0")} ${suffix}`;
}

function buildAttemptTemplate(seedIndex: number, climbNumber: number) {
  const variant = (seedIndex + climbNumber) % 5;

  switch (variant) {
    case 0:
      return { attempt_count: 1, zone: true, topped: true, attempts_to_top: 1, attempts_to_zone: 1 };
    case 1:
      return { attempt_count: 2, zone: true, topped: true, attempts_to_top: 2, attempts_to_zone: 2 };
    case 2:
      return { attempt_count: 2, zone: true, topped: false, attempts_to_top: null, attempts_to_zone: 2 };
    case 3:
      return { attempt_count: 3, zone: true, topped: false, attempts_to_top: null, attempts_to_zone: 3 };
    default:
      return { attempt_count: 4, zone: false, topped: false, attempts_to_top: null, attempts_to_zone: null };
  }
}

async function requireNoSupabaseError<T extends { error: { message: string } | null }>(result: T, fallback: string) {
  if (result.error) {
    throw new Error(result.error.message || fallback);
  }
}

function stripOptionalCompetitionLinkColumns<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload };
  OPTIONAL_COMPETITION_LINK_COLUMNS.forEach((column) => {
    delete next[column];
  });
  return next;
}

function isMissingCompetitionLinkColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return OPTIONAL_COMPETITION_LINK_COLUMNS.some((column) => message.includes(column));
}

function stripOptionalQueueColumns<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload };
  OPTIONAL_QUEUE_COLUMNS.forEach((column) => {
    delete next[column];
  });
  return next;
}

function isMissingQueueColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return OPTIONAL_QUEUE_COLUMNS.some((column) => message.includes(column));
}

export async function resetDemoCompetition() {
  const supabase = createServiceRoleSupabaseClient();
  const now = new Date();
  const startDate = formatDate(now);
  const registrationOpensAt = new Date(now.getTime() - 14 * DAY_MS).toISOString();
  const registrationClosesAt = new Date(now.getTime() + DAY_MS).toISOString();
  const competitionId = createId();
  const qualifierRoundId = createId();
  const finalsRoundId = createId();

  const existingDemoRows = await supabase
    .from("competitions")
    .select("id, is_demo, slug")
    .eq("slug", DEMO_COMPETITION_SLUG);
  await requireNoSupabaseError(existingDemoRows, "Unable to load the existing demo competition.");

  const existingRows = existingDemoRows.data ?? [];
  const nonDemoConflict = existingRows.find((row) => row.slug === DEMO_COMPETITION_SLUG && row.is_demo !== true);
  if (nonDemoConflict) {
    throw new Error("A real competition already uses the canonical demo slug. Refusing to overwrite it.");
  }

  const existingDemoIds = existingRows.filter((row) => row.is_demo === true).map((row) => row.id as string);
  if (existingDemoIds.length) {
    const deleteResult = await supabase.from("competitions").delete().in("id", existingDemoIds);
    await requireNoSupabaseError(deleteResult, "Unable to clear the existing demo competition.");
  }

  const initialDemoMetadata = {
    scenario_version: "demo-story-v1",
    preset_id: YOUTH_CHAMPIONSHIP_PRESET.id,
    preset_name: YOUTH_CHAMPIONSHIP_PRESET.name,
    story_step: "event_created",
    finals_ineligible_age_groups: ["Youth D", "Youth C"],
  };

  const competitionPayload = {
    id: competitionId,
    slug: DEMO_COMPETITION_SLUG,
    name: DEMO_COMPETITION_NAME,
    is_demo: true,
    status: "active",
    format: YOUTH_CHAMPIONSHIP_PRESET.format,
    current_phase: "qualifier_open",
    discipline_label: "Boulder",
    stage_mode: "qualifier",
    location_name: DEMO_LOCATION,
    start_date: startDate,
    end_date: startDate,
    registration_opens_at: registrationOpensAt,
    registration_closes_at: registrationClosesAt,
    description:
      "Run a complete youth championship story: create the event, correct a key judge score, advance finalists, and view public results.",
    hero_image_url: "",
    official_event_url: "",
    official_registration_url: "",
    official_schedule_url: "",
    total_climbs: YOUTH_CHAMPIONSHIP_PRESET.qualifierProblemCount,
    max_climbers: DEMO_CATEGORY_SEEDS.reduce((total, entry) => total + entry.climbers.length, 0),
    qualifier_counting_climbs: YOUTH_CHAMPIONSHIP_PRESET.countingClimbs,
    has_finals: YOUTH_CHAMPIONSHIP_PRESET.finalsEnabled,
    finals_cutoff: YOUTH_CHAMPIONSHIP_PRESET.finalsCutoff,
    finals_tie_advances: YOUTH_CHAMPIONSHIP_PRESET.tiesAdvanceDefault,
    qualifier_eligible_age_groups: YOUTH_CHAMPIONSHIP_PRESET.defaultCategories,
    finals_eligible_age_groups: YOUTH_CHAMPIONSHIP_PRESET.finalsEligibleCategories,
    qualifier_locked_at: null,
    finals_started_at: null,
    finals_problem_count: YOUTH_CHAMPIONSHIP_PRESET.finalsProblemCount,
    demo_metadata: initialDemoMetadata,
  };
  let competitionInsert = await supabase.from("competitions").insert(competitionPayload);
  if (competitionInsert.error && isMissingCompetitionLinkColumnError(competitionInsert.error)) {
    competitionInsert = await supabase.from("competitions").insert(stripOptionalCompetitionLinkColumns(competitionPayload));
  }
  await requireNoSupabaseError(competitionInsert, "Unable to create the demo competition.");

  const categories = DEMO_CATEGORY_SEEDS.map((entry, index) => ({
    id: createCategoryKey(entry.division, entry.ageGroup),
    competition_id: competitionId,
    gender_division: entry.division,
    age_group: entry.ageGroup,
    display_name: buildDisplayCategory(entry.division, entry.ageGroup),
    sort_order: index,
  }));
  const categoryInsert = await supabase.from("competition_categories").insert(categories);
  await requireNoSupabaseError(categoryInsert, "Unable to create demo categories.");

  const rounds = [
    {
      id: qualifierRoundId,
      competition_id: competitionId,
      round_number: 1,
      sort_order: 1,
      name: "Qualifier",
      round_type: "qualifier",
      format: "five_on_five_off",
      status: "active",
      runtime_phase: "qualifier_open",
      is_enabled: true,
      is_active: true,
      activated_at: now.toISOString(),
      problem_count: YOUTH_CHAMPIONSHIP_PRESET.qualifierProblemCount,
      counting_climbs: YOUTH_CHAMPIONSHIP_PRESET.countingClimbs,
      finals_cutoff: YOUTH_CHAMPIONSHIP_PRESET.finalsCutoff,
      eligible_category_ids: categories.map((entry) => entry.id),
      advancement_source_round_id: null,
      advancement_cutoff: null,
      scoring_bucket: "qualifier",
      scoring_config: { demo: true, mode: "judge" },
      started_at: now.toISOString(),
      closed_at: null,
    },
    {
      id: finalsRoundId,
      competition_id: competitionId,
      round_number: 2,
      sort_order: 2,
      name: "Finals",
      round_type: "finals",
      format: "ifsc_finals_format",
      status: "pending",
      runtime_phase: "finals_open",
      is_enabled: true,
      is_active: false,
      activated_at: null,
      problem_count: YOUTH_CHAMPIONSHIP_PRESET.finalsProblemCount,
      counting_climbs: null,
      finals_cutoff: YOUTH_CHAMPIONSHIP_PRESET.finalsCutoff,
      eligible_category_ids: categories
        .filter((entry) => YOUTH_CHAMPIONSHIP_PRESET.finalsEligibleCategories.includes(entry.age_group))
        .map((entry) => entry.id),
      advancement_source_round_id: qualifierRoundId,
      advancement_cutoff: YOUTH_CHAMPIONSHIP_PRESET.finalsCutoff,
      scoring_bucket: "finals",
      scoring_config: { demo: true },
      started_at: null,
      closed_at: null,
    },
  ];
  const roundInsert = await supabase.from("competition_rounds").insert(rounds);
  await requireNoSupabaseError(roundInsert, "Unable to create demo rounds.");

  const allCategoryIds = categories.map((category) => category.id);
  const finalsCategoryIds = categories
    .filter((category) => YOUTH_CHAMPIONSHIP_PRESET.finalsEligibleCategories.includes(category.age_group))
    .map((category) => category.id);
  const categoryIdsForAgeGroups = (ageGroups: string[]) =>
    categories.filter((category) => ageGroups.includes(category.age_group)).map((category) => category.id);
  const qualifierWaves = [
    {
      label: "Youth D / Youth C qualifier wave",
      audience: "Youth D / Youth C",
      ageGroups: ["Youth D", "Youth C"],
      start: "9:00 AM",
      end: "10:30 AM",
    },
    {
      label: "Youth B qualifier wave",
      audience: "Youth B",
      ageGroups: ["Youth B"],
      start: "10:45 AM",
      end: "12:15 PM",
    },
    {
      label: "Youth A / Junior qualifier wave",
      audience: "Youth A / Junior",
      ageGroups: ["Youth A", "Junior"],
      start: "12:30 PM",
      end: "2:00 PM",
    },
  ];

  const scheduleBlocks: DemoScheduleBlockRow[] = [
    {
      id: createId(),
      competition_id: competitionId,
      round_id: null,
      sort_order: 0,
      label: "Check-in",
      phase_type: "check_in",
      audience_label: "All athletes",
      is_active: false,
      start_time: "7:30 AM",
      end_time: "8:15 AM",
      capacity: 80,
      eligible_category_ids: allCategoryIds,
    },
    {
      id: createId(),
      competition_id: competitionId,
      round_id: null,
      sort_order: 1,
      label: "Judges briefing",
      phase_type: "technical_meeting",
      audience_label: "Judges and volunteers",
      is_active: false,
      start_time: "8:15 AM",
      end_time: "8:30 AM",
      capacity: 30,
      eligible_category_ids: allCategoryIds,
    },
    {
      id: createId(),
      competition_id: competitionId,
      round_id: null,
      sort_order: 2,
      label: "Technical meeting",
      phase_type: "technical_meeting",
      audience_label: "Athletes and coaches",
      is_active: false,
      start_time: "8:35 AM",
      end_time: "8:50 AM",
      capacity: 80,
      eligible_category_ids: allCategoryIds,
    },
    ...qualifierWaves.map((wave, index) => ({
      id: createId(),
      competition_id: competitionId,
      round_id: qualifierRoundId,
      sort_order: index + 3,
      label: wave.label,
      phase_type: "qualifier_round",
      audience_label: wave.audience,
      is_active: index === 1,
      start_time: wave.start,
      end_time: wave.end,
      capacity: 24,
      eligible_category_ids: categoryIdsForAgeGroups(wave.ageGroups),
    })),
    {
      id: createId(),
      competition_id: competitionId,
      round_id: null,
      sort_order: 6,
      label: "Results review",
      phase_type: "results",
      audience_label: "Organizers and coaches",
      is_active: false,
      start_time: "2:10 PM",
      end_time: "2:30 PM",
      capacity: 30,
      eligible_category_ids: allCategoryIds,
    },
    {
      id: createId(),
      competition_id: competitionId,
      round_id: finalsRoundId,
      sort_order: 7,
      label: "Isolation opens",
      phase_type: "isolation",
      audience_label: "Youth B / Youth A / Junior finalists",
      is_active: false,
      start_time: "2:30 PM",
      end_time: "3:00 PM",
      capacity: 36,
      eligible_category_ids: finalsCategoryIds,
    },
    {
      id: createId(),
      competition_id: competitionId,
      round_id: finalsRoundId,
      sort_order: 8,
      label: "Observation",
      phase_type: "observation",
      audience_label: "Top 6 per category",
      is_active: false,
      start_time: "3:05 PM",
      end_time: "3:15 PM",
      capacity: 36,
      eligible_category_ids: finalsCategoryIds,
    },
    {
      id: createId(),
      competition_id: competitionId,
      round_id: finalsRoundId,
      sort_order: 9,
      label: "Finals",
      phase_type: "finals_round",
      audience_label: "Top 6 per category",
      is_active: false,
      start_time: "3:20 PM",
      end_time: "4:45 PM",
      capacity: 36,
      eligible_category_ids: finalsCategoryIds,
    },
    {
      id: createId(),
      competition_id: competitionId,
      round_id: null,
      sort_order: 10,
      label: "Awards",
      phase_type: "results",
      audience_label: "All athletes and spectators",
      is_active: false,
      start_time: "5:00 PM",
      end_time: "5:30 PM",
      capacity: 120,
      eligible_category_ids: allCategoryIds,
    },
  ];
  const scheduleInsert = await supabase.from("competition_schedule_blocks").insert(scheduleBlocks);
  await requireNoSupabaseError(scheduleInsert, "Unable to create the demo schedule.");

  const qualifierBlocksByCategoryId = new Map(
    scheduleBlocks
      .filter((entry) => entry.phase_type === "qualifier_round")
      .map((entry) => [entry.eligible_category_ids?.[0] as string, entry.id as string])
  );

  const climbers: DemoClimberRow[] = DEMO_CATEGORY_SEEDS.flatMap((entry) => {
    const categoryId = createCategoryKey(entry.division, entry.ageGroup);
    const displayCategory = buildDisplayCategory(entry.division, entry.ageGroup);
    return entry.climbers.map((climber) => ({
      id: createId(),
      competition_id: competitionId,
      name: climber.name,
      climber_number: climber.number,
      province: climber.province,
      category_id: categoryId,
      gender_division: entry.division,
      age_group: entry.ageGroup,
      display_category: displayCategory,
      time_slot_id: qualifierBlocksByCategoryId.get(categoryId) ?? null,
      access_token: createAccessToken(`${entry.ageGroup}-${climber.number}`),
    }));
  });
  const climberInsert = await supabase.from("climbers").insert(climbers);
  await requireNoSupabaseError(climberInsert, "Unable to create demo climbers.");

  const attempts = DEMO_CATEGORY_SEEDS.flatMap((entry) => {
    const categoryClimbers = climbers.filter((climber) => climber.age_group === entry.ageGroup);
    return entry.climbers.flatMap((seededClimber, climberIndex) => {
      const climber = categoryClimbers.find((entryClimber) => entryClimber.climber_number === seededClimber.number);
      if (!climber || seededClimber.scoredBoulders <= 0) {
        return [];
      }

      if (seededClimber.seededAttempts?.length) {
        return seededClimber.seededAttempts.map((attempt) => ({
          id: createId(),
          competition_id: competitionId,
          round_id: qualifierRoundId,
          climber_id: climber.id,
          climb_number: attempt.climbNumber,
          entered_by: "staff",
          attempt_count: attempt.attemptCount,
          zone: attempt.zone,
          topped: attempt.topped,
          attempts_to_top: attempt.attemptsToTop,
          attempts_to_zone: attempt.attemptsToZone,
        }));
      }

      return Array.from({ length: Math.min(seededClimber.scoredBoulders, YOUTH_CHAMPIONSHIP_PRESET.qualifierProblemCount) }, (_, attemptIndex) => {
        const climbNumber = attemptIndex + 1;
        const template = buildAttemptTemplate(climberIndex, climbNumber);
        return {
          id: createId(),
          competition_id: competitionId,
          round_id: qualifierRoundId,
          climber_id: climber.id,
          climb_number: climbNumber,
          entered_by: "staff",
          ...template,
        };
      });
    });
  });
  if (attempts.length) {
    const attemptInsert = await supabase.from("qualifier_attempts").insert(attempts);
    await requireNoSupabaseError(attemptInsert, "Unable to create demo qualifier attempts.");

    const qualifierEventInsert = await supabase.from("qualifier_score_events").insert(
      attempts.map((attempt, index) => ({
        id: createId(),
        competition_id: attempt.competition_id,
        round_id: attempt.round_id,
        climber_id: attempt.climber_id,
        climb_number: attempt.climb_number,
        attempt_count: attempt.attempt_count,
        zone: attempt.zone,
        topped: attempt.topped,
        attempts_to_top: attempt.attempts_to_top,
        attempts_to_zone: attempt.attempts_to_zone,
        entered_by: attempt.entered_by,
        judge_device_id: "demo-seed",
        judge_session_id: "seeded-demo",
        scored_at: new Date(now.getTime() - (attempts.length - index) * 60_000).toISOString(),
        received_at: new Date(now.getTime() - (attempts.length - index) * 60_000).toISOString(),
        client_event_id: `demo-seed-${attempt.id}`,
        replayed_from_offline: false,
        conflict_flag: false,
        conflict_reason: null,
        supersedes_event_id: null,
      }))
    );
    await requireNoSupabaseError(qualifierEventInsert, "Unable to create demo qualifier score events.");
  }

  const dramaTrio = climbers
    .filter((climber) => climber.age_group === "Youth B" && climber.gender_division === "Men")
    .sort((left, right) => Number(left.climber_number) - Number(right.climber_number))
    .slice(0, 3);

  if (dramaTrio.length === 3) {
    const [athleteA, athleteB, athleteC] = dramaTrio;
    const dramaClimberIds = dramaTrio.map((climber) => climber.id);
    const deleteDramaAttempts = await supabase
      .from("qualifier_attempts")
      .delete()
      .eq("competition_id", competitionId)
      .in("climber_id", dramaClimberIds);
    await requireNoSupabaseError(deleteDramaAttempts, "Unable to reset the demo cut-line score cells.");

    const dramaAttemptRows: Array<[string, number, number, boolean, boolean, number | null, number | null]> = [
      [athleteA.id, 1, 1, true, true, 1, 1],
      [athleteA.id, 2, 1, true, true, 1, 1],
      [athleteA.id, 3, 1, true, true, 1, 1],
      [athleteA.id, 4, 2, true, false, null, 2],
      [athleteB.id, 1, 1, true, true, 1, 1],
      [athleteB.id, 2, 2, true, true, 2, 1],
      [athleteB.id, 3, 2, true, true, 2, 1],
      [athleteB.id, 4, 1, true, false, null, 1],
      [athleteC.id, 1, 1, true, true, 1, 1],
      [athleteC.id, 2, 2, true, true, 2, 1],
      [athleteC.id, 3, 3, true, true, 3, 2],
      [athleteC.id, 4, 1, true, false, null, 1],
    ];
    const seededDramaAttempts = dramaAttemptRows.map(
      ([
        climberId,
        climbNumber,
        attemptCount,
        zone,
        topped,
        attemptsToTop,
        attemptsToZone,
      ]) => ({
        id: createId(),
        competition_id: competitionId,
        round_id: qualifierRoundId,
        climber_id: climberId,
        climb_number: climbNumber,
        entered_by: "staff",
        attempt_count: attemptCount,
        zone,
        topped,
        attempts_to_top: attemptsToTop,
        attempts_to_zone: attemptsToZone,
      })
    );

    const dramaAttemptInsert = await supabase.from("qualifier_attempts").insert(seededDramaAttempts);
    await requireNoSupabaseError(dramaAttemptInsert, "Unable to create the demo cut-line scenario.");

    const dramaEventInsert = await supabase.from("qualifier_score_events").insert(
      seededDramaAttempts.map((attempt, index) => ({
        id: createId(),
        competition_id: attempt.competition_id,
        round_id: attempt.round_id,
        climber_id: attempt.climber_id,
        climb_number: attempt.climb_number,
        attempt_count: attempt.attempt_count,
        zone: attempt.zone,
        topped: attempt.topped,
        attempts_to_top: attempt.attempts_to_top,
        attempts_to_zone: attempt.attempts_to_zone,
        entered_by: attempt.entered_by,
        judge_device_id: "demo-story-seed",
        judge_session_id: "cut-line-scenario",
        scored_at: new Date(now.getTime() - (seededDramaAttempts.length - index) * 30_000).toISOString(),
        received_at: new Date(now.getTime() - (seededDramaAttempts.length - index) * 30_000).toISOString(),
        client_event_id: `demo-drama-seed-${attempt.climber_id}-${attempt.climb_number}`,
        replayed_from_offline: false,
        conflict_flag: false,
        conflict_reason: null,
        supersedes_event_id: null,
      }))
    );
    await requireNoSupabaseError(dramaEventInsert, "Unable to create the demo cut-line score events.");

    const dramaMetadata = buildDemoStoryMetadataForClimbers({
      baseMetadata: initialDemoMetadata,
      targetClimber: athleteC,
      affectedClimber: athleteB,
    });

    const metadataUpdate = await supabase
      .from("competitions")
      .update({ demo_metadata: dramaMetadata })
      .eq("id", competitionId)
      .eq("is_demo", true);
    await requireNoSupabaseError(metadataUpdate, "Unable to save demo story metadata.");
  }

  const activeDemoBlockId =
    scheduleBlocks.find((entry) => entry.label === DEMO_ACTIVE_BLOCK_LABEL)?.id ?? null;
  const demoQueueClimbers = climbers
    .filter((entry) => entry.age_group === "Youth B" && entry.gender_division === "Men")
    .slice(0, 3);
  if (activeDemoBlockId && demoQueueClimbers.length) {
    const queuePayload = demoQueueClimbers.map((climber, index) => ({
      id: createId(),
      competition_id: competitionId,
      climber_id: climber.id,
      schedule_block_id: activeDemoBlockId,
      climb_number: index + 2,
      checked_in_at: new Date(now.getTime() - (index + 1) * 45 * 1000).toISOString(),
      climber_name: climber.name,
      climber_number: climber.climber_number,
      display_category: climber.display_category,
      province: climber.province,
      time_slot_id: climber.time_slot_id,
    }));
    let queueInsert = await supabase.from("competition_boulder_queue").insert(queuePayload);
    if (queueInsert.error && isMissingQueueColumnError(queueInsert.error)) {
      queueInsert = await supabase
        .from("competition_boulder_queue")
        .insert(queuePayload.map((entry) => stripOptionalQueueColumns(entry)));
    }
    await requireNoSupabaseError(queueInsert, "Unable to create the demo boulder queue.");
  }

  return {
    competitionId,
    slug: DEMO_COMPETITION_SLUG,
    name: DEMO_COMPETITION_NAME,
  };
}
