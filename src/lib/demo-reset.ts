import { buildDisplayCategory, createCategoryKey } from "./scoring";
import { DEMO_COMPETITION_NAME, DEMO_COMPETITION_SLUG } from "./demo";
import { createServiceRoleSupabaseClient } from "./server-supabase";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_LOCATION = "North Summit Climbing";
const DEMO_ACTIVE_BLOCK_LABEL = "Youth B qualifier rotation";

type DemoCategorySeed = {
  ageGroup: string;
  division: string;
  climbers: Array<{
    name: string;
    number: string;
    province: string;
    scoredBoulders: number;
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

const DEMO_CATEGORY_SEEDS: DemoCategorySeed[] = [
  {
    ageGroup: "Youth D",
    division: "Mixed",
    climbers: [
      { name: "Avery Chen", number: "101", province: "NS", scoredBoulders: 5 },
      { name: "Milo Fraser", number: "102", province: "NB", scoredBoulders: 5 },
      { name: "Sofia Turner", number: "103", province: "PE", scoredBoulders: 5 },
      { name: "Noah Patel", number: "104", province: "NS", scoredBoulders: 5 },
      { name: "Emma Brooks", number: "105", province: "NB", scoredBoulders: 5 },
      { name: "Lucas Martin", number: "106", province: "NS", scoredBoulders: 5 },
      { name: "Chloe Adams", number: "107", province: "NL", scoredBoulders: 5 },
      { name: "Ethan Ross", number: "108", province: "PE", scoredBoulders: 0 },
    ],
  },
  {
    ageGroup: "Youth B",
    division: "Mixed",
    climbers: [
      { name: "Harper Singh", number: "201", province: "NS", scoredBoulders: 5 },
      { name: "Owen Murphy", number: "202", province: "NB", scoredBoulders: 5 },
      { name: "Lily Cooper", number: "203", province: "PE", scoredBoulders: 5 },
      { name: "Jackson Lee", number: "204", province: "NS", scoredBoulders: 5 },
      { name: "Aria Campbell", number: "205", province: "NL", scoredBoulders: 2 },
      { name: "Levi Bennett", number: "206", province: "NS", scoredBoulders: 0 },
      { name: "Ella Reid", number: "207", province: "NB", scoredBoulders: 0 },
      { name: "Hudson Price", number: "208", province: "PE", scoredBoulders: 0 },
    ],
  },
  {
    ageGroup: "Open",
    division: "Mixed",
    climbers: [
      { name: "Maya Foster", number: "301", province: "NS", scoredBoulders: 5 },
      { name: "Declan White", number: "302", province: "NB", scoredBoulders: 5 },
      { name: "Zoe Hughes", number: "303", province: "PE", scoredBoulders: 1 },
      { name: "Caleb King", number: "304", province: "NS", scoredBoulders: 0 },
      { name: "Nora Walsh", number: "305", province: "NL", scoredBoulders: 0 },
      { name: "Isaac Green", number: "306", province: "NB", scoredBoulders: 0 },
      { name: "Sadie Bell", number: "307", province: "NS", scoredBoulders: 0 },
      { name: "Theo Young", number: "308", province: "PE", scoredBoulders: 0 },
    ],
  },
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
    .select("id")
    .or(`is_demo.eq.true,slug.eq.${DEMO_COMPETITION_SLUG}`);
  await requireNoSupabaseError(existingDemoRows, "Unable to load the existing demo competition.");

  const existingDemoIds = (existingDemoRows.data ?? []).map((row) => row.id as string);
  if (existingDemoIds.length) {
    const deleteResult = await supabase.from("competitions").delete().in("id", existingDemoIds);
    await requireNoSupabaseError(deleteResult, "Unable to clear the existing demo competition.");
  }

  const competitionInsert = await supabase.from("competitions").insert({
    id: competitionId,
    slug: DEMO_COMPETITION_SLUG,
    name: DEMO_COMPETITION_NAME,
    is_demo: true,
    status: "active",
    format: "five_on_five_off",
    current_phase: "qualifier_open",
    discipline_label: "Boulder",
    stage_mode: "qualifier",
    location_name: DEMO_LOCATION,
    start_date: startDate,
    end_date: startDate,
    registration_opens_at: registrationOpensAt,
    registration_closes_at: registrationClosesAt,
    description:
      "Seeded shared demo event for gym walkthroughs. Judges can submit qualifier scores while setup, deletion, and phase changes stay locked.",
    hero_image_url: "",
    official_event_url: "",
    official_registration_url: "",
    official_schedule_url: "",
    total_climbs: 5,
    max_climbers: 48,
    qualifier_counting_climbs: 5,
    has_finals: true,
    finals_cutoff: 6,
    finals_tie_advances: true,
    qualifier_eligible_age_groups: DEMO_CATEGORY_SEEDS.map((entry) => entry.ageGroup),
    finals_eligible_age_groups: DEMO_CATEGORY_SEEDS.map((entry) => entry.ageGroup),
    qualifier_locked_at: null,
    finals_started_at: null,
    finals_problem_count: 4,
  });
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
      problem_count: 5,
      counting_climbs: 5,
      finals_cutoff: 6,
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
      problem_count: 4,
      counting_climbs: null,
      finals_cutoff: 6,
      eligible_category_ids: categories.map((entry) => entry.id),
      advancement_source_round_id: qualifierRoundId,
      advancement_cutoff: 6,
      scoring_bucket: "finals",
      scoring_config: { demo: true },
      started_at: null,
      closed_at: null,
    },
  ];
  const roundInsert = await supabase.from("competition_rounds").insert(rounds);
  await requireNoSupabaseError(roundInsert, "Unable to create demo rounds.");

  const scheduleBlocks: DemoScheduleBlockRow[] = DEMO_CATEGORY_SEEDS.flatMap((entry, index) => {
    const qualifierBlockId = createId();
    const qualifierStart = 8 * 60 + index * 135;
    const qualifierEnd = qualifierStart + 120;
    return [
      index === 0
        ? {
            id: createId(),
            competition_id: competitionId,
            round_id: null,
            sort_order: 0,
            label: "Doors / check-in",
            phase_type: "check_in",
            audience_label: "All categories",
            is_active: false,
            start_time: "7:30 AM",
            end_time: "8:15 AM",
            capacity: 80,
            eligible_category_ids: categories.map((category) => category.id),
          }
        : null,
      {
        id: qualifierBlockId,
        competition_id: competitionId,
        round_id: qualifierRoundId,
        sort_order: index + 1,
        label: `${entry.ageGroup} qualifier rotation`,
        phase_type: "qualifier_round",
        audience_label: buildDisplayCategory(entry.division, entry.ageGroup),
        is_active: index === 1,
        start_time: minutesToLabel(qualifierStart),
        end_time: minutesToLabel(qualifierEnd),
        capacity: 12,
        eligible_category_ids: [createCategoryKey(entry.division, entry.ageGroup)],
      },
    ].filter(Boolean) as DemoScheduleBlockRow[];
  }).concat([
    {
      id: createId(),
      competition_id: competitionId,
      round_id: null,
      sort_order: DEMO_CATEGORY_SEEDS.length + 1,
      label: "Projected finals briefing",
      phase_type: "observation",
      audience_label: "Top 6 per category",
      is_active: false,
      start_time: "2:30 PM",
      end_time: "3:00 PM",
      capacity: 24,
      eligible_category_ids: categories.map((entry) => entry.id),
    },
    {
      id: createId(),
      competition_id: competitionId,
      round_id: finalsRoundId,
      sort_order: DEMO_CATEGORY_SEEDS.length + 2,
      label: "Projected finals round",
      phase_type: "finals_round",
      audience_label: "Top 6 per category",
      is_active: false,
      start_time: "3:15 PM",
      end_time: "4:30 PM",
      capacity: 24,
      eligible_category_ids: categories.map((entry) => entry.id),
    },
  ]);
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

      return Array.from({ length: seededClimber.scoredBoulders }, (_, attemptIndex) => {
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
  }

  const activeYouthBBlockId =
    scheduleBlocks.find((entry) => entry.label === DEMO_ACTIVE_BLOCK_LABEL)?.id ?? null;
  const youthBClimbers = climbers.filter((entry) => entry.age_group === "Youth B").slice(0, 3);
  if (activeYouthBBlockId && youthBClimbers.length) {
    const queueInsert = await supabase.from("competition_boulder_queue").insert(
      youthBClimbers.map((climber, index) => ({
        id: createId(),
        competition_id: competitionId,
        climber_id: climber.id,
        schedule_block_id: activeYouthBBlockId,
        climb_number: index + 2,
        checked_in_at: new Date(now.getTime() - (index + 1) * 45 * 1000).toISOString(),
        climber_name: climber.name,
        climber_number: climber.climber_number,
        display_category: climber.display_category,
        province: climber.province,
        time_slot_id: climber.time_slot_id,
      }))
    );
    await requireNoSupabaseError(queueInsert, "Unable to create the demo boulder queue.");
  }

  return {
    competitionId,
    slug: DEMO_COMPETITION_SLUG,
    name: DEMO_COMPETITION_NAME,
  };
}
