"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

type DemoSalesShellProps = {
  mode: "organizer" | "judge";
  stepLabel: string;
  title: string;
  body: string;
  autoplayRunning: boolean;
  audioEnabled: boolean;
  onReplay: () => void;
  onSkipToJudge: () => void;
  onBackToOrganizer: () => void;
  onToggleAudio: () => void;
};

export function DemoSalesShell({
  mode,
  stepLabel,
  title,
  body,
  autoplayRunning,
  audioEnabled,
  onReplay,
  onSkipToJudge,
  onBackToOrganizer,
  onToggleAudio,
}: DemoSalesShellProps) {
  return (
    <section className="demo-sales-shell">
      <div className="demo-sales-shell__main">
        <div className="demo-sales-shell__eyebrow">
          <span className="demo-live-badge">
            <span className="demo-live-dot" aria-hidden="true" />
            LIVE DEMO
          </span>
          <span className="demo-sales-shell__step">{stepLabel}</span>
          <span className="demo-sales-shell__mode">{mode === "organizer" ? "Organizer story" : "Judge story"}</span>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
          <p className="max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">{body}</p>
        </div>
      </div>
      <div className="demo-sales-shell__actions">
        <Button variant="secondary" className="min-h-11 rounded-full px-5" onClick={onReplay}>
          {autoplayRunning ? "Restart story" : "Replay demo"}
        </Button>
        {mode === "organizer" ? (
          <Button variant="secondary" className="min-h-11 rounded-full px-5" onClick={onSkipToJudge}>
            Skip to judge
          </Button>
        ) : (
          <Button variant="secondary" className="min-h-11 rounded-full px-5" onClick={onBackToOrganizer}>
            Back to organizer
          </Button>
        )}
        <button type="button" onClick={onToggleAudio} className="demo-sales-shell__audio">
          {audioEnabled ? "Audio on" : "Audio off"}
        </button>
      </div>
      {mode === "organizer" ? (
        <div className="demo-sales-shell__links">
          <Link href="/demo" className="results-secondary-button">
            All demo roles
          </Link>
        </div>
      ) : null}
    </section>
  );
}
