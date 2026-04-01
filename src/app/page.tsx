"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import CompetitionListCard from "@/components/competition-list-card";
import { getAuthState, isStaffRole, signInWithRole, signOutUser, type Profile } from "@/lib/auth";
import {
  advanceCompetitionToFinals,
  createCompetitionFromTemplate,
  deleteCompetition,
  listCompetitionSummaries,
  resetCompetition,
  saveCompetitionConfig,
  setCompetitionStatus,
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
  formatDateRange,
  formatStageLabel,
  formatSupportsFinals,
  formatTimeRange,
  getActiveScheduleBlock,
  getEventWorkflowGuide,
  normalizeCompetition,
  parseScheduleTimeToMinutes,
  slugifyCompetitionName,
  type Competition,
  type CompetitionScheduleBlock,
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

function makeScheduleBlock(competitionId: string): CompetitionScheduleBlock {
  return {
    id: `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    competition_id: competitionId,
    label: "Check-in",
    phase_type: "check_in",
    audience_label: "",
    is_active: false,
    start_time: "09:00",
    end_time: "10:00",
    capacity: 30,
    eligible_category_ids: [],
  };
}

function sortBlocks(blocks: CompetitionScheduleBlock[]) {
  return [...blocks].sort((left, right) => {
    const leftStart = parseScheduleTimeToMinutes(left.start_time);
    const rightStart = parseScheduleTimeToMinutes(right.start_time);
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }

    return left.label.localeCompare(right.label);
  });
}

function formatDateInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function formatDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 16);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeLocalValue(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export default function HomePage() {
  const [activeSummaries, setActiveSummaries] = useState<CompetitionSummary[]>([]);
  const [allSummaries, setAllSummaries] = useState<CompetitionSummary[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState("");
  const [draft, setDraft] = useState<Competition | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createName, setCreateName] = useState("");
  const [createFormat, setCreateFormat] = useState<Competition["format"]>("scramble");
  const [createLocation, setCreateLocation] = useState("");

  const loadPublic = async () => {
    const next = await listCompetitionSummaries(false);
    setActiveSummaries(next);
  };

  const loadStaff = async () => {
    const next = await listCompetitionSummaries(true);
    setAllSummaries(next);
    setSelectedCompetitionId((current) => {
      if (current && next.some((entry) => entry.competition.id === current)) {
        return current;
      }

      return next[0]?.competition.id ?? "";
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadPublic();
      const state = await getAuthState();
      setProfile(state.profile);

      if (isStaffRole(state.profile?.role)) {
        await loadStaff();
      }

      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load competitions.");
    } finally {
      setLoading(false);
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canSeeStaff = isStaffRole(profile?.role);
  const canSave = profile?.role === "admin";

  const selectedSummary = useMemo(
    () => allSummaries.find((entry) => entry.competition.id === selectedCompetitionId) ?? null,
    [allSummaries, selectedCompetitionId]
  );

  useEffect(() => {
    if (selectedSummary) {
      setDraft(cloneCompetition(selectedSummary.competition));
    }
  }, [selectedSummary]);

  const filteredSummaries = useMemo(() => {
    return activeSummaries.filter((summary) => {
      const matchesSearch =
        !search.trim() ||
        summary.competition.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        summary.competition.location_name.toLowerCase().includes(search.trim().toLowerCase());
      const matchesFormat = formatFilter === "all" || summary.competition.format === formatFilter;
      return matchesSearch && matchesFormat;
    });
  }, [activeSummaries, formatFilter, search]);

  const liveNow = filteredSummaries.filter((summary) => summary.live_now);
  const featured = liveNow[0] ?? filteredSummaries[0] ?? null;
  const orderedDraftBlocks = useMemo(() => (draft ? sortBlocks(draft.schedule_blocks) : []), [draft]);
  const supportsFinals = draft ? formatSupportsFinals(draft.format) || draft.format === "scramble" : false;
  const workflowGuide = useMemo(() => (draft ? getEventWorkflowGuide(draft) : null), [draft]);
  const activeBlock = useMemo(() => (draft ? getActiveScheduleBlock(draft) : null), [draft]);

  const refreshAfterChange = async () => {
    await loadPublic();
    if (canSeeStaff) {
      await loadStaff();
    }
  };

  const persistDraft = (nextDraft: Competition, successText: string) => {
    if (!canSave) {
      return;
    }

    setMessage("");
    setError("");
    startTransition(() => {
      void (async () => {
        try {
          await saveCompetitionConfig(nextDraft.id, {
            ...nextDraft,
            schedule_blocks: nextDraft.schedule_blocks,
          });
          await refreshAfterChange();
          setMessage(successText);
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : "Unable to save the competition.");
        }
      })();
    });
  };

  const updateBlock = (blockId: string, patch: Partial<CompetitionScheduleBlock>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            schedule_blocks: current.schedule_blocks.map((block) => {
              if (patch.is_active && block.id !== blockId) {
                return { ...block, is_active: false };
              }

              return block.id === blockId ? { ...block, ...patch } : block;
            }),
          }
        : current
    );
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const state = await signInWithRole(email, password);
      setProfile(state.profile);
      setPassword("");
      await loadStaff();
    } catch (nextError) {
      setAuthError(nextError instanceof Error ? nextError.message : "Unable to sign in.");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader
          light
          status={
            <>
              <div className="results-chip">{activeSummaries.length} active competitions</div>
              {canSeeStaff ? (
                <button
                  type="button"
                  onClick={() => void signOutUser().then(() => setProfile(null))}
                  className="results-secondary-button"
                >
                  Sign out
                </button>
              ) : null}
            </>
          }
        />

        <section className="results-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="results-kicker">Events</div>
              <h1 className="mt-3 text-4xl font-semibold text-slate-950 sm:text-5xl">Browse active competitions</h1>
              <p className="mt-3 max-w-3xl text-base leading-8 text-slate-600">
                Scan the event QR code, choose the competition you are actually climbing in, and everything after that stays competition-specific: registration, scorecard, leaderboard, finalists, and finals.
              </p>
            </div>
            {featured ? (
              <Link href={buildCompetitionPath(featured.competition.slug)} className="results-primary-button">
                Open featured competition
              </Link>
            ) : null}
          </div>

          {featured ? (
            <div className="results-feature mt-6">
              <div className="results-kicker text-white/80">Live now</div>
              <div className="mt-4 max-w-md rounded-[1.6rem] bg-white/90 p-5 shadow-xl">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {featured.competition.discipline_label}
                </div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{featured.competition.name}</div>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <div>{formatDateRange(featured.competition.start_date, featured.competition.end_date)}</div>
                  <div>{featured.competition.location_name || "Location TBD"}</div>
                  {featured.active_schedule_block ? <div>{featured.active_schedule_block.label}</div> : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="results-input"
              placeholder="Search by competition name or location"
            />
            <select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)} className="results-input">
              <option value="all">All formats</option>
              {FORMAT_TEMPLATES.map((template) => (
                <option key={template.value} value={template.value}>
                  {template.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-8 space-y-4">
            <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <div>Event</div>
              <div>Location</div>
              <div>Registration deadline</div>
              <div>Date</div>
            </div>
            {filteredSummaries.map((summary) => (
              <CompetitionListCard key={summary.competition.id} summary={summary} />
            ))}
            {!filteredSummaries.length && !loading ? (
              <div className="results-card text-center text-slate-600">No active competitions match that search yet.</div>
            ) : null}
          </div>
        </section>

        {canSeeStaff ? (
          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="results-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="results-kicker">Staff dashboard</div>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-950">Manage competitions</h2>
                </div>
                <div className="results-chip">{profile?.role}</div>
              </div>

              <div className="mt-6 grid gap-3">
                <input value={createName} onChange={(event) => setCreateName(event.target.value)} className="results-input" placeholder="New competition name" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={createFormat} onChange={(event) => setCreateFormat(event.target.value as Competition["format"])} className="results-input">
                    {FORMAT_TEMPLATES.map((template) => (
                      <option key={template.value} value={template.value}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                  <input value={createLocation} onChange={(event) => setCreateLocation(event.target.value)} className="results-input" placeholder="Location" />
                </div>
                <button
                  type="button"
                  disabled={!canSave || isPending || !createName.trim()}
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
                          await refreshAfterChange();
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
                        {summary.competition.status} | {formatStageLabel(summary.competition.stage_mode)} | {summary.climber_count} climbers
                      </div>
                    </div>
                    <div className="text-sm text-slate-500">{summary.competition.slug}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="results-card">
              {error ? <div className="results-alert results-alert-error">{error}</div> : null}
              {message ? <div className="results-alert results-alert-success">{message}</div> : null}

              {draft ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="results-kicker">Competition setup</div>
                      <h2 className="mt-2 text-3xl font-semibold text-slate-950">{draft.name}</h2>
                      <div className="mt-2 text-sm text-slate-600">{buildCompetitionPath(draft.slug)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={buildCompetitionPath(draft.slug)} className="results-secondary-button">
                        Open public page
                      </Link>
                      <button
                        type="button"
                        className="results-secondary-button"
                        onClick={() =>
                          void setCompetitionStatus(draft.id, draft.status === "active" ? "archived" : "active").then(refreshAfterChange)
                        }
                      >
                        {draft.status === "active" ? "Archive" : "Reopen"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, slug: slugifyCompetitionName(event.target.value) })} className="results-input" placeholder="Competition name" />
                    <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: slugifyCompetitionName(event.target.value) })} className="results-input" placeholder="Slug" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as Competition["format"] })} className="results-input">
                      {FORMAT_TEMPLATES.map((template) => (
                        <option key={template.value} value={template.value}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                    <input value={draft.discipline_label} onChange={(event) => setDraft({ ...draft, discipline_label: event.target.value })} className="results-input" placeholder="Discipline label" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <input value={draft.location_name} onChange={(event) => setDraft({ ...draft, location_name: event.target.value })} className="results-input" placeholder="Location" />
                    <input value={draft.hero_image_url} onChange={(event) => setDraft({ ...draft, hero_image_url: event.target.value })} className="results-input" placeholder="Hero image URL" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Start date</span>
                      <input
                        type="date"
                        value={formatDateInputValue(draft.start_date)}
                        onChange={(event) => setDraft({ ...draft, start_date: event.target.value || null })}
                        className="results-input"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">End date</span>
                      <input
                        type="date"
                        value={formatDateInputValue(draft.end_date)}
                        onChange={(event) => setDraft({ ...draft, end_date: event.target.value || null })}
                        className="results-input"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Registration opens</span>
                      <input
                        type="datetime-local"
                        value={formatDateTimeLocalValue(draft.registration_opens_at)}
                        onChange={(event) => setDraft({ ...draft, registration_opens_at: parseDateTimeLocalValue(event.target.value) })}
                        className="results-input"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Registration closes</span>
                      <input
                        type="datetime-local"
                        value={formatDateTimeLocalValue(draft.registration_closes_at)}
                        onChange={(event) => setDraft({ ...draft, registration_closes_at: parseDateTimeLocalValue(event.target.value) })}
                        className="results-input"
                      />
                    </label>
                  </div>
                  <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="results-textarea" placeholder="Competition description" />

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
                      <select value={draft.finals_cutoff} onChange={(event) => setDraft({ ...draft, finals_cutoff: Number(event.target.value) === 8 ? 8 : DEFAULT_FINALS_CUTOFF })} className="results-input" disabled={!supportsFinals}>
                        <option value={6}>Top 6 finals</option>
                        <option value={8}>Top 8 finals</option>
                      </select>
                    </label>
                  </div>

                  <div className="results-meta-card">
                    <div className="results-kicker">Qualifier age groups</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {CATEGORY_AGE_GROUPS.map((ageGroup) => {
                        const selected = draft.qualifier_eligible_age_groups.includes(ageGroup);
                        return (
                          <label key={ageGroup} className={`results-select-chip ${selected ? "results-select-chip-active" : ""}`}>
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={selected}
                              onChange={(event) => {
                                const next = event.target.checked
                                  ? [...draft.qualifier_eligible_age_groups, ageGroup]
                                  : draft.qualifier_eligible_age_groups.filter((entry) => entry !== ageGroup);

                                setDraft({
                                  ...draft,
                                  qualifier_eligible_age_groups: next.length ? next : draft.qualifier_eligible_age_groups,
                                });
                              }}
                            />
                            {ageGroup}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="results-meta-card">
                    <div className="results-kicker">Finals age groups</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {CATEGORY_AGE_GROUPS.map((ageGroup) => {
                        const selected = draft.finals_eligible_age_groups.includes(ageGroup);
                        return (
                          <label key={ageGroup} className={`results-select-chip ${selected ? "results-select-chip-active" : ""}`}>
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={selected}
                              onChange={(event) => {
                                const next = event.target.checked
                                  ? [...draft.finals_eligible_age_groups, ageGroup]
                                  : draft.finals_eligible_age_groups.filter((entry) => entry !== ageGroup);

                                setDraft({
                                  ...draft,
                                  finals_eligible_age_groups: next.length ? next : draft.finals_eligible_age_groups,
                                });
                              }}
                            />
                            {ageGroup}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="results-meta-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="results-kicker">Schedule blocks</div>
                        <div className="mt-2 text-sm text-slate-600">
                          {activeBlock ? `${activeBlock.label} is live.` : "No block is live right now."}
                        </div>
                      </div>
                      <button type="button" onClick={() => setDraft({ ...draft, schedule_blocks: [...draft.schedule_blocks, makeScheduleBlock(draft.id)] })} className="results-secondary-button">
                        Add block
                      </button>
                    </div>
                    <div className="mt-4 space-y-4">
                      {orderedDraftBlocks.map((block) => (
                        <div key={block.id} className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <input value={block.label} onChange={(event) => updateBlock(block.id, { label: event.target.value })} className="results-input" placeholder="Block label" />
                            <select value={block.phase_type} onChange={(event) => updateBlock(block.id, { phase_type: event.target.value as CompetitionScheduleBlock["phase_type"] })} className="results-input">
                              {SCHEDULE_PHASE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <input value={block.audience_label} onChange={(event) => updateBlock(block.id, { audience_label: event.target.value })} className="results-input" placeholder="Audience label" />
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <input value={block.start_time ?? ""} onChange={(event) => updateBlock(block.id, { start_time: event.target.value })} className="results-input" placeholder="Start time" />
                            <input value={block.end_time ?? ""} onChange={(event) => updateBlock(block.id, { end_time: event.target.value })} className="results-input" placeholder="End time" />
                            <input type="number" min={1} value={block.capacity} onChange={(event) => updateBlock(block.id, { capacity: Number(event.target.value) || 1 })} className="results-input" placeholder="Capacity" />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => updateBlock(block.id, { is_active: true })} className="results-secondary-button">
                              {block.is_active ? "Current live block" : "Set live"}
                            </button>
                            <button type="button" onClick={() => setDraft({ ...draft, schedule_blocks: draft.schedule_blocks.filter((entry) => entry.id !== block.id) })} className="results-secondary-button">
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {workflowGuide ? (
                    <div className="results-meta-card">
                      <div className="results-kicker">Workflow guide</div>
                      <div className="mt-2 text-xl font-semibold text-slate-950">{workflowGuide.headline}</div>
                      <p className="mt-3 text-slate-600">{workflowGuide.summary}</p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => persistDraft(draft, "Competition saved.")} disabled={!canSave || isPending} className="results-primary-button">
                      {isPending ? "Saving..." : "Save competition"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!canSave) {
                          return;
                        }

                        const confirmed = window.confirm("Advance this competition to finals and freeze qualifiers?");
                        if (!confirmed) {
                          return;
                        }

                        startTransition(() => {
                          void (async () => {
                            try {
                              await advanceCompetitionToFinals(draft.id);
                              await refreshAfterChange();
                              setMessage("Competition advanced to finals.");
                            } catch (nextError) {
                              setError(nextError instanceof Error ? nextError.message : "Unable to advance competition.");
                            }
                          })();
                        });
                      }}
                      disabled={!canSave || isPending || draft.stage_mode === "finals"}
                      className="results-secondary-button"
                    >
                      Advance to finals
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!canSave) {
                          return;
                        }

                        const confirmed = window.confirm("Reset this competition back to its default empty state?");
                        if (!confirmed) {
                          return;
                        }

                        startTransition(() => {
                          void (async () => {
                            try {
                              await resetCompetition(draft.id);
                              await refreshAfterChange();
                              setMessage("Competition reset.");
                            } catch (nextError) {
                              setError(nextError instanceof Error ? nextError.message : "Unable to reset competition.");
                            }
                          })();
                        });
                      }}
                      disabled={!canSave || isPending}
                      className="results-secondary-button"
                    >
                      Reset competition
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!canSave) {
                          return;
                        }

                        const confirmed = window.confirm(
                          `Delete ${draft.name}? This will permanently remove its registrations, scorecards, schedule blocks, finalists, and results.`
                        );
                        if (!confirmed) {
                          return;
                        }

                        startTransition(() => {
                          void (async () => {
                            try {
                              await deleteCompetition(draft.id);
                              await refreshAfterChange();
                              setMessage("Competition deleted.");
                            } catch (nextError) {
                              setError(nextError instanceof Error ? nextError.message : "Unable to delete competition.");
                            }
                          })();
                        });
                      }}
                      disabled={!canSave || isPending}
                      className="results-secondary-button"
                    >
                      Delete competition
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-slate-600">Select a competition to edit it.</div>
              )}
            </section>
          </section>
        ) : (
          <section className="results-card">
            <div className="results-kicker">Staff access</div>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">Judge or admin sign-in</h2>
            <p className="mt-3 max-w-2xl text-base leading-8 text-slate-600">
              Public users only see the competition browser. Staff-only management stays hidden until you sign in.
            </p>
            <form onSubmit={signIn} className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@gym.com" className="results-input" />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="results-input" />
              <button type="submit" disabled={authLoading} className="results-primary-button">
                {authLoading ? "Signing in..." : "Sign in"}
              </button>
            </form>
            {authError ? <div className="results-alert results-alert-error mt-4">{authError}</div> : null}
          </section>
        )}
      </div>
    </main>
  );
}
