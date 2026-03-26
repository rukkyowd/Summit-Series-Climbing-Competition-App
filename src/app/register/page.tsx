"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerClimber } from "@/lib/db";
import SiteHeader from "@/components/site-header";

const NOTES = [
  "Bib number must be unique for the competition.",
  "Athletes jump straight into their scorecard after check-in.",
  "Judges can unlock route controls later from the scorecard view.",
];

const DESK_METRICS = [
  { label: "Flow", value: "Fast", detail: "Keep intake short and accurate." },
  { label: "Duplicate guard", value: "On", detail: "Bib numbers are validated before save." },
  { label: "Handoff", value: "Direct", detail: "Open the athlete scorecard immediately after check-in." },
];

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [climberNumber, setClimberNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) return setError("Please enter the athlete name.");
    if (!climberNumber.trim()) return setError("Please enter the climber number.");
    if (!/^\d+$/.test(climberNumber.trim())) {
      return setError("Climber number must contain digits only.");
    }

    setLoading(true);

    try {
      const climber = await registerClimber(name, climberNumber);
      setSuccess(true);
      setTimeout(() => {
        router.push(`/scorecard?id=${climber.id}`);
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="content-frame space-y-6">
        <SiteHeader
          status={
            <>
              <span className="status-pill border-blue-500/20 bg-blue-500/10 text-blue-200">
                Front desk flow
              </span>
              <Link href="/scorecard" className="nav-pill">
                Find athlete
              </Link>
            </>
          }
        />

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4">
            <div className="card relative overflow-hidden">
              <div className="absolute -right-12 top-0 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl" />
              <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-white/30 to-transparent" />

              <div className="relative space-y-5">
                <span className="eyebrow">Athlete intake</span>
                <div>
                  <p className="meta-label">Front desk workflow</p>
                  <h1 className="section-title mt-4 text-5xl sm:text-6xl">
                    Check competitors in without slowing the room down.
                  </h1>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                    Keep registration light, validate the bib number, and route each athlete straight
                    into the live scoring flow they will use for the rest of the event.
                  </p>
                </div>

                <div className="grid gap-3">
                  {NOTES.map((note, index) => (
                    <div key={note} className="card-muted flex gap-3">
                      <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-mono text-slate-200">
                        0{index + 1}
                      </span>
                      <p className="text-sm leading-7 text-slate-300">{note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {DESK_METRICS.map((metric) => (
                <div key={metric.label} className="hero-stat">
                  <div className="meta-label">{metric.label}</div>
                  <div className="mt-3 font-display text-4xl text-chalk">{metric.value}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{metric.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card relative overflow-hidden">
            <div className="absolute right-10 top-10 h-32 w-32 rounded-full bg-accent/10 blur-3xl" />

            <div className="relative">
              <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="eyebrow">New competitor</span>
                  <h2 className="section-title mt-4 text-4xl sm:text-5xl">Competition intake</h2>
                </div>
                <div className="status-pill border-accent/20 bg-accent/10 text-red-100">Live form</div>
              </div>

              {success ? (
                <div className="rounded-[1.8rem] border border-green-500/20 bg-green-500/10 px-6 py-12 text-center">
                  <div className="meta-label text-green-200">Athlete ready</div>
                  <div className="mt-4 font-display text-6xl text-green-200">Registered</div>
                  <p className="mt-3 text-sm text-green-50/80">
                    Redirecting to the competitor scorecard now.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="meta-label mb-2 block">Athlete name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Honnold"
                      className="input-field text-lg"
                      autoFocus
                      disabled={loading}
                      maxLength={80}
                    />
                  </div>

                  <div>
                    <label className="meta-label mb-2 block">Climber number</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={climberNumber}
                      onChange={(e) => setClimberNumber(e.target.value)}
                      placeholder="42"
                      className="input-field text-lg"
                      disabled={loading}
                      maxLength={6}
                    />
                    <p className="mt-2 text-sm text-slate-300">Match the bib or registration roster.</p>
                  </div>

                  {error && (
                    <div className="rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
                      {error}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <button type="submit" disabled={loading} className="btn-primary w-full">
                      {loading ? "Registering..." : "Register and open scorecard"}
                    </button>
                    <Link href="/scorecard" className="btn-ghost w-full justify-center sm:w-auto">
                      Find athlete
                    </Link>
                  </div>
                </form>
              )}

              <div className="mt-6 rounded-[1.6rem] border border-white/10 bg-black/20 p-5">
                <div className="meta-label">Returning athlete</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Already checked in? Open the scorecard lookup and search by climber number instead
                  of creating a duplicate record.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
