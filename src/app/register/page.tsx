"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerClimber } from "@/lib/db";
import SiteHeader from "@/components/site-header";

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
        <SiteHeader />

        <section className="mx-auto w-full max-w-3xl">
          <div className="card relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
            <div className="absolute right-10 top-10 h-32 w-32 rounded-full bg-accent/10 blur-3xl" />

            <div className="relative">
              <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="eyebrow">New Competitor</span>
                  <h1 className="section-title mt-4 text-4xl text-center sm:text-5xl sm:text-left">
                    Competition Intake
                  </h1>
                </div>
                <div className="status-pill border-accent/20 bg-accent/10 text-red-100">Live Form</div>
              </div>

              {success ? (
                <div className="rounded-[1.8rem] border border-green-500/20 bg-green-500/10 px-6 py-12 text-center">
                  <div className="meta-label text-green-200">Athlete Ready</div>
                  <div className="mt-4 font-display text-6xl text-green-200">Registered</div>
                  <p className="mt-3 text-sm text-green-50/80">
                    Redirecting to the competitor scorecard now.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="meta-label mb-2 block">Athlete Name</label>
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
                    <label className="meta-label mb-2 block">Climber Number</label>
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
                      {loading ? "Registering..." : "Register and Open Scorecard"}
                    </button>
                    <Link href="/scorecard" className="btn-ghost w-full justify-center sm:w-auto">
                      Find Athlete
                    </Link>
                  </div>
                </form>
              )}

              <div className="mt-6 rounded-[1.6rem] border border-white/10 bg-black/20 p-5 text-center">
                <div className="meta-label">Returning Athlete</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Already checked in? Open the scorecard page and search by climber number.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
