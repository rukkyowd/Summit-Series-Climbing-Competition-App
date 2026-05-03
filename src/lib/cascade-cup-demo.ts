import {
  buildCompetitionPath,
  buildDisplayCategory,
  createCategoryKey,
  createCompetitionRoundId,
  type Competition,
  type CompetitionCategory,
  type CompetitionRound,
  type CompetitionScheduleBlock,
} from "./scoring";

export const CASCADE_CUP_DEMO_SCENARIO = "cascade-cup";
export const CASCADE_CUP_DEMO_NAME = "Cascade Cup 2026 - Youth";
export const CASCADE_CUP_DEMO_SLUG = "cascade-cup-2026-youth";
export const CASCADE_CUP_DEMO_LOCATION = "North Summit Climbing";
export const CASCADE_CUP_DEMO_START_DATE = "2026-05-10";
export const CASCADE_CUP_DEMO_END_DATE = "2026-05-10";
export const CASCADE_CUP_DEMO_REGISTRATION_OPENS_AT = "2026-05-03T13:00:00.000Z";
export const CASCADE_CUP_DEMO_REGISTRATION_CLOSES_AT = "2026-05-09T22:00:00.000Z";
export const CASCADE_CUP_DEMO_MAX_CLIMBERS = 80;
export const CASCADE_CUP_DEMO_QUALIFIER_PROBLEMS = 20;
export const CASCADE_CUP_DEMO_COUNTING_CLIMBS = 8;
export const CASCADE_CUP_DEMO_FINALS_CUTOFF = 6;
export const CASCADE_CUP_DEMO_FINALS_PROBLEM_COUNT = 4;
export const CASCADE_CUP_DEMO_FINALS_TIE_ADVANCES = false;
export const CASCADE_CUP_DEMO_FIELD_SIZE = 48;

export const CASCADE_CUP_AGE_GROUPS = ["Youth B", "Youth A", "Junior"] as const;
export const CASCADE_CUP_GENDER_DIVISIONS = ["Men", "Women"] as const;

export type CascadeCupAgeGroup = (typeof CASCADE_CUP_AGE_GROUPS)[number];
export type CascadeCupGenderDivision = (typeof CASCADE_CUP_GENDER_DIVISIONS)[number];

export type CascadeCupClimberSeed = {
  name: string;
  number: string;
  province: string;
  genderDivision: CascadeCupGenderDivision;
  ageGroup: CascadeCupAgeGroup;
  categoryId: string;
  seedIndex: number;
  target?: boolean;
};

const CATEGORY_SORT_ORDER = new Map<string, number>(
  CASCADE_CUP_GENDER_DIVISIONS.flatMap((genderDivision, genderIndex) =>
    CASCADE_CUP_AGE_GROUPS.map((ageGroup, ageIndex) => [
      createCategoryKey(genderDivision, ageGroup),
      genderIndex * CASCADE_CUP_AGE_GROUPS.length + ageIndex,
    ])
  )
);

const CASCADE_CUP_NAMES = [
  "Leo Grant",
  "Noah Patel",
  "Milo Fraser",
  "Declan White",
  "Isaac Green",
  "Omar Lewis",
  "Theo Brooks",
  "Elsa Wyatt",
  "Amari Yoder",
  "Avery Quinn",
  "Nora Singh",
  "Chana Luna",
  "Iris Cole",
  "Jade Mercer",
  "Sofia Reid",
  "Andi Huang",
  "Ayaan Paul",
  "Dalton Gutierrez",
  "Eli Morgan",
  "Finn Carter",
  "Jonah Blake",
  "Kai Romero",
  "Luca Hayes",
  "Mina Okafor",
  "Piper Stone",
  "Rhea Kim",
  "Talia Moore",
  "Vera Hall",
  "Willa James",
  "Zara Price",
  "Ari Wells",
  "Benji Knox",
  "Caleb Hart",
  "Dante Ross",
  "Ezra Lane",
  "Felix Cruz",
  "Gavin Pike",
  "Hugo Ellis",
  "Ivan Park",
  "Keira Fox",
  "Lena Shah",
  "Maren Yu",
  "Naomi Vale",
  "Opal West",
  "Remy Chen",
  "Sage Bell",
  "Tessa Roy",
] as const;

const PROVINCES = ["NS", "NB", "PE", "NL", "QC", "ON"] as const;

export function isCascadeCupScenario(value: unknown) {
  return value === CASCADE_CUP_DEMO_SCENARIO;
}

export function getCascadeCupCreateFormDefaults() {
  return {
    name: CASCADE_CUP_DEMO_NAME,
    format: "five_on_five_off" as const,
    location: CASCADE_CUP_DEMO_LOCATION,
    startDate: CASCADE_CUP_DEMO_START_DATE,
    endDate: CASCADE_CUP_DEMO_END_DATE,
    registrationOpensAt: CASCADE_CUP_DEMO_REGISTRATION_OPENS_AT,
    registrationClosesAt: CASCADE_CUP_DEMO_REGISTRATION_CLOSES_AT,
    description:
      "Youth championship demo for the Cascade Cup sales walkthrough. Staff create the event, seed sample climbers, correct Maya Chen's B3 score, advance finalists, and publish public results.",
    maxClimbers: CASCADE_CUP_DEMO_MAX_CLIMBERS,
  };
}

export function getCascadeCupCategoryRows(competitionId: string): CompetitionCategory[] {
  return CASCADE_CUP_GENDER_DIVISIONS.flatMap((genderDivision) =>
    CASCADE_CUP_AGE_GROUPS.map((ageGroup) => {
      const id = createCategoryKey(genderDivision, ageGroup);
      return {
        id,
        competition_id: competitionId,
        gender_division: genderDivision,
        age_group: ageGroup,
        display_name: buildDisplayCategory(genderDivision, ageGroup),
        sort_order: CATEGORY_SORT_ORDER.get(id) ?? 0,
      };
    })
  );
}

export function getCascadeCupCategoryIds() {
  return CASCADE_CUP_GENDER_DIVISIONS.flatMap((genderDivision) =>
    CASCADE_CUP_AGE_GROUPS.map((ageGroup) => createCategoryKey(genderDivision, ageGroup))
  );
}

export function getCascadeCupSeedClimbers(): CascadeCupClimberSeed[] {
  let number = 101;
  let nameIndex = 0;

  return CASCADE_CUP_GENDER_DIVISIONS.flatMap((genderDivision) =>
    CASCADE_CUP_AGE_GROUPS.flatMap((ageGroup) =>
      Array.from({ length: 8 }, (_, seedIndex) => {
        const isTarget = genderDivision === "Men" && ageGroup === "Youth B" && seedIndex === 6;
        const climberNumber = isTarget ? "104" : String(number === 104 ? ++number : number);
        number += 1;

        return {
          name: isTarget ? "Maya Chen" : CASCADE_CUP_NAMES[nameIndex++ % CASCADE_CUP_NAMES.length],
          number: climberNumber,
          province: PROVINCES[(number + seedIndex) % PROVINCES.length],
          genderDivision,
          ageGroup,
          categoryId: createCategoryKey(genderDivision, ageGroup),
          seedIndex,
          target: isTarget,
        };
      })
    )
  );
}

export function sampleCascadeCupScorecardToken(competitionId: string, climberNumber: string) {
  return `scorecard-demo-seed-${competitionId}-${climberNumber}`;
}

export function buildCascadeCupScorecardUrl(slug: string, competitionId: string, climberNumber = "104") {
  const params = new URLSearchParams({
    token: sampleCascadeCupScorecardToken(competitionId, climberNumber),
    demo: "1",
  });
  return `${buildCompetitionPath(slug, "scorecard")}?${params.toString()}`;
}

export function buildCascadeCupRounds(
  competition: Pick<Competition, "id" | "format" | "current_phase">
): CompetitionRound[] {
  const qualifierRoundId = createCompetitionRoundId();
  return [
    {
      id: qualifierRoundId,
      competition_id: competition.id,
      round_number: 1,
      sort_order: 1,
      name: "Qualifier",
      round_type: "qualifier",
      format: competition.format,
      status: "scoring",
      runtime_phase: "qualifier_open",
      is_enabled: true,
      is_active: true,
      activated_at: null,
      problem_count: CASCADE_CUP_DEMO_QUALIFIER_PROBLEMS,
      counting_climbs: CASCADE_CUP_DEMO_COUNTING_CLIMBS,
      finals_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
      eligible_category_ids: [],
      advancement_source_round_id: null,
      advancement_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
      scoring_bucket: "qualifier",
      scoring_config: {},
      started_at: null,
      closed_at: null,
    },
    {
      id: createCompetitionRoundId(),
      competition_id: competition.id,
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
      problem_count: CASCADE_CUP_DEMO_FINALS_PROBLEM_COUNT,
      counting_climbs: null,
      finals_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
      eligible_category_ids: [],
      advancement_source_round_id: qualifierRoundId,
      advancement_cutoff: CASCADE_CUP_DEMO_FINALS_CUTOFF,
      scoring_bucket: "finals",
      scoring_config: {},
      started_at: null,
      closed_at: null,
    },
  ];
}

export function buildCascadeCupScheduleBlocks(
  competitionId: string,
  rounds: CompetitionRound[],
  categoryIds = getCascadeCupCategoryIds()
): CompetitionScheduleBlock[] {
  const qualifierRoundId = rounds.find((round) => round.scoring_bucket === "qualifier")?.id ?? null;
  const finalsRoundId = rounds.find((round) => round.scoring_bucket === "finals")?.id ?? null;
  return [
    {
      id: crypto.randomUUID(),
      competition_id: competitionId,
      round_id: null,
      sort_order: 1,
      label: "Check-in",
      phase_type: "check_in",
      audience_label: "All athletes",
      is_active: false,
      start_time: "8:00 AM",
      end_time: "9:00 AM",
      capacity: CASCADE_CUP_DEMO_MAX_CLIMBERS,
      eligible_category_ids: [],
    },
    {
      id: crypto.randomUUID(),
      competition_id: competitionId,
      round_id: null,
      sort_order: 2,
      label: "Rules briefing",
      phase_type: "technical_meeting",
      audience_label: "Athletes, coaches, and judges",
      is_active: false,
      start_time: "9:00 AM",
      end_time: "9:20 AM",
      capacity: CASCADE_CUP_DEMO_MAX_CLIMBERS,
      eligible_category_ids: [],
    },
    {
      id: crypto.randomUUID(),
      competition_id: competitionId,
      round_id: qualifierRoundId,
      sort_order: 3,
      label: "Cascade Cup qualifier",
      phase_type: "qualifier_round",
      audience_label: "Youth B, Youth A, and Junior",
      is_active: true,
      start_time: "9:30 AM",
      end_time: "12:30 PM",
      capacity: CASCADE_CUP_DEMO_FIELD_SIZE,
      eligible_category_ids: categoryIds,
    },
    {
      id: crypto.randomUUID(),
      competition_id: competitionId,
      round_id: finalsRoundId,
      sort_order: 4,
      label: "Finals",
      phase_type: "finals_round",
      audience_label: "Finalists",
      is_active: false,
      start_time: "2:00 PM",
      end_time: "3:30 PM",
      capacity: CASCADE_CUP_DEMO_FINALS_CUTOFF * CASCADE_CUP_AGE_GROUPS.length * CASCADE_CUP_GENDER_DIVISIONS.length,
      eligible_category_ids: categoryIds,
    },
    {
      id: crypto.randomUUID(),
      competition_id: competitionId,
      round_id: null,
      sort_order: 5,
      label: "Results / Awards",
      phase_type: "results",
      audience_label: "Athletes and spectators",
      is_active: false,
      start_time: "4:00 PM",
      end_time: "4:30 PM",
      capacity: CASCADE_CUP_DEMO_MAX_CLIMBERS,
      eligible_category_ids: [],
    },
  ];
}
