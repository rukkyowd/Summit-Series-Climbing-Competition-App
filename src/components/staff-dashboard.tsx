"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import SiteHeader from "@/components/site-header";
import ConfirmationModal from "@/components/confirmation-modal";
import { getAuthState, signOutUser, type Profile } from "@/lib/auth";
import { buildFinalsCsv, buildQualifierCsv, downloadCsv } from "@/lib/export";
import {
  advanceCompetitionToFinals,
  createCompetitionFromTemplate,
  getCompetitionSnapshot,
  listCompetitionSummaries,
  resetCompetition,
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
  buildCompetitionPath,
  buildDisplayPath,
  buildStaffCompetitionPath,
  formatCompetitionPhaseLabel,
  formatDateTimeLabel,
  getNextCompetitionPhase,
  getPreviousCompetitionPhase,
  getRecommendedFinalsCutoff,
  getRecommendedQualifierClimbCount,
  getRecommendedQualifierCountingClimbs,
  slugifyCompetitionName,
  type Competition,
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
  const [confirming, setConfirming] = useState<null | {
    title: string;
    description: string;
    confirmLabel: string;
    expectedValue?: string;
    action: () => Promise<void>;
  }>(null);

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

  const publicUrl = draft ? buildCompetitionPath(draft.slug) : "";
  const registerUrl = draft ? buildCompetitionPath(draft.slug, "register") : "";
  const judgeUrl = draft ? buildStaffCompetitionPath(draft.slug, "judge") : "";
  const displayUrl = draft ? buildDisplayPath(draft.slug) : "";
  const nextPhase = draft ? getNextCompetitionPhase(draft.current_phase) : null;
  const previousPhase = draft ? getPreviousCompetitionPhase(draft.current_phase) : null;
  const finalsOrder = useMemo(
    () => [...(snapshot?.finalists ?? [])].sort((left, right) => (left.climbing_order ?? 0) - (right.climbing_order ?? 0)),
    [snapshot]
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
                    <div className="mt-2 text-sm text-slate-600">{publicUrl}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={publicUrl} className="results-secondary-button">Public page</Link>
                    <Link href={judgeUrl} className="results-secondary-button">Judge panel</Link>
                    <Link href={displayUrl} className="results-secondary-button">Display</Link>
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
                        onClick={() => previousPhase && void setCompetitionPhase(draft.id, previousPhase).then(() => refreshAfterChange(draft.id))}
                        disabled={!previousPhase || isPending}
                        className="results-secondary-button"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => nextPhase && void setCompetitionPhase(draft.id, nextPhase).then(() => refreshAfterChange(draft.id))}
                        disabled={!nextPhase || isPending}
                        className="results-primary-button"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  {snapshot?.undoAvailability?.available ? (
                    <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      Undo available for the last {snapshot.undoAvailability.operation_type} until {formatDateTimeLabel(snapshot.undoAvailability.expires_at)}.
                      <button type="button" onClick={() => void undoCompetitionOperation(draft.id).then(() => refreshAfterChange(draft.id))} className="results-secondary-button ml-3">
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
                  <div className="results-kicker">Share links</div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <div><span className="font-semibold text-slate-950">Overview:</span> {publicUrl}</div>
                    <div><span className="font-semibold text-slate-950">Register:</span> {registerUrl}</div>
                    <div><span className="font-semibold text-slate-950">Display:</span> {displayUrl}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={() => void navigator.clipboard.writeText(publicUrl)} className="results-secondary-button">Copy overview</button>
                    <button type="button" onClick={() => void navigator.clipboard.writeText(registerUrl)} className="results-secondary-button">Copy register</button>
                  </div>
                  <Image src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(registerUrl || publicUrl)}`} alt="Registration QR code" width={160} height={160} unoptimized className="mt-4 rounded-[1.2rem] border border-slate-200 bg-white p-2" />
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

                {finalsOrder.length ? (
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
                    title: "Reset competition",
                    description: "This clears registrations and scores, restores default categories, and leaves a 30 second undo window.",
                    confirmLabel: "Reset",
                    expectedValue: draft.name,
                    action: async () => {
                      await resetCompetition(draft.id);
                      await refreshAfterChange(draft.id);
                      setMessage("Competition reset.");
                    },
                  })} className="results-secondary-button">Reset competition</button>
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
          busy={isPending}
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
