"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { getCompetitionSnapshot, registerClimber, type CompetitionSnapshot } from "@/lib/db";
import { saveScorecardAccessToken } from "@/lib/scorecard-access";
import {
  canRegisterDuringEvent,
  formatSchedulePhaseLabel,
  formatTimeRange,
  getActiveScheduleBlock,
  getEventWorkflowGuide,
  getFormatTemplate,
} from "@/lib/scoring";

export default function RegisterPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successLink, setSuccessLink] = useState("");
  const [name, setName] = useState("");
  const [climberNumber, setClimberNumber] = useState("");
  const [province, setProvince] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [timeSlotId, setTimeSlotId] = useState("");

  useEffect(() => {
    getCompetitionSnapshot()
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setCategoryId(nextSnapshot.event.categories[0]?.id ?? "");
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Unable to load registration options.");
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedChoice = useMemo(
    () => snapshot?.registrationChoices.find((choice) => choice.category.id === categoryId) ?? null,
    [categoryId, snapshot]
  );
  const availableSlots = useMemo(() => selectedChoice?.slots ?? [], [selectedChoice]);
  const workflowGuide = useMemo(
    () => (snapshot ? getEventWorkflowGuide(snapshot.event) : null),
    [snapshot]
  );
  const activeScheduleBlock = useMemo(
    () => (snapshot ? getActiveScheduleBlock(snapshot.event) : null),
    [snapshot]
  );
  const registrationOpen = snapshot ? canRegisterDuringEvent(snapshot.event) : false;

  useEffect(() => {
    if (!availableSlots.length) {
      setTimeSlotId("");
      return;
    }

    if (!availableSlots.some((slot) => slot.id === timeSlotId && slot.remaining_capacity > 0)) {
      const nextSlot = availableSlots.find((slot) => slot.remaining_capacity > 0);
      setTimeSlotId(nextSlot?.id ?? "");
    }
  }, [availableSlots, timeSlotId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccessLink("");

    if (!name.trim() || !climberNumber.trim() || !province.trim() || !categoryId) {
      setError("Name, climber number, province, and category are required.");
      return;
    }

    if (!/^[\dA-Za-z-]+$/.test(climberNumber.trim())) {
      setError("Climber number must use letters, numbers, or dashes only.");
      return;
    }

    setLoading(true);

    try {
      const climber = await registerClimber({
        name,
        climberNumber,
        province,
        categoryId,
        timeSlotId: timeSlotId || null,
      });
      const link = `/scorecard?token=${climber.access_token}`;
      saveScorecardAccessToken(climber.access_token);
      setSuccessLink(link);
      setName("");
      setClimberNumber("");
      setProvince("");
      setTimeSlotId("");
      const refreshed = await getCompetitionSnapshot();
      setSnapshot(refreshed);
      setCategoryId(refreshed.event.categories[0]?.id ?? categoryId);
      window.setTimeout(() => {
        router.push(link);
      }, 1200);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="content-frame space-y-6">
        <SiteHeader
          status={
            <div
              className={`status-pill ${
                registrationOpen
                  ? "border-green-500/20 bg-green-500/10 text-green-200"
                  : "border-yellow-400/20 bg-yellow-400/10 text-yellow-100"
              }`}
            >
              {registrationOpen ? "Registration open" : "Registration paused"}
            </div>
          }
        />

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Registration</div>
                <h1 className="section-title mt-4 text-4xl sm:text-5xl">
                  {snapshot?.event.stage_mode === "finals" ? "Registration closed" : registrationOpen ? "Register yourself" : "Check the live schedule"}
                </h1>
              </div>
              <div
                className={`status-pill ${
                  snapshot?.event.stage_mode === "finals" || !registrationOpen
                    ? "border-yellow-400/20 bg-yellow-400/10 text-yellow-100"
                    : "border-green-500/20 bg-green-500/10 text-green-200"
                }`}
              >
                {snapshot?.event.stage_mode === "finals"
                  ? "Finals active"
                  : registrationOpen
                  ? "No staff login needed"
                  : "Wait for check-in block"}
              </div>
            </div>

            {snapshot?.event.stage_mode === "finals" ? (
              <div className="mt-6 rounded-[1.3rem] border border-yellow-400/20 bg-yellow-400/10 px-4 py-4 text-sm text-yellow-100">
                This event has already advanced to finals, so new climber registration is closed and qualifier scorecards are now read-only.
              </div>
            ) : !registrationOpen ? (
              <div className="mt-6 rounded-[1.3rem] border border-yellow-400/20 bg-yellow-400/10 px-4 py-4 text-sm text-yellow-100">
                Registration is paused for the current live block. Staff can reopen it by marking a check-in, technical meeting, qualifier round, or custom block as live.
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {workflowGuide ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="meta-label">How this page works today</div>
                  <div className="mt-2 text-xl font-semibold text-chalk">{workflowGuide.headline}</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{workflowGuide.summary}</p>
                  <p className="mt-3 text-sm text-slate-400">
                    {snapshot ? getFormatTemplate(snapshot.event.format).scheduling_hint : ""}
                  </p>
                </div>
              ) : null}

              {activeScheduleBlock ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="meta-label">Live schedule block</div>
                  <div className="mt-2 text-xl font-semibold text-chalk">{activeScheduleBlock.label}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
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
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <input type="text" value={name} onChange={(event) => setName(event.target.value)} className="input-field" placeholder="Climber name" disabled={loading || snapshot?.event.stage_mode === "finals" || !registrationOpen} />
                <input type="text" value={climberNumber} onChange={(event) => setClimberNumber(event.target.value)} className="input-field" placeholder="Climber number" disabled={loading || snapshot?.event.stage_mode === "finals" || !registrationOpen} />
              </div>
              <input type="text" value={province} onChange={(event) => setProvince(event.target.value)} className="input-field" placeholder="Province" disabled={loading || snapshot?.event.stage_mode === "finals" || !registrationOpen} />

              <div className="grid gap-4 md:grid-cols-2">
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="input-field" disabled={loading || snapshot?.event.stage_mode === "finals" || !registrationOpen}>
                  <option value="">Select category</option>
                  {snapshot?.event.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.display_name}
                    </option>
                  ))}
                </select>
                <select value={timeSlotId} onChange={(event) => setTimeSlotId(event.target.value)} className="input-field" disabled={loading || !availableSlots.length || snapshot?.event.stage_mode === "finals" || !registrationOpen}>
                  <option value="">{availableSlots.length ? "Select time slot" : "No slots required"}</option>
                  {availableSlots.map((slot) => (
                    <option key={slot.id} value={slot.id} disabled={slot.remaining_capacity <= 0}>
                      {slot.label} ({slot.remaining_capacity} left)
                    </option>
                  ))}
                </select>
              </div>

              {error ? <div className="rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{error}</div> : null}
              {successLink ? <div className="rounded-[1.3rem] border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-200">Private qualifier link created and saved on this device: {successLink}</div> : null}

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <button type="submit" disabled={loading || snapshot?.event.stage_mode === "finals" || !registrationOpen} className="btn-primary w-full">
                  {snapshot?.event.stage_mode === "finals"
                    ? "Registration closed"
                    : !registrationOpen
                    ? "Registration paused"
                    : loading
                    ? "Registering..."
                    : "Register climber"}
                </button>
                <Link href="/scorecard" className="btn-ghost w-full justify-center sm:w-auto">
                  Open scorecards
                </Link>
              </div>
            </form>
          </section>

          <section className="card">
            <div>
              <div className="eyebrow">Current options</div>
              <h2 className="section-title mt-4 text-3xl">Category and schedule availability</h2>
            </div>

            {loading ? (
              <p className="mt-4 text-sm text-slate-300">Loading registration setup...</p>
            ) : snapshot ? (
              <div className="mt-5 space-y-4">
                {workflowGuide ? (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                    <div className="meta-label">Day-of reminders</div>
                    <div className="mt-3 space-y-2">
                      {workflowGuide.notes.map((note) => (
                        <p key={note} className="text-sm text-slate-300">
                          {note}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="meta-label">Schedule blocks</div>
                  <div className="mt-4 space-y-3">
                    {snapshot.event.time_slots.length ? (
                      snapshot.event.time_slots.map((slot) => (
                        <div key={slot.id} className="card-muted">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-lg font-semibold text-chalk">{slot.label}</div>
                              <div className="mt-1 text-sm text-slate-300">
                                {formatTimeRange(slot.start_time, slot.end_time)}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {slot.is_active ? (
                                <div className="status-pill border-green-500/20 bg-green-500/10 text-green-200">
                                  Live now
                                </div>
                              ) : null}
                              <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                                {formatSchedulePhaseLabel(slot.phase_type)}
                              </div>
                            </div>
                          </div>
                          {slot.audience_label ? (
                            <div className="mt-2 text-sm text-slate-300">{slot.audience_label}</div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-300">
                        No schedule blocks have been posted yet. Staff can add check-in, isolation, round, and results windows from the home page.
                      </p>
                    )}
                  </div>
                </div>

                {snapshot.registrationChoices.map((choice) => (
                  <div key={choice.category.id} className="card-muted">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-lg font-semibold text-chalk">{choice.category.display_name}</div>
                        <div className="mt-1 text-sm text-slate-300">
                          {choice.category.gender_division} | {choice.category.age_group}
                        </div>
                      </div>
                      <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                        {choice.slots.length} registration block{choice.slots.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {choice.slots.length ? (
                        choice.slots.map((slot) => (
                          <div key={slot.id} className="flex items-center justify-between gap-3 text-sm text-slate-300">
                            <span>{slot.label}</span>
                            <span>{slot.remaining_capacity} left</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-slate-300">No slot restrictions for this category.</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-300">No registration options available yet.</p>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
