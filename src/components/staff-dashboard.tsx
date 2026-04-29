"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import SiteHeader from "@/components/site-header";
import StaffCompetitionSubnav from "@/components/staff-competition-subnav";
import ConfirmationModal from "@/components/confirmation-modal";
import DemoExperience from "@/components/demo-experience";
import { getAuthState, signOutUser, type Profile } from "@/lib/auth";
import { isDemoCompetitionRecord } from "@/lib/demo";
import { buildFinalsCsv, buildQualifierCsv, downloadCsv } from "@/lib/export";
import {
  createCompetitionFromTemplate,
  deleteCompetition,
  getCompetitionSnapshot,
  listCompetitionSummaries,
  saveCompetitionConfig,
  saveFinalistField,
  setCompetitionLiveScheduleBlock,
  setCompetitionPhase,
  setCompetitionStatus,
  undoCompetitionOperation,
  updateFinalistClimbingOrder,
  type CompetitionSnapshot,
  type CompetitionSummary,
} from "@/lib/db";
import {
  CATEGORY_AGE_GROUPS,
  DEFAULT_FINALS_CUTOFF,
  DEFAULT_MAX_CLIMBERS,
  DEFAULT_QUALIFIER_COUNTING_CLIMBS,
  DEFAULT_TOTAL_CLIMBS,
  FORMAT_TEMPLATES,
  SCHEDULE_PHASE_OPTIONS,
  buildCompetitionPath,
  buildDisplayPath,
  buildStaffCompetitionPath,
  compareCompetitionPhases,
  compareScheduleBlocks,
  competitionAllowsOptionalFinals,
  competitionHasFinals,
  createCompetitionRoundId,
  getCompetitionPhaseForSchedulePhase,
  getCompetitionPhaseSequenceFromScheduleBlocks,
  getRoundDefaultScoringBucket,
  getRoundLabel,
  getRoundRuntimePhase,
  formatCompetitionPhaseLabel,
  formatDateTimeLabel,
  formatSchedulePhaseLabel,
  formatUsesSelfScoredQualifiers,
  getNextCompetitionPhase,
  getPreviousCompetitionPhase,
  getRecommendedFinalsCutoff,
  getRecommendedQualifierClimbCount,
  getRecommendedQualifierCountingClimbs,
  getRegistrationAssignmentLabel,
  getSchedulePhaseDescription,
  isQualifierEligibleCategory,
  isQualifierStage,
  normalizeCompetition,
  parseScheduleTimeToMinutes,
  slugifyCompetitionName,
  type Competition,
  type CompetitionRound,
  type CompetitionRoundScoringBucket,
  type CompetitionRoundType,
  type CompetitionScheduleBlock,
  type SchedulePhaseType,
} from "@/lib/scoring";
import { sanitizeExternalUrl } from "@/lib/security";

const COMPETITION_UNDO_WINDOW_LABEL = "5 minutes";

function isDemoDataSlug(slug: string | null | undefined) {
  return isDemoCompetitionRecord({ slug: slug ?? "", is_demo: false });
}

function cloneCompetition(competition: Competition): Competition {
  return {
    ...competition,
    categories: competition.categories.map((category) => ({ ...category })),
    schedule_blocks: competition.schedule_blocks.map((block) => ({
      ...block,
      eligible_category_ids: [...block.eligible_category_ids],
    })),
    rounds: (competition.rounds ?? []).map((round) => ({
      ...round,
      eligible_category_ids: [...round.eligible_category_ids],
      scoring_config: { ...round.scoring_config },
    })),
  };
}

function toggleAgeGroup(current: string[], ageGroup: string) {
  if (current.includes(ageGroup)) {
    return current.filter((entry) => entry !== ageGroup);
  }

  return [...current, ageGroup];
}

function createScheduleBlockId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `schedule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type ScheduleBlockTemplate = {
  label: string;
  phase_type: SchedulePhaseType;
  round_type?: CompetitionRoundType;
  audience_label: string;
  capacity?: number;
  eligible_age_groups?: string[];
};

type ScheduleTemplateGroup = {
  title: string;
  description: string;
  templates: ScheduleBlockTemplate[];
};

type GuidedSetupPreset = {
  id: "simple_local" | "qualifier_finals" | "qualifier_semifinal_finals";
  title: string;
  summary: string;
  description: string;
  details: string;
  bestFor: string;
  includes: string;
  typicalFlow: string;
};

type DemoFlowStep = {
  title: string;
  description: string;
};

type DemoTourCard = {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
};

const DEMO_FLOW_STEPS: DemoFlowStep[] = [
  { title: "Build the event", description: "Set categories, sessions, and competition stages before registration opens." },
  { title: "Open registration", description: "Share one clean registration link instead of juggling forms and spreadsheets." },
  { title: "Run sessions", description: "Organize qualifier, semifinal, and finals windows on a single day schedule." },
  { title: "Record scores live", description: "Judges capture attempts while standings update in the background." },
  { title: "Advance finalists", description: "Move athletes into the next stage without rebuilding finals lists by hand." },
  { title: "Share results", description: "Give climbers and spectators a public leaderboard and display screen." },
];

const DEMO_REPLACES_POINTS = [
  "Registration spreadsheets and manual session rosters",
  "Paper scorecards or disconnected judge notes",
  "Hand-built finalist lists and climbing orders",
  "Scattered links for public updates and event-day screens",
];

const DEMO_TRUST_POINTS = [
  "Staff can plan categories, sessions, and stages in one place.",
  "Judging, standings, and finals progression follow the same event model.",
  "Public pages look polished for climbers, parents, and spectators.",
];

function createRoundTemplate(
  competition: Pick<Competition, "id" | "format" | "total_climbs" | "qualifier_counting_climbs" | "finals_cutoff" | "finals_problem_count">,
  roundType: CompetitionRoundType,
  sortOrder: number
): CompetitionRound {
  const scoringBucket = getRoundDefaultScoringBucket(roundType);
  return {
    id: createCompetitionRoundId(),
    competition_id: competition.id,
    round_number: sortOrder,
    sort_order: sortOrder,
    name: getRoundLabel(roundType, sortOrder - 1),
    round_type: roundType,
    format: roundType === "finals" ? "ifsc_finals_format" : competition.format,
    status: "pending",
    runtime_phase: getRoundRuntimePhase(roundType),
    is_enabled: true,
    is_active: scoringBucket === "qualifier",
    activated_at: null,
    problem_count: roundType === "finals" ? competition.finals_problem_count : competition.total_climbs,
    counting_climbs: roundType === "finals" ? null : competition.qualifier_counting_climbs,
    finals_cutoff: roundType === "semifinal" ? null : competition.finals_cutoff,
    eligible_category_ids: [],
    advancement_source_round_id: null,
    advancement_cutoff: roundType === "finals" ? competition.finals_cutoff : null,
    scoring_bucket: scoringBucket,
    scoring_config: {},
    started_at: null,
    closed_at: null,
  };
}

function buildRoundPlanTemplate(competition: Pick<Competition, "id" | "format" | "has_finals" | "total_climbs" | "qualifier_counting_climbs" | "finals_cutoff" | "finals_problem_count">) {
  const rounds = [createRoundTemplate(competition, "qualifier", 1)];
  if (competitionHasFinals(competition)) {
    const finalsRound = createRoundTemplate(competition, "finals", rounds.length + 1);
    finalsRound.advancement_source_round_id = rounds[0].id;
    rounds.push(finalsRound);
  }

  return rounds;
}

function summarizeRoundPlan(rounds: CompetitionRound[]) {
  return rounds.map((round) => `${round.round_type}:${round.scoring_bucket}:${round.problem_count}:${round.format}`).join("|");
}

const QUALIFIER_TEMPLATE_AGE_GROUPS = ["Youth D", "Youth C", "Youth B", "Youth A", "Junior", "Open", "Rec", "Masters"] as const;

type StaffDashboardCreateDraft = {
  name?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  officialEventUrl?: string;
  officialRegistrationUrl?: string;
  officialScheduleUrl?: string;
  heroImageUrl?: string;
  disciplineLabel?: string;
  format?: string;
};

function sanitizeDraftText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "undefined" || trimmed === "null") {
    return "";
  }

  return trimmed;
}

function sanitizeDraftNullable(value: string | null | undefined) {
  const trimmed = sanitizeDraftText(value);
  return trimmed || null;
}

function formatDateTimeLocalInput(value: string | null | undefined) {
  const trimmed = sanitizeDraftText(value);
  if (!trimmed) {
    return "";
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function parseDateTimeLocalInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function formatAgeGroupBandLabel(ageGroups: readonly string[]) {
  return ageGroups.join(" / ");
}

function sortAgeGroups(ageGroups: readonly string[]) {
  const ageGroupOrder = CATEGORY_AGE_GROUPS as readonly string[];
  return [...ageGroups].sort((left, right) => ageGroupOrder.indexOf(left) - ageGroupOrder.indexOf(right));
}

function getWaveLabel(ageGroups: readonly string[], competition: Competition) {
  return `${formatAgeGroupBandLabel(sortAgeGroups(ageGroups))} ${getRegistrationAssignmentLabel(competition)}`;
}

function getWaveAudienceLabel(ageGroups: readonly string[]) {
  return formatAgeGroupBandLabel(sortAgeGroups(ageGroups));
}

function getCompactWaveLabel(ageGroups: readonly string[], competition: Competition) {
  const sortedAgeGroups = sortAgeGroups(ageGroups);
  const assignmentLabel = getRegistrationAssignmentLabel(competition);
  const eligibleAgeGroups = sortAgeGroups(
    QUALIFIER_TEMPLATE_AGE_GROUPS.filter((ageGroup) => competition.qualifier_eligible_age_groups.includes(ageGroup))
  );

  if (
    eligibleAgeGroups.length > 0 &&
    sortedAgeGroups.length === eligibleAgeGroups.length &&
    sortedAgeGroups.every((ageGroup, index) => ageGroup === eligibleAgeGroups[index])
  ) {
    return `All Categories ${assignmentLabel}`;
  }

  if (sortedAgeGroups.length <= 2) {
    return getWaveLabel(sortedAgeGroups, competition);
  }

  return `${sortedAgeGroups[0]} + ${sortedAgeGroups.length - 1} more ${assignmentLabel}`;
}

function reindexScheduleBlocks(blocks: CompetitionScheduleBlock[]) {
  return blocks.map((block, index) => ({
    ...block,
    sort_order: index,
  }));
}

function getWaveAgeGroupsFromCategoryIds(
  categoryIds: readonly string[],
  qualifierCategories: Competition["categories"]
) {
  return sortAgeGroups(
    qualifierCategories
      .filter((category) => categoryIds.includes(category.id))
      .map((category) => category.age_group)
      .filter((ageGroup, index, current) => current.indexOf(ageGroup) === index)
  );
}

function buildScheduleBlockTemplates(competition: Competition): ScheduleBlockTemplate[] {
  const assignmentLabel = getRegistrationAssignmentLabel(competition);
  const hasFinals = competitionHasFinals(competition);
  const qualifierBandTemplates = QUALIFIER_TEMPLATE_AGE_GROUPS
    .filter((ageGroup) => competition.qualifier_eligible_age_groups.includes(ageGroup))
    .map((ageGroup) => ({
      label: `${ageGroup} ${assignmentLabel}`,
      phase_type: "qualifier_round" as const,
      audience_label: ageGroup,
      capacity: competition.max_climbers,
      eligible_age_groups: [ageGroup],
    }));

  if (formatUsesSelfScoredQualifiers(competition.format)) {
    return [
      { label: "Check-in", phase_type: "check_in", audience_label: "All climbers", capacity: competition.max_climbers },
      { label: "Technical meeting", phase_type: "technical_meeting", audience_label: "Athletes and coaches", capacity: competition.max_climbers },
      { label: `${assignmentLabel} 1`, phase_type: "qualifier_round", audience_label: "Scramble window", capacity: competition.max_climbers },
      { label: `${assignmentLabel} 2`, phase_type: "qualifier_round", audience_label: "Scramble window", capacity: competition.max_climbers },
      ...qualifierBandTemplates,
      { label: "Wall reset", phase_type: "wall_reset", audience_label: "Routesetting", capacity: competition.max_climbers },
      ...(hasFinals
        ? [
            { label: "Isolation", phase_type: "isolation" as const, audience_label: "Finalists", capacity: competition.max_climbers },
            { label: "Observation", phase_type: "observation" as const, audience_label: "Finalists", capacity: competition.max_climbers },
            { label: "Finals", phase_type: "finals_round" as const, audience_label: "Finalists", capacity: competition.max_climbers },
          ]
        : []),
      { label: "Results / Awards", phase_type: "results", audience_label: "All climbers", capacity: competition.max_climbers },
    ];
  }

  return [
    { label: "Check-in", phase_type: "check_in", audience_label: "All athletes", capacity: competition.max_climbers },
    { label: "Technical meeting", phase_type: "technical_meeting", audience_label: "Athletes and coaches", capacity: competition.max_climbers },
    ...qualifierBandTemplates,
    { label: `${assignmentLabel} A`, phase_type: "qualifier_round", audience_label: "Qualifier wave", capacity: competition.max_climbers },
    { label: `${assignmentLabel} B`, phase_type: "qualifier_round", audience_label: "Qualifier wave", capacity: competition.max_climbers },
    ...(hasFinals
      ? [
          { label: "Isolation", phase_type: "isolation" as const, audience_label: "Finalists", capacity: competition.max_climbers },
          { label: "Observation", phase_type: "observation" as const, audience_label: "Finalists", capacity: competition.max_climbers },
          { label: "Finals", phase_type: "finals_round" as const, audience_label: "Finalists", capacity: competition.max_climbers },
        ]
      : []),
    { label: "Results / Awards", phase_type: "results", audience_label: "All athletes", capacity: competition.max_climbers },
  ];
}

const GUIDED_SETUP_PRESETS: GuidedSetupPreset[] = [
  {
    id: "simple_local",
    title: "Simple local comp",
    summary: "Qualifier only",
    description: "Best for a straightforward local event with one qualifier stage and a simple day schedule.",
    bestFor: "Local youth days and small club comps.",
    includes: "One scoring stage and a simple awards finish.",
    typicalFlow: "Check-in -> qualifier waves -> results and awards.",
    details: "1 qualifier stage · guided local-day schedule",
  },
  {
    id: "qualifier_finals",
    title: "Qualifier + Finals",
    summary: "Most common format",
    description: "Use qualifiers during the day, then move the top climbers into finals with isolation and observation.",
    bestFor: "Most gyms running a full-day event.",
    includes: "Qualifier rankings, a finals cut, and finals workflow.",
    typicalFlow: "Qualifier waves -> reset -> isolation -> observation -> finals.",
    details: "Qualifier rankings · finals field · isolation + observation",
  },
  {
    id: "qualifier_semifinal_finals",
    title: "Qualifier + Semifinal + Finals",
    summary: "Large event structure",
    description: "Use this when you need a scored semifinal between qualifiers and finals.",
    bestFor: "Large marquee events with deeper fields.",
    includes: "Three scoring stages with an extra advancement cut.",
    typicalFlow: "Qualifier waves -> semifinal -> reset -> finals workflow.",
    details: "3 scoring stages · semifinal cutoff · finals workflow",
  },
];

const SETUP_WIZARD_STEPS = [
  {
    id: "basics",
    shortLabel: "Basics",
    title: "Event basics",
    description: "Name the event, confirm the slug, and set the key event details.",
  },
  {
    id: "categories",
    shortLabel: "Categories",
    title: "Categories",
    description: "Choose the age groups that can register and optionally advance to finals.",
  },
  {
    id: "presets",
    shortLabel: "Presets",
    title: "Event setup",
    description: "Start from a guided format template instead of building every round by hand.",
  },
  {
    id: "schedule",
    shortLabel: "Schedule",
    title: "Day schedule",
    description: "Map the event day into blocks, waves, and logistics windows.",
  },
  {
    id: "stages",
    shortLabel: "Stages",
    title: "Competition stages",
    description: "Fine-tune rounds, scoring buckets, problem counts, and advancement cutoffs.",
  },
] as const;

function getDefaultRoundIdForSchedulePhase(
  competition: Pick<Competition, "rounds">,
  phaseType: SchedulePhaseType,
  roundType?: CompetitionRoundType
) {
  if (roundType) {
    const exactRound = competition.rounds?.find((round) => round.round_type === roundType);
    if (exactRound) {
      return exactRound.id;
    }
  }

  if (phaseType === "qualifier_round") {
    return competition.rounds?.find((round) => round.scoring_bucket === "qualifier")?.id ?? null;
  }

  if (phaseType === "finals_round" || phaseType === "isolation" || phaseType === "observation") {
    return competition.rounds?.find((round) => round.scoring_bucket === "finals")?.id ?? null;
  }

  return null;
}

function createScheduleBlockFromTemplate(
  competition: Competition,
  template: ScheduleBlockTemplate,
  qualifierCategories: Competition["categories"],
  index: number
): CompetitionScheduleBlock {
  const linkedRoundId = getDefaultRoundIdForSchedulePhase(competition, template.phase_type, template.round_type);
  const eligibleCategoryIds =
    template.phase_type === "qualifier_round" || template.phase_type === "custom"
      ? template.eligible_age_groups?.length
        ? qualifierCategories
            .filter((category) => template.eligible_age_groups?.includes(category.age_group))
            .map((category) => category.id)
        : qualifierCategories.map((category) => category.id)
      : [];

  return {
    id: createScheduleBlockId(),
    competition_id: competition.id,
    round_id: linkedRoundId,
    sort_order: index,
    label: template.label,
    phase_type: template.phase_type,
    audience_label: template.audience_label,
    is_active: index === 0,
    start_time: "",
    end_time: "",
    capacity: template.capacity ?? competition.max_climbers,
    eligible_category_ids: eligibleCategoryIds,
  };
}

function buildGuidedQualifierSessionTemplates(competition: Competition): ScheduleBlockTemplate[] {
  const eligibleAgeGroups = QUALIFIER_TEMPLATE_AGE_GROUPS.filter((ageGroup) =>
    competition.qualifier_eligible_age_groups.includes(ageGroup)
  );

  if (eligibleAgeGroups.length) {
    return eligibleAgeGroups.map((ageGroup) => ({
      label: `${ageGroup} ${getRegistrationAssignmentLabel(competition)}`,
      phase_type: "qualifier_round" as const,
      round_type: "qualifier" as const,
      audience_label: ageGroup,
      capacity: competition.max_climbers,
      eligible_age_groups: [ageGroup],
    }));
  }

  const assignmentLabel = getRegistrationAssignmentLabel(competition);
  return formatUsesSelfScoredQualifiers(competition.format)
    ? [
        {
          label: `${assignmentLabel} 1`,
          phase_type: "qualifier_round" as const,
          round_type: "qualifier" as const,
          audience_label: "Scramble window",
          capacity: competition.max_climbers,
        },
        {
          label: `${assignmentLabel} 2`,
          phase_type: "qualifier_round" as const,
          round_type: "qualifier" as const,
          audience_label: "Scramble window",
          capacity: competition.max_climbers,
        },
      ]
    : [
        {
          label: `${assignmentLabel} A`,
          phase_type: "qualifier_round" as const,
          round_type: "qualifier" as const,
          audience_label: "Qualifier wave",
          capacity: competition.max_climbers,
        },
        {
          label: `${assignmentLabel} B`,
          phase_type: "qualifier_round" as const,
          round_type: "qualifier" as const,
          audience_label: "Qualifier wave",
          capacity: competition.max_climbers,
        },
      ];
}

export default function StaffDashboard({
  initialCompetitionSlug,
  initialCreateDraft,
  demoMode = false,
}: {
  initialCompetitionSlug?: string;
  initialCreateDraft?: StaffDashboardCreateDraft;
  demoMode?: boolean;
}) {
  const [allSummaries, setAllSummaries] = useState<CompetitionSummary[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState("");
  const [draft, setDraft] = useState<Competition | null>(null);
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [createName, setCreateName] = useState("");
  const [createFormat, setCreateFormat] = useState<Competition["format"]>("scramble");
  const [createHasFinals, setCreateHasFinals] = useState(true);
  const [createLocation, setCreateLocation] = useState("");
  const [createStartDate, setCreateStartDate] = useState("");
  const [createEndDate, setCreateEndDate] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createRegistrationOpensAt, setCreateRegistrationOpensAt] = useState<string | null>(null);
  const [createRegistrationClosesAt, setCreateRegistrationClosesAt] = useState<string | null>(null);
  const [createOfficialEventUrl, setCreateOfficialEventUrl] = useState("");
  const [createOfficialRegistrationUrl, setCreateOfficialRegistrationUrl] = useState("");
  const [createOfficialScheduleUrl, setCreateOfficialScheduleUrl] = useState("");
  const [createHeroImageUrl, setCreateHeroImageUrl] = useState("");
  const [createDisciplineLabel, setCreateDisciplineLabel] = useState("");
  const [isPhasePending, setIsPhasePending] = useState(false);
  const [phaseBlockMemory, setPhaseBlockMemory] = useState<Partial<Record<Competition["current_phase"], string>>>({});
  const [draggedScheduleBlockId, setDraggedScheduleBlockId] = useState<string | null>(null);
  const [mergeTargetBlockId, setMergeTargetBlockId] = useState<string | null>(null);
  const [roundPlanNeedsReset, setRoundPlanNeedsReset] = useState(false);
  const [showAdvancedStageSettings, setShowAdvancedStageSettings] = useState(false);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const [expandedScheduleBlockId, setExpandedScheduleBlockId] = useState<string | null>(null);
  const [currentSetupStep, setCurrentSetupStep] = useState(0);
  const [selectedGuidedSetupPresetId, setSelectedGuidedSetupPresetId] = useState<GuidedSetupPreset["id"] | null>(null);
  const [confirming, setConfirming] = useState<null | {
    title: string;
    description: string;
    confirmLabel: string;
    confirmTone?: "default" | "danger";
    expectedValue?: string;
    action: () => Promise<void>;
  }>(null);
  const [shareOrigin, setShareOrigin] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const summaries = await listCompetitionSummaries(true);
      setAllSummaries(summaries);
      setProfile(
        demoMode
          ? {
              id: "demo-dashboard",
              role: "admin",
              display_name: "Demo viewer",
            }
          : (await getAuthState()).profile
      );
      setSelectedCompetitionId((current) => {
        if (current && summaries.some((entry) => entry.competition.id === current)) {
          return current;
        }

        const initialMatch = initialCompetitionSlug
          ? summaries.find((entry) => entry.competition.slug === initialCompetitionSlug)
          : null;
        const preferredDemoSummary = demoMode
          ? summaries.find((entry) => isDemoDataSlug(entry.competition.slug)) ??
            summaries.find((entry) => entry.live_now) ??
            summaries[0]
          : null;
        return initialMatch?.competition.id ?? preferredDemoSummary?.competition.id ?? summaries[0]?.competition.id ?? "";
      });
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load the staff dashboard.");
    } finally {
      setLoading(false);
    }
  }, [demoMode, initialCompetitionSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleSummaries = useMemo(
    () => (demoMode ? allSummaries.filter((entry) => isDemoDataSlug(entry.competition.slug)) : allSummaries),
    [allSummaries, demoMode]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareOrigin(window.location.origin);
    }
  }, []);


  useEffect(() => {
    const importedName = sanitizeDraftText(initialCreateDraft?.name);
    const importedLocation = sanitizeDraftText(initialCreateDraft?.location);
    const importedStartDate = sanitizeDraftText(initialCreateDraft?.startDate);
    const importedEndDate = sanitizeDraftText(initialCreateDraft?.endDate);
    const importedDescription = sanitizeDraftText(initialCreateDraft?.description);
    const importedRegistrationOpensAt = sanitizeDraftNullable(initialCreateDraft?.registrationOpensAt);
    const importedRegistrationClosesAt = sanitizeDraftNullable(initialCreateDraft?.registrationClosesAt);
    const importedOfficialEventUrl = sanitizeExternalUrl(initialCreateDraft?.officialEventUrl);
    const importedOfficialRegistrationUrl = sanitizeExternalUrl(initialCreateDraft?.officialRegistrationUrl);
    const importedOfficialScheduleUrl = sanitizeExternalUrl(initialCreateDraft?.officialScheduleUrl);
    const importedHeroImageUrl = sanitizeExternalUrl(initialCreateDraft?.heroImageUrl);
    const importedDisciplineLabel = sanitizeDraftText(initialCreateDraft?.disciplineLabel);
    const importedFormat = sanitizeDraftText(initialCreateDraft?.format);

    if (
      !importedName &&
      !importedLocation &&
      !importedStartDate &&
      !importedEndDate &&
      !importedDescription &&
      !importedOfficialEventUrl &&
      !importedOfficialRegistrationUrl &&
      !importedOfficialScheduleUrl &&
      !importedHeroImageUrl &&
      !importedDisciplineLabel &&
      !importedFormat &&
      !importedRegistrationOpensAt &&
      !importedRegistrationClosesAt
    ) {
      return;
    }

    setCreateName(importedName);
    setCreateLocation(importedLocation);
    setCreateStartDate(importedStartDate);
    setCreateEndDate(importedEndDate);
    setCreateDescription(importedDescription);
    setCreateRegistrationOpensAt(importedRegistrationOpensAt);
    setCreateRegistrationClosesAt(importedRegistrationClosesAt);
    setCreateOfficialEventUrl(importedOfficialEventUrl);
    setCreateOfficialRegistrationUrl(importedOfficialRegistrationUrl);
    setCreateOfficialScheduleUrl(importedOfficialScheduleUrl);
    setCreateHeroImageUrl(importedHeroImageUrl);
    setCreateDisciplineLabel(importedDisciplineLabel);
    if (FORMAT_TEMPLATES.some((template) => template.value === importedFormat)) {
      setCreateFormat(importedFormat as Competition["format"]);
    }

    setMessage("Official event imported into the create form. Review it and create the competition when ready.");
  }, [initialCreateDraft]);

  const selectedSummary = useMemo(
    () => visibleSummaries.find((entry) => entry.competition.id === selectedCompetitionId) ?? null,
    [selectedCompetitionId, visibleSummaries]
  );
  useEffect(() => {
    setCurrentSetupStep(0);
    setSelectedGuidedSetupPresetId(null);
  }, [draft?.id]);

  const setupStepCompletion = useMemo(() => {
    if (!draft) {
      return SETUP_WIZARD_STEPS.map(() => false);
    }

    const draftRounds = draft.rounds ?? [];

    return [
      Boolean(draft.name.trim() && draft.slug.trim() && draft.location_name.trim()),
      draft.qualifier_eligible_age_groups.length > 0,
      draftRounds.length > 0,
      draft.schedule_blocks.length > 0,
      draftRounds.length > 0 &&
        draftRounds.every((round) => round.name.trim().length > 0 && round.problem_count > 0),
    ];
  }, [draft]);
  const setupProgressCount = setupStepCompletion.filter(Boolean).length;
  const setupProgressPercent = Math.round((setupProgressCount / SETUP_WIZARD_STEPS.length) * 100);
  const activeSetupStep = SETUP_WIZARD_STEPS[currentSetupStep] ?? SETUP_WIZARD_STEPS[0];
  const isFirstSetupStep = currentSetupStep === 0;
  const isLastSetupStep = currentSetupStep === SETUP_WIZARD_STEPS.length - 1;
  const selectedGuidedSetupPreset =
    GUIDED_SETUP_PRESETS.find((preset) => preset.id === selectedGuidedSetupPresetId) ?? null;
  const setupSectionAnchors = useMemo(
    () =>
      [
        { id: "setup-basics", label: "Basics", stepIndex: 0 },
        { id: "setup-categories", label: "Categories", stepIndex: 1 },
        { id: "setup-structure", label: "Structure", stepIndex: 2 },
        { id: "setup-schedule", label: "Schedule", stepIndex: 3 },
        { id: "setup-stages", label: "Stages", stepIndex: 4 },
        { id: "setup-operations", label: "Operations", stepIndex: null },
      ] as const,
    []
  );

  useEffect(() => {
    if (!selectedSummary) {
      setDraft(null);
      setSnapshot(null);
      setPhaseBlockMemory({});
      setRoundPlanNeedsReset(false);
      setExpandedRoundId(null);
      setExpandedScheduleBlockId(null);
      return;
    }

    setDraft(cloneCompetition(selectedSummary.competition));
    void getCompetitionSnapshot(selectedSummary.competition.id)
      .then((nextSnapshot) => setSnapshot(nextSnapshot))
      .catch(() => setSnapshot(null));
    setRoundPlanNeedsReset(false);
  }, [selectedSummary]);

  useEffect(() => {
    const draftBlocks = draft?.schedule_blocks ?? [];

    if (!draftBlocks.length) {
      setExpandedScheduleBlockId(null);
      return;
    }

    setExpandedScheduleBlockId((current) => {
      if (current && draftBlocks.some((block) => block.id === current)) {
        return current;
      }

      return draftBlocks.find((block) => block.is_active)?.id ?? draftBlocks[0]?.id ?? null;
    });
  }, [draft?.schedule_blocks]);

  useEffect(() => {
    const draftRounds = draft?.rounds ?? [];

    if (!draftRounds.length) {
      setExpandedRoundId(null);
      return;
    }

    setExpandedRoundId((current) => {
      if (current && draftRounds.some((round) => round.id === current)) {
        return current;
      }

      return draftRounds.find((round) => round.is_active)?.id ?? draftRounds[0]?.id ?? null;
    });
  }, [draft?.rounds]);

  const publicPath = draft ? buildCompetitionPath(draft.slug) : "";
  const registerPath = draft ? buildCompetitionPath(draft.slug, "register") : "";
  const leaderboardPath = draft ? buildCompetitionPath(draft.slug, "leaderboard") : "";
  const judgeUrl = draft ? buildStaffCompetitionPath(draft.slug, "judge") : "";
  const displayPath = draft ? buildDisplayPath(draft.slug) : "";
  const publicUrl = publicPath ? `${shareOrigin}${publicPath}` : "";
  const registerUrl = registerPath ? `${shareOrigin}${registerPath}` : "";
  const displayUrl = displayPath ? `${shareOrigin}${displayPath}` : "";
  const registrationQrUrl = `/api/qr?size=180&data=${encodeURIComponent(registerUrl || registerPath)}`;
  const printableRegistrationQrUrl = `/api/qr?size=720&data=${encodeURIComponent(registerUrl || registerPath)}`;
  const selectedCompetitionIsDemo = draft ? isDemoCompetitionRecord(draft) : false;
  const canEditPhase = profile?.role === "admin" && !selectedCompetitionIsDemo;
  const canEditSetup = profile?.role === "admin" && !selectedCompetitionIsDemo;
  const canRestoreDemo = profile?.role === "admin" && selectedCompetitionIsDemo && !demoMode;
  const liveScheduleBlock = draft?.schedule_blocks.find((block) => block.is_active) ?? null;
  const impliedCompetitionPhase = liveScheduleBlock
    ? getCompetitionPhaseForSchedulePhase(liveScheduleBlock.phase_type)
    : null;
  const orderedScheduleBlocks = useMemo(() => {
    if (!draft) {
      return [] as CompetitionScheduleBlock[];
    }

    return draft.schedule_blocks
      .map((block, index) => ({ block, index }))
      .sort((left, right) => {
        const startDiff =
          parseScheduleTimeToMinutes(left.block.start_time) - parseScheduleTimeToMinutes(right.block.start_time);
        if (startDiff !== 0) {
          return startDiff;
        }

        return left.index - right.index;
      })
      .map((entry) => entry.block);
  }, [draft]);
  const scheduleDrivenPhases = useMemo(
    () => (draft ? getCompetitionPhaseSequenceFromScheduleBlocks(draft.schedule_blocks) : []),
    [draft]
  );
  const navigationPhase = impliedCompetitionPhase ?? draft?.current_phase ?? null;
  const liveScheduleBlockIndex = liveScheduleBlock
    ? orderedScheduleBlocks.findIndex((block) => block.id === liveScheduleBlock.id)
    : -1;
  const previousScheduleBlock = liveScheduleBlockIndex > 0 ? orderedScheduleBlocks[liveScheduleBlockIndex - 1] : null;
  const nextScheduleBlock =
    liveScheduleBlockIndex >= 0 && liveScheduleBlockIndex < orderedScheduleBlocks.length - 1
      ? orderedScheduleBlocks[liveScheduleBlockIndex + 1]
      : null;
  const schedulePhaseIndex = navigationPhase ? scheduleDrivenPhases.indexOf(navigationPhase) : -1;
  const nextPhase =
    schedulePhaseIndex >= 0 && schedulePhaseIndex < scheduleDrivenPhases.length - 1
      ? scheduleDrivenPhases[schedulePhaseIndex + 1]
      : draft
        ? getNextCompetitionPhase(draft.current_phase)
        : null;
  const previousPhase =
    schedulePhaseIndex > 0
      ? scheduleDrivenPhases[schedulePhaseIndex - 1]
      : draft
        ? getPreviousCompetitionPhase(draft.current_phase)
        : null;
  const nextNavigationPhase =
    (nextScheduleBlock ? getCompetitionPhaseForSchedulePhase(nextScheduleBlock.phase_type) : null) ??
    nextPhase;
  const isEndEventTransition =
    nextNavigationPhase === "results" &&
    (navigationPhase === "observation" || navigationPhase === "finals_open" || navigationPhase === "finals_closed");
  const nextPhaseLabel = isEndEventTransition ? "End event" : "Next";
  const canGoPrevious = Boolean(previousScheduleBlock || previousPhase);
  const canGoNext = Boolean(nextScheduleBlock || nextPhase);
  const schedulePhaseMismatch = Boolean(
    draft && impliedCompetitionPhase && impliedCompetitionPhase !== draft.current_phase
  );
  const currentPhaseBlockLabel =
    draft && liveScheduleBlock && impliedCompetitionPhase === draft.current_phase
      ? liveScheduleBlock.label
      : null;
  const currentPhaseBlockTitle =
    draft?.current_phase === "qualifier_open" && liveScheduleBlock?.phase_type === "qualifier_round"
      ? "Qualifier wave"
      : "Current block";
  const canEditFinalsOrder = navigationPhase === "observation";
  const finalsAdvanceBlock = useMemo(() => {
    const isFinalsAdvanceBlock = (block: CompetitionScheduleBlock) => {
      const phase = getCompetitionPhaseForSchedulePhase(block.phase_type);
      return phase === "observation" || phase === "finals_open";
    };

    const candidateBlocks = orderedScheduleBlocks.filter(isFinalsAdvanceBlock);
    if (!candidateBlocks.length) {
      return null;
    }

    if (!liveScheduleBlock) {
      return candidateBlocks[0];
    }

    const liveIndex = orderedScheduleBlocks.findIndex((block) => block.id === liveScheduleBlock.id);
    if (liveIndex < 0) {
      return candidateBlocks[0];
    }

    return orderedScheduleBlocks.slice(liveIndex + 1).find(isFinalsAdvanceBlock) ?? candidateBlocks[0];
  }, [liveScheduleBlock, orderedScheduleBlocks]);
  const finalsAdvancePhase =
    (finalsAdvanceBlock ? getCompetitionPhaseForSchedulePhase(finalsAdvanceBlock.phase_type) : null) ?? "finals_open";
  const finalsOrder = useMemo(
    () => [...(snapshot?.finalists ?? [])].sort((left, right) => (left.climbing_order ?? 0) - (right.climbing_order ?? 0)),
    [snapshot]
  );
  const scheduleTemplates = useMemo(() => (draft ? buildScheduleBlockTemplates(draft) : []), [draft]);
  const groupedScheduleTemplates = useMemo<ScheduleTemplateGroup[]>(() => {
    const arrivalTemplates = scheduleTemplates.filter((template) =>
      ["check_in", "technical_meeting"].includes(template.phase_type)
    );
    const categoryWaveTemplates = scheduleTemplates.filter(
      (template) =>
        template.phase_type === "qualifier_round" &&
        (template.eligible_age_groups?.length ?? 0) > 0
    );
    const genericWaveTemplates = scheduleTemplates.filter(
      (template) =>
        template.phase_type === "qualifier_round" &&
        (template.eligible_age_groups?.length ?? 0) === 0
    );
    const finalsTemplates = scheduleTemplates.filter((template) =>
      ["isolation", "observation", "finals_round"].includes(template.phase_type)
    );
    const closingTemplates = scheduleTemplates.filter((template) =>
      ["wall_reset", "results"].includes(template.phase_type)
    );

    return [
      {
        title: "Arrival",
        description: "Use these for athlete check-in and the pre-climb briefing.",
        templates: arrivalTemplates,
      },
      {
        title: "Qualifier Waves",
        description:
          "Choose one wave style: use generic sessions for simple time slots, or category sessions when each age group gets its own wave.",
        templates: [...genericWaveTemplates, ...categoryWaveTemplates],
      },
      {
        title: "Finals Flow",
        description: "Add these only if your event has finals and you need isolation, observation, or a finals block.",
        templates: finalsTemplates,
      },
      {
        title: "Closing",
        description: "Use these for resets, score verification, results, or awards at the end of the day.",
        templates: closingTemplates,
      },
    ].filter((group) => group.templates.length > 0);
  }, [scheduleTemplates]);
  const orderedDraftScheduleBlocks = useMemo(
    () => (draft ? [...draft.schedule_blocks].sort(compareScheduleBlocks) : []),
    [draft]
  );
  const qualifierCategories = useMemo(
    () =>
      draft?.categories.filter((category) => isQualifierEligibleCategory(draft, category.age_group)) ?? [],
    [draft]
  );
  const roundPlanTemplate = useMemo(
    () =>
      draft
        ? buildRoundPlanTemplate({
            id: draft.id,
            format: draft.format,
            has_finals: draft.has_finals,
            total_climbs: draft.total_climbs,
            qualifier_counting_climbs: draft.qualifier_counting_climbs,
            finals_cutoff: draft.finals_cutoff,
            finals_problem_count: draft.finals_problem_count,
          })
        : [],
    [draft]
  );
  const roundPlanCustomized = useMemo(() => {
    if (!draft) {
      return false;
    }

    return summarizeRoundPlan(draft.rounds ?? []) !== summarizeRoundPlan(roundPlanTemplate);
  }, [draft, roundPlanTemplate]);
  const finalsScoreRoundCount = useMemo(
    () => draft?.rounds?.filter((round) => round.scoring_bucket === "finals").length ?? 0,
    [draft]
  );

  useEffect(() => {
    if (!draft?.id) {
      return;
    }

    if (!liveScheduleBlock || !impliedCompetitionPhase) {
      return;
    }

    setPhaseBlockMemory((current) =>
      current[impliedCompetitionPhase] === liveScheduleBlock.id
        ? current
        : {
            ...current,
            [impliedCompetitionPhase]: liveScheduleBlock.id,
          }
    );
  }, [draft?.id, impliedCompetitionPhase, liveScheduleBlock]);

  const refreshSelectedSnapshot = async (competitionId: string) => {
    const nextSnapshot = await getCompetitionSnapshot(competitionId);
    setSnapshot(nextSnapshot);
  };

  const refreshAfterChange = async (competitionId?: string) => {
    await load();
    if (competitionId) {
      await refreshSelectedSnapshot(competitionId);
    }
  };

  const runPhaseChange = async (competitionId: string, nextPhaseValue: Competition["current_phase"], successMessage: string) => {
    setError("");
    setMessage("");
    setIsPhasePending(true);

    try {
      await setCompetitionPhase(competitionId, nextPhaseValue);
      await refreshAfterChange(competitionId);
      setMessage(successMessage);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to change competition phase.");
    } finally {
      setIsPhasePending(false);
    }
  };

  const findScheduleBlockForPhase = (targetPhase: Competition["current_phase"], direction: -1 | 1) => {
    const rememberedBlockId = phaseBlockMemory[targetPhase];
    if (rememberedBlockId) {
      const rememberedBlock = orderedScheduleBlocks.find((block) => block.id === rememberedBlockId);
      if (rememberedBlock && getCompetitionPhaseForSchedulePhase(rememberedBlock.phase_type) === targetPhase) {
        return rememberedBlock;
      }
    }

    const matches = orderedScheduleBlocks.filter(
      (block) => getCompetitionPhaseForSchedulePhase(block.phase_type) === targetPhase
    );

    if (!matches.length) {
      return null;
    }

    if (!liveScheduleBlock) {
      return direction === -1 ? matches[matches.length - 1] : matches[0];
    }

    const currentIndex = orderedScheduleBlocks.findIndex((block) => block.id === liveScheduleBlock.id);
    if (currentIndex < 0) {
      return direction === -1 ? matches[matches.length - 1] : matches[0];
    }

    if (direction === 1) {
      return (
        orderedScheduleBlocks
          .slice(currentIndex + 1)
          .find((block) => getCompetitionPhaseForSchedulePhase(block.phase_type) === targetPhase) ?? matches[0]
      );
    }

    return (
      [...orderedScheduleBlocks.slice(0, currentIndex)]
        .reverse()
        .find((block) => getCompetitionPhaseForSchedulePhase(block.phase_type) === targetPhase) ??
      matches[matches.length - 1]
    );
  };

  const runPhaseNavigation = async (
    competitionId: string,
    nextPhaseValue: Competition["current_phase"],
    direction: -1 | 1,
    successMessage: string,
    targetBlockId?: string
  ) => {
    setError("");
    setMessage("");
    setIsPhasePending(true);

    try {
      const currentPhaseForMemory = impliedCompetitionPhase ?? draft?.current_phase ?? null;
      if (currentPhaseForMemory && liveScheduleBlock) {
        setPhaseBlockMemory((current) => ({
          ...current,
          [currentPhaseForMemory]: liveScheduleBlock.id,
        }));
      }

      const currentPhaseValue = draft?.current_phase ?? null;
      if (currentPhaseValue !== nextPhaseValue) {
        await setCompetitionPhase(competitionId, nextPhaseValue);
      }

      const targetBlock =
        (targetBlockId ? orderedScheduleBlocks.find((block) => block.id === targetBlockId) ?? null : null) ??
        findScheduleBlockForPhase(nextPhaseValue, direction);
      if (targetBlock) {
        await setCompetitionLiveScheduleBlock(competitionId, targetBlock.id);
        setPhaseBlockMemory((current) => ({
          ...current,
          [nextPhaseValue]: targetBlock.id,
        }));
      }

      await refreshAfterChange(competitionId);
      setMessage(successMessage);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to change competition phase.");
    } finally {
      setIsPhasePending(false);
    }
  };

  const advanceToFinals = async () => {
    if (!draft || !snapshot) {
      return;
    }

    if (!competitionHasFinals(draft)) {
      throw new Error("Finals are disabled for this competition.");
    }

    if (!snapshot.finalists.length) {
      throw new Error("No finalists are available yet. Close qualifier scoring or check the configured finals age groups and cutoff.");
    }

    const orderedFinalists = [...snapshot.finalists].sort((left, right) => {
      const leftOrder = left.climbing_order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.climbing_order ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      if (left.qualifier_rank !== right.qualifier_rank) {
        return left.qualifier_rank - right.qualifier_rank;
      }

      return left.name.localeCompare(right.name);
    });

    await saveFinalistField(draft.id, orderedFinalists);
    await runPhaseNavigation(
      draft.id,
      finalsAdvancePhase,
      1,
      finalsAdvanceBlock
        ? `Finals field created and live block moved to ${finalsAdvanceBlock.label}.`
        : `Finals field created and competition moved to ${formatCompetitionPhaseLabel(finalsAdvancePhase).toLowerCase()}.`,
      finalsAdvanceBlock?.id
    );
  };

  const persistDraft = () => {
    if (!draft) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await saveCompetitionConfig(draft.id, {
            ...draft,
            schedule_blocks: draft.schedule_blocks,
            rounds: draft.rounds ?? [],
          });
          await refreshAfterChange(draft.id);
          setMessage("Competition saved.");
          setRoundPlanNeedsReset(false);
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : "Unable to save the competition.");
        }
      })();
    });
  };

  const restoreDemoCompetition = async () => {
    setError("");
    setMessage("");

    const response = await fetch("/api/demo/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          demo?: {
            competitionId: string;
          };
        }
      | null;

    if (!response.ok || !payload?.demo?.competitionId) {
      throw new Error(payload?.error || "Unable to restore the seeded demo competition.");
    }

    await load();
    setSelectedCompetitionId(payload.demo.competitionId);
    await refreshSelectedSnapshot(payload.demo.competitionId);
    setMessage("Demo competition restored to the seeded walkthrough state.");
  };

  const updateRounds = (updater: (rounds: CompetitionRound[]) => CompetitionRound[]) => {
    if (!draft) {
      return;
    }

    const nextRounds = updater([...(draft.rounds ?? [])]).map((round, index) => ({
      ...round,
      round_number: index + 1,
      sort_order: index + 1,
      competition_id: draft.id,
    }));

    setDraft({
      ...draft,
      rounds: nextRounds,
      has_finals: nextRounds.some((round) => round.scoring_bucket === "finals"),
    });
  };

  const replaceRoundPlanFromTemplate = (nextFormat?: Competition["format"]) => {
    if (!draft) {
      return;
    }

    const nextDraft = {
      ...draft,
      format: nextFormat ?? draft.format,
      has_finals: nextFormat ? (competitionAllowsOptionalFinals(nextFormat) ? draft.has_finals : true) : draft.has_finals,
      total_climbs: nextFormat ? getRecommendedQualifierClimbCount(nextFormat) : draft.total_climbs,
      qualifier_counting_climbs: nextFormat ? getRecommendedQualifierCountingClimbs(nextFormat) : draft.qualifier_counting_climbs,
      finals_cutoff: nextFormat ? getRecommendedFinalsCutoff(nextFormat) : draft.finals_cutoff,
    };
    const nextRounds = buildRoundPlanTemplate(nextDraft);
    setDraft({
      ...nextDraft,
      rounds: nextRounds,
      schedule_blocks: draft.schedule_blocks.map((block) => {
        const linkedRound =
          block.phase_type === "qualifier_round"
            ? nextRounds.find((round) => round.scoring_bucket === "qualifier")
            : block.phase_type === "finals_round" || block.phase_type === "isolation" || block.phase_type === "observation"
              ? nextRounds.find((round) => round.scoring_bucket === "finals")
              : null;
        return {
          ...block,
          round_id: linkedRound?.id ?? null,
        };
      }),
    });
    setRoundPlanNeedsReset(false);
  };

  const addRound = (roundType: CompetitionRoundType) => {
    if (!draft) {
      return;
    }

    updateRounds((current) => {
      const nextRound = createRoundTemplate(draft, roundType, current.length + 1);
      if (roundType === "finals" && current.some((round) => round.scoring_bucket === "finals")) {
        nextRound.scoring_bucket = "none";
      }
      if (roundType === "finals") {
        nextRound.advancement_source_round_id =
          current.find((round) => round.scoring_bucket === "qualifier")?.id ?? current[0]?.id ?? null;
      }

      return [...current, nextRound];
    });
  };

  const updateRound = (roundId: string, updater: (round: CompetitionRound) => CompetitionRound) => {
    updateRounds((current) => current.map((round) => (round.id === roundId ? updater(round) : round)));
  };

  const removeRound = (roundId: string) => {
    if (!draft) {
      return;
    }

    updateRounds((current) =>
      current
        .filter((round) => round.id !== roundId)
        .map((round) => ({
          ...round,
          advancement_source_round_id: round.advancement_source_round_id === roundId ? null : round.advancement_source_round_id,
        }))
    );
    setDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            schedule_blocks: currentDraft.schedule_blocks.map((block) => ({
              ...block,
              round_id: block.round_id === roundId ? null : block.round_id,
            })),
          }
        : currentDraft
    );
  };

  const moveFinalist = async (index: number, direction: -1 | 1) => {
    if (!draft || navigationPhase !== "observation") {
      return;
    }

    const next = [...finalsOrder];
    const target = index + direction;
    if (target < 0 || target >= next.length) {
      return;
    }

    [next[index], next[target]] = [next[target], next[index]];
    if (snapshot?.finalistsPersisted) {
      await updateFinalistClimbingOrder(draft.id, next.map((entry) => entry.climber_id));
    } else {
      await saveFinalistField(draft.id, next);
    }
    await refreshSelectedSnapshot(draft.id);
    setMessage("Finals climbing order updated.");
  };

  const updateScheduleBlock = (blockId: string, updater: (block: CompetitionScheduleBlock) => CompetitionScheduleBlock) => {
    if (!draft) {
      return;
    }

    setDraft({
      ...draft,
      schedule_blocks: draft.schedule_blocks.map((block) => (block.id === blockId ? updater(block) : block)),
    });
  };

  const addScheduleBlockFromTemplate = (template: ScheduleBlockTemplate) => {
    if (!draft) {
      return;
    }

    setDraft({
      ...draft,
      schedule_blocks: reindexScheduleBlocks([
        ...draft.schedule_blocks,
        createScheduleBlockFromTemplate(draft, template, qualifierCategories, draft.schedule_blocks.length),
      ]),
    });
  };

  const insertScheduleBlockFromTemplate = (
    template: ScheduleBlockTemplate,
    targetIndex: number,
    position: "above" | "below"
  ) => {
    if (!draft) {
      return;
    }

    const insertionIndex = position === "above" ? targetIndex : targetIndex + 1;
    const nextBlock = createScheduleBlockFromTemplate(
      draft,
      template,
      qualifierCategories,
      Math.max(0, Math.min(insertionIndex, draft.schedule_blocks.length))
    );
    const nextBlocks = [...orderedDraftScheduleBlocks];
    nextBlocks.splice(insertionIndex, 0, nextBlock);
    setDraft({
      ...draft,
      schedule_blocks: reindexScheduleBlocks(nextBlocks),
    });
    setExpandedScheduleBlockId(nextBlock.id);
  };

  const removeScheduleBlock = (blockId: string) => {
    if (!draft) {
      return;
    }

    const remainingBlocks = draft.schedule_blocks.filter((block) => block.id !== blockId);
    setDraft({
      ...draft,
      schedule_blocks: reindexScheduleBlocks(remainingBlocks).map((block, index) =>
        index === 0 && !remainingBlocks.some((entry) => entry.is_active)
          ? { ...block, is_active: true }
          : block
      ),
    });
  };

  const moveScheduleBlock = (blockId: string, direction: -1 | 1) => {
    if (!draft) {
      return;
    }

    const orderedBlocks = [...draft.schedule_blocks].sort(compareScheduleBlocks);
    const currentIndex = orderedBlocks.findIndex((block) => block.id === blockId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedBlocks.length) {
      return;
    }

    [orderedBlocks[currentIndex], orderedBlocks[targetIndex]] = [orderedBlocks[targetIndex], orderedBlocks[currentIndex]];
    setDraft({
      ...draft,
      schedule_blocks: reindexScheduleBlocks(orderedBlocks),
    });
  };

  const toggleScheduleBlockCategory = (blockId: string, categoryId: string) => {
    if (!draft) {
      return;
    }

    updateScheduleBlock(blockId, (block) => ({
      ...block,
      eligible_category_ids: block.eligible_category_ids.includes(categoryId)
        ? block.eligible_category_ids.filter((entry) => entry !== categoryId)
        : [...block.eligible_category_ids, categoryId],
    }));
  };

  const canMergeWaveBlock = useCallback((block: CompetitionScheduleBlock) => {
    return block.phase_type === "qualifier_round" && block.eligible_category_ids.length > 0;
  }, []);

  const applyGuidedSetupPreset = (presetId: GuidedSetupPreset["id"]) => {
    if (!draft) {
      return;
    }

    const baseCompetition = {
      ...draft,
      has_finals: presetId !== "simple_local",
    };

    const rounds =
      presetId === "simple_local"
        ? [createRoundTemplate(baseCompetition, "qualifier", 1)]
        : presetId === "qualifier_semifinal_finals"
          ? (() => {
              const qualifierRound = createRoundTemplate(baseCompetition, "qualifier", 1);
              const semifinalRound = createRoundTemplate(baseCompetition, "semifinal", 2);
              semifinalRound.name = "Semifinal";
              semifinalRound.problem_count = Math.min(
                Math.max(4, Math.min(baseCompetition.total_climbs, 6)),
                baseCompetition.total_climbs
              );
              semifinalRound.counting_climbs = semifinalRound.problem_count;
              const finalsRound = createRoundTemplate(baseCompetition, "finals", 3);
              finalsRound.advancement_source_round_id = semifinalRound.id;
              return [qualifierRound, semifinalRound, finalsRound];
            })()
          : buildRoundPlanTemplate(baseCompetition);

    const nextCompetition = normalizeCompetition(
      {
        ...baseCompetition,
        rounds,
      },
      baseCompetition.categories,
      [],
      rounds
    );

    const qualifierSessionTemplates = buildGuidedQualifierSessionTemplates(nextCompetition);

    const scheduleTemplates: ScheduleBlockTemplate[] = [
      {
        label: "Check-in",
        phase_type: "check_in",
        audience_label: formatUsesSelfScoredQualifiers(nextCompetition.format) ? "All climbers" : "All athletes",
        capacity: nextCompetition.max_climbers,
      },
      ...qualifierSessionTemplates,
      ...(presetId === "qualifier_semifinal_finals"
        ? [
            {
              label: "Semifinal Session",
              phase_type: "qualifier_round" as const,
              round_type: "semifinal" as const,
              audience_label: "Semifinalists",
              capacity: nextCompetition.max_climbers,
            },
          ]
        : []),
      ...(presetId !== "simple_local"
        ? [
            {
              label: "Wall reset",
              phase_type: "wall_reset" as const,
              audience_label: "Routesetting",
              capacity: nextCompetition.max_climbers,
            },
            {
              label: "Isolation",
              phase_type: "isolation" as const,
              round_type: "finals" as const,
              audience_label: "Finalists",
              capacity: nextCompetition.max_climbers,
            },
            {
              label: "Observation",
              phase_type: "observation" as const,
              round_type: "finals" as const,
              audience_label: "Finalists",
              capacity: nextCompetition.max_climbers,
            },
            {
              label: "Finals",
              phase_type: "finals_round" as const,
              round_type: "finals" as const,
              audience_label: "Finalists",
              capacity: nextCompetition.max_climbers,
            },
          ]
        : []),
      {
        label: "Results / Awards",
        phase_type: "results",
        audience_label: formatUsesSelfScoredQualifiers(nextCompetition.format) ? "All climbers" : "All athletes",
        capacity: nextCompetition.max_climbers,
      },
    ];

    const scheduleBlocks = reindexScheduleBlocks(
      scheduleTemplates.map((template, index) =>
        createScheduleBlockFromTemplate(nextCompetition, template, qualifierCategories, index)
      )
    );

    setDraft({
      ...nextCompetition,
      rounds,
      schedule_blocks: scheduleBlocks,
      has_finals: presetId !== "simple_local",
    });
    setSelectedGuidedSetupPresetId(presetId);
    setRoundPlanNeedsReset(false);
    setMessage(`Guided setup applied: ${GUIDED_SETUP_PRESETS.find((preset) => preset.id === presetId)?.title}.`);
  };

  const mergeScheduleBlocks = (sourceBlockId: string, targetBlockId: string) => {
    if (!draft || sourceBlockId === targetBlockId) {
      return;
    }

    const sourceBlock = draft.schedule_blocks.find((block) => block.id === sourceBlockId);
    const targetBlock = draft.schedule_blocks.find((block) => block.id === targetBlockId);

    if (!sourceBlock || !targetBlock || !canMergeWaveBlock(sourceBlock) || !canMergeWaveBlock(targetBlock)) {
      return;
    }

    const mergedEligibleCategoryIds = Array.from(
      new Set([...targetBlock.eligible_category_ids, ...sourceBlock.eligible_category_ids])
    );
    const mergedAgeGroups = getWaveAgeGroupsFromCategoryIds(mergedEligibleCategoryIds, qualifierCategories);

    if (!mergedAgeGroups.length) {
      return;
    }

    setDraft({
      ...draft,
      schedule_blocks: reindexScheduleBlocks(
        draft.schedule_blocks
          .filter((block) => block.id !== sourceBlockId)
          .map((block) =>
          block.id === targetBlockId
            ? {
                ...block,
                label: getCompactWaveLabel(mergedAgeGroups, draft),
                audience_label: getWaveAudienceLabel(mergedAgeGroups),
                eligible_category_ids: mergedEligibleCategoryIds,
                is_active: block.is_active || sourceBlock.is_active,
                capacity: Math.max(block.capacity, sourceBlock.capacity),
              }
            : block
          )
      ),
    });
    setDraggedScheduleBlockId(null);
    setMergeTargetBlockId(null);
  };

  const setActiveScheduleBlock = (blockId: string) => {
    if (!draft) {
      return;
    }

    setDraft({
      ...draft,
      schedule_blocks: draft.schedule_blocks.map((block) => ({
        ...block,
        is_active: block.id === blockId,
      })),
    });
  };

  const liveBlockRollsBackPhase = Boolean(
    schedulePhaseMismatch &&
      draft &&
      impliedCompetitionPhase &&
      compareCompetitionPhases(impliedCompetitionPhase, draft.current_phase) < 0
  );
  const draftHasFinals = draft ? competitionHasFinals(draft) : false;
  const draftSupportsOptionalFinals = draft ? competitionAllowsOptionalFinals(draft.format) : false;
  const canDisableFinals = draft ? isQualifierStage(draft) || draft.current_phase === "results" : false;
  const currentPhaseScheduleBlock = draft ? findScheduleBlockForPhase(draft.current_phase, 1) : null;
  const canAdvanceToFinals = draft
    ? draftHasFinals &&
      ["qualifier_open", "qualifier_closed", "wall_reset"].includes(draft.current_phase) &&
      Boolean(snapshot?.finalists.length)
    : false;
  const demoBanner = demoMode
    ? "You're viewing a sample event walkthrough. Editing and staff-only actions stay protected in the public demo."
    : selectedCompetitionIsDemo
      ? "This shared demo event allows score submission only. Restore it anytime to return to the seeded walkthrough state."
    : "";
  const demoDataExportAllowed = demoMode && isDemoDataSlug(draft?.slug);
  const currentCompetitionStages = useMemo(() => draft?.rounds ?? [], [draft?.rounds]);
  const qualifierStage = currentCompetitionStages.find((round) => round.scoring_bucket === "qualifier") ?? null;
  const finalsStage = currentCompetitionStages.find((round) => round.scoring_bucket === "finals") ?? null;
  const linkedScheduleBlockCount = orderedDraftScheduleBlocks.filter((block) => Boolean(block.round_id)).length;
  const setupStepSummaries = useMemo(() => {
    if (!draft) {
      return [] as string[];
    }

    return [
      setupStepCompletion[0]
        ? `${draft.name || "Event"} in ${draft.location_name || "your venue"} is ready.`
        : "Add the event name, slug, and venue.",
      setupStepCompletion[1]
        ? `${draft.qualifier_eligible_age_groups.length} qualifier groups selected.`
        : "Choose the age groups that can register.",
      selectedGuidedSetupPreset
        ? `${selectedGuidedSetupPreset.title} applied.`
        : "Choose a structure template or continue with your current rounds.",
      orderedDraftScheduleBlocks.length
        ? `${orderedDraftScheduleBlocks.length} schedule blocks planned.`
        : "Add schedule blocks for the event day.",
      currentCompetitionStages.length
        ? `${currentCompetitionStages.length} stage${currentCompetitionStages.length === 1 ? "" : "s"} configured.`
        : "Define at least one scoring stage.",
    ];
  }, [currentCompetitionStages.length, draft, orderedDraftScheduleBlocks.length, selectedGuidedSetupPreset, setupStepCompletion]);
  const wizardGuardrails = useMemo(() => {
    if (!draft) {
      return [] as { label: string; ok: boolean }[];
    }

    return [
      { label: "Qualifier categories selected", ok: draft.qualifier_eligible_age_groups.length > 0 },
      { label: "Schedule blocks added", ok: orderedDraftScheduleBlocks.length > 0 },
      { label: "Scoring blocks linked to a stage", ok: linkedScheduleBlockCount > 0 },
      { label: "Finals has a usable scoring stage", ok: !draftHasFinals || Boolean(finalsStage) },
    ];
  }, [draft, draftHasFinals, finalsStage, linkedScheduleBlockCount, orderedDraftScheduleBlocks.length]);
  const readyToSaveChecklist = useMemo(() => {
    if (!draft) {
      return [] as { label: string; ok: boolean }[];
    }

    return [
      { label: "Event details filled", ok: Boolean(draft.name.trim() && draft.slug.trim() && draft.location_name.trim()) },
      { label: "Categories selected", ok: draft.qualifier_eligible_age_groups.length > 0 },
      { label: "Schedule exists", ok: orderedDraftScheduleBlocks.length > 0 },
      { label: "At least one scoring stage exists", ok: currentCompetitionStages.some((round) => round.scoring_bucket !== "none") },
    ];
  }, [currentCompetitionStages, draft, orderedDraftScheduleBlocks.length]);
  const stageFlowSummary = currentCompetitionStages.length
    ? currentCompetitionStages.map((round) => getRoundLabel(round.round_type, 0)).join(" -> ")
    : "No stage flow yet";
  const demoTourCards: DemoTourCard[] = draft
    ? [
        {
          title: "Organizer setup",
          description: "Review how staff configure categories, day schedule, and competition stages.",
          href: "#demo-organizer-setup",
          actionLabel: "See organizer setup",
        },
        {
          title: "Judge scoring",
          description: "Scoring stays protected on staff-only routes, ready for a live event walkthrough after sign-in.",
          href: "/staff/login",
          actionLabel: "Open staff sign-in",
        },
        {
          title: "Public leaderboard",
          description: "Preview the climber-facing rankings and display experience for this sample event.",
          href: leaderboardPath,
          actionLabel: "Open public leaderboard",
        },
      ]
    : [];
  const downloadRegistrationQr = async () => {
    if (!draft) {
      return;
    }

    try {
      const response = await fetch(printableRegistrationQrUrl);
      if (!response.ok) {
        throw new Error("Unable to download the registration QR code.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${draft.slug}-registration-qr.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to download the registration QR code.");
    }
  };
  const printRegistrationQr = async () => {
    if (!draft) {
      return;
    }

    try {
      const response = await fetch(printableRegistrationQrUrl);
      if (!response.ok) {
        throw new Error("Unable to prepare the registration QR code for printing.");
      }

      const blob = await response.blob();
      const qrDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
            return;
          }

          reject(new Error("Unable to prepare the registration QR code for printing."));
        };
        reader.onerror = () => reject(new Error("Unable to prepare the registration QR code for printing."));
        reader.readAsDataURL(blob);
      });

    const printWindow = window.open("", "_blank", "width=720,height=960");
    if (!printWindow) {
      setError("Unable to open the print window for the registration QR code.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${draft.name} registration QR</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 32px;
              color: #0f172a;
              text-align: center;
            }
            img {
              width: 280px;
              height: 280px;
              margin: 24px auto;
              display: block;
            }
            .url {
              word-break: break-word;
              color: #475569;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <h1>${draft.name}</h1>
          <p>Scan this QR code to open the competition registration page.</p>
          <img src="${qrDataUrl}" alt="Competition registration QR code" onload="window.focus(); window.print();" />
          <p class="url">${registerUrl || registerPath}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to prepare the registration QR code for printing."
      );
    }
  };

  if (loading && !draft) {
    return (
      <main className="results-page">
        <div className="content-frame">
          <section className="results-card text-slate-600">Loading staff dashboard...</section>
        </div>
      </main>
    );
  }

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader
          light
          status={
            <div className="flex flex-wrap items-center gap-2">
              <div className="results-chip">{demoMode ? "demo" : profile?.role ?? "staff"}</div>
              {demoMode ? (
                <Link href="/staff/login" className="results-secondary-button">
                  Staff sign in
                </Link>
              ) : (
                <button type="button" onClick={() => void signOutUser().then(() => (window.location.href = "/staff/login"))} className="results-secondary-button">
                  Sign out
                </button>
              )}
            </div>
          }
        />
        {draft?.slug && !demoMode ? <StaffCompetitionSubnav competitionSlug={draft.slug} /> : null}

        {error ? <div className="results-alert results-alert-error">{error}</div> : null}
        {message ? <div className="results-alert results-alert-success">{message}</div> : null}
        {demoMode && draft ? (
          <DemoExperience
            enabled
            routeId="organizer"
            competitionSlug={draft.slug}
            bannerTitle="Organizer demo dashboard"
            bannerDescription="This is the control room for the sample event. It shows how staff configure the competition, publish public links, and keep event-day operations tied to one shared event model."
            bannerTip="Start your walkthrough here, then open the judge panel to show the live scoring workflow."
          />
        ) : null}
        {demoMode ? <div className="results-alert">{demoBanner}</div> : null}
        {!demoMode && profile?.role === "judge" ? (
          <div className="results-alert">
            You can review event setup here, but only admins can create events or edit round and schedule configuration.
          </div>
        ) : null}

        {demoMode ? (
          <section className="results-card overflow-hidden">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
              <div>
                <div className="results-kicker">Demo dashboard</div>
                <h1 className="results-editorial-title mt-3 max-w-4xl text-4xl font-semibold text-slate-950 sm:text-6xl">
                  Run a climbing competition from setup to live results in one place.
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                  Explore a sample event to see how staff set up sessions, judges record scores, and climbers follow live rankings and finals from public pages.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a href="#demo-organizer-setup" className="results-primary-button">
                    See organizer setup
                  </a>
                  {leaderboardPath ? (
                    <Link href={leaderboardPath} className="results-secondary-button">
                      See public leaderboard
                    </Link>
                  ) : null}
                  {displayPath ? (
                    <Link href={displayPath} className="results-secondary-button">
                      See public display
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="results-feature-card">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Sample event
                </div>
                <div className="mt-3 text-2xl font-semibold text-slate-950">
                  {draft?.name ?? "Loading sample event"}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="results-chip">{selectedSummary?.climber_count ?? 0} climbers</span>
                  <span className="results-chip">{draft?.categories.length ?? 0} categories</span>
                  <span className="results-chip">{draft?.schedule_blocks.length ?? 0} schedule blocks</span>
                  <span className="results-chip">{currentCompetitionStages.length} stages</span>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <div>{draft?.location_name || "Location TBD"}</div>
                  <div>{draft?.discipline_label || "Bouldering"}</div>
                  <div>
                    {draft
                      ? `${formatCompetitionPhaseLabel(draft.current_phase)}${currentCompetitionStages.some((round) => round.round_type === "semifinal") ? " with semifinals in the sample flow." : " with a full public results flow."}`
                      : "Sample flow loading."}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {demoMode ? (
          <section className="results-card">
            <div className="results-kicker">How comp day works</div>
            <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              This is the lifecycle gyms care about: plan the event once, run the day confidently, and keep climbers informed live.
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {DEMO_FLOW_STEPS.map((step) => (
                <div key={step.title} className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{step.title}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">{step.description}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {demoMode && demoTourCards.length ? (
          <section className="results-card">
            <div className="results-kicker">Explore the product</div>
            <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Start with the organizer workflow, then jump into the live and public surfaces that make comp day easier for staff and climbers.
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {demoTourCards.map((card) => (
                <div key={card.title} className="rounded-[1.6rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{card.title}</div>
                  <div className="mt-3 text-base leading-7 text-slate-700">{card.description}</div>
                  {card.href.startsWith("#") ? (
                    <a href={card.href} className="results-secondary-button mt-5 inline-flex">
                      {card.actionLabel}
                    </a>
                  ) : (
                    <Link href={card.href} className="results-secondary-button mt-5 inline-flex">
                      {card.actionLabel}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="results-card">
            {demoMode ? (
              <>
                <div className="results-kicker">Demo walkthrough</div>
                <h1 className="results-editorial-title mt-2 text-4xl font-semibold text-slate-950 sm:text-5xl">
                  Explore a sample gym event.
                </h1>
                <div className="results-hero-subline">
                  The real dashboard stays underneath, but this demo focuses on how organizers plan the event, how staff run the day, and how climbers see results.
                </div>
                <div className="mt-5 rounded-[1.6rem] border border-slate-200 bg-slate-50 px-5 py-5">
                  <div className="results-kicker">What this replaces</div>
                  <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                    {DEMO_REPLACES_POINTS.map((point) => (
                      <div key={point} className="flex items-start gap-3">
                        <span className="mt-2 h-2 w-2 rounded-full bg-sky-500" aria-hidden="true" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="results-kicker">Create event</div>
                <h1 className="results-editorial-title mt-2 text-4xl font-semibold text-slate-950 sm:text-5xl">
                  Set up a competition.
                </h1>
                <div className="results-hero-subline">
                  Start a new event, pull in official details, and manage registration, schedules, judging, and finals from one place.
                </div>
              </>
            )}
            {!demoMode ? (
            <fieldset disabled={!canEditSetup} className={!canEditSetup ? "mt-4 grid gap-3 opacity-70" : "mt-4 grid gap-3"}>
              <label className="results-field-group" htmlFor="create-event-name">
                <span className="results-field-label">New event name</span>
                <input id="create-event-name" aria-label="New event name" value={createName} onChange={(event) => setCreateName(event.target.value)} className="results-input" placeholder="New event name" />
              </label>
              <label className="results-field-group" htmlFor="create-event-slug-preview">
                <span className="results-field-label">New event slug preview</span>
                <input id="create-event-slug-preview" aria-label="New event slug preview" value={slugifyCompetitionName(createName)} readOnly className="results-input bg-slate-50 text-slate-500" placeholder="new-event-slug" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="results-field-group" htmlFor="create-event-format">
                  <span className="results-field-label">New event format</span>
                  <select
                    id="create-event-format"
                    aria-label="New event format"
                    value={createFormat}
                    onChange={(event) => {
                      const nextFormat = event.target.value as Competition["format"];
                      setCreateFormat(nextFormat);
                      if (!competitionAllowsOptionalFinals(nextFormat)) {
                        setCreateHasFinals(true);
                      }
                    }}
                    className="results-input"
                  >
                    {FORMAT_TEMPLATES.map((template) => (
                      <option key={template.value} value={template.value}>{template.label}</option>
                    ))}
                  </select>
                </label>
                <label className="results-field-group" htmlFor="create-event-location">
                  <span className="results-field-label">New event location</span>
                  <input id="create-event-location" aria-label="New event location" value={createLocation} onChange={(event) => setCreateLocation(event.target.value)} className="results-input" placeholder="New event location" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="results-field-group" htmlFor="create-event-start-date">
                  <span className="results-field-label">New event start date</span>
                  <input id="create-event-start-date" aria-label="New event start date" type="date" value={createStartDate} onChange={(event) => setCreateStartDate(event.target.value)} className="results-input" />
                </label>
                <label className="results-field-group" htmlFor="create-event-end-date">
                  <span className="results-field-label">New event end date</span>
                  <input id="create-event-end-date" aria-label="New event end date" type="date" value={createEndDate} onChange={(event) => setCreateEndDate(event.target.value)} className="results-input" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="results-field-group" htmlFor="create-event-registration-opens">
                  <span className="results-field-label">New event registration opens</span>
                  <input
                    id="create-event-registration-opens"
                    aria-label="New event registration opens"
                    type="datetime-local"
                    value={formatDateTimeLocalInput(createRegistrationOpensAt)}
                    onChange={(event) => setCreateRegistrationOpensAt(parseDateTimeLocalInput(event.target.value))}
                    className="results-input"
                  />
                </label>
                <label className="results-field-group" htmlFor="create-event-registration-deadline">
                  <span className="results-field-label">New event registration deadline</span>
                  <input
                    id="create-event-registration-deadline"
                    aria-label="New event registration deadline"
                    type="datetime-local"
                    value={formatDateTimeLocalInput(createRegistrationClosesAt)}
                    onChange={(event) => setCreateRegistrationClosesAt(parseDateTimeLocalInput(event.target.value))}
                    className="results-input"
                  />
                </label>
              </div>
              {competitionAllowsOptionalFinals(createFormat) ? (
                <label className="results-field-group">
                  <span className="results-field-label">New event finals plan</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCreateHasFinals(false)}
                      className={!createHasFinals ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                    >
                      Start with qualifier only
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateHasFinals(true)}
                      className={createHasFinals ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                    >
                      Start with qualifier + finals
                    </button>
                  </div>
                </label>
              ) : null}
                <label className="results-field-group" htmlFor="create-event-description">
                <span className="results-field-label">New event description</span>
                <textarea
                  id="create-event-description"
                  aria-label="New event description"
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                  className="results-input min-h-[120px] resize-y"
                  placeholder="New event description"
                />
              </label>
              {createOfficialEventUrl || createOfficialRegistrationUrl || createOfficialScheduleUrl ? (
                <div className="rounded-[24px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  Imported official links:
                  {createOfficialEventUrl ? ` event page` : ""}
                  {createOfficialRegistrationUrl ? `${createOfficialEventUrl ? "," : ""} registration` : ""}
                  {createOfficialScheduleUrl ? `${createOfficialEventUrl || createOfficialRegistrationUrl ? "," : ""} schedule` : ""}
                </div>
              ) : null}
              <button
                type="button"
                disabled={isPending || !createName.trim()}
                onClick={() => {
                  startTransition(() => {
                    void (async () => {
                      try {
                        const created = await createCompetitionFromTemplate({
                          name: sanitizeDraftText(createName),
                          format: createFormat,
                          has_finals: competitionAllowsOptionalFinals(createFormat) ? createHasFinals : true,
                          location_name: sanitizeDraftText(createLocation),
                          start_date: sanitizeDraftText(createStartDate) || null,
                          end_date: sanitizeDraftText(createEndDate) || null,
                          registration_opens_at: sanitizeDraftNullable(createRegistrationOpensAt),
                          registration_closes_at: sanitizeDraftNullable(createRegistrationClosesAt),
                          description: sanitizeDraftText(createDescription),
                          hero_image_url: sanitizeExternalUrl(createHeroImageUrl) || undefined,
                          discipline_label: sanitizeDraftText(createDisciplineLabel) || undefined,
                          official_event_url: sanitizeExternalUrl(createOfficialEventUrl) || undefined,
                          official_registration_url: sanitizeExternalUrl(createOfficialRegistrationUrl) || undefined,
                          official_schedule_url: sanitizeExternalUrl(createOfficialScheduleUrl) || undefined,
                        });
                        setCreateName("");
                        setCreateHasFinals(true);
                        setCreateLocation("");
                        setCreateStartDate("");
                        setCreateEndDate("");
                        setCreateDescription("");
                        setCreateRegistrationOpensAt(null);
                        setCreateRegistrationClosesAt(null);
                        setCreateOfficialEventUrl("");
                        setCreateOfficialRegistrationUrl("");
                        setCreateOfficialScheduleUrl("");
                        setCreateHeroImageUrl("");
                        setCreateDisciplineLabel("");
                        await refreshAfterChange(created.id);
                        setSelectedCompetitionId(created.id);
                        setMessage(`Created ${created.name}.`);
                      } catch (nextError) {
                        setError(nextError instanceof Error ? nextError.message : "Unable to create competition.");
                      }
                    })();
                  });
                }}
                className="results-primary-button"
              >
                  Create new event
              </button>
            </fieldset>
            ) : null}
            {!demoMode && !canEditSetup ? (
              <div className="mt-4 text-sm text-slate-600">
                Event creation is admin-only.
              </div>
            ) : null}

            <div className="results-subtle-divider mt-8" />
            <div className="mt-5 flex items-center justify-between gap-3">
              <div>
                <div className="results-kicker">{demoMode ? "Sample events" : "Existing events"}</div>
                <div className="mt-2 text-sm text-slate-600">
                  {demoMode
                    ? "Choose the sample event you want to walk through with a gym buyer."
                    : "Choose an event to review its setup, links, and live workflow."}
                </div>
              </div>
              <div className="results-chip">{visibleSummaries.length} loaded</div>
            </div>

            <div className="mt-4 space-y-3">
              {visibleSummaries.map((summary) => (
                <button
                  key={summary.competition.id}
                  type="button"
                  onClick={() => setSelectedCompetitionId(summary.competition.id)}
                  className={`results-admin-list-item ${selectedCompetitionId === summary.competition.id ? "results-admin-list-item-active" : ""}`}
                >
                  <div>
                    <div className="text-lg font-semibold text-slate-950">{summary.competition.name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {formatCompetitionPhaseLabel(summary.competition.current_phase)} | {summary.climber_count} climbers
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">{summary.competition.slug}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="results-card">
            {draft ? (
              <div id="demo-organizer-setup" className="space-y-6">
                <div className="results-workspace-hero">
                  <div>
                    <div className="results-kicker">{demoMode ? "Organizer setup" : "Configure selected event"}</div>
                    <h2 className="results-editorial-title mt-2 text-4xl font-semibold text-slate-950 sm:text-5xl">{draft.name}</h2>
                    <div className="results-hero-subline">
                      Build the event structure first, then move into live operations once the setup cards below are ready.
                    </div>
                    {demoMode ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="results-chip">{selectedSummary?.climber_count ?? 0} climbers</span>
                        <span className="results-chip">{draft.categories.length} categories</span>
                        <span className="results-chip">{draft.schedule_blocks.length} sessions and logistics blocks</span>
                        <span className="results-chip">{currentCompetitionStages.length} competition stages</span>
                      </div>
                    ) : null}
                  </div>
                    <div className="results-workspace-callout">
                      <div className="results-kicker">Quick links</div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                        <Link href={publicPath} className="results-secondary-button w-full">Public page</Link>
                        {!demoMode ? <Link href={judgeUrl} className="results-secondary-button w-full">Judge scoring</Link> : null}
                        <Link href={displayPath} className="results-secondary-button w-full">Public display</Link>
                        {!demoMode ? (
                          <Link href={buildStaffCompetitionPath(draft.slug, "preflight")} className="results-secondary-button w-full">Event checklist</Link>
                        ) : null}
                      </div>
                      {demoMode ? (
                        <div className="mt-3 text-sm text-slate-600">
                          Judge scoring and staff-only checklists stay protected, but you can still preview the public experience from this sample event.
                        </div>
                      ) : null}
                    </div>
                  </div>

                <div className="results-section-band">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="results-kicker">Configure selected event</div>
                      <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                        {publicUrl || publicPath}
                      </div>
                      <div className="mt-2 text-sm leading-relaxed text-slate-600">
                        Use the local section nav to jump between setup areas without losing the guided step flow.
                      </div>
                    </div>
                    <div className="results-chip">{setupProgressCount} / {SETUP_WIZARD_STEPS.length} setup areas ready</div>
                  </div>
                </div>

                <div className="results-section-nav">
                  {setupSectionAnchors.map((item) => {
                    const isActive = item.stepIndex !== null ? currentSetupStep === item.stepIndex : false;
                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        onClick={() => {
                          if (item.stepIndex !== null) {
                            setCurrentSetupStep(item.stepIndex);
                          }
                        }}
                        className={`results-section-nav__pill ${isActive ? "results-section-nav__pill-active" : ""}`}
                      >
                        {item.label}
                      </a>
                    );
                  })}
                </div>

                <div id="demo-run-event" className="results-workspace-card space-y-6">
                  <div className="space-y-4">
                    <div className="min-w-0">
                      <div className="results-kicker">Setup progress</div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                        Step {currentSetupStep + 1} of {SETUP_WIZARD_STEPS.length}: {activeSetupStep.title}
                      </div>
                      <div className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                        {activeSetupStep.description}
                      </div>
                    </div>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-200/80">
                    <div
                      className="h-full rounded-full bg-slate-950 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
                      style={{ width: `${setupProgressPercent}%` }}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:gap-5">
                    {SETUP_WIZARD_STEPS.map((step, index) => {
                      const isActive = index === currentSetupStep;
                      const isComplete = setupStepCompletion[index];

                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => setCurrentSetupStep(index)}
                          aria-current={isActive ? "step" : undefined}
                          className={`group min-w-0 rounded-[2rem] border px-5 py-6 text-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 sm:px-6 sm:py-7 ${
                            isActive
                              ? "border-slate-950 bg-slate-950 text-white shadow-[0_22px_54px_rgba(15,23,42,0.18)]"
                              : isComplete
                                ? "border-emerald-200/90 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(220,252,231,0.9))] text-emerald-950 shadow-[0_10px_30px_rgba(16,185,129,0.06)] hover:border-emerald-300"
                                : "border-slate-200/90 bg-white text-slate-900 shadow-[0_8px_26px_rgba(15,23,42,0.04)] hover:border-slate-300"
                          }`}
                          style={{ minHeight: "12rem" }}
                        >
                          <div className={`text-sm font-semibold uppercase tracking-[0.24em] ${isActive ? "text-slate-200" : isComplete ? "text-emerald-700" : "text-slate-500"}`}>
                            Step {index + 1}
                          </div>
                          <div className="mt-4 max-w-full break-words text-[clamp(2rem,1.8rem+0.3vw,2.45rem)] font-semibold leading-[1.08] tracking-tight">
                            {step.shortLabel}
                          </div>
                          <div className={`mt-4 max-w-full break-words text-[1.1rem] leading-relaxed ${isActive ? "text-slate-200" : isComplete ? "text-emerald-900" : "text-slate-600"}`}>
                            {step.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="results-step-summary">
                    {setupStepSummaries[currentSetupStep] ?? activeSetupStep.description}
                  </div>
                </div>

                <fieldset disabled={demoMode || !canEditSetup} className={demoMode || !canEditSetup ? "space-y-6 opacity-70" : "space-y-6"}>
                <div id="setup-operations" className="results-workspace-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                  <div className="results-kicker">After setup - Run event</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{formatCompetitionPhaseLabel(draft.current_phase)}</div>
                      {currentPhaseBlockLabel ? (
                        <div className="mt-2 text-sm font-medium text-sky-700">
                          {currentPhaseBlockTitle}: {currentPhaseBlockLabel}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!canGoPrevious || !canEditPhase) {
                            return;
                          }

                          if (previousScheduleBlock) {
                            const targetPhase =
                              getCompetitionPhaseForSchedulePhase(previousScheduleBlock.phase_type) ?? draft.current_phase;
                            void runPhaseNavigation(
                              draft.id,
                              targetPhase,
                              -1,
                              `Current schedule block moved to ${previousScheduleBlock.label}.`,
                              previousScheduleBlock.id
                            );
                            return;
                          }

                          void runPhaseNavigation(
                            draft.id,
                            previousPhase!,
                            -1,
                            `Competition moved to ${formatCompetitionPhaseLabel(previousPhase!).toLowerCase()}.`
                          );
                        }}
                        disabled={!canGoPrevious || isPending || isPhasePending || !canEditPhase}
                        className="results-secondary-button"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const targetNextPhase = nextPhase;

                          if (!canGoNext) {
                            return;
                          }

                          if (nextScheduleBlock) {
                            const targetBlockPhase =
                              getCompetitionPhaseForSchedulePhase(nextScheduleBlock.phase_type) ?? draft.current_phase;

                            if (
                              targetBlockPhase === "results" &&
                              (navigationPhase === "observation" ||
                                navigationPhase === "finals_open" ||
                                navigationPhase === "finals_closed")
                            ) {
                              setConfirming({
                                title: "End event",
                                description: "This moves the competition into the results phase so public pages show the final standings instead of live scoring.",
                                confirmLabel: "End event",
                                confirmTone: "danger",
                                expectedValue: draft.name,
                                action: async () => {
                                  await runPhaseNavigation(
                                    draft.id,
                                    targetBlockPhase,
                                    1,
                                    "Event moved to results.",
                                    nextScheduleBlock.id
                                  );
                                },
                              });
                              return;
                            }

                            void runPhaseNavigation(
                              draft.id,
                              targetBlockPhase,
                              1,
                              `Current schedule block moved to ${nextScheduleBlock.label}.`,
                              nextScheduleBlock.id
                            );
                            return;
                          }

                          if (!targetNextPhase) {
                            return;
                          }

                          if (isEndEventTransition && targetNextPhase === "results") {
                            setConfirming({
                              title: "End event",
                              description: "This moves the competition into the results phase so public pages show the final standings instead of live scoring.",
                              confirmLabel: "End event",
                              confirmTone: "danger",
                              expectedValue: draft.name,
                              action: async () => {
                                await runPhaseNavigation(draft.id, targetNextPhase, 1, "Event moved to results.");
                              },
                            });
                            return;
                          }

                          if (!canEditPhase) {
                            return;
                          }

                          void runPhaseNavigation(
                            draft.id,
                            targetNextPhase,
                            1,
                            `Event moved to ${formatCompetitionPhaseLabel(targetNextPhase).toLowerCase()}.`
                          );
                        }}
                        disabled={!canGoNext || isPending || isPhasePending || !canEditPhase}
                        className={isEndEventTransition ? "results-danger-button" : "results-primary-button"}
                      >
                        {nextPhaseLabel}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-slate-600">
                    This section is for event-day operations after setup is finished. It controls which part of the event is live right now,
                    what can be scored, and what the public sees. When schedule blocks imply a stage order, Previous and Next follow that event timeline first
                    {liveScheduleBlock ? `, and the live block is currently "${liveScheduleBlock.label}".` : "."}
                  </div>
                  {scheduleDrivenPhases.length ? (
                    <div className="mt-3 text-sm text-slate-600">
                      Schedule-driven sequence: {scheduleDrivenPhases.map((phase) => formatCompetitionPhaseLabel(phase)).join(" -> ")}
                    </div>
                  ) : null}
                  {liveScheduleBlock ? (
                    <div className="mt-3 rounded-[1.2rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                      Current schedule block: <span className="font-semibold">{liveScheduleBlock.label}</span>
                      {" · "}
                      {formatSchedulePhaseLabel(liveScheduleBlock.phase_type)}
                      {impliedCompetitionPhase ? (
                        <>
                          {" · "}
                          implies <span className="font-semibold">{formatCompetitionPhaseLabel(impliedCompetitionPhase)}</span>
                        </>
                      ) : (
                        <> · agenda only, no automatic scoring-phase change</>
                      )}
                    </div>
                  ) : null}
                  {schedulePhaseMismatch && draft && impliedCompetitionPhase ? (
                    <div className="mt-3 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      {liveBlockRollsBackPhase ? (
                        <>
                          The live schedule block is behind the competition phase. Public scoring is still using{" "}
                          <span className="font-semibold">{formatCompetitionPhaseLabel(draft.current_phase)}</span>, and syncing backward to{" "}
                          <span className="font-semibold">{formatCompetitionPhaseLabel(impliedCompetitionPhase)}</span> would reopen an earlier stage.
                          {canEditPhase && currentPhaseScheduleBlock ? (
                            <button
                              type="button"
                              onClick={() =>
                                void runPhaseNavigation(
                                  draft.id,
                                  draft.current_phase,
                                  1,
                                  `Current schedule block moved to ${currentPhaseScheduleBlock.label}.`,
                                  currentPhaseScheduleBlock.id
                                )
                              }
                              disabled={isPending || isPhasePending}
                              className="results-secondary-button ml-3"
                            >
                              Move current schedule block forward
                            </button>
                          ) : (
                            <> Only admins can move the current schedule block forward.</>
                          )}
                        </>
                      ) : (
                        <>
                          The live schedule block and competition phase are out of sync. Public scoring is still using{" "}
                          <span className="font-semibold">{formatCompetitionPhaseLabel(draft.current_phase)}</span>, not{" "}
                          <span className="font-semibold">{formatCompetitionPhaseLabel(impliedCompetitionPhase)}</span>.
                          {canEditPhase ? (
                            <button
                              type="button"
                              onClick={() => void runPhaseChange(
                                draft.id,
                                impliedCompetitionPhase,
                                `Event synced to ${formatCompetitionPhaseLabel(impliedCompetitionPhase).toLowerCase()}.`
                              )}
                              disabled={isPending || isPhasePending}
                              className="results-secondary-button ml-3"
                            >
                              Match current schedule block
                            </button>
                          ) : (
                            <> Only admins can sync the competition phase.</>
                          )}
                        </>
                      )}
                    </div>
                  ) : null}
                  {!canEditPhase ? (
                    <div className="mt-3 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      Only admins can change competition phase. Judges can still score inside the active phase.
                    </div>
                  ) : null}
                  {snapshot?.undoAvailability?.available ? (
                    <div className="results-undo-banner mt-4">
                      <div>
                        <div className="results-kicker text-amber-800">Undo Ready</div>
                        <div className="mt-2 text-sm text-amber-900">
                          Undo the last {snapshot.undoAvailability.operation_type} until {formatDateTimeLabel(snapshot.undoAvailability.expires_at)}.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void undoCompetitionOperation(draft.id)
                            .then(() => refreshAfterChange(draft.id))
                            .catch((nextError) => {
                              setError(nextError instanceof Error ? nextError.message : "Unable to undo the last competition operation.");
                            })
                        }
                        disabled={!canEditPhase || isPhasePending}
                        className="results-secondary-button"
                      >
                        Undo
                      </button>
                    </div>
                  ) : null}
                </div>

                {currentSetupStep === 0 ? (
                  <>
                <div id="setup-basics" className="results-workspace-card">
                  <div className="results-kicker">Step 1 - Event basics</div>
                  <div className="mt-2 text-sm text-slate-600">
                    Set the basic event details first. These choices shape registration, finals availability, and the guided setup options below.
                  </div>
                </div>

                <div id="setup-categories" className="grid gap-4 md:grid-cols-2">
                  <label className="results-field-group" htmlFor="current-event-name">
                    <span className="results-field-label">Current event name</span>
                    <input id="current-event-name" aria-label="Current event name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, slug: slugifyCompetitionName(event.target.value) })} className="results-input" placeholder="Current event name" />
                  </label>
                  <label className="results-field-group" htmlFor="current-event-slug">
                    <span className="results-field-label">Current event slug</span>
                    <input id="current-event-slug" aria-label="Current event slug" value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: slugifyCompetitionName(event.target.value) })} className="results-input" placeholder="Current event slug" />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="results-field-group" htmlFor="current-event-format">
                    <span className="results-field-label">Current event format</span>
                    <select
                      id="current-event-format"
                      aria-label="Current event format"
                      value={draft.format}
                      onChange={(event) => {
                        const nextFormat = event.target.value as Competition["format"];
                        if (!roundPlanCustomized) {
                          replaceRoundPlanFromTemplate(nextFormat);
                          return;
                        }
                        const metadataOnlyDraft = {
                          ...draft,
                          format: nextFormat,
                          has_finals: competitionAllowsOptionalFinals(nextFormat) ? draft.has_finals : true,
                          total_climbs: getRecommendedQualifierClimbCount(nextFormat),
                          qualifier_counting_climbs: getRecommendedQualifierCountingClimbs(nextFormat),
                          finals_cutoff: getRecommendedFinalsCutoff(nextFormat),
                        };
                        setDraft({
                          ...metadataOnlyDraft,
                          rounds: (draft.rounds ?? []).map((round) => ({
                            ...round,
                            format: round.scoring_bucket === "finals" ? "ifsc_finals_format" : nextFormat,
                          })),
                        });
                        setRoundPlanNeedsReset(roundPlanCustomized);
                      }}
                      className="results-input"
                    >
                      {FORMAT_TEMPLATES.map((template) => (
                        <option key={template.value} value={template.value}>{template.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="results-field-group" htmlFor="current-event-location">
                    <span className="results-field-label">Current event location</span>
                    <input id="current-event-location" aria-label="Current event location" value={draft.location_name} onChange={(event) => setDraft({ ...draft, location_name: event.target.value })} className="results-input" placeholder="Current event location" />
                  </label>
                </div>
                {roundPlanNeedsReset ? (
                  <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Format changed, but this event has a customized round plan. Current rounds were kept as a metadata-only update.
                    <button
                      type="button"
                      onClick={() => replaceRoundPlanFromTemplate()}
                      className="results-secondary-button ml-3"
                    >
                      Reset rounds from format
                    </button>
                  </div>
                ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="results-field-group" htmlFor="current-event-registration-opens">
                    <span className="results-field-label">Current event registration opens</span>
                    <input
                      id="current-event-registration-opens"
                      aria-label="Current event registration opens"
                      type="datetime-local"
                      value={formatDateTimeLocalInput(draft.registration_opens_at)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          registration_opens_at: parseDateTimeLocalInput(event.target.value),
                        })
                      }
                      className="results-input"
                    />
                  </label>
                  <label className="results-field-group" htmlFor="current-event-registration-deadline">
                    <span className="results-field-label">Current event registration deadline</span>
                    <input
                      id="current-event-registration-deadline"
                      aria-label="Current event registration deadline"
                      type="datetime-local"
                      value={formatDateTimeLocalInput(draft.registration_closes_at)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          registration_closes_at: parseDateTimeLocalInput(event.target.value),
                        })
                      }
                      className="results-input"
                    />
                  </label>
                </div>
                {draftSupportsOptionalFinals ? (
                  <label className="results-field-group">
                    <span className="results-field-label">Current event finals plan</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          updateRounds((current) => current.filter((round) => round.scoring_bucket !== "finals"));
                          setDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  has_finals: false,
                                  schedule_blocks: currentDraft.schedule_blocks.filter(
                                    (block) => !["isolation", "observation", "finals_round"].includes(block.phase_type)
                                  ),
                                }
                              : currentDraft
                          );
                        }}
                        disabled={!canDisableFinals}
                        className={!draftHasFinals ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                      >
                        Qualifier only
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (draft.rounds?.some((round) => round.scoring_bucket === "finals")) {
                            setDraft({ ...draft, has_finals: true });
                            return;
                          }
                          addRound("finals");
                        }}
                        className={draftHasFinals ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                      >
                        Qualifier + finals
                      </button>
                    </div>
                    {!canDisableFinals ? (
                      <div className="text-sm text-slate-600">
                        Finals can only be turned off while the competition is still in a qualifier-stage workflow or after results are posted.
                      </div>
                    ) : null}
                  </label>
                ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Max athletes</span>
                    <input type="number" min={1} value={draft.max_climbers} onChange={(event) => setDraft({ ...draft, max_climbers: Number(event.target.value) || DEFAULT_MAX_CLIMBERS })} className="results-input" />
                    <span className="text-xs leading-5 text-slate-500">Maximum number of climbers this event is set up to handle.</span>
                  </label>
                  <div className="results-workspace-card">
                    <div className="results-kicker">Stage settings</div>
                    <div className="mt-2 text-sm text-slate-600">
                      Edit stage scoring, qualifying climbs, advancing climbers, and finals boulders in Step 5 - Competition stages.
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-[1rem] border border-slate-200/80 bg-white/80 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Qualifier</div>
                        <div className="mt-2 text-sm text-slate-700">
                          {qualifierStage
                            ? `${qualifierStage.problem_count} boulders, best ${qualifierStage.counting_climbs ?? draft.qualifier_counting_climbs} count`
                            : "Set this up in Competition stages."}
                        </div>
                      </div>
                      <div className="rounded-[1rem] border border-slate-200/80 bg-white/80 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Finals</div>
                        <div className="mt-2 text-sm text-slate-700">
                          {finalsStage
                            ? `Top ${finalsStage.advancement_cutoff ?? finalsStage.finals_cutoff ?? draft.finals_cutoff} advance, ${finalsStage.problem_count} boulders`
                            : "No finals stage in this event."}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="results-workspace-card">
                    <div className="results-kicker">After setup - Visibility</div>
                    <div className="mt-2 text-sm text-slate-600">Archiving hides this event from public browsing without deleting registrations or scoring data.</div>
                    <button type="button" onClick={() => void setCompetitionStatus(draft.id, draft.status === "active" ? "archived" : "active").then(() => refreshAfterChange(draft.id))} className={draft.status === "active" ? "results-danger-button mt-4" : "results-secondary-button mt-4"}>
                      {draft.status === "active" ? "Archive event" : "Reopen event"}
                    </button>
                  </div>
                </div>
                  </>
                ) : null}

                {currentSetupStep === 1 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="results-workspace-card">
                    <div className="results-kicker">Step 2 - Choose qualifier categories</div>
                    <div className="mt-2 text-sm text-slate-600">These are the categories athletes can register into, and they also drive the guided schedule presets.</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {CATEGORY_AGE_GROUPS.map((ageGroup) => {
                        const active = draft.qualifier_eligible_age_groups.includes(ageGroup);
                        return (
                          <button
                            key={ageGroup}
                            type="button"
                            onClick={() => setDraft({ ...draft, qualifier_eligible_age_groups: toggleAgeGroup(draft.qualifier_eligible_age_groups, ageGroup) })}
                            className={active ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                          >
                            {ageGroup}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {draftHasFinals ? (
                    <div className="results-workspace-card">
                    <div className="results-kicker">Finals categories (optional)</div>
                    <div className="mt-2 text-sm text-slate-600">Only these categories can advance into finals.</div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {CATEGORY_AGE_GROUPS.map((ageGroup) => {
                          const active = draft.finals_eligible_age_groups.includes(ageGroup);
                          return (
                            <button
                              key={ageGroup}
                              type="button"
                              onClick={() => setDraft({ ...draft, finals_eligible_age_groups: toggleAgeGroup(draft.finals_eligible_age_groups, ageGroup) })}
                              className={active ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                            >
                              {ageGroup}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                ) : null}

                {currentSetupStep === 2 ? (
                <div id="setup-structure" className="results-workspace-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Step 3 - Pick an event setup</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Start with a competition structure first. This will generate the rounds and day schedule for you,
                        and you can fine-tune everything below afterward.
                      </div>
                    </div>
                    {selectedGuidedSetupPreset ? (
                      <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900">
                        Selected: {selectedGuidedSetupPreset.title}
                      </div>
                    ) : (
                      <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                        Choose a template to apply it
                      </div>
                    )}
                  </div>
                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    {GUIDED_SETUP_PRESETS.map((preset) => (
                      (() => {
                        const isSelected = selectedGuidedSetupPresetId === preset.id;

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => applyGuidedSetupPreset(preset.id)}
                            className={`group flex min-w-0 h-full min-h-[21rem] flex-col rounded-[1.6rem] border px-5 py-5 text-left transition ${
                              isSelected
                                ? "border-slate-950 bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
                                : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/50"
                            }`}
                          >
                            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className={`min-w-0 text-sm font-semibold uppercase tracking-[0.2em] ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                                {preset.summary}
                              </div>
                              <div
                                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                                  isSelected
                                    ? "bg-white/12 text-white"
                                    : "border border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                              >
                                {isSelected ? "Selected" : "Template"}
                              </div>
                            </div>
                            <div className={`mt-4 text-[clamp(2rem,1.75rem+0.35vw,2.35rem)] font-semibold leading-[1.08] tracking-tight ${isSelected ? "text-white" : "text-slate-950"}`}>
                              {preset.title}
                            </div>
                            <div className={`mt-4 text-base leading-relaxed ${isSelected ? "text-slate-200" : "text-slate-600"}`}>
                              {preset.description}
                            </div>
                            <div
                              className={`mt-5 rounded-[1rem] border px-4 py-3 text-sm leading-relaxed ${
                                isSelected
                                  ? "border-white/12 bg-white/8 text-slate-100"
                                  : "border-slate-200 bg-slate-50 text-slate-700"
                              }`}
                            >
                              {preset.details}
                            </div>
                            <div className="mt-5 space-y-3 text-sm leading-relaxed">
                              {[
                                ["Best for", preset.bestFor],
                                ["Includes", preset.includes],
                                ["Typical flow", preset.typicalFlow],
                              ].map(([label, value]) => (
                                <div key={`${preset.id}-${label}`} className="grid gap-1 sm:grid-cols-[6.75rem_minmax(0,1fr)] sm:gap-3">
                                  <div className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                                    {label}
                                  </div>
                                  <div className={`${isSelected ? "text-slate-100" : "text-slate-700"}`}>{value}</div>
                                </div>
                              ))}
                            </div>
                            <div className={`mt-5 break-words text-sm font-semibold leading-relaxed ${isSelected ? "text-emerald-300" : "text-sky-700"}`}>
                              {isSelected ? "Applied to this event" : "Click to apply this setup"}
                            </div>
                          </button>
                        );
                      })()
                    ))}
                  </div>
                  {selectedGuidedSetupPreset ? (
                    <div className="mt-4 rounded-[1.3rem] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-950">
                      <span className="font-semibold">{selectedGuidedSetupPreset.title}</span> is currently applied.
                      Continue to <span className="font-semibold">Day schedule</span> to adjust generated blocks, then review <span className="font-semibold">Competition stages</span>.
                    </div>
                  ) : null}
                  <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Next: review the generated <span className="font-semibold text-slate-900">Day schedule</span> and{" "}
                    <span className="font-semibold text-slate-900">Competition stages</span> sections below. They are now pre-linked so
                    real climbing sessions already point at the right round.
                  </div>
                </div>
                ) : null}

                {currentSetupStep === 3 ? (
                <div id="setup-schedule" className="results-workspace-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Step 4 - Build the day</div>
                      <div className="mt-2 text-sm text-slate-600">
                        These blocks describe when things happen during the day. Real climbing sessions should link to a stage; logistics items can stay schedule-only.
                      </div>
                    </div>
                    <div className="results-chip">{draft.schedule_blocks.length} blocks</div>
                  </div>
                  <div className="results-step-summary">
                    {setupStepSummaries[3]}
                  </div>

                  <div className="mt-4 space-y-5">
                    {groupedScheduleTemplates.map((group) => (
                      <div key={group.title} className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{group.title}</div>
                        <div className="mt-2 text-sm text-slate-600">{group.description}</div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {group.templates.map((template) => (
                            <button
                              key={`${group.title}-${template.phase_type}-${template.label}`}
                              type="button"
                              onClick={() => addScheduleBlockFromTemplate(template)}
                              className="results-secondary-button"
                            >
                              Add {template.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <div className="results-check-grid">
                      {wizardGuardrails.map((item) => (
                        <div
                          key={`schedule-guardrail-${item.label}`}
                          className={`results-check-card ${item.ok ? "results-check-card-ok" : "results-check-card-warn"}`}
                        >
                          <div className="font-semibold">{item.label}</div>
                          <div className="mt-1">{item.ok ? "Ready for the event timeline." : "Needs attention before this flow is fully reliable."}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="results-timeline mt-5">
                    <div className="text-sm text-slate-600">
                      Add qualifier waves separately, then drag one wave onto another if you want them combined into one shared start group.
                    </div>
                    {orderedDraftScheduleBlocks.length ? (
                      orderedDraftScheduleBlocks.map((block, blockIndex) => {
                        const supportsCategoryFilters =
                          block.phase_type === "qualifier_round" || block.phase_type === "custom";
                        const canMergeThisBlock = canMergeWaveBlock(block);
                        const isMergeTarget = mergeTargetBlockId === block.id && draggedScheduleBlockId !== block.id;
                        const isExpanded = expandedScheduleBlockId === block.id;
                        const linkedRound = (draft.rounds ?? []).find((round) => round.id === block.round_id) ?? null;
                        const isScoringPhase = linkedRound ? linkedRound.scoring_bucket !== "none" : false;
                        const needsRoundLink =
                          ["qualifier_round", "finals_round", "observation", "isolation"].includes(block.phase_type) &&
                          !block.round_id;
                        const insertTemplate: ScheduleBlockTemplate = {
                          label: "Custom block",
                          phase_type: "custom",
                          audience_label: "All athletes",
                          capacity: draft.max_climbers,
                        };

                        return (
                          <div
                            key={block.id}
                            draggable={canMergeThisBlock}
                            onDragStart={() => {
                              if (!canMergeThisBlock) {
                                return;
                              }
                              setDraggedScheduleBlockId(block.id);
                            }}
                            onDragEnd={() => {
                              setDraggedScheduleBlockId(null);
                              setMergeTargetBlockId(null);
                            }}
                            onDragOver={(event) => {
                              if (!draggedScheduleBlockId || !canMergeThisBlock || draggedScheduleBlockId === block.id) {
                                return;
                              }
                              event.preventDefault();
                              setMergeTargetBlockId(block.id);
                            }}
                            onDragLeave={() => {
                              if (mergeTargetBlockId === block.id) {
                                setMergeTargetBlockId(null);
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (!draggedScheduleBlockId || draggedScheduleBlockId === block.id) {
                                return;
                              }
                              mergeScheduleBlocks(draggedScheduleBlockId, block.id);
                            }}
                            className={`results-timeline-card ${block.is_active ? "results-timeline-card-active" : ""} ${
                              isMergeTarget ? "border-sky-400 ring-2 ring-sky-100" : ""
                            } ${canMergeThisBlock ? "cursor-grab active:cursor-grabbing" : ""}`}
                          >
                            <div className="results-inline-insert pb-4">
                              <button
                                type="button"
                                onClick={() => insertScheduleBlockFromTemplate(insertTemplate, blockIndex, "above")}
                                className="results-secondary-button"
                              >
                                Add block above
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => setExpandedScheduleBlockId((current) => (current === block.id ? null : block.id))}
                                className="min-w-0 text-left"
                              >
                                <div className="text-lg font-semibold text-slate-950">{block.label || "Untitled block"}</div>
                                <div className="mt-1 text-sm text-slate-600">
                                  {formatSchedulePhaseLabel(block.phase_type)} / {getSchedulePhaseDescription(block.phase_type)}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="results-chip">{block.start_time || "Time TBD"}{block.end_time ? ` - ${block.end_time}` : ""}</span>
                                  {block.audience_label ? <span className="results-chip">{block.audience_label}</span> : null}
                                  {linkedRound ? <span className="results-chip">{linkedRound.name}</span> : null}
                                  {isScoringPhase ? <span className="results-chip border-emerald-200 bg-emerald-50 text-emerald-700">Scoring phase</span> : null}
                                  {!linkedRound ? <span className="results-chip">Public agenda only</span> : null}
                                  {block.is_active ? <span className="results-chip border-sky-200 bg-sky-50 text-sky-700">Live now</span> : null}
                                  {needsRoundLink ? <span className="results-chip border-amber-200 bg-amber-50 text-amber-700">Needs round link</span> : null}
                                </div>
                                {canMergeThisBlock ? (
                                  <div className="mt-2 text-xs font-medium uppercase tracking-[0.24em] text-sky-700">
                                    Drag onto another wave to merge
                                  </div>
                                ) : null}
                              </button>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => moveScheduleBlock(block.id, -1)}
                                  disabled={blockIndex === 0}
                                  className="results-secondary-button"
                                >
                                  Move up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveScheduleBlock(block.id, 1)}
                                  disabled={blockIndex === orderedDraftScheduleBlocks.length - 1}
                                  className="results-secondary-button"
                                >
                                  Move down
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveScheduleBlock(block.id)}
                                  className={block.is_active ? "results-primary-button" : "results-secondary-button"}
                                >
                                  {block.is_active ? "Current block" : "Set current"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeScheduleBlock(block.id)}
                                  className="results-danger-button"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>

                            {isExpanded ? (
                            <>
                            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                              <label className="space-y-2">
                                <span className="text-sm font-medium text-slate-700">Label</span>
                                <input
                                  value={block.label}
                                  onChange={(event) => updateScheduleBlock(block.id, (current) => ({ ...current, label: event.target.value }))}
                                  className="results-input"
                                  placeholder="Qualifying A"
                                />
                              </label>
                              <label className="space-y-2">
                                <span className="text-sm font-medium text-slate-700">Block type</span>
                                <select
                                  value={block.phase_type}
                                  onChange={(event) => {
                                    const nextPhaseType = event.target.value as SchedulePhaseType;
                                    const defaultRoundId = getDefaultRoundIdForSchedulePhase(draft, nextPhaseType);

                                    updateScheduleBlock(block.id, (current) => ({
                                      ...current,
                                      phase_type: nextPhaseType,
                                      round_id: defaultRoundId,
                                      eligible_category_ids:
                                        nextPhaseType === "qualifier_round" || nextPhaseType === "custom"
                                          ? current.eligible_category_ids.length
                                            ? current.eligible_category_ids
                                            : qualifierCategories.map((category) => category.id)
                                          : [],
                                    }));
                                  }}
                                  className="results-input"
                                >
                                  {SCHEDULE_PHASE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="space-y-2">
                                <span className="text-sm font-medium text-slate-700">Audience</span>
                                <input
                                  value={block.audience_label}
                                  onChange={(event) => updateScheduleBlock(block.id, (current) => ({ ...current, audience_label: event.target.value }))}
                                  className="results-input"
                                  placeholder="Youth categories"
                                />
                              </label>
                              <label className="space-y-2">
                                <span className="text-sm font-medium text-slate-700">Round link</span>
                                <select
                                  value={block.round_id ?? ""}
                                  onChange={(event) =>
                                    updateScheduleBlock(block.id, (current) => ({
                                      ...current,
                                      round_id: event.target.value || null,
                                    }))
                                  }
                                  className="results-input"
                                >
                                  <option value="">No round link (schedule only)</option>
                                  {(draft.rounds ?? []).map((round) => (
                                    <option key={round.id} value={round.id}>
                                      {round.name}{" "}
                                      {round.scoring_bucket === "none"
                                        ? "(schedule only)"
                                        : round.scoring_bucket === "finals"
                                          ? "(real finals scoring)"
                                          : "(real scoring)"}
                                    </option>
                                  ))}
                                </select>
                                <div className="text-xs text-slate-500">
                                  Link real climbing sessions to a scoring round. Leave this off for logistics-only blocks like check-in,
                                  reset, or awards.
                                </div>
                              </label>
                              <label className="space-y-2">
                                <span className="text-sm font-medium text-slate-700">Start time</span>
                                <input
                                  value={block.start_time ?? ""}
                                  onChange={(event) => updateScheduleBlock(block.id, (current) => ({ ...current, start_time: event.target.value }))}
                                  className="results-input"
                                  placeholder="9:00 AM"
                                />
                              </label>
                              <label className="space-y-2">
                                <span className="text-sm font-medium text-slate-700">End time</span>
                                <input
                                  value={block.end_time ?? ""}
                                  onChange={(event) => updateScheduleBlock(block.id, (current) => ({ ...current, end_time: event.target.value }))}
                                  className="results-input"
                                  placeholder="11:00 AM"
                                />
                              </label>
                              <label className="space-y-2">
                                <span className="text-sm font-medium text-slate-700">Capacity</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={block.capacity}
                                  onChange={(event) =>
                                    updateScheduleBlock(block.id, (current) => ({
                                      ...current,
                                      capacity: Math.max(1, Number(event.target.value) || draft.max_climbers),
                                    }))
                                  }
                                  className="results-input"
                                />
                              </label>
                            </div>

                            {supportsCategoryFilters ? (
                              <div className="mt-4">
                                <div className="text-sm font-medium text-slate-700">Registration categories for this block</div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateScheduleBlock(block.id, (current) => ({
                                        ...current,
                                        eligible_category_ids: [],
                                      }))
                                    }
                                    className={!block.eligible_category_ids.length ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                                  >
                                    All qualifying categories
                                  </button>
                                  {qualifierCategories.map((category) => {
                                    const active = block.eligible_category_ids.includes(category.id);
                                    return (
                                      <button
                                        key={`${block.id}-${category.id}`}
                                        type="button"
                                        onClick={() => toggleScheduleBlockCategory(block.id, category.id)}
                                        className={active ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                                      >
                                        {category.display_name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                            <div className="results-inline-insert pt-4">
                              <button
                                type="button"
                                onClick={() => insertScheduleBlockFromTemplate(insertTemplate, blockIndex, "below")}
                                className="results-secondary-button"
                              >
                                Add block below
                              </button>
                            </div>
                            </>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[1.4rem] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                        No schedule blocks yet. Start with a template above, then adjust the details for your event.
                      </div>
                    )}
                  </div>
                </div>
                ) : null}

                </fieldset>
                <div className="results-workspace-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Wizard navigation</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Move one step at a time, or jump directly from the progress cards above.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentSetupStep((current) => Math.max(0, current - 1))}
                        disabled={isFirstSetupStep}
                        className="results-secondary-button"
                      >
                        Previous step
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentSetupStep((current) => Math.min(SETUP_WIZARD_STEPS.length - 1, current + 1))}
                        disabled={isLastSetupStep}
                        className="results-primary-button"
                      >
                        Next step
                      </button>
                      <button type="button" onClick={persistDraft} disabled={isPending || !canEditSetup} className="results-secondary-button">
                        {isPending ? "Saving..." : "Save competition"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="results-workspace-card">
                  <div className="results-kicker">After setup - Share links</div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <div><span className="font-semibold text-slate-950">Overview:</span> {publicUrl || publicPath}</div>
                    <div><span className="font-semibold text-slate-950">Register:</span> {registerUrl || registerPath}</div>
                  <div><span className="font-semibold text-slate-950">Public display:</span> {displayUrl || displayPath}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={() => void navigator.clipboard.writeText(publicUrl)} className="results-secondary-button">Copy overview</button>
                    <button type="button" onClick={() => void navigator.clipboard.writeText(registerUrl)} className="results-secondary-button">Copy register</button>
                    <button type="button" onClick={() => void downloadRegistrationQr()} className="results-secondary-button">Download QR</button>
                    <button type="button" onClick={printRegistrationQr} className="results-secondary-button">Print QR</button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-start gap-4">
                    <Image src={registrationQrUrl} alt="Competition registration QR code" width={160} height={160} unoptimized className="rounded-[1.2rem] border border-slate-200 bg-white p-2" />
                    <div className="max-w-xs text-sm leading-6 text-slate-600">
                      Scan this QR code to open the competition registration page directly.
                    </div>
                  </div>
                </div>

                {currentSetupStep === 4 ? (
                <fieldset disabled={demoMode || !canEditSetup} className={demoMode || !canEditSetup ? "space-y-6 opacity-70" : "space-y-6"}>
                {draft.rounds?.length ? (
                  <div id="setup-stages" className="results-workspace-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="results-kicker">Step 5 - Competition stages</div>
                        <div className="mt-2 text-sm text-slate-600">
                          This is where you define the actual parts of the competition, like Qualifier, Semifinal, and Finals. Use stages to decide which parts create rankings and which parts are only there to organize the day.
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAdvancedStageSettings((current) => !current)}
                          className="results-secondary-button"
                        >
                          {showAdvancedStageSettings ? "Hide advanced" : "Show advanced"}
                        </button>
                        <button type="button" onClick={() => addRound("qualifier")} className="results-secondary-button">Add qualifier</button>
                        <button type="button" onClick={() => addRound("semifinal")} className="results-secondary-button">Add semifinal</button>
                        <button type="button" onClick={() => addRound("finals")} className="results-secondary-button">Add finals</button>
                      </div>
                    </div>
                    <div className="results-step-summary">
                      {setupStepSummaries[4]}
                    </div>
                    <div className="results-stage-flow mt-4">
                      {currentCompetitionStages.map((round, index) => (
                        <div key={`flow-${round.id}`} className="contents">
                          <span className="results-chip">{round.name}</span>
                          {index < currentCompetitionStages.length - 1 ? <span className="results-stage-flow__connector">{"->"}</span> : null}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 space-y-4">
                          {draft.rounds.map((round, index) => {
                            const planningOnly = round.scoring_bucket === "none";
                            const isExpanded = expandedRoundId === round.id;
                            const scoreBearingLabel =
                              round.scoring_bucket === "qualifier"
                                ? "This stage creates rankings"
                                : round.scoring_bucket === "finals"
                                  ? "This stage creates finals rankings"
                                  : "Planning only";
                            return (
                              <div
                                key={round.id}
                                className="results-storyboard-card"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedRoundId((current) => (current === round.id ? null : round.id))}
                                    className="flex min-w-0 flex-1 flex-col items-start text-left"
                                  >
                                    <div className="flex w-full items-center justify-between gap-3">
                                      <div className="text-lg font-semibold text-slate-950">{round.name}</div>
                                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                        {isExpanded ? "Collapse" : "Expand"}
                                      </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <span className={planningOnly ? "results-chip" : "results-chip border-emerald-200 bg-emerald-50 text-emerald-800"}>
                                        {scoreBearingLabel}
                                      </span>
                                      <span className="results-chip">{round.status}</span>
                                      {round.is_active ? <span className="results-chip border-sky-200 bg-sky-50 text-sky-800">Live stage</span> : null}
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeRound(round.id)}
                                    disabled={(draft.rounds?.length ?? 0) <= 1}
                                    className="results-danger-button"
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                  <div className="rounded-[1rem] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Stage type</div>
                                    <div className="mt-2 text-sm font-semibold text-slate-950">{round.round_type}</div>
                                  </div>
                                  <div className="rounded-[1rem] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Scoring mode</div>
                                    <div className="mt-2 text-sm font-semibold text-slate-950">{planningOnly ? "Planning only" : round.scoring_bucket === "finals" ? "Finals rankings" : "Qualifier rankings"}</div>
                                  </div>
                                  <div className="rounded-[1rem] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Boulder count</div>
                                    <div className="mt-2 text-sm font-semibold text-slate-950">{round.problem_count}</div>
                                  </div>
                                  <div className="rounded-[1rem] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Advancement</div>
                                    <div className="mt-2 text-sm font-semibold text-slate-950">
                                      {round.round_type === "semifinal"
                                        ? "Feeds the next stage"
                                        : round.round_type === "finals"
                                          ? "Final scoring stage"
                                          : `Top ${round.finals_cutoff ?? draft.finals_cutoff} move on`}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2 text-xs leading-5 text-slate-500">
                                  <span className="results-chip border-slate-200 bg-slate-50 text-slate-600 shadow-none">
                                    {planningOnly ? "Used for planning only" : "Scores saved for this stage"}
                                  </span>
                                  {round.round_type !== "finals" ? (
                                    <span>
                                      Best {round.counting_climbs ?? draft.qualifier_counting_climbs} climbs count toward ranking.
                                    </span>
                                  ) : null}
                                  {round.round_type !== "semifinal" ? (
                                    <span>
                                      Top {round.finals_cutoff ?? draft.finals_cutoff} advance into the next stage.
                                    </span>
                                  ) : null}
                                </div>
                                {index < (draft.rounds?.length ?? 0) - 1 ? <div className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-400">Climbers who advance move into the next stage below</div> : null}
                                {isExpanded ? (
                                    <div className="mt-4">
                                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
                                        <label className="space-y-2">
                                          <span className="text-sm font-medium text-slate-700">Name</span>
                                          <input value={round.name} onChange={(event) => updateRound(round.id, (current) => ({ ...current, name: event.target.value }))} className="results-input" />
                                        </label>
                                        <label className="space-y-2">
                                          <span className="text-sm font-medium text-slate-700">Round type</span>
                                          <select
                                            value={round.round_type}
                                            onChange={(event) =>
                                              updateRound(round.id, (current) => {
                                                const roundType = event.target.value as CompetitionRoundType;
                                                const scoringBucket =
                                                  current.scoring_bucket === "none"
                                                      ? getRoundDefaultScoringBucket(roundType)
                                                      : current.scoring_bucket;
                                                return {
                                                  ...current,
                                                  round_type: roundType,
                                                  runtime_phase: getRoundRuntimePhase(roundType),
                                                  scoring_bucket: scoringBucket,
                                                  format: roundType === "finals" ? "ifsc_finals_format" : draft.format,
                                                  counting_climbs: roundType === "finals" ? null : current.counting_climbs ?? draft.qualifier_counting_climbs,
                                                  finals_cutoff: roundType === "semifinal" ? null : current.finals_cutoff ?? draft.finals_cutoff,
                                                };
                                              })
                                            }
                                            className="results-input"
                                          >
                                            <option value="qualifier">Qualifier</option>
                                            <option value="semifinal">Semifinal</option>
                                            <option value="finals">Finals</option>
                                          </select>
                                        </label>
                                        <label className="space-y-2">
                                          <span className="text-sm font-medium text-slate-700">How this stage is used</span>
                                          <select
                                            value={round.scoring_bucket}
                                            onChange={(event) =>
                                              updateRound(round.id, (current) => {
                                                const nextBucket = event.target.value as CompetitionRoundScoringBucket;
                                                if (nextBucket === "finals" && finalsScoreRoundCount >= 1 && current.scoring_bucket !== "finals") {
                                                  return current;
                                                }
                                                if (current.round_type === "finals" && nextBucket === "qualifier") {
                                                  return current;
                                                }
                                                if (current.round_type !== "finals" && nextBucket === "finals") {
                                                  return current;
                                                }
                                                return { ...current, scoring_bucket: nextBucket };
                                              })
                                            }
                                            className="results-input"
                                          >
                                            <option value="none">Planning only</option>
                                            {round.round_type !== "finals" ? <option value="qualifier">Creates rankings for this stage</option> : null}
                                            {round.round_type === "finals" ? <option value="finals">Creates finals rankings</option> : null}
                                          </select>
                                        </label>
                                        <label className="space-y-2">
                                          <span className="text-sm font-medium text-slate-700">Boulders in this stage</span>
                                          <input
                                            type="number"
                                            min={1}
                                            max={round.round_type === "finals" ? 8 : 200}
                                            value={round.problem_count}
                                            onChange={(event) =>
                                              updateRound(round.id, (current) => ({
                                                ...current,
                                                problem_count: Math.max(1, Number(event.target.value) || current.problem_count),
                                              }))
                                            }
                                            className="results-input"
                                          />
                                        </label>
                                      </div>
                                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                                        {round.round_type !== "finals" ? (
                                          <label className="space-y-2">
                                            <span className="text-sm font-medium text-slate-700">Top climbs counted</span>
                                            <input
                                              type="number"
                                              min={1}
                                              value={round.counting_climbs ?? draft.qualifier_counting_climbs}
                                              onChange={(event) =>
                                                updateRound(round.id, (current) => ({
                                                  ...current,
                                                  counting_climbs: Math.max(1, Number(event.target.value) || draft.qualifier_counting_climbs),
                                                }))
                                              }
                                              className="results-input"
                                            />
                                          </label>
                                        ) : null}
                                        {round.round_type !== "semifinal" ? (
                                          <label className="space-y-2">
                                            <span className="text-sm font-medium text-slate-700">Athletes who move on</span>
                                            <select
                                              value={round.finals_cutoff ?? draft.finals_cutoff}
                                              onChange={(event) =>
                                                updateRound(round.id, (current) => ({
                                                  ...current,
                                                  finals_cutoff: Number(event.target.value) === 8 ? 8 : DEFAULT_FINALS_CUTOFF,
                                                  advancement_cutoff: Number(event.target.value) === 8 ? 8 : DEFAULT_FINALS_CUTOFF,
                                                }))
                                              }
                                              className="results-input"
                                            >
                                              <option value={6}>Top 6</option>
                                              <option value={8}>Top 8</option>
                                            </select>
                                          </label>
                                        ) : null}
                                        {showAdvancedStageSettings ? (
                                            <label className="flex flex-col gap-2">
                                              <span className="text-sm font-medium text-slate-700">Enabled</span>
                                              <button
                                                type="button"
                                                onClick={() => updateRound(round.id, (current) => ({ ...current, is_enabled: !current.is_enabled }))}
                                                className={`${round.is_enabled ? "results-primary-button" : "results-secondary-button"} min-w-0 w-full px-4`}
                                              >
                                                {round.is_enabled ? "Enabled" : "Disabled"}
                                              </button>
                                            </label>
                                          ) : null}
                                      </div>
                                    </div>
                                  ) : null}
                              </div>
                            );
                          })}
                    </div>
                  </div>
                ) : null}

                {draftHasFinals && finalsOrder.length && (snapshot?.finalistsPersisted || canEditFinalsOrder) ? (
                  <div className="results-workspace-card">
                    <div className="results-kicker">Finals order</div>
                    <div className="mt-2 text-sm text-slate-600">
                      {canEditFinalsOrder
                        ? snapshot?.finalistsPersisted
                          ? "Finals preview is live, so you can set finals order now."
                          : "Finals preview is live. The first change will create the finals field from the projected finalists."
                        : "Finals order is locked outside finals preview."}
                    </div>
                    <div className="mt-4 space-y-3">
                      {finalsOrder.map((finalist, index) => (
                        <div key={finalist.climber_id} className="results-admin-list-item">
                          <div>
                            <div className="text-lg font-semibold text-slate-950">{finalist.name}</div>
                            <div className="mt-1 text-sm text-slate-600">{finalist.display_category} | Qualifying #{finalist.qualifier_rank}</div>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => void moveFinalist(index, -1)} disabled={!canEditFinalsOrder || index === 0} className="results-secondary-button">Up</button>
                            <button type="button" onClick={() => void moveFinalist(index, 1)} disabled={!canEditFinalsOrder || index === finalsOrder.length - 1} className="results-secondary-button">Down</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : draftHasFinals && finalsOrder.length ? (
                  <div className="results-workspace-card">
                    <div className="results-kicker">Finals order</div>
                    <div className="mt-2 text-sm text-slate-600">
                      Projected finalists are visible, but the climbing order can only be edited during finals preview.
                    </div>
                  </div>
                ) : null}

                <div className="results-workspace-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Ready to save</div>
                      <div className="mt-2 text-sm text-slate-600">
                        This last check makes sure the event basics, categories, schedule, and scoring structure all tell the same story.
                      </div>
                    </div>
                    <div className="results-chip">
                      {readyToSaveChecklist.filter((item) => item.ok).length} / {readyToSaveChecklist.length} ready
                    </div>
                  </div>
                  <div className="results-check-grid mt-4">
                    {readyToSaveChecklist.map((item) => (
                      <div
                        key={`save-check-${item.label}`}
                        className={`results-check-card ${item.ok ? "results-check-card-ok" : "results-check-card-warn"}`}
                      >
                        <div className="font-semibold">{item.label}</div>
                        <div className="mt-1">{item.ok ? "Looks good." : "Still needs attention."}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={persistDraft} disabled={isPending || !canEditSetup} className="results-primary-button">
                    {isPending ? "Saving..." : "Save competition"}
                  </button>
                  {snapshot ? (
                    <>
                      <button type="button" onClick={() => window.open(buildDisplayPath(draft.slug), "_blank", "noopener,noreferrer")} className="results-secondary-button">
                        Open public display
                      </button>
                    </>
                  ) : null}
                  {draftHasFinals ? (
                    <button
                      type="button"
                      onClick={() => setConfirming({
                        title: "Advance to finals",
                        description: finalsAdvanceBlock
                          ? `This will create the finals field from the current standings and move the event into ${finalsAdvanceBlock.label}. You can undo it for ${COMPETITION_UNDO_WINDOW_LABEL}.`
                          : `This will create the finals field from the current standings and move the event into finals. You can undo it for ${COMPETITION_UNDO_WINDOW_LABEL}.`,
                        confirmLabel: "Advance",
                        expectedValue: draft.name,
                        action: async () => {
                          await advanceToFinals();
                        },
                      })}
                      className="results-secondary-button"
                      disabled={!canAdvanceToFinals || isPending || isPhasePending}
                    >
                      Advance to finals
                    </button>
                  ) : null}
                </div>
                <div className="results-workspace-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Admin controls</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Keep destructive and live-only actions here so setup stays focused on building the event cleanly.
                      </div>
                    </div>
                    <div className="results-chip">{stageFlowSummary}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {canRestoreDemo ? (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirming({
                            title: "Restore demo",
                            description:
                              "This rebuilds the seeded demo competition and clears any temporary changes from prior walkthroughs or test scoring.",
                            confirmLabel: "Restore",
                            expectedValue: draft.name,
                            action: async () => {
                              await restoreDemoCompetition();
                            },
                          })
                        }
                        className="results-secondary-button"
                      >
                        Restore demo
                      </button>
                    ) : null}
                    {!selectedCompetitionIsDemo ? (
                    <button type="button" onClick={() => setConfirming({
                      title: "Delete event",
                      description: "This permanently deletes the event and all of its registrations, scores, finalists, and schedule data. This cannot be undone.",
                      confirmLabel: "Delete",
                      confirmTone: "danger",
                      expectedValue: draft.name,
                      action: async () => {
                        await deleteCompetition(draft.id);
                        setDraft(null);
                        setSnapshot(null);
                        setSelectedCompetitionId("");
                        await refreshAfterChange();
                        setMessage("Competition deleted.");
                      },
                    })} disabled={!canEditSetup} className="results-danger-button">Delete event</button>
                    ) : null}
                  </div>
                </div>
                </fieldset>
                ) : null}

                {snapshot && (!demoMode || demoDataExportAllowed) ? (
                  <div className="results-workspace-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="results-kicker">Exports</div>
                        <div className="mt-2 text-sm text-slate-600">
                          {demoMode
                            ? "Demo export uses sample event data only."
                            : "Download standings to share, review, or import elsewhere."}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={() => downloadCsv(`${draft.slug}-qualifiers.csv`, buildQualifierCsv(snapshot))} className="results-secondary-button">
                          Export qualifying CSV
                        </button>
                        <button type="button" onClick={() => downloadCsv(`${draft.slug}-finals.csv`, buildFinalsCsv(snapshot))} className="results-secondary-button" disabled={!snapshot.finalsLeaderboard.length}>
                          Export finals CSV
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-slate-600">Select a competition to edit it.</div>
            )}
          </section>
        </section>

        {demoMode ? (
          <section className="grid gap-6 lg:grid-cols-2">
            <section className="results-card">
              <div className="results-kicker">Why gyms like this</div>
              <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
                {DEMO_TRUST_POINTS.map((point) => (
                  <div key={point} className="flex items-start gap-3">
                    <span className="mt-2 h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="results-card">
              <div className="results-kicker">Want this for your gym?</div>
              <h2 className="results-editorial-title mt-3 text-3xl font-semibold text-slate-950 sm:text-4xl">
                Use the sample event as your walkthrough.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Show buyers the organizer setup first, then open the public leaderboard and display to demonstrate the event-day experience end to end.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#demo-organizer-setup" className="results-primary-button">
                  Start the walkthrough
                </a>
                {leaderboardPath ? (
                  <Link href={leaderboardPath} className="results-secondary-button">
                    Open sample leaderboard
                  </Link>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}

        <ConfirmationModal
          open={Boolean(confirming)}
          title={confirming?.title ?? ""}
          description={confirming?.description ?? ""}
          confirmLabel={confirming?.confirmLabel ?? "Confirm"}
          confirmTone={confirming?.confirmTone ?? "default"}
          expectedValue={confirming?.expectedValue}
          busy={isPending || isPhasePending}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            if (!confirming) {
              return;
            }

            startTransition(() => {
              void confirming.action().catch((nextError) => {
                setError(nextError instanceof Error ? nextError.message : "Unable to complete the action.");
              });
            });
            setConfirming(null);
          }}
        />
      </div>
    </main>
  );
}
