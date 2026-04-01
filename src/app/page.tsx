"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { getAuthState, isStaffRole, signInWithRole, signOutUser, type Profile } from "@/lib/auth";
import { advanceEventToFinals, getCompetitionSnapshot, resetActiveEvent, saveEventConfig, type CompetitionSnapshot } from "@/lib/db";
import {
  CATEGORY_AGE_GROUPS,
  DEFAULT_FINALS_CUTOFF,
  DEFAULT_MAX_CLIMBERS,
  DEFAULT_QUALIFIER_COUNTING_CLIMBS,
  DEFAULT_TOTAL_CLIMBS,
  FORMAT_TEMPLATES,
  SCHEDULE_PHASE_OPTIONS,
  formatSchedulePhaseLabel,
  getActiveScheduleBlock,
  getEventWorkflowGuide,
  formatStageLabel,
  formatSupportsFinals,
  formatTimeRange,
  type EventConfig,
  type EventTimeSlot,
} from "@/lib/scoring";

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneEvent(event: EventConfig): EventConfig {
  return {
    ...event,
    categories: event.categories.map((category) => ({ ...category })),
    time_slots: event.time_slots.map((slot) => ({
      ...slot,
      phase_type: slot.phase_type,
      audience_label: slot.audience_label,
      is_active: slot.is_active,
      eligible_category_ids: [...slot.eligible_category_ids],
    })),
  };
}

function makeSlot(): EventTimeSlot {
  return {
    id: makeId(),
    event_id: 1,
    label: "Check-in",
    phase_type: "check_in",
    audience_label: "",
    is_active: false,
    start_time: "09:00",
    end_time: "11:00",
    capacity: 20,
    eligible_category_ids: [],
  };
}

export default function HomePage() {
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [draft, setDraft] = useState<EventConfig | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    try {
      const nextSnapshot = await getCompetitionSnapshot();
      setSnapshot(nextSnapshot);
      setDraft(cloneEvent(nextSnapshot.event));
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load the active event.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    getAuthState()
      .then((state) => setProfile(state.profile))
      .catch((nextError) => {
        setAuthError(nextError instanceof Error ? nextError.message : "Unable to read the staff session.");
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const canSave = profile?.role === "admin";
  const canSeeStaffControls = isStaffRole(profile?.role);
  const supportsFinals = draft ? formatSupportsFinals(draft.format) : false;
  const canConfigureFinalsAdvancement = draft ? draft.format === "scramble" || supportsFinals : false;
  const finalsActive = draft?.stage_mode === "finals";
  const canAdvanceToFinals = canSave && draft?.format === "scramble" && draft.stage_mode === "qualifier";
  const leader = snapshot?.qualifierLeaderboard[0] ?? null;
  const workflowGuide = useMemo(
    () => (snapshot ? getEventWorkflowGuide(snapshot.event) : null),
    [snapshot]
  );
  const activeScheduleBlock = useMemo(
    () => (snapshot ? getActiveScheduleBlock(snapshot.event) : null),
    [snapshot]
  );
  const stats = useMemo(
    () => ({
      climbers: snapshot?.climbers.length ?? 0,
      categories: snapshot?.event.categories.length ?? 0,
      slots: snapshot?.event.time_slots.length ?? 0,
      finalists: snapshot?.finalists.length ?? 0,
    }),
    [snapshot]
  );

  const save = () => {
    if (!draft || !canSave) {
      return;
    }

    setMessage("");
    startTransition(() => {
      void (async () => {
        try {
          await saveEventConfig({
            name: draft.name,
            format: draft.format,
            total_climbs: draft.total_climbs,
            max_climbers: draft.max_climbers,
            qualifier_counting_climbs: draft.qualifier_counting_climbs,
            finals_cutoff: draft.finals_cutoff,
            finals_tie_advances: draft.finals_tie_advances,
            finals_eligible_age_groups: draft.finals_eligible_age_groups,
            stage_mode: draft.stage_mode,
            qualifier_locked_at: draft.qualifier_locked_at,
            finals_started_at: draft.finals_started_at,
            finals_problem_count: draft.finals_problem_count,
            categories: [],
            time_slots: draft.time_slots,
          });

          await load();
          setMessage("Event setup saved.");
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : "Unable to save the event.");
        }
      })();
    });
  };

  const advanceToFinals = () => {
    if (!canAdvanceToFinals) {
      return;
    }

    const confirmed = window.confirm(
      "Advance this scramble to finals? This will freeze registration and qualifier scoring, snapshot finalists for the configured Men and Women finals age groups, clear any finals attempts, and switch the event into the 2025 IFSC points finals format."
    );

    if (!confirmed) {
      return;
    }

    setMessage("");
    setError("");
    startTransition(() => {
      void (async () => {
        try {
          await advanceEventToFinals();
          await load();
          setMessage("Event advanced to finals. Registration and qualifier scoring are now locked.");
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : "Unable to advance the event to finals.");
        }
      })();
    });
  };

  const resetEvent = () => {
    if (!canSave) {
      return;
    }

    const confirmed = window.confirm(
      "Reset the active event back to default? This will delete all climbers, qualifier attempts, finalist snapshots, finals attempts, time slots, and restore the default scramble setup."
    );

    if (!confirmed) {
      return;
    }

    setMessage("");
    setError("");
    startTransition(() => {
      void (async () => {
        try {
          await resetActiveEvent();
          await load();
          setMessage("Active event reset to defaults.");
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : "Unable to reset the active event.");
        }
      })();
    });
  };

  const updateSlot = (slotId: string, patch: Partial<EventTimeSlot>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            time_slots: current.time_slots.map((slot) => {
              if (patch.is_active && slot.id !== slotId) {
                return { ...slot, is_active: false };
              }

              return slot.id === slotId ? { ...slot, ...patch } : slot;
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
    } catch (nextError) {
      setAuthError(nextError instanceof Error ? nextError.message : "Unable to sign in.");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="content-frame space-y-6">
        <SiteHeader
          status={
            <>
              <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                {snapshot ? FORMAT_TEMPLATES.find((item) => item.value === snapshot.event.format)?.label : "Loading"}
              </div>
              <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                {snapshot ? formatStageLabel(snapshot.event.stage_mode) : "Stage"}
              </div>
              <Link href="/leaderboard" className="nav-pill">
                Public standings
              </Link>
            </>
          }
        />

        <section className="card relative overflow-hidden">
          <div className="absolute -left-16 top-10 h-44 w-44 rounded-full bg-accent/10 blur-3xl" />
          <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-yellow-300/10 blur-3xl" />
          <div className="relative grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <span className="eyebrow border-fbc-yellow/20 bg-fbc-yellow/10 text-fbc-yellow">Active event</span>
              <h1 className="section-title mt-4 text-5xl sm:text-6xl">{snapshot?.event.name ?? "Loading event"}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                Manage the live event format, structured categories, slot capacity, qualifier scoring, and finals flow from one active configuration.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/register" className="btn-primary">
                  Register climber
                </Link>
                <Link href="/scorecard" className="btn-ghost">
                  Open scorecards
                </Link>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="hero-stat"><div className="meta-label">Climbers</div><div className="mt-3 font-display text-5xl text-chalk">{stats.climbers}</div></div>
              <div className="hero-stat"><div className="meta-label">Categories</div><div className="mt-3 font-display text-5xl text-chalk">{stats.categories}</div></div>
              <div className="hero-stat"><div className="meta-label">Slots</div><div className="mt-3 font-display text-5xl text-chalk">{stats.slots}</div></div>
              <div className="hero-stat"><div className="meta-label">Finalists</div><div className="mt-3 font-display text-5xl text-chalk">{stats.finalists}</div></div>
            </div>
          </div>
        </section>

        <section className={`grid gap-4 ${canSeeStaffControls ? "xl:grid-cols-[0.95fr_1.05fr]" : ""}`}>
          <div className="space-y-4">
            {canSeeStaffControls ? (
              <section className="card">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="eyebrow">Staff access</div>
                    <h2 className="section-title mt-4 text-3xl">Signed in as {profile?.role}</h2>
                  </div>
                  <button onClick={() => void signOutUser().then(() => setProfile(null))} className="btn-ghost">
                    Sign out
                  </button>
                </div>

                <p className="mt-3 text-sm text-slate-300">
                  {canSave ? "Admin controls are unlocked." : "Judge controls are available, but only admins can save event setup changes."}
                </p>
              </section>
            ) : null}

            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="eyebrow">Public snapshot</div>
                  <h2 className="section-title mt-4 text-3xl">Current event shape</h2>
                </div>
                <div className={`status-pill ${leader ? "border-green-500/20 bg-green-500/10 text-green-200" : "border-white/10 bg-white/[0.03] text-slate-300"}`}>
                  {leader ? `Leader: ${leader.name}` : "No qualifier leader yet"}
                </div>
              </div>

              {loading ? <p className="mt-4 text-sm text-slate-300">Loading event summary...</p> : null}
            {snapshot ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                    <div className="meta-label">Format template</div>
                    <div className="mt-2 text-2xl font-semibold text-chalk">
                      {FORMAT_TEMPLATES.find((item) => item.value === snapshot.event.format)?.label}
                    </div>
                    <div className="mt-3 text-sm text-slate-300">
                      Current stage: {formatStageLabel(snapshot.event.stage_mode)}
                    </div>
                    <p className="mt-3 text-sm text-slate-300">
                      {FORMAT_TEMPLATES.find((item) => item.value === snapshot.event.format)?.description}
                    </p>
                  </div>
                  {workflowGuide ? (
                    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                      <div className="meta-label">Day-of workflow</div>
                      <div className="mt-2 text-2xl font-semibold text-chalk">{workflowGuide.headline}</div>
                      <p className="mt-3 text-sm text-slate-300">{workflowGuide.summary}</p>
                      <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        {workflowGuide.roles.map((entry) => (
                          <div key={entry.role} className="card-muted">
                            <div className="meta-label">{entry.role}</div>
                            <div className="mt-2 text-lg font-semibold text-chalk">{entry.title}</div>
                            <p className="mt-2 text-sm leading-6 text-slate-300">{entry.detail}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 space-y-2">
                        {workflowGuide.notes.map((note) => (
                          <p key={note} className="text-sm text-slate-400">
                            {note}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                    <div className="meta-label">Current live block</div>
                    {activeScheduleBlock ? (
                      <>
                        <div className="mt-2 text-2xl font-semibold text-chalk">{activeScheduleBlock.label}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="status-pill border-green-500/20 bg-green-500/10 text-green-200">
                            {formatSchedulePhaseLabel(activeScheduleBlock.phase_type)}
                          </span>
                          {activeScheduleBlock.audience_label ? (
                            <span className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                              {activeScheduleBlock.audience_label}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm text-slate-300">
                          {formatTimeRange(activeScheduleBlock.start_time, activeScheduleBlock.end_time)}
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-slate-300">
                        No schedule block is marked live right now. The app falls back to the overall qualifier or finals stage until you choose one.
                      </p>
                    )}
                  </div>
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                    <div className="meta-label">Categories</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {snapshot.event.categories.map((category) => (
                        <span key={category.id} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200">
                          {category.display_name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                    <div className="meta-label">Schedule blocks</div>
                    <div className="mt-4 space-y-3">
                      {snapshot.event.time_slots.map((slot) => (
                        <div key={slot.id} className="card-muted">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-lg font-semibold text-chalk">{slot.label}</div>
                              <div className="mt-1 flex flex-wrap gap-2 text-sm text-slate-300">
                                <span>{formatTimeRange(slot.start_time, slot.end_time)}</span>
                                <span>{formatSchedulePhaseLabel(slot.phase_type)}</span>
                                {slot.audience_label ? <span>{slot.audience_label}</span> : null}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {slot.is_active ? (
                                <div className="status-pill border-green-500/20 bg-green-500/10 text-green-200">
                                  Live now
                                </div>
                              ) : null}
                              <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">Cap {slot.capacity}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {!snapshot.event.time_slots.length ? <p className="text-sm text-slate-300">No schedule blocks configured yet. Add slot rows for check-in, isolation, round windows, and results so mobile users can follow the day easily.</p> : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          {canSeeStaffControls ? (
            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="eyebrow">Admin setup</div>
                  <h2 className="section-title mt-4 text-4xl">Configure the active event</h2>
                </div>
                <div className={`status-pill ${canSave ? "border-green-500/20 bg-green-500/10 text-green-200" : "border-white/10 bg-white/[0.03] text-slate-300"}`}>
                  {canSave ? "Editable" : "Read-only"}
                </div>
              </div>

              {error ? <div className="mt-5 rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{error}</div> : null}
              {message ? <div className="mt-5 rounded-[1.3rem] border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-200">{message}</div> : null}

              {draft ? (
                <div className="mt-6 space-y-6">
                  {finalsActive ? (
                    <div className="rounded-[1.4rem] border border-green-500/20 bg-green-500/10 px-4 py-4 text-sm text-green-100">
                      Finals are active. The event format and qualifier settings are locked so the live finals standings stay stable, but the schedule board can still be updated.
                    </div>
                  ) : null}

                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                    <div className="meta-label">What these controls do</div>
                    <div className="mt-3 space-y-2">
                      <p>`Event name`: the title shown across the app.</p>
                      <p>`Format`: the competition mode and scoring flow.</p>
                      <p>`Qualifier boulders`: how many qualifier problems climbers can log.</p>
                      <p>`Climber cap`: the maximum number of registrations allowed.</p>
                      <p>`Counting climbs`: how many best qualifier climbs count toward ranking.</p>
                      <p>`Finals cutoff`: how many climbers advance per finals-eligible category, before tie extensions.</p>
                      <p>`Finals age groups`: which Men and Women age groups are allowed to advance to finals.</p>
                    </div>
                  </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-300">
                    <span className="meta-label mb-2 block">Event name</span>
                    <input type="text" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={!canSave || finalsActive} className="input-field" placeholder="Event name" />
                  </label>
                  <label className="text-sm text-slate-300">
                    <span className="meta-label mb-2 block">Format template</span>
                    <select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as EventConfig["format"] })} disabled={!canSave || finalsActive} className="input-field">
                      {FORMAT_TEMPLATES.map((template) => <option key={template.value} value={template.value}>{template.label}</option>)}
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-sm text-slate-300">
                    <span className="meta-label mb-2 block">Qualifier boulders</span>
                    <input type="number" min={1} value={draft.total_climbs} onChange={(event) => setDraft({ ...draft, total_climbs: Number(event.target.value) || DEFAULT_TOTAL_CLIMBS })} disabled={!canSave || finalsActive} className="input-field" placeholder="Total climbs" />
                  </label>
                  <label className="text-sm text-slate-300">
                    <span className="meta-label mb-2 block">Climber cap</span>
                    <input type="number" min={1} value={draft.max_climbers} onChange={(event) => setDraft({ ...draft, max_climbers: Number(event.target.value) || DEFAULT_MAX_CLIMBERS })} disabled={!canSave || finalsActive} className="input-field" placeholder="Climber cap" />
                  </label>
                  <label className="text-sm text-slate-300">
                    <span className="meta-label mb-2 block">Counting climbs</span>
                    <input type="number" min={1} value={draft.qualifier_counting_climbs} onChange={(event) => setDraft({ ...draft, qualifier_counting_climbs: Number(event.target.value) || DEFAULT_QUALIFIER_COUNTING_CLIMBS })} disabled={!canSave || finalsActive} className="input-field" placeholder="Counting climbs" />
                  </label>
                  <label className="text-sm text-slate-300">
                    <span className="meta-label mb-2 block">Finals cutoff</span>
                    <select value={draft.finals_cutoff} onChange={(event) => setDraft({ ...draft, finals_cutoff: Number(event.target.value) === 8 ? 8 : 6 })} disabled={!canSave || !canConfigureFinalsAdvancement || finalsActive} className="input-field">
                      <option value={6}>Top 6 finals</option>
                      <option value={8}>Top 8 finals</option>
                    </select>
                  </label>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={draft.finals_tie_advances} onChange={(event) => setDraft({ ...draft, finals_tie_advances: event.target.checked })} disabled={!canSave || !canConfigureFinalsAdvancement || finalsActive} />
                  Advance ties at the cutoff
                </label>
                <p className="text-sm text-slate-400">
                  This applies to the finals handoff from scramble too, so you can set top 6 or top 8 before advancing the event.
                </p>

                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="meta-label">Finals age groups</div>
                  <p className="mt-3 text-sm text-slate-300">
                    Choose which age groups can reach finals. This applies to Men and Women divisions for the selected age groups.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {CATEGORY_AGE_GROUPS.map((ageGroup) => {
                      const selected = draft.finals_eligible_age_groups.includes(ageGroup);

                      return (
                        <label
                          key={ageGroup}
                          className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors ${
                            selected
                              ? "border-green-500/30 bg-green-500/10 text-green-200"
                              : "border-white/10 bg-white/[0.03] text-slate-300"
                          } ${!canSave || finalsActive ? "opacity-60" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={selected}
                            disabled={!canSave || finalsActive}
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
                  <p className="mt-3 text-sm text-slate-400">
                    Current finals categories:{" "}
                    {draft.finals_eligible_age_groups.map((ageGroup) => `Men / ${ageGroup} and Women / ${ageGroup}`).join(", ")}
                  </p>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="meta-label">Registration categories</div>
                  <p className="mt-3 text-sm text-slate-300">
                    Registration always includes the full category grid by default: Men, Women, and X across Youth D, Youth C, Youth B, Youth A, Junior, Rec, Masters, and Open.
                  </p>
                  <p className="mt-3 text-sm text-slate-400">
                    Finals advancement follows the selected finals age groups for Men and Women. When a scramble is advanced to finals, the app freezes qualifiers and switches into the 2025 IFSC points finals format with four finals boulders.
                  </p>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="meta-label">Schedule blocks</div>
                        <p className="mt-2 text-sm text-slate-300">Use these like a mobile-friendly day-of schedule: check-in, isolation, technical meeting, qualifier window, finals window, and results. The live block controls what athletes can do on the public pages.</p>
                      </div>
                    <button type="button" onClick={() => setDraft({ ...draft, time_slots: [...draft.time_slots, makeSlot()] })} disabled={!canSave} className="btn-ghost">Add slot</button>
                  </div>
                  <div className="mt-4 space-y-4">
                    {draft.time_slots.map((slot) => (
                      <div key={slot.id} className="card-muted space-y-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <input type="text" value={slot.label} onChange={(event) => updateSlot(slot.id, { label: event.target.value })} disabled={!canSave} className="input-field" placeholder="Slot label" />
                          <select value={slot.phase_type} onChange={(event) => updateSlot(slot.id, { phase_type: event.target.value as EventTimeSlot["phase_type"] })} disabled={!canSave} className="input-field">
                            {SCHEDULE_PHASE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input type="text" value={slot.audience_label} onChange={(event) => updateSlot(slot.id, { audience_label: event.target.value })} disabled={!canSave} className="input-field" placeholder="Audience label (optional)" />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <input type="text" value={slot.start_time ?? ""} onChange={(event) => updateSlot(slot.id, { start_time: event.target.value })} disabled={!canSave} className="input-field" placeholder="Start time" />
                          <input type="text" value={slot.end_time ?? ""} onChange={(event) => updateSlot(slot.id, { end_time: event.target.value })} disabled={!canSave} className="input-field" placeholder="End time" />
                          <input type="number" min={1} value={slot.capacity} onChange={(event) => updateSlot(slot.id, { capacity: Number(event.target.value) || 1 })} disabled={!canSave} className="input-field" placeholder="Capacity" />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                          <input type="checkbox" checked={slot.is_active} onChange={(event) => updateSlot(slot.id, { is_active: event.target.checked })} disabled={!canSave} />
                          Mark this as the live schedule block
                        </label>
                        <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                          {SCHEDULE_PHASE_OPTIONS.find((option) => option.value === slot.phase_type)?.description} Use the audience label for groups like Recreational, Men / Women Open, or Youth Competitive.
                        </div>
                        <button type="button" onClick={() => setDraft({ ...draft, time_slots: draft.time_slots.filter((entry) => entry.id !== slot.id) })} disabled={!canSave} className="btn-ghost">Remove slot</button>
                      </div>
                    ))}
                    {!draft.time_slots.length ? <p className="text-sm text-slate-300">No schedule blocks configured yet.</p> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {canAdvanceToFinals ? (
                    <button type="button" onClick={advanceToFinals} disabled={isPending} className="btn-primary judge-action-secondary">
                      {isPending ? "Advancing..." : "Advance to finals"}
                    </button>
                  ) : null}
                  <button type="button" onClick={save} disabled={!canSave || isPending} className="btn-primary">
                    {isPending ? "Saving..." : "Save active event"}
                  </button>
                  <button type="button" onClick={resetEvent} disabled={!canSave || isPending} className="btn-ghost">
                    {isPending ? "Working..." : "Reset event"}
                  </button>
                  <button type="button" onClick={() => setDraft(snapshot ? cloneEvent(snapshot.event) : null)} className="btn-ghost">
                    Reset draft
                  </button>
                </div>
                <div className="text-sm text-slate-400">
                  `Advance to finals` freezes qualifiers and starts finals. `Save active event` keeps your setup changes. `Reset event` wipes the live event back to the default scramble setup. `Reset draft` only discards unsaved edits on this page.
                </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-300">Loading event setup...</p>
              )}
            </section>
          ) : (
            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="eyebrow">Staff access</div>
                  <h2 className="section-title mt-4 text-3xl">Judge or admin sign-in</h2>
                  <p className="mt-3 text-sm text-slate-300">
                    Staff-only event controls are hidden until you sign in with a judge or admin account.
                  </p>
                </div>
              </div>

              <form onSubmit={signIn} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@gym.com" className="input-field" />
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="input-field" />
                <button type="submit" disabled={authLoading} className="btn-primary">
                  {authLoading ? "Signing in..." : "Sign in"}
                </button>
              </form>

              {authError ? <div className="mt-4 rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{authError}</div> : null}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
