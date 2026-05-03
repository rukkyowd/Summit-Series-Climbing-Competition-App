"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/site-header";
import StaffCompetitionSubnav from "@/components/staff-competition-subnav";
import ConfirmationModal from "@/components/confirmation-modal";
import {
  StaffEventCreationForm,
  type StaffEventCreationFormValues,
} from "@/components/staff-event-creation-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { getAuthState, signOutUser, type Profile } from "@/lib/auth";
import { buildFinalsCsv, buildQualifierCsv, downloadCsv } from "@/lib/export";
import {
  GUIDED_ORGANIZER_ACT_1_STEPS,
  clampGuidedAct1StepIndex,
  getGuidedAct1FormStepId,
  type GuidedOrganizerWalkthroughStep,
} from "@/lib/demo-act1-guide";
import {
  COMPETITION_PRESETS,
  detectCompetitionPreset,
  getCompetitionPreset,
  getPresetFinalsEligibleCategories,
  type CompetitionPresetId,
  type CompetitionPresetScheduleBlock,
} from "@/lib/competition-presets";
import {
  constrainFinalsEligibleAgeGroupsToSelectedCategories,
  finalsEligibilityUsesSelectedCategories,
  getFinalsEligibilityOptions,
  getSelectedQualifierCategories,
} from "@/lib/competition-category-eligibility";
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
import { normalizeCompetitionFinalsSetup } from "@/lib/competition-structure";
import { sanitizeExternalUrl } from "@/lib/security";

const COMPETITION_UNDO_WINDOW_LABEL = "5 minutes";

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

type ScheduleBlockTemplate = CompetitionPresetScheduleBlock;

type ScheduleTemplateGroup = {
  title: string;
  description: string;
  templates: ScheduleBlockTemplate[];
};

const unusedOrganizerStepLabels = {
  intro: "Organizer · introduction",
  preset: "Organizer · format template",
  categories: "Organizer · categories",
  schedule: "Organizer · day schedule",
  stages: "Organizer · competition stages",
  handoff: "Organizer · handoff to judge",
};

type OrganizerPlaybackStep = keyof typeof unusedOrganizerStepLabels;
type OrganizerNarration = {
  title: string;
  body: string;
};
type OrganizerDemoStepId =
  | "overview"
  | "basics_name"
  | "basics_format"
  | "basics_registration"
  | "preset"
  | "categories"
  | "schedule"
  | "stages"
  | "handoff";
type OrganizerDemoHandoffTarget = "judge" | "leaderboard" | "display";
type OrganizerDemoCursorState = {
  visible: boolean;
  x: number;
  y: number;
  clicking: boolean;
  label: string | null;
};
type OrganizerBuildTransitionState = {
  active: boolean;
  stepIndex: number;
  complete: boolean;
};

const ORGANIZER_BUILD_TRANSITION_STEPS = [
  "Saving event setup",
  "Adding sample climbers",
  "Seeding practice scores",
  "Opening judge workspace",
] as const;

const ORGANIZER_STEP_LABELS = unusedOrganizerStepLabels;
const DEMO_AUTOPLAY_ENABLED = false;

function DemoSalesShell(_: Record<string, unknown>) {
  return null;
}

function OrganizerDemoTour(_: Record<string, unknown>) {
  return null;
}

function readDemoSalesSession() {
  return null as null | {
    audioEnabled: boolean;
    competitionId: string | null;
    mode?: string;
    autoplay?: boolean;
  };
}

function writeDemoSalesSession(_: unknown) {}

function patchDemoSalesSession(_: unknown) {}

function createDemoSalesSession<T>(session: T) {
  return session;
}

function isDemoCompetitionRecord(record: Pick<Competition, "is_demo">) {
  return record.is_demo;
}

function isDemoDataSlug(_: string | null | undefined) {
  return false;
}

function GuidedOrganizerAct1Walkthrough({
  steps,
  currentStepIndex,
  onSelectStep,
}: {
  steps: readonly GuidedOrganizerWalkthroughStep[];
  currentStepIndex: number;
  onSelectStep: (stepIndex: number) => void;
}) {
  const currentStep = steps[currentStepIndex] ?? steps[0];
  const progressPercent = Math.round(((currentStepIndex + 1) / steps.length) * 100);
  const nextStepIndex = Math.min(steps.length - 1, currentStepIndex + 1);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="results-kicker text-sky-700">Guided organizer walkthrough</div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
          {currentStep.title}
        </h2>
        <p className="text-sm leading-6 text-slate-700">{currentStep.explanation}</p>
        <div className="rounded-[1.2rem] border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
          <span className="font-semibold text-slate-950">Why this matters:</span>{" "}
          {currentStep.why}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="results-secondary-button"
            onClick={() => onSelectStep(nextStepIndex)}
            disabled={currentStepIndex === steps.length - 1}
          >
            Next guide step
          </button>
          <button
            type="button"
            className="results-secondary-button"
            onClick={() => onSelectStep(0)}
          >
            Restart guide
          </button>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          Guide navigation only moves the explanation and highlight. It never saves, creates, or
          populates demo data.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {steps.map((step, index) => {
          const isActive = index === currentStepIndex;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectStep(index)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                isActive
                  ? "border-sky-300 bg-sky-100 text-sky-950"
                  : "border-slate-200 bg-white/75 text-slate-600 hover:border-sky-200 hover:text-sky-900"
              }`}
              aria-current={isActive ? "step" : undefined}
            >
              {step.title}
            </button>
          );
        })}
      </div>
      <div className="rounded-[1.2rem] border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-950">
        <span className="font-semibold">Story connection:</span> this setup creates the event
        shell. After you submit, the demo seeds realistic climbers, qualifier scores, and finals-ready
        structure so the rest of the story has real data to work with.
      </div>
    </div>
  );
}

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

const GUIDED_SETUP_PRESETS = COMPETITION_PRESETS;

const SETUP_WIZARD_STEPS = [
  {
    id: "basics",
    shortLabel: "Basics",
    title: "Event basics",
    description: "Name the event, confirm the slug, and set the key event details.",
  },
  {
    id: "presets",
    shortLabel: "Preset",
    title: "Competition preset",
    description: "Choose the event shape first so categories, finals eligibility, rounds, and schedule can be generated together.",
  },
  {
    id: "categories",
    shortLabel: "Categories",
    title: "Categories",
    description: "Review the generated registration groups and choose any finals-eligible groups from that same set.",
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

const SETUP_STEP_COACHING = [
  {
    task: "Name the event, pick the format, and set registration timing.",
    unlock: "Presets now apply to a real event instead of a blank shell.",
  },
  {
    task: "Apply the event shape you want before tuning categories.",
    unlock: "Categories, finals eligibility, schedule blocks, and stage flow are generated together.",
  },
  {
    task: "Review who can register and, if needed, who can make finals.",
    unlock: "Schedule blocks now target the right field.",
  },
  {
    task: "Review the day plan and make sure live blocks point at the right rounds.",
    unlock: "Judging and public timing will follow the same event timeline.",
  },
  {
    task: "Confirm the scored stages, boulder counts, and advancement rules.",
    unlock: "This event is now ready to hand into live judging.",
  },
] as const;

const ACT1_SANDBOX_STEP_GUIDANCE: Record<(typeof SETUP_WIZARD_STEPS)[number]["id"], string> = {
  basics: "Start with the same basics organizers use for a real event: identity, format, dates, and registration timing.",
  presets: "Presets are optional accelerators here. Pick one if it helps, or keep customizing manually.",
  categories: "Categories decide who can register and which divisions can later be scored or advanced.",
  schedule: "Schedule blocks connect the public event timeline to what staff and judges run on comp day.",
  stages: "Stages define qualifier/finals rounds, problem counts, scoring buckets, and advancement rules.",
};

const ACT1_SANDBOX_OPERATIONS_GUIDANCE =
  "Operations are the real event-day controls. Review them now, but save and seed the demo before opening the judge panel.";

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
  demoSeedOnCreate = false,
}: {
  initialCompetitionSlug?: string;
  initialCreateDraft?: StaffDashboardCreateDraft;
  demoSeedOnCreate?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const guidedDemoActive = searchParams?.get("demo") === "1";
  const demoMode = false;
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
  const [createLocation, setCreateLocation] = useState("");
  const [createStartDate, setCreateStartDate] = useState("");
  const [createEndDate, setCreateEndDate] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createMaxClimbers, setCreateMaxClimbers] = useState(DEFAULT_MAX_CLIMBERS);
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
  const [guidedAct1StepIndex, setGuidedAct1StepIndex] = useState(0);
  const [selectedGuidedSetupPresetId, setSelectedGuidedSetupPresetId] = useState<CompetitionPresetId | null>(null);
  const [activeOrganizerDemoStep, setActiveOrganizerDemoStep] = useState<OrganizerDemoStepId>("overview");
  const [, setOrganizerGuidedBasicsState] = useState({
    identityReviewed: false,
    formatReviewed: false,
    registrationReviewed: false,
  });
  const [organizerDemoState, setOrganizerDemoState] = useState<{
    setupOpened: boolean;
    categoriesViewed: boolean;
    presetSelected: boolean;
    scheduleViewed: boolean;
    stagesViewed: boolean;
    handoffTarget: OrganizerDemoHandoffTarget | null;
  }>({
    setupOpened: false,
    categoriesViewed: false,
    presetSelected: false,
    scheduleViewed: false,
    stagesViewed: false,
    handoffTarget: null,
  });
  const [organizerAutoplayRunning, setOrganizerAutoplayRunning] = useState(false);
  const [organizerPlaybackStep, setOrganizerPlaybackStep] = useState<OrganizerPlaybackStep | null>(null);
  const [organizerNarration, setOrganizerNarration] = useState<OrganizerNarration | null>(null);
  const [salesAudioEnabled, setSalesAudioEnabled] = useState(false);
  const [demoSessionCompetitionId, setDemoSessionCompetitionId] = useState<string | null>(null);
  const [buildTransitionState, setBuildTransitionState] = useState<OrganizerBuildTransitionState>({
    active: false,
    stepIndex: 0,
    complete: false,
  });
  const [organizerDemoCursor, setOrganizerDemoCursor] = useState<OrganizerDemoCursorState>({
    visible: false,
    x: 0,
    y: 0,
    clicking: false,
    label: null,
  });
  const organizerAutoplayStartedRef = useRef(false);
  const guidedStoryDefaultsAppliedRef = useRef(false);
  const skipNextFinalsNormalizationForDraftIdRef = useRef<string | null>(null);
  const [confirming, setConfirming] = useState<null | {
    title: string;
    description: string;
    confirmLabel: string;
    confirmTone?: "default" | "danger";
    expectedValue?: string;
    action: () => Promise<void>;
  }>(null);
  const [shareOrigin, setShareOrigin] = useState("");
  const isGuidedStoryAct1 = demoSeedOnCreate;
  const currentGuidedAct1StepId = getGuidedAct1FormStepId(guidedAct1StepIndex);
  const [demoAct1Ready, setDemoAct1Ready] = useState<null | {
    competitionId: string;
    slug: string;
    judgeUrl: string;
    target?: {
      climberNumber: string;
      name: string;
      climbNumber: number;
      before: string;
      after: string;
    };
  }>(null);
  const [demoSeedPending, setDemoSeedPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const summaries = await listCompetitionSummaries(true, { authenticated: true });
      const summariesVisibleInThisContext = summaries.filter((entry) => {
        if (demoSeedOnCreate || guidedDemoActive) {
          return entry.competition.is_demo || entry.competition.slug === initialCompetitionSlug;
        }

        return !entry.competition.is_demo || entry.competition.slug === initialCompetitionSlug;
      });
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
        if (demoSeedOnCreate) {
          return "";
        }

        if (current && summariesVisibleInThisContext.some((entry) => entry.competition.id === current)) {
          return current;
        }

        const initialMatch = initialCompetitionSlug
          ? summaries.find((entry) => entry.competition.slug === initialCompetitionSlug)
          : null;
        const preferredDemoSummary =
          demoMode && demoSessionCompetitionId
            ? summaries.find((entry) => entry.competition.id === demoSessionCompetitionId) ?? null
            : null;
        if (demoMode) {
          return initialMatch?.competition.id ?? preferredDemoSummary?.competition.id ?? "";
        }

        return initialMatch?.competition.id ?? summariesVisibleInThisContext[0]?.competition.id ?? "";
      });
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load the staff dashboard.");
    } finally {
      setLoading(false);
    }
  }, [demoMode, demoSeedOnCreate, demoSessionCompetitionId, guidedDemoActive, initialCompetitionSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleSummaries = useMemo(() => {
    if (demoSeedOnCreate || guidedDemoActive) {
      return allSummaries.filter(
        (entry) => entry.competition.is_demo || entry.competition.slug === initialCompetitionSlug
      );
    }

    if (!demoMode) {
      return allSummaries.filter(
        (entry) => !entry.competition.is_demo || entry.competition.slug === initialCompetitionSlug
      );
    }

    if (!demoSessionCompetitionId) {
      return [] as CompetitionSummary[];
    }

    return allSummaries.filter(
      (entry) =>
        entry.competition.id === demoSessionCompetitionId &&
        (entry.competition.is_demo || isDemoDataSlug(entry.competition.slug))
    );
  }, [allSummaries, demoMode, demoSeedOnCreate, demoSessionCompetitionId, guidedDemoActive, initialCompetitionSlug]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (!demoSeedOnCreate) {
      return;
    }

    setMessage("Guided demo mode: create the event normally, then choose when to add sample climbers.");
  }, [demoSeedOnCreate]);


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
  const selectedGuidedSetupPreset =
    GUIDED_SETUP_PRESETS.find((preset) => preset.id === selectedGuidedSetupPresetId) ?? null;
  const orderedDraftScheduleBlocks = useMemo(
    () => (draft ? [...draft.schedule_blocks].sort(compareScheduleBlocks) : []),
    [draft]
  );
  const linkedScheduleBlockCount = orderedDraftScheduleBlocks.filter((block) => Boolean(block.round_id)).length;
  useEffect(() => {
    setSnapshot(null);
    setCurrentSetupStep(0);
    setOrganizerDemoState({
      setupOpened: false,
      categoriesViewed: false,
      presetSelected: false,
      scheduleViewed: false,
      stagesViewed: false,
      handoffTarget: null,
    });
    setOrganizerGuidedBasicsState({
      identityReviewed: false,
      formatReviewed: false,
      registrationReviewed: false,
    });
    setActiveOrganizerDemoStep("overview");
    setOrganizerAutoplayRunning(false);
    setOrganizerPlaybackStep(null);
    setOrganizerNarration(null);
    setOrganizerDemoCursor({
      visible: false,
      x: 0,
      y: 0,
      clicking: false,
      label: null,
    });
  }, [draft?.id]);

  const setupStepCompletion = useMemo(() => {
    if (!draft) {
      return SETUP_WIZARD_STEPS.map(() => false);
    }

    const draftRounds = draft.rounds ?? [];
    const scoringRounds = draftRounds.filter((round) => round.scoring_bucket !== "none");
    const qualifierScoringRound = scoringRounds.find((round) => round.scoring_bucket === "qualifier") ?? null;
    const finalsScoringRound = scoringRounds.find((round) => round.scoring_bucket === "finals") ?? null;
    const roundsAreValid =
      scoringRounds.length > 0 &&
      scoringRounds.every((round) => round.name.trim().length > 0 && round.problem_count > 0);
    const manualStructureReady =
      roundsAreValid &&
      Boolean(qualifierScoringRound) &&
      (!draft.has_finals || Boolean(finalsScoringRound));
    const presetGeneratedStructureReady = Boolean(selectedGuidedSetupPreset && selectedGuidedSetupPreset.id !== "custom");
    const structureReady = presetGeneratedStructureReady || manualStructureReady;
    const finalsCategoriesStayInsideQualifiers = finalsEligibilityUsesSelectedCategories(draft);
    const categoriesReady = draft.qualifier_eligible_age_groups.length > 0 && finalsCategoriesStayInsideQualifiers;
    const scheduleReady =
      draft.schedule_blocks.length > 0 &&
      linkedScheduleBlockCount > 0 &&
      structureReady &&
      scoringRounds.every((round) =>
        draft.schedule_blocks.some(
          (block) =>
            block.round_id === round.id &&
            (block.phase_type === "qualifier_round" ||
              block.phase_type === "finals_round" ||
              block.phase_type === "observation" ||
              block.phase_type === "isolation")
        )
      );
    const stagesReady = structureReady && scheduleReady;

    return [
      Boolean(draft.name.trim() && draft.slug.trim() && draft.location_name.trim()),
      Boolean(selectedGuidedSetupPreset),
      categoriesReady,
      scheduleReady,
      stagesReady,
    ];
  }, [draft, linkedScheduleBlockCount, selectedGuidedSetupPreset]);
  const setupProgressCount = setupStepCompletion.filter(Boolean).length;
  const setupProgressPercent = Math.round((setupProgressCount / SETUP_WIZARD_STEPS.length) * 100);
  const hasPersistedDraft =
    !!draft &&
    !!selectedSummary &&
    JSON.stringify(cloneCompetition(draft)) === JSON.stringify(cloneCompetition(selectedSummary.competition));
  const activeSetupStep = SETUP_WIZARD_STEPS[currentSetupStep] ?? SETUP_WIZARD_STEPS[0];
  const isFirstSetupStep = currentSetupStep === 0;
  const isLastSetupStep = currentSetupStep === SETUP_WIZARD_STEPS.length - 1;
  const demoJudgeReady = demoMode && !!draft && setupProgressCount === SETUP_WIZARD_STEPS.length && hasPersistedDraft;
  const setupSectionAnchors = useMemo(
    () =>
      [
        { id: "setup-basics", label: "Basics", stepIndex: 0 },
        { id: "setup-presets", label: "Preset", stepIndex: 1 },
        { id: "setup-categories", label: "Categories", stepIndex: 2 },
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
      setSelectedGuidedSetupPresetId(null);
      setPhaseBlockMemory({});
      setRoundPlanNeedsReset(false);
      setExpandedRoundId(null);
      setExpandedScheduleBlockId(null);
      return;
    }

    const clonedCompetition = cloneCompetition(selectedSummary.competition);
    skipNextFinalsNormalizationForDraftIdRef.current = clonedCompetition.id;
    setDraft(clonedCompetition);
    setSelectedGuidedSetupPresetId(detectCompetitionPreset(clonedCompetition).id);
    void getCompetitionSnapshot(selectedSummary.competition.id, { authenticated: true })
      .then((nextSnapshot) => setSnapshot(nextSnapshot))
      .catch(() => setSnapshot(null));
    setRoundPlanNeedsReset(false);
  }, [demoMode, selectedSummary]);

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
  const demoJudgePath = draft ? buildStaffCompetitionPath(draft.slug, "judge") : "/demo";
  const displayPath = draft ? buildDisplayPath(draft.slug) : "";
  const publicUrl = publicPath ? `${shareOrigin}${publicPath}` : "";
  const registerUrl = registerPath ? `${shareOrigin}${registerPath}` : "";
  const displayUrl = displayPath ? `${shareOrigin}${displayPath}` : "";
  const registrationQrUrl = `/api/qr?size=180&data=${encodeURIComponent(registerUrl || registerPath)}`;
  const printableRegistrationQrUrl = `/api/qr?size=720&data=${encodeURIComponent(registerUrl || registerPath)}`;
  const selectedCompetitionIsDemo = draft ? isDemoCompetitionRecord(draft) : false;
  const canEditPhase = profile?.role === "admin";
  const canEditSetup = profile?.role === "admin";
  const canRestoreDemo = false;
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
  const qualifierCategories = useMemo(
    () => (draft ? getSelectedQualifierCategories(draft) : []),
    [draft]
  );
  const finalsEligibilityOptions = useMemo(
    () => (draft ? getFinalsEligibilityOptions(draft) : []),
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

  const refreshSelectedSnapshot = useCallback(async (competitionId: string) => {
    const nextSnapshot = await getCompetitionSnapshot(competitionId, { authenticated: true });
    setSnapshot(nextSnapshot);
  }, []);

  const refreshAfterChange = useCallback(async (competitionId?: string) => {
    await load();
    if (competitionId) {
      await refreshSelectedSnapshot(competitionId);
    }
  }, [load, refreshSelectedSnapshot]);

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

  const saveDraftNow = useCallback(async () => {
    if (!draft) {
      throw new Error("No event is selected.");
    }

    setError("");
    setMessage("");
    await saveCompetitionConfig(draft.id, {
      ...draft,
      schedule_blocks: draft.schedule_blocks,
      rounds: draft.rounds ?? [],
    });
    await refreshAfterChange(draft.id);
    setRoundPlanNeedsReset(false);
  }, [draft, refreshAfterChange]);

  const seedDemoAndOpenJudge = useCallback(async () => {
    if (!draft || !demoAct1Ready) {
      setError("Create the demo event before opening the judge panel.");
      return;
    }

    if (!draft.categories.length) {
      setError("Add at least one category before opening the judge panel.");
      return;
    }

    setDemoSeedPending(true);
    setError("");
    setMessage("Saving setup and adding sample climbers...");

    try {
      await saveDraftNow();
      const response = await fetch("/api/demo/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionId: draft.id }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        judgeUrl?: string;
        target?: {
          climberNumber: string;
          name: string;
          climbNumber: number;
          before: string;
          after: string;
        };
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Unable to seed demo data.");
      }

      setDemoAct1Ready((current) =>
        current
          ? {
              ...current,
              judgeUrl: payload.judgeUrl ?? current.judgeUrl,
              target: payload.target,
            }
          : current
      );
      router.push(payload.judgeUrl ?? demoAct1Ready.judgeUrl);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to open the judge panel.");
      setMessage("");
    } finally {
      setDemoSeedPending(false);
    }
  }, [demoAct1Ready, draft, router, saveDraftNow]);

  const resetDemoSessionCompetition = useCallback(async () => {
    setError("");
    setMessage("");
    await load();
    setSelectedCompetitionId("");
    setSnapshot(null);
    setDraft(null);
    setMessage("Demo state cleared locally. Create another demo event when ready.");
  }, [load]);

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

  useEffect(() => {
    if (!draft) {
      return;
    }

    if (skipNextFinalsNormalizationForDraftIdRef.current === draft.id) {
      skipNextFinalsNormalizationForDraftIdRef.current = null;
      return;
    }

    const normalizedDraft = normalizeCompetitionFinalsSetup(draft);
    if (normalizedDraft.changed) {
      setDraft(normalizedDraft.competition);
    }
  }, [draft]);

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

  const applyGuidedSetupPreset = useCallback((presetId: CompetitionPresetId) => {
    if (!draft) {
      return;
    }

    const preset = getCompetitionPreset(presetId);
    if (preset.id === "custom") {
      setSelectedGuidedSetupPresetId("custom");
      setMessage("Custom setup selected. Existing categories, rounds, and schedule were kept.");
      return;
    }

    const finalsEligibleCategories = getPresetFinalsEligibleCategories(preset);
    const baseCompetition = {
      ...draft,
      format: preset.format,
      has_finals: preset.finalsEnabled,
      finals_cutoff: preset.finalsCutoff,
      finals_tie_advances: preset.tiesAdvanceDefault,
      total_climbs: preset.qualifierProblemCount,
      qualifier_counting_climbs: preset.countingClimbs,
      finals_problem_count: preset.finalsProblemCount,
      qualifier_eligible_age_groups: [...preset.defaultCategories],
      finals_eligible_age_groups: finalsEligibleCategories,
    };

    const rounds = buildRoundPlanTemplate(baseCompetition);

    const nextCompetition = normalizeCompetition(
      {
        ...baseCompetition,
        rounds,
      },
      baseCompetition.categories,
      [],
      rounds
    );

    const scheduleTemplates =
      preset.defaultScheduleBlocks.length > 0 ? preset.defaultScheduleBlocks : buildScheduleBlockTemplates(nextCompetition);
    const presetQualifierCategories = nextCompetition.categories.filter((category) =>
      nextCompetition.qualifier_eligible_age_groups.includes(category.age_group)
    );

    const scheduleBlocks = reindexScheduleBlocks(
      scheduleTemplates.map((template, index) =>
        createScheduleBlockFromTemplate(nextCompetition, template, presetQualifierCategories, index)
      )
    );

    setDraft({
      ...nextCompetition,
      rounds,
      schedule_blocks: scheduleBlocks,
      has_finals: preset.finalsEnabled,
    });
    setSelectedGuidedSetupPresetId(presetId);
    setRoundPlanNeedsReset(false);
    setMessage(`Guided setup applied: ${preset.name}.`);
  }, [draft]);

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
  const currentPhaseScheduleBlock = draft ? findScheduleBlockForPhase(draft.current_phase, 1) : null;
  const canAdvanceToFinals = draft
    ? draftHasFinals &&
      ["qualifier_open", "qualifier_closed", "wall_reset"].includes(draft.current_phase) &&
      Boolean(snapshot?.finalists.length)
    : false;
  const demoBanner = demoMode
    ? "You're viewing a sample event walkthrough. Editing and staff-only actions stay protected in the public demo."
    : selectedCompetitionIsDemo
      ? "This is a demo event, and admins can edit it here like any other event."
    : "";
  const demoDataExportAllowed = demoMode && isDemoDataSlug(draft?.slug);
  const currentCompetitionStages = useMemo(() => draft?.rounds ?? [], [draft?.rounds]);
  const qualifierStage = currentCompetitionStages.find((round) => round.scoring_bucket === "qualifier") ?? null;
  const finalsStage = currentCompetitionStages.find((round) => round.scoring_bucket === "finals") ?? null;
  const setupStepSummaries = useMemo(() => {
    if (!draft) {
      return [] as string[];
    }

    return [
      setupStepCompletion[0]
        ? `${draft.name || "Event"} is grounded and ready for setup.`
        : "Ground the event with its name, format, and registration window.",
      setupStepCompletion[1]
        ? `${selectedGuidedSetupPreset?.name ?? "Custom"} is the starting point.`
        : "Choose a preset before tuning categories.",
      setupStepCompletion[2]
        ? `${draft.qualifier_eligible_age_groups.length} registration groups are set.`
        : "Review the generated groups and keep finals eligibility inside that field.",
      setupStepCompletion[3]
        ? `${orderedDraftScheduleBlocks.length} schedule blocks are planned and linked.`
        : "Make sure the day plan and live rounds point at each other.",
      setupStepCompletion[4] && selectedGuidedSetupPreset && selectedGuidedSetupPreset.id !== "custom"
        ? `${selectedGuidedSetupPreset.name} generated the event structure.`
        : setupStepCompletion[4]
          ? `${currentCompetitionStages.length} stage${currentCompetitionStages.length === 1 ? "" : "s"} are ready to score.`
          : "Confirm the scored stages before moving on.",
    ].slice(0, SETUP_WIZARD_STEPS.length);
  }, [currentCompetitionStages.length, draft, orderedDraftScheduleBlocks.length, selectedGuidedSetupPreset, setupStepCompletion]);
  const activeSetupCoaching = SETUP_STEP_COACHING[currentSetupStep] ?? SETUP_STEP_COACHING[0];
  const wizardGuardrails = useMemo(() => {
    if (!draft) {
      return [] as { label: string; ok: boolean; okMessage: string; warningMessage: string }[];
    }

    return [
      {
        label: "Qualifier categories selected",
        ok: draft.qualifier_eligible_age_groups.length > 0,
        okMessage: "Registration groups are ready for the event timeline.",
        warningMessage: "Choose at least one qualifier group so climbers know who this event is for.",
      },
      {
        label: "Finals categories are in the qualifier field",
        ok: finalsEligibilityUsesSelectedCategories(draft),
        okMessage: "Finals eligibility only uses selected category records.",
        warningMessage: "Remove finals-eligible groups that do not map to selected qualifier category records.",
      },
      {
        label: "Schedule blocks added",
        ok: orderedDraftScheduleBlocks.length > 0,
        okMessage: "The event timeline is laid out.",
        warningMessage: "Add schedule blocks so staff and climbers can see how the day is structured.",
      },
      {
        label: "Scoring blocks linked to a stage",
        ok:
          linkedScheduleBlockCount > 0 &&
          currentCompetitionStages
            .filter((round) => round.scoring_bucket !== "none")
            .every((round) => orderedDraftScheduleBlocks.some((block) => block.round_id === round.id)),
        okMessage: "Live scoring blocks are connected to real competition stages.",
        warningMessage: "Link at least one scoring block to a stage so live results know where to publish.",
      },
      {
        label: "Finals scoring is ready",
        ok: !draftHasFinals || Boolean(finalsStage),
        okMessage: "Finals can publish real results when that round goes live.",
        warningMessage: "If this event includes finals, add a real finals scoring stage before using it for finals day.",
      },
    ];
  }, [currentCompetitionStages, draft, draftHasFinals, finalsStage, linkedScheduleBlockCount, orderedDraftScheduleBlocks]);
  const readyToSaveChecklist = useMemo(() => {
    if (!draft) {
      return [] as { label: string; ok: boolean }[];
    }

    return [
      { label: "Event details filled", ok: Boolean(draft.name.trim() && draft.slug.trim() && draft.location_name.trim()) },
      { label: "Preset selected", ok: setupStepCompletion[1] },
      { label: "Categories selected", ok: setupStepCompletion[2] },
      { label: "Schedule is linked to scoring", ok: setupStepCompletion[3] },
      { label: "Scoring stages are ready", ok: setupStepCompletion[4] },
    ];
  }, [draft, setupStepCompletion]);
  const demoAct1CreatedForCurrentDraft =
    Boolean(demoAct1Ready && draft && demoAct1Ready.competitionId === draft.id);
  const demoAct1ProgressItems = useMemo(
    () => [
      { label: "Basics", ok: draft ? setupStepCompletion[0] : Boolean(createName.trim()) },
      { label: "Categories", ok: Boolean(draft?.categories.length) },
      { label: "Schedule", ok: Boolean(draft?.schedule_blocks.length) },
      { label: "Stages", ok: Boolean(draft?.rounds?.length) },
      { label: "Ready", ok: demoAct1CreatedForCurrentDraft && Boolean(draft?.categories.length) },
    ],
    [createName, demoAct1CreatedForCurrentDraft, draft, setupStepCompletion]
  );
  const demoAct1Warnings = useMemo(() => {
    if (!draft || !demoAct1CreatedForCurrentDraft) {
      return [] as Array<{ tone: "error" | "warning"; message: string }>;
    }

    const warnings: Array<{ tone: "error" | "warning"; message: string }> = [];
    if (!draft.categories.length) {
      warnings.push({
        tone: "error",
        message: "Add at least one category before opening the judge panel.",
      });
    }
    if (!competitionHasFinals(draft) || !currentCompetitionStages.some((round) => round.scoring_bucket === "finals")) {
      warnings.push({
        tone: "warning",
        message: "The demo includes finals. Continue anyway or add one.",
      });
    }
    if (!draft.schedule_blocks.length) {
      warnings.push({
        tone: "warning",
        message: "No schedule blocks yet. Continue anyway or add schedule blocks so the day has structure.",
      });
    }

    return warnings;
  }, [currentCompetitionStages, demoAct1CreatedForCurrentDraft, draft]);
  const stageFlowSummary = currentCompetitionStages.length
    ? currentCompetitionStages.map((round) => getRoundLabel(round.round_type, 0)).join(" -> ")
    : "No stage flow yet";
  const updateOrganizerDemoState = useCallback(
    (patch: Partial<typeof organizerDemoState>) => {
      if (!demoMode) {
        return;
      }

      setOrganizerDemoState((current) => ({
        ...current,
        ...patch,
      }));
    },
    [demoMode]
  );
  const goToSetupStep = useCallback(
    (stepIndex: number) => {
      const nextIndex = Math.max(0, Math.min(SETUP_WIZARD_STEPS.length - 1, stepIndex));
      setCurrentSetupStep(nextIndex);

      if (!demoMode) {
        return;
      }

      setOrganizerDemoState((current) => ({
        ...current,
        setupOpened: true,
      }));
    },
    [demoMode]
  );
  const goToGuidedAct1Step = useCallback((stepIndex: number) => {
    const nextIndex = clampGuidedAct1StepIndex(stepIndex);
    setGuidedAct1StepIndex(nextIndex);

    const anchorId = GUIDED_ORGANIZER_ACT_1_STEPS[nextIndex]?.anchorId;
    if (!anchorId || typeof window === "undefined") {
      return;
    }

    window.setTimeout(() => {
      document.getElementById(anchorId)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 0);
  }, []);
  const handleOrganizerPresetSelection = (presetId: CompetitionPresetId) => {
    if (
      draft &&
      presetId !== "custom" &&
      selectedGuidedSetupPresetId &&
      selectedGuidedSetupPresetId !== presetId &&
      !window.confirm(
        "Changing presets will overwrite generated categories, finals eligibility, rounds, and schedule blocks. Continue?"
      )
    ) {
      return;
    }

    applyGuidedSetupPreset(presetId);
    updateOrganizerDemoState({ presetSelected: true });
  };
  const handleOrganizerSetupStart = useCallback(() => {
    updateOrganizerDemoState({ setupOpened: true });
    goToSetupStep(0);
  }, [goToSetupStep, updateOrganizerDemoState]);
  const handleOrganizerHandoff = useCallback(
    (target: OrganizerDemoHandoffTarget) => {
      updateOrganizerDemoState({ handoffTarget: target });
    },
    [updateOrganizerDemoState]
  );
  const resetOrganizerDemoWalkthrough = useCallback(() => {
    if (!selectedSummary) {
      return;
    }

    const clonedCompetition = cloneCompetition(selectedSummary.competition);
    skipNextFinalsNormalizationForDraftIdRef.current = clonedCompetition.id;
    setDraft(clonedCompetition);
    setCurrentSetupStep(0);
    setSelectedGuidedSetupPresetId(detectCompetitionPreset(clonedCompetition).id);
    setOrganizerDemoState({
      setupOpened: false,
      categoriesViewed: false,
      presetSelected: false,
      scheduleViewed: false,
      stagesViewed: false,
      handoffTarget: null,
    });
    setOrganizerGuidedBasicsState({
      identityReviewed: false,
      formatReviewed: false,
      registrationReviewed: false,
    });
    setActiveOrganizerDemoStep("overview");
    setOrganizerAutoplayRunning(false);
    setOrganizerPlaybackStep(null);
    setOrganizerNarration(null);
    setBuildTransitionState({
      active: false,
      stepIndex: 0,
      complete: false,
    });
    setOrganizerDemoCursor({
      visible: false,
      x: 0,
      y: 0,
      clicking: false,
      label: null,
    });
    writeDemoSalesSession(
      createDemoSalesSession({
        mode: "organizer",
        storyStep: "organizer-intro",
        narratorTitle: "Choose a comp format. Generate the day. Hand it into live judging.",
        narratorBody:
          "This sales story starts in organizer setup, then carries the same event into the judge station and public results.",
        autoplay: false,
        phase: "organizer",
        organizerCompleted: false,
        judgePending: false,
        persistentCompletion: false,
        audioEnabled: salesAudioEnabled,
        competitionId: selectedSummary.competition.id,
        competitionSlug: selectedSummary.competition.slug,
      })
    );
    setError("");
    setMessage("");
  }, [salesAudioEnabled, selectedSummary]);
  const organizerDemoSectionClass = useCallback(
    (stepIds: OrganizerDemoStepId | OrganizerDemoStepId[]) => {
      if (!demoMode) {
        return "";
      }

      const targets = Array.isArray(stepIds) ? stepIds : [stepIds];
      if (organizerAutoplayRunning) {
        return targets.includes(activeOrganizerDemoStep)
          ? "demo-organizer-focus demo-organizer-autoplay-active"
          : "demo-organizer-dim demo-organizer-autoplay-dim";
      }

      return targets.includes(activeOrganizerDemoStep) ? "demo-organizer-focus" : "demo-organizer-dim";
    },
    [activeOrganizerDemoStep, demoMode, organizerAutoplayRunning]
  );
  const organizerFieldFocusClass = useCallback(
    (stepIds: OrganizerDemoStepId | OrganizerDemoStepId[]) => {
      if (!demoMode) {
        return "";
      }

      const targets = Array.isArray(stepIds) ? stepIds : [stepIds];
      return targets.includes(activeOrganizerDemoStep)
        ? "ring-2 ring-sky-300/80 shadow-[0_18px_42px_rgba(14,116,215,0.12)]"
        : "";
    },
    [activeOrganizerDemoStep, demoMode]
  );
  const focusOrganizerDemoAnchor = useCallback((anchor: string) => {
    if (typeof document === "undefined") {
      return;
    }

    const element = document.querySelector<HTMLElement>(`[data-demo-anchor="${anchor}"]`);
    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }, []);
  const waitForOrganizerPlayback = useCallback(
    (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms)),
    []
  );
  const moveOrganizerDemoCursor = useCallback(
    async (
      anchor: string,
      options?: {
        click?: boolean;
        label?: string | null;
        settleMs?: number;
      }
    ) => {
      const element = document.querySelector<HTMLElement>(`[data-demo-anchor="${anchor}"]`);
      if (!element) {
        return;
      }

      element.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "smooth",
      });

      await waitForOrganizerPlayback(options?.settleMs ?? 700);

      const rect = element.getBoundingClientRect();
      setOrganizerDemoCursor({
        visible: true,
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * 0.5,
        clicking: false,
        label: options?.label ?? null,
      });

      await waitForOrganizerPlayback(420);

      if (options?.click) {
        setOrganizerDemoCursor((current) => ({
          ...current,
          clicking: true,
        }));
        await waitForOrganizerPlayback(260);
        setOrganizerDemoCursor((current) => ({
          ...current,
          clicking: false,
        }));
      }
    },
    [waitForOrganizerPlayback]
  );

  const runOrganizerBuildTransition = useCallback(async () => {
    if (!draft) {
      return;
    }

    setBuildTransitionState({
      active: true,
      stepIndex: 0,
      complete: false,
    });
    setOrganizerPlaybackStep("handoff");
    setOrganizerNarration({
      title: "Finalizing the event you just built",
      body: "We are saving this exact organizer setup, filling the field, and opening judge mode on the same event.",
    });
    writeDemoSalesSession(
      createDemoSalesSession({
        mode: "organizer",
        phase: "build",
        storyStep: "organizer-build",
        narratorTitle: "Finalizing the event you just built",
        narratorBody:
          "We are saving this exact organizer setup, filling the field, and opening judge mode on the same event.",
        autoplay: false,
        organizerCompleted: true,
        judgePending: true,
        persistentCompletion: false,
        audioEnabled: salesAudioEnabled,
        competitionId: draft.id,
        competitionSlug: draft.slug,
      })
    );

    try {
      setBuildTransitionState({
        active: true,
        stepIndex: 0,
        complete: false,
      });
      setOrganizerNarration({
        title: ORGANIZER_BUILD_TRANSITION_STEPS[0],
        body: "The organizer setup is being saved so judge mode opens on the same persisted event you just configured.",
      });
      await saveDraftNow();
      await waitForOrganizerPlayback(450);

      for (let index = 1; index < ORGANIZER_BUILD_TRANSITION_STEPS.length; index += 1) {
        setBuildTransitionState({
          active: true,
          stepIndex: index,
          complete: false,
        });
        setOrganizerNarration({
          title: ORGANIZER_BUILD_TRANSITION_STEPS[index],
          body:
            index < ORGANIZER_BUILD_TRANSITION_STEPS.length - 1
              ? "This handoff keeps the same event and adds the field data needed for a believable comp day."
              : "Judge mode is ready. You are still on the same event, now with a full field and live scoring.",
        });

        await waitForOrganizerPlayback(900);
      }

      setBuildTransitionState({
        active: true,
        stepIndex: ORGANIZER_BUILD_TRANSITION_STEPS.length - 1,
        complete: true,
      });
      writeDemoSalesSession(
        createDemoSalesSession({
          mode: "judge",
          phase: "judge",
          storyStep: "judge-save",
          narratorTitle: "The event you just built is now powering live judging.",
          narratorBody:
            "Stay with the same event as it moves into one judge save, a live leaderboard reaction, and an offline recovery moment.",
          autoplay: false,
          organizerCompleted: true,
          judgePending: true,
          persistentCompletion: false,
          audioEnabled: salesAudioEnabled,
          competitionId: draft.id,
          competitionSlug: draft.slug,
        })
      );
      await waitForOrganizerPlayback(650);
      router.push(demoJudgePath);
    } catch (nextError) {
      setBuildTransitionState({
        active: false,
        stepIndex: 0,
        complete: false,
      });
      setError(nextError instanceof Error ? nextError.message : "Unable to launch the judge demo.");
    }
  }, [demoJudgePath, draft, router, salesAudioEnabled, saveDraftNow, waitForOrganizerPlayback]);

  const runOrganizerDemo = useCallback(async () => {
    if (!demoMode || organizerAutoplayRunning || !draft) {
      return;
    }

    if (!DEMO_AUTOPLAY_ENABLED) {
      resetOrganizerDemoWalkthrough();
      setOrganizerAutoplayRunning(false);
      setOrganizerPlaybackStep(null);
      setOrganizerDemoCursor({
        visible: false,
        x: 0,
        y: 0,
        clicking: false,
        label: null,
      });
      setOrganizerNarration({
        title: "Guided demo is hands-on now",
        body:
          "The autoplay cursor is disabled. Use the setup cards yourself, then open the judge panel when you are ready.",
      });
      setMessage("Autoplay is disabled for the guided story. Use the setup cards manually.");
      return;
    }

    resetOrganizerDemoWalkthrough();
    setOrganizerAutoplayRunning(true);
    setError("");
    setMessage("Organizer pitch started. Watch the event build itself, then hand off into live judging.");
    writeDemoSalesSession(
      createDemoSalesSession({
        mode: "organizer",
        storyStep: "organizer-intro",
        narratorTitle: "Start with a comp format, not a blank admin tool",
        narratorBody:
          "This organizer demo shows the setup path a gym owner actually cares about: choose the event shape, generate the day, then hand the same event into live scoring.",
        autoplay: false,
        organizerCompleted: false,
        audioEnabled: salesAudioEnabled,
        competitionId: draft.id,
        competitionSlug: draft.slug,
      })
    );

    try {
      setOrganizerPlaybackStep("intro");
      setOrganizerNarration({
        title: "Start with a comp format, not a blank admin tool",
        body: "This organizer demo shows the setup path a gym owner actually cares about: choose the event shape, generate the day, then hand the same event into live scoring.",
      });
      patchDemoSalesSession({
        storyStep: "organizer-intro",
      });
      await moveOrganizerDemoCursor("organizer-run-demo", {
        click: true,
        label: "Run organizer demo",
      });
      await waitForOrganizerPlayback(2200);

      setOrganizerPlaybackStep("preset");
      goToSetupStep(1);
      setOrganizerNarration({
        title: "Apply a proven comp format",
        body: "First, the organizer chooses a tested setup that generates categories, finals eligibility, competition stages, and the day plan together.",
      });
      patchDemoSalesSession({
        storyStep: "organizer-preset",
        narratorTitle: "Apply a proven comp format",
        narratorBody:
          "First, the organizer chooses a tested setup that generates categories, finals eligibility, competition stages, and the day plan together.",
      });
      await moveOrganizerDemoCursor("organizer-step-preset", {
        click: true,
        label: "Preset",
      });
      await waitForOrganizerPlayback(1200);
      await moveOrganizerDemoCursor("organizer-preset-open-boulder", {
        click: true,
        label: "Open championship",
      });
      applyGuidedSetupPreset("open_boulder_championship");
      updateOrganizerDemoState({ presetSelected: true });
      await waitForOrganizerPlayback(2400);

      setOrganizerPlaybackStep("categories");
      goToSetupStep(2);
      setOrganizerNarration({
        title: "Review the generated categories",
        body: "After the preset lands, the organizer can trim the registration groups and choose finals-eligible categories from that same selected field.",
      });
      patchDemoSalesSession({
        storyStep: "organizer-categories",
        narratorTitle: "Review the generated categories",
        narratorBody:
          "After the preset lands, the organizer can trim the registration groups and choose finals-eligible categories from that same selected field.",
      });
      await moveOrganizerDemoCursor("organizer-step-categories", {
        click: true,
        label: "Categories",
      });
      await waitForOrganizerPlayback(2200);

      setOrganizerPlaybackStep("schedule");
      goToSetupStep(3);
      setOrganizerNarration({
        title: "Review the day schedule",
        body: "The schedule blocks are generated from that format, so the event timeline is already linked to the right competition moments.",
      });
      patchDemoSalesSession({
        storyStep: "organizer-schedule",
        narratorTitle: "Review the day schedule",
        narratorBody:
          "The schedule blocks are generated from that format, so the event timeline is already linked to the right competition moments.",
      });
      await moveOrganizerDemoCursor("organizer-step-schedule", {
        click: true,
        label: "Schedule",
      });
      await waitForOrganizerPlayback(2300);

      setOrganizerPlaybackStep("stages");
      goToSetupStep(4);
      setOrganizerNarration({
        title: "Confirm the competition stages",
        body: "Now the organizer can see exactly how qualifiers and finals connect before anyone ever walks onto the mats.",
      });
      patchDemoSalesSession({
        storyStep: "organizer-stages",
        narratorTitle: "Confirm the competition stages",
        narratorBody:
          "Now the organizer can see exactly how qualifiers and finals connect before anyone ever walks onto the mats.",
      });
      await moveOrganizerDemoCursor("organizer-step-stages", {
        click: true,
        label: "Stages",
      });
      await waitForOrganizerPlayback(2400);

      setOrganizerPlaybackStep("handoff");
      setOrganizerNarration({
        title: "The event structure is ready for judging",
        body: "The organizer side is complete. Next, this same event is hydrated with a field and opened in judge mode.",
      });
      patchDemoSalesSession({
        storyStep: "organizer-handoff",
        narratorTitle: "The event structure is ready for judging",
        narratorBody:
          "The organizer side is complete. Next, this same event is hydrated with a field and opened in judge mode.",
        organizerCompleted: true,
        phase: "organizer",
        judgePending: true,
      });
      await moveOrganizerDemoCursor("organizer-handoff-judge", {
        click: true,
        label: "Judge station demo",
      });
      handleOrganizerHandoff("judge");
      await waitForOrganizerPlayback(2200);
      await runOrganizerBuildTransition();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to run the organizer demo.");
    } finally {
      setOrganizerAutoplayRunning(false);
      setOrganizerDemoCursor((current) => ({
        ...current,
        visible: false,
        clicking: false,
        label: null,
      }));
    }
  }, [
    demoMode,
    draft,
    goToSetupStep,
    applyGuidedSetupPreset,
    handleOrganizerHandoff,
    organizerAutoplayRunning,
    resetOrganizerDemoWalkthrough,
    runOrganizerBuildTransition,
    salesAudioEnabled,
    updateOrganizerDemoState,
    waitForOrganizerPlayback,
    moveOrganizerDemoCursor,
  ]);
  useEffect(() => {
    if (!demoMode || !draft || organizerAutoplayStartedRef.current) {
      return;
    }

    const session = readDemoSalesSession();
    if (!session) {
      return;
    }

    if (session.mode === "organizer" && session.autoplay) {
      organizerAutoplayStartedRef.current = true;
      void runOrganizerDemo();
    }
  }, [demoMode, draft, runOrganizerDemo]);
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

        {error ? <Alert variant="error">{error}</Alert> : null}
        {message ? <Alert variant="success">{message}</Alert> : null}
        {demoMode && !isGuidedStoryAct1 ? (
          <DemoSalesShell
            mode="organizer"
            stepLabel={organizerPlaybackStep ? ORGANIZER_STEP_LABELS[organizerPlaybackStep] : "Organizer · sales intro"}
            title={
              organizerNarration?.title ??
              "Choose a comp format. Generate the day. Hand it straight into live judging."
            }
            body={
              organizerNarration?.body ??
              "This guided organizer story shows how a gym can set up the event once, then carry the same model into judging, leaderboards, and display."
            }
            autoplayRunning={organizerAutoplayRunning || buildTransitionState.active}
            audioEnabled={salesAudioEnabled}
            onReplay={() => void runOrganizerDemo()}
            onSkipToJudge={() => void runOrganizerBuildTransition()}
            onBackToOrganizer={() => {}}
            onToggleAudio={() => {
              const nextValue = !salesAudioEnabled;
              setSalesAudioEnabled(nextValue);
              const existing = readDemoSalesSession();
              if (existing) {
                patchDemoSalesSession({ audioEnabled: nextValue });
              } else {
                writeDemoSalesSession(
                  createDemoSalesSession({
                    mode: "organizer",
                    phase: "organizer",
                    storyStep: "organizer-intro",
                    narratorTitle:
                      "Choose a comp format. Generate the day. Hand it into live judging.",
                    narratorBody:
                      "This sales story starts in organizer setup, then carries the same event into the judge station and public results.",
                    autoplay: false,
                    organizerCompleted: false,
                    judgePending: false,
                    persistentCompletion: false,
                    audioEnabled: nextValue,
                    competitionId: draft?.id ?? demoSessionCompetitionId ?? null,
                    competitionSlug: draft?.slug ?? null,
                  })
                );
              }
            }}
          />
        ) : null}
        {demoMode && buildTransitionState.active ? (
          <Surface variant="card" className="overflow-hidden border-sky-200 bg-sky-50/70">
            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div className="space-y-3">
                <div className="results-kicker text-sky-700">Building the event</div>
                <h2 className="text-3xl font-semibold text-slate-950 sm:text-4xl">
                  The organizer setup is becoming a live comp.
                </h2>
                <p className="max-w-2xl text-base leading-7 text-slate-600">
                  The demo is saving your event setup, simulating registrations, generating seeded scores, and opening the judge workspace.
                </p>
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-sm font-medium text-sky-800">
                  <span className="demo-live-dot" aria-hidden="true" />
                  {buildTransitionState.complete ? "Judge station ready" : "Building the live event now"}
                </div>
              </div>
              <div className="rounded-[2rem] border border-sky-200/80 bg-white/90 p-5 shadow-[0_20px_60px_-30px_rgba(14,165,233,0.4)]">
                <div className="space-y-3">
                  {ORGANIZER_BUILD_TRANSITION_STEPS.map((step, index) => {
                    const active = index === buildTransitionState.stepIndex;
                    const done = index < buildTransitionState.stepIndex || buildTransitionState.complete;
                    return (
                      <div
                        key={step}
                        className={`flex items-center gap-3 rounded-[1.25rem] border px-4 py-3 transition ${
                          active
                            ? "border-sky-300 bg-sky-100 text-sky-950 shadow-[0_18px_40px_-28px_rgba(14,165,233,0.45)]"
                            : done
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : "border-slate-200 bg-slate-50 text-slate-500"
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                            done ? "bg-emerald-500 text-white" : active ? "bg-sky-500 text-white" : "bg-slate-200 text-slate-500"
                          }`}
                        >
                          {done ? "✓" : index + 1}
                        </div>
                        <div className="text-sm font-medium">{step}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Surface>
        ) : null}
        {isGuidedStoryAct1 ? (
          <Surface variant="card" className="border-emerald-200 bg-emerald-50/80">
            <div className="space-y-5">
                <div className="results-kicker text-emerald-700">Act 1 - Guided organizer sandbox</div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Organizer: Build Event
                </h1>
                <p className="max-w-4xl text-sm leading-6 text-slate-700 sm:text-base sm:leading-7">
                  You are using the real staff dashboard. The guide adds context and guardrails, but
                  it does not lock presets, auto-fill inputs, or save anything for you.
                </p>
                <p className="max-w-4xl text-sm leading-6 text-emerald-950">
                  Build the event your way. When you are ready, you will explicitly add sample
                  climbers and move to the real judge panel.
                </p>
                <div className="grid gap-2 sm:grid-cols-5">
                  {demoAct1ProgressItems.map((item) => (
                    <div
                      key={item.label}
                      className={`rounded-[1rem] border px-3 py-2 text-sm ${
                        item.ok
                          ? "border-emerald-200 bg-white/90 text-emerald-950"
                          : "border-emerald-100 bg-emerald-50/70 text-emerald-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${item.ok ? "bg-emerald-500" : "bg-emerald-200"}`}
                          aria-hidden="true"
                        />
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          </Surface>
        ) : null}
        {demoMode && !isGuidedStoryAct1 && draft ? (
          <OrganizerDemoTour
            hasCreatedCompetition={Boolean(draft)}
            competitionName={draft.name}
            eventDetailsComplete={setupProgressCount === SETUP_WIZARD_STEPS.length}
            eventSaved={hasPersistedDraft}
            judgeReady={demoJudgeReady}
            suppressed={organizerAutoplayRunning || organizerPlaybackStep !== null || buildTransitionState.active}
            onActiveStepChange={setActiveOrganizerDemoStep}
            onRestart={resetOrganizerDemoWalkthrough}
            onJumpToCreate={() => {
              document.getElementById("create-event-name")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            onFocusAnchor={focusOrganizerDemoAnchor}
            onLaunchJudge={() => void runOrganizerBuildTransition()}
          />
        ) : demoMode && !isGuidedStoryAct1 ? (
          <OrganizerDemoTour
            hasCreatedCompetition={false}
            competitionName=""
            eventDetailsComplete={false}
            eventSaved={false}
            judgeReady={false}
            suppressed={organizerAutoplayRunning || organizerPlaybackStep !== null || buildTransitionState.active}
            onActiveStepChange={setActiveOrganizerDemoStep}
            onRestart={() => {
              void resetDemoSessionCompetition();
            }}
            onJumpToCreate={() => {
              document.getElementById("create-event-name")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            onFocusAnchor={focusOrganizerDemoAnchor}
            onLaunchJudge={() => undefined}
          />
        ) : null}
        {demoMode ? <Alert>{demoBanner}</Alert> : null}
        {!demoMode && profile?.role === "judge" ? (
          <Alert>
            You can review event setup here, but only admins can create events or edit round and schedule configuration.
          </Alert>
        ) : null}

        {demoMode && organizerNarration ? (
          <Surface variant="row" className="border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(255,255,255,0.94))]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="results-kicker text-sky-700">
                  {organizerAutoplayRunning ? "Autoplay walkthrough" : "Walkthrough summary"}
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  {organizerNarration.title}
                </h2>
                <p className="max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
                  {organizerNarration.body}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/90 px-4 py-2 text-sm font-semibold text-sky-800 shadow-[0_10px_24px_rgba(14,116,215,0.08)]">
                <span className="demo-live-dot" aria-hidden="true" />
                <span>{organizerAutoplayRunning ? "Follow the real setup flow" : "Ready to replay"}</span>
              </div>
            </div>
          </Surface>
        ) : null}
        {demoAct1CreatedForCurrentDraft ? (
          <Surface variant="card" className="border-emerald-200 bg-emerald-50/90">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="results-kicker text-emerald-700">Act 1 complete</div>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                  Your event is ready. Next, you&apos;ll score athletes as a judge.
                </h2>
                <p className="max-w-3xl text-sm leading-6 text-slate-700">
                  Review or adjust anything below. When you click Go to Judge Panel, we will save
                  this setup, add sample climbers and scores, then open the real judge route.
                </p>
                {demoAct1Warnings.length ? (
                  <div className="space-y-2">
                    {demoAct1Warnings.map((warning) => (
                      <div
                        key={warning.message}
                        className={`rounded-[1rem] border px-3 py-2 text-sm font-medium ${
                          warning.tone === "error"
                            ? "border-rose-200 bg-rose-50 text-rose-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }`}
                      >
                        {warning.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="results-primary-button"
                  disabled={demoSeedPending || !draft?.categories.length}
                  onClick={() => void seedDemoAndOpenJudge()}
                >
                  {demoSeedPending ? "Adding sample climbers..." : "Go to Judge Panel"}
                </button>
                <Link href="/demo" className="results-secondary-button">
                  Back to Demo Home
                </Link>
              </div>
            </div>
          </Surface>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="results-card">
            {demoMode ? (
              <div data-demo-anchor="organizer-overview" className={organizerDemoSectionClass("overview")}>
                <div className="results-kicker">Experience as an organizer</div>
                <h1 className="results-editorial-title mt-2 text-4xl font-semibold text-slate-950 sm:text-5xl">
                  Build the event on the real setup spine.
                </h1>
                <div className="results-hero-subline">
                  Start with a clean shell, move through the same setup steps staff would actually use, then hand this event into live judging and public results.
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  {draft ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void runOrganizerDemo()}
                        className="results-primary-button"
                        data-demo-anchor="organizer-run-demo"
                        disabled={organizerAutoplayRunning}
                      >
                        {organizerAutoplayRunning ? "Running organizer demo..." : "Run organizer demo"}
                      </button>
                      <a href="#demo-organizer-setup" onClick={handleOrganizerSetupStart} className="results-secondary-button">
                        Explore setup manually
                      </a>
                    </>
                  ) : (
                    <a href="#create-event-name" className="results-primary-button" data-demo-anchor="organizer-create-cta">
                      Start by creating an event
                    </a>
                  )}
                </div>
                {draft ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="results-chip">{selectedSummary?.climber_count ?? 0} climbers</span>
                    <span className="results-chip">{draft.categories.length} categories</span>
                    <span className="results-chip">
                      {draft.schedule_blocks.length} {draft.schedule_blocks.length === 1 ? "schedule block" : "schedule blocks"}
                    </span>
                    <span className="results-chip">
                      {currentCompetitionStages.length} {currentCompetitionStages.length === 1 ? "stage" : "stages"}
                    </span>
                    <span className="results-chip">Next surface: Judge station</span>
                  </div>
                ) : (
                  <div className="mt-5 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                    This demo stays grounded in the real organizer dashboard. Create the event first, then the setup spine will guide categories, structure, schedule, and stages in order.
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="results-kicker">{demoSeedOnCreate ? "Demo setup" : "Create event"}</div>
                <h1 className="results-editorial-title mt-2 text-4xl font-semibold text-slate-950 sm:text-5xl">
                  {demoSeedOnCreate ? "Create a demo event." : "Start a new event."}
                </h1>
                <div className="results-hero-subline">
                  {demoSeedOnCreate
                    ? "Use the same organizer form, then add sample climbers and move into the real judge panel."
                    : "Give it a name, pick the format, and set the date. You can choose the full event setup in the next step."}
                </div>
              </>
            )}
            {(!demoMode || !draft) ? (
              <StaffEventCreationForm
                values={{
                  name: createName,
                  format: createFormat,
                  location: createLocation,
                  startDate: createStartDate,
                  endDate: createEndDate,
                  registrationOpensAt: createRegistrationOpensAt,
                  registrationClosesAt: createRegistrationClosesAt,
                  description: createDescription,
                  maxClimbers: createMaxClimbers,
                }}
                formatOptions={
                  FORMAT_TEMPLATES
                }
                disabled={!canEditSetup}
                pending={isPending}
                submitLabel={demoSeedOnCreate ? "Create demo event" : "Create new event"}
                submittingLabel={demoSeedOnCreate ? "Creating demo event..." : undefined}
                canSubmit={Boolean(createName.trim())}
                mode={demoSeedOnCreate ? "guided-demo" : "staff"}
                lockFormat={false}
                showCapacity={demoSeedOnCreate}
                showRegistrationStory={demoSeedOnCreate}
                activeGuideStepId={demoSeedOnCreate ? currentGuidedAct1StepId : undefined}
                importedLinksSummary={
                  createOfficialEventUrl || createOfficialRegistrationUrl || createOfficialScheduleUrl
                    ? `Imported official links:${createOfficialEventUrl ? " event page" : ""}${
                        createOfficialRegistrationUrl ? `${createOfficialEventUrl ? "," : ""} registration` : ""
                      }${
                        createOfficialScheduleUrl
                          ? `${createOfficialEventUrl || createOfficialRegistrationUrl ? "," : ""} schedule`
                          : ""
                      }`
                    : null
                }
                onChange={(values: StaffEventCreationFormValues) => {
                  setCreateName(values.name);
                  setCreateFormat(values.format);
                  setCreateLocation(values.location);
                  setCreateStartDate(values.startDate);
                  setCreateEndDate(values.endDate);
                  setCreateRegistrationOpensAt(values.registrationOpensAt);
                  setCreateRegistrationClosesAt(values.registrationClosesAt);
                  setCreateDescription(values.description);
                  setCreateMaxClimbers(values.maxClimbers ?? createMaxClimbers);
                }}
                onSubmit={() => {
                  startTransition(() => {
                    void (async () => {
                      try {
                        const created = await createCompetitionFromTemplate({
                          name: sanitizeDraftText(createName),
                          format: createFormat,
                          has_finals: competitionAllowsOptionalFinals(createFormat) ? false : true,
                          is_demo: demoSeedOnCreate,
                          location_name: sanitizeDraftText(createLocation),
                          start_date: sanitizeDraftText(createStartDate) || null,
                          end_date: sanitizeDraftText(createEndDate) || null,
                          registration_opens_at: sanitizeDraftNullable(createRegistrationOpensAt),
                          registration_closes_at: sanitizeDraftNullable(createRegistrationClosesAt),
                          description: sanitizeDraftText(createDescription),
                          hero_image_url: demoSeedOnCreate ? undefined : sanitizeExternalUrl(createHeroImageUrl) || undefined,
                          discipline_label: sanitizeDraftText(createDisciplineLabel) || undefined,
                          ...(demoSeedOnCreate
                            ? {}
                            : {
                                official_event_url: sanitizeExternalUrl(createOfficialEventUrl) || undefined,
                                official_registration_url: sanitizeExternalUrl(createOfficialRegistrationUrl) || undefined,
                                official_schedule_url: sanitizeExternalUrl(createOfficialScheduleUrl) || undefined,
                              }),
                        });
                        if (demoSeedOnCreate) {
                          setDemoAct1Ready({
                            competitionId: created.id,
                            slug: created.slug,
                            judgeUrl: `${buildStaffCompetitionPath(created.slug, "judge")}?demo=1`,
                          });
                          await refreshAfterChange(created.id);
                          setSelectedCompetitionId(created.id);
                          setMessage("Your event is ready. Next, you'll score athletes as a judge.");
                          return;
                        }
                        setCreateName("");
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
                        if (demoMode) {
                          writeDemoSalesSession(
                            createDemoSalesSession({
                              mode: "organizer",
                              phase: "organizer",
                              storyStep: "organizer-intro",
                              narratorTitle: "Create the event before you run it.",
                              narratorBody:
                                "You now have an empty event. Finish the organizer setup, save it, then hand it off into the judge panel.",
                              autoplay: false,
                              organizerCompleted: false,
                              judgePending: false,
                              persistentCompletion: false,
                              audioEnabled: salesAudioEnabled,
                              competitionId: created.id,
                              competitionSlug: created.slug,
                            })
                          );
                          setDemoSessionCompetitionId(created.id);
                        }
                        await refreshAfterChange(created.id);
                        setSelectedCompetitionId(created.id);
                        setMessage(
                          demoMode
                            ? `Created ${created.name}. Continue through the organizer setup, then save the event before opening the judge panel.`
                            : `Created ${created.name}.`
                        );
                      } catch (nextError) {
                        setError(nextError instanceof Error ? nextError.message : "Unable to create competition.");
                      }
                    })();
                  });
                }}
              />
            ) : null}
            {!demoMode && !canEditSetup ? (
              <div className="mt-4 text-sm text-slate-600">
                Event creation is admin-only.
              </div>
            ) : null}

            <div className="results-subtle-divider mt-8" />
            <div className="mt-5 flex items-center justify-between gap-3">
              <div>
                <div className="results-kicker">{demoMode ? "Demo event" : "Existing events"}</div>
                <div className="mt-2 text-sm text-slate-600">
                  {demoMode
                    ? "This stays empty until you create an event for the organizer walkthrough."
                    : "Choose an event to review its setup, links, and live workflow."}
                </div>
              </div>
              <div className="results-chip">{visibleSummaries.length} loaded</div>
            </div>

            <div className="mt-4 space-y-3">
              {visibleSummaries.length ? visibleSummaries.map((summary) => (
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
              )) : (
                <div className="rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-600">
                  No events found. Create your first competition to start the guided organizer demo.
                </div>
              )}
            </div>
          </section>

          <section className="results-card">
            {isGuidedStoryAct1 && !draft ? (
              <GuidedOrganizerAct1Walkthrough
                steps={GUIDED_ORGANIZER_ACT_1_STEPS}
                currentStepIndex={guidedAct1StepIndex}
                onSelectStep={goToGuidedAct1Step}
              />
            ) : draft ? (
              <div id="demo-organizer-setup" className="space-y-6">
                <div className={`results-workspace-hero ${demoMode ? "border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] shadow-[0_12px_32px_rgba(15,23,42,0.04)]" : ""}`}>
                  <div>
                    <div className="results-kicker">{demoMode ? "Organizer setup" : "Event setup"}</div>
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
                    <div className={`results-workspace-callout ${organizerDemoSectionClass("handoff")} ${demoMode ? "border-dashed border-slate-200 bg-slate-50/75 shadow-none" : ""}`} data-demo-anchor="organizer-links">
                      <div className="results-kicker">{demoMode ? "After setup" : "Quick links"}</div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                        <Link href={publicPath} className="results-secondary-button w-full">Public event page</Link>
                        {demoMode ? (
                          <button
                            type="button"
                            onClick={() => {
                              handleOrganizerHandoff("judge");
                              void runOrganizerBuildTransition();
                            }}
                            disabled={!demoJudgeReady || buildTransitionState.active}
                            className={demoJudgeReady ? "results-secondary-button w-full" : "results-secondary-button w-full opacity-60"}
                            data-demo-anchor="organizer-handoff-judge"
                          >
                            {buildTransitionState.active ? "Preparing judge mode..." : "Open judge mode"}
                          </button>
                        ) : (
                          <Link
                            href={judgeUrl}
                            onClick={() => handleOrganizerHandoff("judge")}
                            className="results-secondary-button w-full"
                            data-demo-anchor="organizer-handoff-judge"
                          >
                            Judge station
                          </Link>
                        )}
                        <Link href={leaderboardPath} onClick={() => handleOrganizerHandoff("leaderboard")} className="results-secondary-button w-full">
                          Live leaderboard
                        </Link>
                        <Link href={displayPath} onClick={() => handleOrganizerHandoff("display")} className="results-secondary-button w-full">Big-screen display</Link>
                        {!demoMode ? (
                          <Link href={buildStaffCompetitionPath(draft.slug, "preflight")} className="results-secondary-button w-full">Event checklist</Link>
                        ) : null}
                      </div>
                      {demoMode ? (
                        <div className="mt-3 text-sm text-slate-600">
                          {demoJudgeReady
                            ? "This exact event is saved and ready. Open judge mode to add the field and move into live scoring."
                            : "Finish the setup spine and save once. Then this same event unlocks judge mode."}
                        </div>
                      ) : null}
                    </div>
                  </div>

                <div className={`results-section-band ${demoMode ? "border border-slate-200/70 bg-slate-50/80 shadow-none" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="results-kicker">Event setup</div>
                      <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                        {publicUrl || publicPath}
                      </div>
                      <div className="mt-1 text-sm leading-relaxed text-slate-600">
                        Stay on the main setup spine here, then open judge mode on this same event when everything is ready.
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-[1rem] border border-slate-200 bg-white/80 px-3 py-2">
                        <div className="results-kicker">Ready</div>
                        <div className="mt-1 text-sm font-semibold text-slate-950">
                          {setupProgressCount} / {SETUP_WIZARD_STEPS.length}
                        </div>
                      </div>
                      <div className="rounded-[1rem] border border-slate-200 bg-white/80 px-3 py-2">
                        <div className="results-kicker">Stage</div>
                        <div className="mt-1 text-sm font-semibold text-slate-950">
                          Step {currentSetupStep + 1}
                        </div>
                      </div>
                      <div className="rounded-[1rem] border border-slate-200 bg-white/80 px-3 py-2">
                        <div className="results-kicker">Progress</div>
                        <div className="mt-1 text-sm font-semibold text-slate-950">{setupProgressPercent}%</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`results-section-nav ${demoMode ? "opacity-90" : ""}`}>
                  {setupSectionAnchors.map((item) => {
                    const isActive = item.stepIndex !== null ? currentSetupStep === item.stepIndex : false;
                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        onClick={() => {
                          if (item.stepIndex !== null) {
                            goToSetupStep(item.stepIndex);
                          }
                        }}
                        className={`results-section-nav__pill transition-all duration-300 ${demoMode ? "border-slate-200 bg-white/80 text-slate-500 hover:border-slate-300 hover:text-slate-700" : ""} ${isActive ? "results-section-nav__pill-active" : ""} ${demoMode && isActive ? "border-slate-950 bg-slate-950 text-white shadow-[0_14px_34px_rgba(15,23,42,0.16)]" : ""}`}
                      >
                        {item.label}
                      </a>
                    );
                  })}
                </div>

                <div
                  id="demo-run-event"
                  className={`results-workspace-card space-y-4 ${organizerDemoSectionClass(["categories", "preset", "schedule", "stages"])} ${demoMode ? "border border-sky-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.98))] shadow-[0_22px_54px_rgba(14,116,215,0.08)]" : ""}`}
                  data-demo-anchor="organizer-progress"
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-start">
                    <div className="min-w-0">
                      <div className="results-kicker">Setup progress</div>
                      <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                        Step {currentSetupStep + 1} of {SETUP_WIZARD_STEPS.length}: {activeSetupStep.title}
                      </div>
                      <div className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
                        {activeSetupStep.description}
                      </div>
                      {isGuidedStoryAct1 ? (
                        <div className="mt-3 rounded-[1.1rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                          {ACT1_SANDBOX_STEP_GUIDANCE[activeSetupStep.id]}
                        </div>
                      ) : null}
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                          <div className="results-kicker">Do here</div>
                          <div className="mt-1 text-sm leading-relaxed text-slate-700">{activeSetupCoaching.task}</div>
                        </div>
                        <div className="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                          <div className="results-kicker">Unlocks next</div>
                          <div className="mt-1 text-sm leading-relaxed text-slate-700">{activeSetupCoaching.unlock}</div>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                      <div className={`rounded-[1rem] border px-3 py-2.5 ${demoMode ? "border-sky-100 bg-white/95" : "border-slate-200 bg-slate-50/80"}`}>
                        <div className="results-kicker">Areas ready</div>
                        <div className="mt-1 text-sm font-semibold text-slate-950">{setupProgressCount}</div>
                      </div>
                      <div className={`rounded-[1rem] border px-3 py-2.5 ${demoMode ? "border-sky-100 bg-white/95" : "border-slate-200 bg-slate-50/80"}`}>
                        <div className="results-kicker">Applied preset</div>
                        <div className="mt-1 text-sm font-semibold text-slate-950">
                          {selectedGuidedSetupPreset?.name ?? (setupStepCompletion[4] ? "Manual build ready" : "None")}
                        </div>
                      </div>
                      <div className={`rounded-[1rem] border px-3 py-2.5 ${demoMode ? "border-sky-100 bg-white/95" : "border-slate-200 bg-slate-50/80"}`}>
                        <div className="results-kicker">Next review</div>
                        <div className="mt-1 text-sm font-semibold text-slate-950">
                          {isLastSetupStep ? "Operations" : SETUP_WIZARD_STEPS[currentSetupStep + 1]?.shortLabel ?? "Operations"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/80">
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
                          onClick={() => goToSetupStep(index)}
                          aria-current={isActive ? "step" : undefined}
                          disabled={organizerAutoplayRunning}
                          data-demo-anchor={
                            step.id === "categories"
                              ? "organizer-step-categories"
                              : step.id === "presets"
                                ? "organizer-step-preset"
                                : step.id === "schedule"
                                  ? "organizer-step-schedule"
                                  : step.id === "stages"
                                    ? "organizer-step-stages"
                                    : undefined
                          }
                          className={`group min-w-0 rounded-[1.5rem] border px-4 py-4 text-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 sm:px-5 sm:py-5 ${
                            isActive
                              ? "border-slate-950 bg-[linear-gradient(180deg,rgba(15,23,42,1),rgba(30,41,59,0.98))] text-white shadow-[0_28px_70px_rgba(15,23,42,0.24)] ring-1 ring-sky-200/40"
                              : isComplete
                                ? "border-emerald-200/90 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(220,252,231,0.9))] text-emerald-950 shadow-[0_10px_30px_rgba(16,185,129,0.06)] hover:border-emerald-300"
                                : "border-slate-200/90 bg-white text-slate-900 shadow-[0_8px_26px_rgba(15,23,42,0.04)] hover:border-slate-300"
                          }`}
                          style={{ minHeight: "9.5rem" }}
                        >
                          <div className={`text-sm font-semibold uppercase tracking-[0.24em] ${isActive ? "text-slate-200" : isComplete ? "text-emerald-700" : "text-slate-500"}`}>
                            Step {index + 1}
                          </div>
                          <div className="mt-3 max-w-full break-words text-[clamp(1.55rem,1.45rem+0.2vw,1.95rem)] font-semibold leading-[1.08] tracking-tight">
                            {step.shortLabel}
                          </div>
                          <div className={`mt-2.5 max-w-full break-words text-sm leading-relaxed ${isActive ? "text-slate-200" : isComplete ? "text-emerald-900" : "text-slate-600"}`}>
                            {step.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className={`results-step-summary ${demoMode ? "border border-sky-100 bg-sky-50/70 text-slate-700" : ""}`}>
                    {setupStepSummaries[currentSetupStep] ?? activeSetupStep.description}
                  </div>
                </div>

                <fieldset disabled={!demoMode && !canEditSetup} className={!demoMode && !canEditSetup ? "space-y-6 opacity-70" : "space-y-6"}>
                <div id="setup-operations" className={`results-workspace-card ${demoMode ? "border-dashed border-slate-200 bg-slate-50/70 shadow-none" : ""}`}>
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
                  {isGuidedStoryAct1 ? (
                    <div className="mt-3 rounded-[1.1rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                      {ACT1_SANDBOX_OPERATIONS_GUIDANCE}
                    </div>
                  ) : null}
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
                </fieldset>

                <fieldset disabled={!demoMode && !canEditSetup} className={!demoMode && !canEditSetup ? "space-y-6 opacity-70" : "space-y-6"}>
                {currentSetupStep === 0 ? (
                  <>
                <div
                  id="setup-basics"
                  className={`results-workspace-card ${organizerDemoSectionClass([
                    "basics_name",
                    "basics_format",
                    "basics_registration",
                  ])} ${demoMode ? "border border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.92),rgba(255,255,255,0.98))] shadow-[0_18px_40px_rgba(14,116,215,0.08)]" : ""}`}
                >
                    <div className="results-kicker">Step 1 - Event details</div>
                  <div className="mt-2 text-sm text-slate-600">
                    Set the event identity and registration timing first.
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label
                    className={`results-field-group rounded-[1rem] border border-transparent p-2 transition ${organizerFieldFocusClass("basics_name")}`}
                    htmlFor="current-event-name"
                    data-demo-anchor="organizer-basic-name"
                  >
                    <span className="results-field-label">Event name</span>
                    <input
                      id="current-event-name"
                      aria-label="Event name"
                      value={draft.name}
                      onChange={(event) => {
                        setOrganizerGuidedBasicsState((current) => ({
                          ...current,
                          identityReviewed: true,
                        }));
                        setDraft({ ...draft, name: event.target.value, slug: slugifyCompetitionName(event.target.value) });
                      }}
                      className="results-input"
                      placeholder="Spring Send"
                    />
                  </label>
                  <label
                    className={`results-field-group rounded-[1rem] border border-transparent p-2 transition ${organizerFieldFocusClass("basics_name")}`}
                    htmlFor="current-event-slug"
                  >
                    <span className="results-field-label">Event link</span>
                    <input
                      id="current-event-slug"
                      aria-label="Event link"
                      value={draft.slug}
                      onChange={(event) => {
                        setOrganizerGuidedBasicsState((current) => ({
                          ...current,
                          identityReviewed: true,
                        }));
                        setDraft({ ...draft, slug: slugifyCompetitionName(event.target.value) });
                      }}
                      className="results-input"
                      placeholder="spring-send"
                    />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label
                    className={`results-field-group rounded-[1rem] border border-transparent p-2 transition ${organizerFieldFocusClass("basics_format")}`}
                    htmlFor="current-event-format"
                    data-demo-anchor="organizer-basic-format"
                  >
                    <span className="results-field-label">Format</span>
                    <select
                      id="current-event-format"
                      aria-label="Event format"
                      value={draft.format}
                      onChange={(event) => {
                        setOrganizerGuidedBasicsState((current) => ({
                          ...current,
                          formatReviewed: true,
                        }));
                        const nextFormat = event.target.value as Competition["format"];
                        setSelectedGuidedSetupPresetId("custom");
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
                  <label
                    className={`results-field-group rounded-[1rem] border border-transparent p-2 transition ${organizerFieldFocusClass("basics_name")}`}
                    htmlFor="current-event-location"
                  >
                    <span className="results-field-label">Location</span>
                    <input
                      id="current-event-location"
                      aria-label="Event location"
                      value={draft.location_name}
                      onChange={(event) => {
                        setOrganizerGuidedBasicsState((current) => ({
                          ...current,
                          identityReviewed: true,
                        }));
                        setDraft({ ...draft, location_name: event.target.value });
                      }}
                      className="results-input"
                      placeholder="North Summit Climbing"
                    />
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
                <div
                  className={`grid gap-4 md:grid-cols-2 rounded-[1rem] border border-transparent p-2 transition ${organizerFieldFocusClass("basics_registration")}`}
                  data-demo-anchor="organizer-basic-registration"
                >
                  <label className="results-field-group" htmlFor="current-event-registration-opens">
                    <span className="results-field-label">Registration opens</span>
                    <input
                      id="current-event-registration-opens"
                      aria-label="Registration opens"
                      type="datetime-local"
                      value={formatDateTimeLocalInput(draft.registration_opens_at)}
                      onChange={(event) => {
                        setOrganizerGuidedBasicsState((current) => ({
                          ...current,
                          registrationReviewed: true,
                        }));
                        setDraft({
                          ...draft,
                          registration_opens_at: parseDateTimeLocalInput(event.target.value),
                        });
                      }}
                      className="results-input"
                    />
                  </label>
                  <label className="results-field-group" htmlFor="current-event-registration-deadline">
                    <span className="results-field-label">Registration closes</span>
                    <input
                      id="current-event-registration-deadline"
                      aria-label="Registration closes"
                      type="datetime-local"
                      value={formatDateTimeLocalInput(draft.registration_closes_at)}
                      onChange={(event) => {
                        setOrganizerGuidedBasicsState((current) => ({
                          ...current,
                          registrationReviewed: true,
                        }));
                        setDraft({
                          ...draft,
                          registration_closes_at: parseDateTimeLocalInput(event.target.value),
                        });
                      }}
                      className="results-input"
                    />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Max athletes</span>
                    <input type="number" min={1} value={draft.max_climbers} onChange={(event) => setDraft({ ...draft, max_climbers: Number(event.target.value) || DEFAULT_MAX_CLIMBERS })} className="results-input" />
                    <span className="text-xs leading-5 text-slate-500">Maximum number of climbers this event is set up to handle.</span>
                  </label>
                  <div className={`results-workspace-card ${demoMode ? "border-dashed border-slate-200 bg-slate-50/70" : ""}`}>
                    <div className="results-kicker">Later in stages</div>
                    <div className="mt-2 text-sm text-slate-600">
                      You will fine-tune scoring, advancing climbers, and finals boulders in Step 5.
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
                  <div className={`results-workspace-card ${demoMode ? "border-dashed border-slate-200 bg-slate-50/70" : ""}`}>
                    <div className="results-kicker">Later - Event visibility</div>
                    <div className="mt-2 text-sm text-slate-600">Archive or reopen the event after the build is done.</div>
                    <button type="button" onClick={() => void setCompetitionStatus(draft.id, draft.status === "active" ? "archived" : "active").then(() => refreshAfterChange(draft.id))} className={draft.status === "active" ? "results-danger-button mt-4" : "results-secondary-button mt-4"}>
                      {draft.status === "active" ? "Archive event" : "Reopen event"}
                    </button>
                  </div>
                </div>
                  </>
                ) : null}

                {currentSetupStep === 2 ? (
                <div
                  id="setup-categories"
                  className={`grid gap-4 md:grid-cols-2 ${organizerDemoSectionClass("categories")} ${demoMode ? "[&_>.results-workspace-card]:border-sky-200/70 [&_>.results-workspace-card]:bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.98))] [&_>.results-workspace-card]:shadow-[0_16px_36px_rgba(15,23,42,0.05)]" : ""}`}
                  data-demo-anchor="organizer-categories"
                >
                  <div className="results-workspace-card">
                    <div className="results-kicker">Step 3 - Review qualifier categories</div>
                    <div className="mt-2 text-sm text-slate-600">
                      Presets generate the starting field. Trim this list only if this event is serving fewer groups.
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {CATEGORY_AGE_GROUPS.map((ageGroup) => {
                        const active = draft.qualifier_eligible_age_groups.includes(ageGroup);
                        return (
                          <button
                            key={ageGroup}
                            type="button"
                            onClick={() => {
                              updateOrganizerDemoState({ categoriesViewed: true });
                              const nextQualifierAgeGroups = toggleAgeGroup(draft.qualifier_eligible_age_groups, ageGroup);
                              const nextDraft = {
                                ...draft,
                                qualifier_eligible_age_groups: nextQualifierAgeGroups,
                              };
                              setSelectedGuidedSetupPresetId("custom");
                              setDraft({
                                ...nextDraft,
                                finals_eligible_age_groups: constrainFinalsEligibleAgeGroupsToSelectedCategories(nextDraft),
                              });
                            }}
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
                    <div className="mt-2 text-sm text-slate-600">
                      Finals eligibility can only come from the qualifier categories selected on the left.
                    </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {finalsEligibilityOptions.length ? finalsEligibilityOptions.map((option) => {
                          const active = draft.finals_eligible_age_groups.includes(option.ageGroup);
                          return (
                            <button
                              key={option.ageGroup}
                              type="button"
                              onClick={() => {
                                updateOrganizerDemoState({ categoriesViewed: true });
                                setSelectedGuidedSetupPresetId("custom");
                                setDraft({
                                  ...draft,
                                  finals_eligible_age_groups: toggleAgeGroup(draft.finals_eligible_age_groups, option.ageGroup),
                                });
                              }}
                              className={active ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                            >
                              <span>{option.ageGroup}</span>
                              <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal opacity-75">
                                {option.displayCategories.join(", ")}
                              </span>
                            </button>
                          );
                        }) : (
                          <div className="rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            Select at least one qualifier category before choosing finals eligibility.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                ) : null}

                {currentSetupStep === 1 ? (
                <div id="setup-presets" className={`results-workspace-card ${organizerDemoSectionClass("preset")} ${demoMode ? "border border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.92),rgba(255,255,255,0.98))] shadow-[0_18px_40px_rgba(14,116,215,0.08)]" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Step 2 - Pick a competition preset</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Choose the event shape before category setup. The preset generates categories, finals eligibility, rounds, and schedule blocks together.
                      </div>
                    </div>
                    {selectedGuidedSetupPreset ? (
                      <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900">
                        Selected: {selectedGuidedSetupPreset.name}
                      </div>
                    ) : (
                      <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                        Choose a preset to apply it
                      </div>
                    )}
                  </div>
                  <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {GUIDED_SETUP_PRESETS.map((preset) => (
                      (() => {
                        const isSelected = selectedGuidedSetupPresetId === preset.id;
                        const finalsEligibleCategories = getPresetFinalsEligibleCategories(preset);

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => handleOrganizerPresetSelection(preset.id)}
                            disabled={organizerAutoplayRunning}
                            data-demo-anchor={preset.id === "open_boulder_championship" ? "organizer-preset-open-boulder" : undefined}
                            className={`group flex min-w-0 h-full min-h-[24rem] flex-col rounded-[1.6rem] border px-5 py-5 text-left transition ${
                              isSelected
                                ? "border-slate-950 bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] demo-organizer-preset-selected"
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
                              {preset.name}
                            </div>
                            <div className={`mt-4 text-base leading-relaxed ${isSelected ? "text-slate-200" : "text-slate-600"}`}>
                              {preset.description}
                            </div>
                            <div className="mt-5 space-y-3 text-sm leading-relaxed">
                              {[
                                ["Audience", preset.targetAudience],
                                ["Format", FORMAT_TEMPLATES.find((template) => template.value === preset.format)?.label ?? preset.format],
                                ["Categories", preset.defaultCategories.join(" / ")],
                                ["Finals", preset.finalsEnabled ? `Top ${preset.finalsCutoff}: ${finalsEligibleCategories.join(" / ") || "selected categories"}` : "Disabled"],
                                ["Qualifiers", `${preset.qualifierProblemCount} problems, best ${preset.countingClimbs} count`],
                                ["Schedule", preset.defaultScheduleBlocks.map((block) => block.label).join(" -> ") || "Manual"],
                                ["Judging", preset.judgeRequirementLevel.replaceAll("_", " ")],
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
                      <span className="font-semibold">{selectedGuidedSetupPreset.name}</span> is currently selected. Generated qualifier categories:{" "}
                      <span className="font-semibold">{draft.qualifier_eligible_age_groups.join(" / ") || "none yet"}</span>. Finals-eligible categories:{" "}
                      <span className="font-semibold">
                        {draftHasFinals ? draft.finals_eligible_age_groups.join(" / ") || "none selected" : "finals disabled"}
                      </span>.
                    </div>
                  ) : null}
                  <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Next: review the generated <span className="font-semibold text-slate-900">Categories</span>. If you change a preset after manual edits,
                    Scorecard will warn before overwriting the generated setup.
                  </div>
                </div>
                ) : null}

                {currentSetupStep === 3 ? (
                <div
                  id="setup-schedule"
                  className={`results-workspace-card ${organizerDemoSectionClass("schedule")} ${demoMode ? "border border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.92),rgba(255,255,255,0.98))] shadow-[0_18px_40px_rgba(14,116,215,0.08)]" : ""}`}
                  data-demo-anchor="organizer-schedule"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Step 4 - Build the day</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Review the day plan and make sure live blocks point at real scored stages.
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
                              onClick={() => {
                                updateOrganizerDemoState({ scheduleViewed: true });
                                addScheduleBlockFromTemplate(template);
                              }}
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
                          <div className="mt-1">{item.ok ? item.okMessage : item.warningMessage}</div>
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
                                onClick={() => {
                                  updateOrganizerDemoState({ scheduleViewed: true });
                                  insertScheduleBlockFromTemplate(insertTemplate, blockIndex, "above");
                                }}
                                className="results-secondary-button"
                              >
                                Add block above
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  updateOrganizerDemoState({ scheduleViewed: true });
                                  setExpandedScheduleBlockId((current) => (current === block.id ? null : block.id));
                                }}
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
                                onClick={() => {
                                  updateOrganizerDemoState({ scheduleViewed: true });
                                  insertScheduleBlockFromTemplate(insertTemplate, blockIndex, "below");
                                }}
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
                      <div className="results-kicker">{demoMode ? "Move through the spine" : "Wizard navigation"}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        {demoMode
                          ? "Stay focused on one setup area at a time, or jump from the progress cards above."
                          : "Move one step at a time, or jump directly from the progress cards above."}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => goToSetupStep(Math.max(0, currentSetupStep - 1))}
                        disabled={isFirstSetupStep}
                        className="results-secondary-button"
                      >
                        Previous step
                      </button>
                      <button
                        type="button"
                        onClick={() => goToSetupStep(Math.min(SETUP_WIZARD_STEPS.length - 1, currentSetupStep + 1))}
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

                <div className={`results-workspace-card ${demoMode ? "border-dashed border-slate-200 bg-slate-50/70" : ""}`}>
                  <div className="results-kicker">{demoMode ? "Later - Share links" : "After setup - Share links"}</div>
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
                <fieldset disabled={!demoMode && !canEditSetup} className={!demoMode && !canEditSetup ? "space-y-6 opacity-70" : "space-y-6"}>
                {draft.rounds?.length ? (
                  <div
                    id="setup-stages"
                    className={`results-workspace-card ${organizerDemoSectionClass("stages")} ${demoMode ? "border border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.92),rgba(255,255,255,0.98))] shadow-[0_18px_40px_rgba(14,116,215,0.08)]" : ""}`}
                    data-demo-anchor="organizer-stages"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="results-kicker">Step 5 - Competition stages</div>
                        <div className="mt-2 text-sm text-slate-600">
                          Confirm the scored stages, boulder counts, and advancement rules before going live.
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            updateOrganizerDemoState({ stagesViewed: true });
                            setShowAdvancedStageSettings((current) => !current);
                          }}
                          className="results-secondary-button"
                        >
                          {showAdvancedStageSettings ? "Hide advanced" : "Show advanced"}
                        </button>
                        <button type="button" onClick={() => {
                          updateOrganizerDemoState({ stagesViewed: true });
                          addRound("qualifier");
                        }} className="results-secondary-button">Add qualifier</button>
                        <button type="button" onClick={() => {
                          updateOrganizerDemoState({ stagesViewed: true });
                          addRound("semifinal");
                        }} className="results-secondary-button">Add semifinal</button>
                        <button type="button" onClick={() => {
                          updateOrganizerDemoState({ stagesViewed: true });
                          addRound("finals");
                        }} className="results-secondary-button">Add finals</button>
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
                                    onClick={() => {
                                      updateOrganizerDemoState({ stagesViewed: true });
                                      setExpandedRoundId((current) => (current === round.id ? null : round.id));
                                    }}
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
                  <button type="button" onClick={persistDraft} disabled={isPending || !canEditSetup} className="results-primary-button" data-demo-anchor="organizer-save-event">
                    {isPending ? "Saving..." : "Save competition"}
                  </button>
                  {snapshot ? (
                    <>
                      <button type="button" onClick={() => window.open(buildDisplayPath(draft.slug), "_blank", "noopener,noreferrer")} className="results-secondary-button">
                        Open big-screen display
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
                              await resetDemoSessionCompetition();
                            },
                          })
                        }
                        className="results-secondary-button"
                      >
                        Restore demo
                      </button>
                    ) : null}
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

        {organizerDemoCursor.visible ? (
          <div
            className={`demo-pointer ${organizerDemoCursor.clicking ? "demo-pointer-clicking" : ""}`}
            style={{
              left: organizerDemoCursor.x,
              top: organizerDemoCursor.y,
            }}
            aria-hidden="true"
          >
            <div className="demo-pointer-dot" />
            {organizerDemoCursor.label ? <div className="demo-pointer-label">{organizerDemoCursor.label}</div> : null}
          </div>
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
