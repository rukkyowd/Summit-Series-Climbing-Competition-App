"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { getCompetitionSnapshot, registerClimber, type CompetitionSnapshot } from "@/lib/db";
import { saveScorecardAccessToken } from "@/lib/scorecard-access";

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
          status={<div className="status-pill border-green-500/20 bg-green-500/10 text-green-200">Public self-registration open</div>}
        />

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Registration</div>
                <h1 className="section-title mt-4 text-4xl sm:text-5xl">Register yourself</h1>
              </div>
              <div className="status-pill border-green-500/20 bg-green-500/10 text-green-200">
                No staff login needed
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <input type="text" value={name} onChange={(event) => setName(event.target.value)} className="input-field" placeholder="Climber name" disabled={loading} />
                <input type="text" value={climberNumber} onChange={(event) => setClimberNumber(event.target.value)} className="input-field" placeholder="Climber number" disabled={loading} />
              </div>
              <input type="text" value={province} onChange={(event) => setProvince(event.target.value)} className="input-field" placeholder="Province" disabled={loading} />

              <div className="grid gap-4 md:grid-cols-2">
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="input-field" disabled={loading}>
                  <option value="">Select category</option>
                  {snapshot?.event.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.display_name}
                    </option>
                  ))}
                </select>
                <select value={timeSlotId} onChange={(event) => setTimeSlotId(event.target.value)} className="input-field" disabled={loading || !availableSlots.length}>
                  <option value="">{availableSlots.length ? "Select time slot" : "No slots required"}</option>
                  {availableSlots.map((slot) => (
                    <option key={slot.id} value={slot.id} disabled={slot.remaining_capacity <= 0}>
                      {slot.label} ({slot.remaining_capacity} left)
                    </option>
                  ))}
                </select>
              </div>

              {error ? <div className="rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{error}</div> : null}
              {successLink ? <div className="rounded-[1.3rem] border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-200">Private qualifier link created: {successLink}</div> : null}

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? "Registering..." : "Register climber"}
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
              <h2 className="section-title mt-4 text-3xl">Category and slot availability</h2>
            </div>

            {loading ? (
              <p className="mt-4 text-sm text-slate-300">Loading registration setup...</p>
            ) : snapshot ? (
              <div className="mt-5 space-y-4">
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
                        {choice.slots.length} slot{choice.slots.length === 1 ? "" : "s"}
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
