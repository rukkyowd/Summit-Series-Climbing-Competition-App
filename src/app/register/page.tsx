"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { getAuthState, isStaffRole, signInWithRole, signOutUser, type Profile } from "@/lib/auth";
import { registerClimber } from "@/lib/db";

const DEFAULT_CATEGORY = "Open";

export default function RegisterPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [climberNumber, setClimberNumber] = useState("");
  const [category] = useState(DEFAULT_CATEGORY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getAuthState()
      .then((state) => setProfile(state.profile))
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);

  const canRegister = isStaffRole(profile?.role);

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const state = await signInWithRole(email, password);
      setProfile(state.profile);
      setPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!canRegister) return setError("Judge or admin login is required to register athletes.");
    if (!name.trim()) return setError("Please enter the athlete name.");
    if (!climberNumber.trim()) return setError("Please enter the climber number.");
    if (!/^[\\dA-Za-z-]+$/.test(climberNumber.trim())) {
      return setError("Climber number must use letters, digits, or dashes only.");
    }
    setLoading(true);

    try {
      const climber = await registerClimber(name, climberNumber, category);
      setSuccess(true);
      window.setTimeout(() => {
        router.push(`/scorecard?id=${climber.id}`);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
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
              <button
                onClick={async () => {
                  await signOutUser();
                  setProfile(null);
                }}
                className="status-pill border-green-500/20 bg-green-500/10 text-green-200"
              >
                {profile?.role} signed in
              </button>
            ) : (
              <div className="status-pill border-white/10 bg-white/[0.03] text-slate-300">
                Judge sign-in required
              </div>
            )
          }
        />

        {!canRegister ? (
          <section className="mx-auto w-full max-w-3xl">
            <form onSubmit={handleAuthSubmit} className="card space-y-5">
              <div>
                <span className="eyebrow">Judge Access</span>
                <h1 className="section-title mt-4 text-4xl sm:text-5xl">Sign in to register athletes</h1>
                <p className="mt-4 text-sm text-slate-300">
                  Public users can view the app, but RLS only allows judge/admin accounts to create climbers.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="judge@summitseries.com"
                  className="input-field"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  className="input-field"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={authLoading} className="btn-primary">
                  {authLoading ? "Checking session..." : "Sign in"}
                </button>
                <Link href="/scorecard" className="btn-ghost">
                  Back to scorecards
                </Link>
              </div>

              {authError ? (
                <div className="rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
                  {authError}
                </div>
              ) : null}
            </form>
          </section>
        ) : null}

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
                <div className="status-pill border-accent/20 bg-accent/10 text-red-100">
                  {canRegister ? "Authorized" : "Locked"}
                </div>
              </div>

              {success ? (
                <div className="rounded-[1.8rem] border border-green-500/20 bg-green-500/10 px-6 py-12 text-center">
                  <div className="meta-label text-green-200">Athlete Ready</div>
                  <div className="mt-4 font-display text-6xl text-green-200">Registered</div>
                  <p className="mt-3 text-sm text-green-50/80">Redirecting to the competitor scorecard now.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="meta-label mb-2 block">Athlete Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Alex Honnold"
                      className="input-field text-lg"
                      autoFocus={canRegister}
                      disabled={loading || !canRegister}
                      maxLength={80}
                    />
                  </div>

                  <div>
                    <label className="meta-label mb-2 block">Climber Number</label>
                    <input
                      type="text"
                      value={climberNumber}
                      onChange={(event) => setClimberNumber(event.target.value)}
                      placeholder="42"
                      className="input-field text-lg"
                      disabled={loading || !canRegister}
                      maxLength={12}
                    />
                  </div>

                  <div className="rounded-[1.3rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                    Category defaults to <span className="text-chalk">{DEFAULT_CATEGORY}</span>.
                  </div>

                  {error ? (
                    <div className="rounded-[1.3rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
                      {error}
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <button type="submit" disabled={loading || !canRegister} className="btn-primary w-full">
                      {loading ? "Registering..." : "Register and Open Scorecard"}
                    </button>
                    <Link href="/scorecard" className="btn-ghost w-full justify-center sm:w-auto">
                      Find Athlete
                    </Link>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
