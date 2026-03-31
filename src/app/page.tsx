"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { getAuthState, signInWithRole, signOutUser, type Profile } from "@/lib/auth";
import { getCompetitionSnapshot, saveEventConfig, type CompetitionSnapshot } from "@/lib/db";
import {
  CATEGORY_AGE_GROUPS,
  CATEGORY_DIVISIONS,
  DEFAULT_FINALS_CUTOFF,
  DEFAULT_MAX_CLIMBERS,
  DEFAULT_QUALIFIER_COUNTING_CLIMBS,
  DEFAULT_TOTAL_CLIMBS,
  FORMAT_TEMPLATES,
  buildDisplayCategory,
  formatSupportsFinals,
  formatTimeRange,
  type EventCategory,
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
      eligible_category_ids: [...slot.eligible_category_ids],
    })),
  };
}

function makeCategory(index: number): EventCategory {
  const division = CATEGORY_DIVISIONS[index % CATEGORY_DIVISIONS.length];
  return {
    id: makeId(),
    event_id: 1,
    gender_division: division,
    age_group: "Open",
    display_name: buildDisplayCategory(division, "Open"),
    sort_order: index,
  };
}

function makeSlot(): EventTimeSlot {
  return {
    id: makeId(),
    event_id: 1,
    label: "Session",
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
  const supportsFinals = draft ? formatSupportsFinals(draft.format) : false;
  const leader = snapshot?.qualifierLeaderboard[0] ?? null;
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
            finals_cutoff: supportsFinals ? draft.finals_cutoff : DEFAULT_FINALS_CUTOFF,
            finals_tie_advances: supportsFinals ? draft.finals_tie_advances : true,
            categories: draft.categories,
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

  const updateCategory = (categoryId: string, patch: Partial<EventCategory>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            categories: current.categories.map((category) =>
              category.id === categoryId
                ? {
                    ...category,
                    ...patch,
                    display_name: buildDisplayCategory(
                      patch.gender_division ?? category.gender_division,
                      patch.age_group ?? category.age_group
                    ),
                  }
                : category
            ),
          }
        : current
    );
  };

  const updateSlot = (slotId: string, patch: Partial<EventTimeSlot>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            time_slots: current.time_slots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)),
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

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="eyebrow">Staff access</div>
                  <h2 className="section-title mt-4 text-3xl">
                    {profile ? `Signed in as ${profile.role}` : "Sign in to edit the event"}
                  </h2>
                </div>
                {profile ? (
                  <button onClick={() => void signOutUser().then(() => setProfile(null))} className="btn-ghost">
                    Sign out
                  </button>
                ) : null}
              </div>

              {!profile ? (
                <form onSubmit={signIn} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@gym.com" className="input-field" />
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="input-field" />
                  <button type="submit" disabled={authLoading} className="btn-primary">
                    {authLoading ? "Signing in..." : "Sign in"}
                  </button>
                </form>
              ) : (
                <p className="mt-3 text-sm text-slate-300">
                  {canSave ? "Admin controls are unlocked." : "Judges can review the setup, but only admins can save changes."}
                </p>
              )}

              {authError ? <div className="mt-4 rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{authError}</div> : null}
            </section>

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
                    <p className="mt-3 text-sm text-slate-300">
                      {FORMAT_TEMPLATES.find((item) => item.value === snapshot.event.format)?.description}
                    </p>
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
                    <div className="meta-label">Slots</div>
                    <div className="mt-4 space-y-3">
                      {snapshot.event.time_slots.map((slot) => (
                        <div key={slot.id} className="card-muted">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-lg font-semibold text-chalk">{slot.label}</div>
                              <div className="mt-1 text-sm text-slate-300">{formatTimeRange(slot.start_time, slot.end_time)}</div>
                            </div>
                            <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">Cap {slot.capacity}</div>
                          </div>
                        </div>
                      ))}
                      {!snapshot.event.time_slots.length ? <p className="text-sm text-slate-300">No slots configured yet.</p> : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

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
                <div className="grid gap-4 md:grid-cols-2">
                  <input type="text" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={!canSave} className="input-field" placeholder="Event name" />
                  <select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as EventConfig["format"] })} disabled={!canSave} className="input-field">
                    {FORMAT_TEMPLATES.map((template) => <option key={template.value} value={template.value}>{template.label}</option>)}
                  </select>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <input type="number" min={1} value={draft.total_climbs} onChange={(event) => setDraft({ ...draft, total_climbs: Number(event.target.value) || DEFAULT_TOTAL_CLIMBS })} disabled={!canSave} className="input-field" placeholder="Total climbs" />
                  <input type="number" min={1} value={draft.max_climbers} onChange={(event) => setDraft({ ...draft, max_climbers: Number(event.target.value) || DEFAULT_MAX_CLIMBERS })} disabled={!canSave} className="input-field" placeholder="Climber cap" />
                  <input type="number" min={1} value={draft.qualifier_counting_climbs} onChange={(event) => setDraft({ ...draft, qualifier_counting_climbs: Number(event.target.value) || DEFAULT_QUALIFIER_COUNTING_CLIMBS })} disabled={!canSave} className="input-field" placeholder="Counting climbs" />
                  <select value={draft.finals_cutoff} onChange={(event) => setDraft({ ...draft, finals_cutoff: Number(event.target.value) === 8 ? 8 : 6 })} disabled={!canSave || !supportsFinals} className="input-field">
                    <option value={6}>Top 6 finals</option>
                    <option value={8}>Top 8 finals</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={draft.finals_tie_advances} onChange={(event) => setDraft({ ...draft, finals_tie_advances: event.target.checked })} disabled={!canSave || !supportsFinals} />
                  Advance ties at the cutoff
                </label>

                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="meta-label">Categories</div>
                      <p className="mt-2 text-sm text-slate-300">Each row becomes one selectable registration category.</p>
                    </div>
                    <button type="button" onClick={() => setDraft({ ...draft, categories: [...draft.categories, makeCategory(draft.categories.length)] })} disabled={!canSave} className="btn-ghost">Add category</button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {draft.categories.map((category, index) => (
                      <div key={category.id} className="card-muted space-y-3">
                        <div className="grid gap-3 md:grid-cols-3">
                          <select
                            value={category.gender_division}
                            onChange={(event) => updateCategory(category.id, { gender_division: event.target.value })}
                            disabled={!canSave}
                            className="input-field"
                          >
                            {Array.from(new Set([...CATEGORY_DIVISIONS, category.gender_division])).map((division) => (
                              <option key={division} value={division}>
                                {division}
                              </option>
                            ))}
                          </select>
                          <select
                            value={category.age_group}
                            onChange={(event) => updateCategory(category.id, { age_group: event.target.value })}
                            disabled={!canSave}
                            className="input-field"
                          >
                            {Array.from(new Set([...CATEGORY_AGE_GROUPS, category.age_group])).map((ageGroup) => (
                              <option key={ageGroup} value={ageGroup}>
                                {ageGroup}
                              </option>
                            ))}
                          </select>
                          <div className="input-field flex items-center text-slate-200">
                            {buildDisplayCategory(category.gender_division, category.age_group)}
                          </div>
                        </div>
                        <button type="button" onClick={() => setDraft({ ...draft, categories: draft.categories.filter((entry) => entry.id !== category.id).map((entry, nextIndex) => ({ ...entry, sort_order: nextIndex })) })} disabled={!canSave || draft.categories.length <= 1} className="btn-ghost">
                          Remove category {index + 1}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="meta-label">Time slots</div>
                      <p className="mt-2 text-sm text-slate-300">Restrict slots to selected categories or leave them open to everyone.</p>
                    </div>
                    <button type="button" onClick={() => setDraft({ ...draft, time_slots: [...draft.time_slots, makeSlot()] })} disabled={!canSave} className="btn-ghost">Add slot</button>
                  </div>
                  <div className="mt-4 space-y-4">
                    {draft.time_slots.map((slot) => (
                      <div key={slot.id} className="card-muted space-y-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <input type="text" value={slot.label} onChange={(event) => updateSlot(slot.id, { label: event.target.value })} disabled={!canSave} className="input-field" placeholder="Slot label" />
                          <input type="text" value={slot.start_time ?? ""} onChange={(event) => updateSlot(slot.id, { start_time: event.target.value })} disabled={!canSave} className="input-field" placeholder="Start time" />
                          <input type="text" value={slot.end_time ?? ""} onChange={(event) => updateSlot(slot.id, { end_time: event.target.value })} disabled={!canSave} className="input-field" placeholder="End time" />
                          <input type="number" min={1} value={slot.capacity} onChange={(event) => updateSlot(slot.id, { capacity: Number(event.target.value) || 1 })} disabled={!canSave} className="input-field" placeholder="Capacity" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {draft.categories.map((category) => {
                            const checked = slot.eligible_category_ids.includes(category.id);
                            return (
                              <label key={category.id} className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.22em] ${checked ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200" : "border-white/10 bg-white/[0.03] text-slate-300"}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => updateSlot(slot.id, { eligible_category_ids: event.target.checked ? [...slot.eligible_category_ids, category.id] : slot.eligible_category_ids.filter((id) => id !== category.id) })}
                                  disabled={!canSave}
                                  className="sr-only"
                                />
                                {category.display_name}
                              </label>
                            );
                          })}
                          <button type="button" onClick={() => updateSlot(slot.id, { eligible_category_ids: [] })} disabled={!canSave} className="btn-ghost">Open to all</button>
                        </div>
                        <button type="button" onClick={() => setDraft({ ...draft, time_slots: draft.time_slots.filter((entry) => entry.id !== slot.id) })} disabled={!canSave} className="btn-ghost">Remove slot</button>
                      </div>
                    ))}
                    {!draft.time_slots.length ? <p className="text-sm text-slate-300">No slots configured yet.</p> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={save} disabled={!canSave || isPending} className="btn-primary">
                    {isPending ? "Saving..." : "Save active event"}
                  </button>
                  <button type="button" onClick={() => setDraft(snapshot ? cloneEvent(snapshot.event) : null)} className="btn-ghost">
                    Reset draft
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-300">Loading event setup...</p>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
