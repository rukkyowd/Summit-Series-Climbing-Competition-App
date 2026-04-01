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
  advanceCompetitionToFinals,
  createCompetitionFromTemplate,
  deleteCompetition,
  getCompetitionSnapshot,
  listCompetitionSummaries,
  saveCompetitionConfig,
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
  slugifyCompetitionName,
  type Competition,
  type CompetitionScheduleBlock,
  type SchedulePhaseType,
} from "@/lib/scoring";

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

const QUALIFIER_TEMPLATE_GROUPS = [
  ["Youth D", "Youth C"],
  ["Youth B", "Youth A"],
  ["Junior", "Open"],
  ["Rec", "Masters"],
] as const;

function formatAgeGroupBandLabel(ageGroups: readonly string[]) {
  return ageGroups.join(" / ");
}

function buildScheduleBlockTemplates(competition: Competition): ScheduleBlockTemplate[] {
  const assignmentLabel = getRegistrationAssignmentLabel(competition);
  const qualifierBandTemplates = QUALIFIER_TEMPLATE_GROUPS
    .map((ageGroups) => ageGroups.filter((ageGroup) => competition.qualifier_eligible_age_groups.includes(ageGroup)))
    .filter((ageGroups) => ageGroups.length > 0)
    .map((ageGroups) => ({
      label: formatUsesSelfScoredQualifiers(competition.format)
        ? `${formatAgeGroupBandLabel(ageGroups)} ${assignmentLabel}`
        : `${formatAgeGroupBandLabel(ageGroups)} ${assignmentLabel}`,
      phase_type: "qualifier_round" as const,
      audience_label: formatAgeGroupBandLabel(ageGroups),
      capacity: competition.max_climbers,
      eligible_age_groups: [...ageGroups],
    }));

  if (formatUsesSelfScoredQualifiers(competition.format)) {
    return [
      { label: "Check-in", phase_type: "check_in", audience_label: "All climbers", capacity: competition.max_climbers },
      { label: `${assignmentLabel} 1`, phase_type: "qualifier_round", audience_label: "Scramble window", capacity: competition.max_climbers },
      { label: `${assignmentLabel} 2`, phase_type: "qualifier_round", audience_label: "Scramble window", capacity: competition.max_climbers },
      ...qualifierBandTemplates,
      { label: "Wall reset", phase_type: "wall_reset", audience_label: "Routesetting", capacity: competition.max_climbers },
      { label: "Results / Awards", phase_type: "results", audience_label: "All climbers", capacity: competition.max_climbers },
    ];
  }

  return [
    { label: "Check-in", phase_type: "check_in", audience_label: "All athletes", capacity: competition.max_climbers },
    { label: "Technical meeting", phase_type: "technical_meeting", audience_label: "Athletes and coaches", capacity: competition.max_climbers },
    ...qualifierBandTemplates,
    { label: `${assignmentLabel} A`, phase_type: "qualifier_round", audience_label: "Qualifier wave", capacity: competition.max_climbers },
    { label: `${assignmentLabel} B`, phase_type: "qualifier_round", audience_label: "Qualifier wave", capacity: competition.max_climbers },
    { label: "Isolation", phase_type: "isolation", audience_label: "Finalists", capacity: competition.max_climbers },
    { label: "Observation", phase_type: "observation", audience_label: "Finalists", capacity: competition.max_climbers },
    { label: "Finals", phase_type: "finals_round", audience_label: "Finalists", capacity: competition.max_climbers },
    { label: "Results / Awards", phase_type: "results", audience_label: "All athletes", capacity: competition.max_climbers },
  ];
}

export default function StaffDashboard({ initialCompetitionSlug }: { initialCompetitionSlug?: string }) {
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
  const [isPhasePending, setIsPhasePending] = useState(false);
  const [confirming, setConfirming] = useState<null | {
    title: string;
    description: string;
    confirmLabel: string;
    expectedValue?: string;
    action: () => Promise<void>;
  }>(null);
  const [shareOrigin, setShareOrigin] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaries, authState] = await Promise.all([
        listCompetitionSummaries(true),
        getAuthState(),
      ]);
      setAllSummaries(summaries);
      setProfile(authState.profile);
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
  }, [initialCompetitionSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareOrigin(window.location.origin);
    }
  }, []);

  const selectedSummary = useMemo(
    () => allSummaries.find((entry) => entry.competition.id === selectedCompetitionId) ?? null,
    [allSummaries, selectedCompetitionId]
  );

  useEffect(() => {
    if (!selectedSummary) {
      setDraft(null);
      setSnapshot(null);
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
  const canEditPhase = profile?.role === "admin";
  const liveScheduleBlock = draft?.schedule_blocks.find((block) => block.is_active) ?? null;
  const impliedCompetitionPhase = liveScheduleBlock
    ? getCompetitionPhaseForSchedulePhase(liveScheduleBlock.phase_type)
    : null;
  const scheduleDrivenPhases = useMemo(
    () => (draft ? getCompetitionPhaseSequenceFromScheduleBlocks(draft.schedule_blocks) : []),
    [draft]
  );
  const navigationPhase = impliedCompetitionPhase ?? draft?.current_phase ?? null;
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
  const nextPhaseLabel = nextPhase === "results" ? "End event" : "Next";
  const schedulePhaseMismatch = Boolean(
    draft && impliedCompetitionPhase && impliedCompetitionPhase !== draft.current_phase
  );
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
    if (!draft) {
      return;
    }

    const next = [...finalsOrder];
    const target = index + direction;
    if (target < 0 || target >= next.length) {
      return;
    }

    [next[index], next[target]] = [next[target], next[index]];
    await updateFinalistClimbingOrder(draft.id, next.map((entry) => entry.climber_id));
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
              <div className="results-chip">{profile?.role ?? "staff"}</div>
              <button type="button" onClick={() => void signOutUser().then(() => (window.location.href = "/staff/login"))} className="results-secondary-button">
                Sign out
              </button>
            </div>
          }
        />
        {draft?.slug ? <StaffCompetitionSubnav competitionSlug={draft.slug} /> : null}

        {error ? <div className="results-alert results-alert-error">{error}</div> : null}
        {message ? <div className="results-alert results-alert-success">{message}</div> : null}

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="results-card">
            <div className="results-kicker">Create competition</div>
            <div className="mt-4 grid gap-3">
              <input value={createName} onChange={(event) => setCreateName(event.target.value)} className="results-input" placeholder="New competition name" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={createFormat} onChange={(event) => setCreateFormat(event.target.value as Competition["format"])} className="results-input">
                  {FORMAT_TEMPLATES.map((template) => (
                    <option key={template.value} value={template.value}>{template.label}</option>
                  ))}
                </select>
                <input value={createLocation} onChange={(event) => setCreateLocation(event.target.value)} className="results-input" placeholder="Location" />
              </div>
              <button
                type="button"
                disabled={isPending || !createName.trim()}
                onClick={() => {
                  startTransition(() => {
                    void (async () => {
                      try {
                        const created = await createCompetitionFromTemplate({
                          name: createName,
                          format: createFormat,
                          location_name: createLocation,
                        });
                        setCreateName("");
                        setCreateLocation("");
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
                Create competition
              </button>
            </div>

            <div className="mt-8 space-y-3">
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="results-kicker">Competition setup</div>
                    <h2 className="mt-2 text-3xl font-semibold text-slate-950">{draft.name}</h2>
                    <div className="mt-2 text-sm text-slate-600">{publicUrl || publicPath}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={publicPath} className="results-secondary-button">Public page</Link>
                    <Link href={judgeUrl} className="results-secondary-button">Judge panel</Link>
                    <Link href={displayPath} className="results-secondary-button">Display</Link>
                    <Link href={buildStaffCompetitionPath(draft.slug, "preflight")} className="results-secondary-button">Preflight</Link>
                  </div>
                </div>

                <div className="results-meta-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Current phase</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{formatCompetitionPhaseLabel(draft.current_phase)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!previousPhase || !canEditPhase) {
                            return;
                          }

                          void runPhaseChange(
                            draft.id,
                            previousPhase,
                            `Competition moved to ${formatCompetitionPhaseLabel(previousPhase).toLowerCase()}.`
                          );
                        }}
                        disabled={!previousPhase || isPending || isPhasePending || !canEditPhase}
                        className="results-secondary-button"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!nextPhase) {
                            return;
                          }

                          if (nextPhase === "results") {
                            setConfirming({
                              title: "End event",
                              description: "This moves the competition into the results phase so public pages show the final standings instead of live scoring.",
                              confirmLabel: "End event",
                              expectedValue: draft.name,
                              action: async () => {
                                await runPhaseChange(draft.id, nextPhase, "Competition moved to results.");
                              },
                            });
                            return;
                          }

                          if (!canEditPhase) {
                            return;
                          }

                          void runPhaseChange(
                            draft.id,
                            nextPhase,
                            `Competition moved to ${formatCompetitionPhaseLabel(nextPhase).toLowerCase()}.`
                          );
                        }}
                        disabled={!nextPhase || isPending || isPhasePending || !canEditPhase}
                        className="results-primary-button"
                      >
                        {nextPhaseLabel}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-slate-600">
                    Competition phase controls scoring and which public standings are shown. When your schedule blocks imply a
                    phase order, Previous and Next follow that event sequence first
                    {liveScheduleBlock ? `, and the live block is currently "${liveScheduleBlock.label}".` : "."}
                  </div>
                  {scheduleDrivenPhases.length ? (
                    <div className="mt-3 text-sm text-slate-600">
                      Schedule-driven sequence: {scheduleDrivenPhases.map((phase) => formatCompetitionPhaseLabel(phase)).join(" -> ")}
                    </div>
                  ) : null}
                  {liveScheduleBlock ? (
                    <div className="mt-3 rounded-[1.2rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                      Live schedule block: <span className="font-semibold">{liveScheduleBlock.label}</span>
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
                      The live schedule block and competition phase are out of sync. Public scoring is still using{" "}
                      <span className="font-semibold">{formatCompetitionPhaseLabel(draft.current_phase)}</span>, not{" "}
                      <span className="font-semibold">{formatCompetitionPhaseLabel(impliedCompetitionPhase)}</span>.
                      {canEditPhase ? (
                        <button
                          type="button"
                          onClick={() => void runPhaseChange(
                            draft.id,
                            impliedCompetitionPhase,
                            `Competition synced to ${formatCompetitionPhaseLabel(impliedCompetitionPhase).toLowerCase()}.`
                          )}
                          disabled={isPending || isPhasePending}
                          className="results-secondary-button ml-3"
                        >
                          Match live block
                        </button>
                      ) : (
                        <> Only admins can sync the competition phase.</>
                      )}
                    </div>
                  ) : null}
                  {!canEditPhase ? (
                    <div className="mt-3 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      Only admins can change competition phase. Judges can still score inside the active phase.
                    </div>
                  ) : null}
                  {snapshot?.undoAvailability?.available ? (
                    <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      Undo available for the last {snapshot.undoAvailability.operation_type} until {formatDateTimeLabel(snapshot.undoAvailability.expires_at)}.
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
                        className="results-secondary-button ml-3"
                      >
                        Undo
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, slug: slugifyCompetitionName(event.target.value) })} className="results-input" placeholder="Competition name" />
                  <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: slugifyCompetitionName(event.target.value) })} className="results-input" placeholder="Slug" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <select
                    value={draft.format}
                    onChange={(event) => {
                      const nextFormat = event.target.value as Competition["format"];
                      setDraft({
                        ...draft,
                        format: nextFormat,
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
                  <input value={draft.location_name} onChange={(event) => setDraft({ ...draft, location_name: event.target.value })} className="results-input" placeholder="Location" />
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Qualifier boulders</span>
                    <input type="number" min={1} value={draft.total_climbs} onChange={(event) => setDraft({ ...draft, total_climbs: Number(event.target.value) || DEFAULT_TOTAL_CLIMBS })} className="results-input" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Climber cap</span>
                    <input type="number" min={1} value={draft.max_climbers} onChange={(event) => setDraft({ ...draft, max_climbers: Number(event.target.value) || DEFAULT_MAX_CLIMBERS })} className="results-input" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Counting climbs</span>
                    <input type="number" min={1} value={draft.qualifier_counting_climbs} onChange={(event) => setDraft({ ...draft, qualifier_counting_climbs: Number(event.target.value) || DEFAULT_QUALIFIER_COUNTING_CLIMBS })} className="results-input" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Finals cutoff</span>
                    <select value={draft.finals_cutoff} onChange={(event) => setDraft({ ...draft, finals_cutoff: Number(event.target.value) === 8 ? 8 : DEFAULT_FINALS_CUTOFF })} className="results-input">
                      <option value={6}>Top 6</option>
                      <option value={8}>Top 8</option>
                    </select>
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Finals problems</span>
                    <input type="number" min={1} max={8} value={draft.finals_problem_count} onChange={(event) => setDraft({ ...draft, finals_problem_count: Math.max(1, Math.min(8, Number(event.target.value) || 4)) })} className="results-input" />
                  </label>
                  <div className="results-meta-card">
                    <div className="results-kicker">Archived state</div>
                    <div className="mt-2 text-sm text-slate-600">Archive hides the competition from public discovery without deleting event-day data.</div>
                    <button type="button" onClick={() => void setCompetitionStatus(draft.id, draft.status === "active" ? "archived" : "active").then(() => refreshAfterChange(draft.id))} className="results-secondary-button mt-4">
                      {draft.status === "active" ? "Archive competition" : "Reopen competition"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="results-meta-card">
                    <div className="results-kicker">Qualifier age groups</div>
                    <div className="mt-2 text-sm text-slate-600">Registration and qualifier leaderboard tabs only show these age groups.</div>
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

                  <div className="results-meta-card">
                    <div className="results-kicker">Finals age groups</div>
                    <div className="mt-2 text-sm text-slate-600">Only these age groups can advance into finals selections.</div>
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
                </div>

                <div className="results-meta-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Schedule blocks</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Add ready-made blocks, then adjust the labels, times, and climbing windows for the day.
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
                    {draft.schedule_blocks.length ? (
                      draft.schedule_blocks.map((block) => {
                        const supportsCategoryFilters =
                          block.phase_type === "qualifier_round" || block.phase_type === "custom";

                        return (
                          <div key={block.id} className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-lg font-semibold text-slate-950">{block.label || "Untitled block"}</div>
                                <div className="mt-1 text-sm text-slate-600">
                                  {formatSchedulePhaseLabel(block.phase_type)} / {getSchedulePhaseDescription(block.phase_type)}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActiveScheduleBlock(block.id)}
                                  className={block.is_active ? "results-primary-button" : "results-secondary-button"}
                                >
                                  {block.is_active ? "Live block" : "Set live"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeScheduleBlock(block.id)}
                                  className="results-secondary-button"
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
                                  placeholder="Qualifier A"
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
                                    All qualifier categories
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
                        No schedule blocks yet. Start with a template above, then edit the labels and times.
                      </div>
                    )}
                  </div>
                </div>

                <div className="results-meta-card">
                  <div className="results-kicker">Share links</div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <div><span className="font-semibold text-slate-950">Overview:</span> {publicUrl || publicPath}</div>
                    <div><span className="font-semibold text-slate-950">Register:</span> {registerUrl || registerPath}</div>
                    <div><span className="font-semibold text-slate-950">Display:</span> {displayUrl || displayPath}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={() => void navigator.clipboard.writeText(publicUrl)} className="results-secondary-button">Copy overview</button>
                    <button type="button" onClick={() => void navigator.clipboard.writeText(registerUrl)} className="results-secondary-button">Copy register</button>
                  </div>
                  <Image src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicUrl || publicPath)}`} alt="Competition overview QR code" width={160} height={160} unoptimized className="mt-4 rounded-[1.2rem] border border-slate-200 bg-white p-2" />
                </div>

                {snapshot?.rounds?.length ? (
                  <div className="results-meta-card">
                    <div className="results-kicker">Competition rounds</div>
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

                {finalsOrder.length && snapshot?.finalistsPersisted ? (
                  <div className="results-meta-card">
                    <div className="results-kicker">Finals climbing order</div>
                    <div className="mt-4 space-y-3">
                      {finalsOrder.map((finalist, index) => (
                        <div key={finalist.climber_id} className="results-admin-list-item">
                          <div>
                            <div className="text-lg font-semibold text-slate-950">{finalist.name}</div>
                            <div className="mt-1 text-sm text-slate-600">{finalist.display_category} | Qualifier #{finalist.qualifier_rank}</div>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => void moveFinalist(index, -1)} disabled={index === 0} className="results-secondary-button">Up</button>
                            <button type="button" onClick={() => void moveFinalist(index, 1)} disabled={index === finalsOrder.length - 1} className="results-secondary-button">Down</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : finalsOrder.length ? (
                  <div className="results-meta-card">
                    <div className="results-kicker">Finals climbing order</div>
                    <div className="mt-2 text-sm text-slate-600">
                      Projected finalists are visible, but the order only becomes editable after you advance the competition to finals.
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={persistDraft} disabled={isPending} className="results-primary-button">
                    {isPending ? "Saving..." : "Save competition"}
                  </button>
                  {snapshot ? (
                    <>
                      <button type="button" onClick={() => downloadCsv(`${draft.slug}-qualifiers.csv`, buildQualifierCsv(snapshot))} className="results-secondary-button">
                        Export qualifier CSV
                      </button>
                      <button type="button" onClick={() => downloadCsv(`${draft.slug}-finals.csv`, buildFinalsCsv(snapshot))} className="results-secondary-button" disabled={!snapshot.finalsLeaderboard.length}>
                        Export finals CSV
                      </button>
                      <button type="button" onClick={() => window.open(buildDisplayPath(draft.slug), "_blank", "noopener,noreferrer")} className="results-secondary-button">
                        Open print/display view
                      </button>
                    </>
                  ) : null}
                  <button type="button" onClick={() => setConfirming({
                    title: "Advance to finals",
                    description: "This will create the finals field from the official standings and open finals scoring. You can undo it for 30 seconds.",
                    confirmLabel: "Advance",
                    expectedValue: draft.name,
                    action: async () => {
                      await advanceCompetitionToFinals(draft.id);
                      await refreshAfterChange(draft.id);
                      setMessage("Competition advanced to finals.");
                    },
                  })} className="results-secondary-button">Advance to finals</button>
                  <button type="button" onClick={() => setConfirming({
                    title: "Delete competition",
                    description: "This permanently deletes the competition and all of its registrations, scores, finalists, and schedule data. This cannot be undone.",
                    confirmLabel: "Delete",
                    expectedValue: draft.name,
                    action: async () => {
                      await deleteCompetition(draft.id);
                      setDraft(null);
                      setSnapshot(null);
                      setSelectedCompetitionId("");
                      await refreshAfterChange();
                      setMessage("Competition deleted.");
                    },
                  })} className="results-secondary-button">Delete competition</button>
                </div>
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
