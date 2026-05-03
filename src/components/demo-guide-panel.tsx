"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { clearOfflineQueueForCompetition } from "@/lib/staff-offline-queue";

type DemoGuidePanelProps = {
  eyebrow: string;
  title: string;
  body: string;
  children?: ReactNode;
};

export function DemoGuidePanel({ eyebrow, title, body, children }: DemoGuidePanelProps) {
  return (
    <section className="results-alert border border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(255,255,255,0.92))] text-slate-800">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="results-kicker text-sky-700">{eyebrow}</div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
          <p className="max-w-4xl text-sm leading-relaxed text-slate-600">{body}</p>
        </div>
        {children ? <div className="flex shrink-0 flex-wrap gap-2">{children}</div> : null}
      </div>
    </section>
  );
}

type DemoFinishButtonProps = {
  competitionId: string;
};

export function DemoFinishButton({ competitionId }: DemoFinishButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function finishDemo() {
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/demo/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionId }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to finish the demo.");
      }

      await clearOfflineQueueForCompetition(competitionId);
      router.push("/demo");
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to finish the demo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="primary" onClick={() => void finishDemo()} disabled={pending}>
        {pending ? "Finishing demo..." : "Finish Demo"}
      </Button>
      {error ? <div className="max-w-xs text-sm font-semibold text-red-700">{error}</div> : null}
    </div>
  );
}

export function DemoGuideLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link href={href} className={buttonStyles({ variant: primary ? "primary" : "secondary" })}>
      {children}
    </Link>
  );
}
