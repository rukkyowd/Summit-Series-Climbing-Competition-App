"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { getAuthState, isStaffRole, signInWithRole, signOutUser, type Profile } from "@/lib/auth";
import { getCompetitionSnapshot, registerClimber, type CompetitionSnapshot } from "@/lib/db";

export default function RegisterPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
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

    getAuthState()
      .then((state) => setProfile(state.profile))
      .catch((nextError) => {
        setAuthError(nextError instanceof Error ? nextError.message : "Unable to read the staff session.");
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const canRegister = isStaffRole(profile?.role);
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

  const handleAuthSubmit = async (event: React.FormEvent) => {
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccessLink("");

    if (!canRegister) {
      setError("Judge or admin login is required to register climbers.");
      return;
    }

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
            canRegister ? (
              <button onClick={() => void signOutUser().then(() => setProfile(null))} className="status-pill border-green-500/20 bg-green-500/10 text-green-200">
                {profile?.role} signed in
              </button>
            ) : (
              <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">Staff sign-in required</div>
            )
          }
        />

        {!canRegister ? (
          <section className="card">
            <div>
              <div className="eyebrow">Front desk access</div>
              <h1 className="section-title mt-4 text-4xl sm:text-5xl">Sign in to register climbers</h1>
            </div>
            <form onSubmit={handleAuthSubmit} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="judge@gym.com" className="input-field" />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="input-field" />
              <button type="submit" disabled={authLoading} className="btn-primary">
                {authLoading ? "Signing in..." : "Sign in"}
              </button>
            </form>
            {authError ? <div className="mt-4 rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{authError}</div> : null}
          </section>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Registration</div>
                <h1 className="section-title mt-4 text-4xl sm:text-5xl">Create a climber entry</h1>
              </div>
              <div className="status-pill border-accent/20 bg-accent/10 text-red-100">
                {canRegister ? "Authorized" : "Locked"}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <input type="text" value={name} onChange={(event) => setName(event.target.value)} className="input-field" placeholder="Climber name" disabled={!canRegister || loading} />
                <input type="text" value={climberNumber} onChange={(event) => setClimberNumber(event.target.value)} className="input-field" placeholder="Climber number" disabled={!canRegister || loading} />
              </div>
              <input type="text" value={province} onChange={(event) => setProvince(event.target.value)} className="input-field" placeholder="Province" disabled={!canRegister || loading} />

              <div className="grid gap-4 md:grid-cols-2">
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="input-field" disabled={!canRegister || loading}>
                  <option value="">Select category</option>
                  {snapshot?.event.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.display_name}
                    </option>
                  ))}
                </select>
                <select value={timeSlotId} onChange={(event) => setTimeSlotId(event.target.value)} className="input-field" disabled={!canRegister || loading || !availableSlots.length}>
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
                <button type="submit" disabled={!canRegister || loading} className="btn-primary w-full">
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
