import {
  CATEGORY_AGE_GROUPS,
  type Competition,
  type CompetitionRoundType,
  type EventFormat,
  type SchedulePhaseType,
} from "@/lib/scoring";

export type CompetitionPresetId =
  | "community_scramble"
  | "recreational_scramble_awards"
  | "youth_qualifier_day"
  | "youth_championship_finals"
  | "open_boulder_championship"
  | "ifsc_style_finals_event"
  | "flash_format_competition"
  | "finals_only_showcase"
  | "training_mock_event"
  | "custom";

export const GUIDED_DEMO_PRESET_ID = "youth_championship_finals" satisfies CompetitionPresetId;

export type JudgeRequirementLevel =
  | "self_scored_ok"
  | "light_staff"
  | "moderate_judges"
  | "dedicated_judges"
  | "technical_panel";

export type CompetitionPresetScheduleBlock = {
  label: string;
  phase_type: SchedulePhaseType;
  round_type?: CompetitionRoundType;
  audience_label: string;
  capacity?: number;
  eligible_age_groups?: string[];
};

export type CompetitionPreset = {
  id: CompetitionPresetId;
  name: string;
  description: string;
  format: EventFormat;
  targetAudience: string;
  defaultCategories: string[];
  finalsEnabled: boolean;
  finalsEligibleCategories: string[];
  finalsCutoff: 6 | 8;
  tiesAdvanceDefault: boolean;
  qualifierProblemCount: number;
  countingClimbs: number;
  finalsProblemCount: number;
  defaultScheduleBlocks: CompetitionPresetScheduleBlock[];
  judgeRequirementLevel: JudgeRequirementLevel;
  summary: string;
  details: string;
};

const ALL_CATEGORIES = [...CATEGORY_AGE_GROUPS];
const YOUTH_CATEGORIES = ["Youth D", "Youth C", "Youth B", "Youth A", "Junior"];
const REC_CATEGORIES = ["Rec", "Masters", "Open"];
const OPEN_CATEGORIES = ["Open"];

const commonArrivalBlocks: CompetitionPresetScheduleBlock[] = [
  {
    label: "Check-in",
    phase_type: "check_in",
    audience_label: "All athletes",
  },
  {
    label: "Rules briefing",
    phase_type: "technical_meeting",
    audience_label: "Athletes and coaches",
  },
];

const awardsBlock: CompetitionPresetScheduleBlock = {
  label: "Results / Awards",
  phase_type: "results",
  audience_label: "All athletes",
};

const finalsFlowBlocks: CompetitionPresetScheduleBlock[] = [
  {
    label: "Wall reset",
    phase_type: "wall_reset",
    audience_label: "Routesetting",
  },
  {
    label: "Isolation",
    phase_type: "isolation",
    round_type: "finals",
    audience_label: "Finalists",
  },
  {
    label: "Observation",
    phase_type: "observation",
    round_type: "finals",
    audience_label: "Finalists",
  },
  {
    label: "Finals",
    phase_type: "finals_round",
    round_type: "finals",
    audience_label: "Finalists",
  },
];

function qualifierBlock(label: string, audienceLabel: string, eligibleAgeGroups?: string[]): CompetitionPresetScheduleBlock {
  return {
    label,
    phase_type: "qualifier_round",
    round_type: "qualifier",
    audience_label: audienceLabel,
    eligible_age_groups: eligibleAgeGroups,
  };
}

export const COMPETITION_PRESETS: CompetitionPreset[] = [
  {
    id: "community_scramble",
    name: "Community Scramble",
    summary: "Friendly self-scored day",
    description: "A relaxed open scramble for gyms that want a low-friction comp day without finals.",
    format: "scramble",
    targetAudience: "Community nights, member events, and casual open scrambles.",
    defaultCategories: REC_CATEGORIES,
    finalsEnabled: false,
    finalsEligibleCategories: [],
    finalsCutoff: 6,
    tiesAdvanceDefault: true,
    qualifierProblemCount: 30,
    countingClimbs: 6,
    finalsProblemCount: 4,
    judgeRequirementLevel: "self_scored_ok",
    details: "Rec / Masters / Open categories, 30 qualifier boulders, best 6 count, no finals.",
    defaultScheduleBlocks: [
      ...commonArrivalBlocks,
      qualifierBlock("Scramble Session 1", "Open scramble"),
      qualifierBlock("Scramble Session 2", "Open scramble"),
      awardsBlock,
    ],
  },
  {
    id: "recreational_scramble_awards",
    name: "Recreational Scramble + Awards",
    summary: "Scramble with awards cut",
    description: "A more polished recreational scramble with finals-style awards eligibility but no live finals round.",
    format: "scramble",
    targetAudience: "Large recreational events where Open podiums matter but the day should stay simple.",
    defaultCategories: REC_CATEGORIES,
    finalsEnabled: false,
    finalsEligibleCategories: OPEN_CATEGORIES,
    finalsCutoff: 6,
    tiesAdvanceDefault: true,
    qualifierProblemCount: 30,
    countingClimbs: 8,
    finalsProblemCount: 4,
    judgeRequirementLevel: "light_staff",
    details: "Rec / Masters / Open categories, 30 boulders, best 8 count, awards block included.",
    defaultScheduleBlocks: [
      ...commonArrivalBlocks,
      qualifierBlock("Morning Scramble", "All recreational categories"),
      qualifierBlock("Afternoon Scramble", "All recreational categories"),
      awardsBlock,
    ],
  },
  {
    id: "youth_qualifier_day",
    name: "Youth Qualifier Day",
    summary: "Youth-only qualifier",
    description: "A judge-friendly youth qualifier day with category waves and no finals.",
    format: "scramble",
    targetAudience: "Youth regional qualifiers, school leagues, and development circuits.",
    defaultCategories: YOUTH_CATEGORIES,
    finalsEnabled: false,
    finalsEligibleCategories: [],
    finalsCutoff: 6,
    tiesAdvanceDefault: true,
    qualifierProblemCount: 6,
    countingClimbs: 6,
    finalsProblemCount: 4,
    judgeRequirementLevel: "moderate_judges",
    details: "Youth D through Junior, six judged qualifier boulders, no finals workflow.",
    defaultScheduleBlocks: [
      ...commonArrivalBlocks,
      qualifierBlock("Youth D / Youth C Qualifier", "Youth D / Youth C", ["Youth D", "Youth C"]),
      qualifierBlock("Youth B / Youth A Qualifier", "Youth B / Youth A", ["Youth B", "Youth A"]),
      qualifierBlock("Junior Qualifier", "Junior", ["Junior"]),
      awardsBlock,
    ],
  },
  {
    id: "youth_championship_finals",
    name: "Youth Championship with Finals",
    summary: "Youth qualifier plus finals",
    description: "A championship youth day with qualifier waves, isolation, observation, and finals.",
    format: "five_on_five_off",
    targetAudience: "Youth championships and high-stakes regional finals qualifiers.",
    defaultCategories: YOUTH_CATEGORIES,
    finalsEnabled: true,
    finalsEligibleCategories: ["Youth B", "Youth A", "Junior"],
    finalsCutoff: 6,
    tiesAdvanceDefault: true,
    qualifierProblemCount: 6,
    countingClimbs: 6,
    finalsProblemCount: 4,
    judgeRequirementLevel: "dedicated_judges",
    details: "Youth D-Junior qualifiers, finals for Youth B/A/Junior, top 6 with ties advancing.",
    defaultScheduleBlocks: [
      ...commonArrivalBlocks,
      qualifierBlock("Youth D / Youth C Qualifier", "Youth D / Youth C", ["Youth D", "Youth C"]),
      qualifierBlock("Youth B / Youth A Qualifier", "Youth B / Youth A", ["Youth B", "Youth A"]),
      qualifierBlock("Junior Qualifier", "Junior", ["Junior"]),
      ...finalsFlowBlocks,
      awardsBlock,
    ],
  },
  {
    id: "open_boulder_championship",
    name: "Open Boulder Championship",
    summary: "Open qualifier plus finals",
    description: "A classic adult boulder championship with judged qualifiers and a top-six finals field.",
    format: "five_on_five_off",
    targetAudience: "Open adult championships and marquee gym events.",
    defaultCategories: OPEN_CATEGORIES,
    finalsEnabled: true,
    finalsEligibleCategories: OPEN_CATEGORIES,
    finalsCutoff: 6,
    tiesAdvanceDefault: true,
    qualifierProblemCount: 6,
    countingClimbs: 6,
    finalsProblemCount: 4,
    judgeRequirementLevel: "dedicated_judges",
    details: "Open category, six qualifier boulders, top 6 finals, isolation and observation included.",
    defaultScheduleBlocks: [
      ...commonArrivalBlocks,
      qualifierBlock("Open Qualifier", "Open", OPEN_CATEGORIES),
      ...finalsFlowBlocks,
      awardsBlock,
    ],
  },
  {
    id: "ifsc_style_finals_event",
    name: "IFSC-Style Finals Event",
    summary: "Technical finals showcase",
    description: "A stricter format for events that want IFSC-style finals logistics and technical scoring discipline.",
    format: "ifsc_finals_format",
    targetAudience: "Elite showcases, invitational finals, and technical production events.",
    defaultCategories: OPEN_CATEGORIES,
    finalsEnabled: true,
    finalsEligibleCategories: OPEN_CATEGORIES,
    finalsCutoff: 8,
    tiesAdvanceDefault: true,
    qualifierProblemCount: 6,
    countingClimbs: 6,
    finalsProblemCount: 4,
    judgeRequirementLevel: "technical_panel",
    details: "Open category, top 8 finals cut, IFSC-style finals round and technical panel expectation.",
    defaultScheduleBlocks: [
      ...commonArrivalBlocks,
      qualifierBlock("IFSC Qualifier", "Open", OPEN_CATEGORIES),
      ...finalsFlowBlocks,
      awardsBlock,
    ],
  },
  {
    id: "flash_format_competition",
    name: "Flash Format Competition",
    summary: "Official flash qualifier",
    description: "A compact official-points event with flash-format qualifiers and a finals cut.",
    format: "flash_format",
    targetAudience: "Sanctioned-style qualifiers and gyms that want official points with less schedule sprawl.",
    defaultCategories: ["Youth A", "Junior", "Open"],
    finalsEnabled: true,
    finalsEligibleCategories: ["Junior", "Open"],
    finalsCutoff: 8,
    tiesAdvanceDefault: true,
    qualifierProblemCount: 6,
    countingClimbs: 6,
    finalsProblemCount: 4,
    judgeRequirementLevel: "dedicated_judges",
    details: "Youth A / Junior / Open, six flash qualifier problems, top 8 finals cut.",
    defaultScheduleBlocks: [
      ...commonArrivalBlocks,
      qualifierBlock("Flash Qualifier A", "Youth A / Junior", ["Youth A", "Junior"]),
      qualifierBlock("Flash Qualifier B", "Open", OPEN_CATEGORIES),
      ...finalsFlowBlocks,
      awardsBlock,
    ],
  },
  {
    id: "finals_only_showcase",
    name: "Finals-Only Showcase",
    summary: "Invitational finals night",
    description: "A lean showcase preset for invited finalists where the public focus is isolation, observation, and finals.",
    format: "ifsc_finals_format",
    targetAudience: "Finals-night exhibitions, sponsor showcases, and invited athlete demos.",
    defaultCategories: OPEN_CATEGORIES,
    finalsEnabled: true,
    finalsEligibleCategories: OPEN_CATEGORIES,
    finalsCutoff: 6,
    tiesAdvanceDefault: false,
    qualifierProblemCount: 4,
    countingClimbs: 4,
    finalsProblemCount: 4,
    judgeRequirementLevel: "technical_panel",
    details: "Open invitational setup, top 6 finals field, four finals boulders, minimal qualifier scaffold.",
    defaultScheduleBlocks: [
      {
        label: "Athlete check-in",
        phase_type: "check_in",
        audience_label: "Invited finalists",
      },
      {
        label: "Finals briefing",
        phase_type: "technical_meeting",
        audience_label: "Finalists and officials",
      },
      ...finalsFlowBlocks,
      awardsBlock,
    ],
  },
  {
    id: "training_mock_event",
    name: "Training / Mock Event",
    summary: "Practice-safe setup",
    description: "A small mock competition for staff training, judge onboarding, and rehearsal days.",
    format: "scramble",
    targetAudience: "Staff practice, route testing, mock comps, and demo rehearsal.",
    defaultCategories: ["Rec", "Open"],
    finalsEnabled: true,
    finalsEligibleCategories: ["Open"],
    finalsCutoff: 6,
    tiesAdvanceDefault: true,
    qualifierProblemCount: 12,
    countingClimbs: 4,
    finalsProblemCount: 3,
    judgeRequirementLevel: "light_staff",
    details: "Rec / Open practice categories, 12 qualifier boulders, best 4 count, small mock finals.",
    defaultScheduleBlocks: [
      ...commonArrivalBlocks,
      qualifierBlock("Mock Qualifier", "Training field", ["Rec", "Open"]),
      ...finalsFlowBlocks,
      awardsBlock,
    ],
  },
  {
    id: "custom",
    name: "Custom",
    summary: "Manual configuration",
    description: "Keep the current competition settings and tune categories, rounds, finals, and schedule manually.",
    format: "scramble",
    targetAudience: "Existing competitions, unusual formats, or events that should not be overwritten by a preset.",
    defaultCategories: ALL_CATEGORIES,
    finalsEnabled: true,
    finalsEligibleCategories: ["Open"],
    finalsCutoff: 6,
    tiesAdvanceDefault: true,
    qualifierProblemCount: 30,
    countingClimbs: 6,
    finalsProblemCount: 4,
    judgeRequirementLevel: "moderate_judges",
    details: "No automatic overwrite. Existing saved competitions default here unless they confidently match a preset.",
    defaultScheduleBlocks: [],
  },
];

export function getCompetitionPreset(presetId: CompetitionPresetId) {
  return COMPETITION_PRESETS.find((preset) => preset.id === presetId) ?? COMPETITION_PRESETS[COMPETITION_PRESETS.length - 1];
}

export function getGuidedDemoPreset() {
  const preset = getCompetitionPreset(GUIDED_DEMO_PRESET_ID);

  if (!preset.finalsEnabled) {
    throw new Error("The guided demo preset must support finals.");
  }

  return preset;
}

export function getPresetFinalsEligibleCategories(preset: CompetitionPreset) {
  return preset.finalsEnabled
    ? preset.finalsEligibleCategories.filter((ageGroup) => preset.defaultCategories.includes(ageGroup))
    : [];
}

function sortPresetCategories(categories: readonly string[]) {
  return [...categories].sort((left, right) => {
    const leftIndex = CATEGORY_AGE_GROUPS.indexOf(left as (typeof CATEGORY_AGE_GROUPS)[number]);
    const rightIndex = CATEGORY_AGE_GROUPS.indexOf(right as (typeof CATEGORY_AGE_GROUPS)[number]);
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
}

function categorySetsEqual(left: readonly string[], right: readonly string[]) {
  const sortedLeft = sortPresetCategories(left);
  const sortedRight = sortPresetCategories(right);
  return sortedLeft.length === sortedRight.length && sortedLeft.every((entry, index) => entry === sortedRight[index]);
}

export function detectCompetitionPreset(competition: Competition): CompetitionPreset {
  if (competition.is_demo) {
    return getCompetitionPreset("custom");
  }

  const matchedPreset = COMPETITION_PRESETS.find((preset) => {
    if (preset.id === "custom") {
      return false;
    }

    return (
      competition.format === preset.format &&
      competition.has_finals === preset.finalsEnabled &&
      competition.finals_cutoff === preset.finalsCutoff &&
      competition.finals_tie_advances === preset.tiesAdvanceDefault &&
      competition.total_climbs === preset.qualifierProblemCount &&
      competition.qualifier_counting_climbs === preset.countingClimbs &&
      competition.finals_problem_count === preset.finalsProblemCount &&
      categorySetsEqual(competition.qualifier_eligible_age_groups, preset.defaultCategories) &&
      categorySetsEqual(competition.finals_eligible_age_groups, getPresetFinalsEligibleCategories(preset))
    );
  });

  return matchedPreset ?? getCompetitionPreset("custom");
}
