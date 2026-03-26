"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerClimber } from "@/lib/db";

const NOTES = [
  "Bib number must be unique for the competition.",
  "Athletes jump straight into their scorecard after check-in.",
  "Judges can unlock route controls later from the scorecard view.",
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
    if (!/^\d+$/.test(climberNumber.trim())) return setError("Climber number must contain digits only.");

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
      <div className="content-frame">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="btn-ghost px-4 py-2 text-xs">
            Back home
          </Link>
          <span className="eyebrow">Athlete check-in</span>
        </div>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="card flex flex-col justify-between gap-8">
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-sm font-mono uppercase tracking-[0.35em] text-slate-500">
                  Front desk workflow
                </p>
                <h1 className="section-title text-5xl sm:text-6xl">Register athletes without slowing the room down.</h1>
                <p className="max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                  Keep intake light, validate the bib number, and route each athlete directly into the
                  scoring experience they will use for the rest of the event.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="stat-card">
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    Step 1
                  </div>
                  <div className="mt-2 font-display text-3xl text-chalk">Name</div>
                  <p className="mt-2 text-sm text-slate-400">Capture the athlete record.</p>
                </div>
                <div className="stat-card">
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    Step 2
                  </div>
                  <div className="mt-2 font-display text-3xl text-chalk">Bib</div>
                  <p className="mt-2 text-sm text-slate-400">Link their competition number.</p>
                </div>
                <div className="stat-card">
                  <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    Step 3
                  </div>
                  <div className="mt-2 font-display text-3xl text-chalk">Start</div>
                  <p className="mt-2 text-sm text-slate-400">Open the live scorecard instantly.</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                Desk notes
              </div>
              <div className="mt-4 space-y-3">
                {NOTES.map((note, index) => (
                  <div key={note} className="flex gap-3 text-sm leading-7 text-slate-300">
                    <span className="mt-1 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-mono text-slate-400">
                      0{index + 1}
                    </span>
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <span className="eyebrow">New competitor</span>
                <h2 className="section-title mt-4 text-4xl">Competition intake</h2>
              </div>
              <div className="rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-xs font-mono uppercase tracking-widest text-accent">
                Live form
              </div>
            </div>

            {success ? (
              <div className="rounded-3xl border border-green-500/20 bg-green-500/10 px-6 py-12 text-center">
                <div className="text-xs font-mono uppercase tracking-widest text-green-300">
                  Athlete ready
                </div>
                <div className="mt-4 font-display text-5xl text-green-300">Registered</div>
                <p className="mt-3 text-sm text-green-100/80">
                  Redirecting to the competitor scorecard now.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-slate-400">
                    Athlete name
                  </label>
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
                  <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-slate-400">
                    Climber number
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={climberNumber}
                    onChange={(e) => setClimberNumber(e.target.value)}
                    placeholder="42"
                    className="input-field font-mono text-lg"
                    disabled={loading}
                    maxLength={6}
                  />
                  <p className="mt-2 text-xs font-mono uppercase tracking-widest text-slate-500">
                    Match the bib or registration roster.
                  </p>
                </div>

                {error && (
                  <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
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

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs font-mono uppercase tracking-widest text-slate-500">
                Returning athlete
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Already checked in? Open the scorecard lookup and search by climber number.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
