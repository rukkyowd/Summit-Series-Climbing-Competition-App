"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import { getAuthState, isStaffRole, signInWithRole } from "@/lib/auth";
import { sanitizeInternalRedirectPath } from "@/lib/security";

export default function StaffLoginPage() {
  const router = useRouter();
  const [redirectTarget, setRedirectTarget] = useState("/staff/dashboard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectTarget(sanitizeInternalRedirectPath(params.get("redirect")));
  }, []);

  useEffect(() => {
    void getAuthState().then((state) => {
      if (isStaffRole(state.profile?.role)) {
        router.replace(sanitizeInternalRedirectPath(redirectTarget));
      }
    });
  }, [redirectTarget, router]);

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light />

        <section className="mx-auto max-w-xl results-card">
          <div className="results-kicker">Staff access</div>
          <h1 className="mt-2 text-4xl font-semibold text-slate-950">Judge and admin sign-in</h1>
          <p className="mt-4 text-slate-600">
            Staff sessions live on dedicated routes now, so public competition pages stay focused on climbers, judges, and displays.
          </p>

          {error ? <div className="results-alert results-alert-error mt-4">{error}</div> : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              setLoading(true);
              setError("");
              const safeRedirectTarget = sanitizeInternalRedirectPath(redirectTarget);
              void signInWithRole(email, password)
                .then(() => router.replace(safeRedirectTarget))
                .catch((nextError) => {
                  setError(nextError instanceof Error ? nextError.message : "Unable to sign in.");
                })
                .finally(() => setLoading(false));
            }}
            className="mt-6 space-y-4"
          >
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="judge@gym.com" className="results-input" />
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="results-input" />
            <button type="submit" disabled={loading} className="results-primary-button">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
