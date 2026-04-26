"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import SiteHeader from "@/components/site-header";
import StaffCompetitionSubnav from "@/components/staff-competition-subnav";
import ConfirmationModal from "@/components/confirmation-modal";
import { getAuthState, signOutUser, type Profile } from "@/lib/auth";
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
  competitionAllowsOptionalFinals,
  competitionHasFinals,
  getCompetitionPhaseForSchedulePhase,
  getCompetitionPhaseSequenceFromScheduleBlocks,
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
  parseScheduleTimeToMinutes,
  slugifyCompetitionName,
  type Competition,
  type CompetitionScheduleBlock,
  type SchedulePhaseType,
} from "@/lib/scoring";
import { sanitizeExternalUrl } from "@/lib/security";

const COMPETITION_UNDO_WINDOW_LABEL = "5 minutes";

function isDemoDataSlug(slug: string | null | undefined) {
  const normalized = slug?.trim().toLowerCase() ?? "";
  return normalized.startsWith("mock-") || normalized.startsWith("spring-send-");
}

function cloneCompetition(competition: Competition): Competition {
  return {
    ...competition,
    categories: competition.categories.map((category) => ({ ...category })),
    schedule_blocks: competition.schedule_blocks.map((block) => ({
      ...block,
      eligible_category_ids: [...block.eligible_category_ids],
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
  audience_label: string;
  capacity?: number;
  eligible_age_groups?: string[];
};

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
        return initialMatch?.competition.id ?? summaries[0]?.competition.id ?? "";
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
    () => allSummaries.find((entry) => entry.competition.id === selectedCompetitionId) ?? null,
    [allSummaries, selectedCompetitionId]
  );

  useEffect(() => {
    if (!selectedSummary) {
      setDraft(null);
      setSnapshot(null);
      setPhaseBlockMemory({});
      return;
    }

    setDraft(cloneCompetition(selectedSummary.competition));
    void getCompetitionSnapshot(selectedSummary.competition.id)
      .then((nextSnapshot) => setSnapshot(nextSnapshot))
      .catch(() => setSnapshot(null));
  }, [selectedSummary]);

  const publicPath = draft ? buildCompetitionPath(draft.slug) : "";
  const registerPath = draft ? buildCompetitionPath(draft.slug, "register") : "";
  const judgeUrl = draft ? buildStaffCompetitionPath(draft.slug, "judge") : "";
  const displayPath = draft ? buildDisplayPath(draft.slug) : "";
  const publicUrl = publicPath ? `${shareOrigin}${publicPath}` : "";
  const registerUrl = registerPath ? `${shareOrigin}${registerPath}` : "";
  const displayUrl = displayPath ? `${shareOrigin}${displayPath}` : "";
  const registrationQrUrl = `/api/qr?size=180&data=${encodeURIComponent(registerUrl || registerPath)}`;
  const printableRegistrationQrUrl = `/api/qr?size=720&data=${encodeURIComponent(registerUrl || registerPath)}`;
  const canEditPhase = profile?.role === "admin";
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
  const qualifierCategories = useMemo(
    () =>
      draft?.categories.filter((category) => isQualifierEligibleCategory(draft, category.age_group)) ?? [],
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
          await saveCompetitionConfig(draft.id, { ...draft, schedule_blocks: draft.schedule_blocks });
          await refreshAfterChange(draft.id);
          setMessage("Competition saved.");
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : "Unable to save the competition.");
        }
      })();
    });
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

    const eligibleCategoryIds =
      template.phase_type === "qualifier_round" || template.phase_type === "custom"
        ? template.eligible_age_groups?.length
          ? qualifierCategories
              .filter((category) => template.eligible_age_groups?.includes(category.age_group))
              .map((category) => category.id)
          : qualifierCategories.map((category) => category.id)
        : [];

    setDraft({
      ...draft,
      schedule_blocks: [
        ...draft.schedule_blocks,
        {
          id: createScheduleBlockId(),
          competition_id: draft.id,
          label: template.label,
          phase_type: template.phase_type,
          audience_label: template.audience_label,
          is_active: draft.schedule_blocks.length === 0,
          start_time: "",
          end_time: "",
          capacity: template.capacity ?? draft.max_climbers,
          eligible_category_ids: eligibleCategoryIds,
        },
      ],
    });
  };

  const removeScheduleBlock = (blockId: string) => {
    if (!draft) {
      return;
    }

    const remainingBlocks = draft.schedule_blocks.filter((block) => block.id !== blockId);
    setDraft({
      ...draft,
      schedule_blocks: remainingBlocks.map((block, index) =>
        index === 0 && !remainingBlocks.some((entry) => entry.is_active)
          ? { ...block, is_active: true }
          : block
      ),
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
      schedule_blocks: draft.schedule_blocks
        .filter((block) => block.id !== sourceBlockId)
        .map((block) =>
          block.id === targetBlockId
            ? {
                ...block,
                label: getWaveLabel(mergedAgeGroups, draft),
                audience_label: getWaveAudienceLabel(mergedAgeGroups),
                eligible_category_ids: mergedEligibleCategoryIds,
                is_active: block.is_active || sourceBlock.is_active,
                capacity: Math.max(block.capacity, sourceBlock.capacity),
              }
            : block
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
    ? "Demo mode is public and read-only. Staff sign-in, scoring controls, and competition edits stay protected."
    : "";
  const demoDataExportAllowed = demoMode && isDemoDataSlug(draft?.slug);
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
        {demoMode ? <div className="results-alert">{demoBanner}</div> : null}

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="results-card">
            <div className="results-kicker">Create event</div>
            <h1 className="results-editorial-title mt-2 text-4xl font-semibold text-slate-950 sm:text-5xl">
              Set up a competition.
            </h1>
            <div className="results-hero-subline">
              Start a new event, pull in official details, and manage registration, schedules, judging, and finals from one place.
            </div>
            <fieldset disabled={demoMode} className={demoMode ? "mt-4 grid gap-3 opacity-70" : "mt-4 grid gap-3"}>
              <label className="results-field-group">
                <span className="results-field-label">Competition name</span>
                <input value={createName} onChange={(event) => setCreateName(event.target.value)} className="results-input" placeholder="New competition name" />
              </label>
              <label className="results-field-group">
                <span className="results-field-label">Slug preview</span>
                <input value={slugifyCompetitionName(createName)} readOnly className="results-input bg-slate-50 text-slate-500" placeholder="competition-slug" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="results-field-group">
                  <span className="results-field-label">Format</span>
                  <select
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
                <label className="results-field-group">
                  <span className="results-field-label">Location</span>
                  <input value={createLocation} onChange={(event) => setCreateLocation(event.target.value)} className="results-input" placeholder="Location" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="results-field-group">
                  <span className="results-field-label">Start date</span>
                  <input type="date" value={createStartDate} onChange={(event) => setCreateStartDate(event.target.value)} className="results-input" />
                </label>
                <label className="results-field-group">
                  <span className="results-field-label">End date</span>
                  <input type="date" value={createEndDate} onChange={(event) => setCreateEndDate(event.target.value)} className="results-input" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="results-field-group">
                  <span className="results-field-label">Registration opens</span>
                  <input
                    type="datetime-local"
                    value={formatDateTimeLocalInput(createRegistrationOpensAt)}
                    onChange={(event) => setCreateRegistrationOpensAt(parseDateTimeLocalInput(event.target.value))}
                    className="results-input"
                  />
                </label>
                <label className="results-field-group">
                  <span className="results-field-label">Registration deadline</span>
                  <input
                    type="datetime-local"
                    value={formatDateTimeLocalInput(createRegistrationClosesAt)}
                    onChange={(event) => setCreateRegistrationClosesAt(parseDateTimeLocalInput(event.target.value))}
                    className="results-input"
                  />
                </label>
              </div>
              {competitionAllowsOptionalFinals(createFormat) ? (
                <label className="results-field-group">
                  <span className="results-field-label">Finals round</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCreateHasFinals(false)}
                      className={!createHasFinals ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                    >
                      Qualifier only
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateHasFinals(true)}
                      className={createHasFinals ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                    >
                      Qualifier + finals
                    </button>
                  </div>
                </label>
              ) : null}
              <label className="results-field-group">
                <span className="results-field-label">Description</span>
                <textarea
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                  className="results-input min-h-[120px] resize-y"
                  placeholder="Competition description"
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
                  Create event
              </button>
            </fieldset>
            {demoMode ? (
              <div className="mt-4 text-sm text-slate-600">
                This panel is intentionally frozen for demos. Use staff sign-in to create or edit events.
              </div>
            ) : null}

            <div className="results-subtle-divider mt-8" />
            <div className="mt-5 flex items-center justify-between gap-3">
              <div>
                <div className="results-kicker">Existing events</div>
                <div className="mt-2 text-sm text-slate-600">Choose an event to review its setup, links, and live workflow.</div>
              </div>
              <div className="results-chip">{allSummaries.length} loaded</div>
            </div>

            <div className="mt-4 space-y-3">
              {allSummaries.map((summary) => (
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
              <div className="space-y-6">
                <div className="results-workspace-hero">
                  <div>
                    <div className="results-kicker">Event setup</div>
                    <h2 className="results-editorial-title mt-2 text-4xl font-semibold text-slate-950 sm:text-5xl">{draft.name}</h2>
                    <div className="results-hero-subline">
                      {publicUrl || publicPath}
                    </div>
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
                          Judge scoring and checklist tools remain protected on staff-only routes.
                        </div>
                      ) : null}
                    </div>
                  </div>

                <fieldset disabled={demoMode} className={demoMode ? "space-y-6 opacity-70" : "space-y-6"}>
                <div className="results-workspace-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Current stage</div>
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
                    The current stage controls scoring and what the public sees. When schedule blocks imply a stage
                    order, Previous and Next follow that event timeline first
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

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="results-field-group">
                    <span className="results-field-label">Competition name</span>
                    <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, slug: slugifyCompetitionName(event.target.value) })} className="results-input" placeholder="Competition name" />
                  </label>
                  <label className="results-field-group">
                    <span className="results-field-label">Slug</span>
                    <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: slugifyCompetitionName(event.target.value) })} className="results-input" placeholder="Slug" />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="results-field-group">
                    <span className="results-field-label">Format</span>
                    <select
                      value={draft.format}
                      onChange={(event) => {
                        const nextFormat = event.target.value as Competition["format"];
                        setDraft({
                          ...draft,
                          format: nextFormat,
                          has_finals: competitionAllowsOptionalFinals(nextFormat) ? draft.has_finals : true,
                          total_climbs: getRecommendedQualifierClimbCount(nextFormat),
                          qualifier_counting_climbs: getRecommendedQualifierCountingClimbs(nextFormat),
                          finals_cutoff: getRecommendedFinalsCutoff(nextFormat),
                        });
                      }}
                      className="results-input"
                    >
                      {FORMAT_TEMPLATES.map((template) => (
                        <option key={template.value} value={template.value}>{template.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="results-field-group">
                    <span className="results-field-label">Location</span>
                    <input value={draft.location_name} onChange={(event) => setDraft({ ...draft, location_name: event.target.value })} className="results-input" placeholder="Location" />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="results-field-group">
                    <span className="results-field-label">Registration opens</span>
                    <input
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
                  <label className="results-field-group">
                    <span className="results-field-label">Registration deadline</span>
                    <input
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
                    <span className="results-field-label">Finals round</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            has_finals: false,
                            schedule_blocks: draft.schedule_blocks.filter(
                              (block) => !["isolation", "observation", "finals_round"].includes(block.phase_type)
                            ),
                          })
                        }
                        disabled={!canDisableFinals}
                        className={!draftHasFinals ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}
                      >
                        Qualifier only
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, has_finals: true })}
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
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Qualifying boulders</span>
                    <input type="number" min={1} value={draft.total_climbs} onChange={(event) => setDraft({ ...draft, total_climbs: Number(event.target.value) || DEFAULT_TOTAL_CLIMBS })} className="results-input" />
                    <span className="text-xs leading-5 text-slate-500">Total qualifying climbs available to each athlete.</span>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Max athletes</span>
                    <input type="number" min={1} value={draft.max_climbers} onChange={(event) => setDraft({ ...draft, max_climbers: Number(event.target.value) || DEFAULT_MAX_CLIMBERS })} className="results-input" />
                    <span className="text-xs leading-5 text-slate-500">Maximum number of climbers this event is set up to handle.</span>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Top climbs counted</span>
                    <input type="number" min={1} value={draft.qualifier_counting_climbs} onChange={(event) => setDraft({ ...draft, qualifier_counting_climbs: Number(event.target.value) || DEFAULT_QUALIFIER_COUNTING_CLIMBS })} className="results-input" />
                    <span className="text-xs leading-5 text-slate-500">Only each climber&apos;s best X qualifying climbs count toward rank.</span>
                  </label>
                  {draftHasFinals ? (
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Finalists</span>
                      <select value={draft.finals_cutoff} onChange={(event) => setDraft({ ...draft, finals_cutoff: Number(event.target.value) === 8 ? 8 : DEFAULT_FINALS_CUTOFF })} className="results-input">
                        <option value={6}>Top 6</option>
                        <option value={8}>Top 8</option>
                      </select>
                      <span className="text-xs leading-5 text-slate-500">How many climbers advance from qualifiers into finals.</span>
                    </label>
                  ) : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {draftHasFinals ? (
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Finals problems</span>
                      <input type="number" min={1} max={8} value={draft.finals_problem_count} onChange={(event) => setDraft({ ...draft, finals_problem_count: Math.max(1, Math.min(8, Number(event.target.value) || 4)) })} className="results-input" />
                      <span className="text-xs leading-5 text-slate-500">Number of climbs each finalist will attempt in the finals round.</span>
                    </label>
                  ) : (
                    <div className="results-workspace-card">
                      <div className="results-kicker">Finals disabled</div>
                      <div className="mt-2 text-sm text-slate-600">
                        This scramble will end after qualifier results, so finals cutoff, order, and finals scoring stay out of the workflow.
                      </div>
                    </div>
                  )}
                  <div className="results-workspace-card">
                    <div className="results-kicker">Visibility</div>
                    <div className="mt-2 text-sm text-slate-600">Archiving hides this event from public browsing without deleting registrations or scoring data.</div>
                    <button type="button" onClick={() => void setCompetitionStatus(draft.id, draft.status === "active" ? "archived" : "active").then(() => refreshAfterChange(draft.id))} className={draft.status === "active" ? "results-danger-button mt-4" : "results-secondary-button mt-4"}>
                      {draft.status === "active" ? "Archive event" : "Reopen event"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="results-workspace-card">
                    <div className="results-kicker">Qualifying age groups</div>
                    <div className="mt-2 text-sm text-slate-600">Only these age groups appear in registration and qualifying standings.</div>
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
                      <div className="results-kicker">Finals age groups</div>
                      <div className="mt-2 text-sm text-slate-600">Only these age groups can qualify into finals.</div>
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

                <div className="results-workspace-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Event schedule</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Add ready-made schedule blocks, then adjust labels, times, and climbing windows for the day.
                      </div>
                    </div>
                    <div className="results-chip">{draft.schedule_blocks.length} blocks</div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {scheduleTemplates.map((template) => (
                      <button
                        key={`${template.phase_type}-${template.label}`}
                        type="button"
                        onClick={() => addScheduleBlockFromTemplate(template)}
                        className="results-secondary-button"
                      >
                        Add {template.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="text-sm text-slate-600">
                      Add qualifying waves separately, then drag one wave onto another to combine them into one shared start group.
                    </div>
                    {draft.schedule_blocks.length ? (
                      draft.schedule_blocks.map((block) => {
                        const supportsCategoryFilters =
                          block.phase_type === "qualifier_round" || block.phase_type === "custom";
                        const canMergeThisBlock = canMergeWaveBlock(block);
                        const isMergeTarget = mergeTargetBlockId === block.id && draggedScheduleBlockId !== block.id;

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
                            className={`rounded-[1.4rem] border bg-white px-4 py-4 transition ${
                              isMergeTarget ? "border-sky-400 ring-2 ring-sky-100" : "border-slate-200"
                            } ${canMergeThisBlock ? "cursor-grab active:cursor-grabbing" : ""}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-lg font-semibold text-slate-950">{block.label || "Untitled block"}</div>
                                <div className="mt-1 text-sm text-slate-600">
                                  {formatSchedulePhaseLabel(block.phase_type)} / {getSchedulePhaseDescription(block.phase_type)}
                                </div>
                                {canMergeThisBlock ? (
                                  <div className="mt-2 text-xs font-medium uppercase tracking-[0.24em] text-sky-700">
                                    Drag onto another wave to merge
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-2">
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
                                  onChange={(event) =>
                                    updateScheduleBlock(block.id, (current) => ({
                                      ...current,
                                      phase_type: event.target.value as SchedulePhaseType,
                                      eligible_category_ids:
                                        event.target.value === "qualifier_round" || event.target.value === "custom"
                                          ? current.eligible_category_ids.length
                                            ? current.eligible_category_ids
                                            : qualifierCategories.map((category) => category.id)
                                          : [],
                                    }))
                                  }
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

                </fieldset>

                <div className="results-workspace-card">
                  <div className="results-kicker">Share links</div>
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

                <fieldset disabled={demoMode} className={demoMode ? "space-y-6 opacity-70" : "space-y-6"}>
                {snapshot?.rounds?.length ? (
                  <div className="results-workspace-card">
                  <div className="results-kicker">Rounds</div>
                    <div className="mt-4 space-y-3">
                      {snapshot.rounds.map((round) => (
                        <div key={round.id} className="results-admin-list-item">
                          <div>
                            <div className="text-lg font-semibold text-slate-950">{round.name}</div>
                            <div className="mt-1 text-sm text-slate-600">
                              {round.format} | {round.problem_count} problems
                            </div>
                          </div>
                          <div className="results-chip">{round.status}</div>
                        </div>
                      ))}
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

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={persistDraft} disabled={isPending} className="results-primary-button">
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
                    <button type="button" onClick={() => setConfirming({
                    title: "Advance to finals",
                    description: finalsAdvanceBlock
                      ? `This will create the finals field from the current standings and move the event into ${finalsAdvanceBlock.label}. You can undo it for ${COMPETITION_UNDO_WINDOW_LABEL}.`
                      : `This will create the finals field from the current standings and move the event into finals. You can undo it for ${COMPETITION_UNDO_WINDOW_LABEL}.`,
                    confirmLabel: "Advance",
                    expectedValue: draft.name,
                    action: async () => {
                      await advanceToFinals();
                    },
                  })} className="results-secondary-button" disabled={!canAdvanceToFinals || isPending || isPhasePending}>Advance to finals</button>
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
                  })} className="results-danger-button">Delete event</button>
                </div>
                </fieldset>

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
