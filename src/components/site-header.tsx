"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { buildCompetitionPath, buildDisplayPath } from "@/lib/scoring";
import { readScorecardAccess } from "@/lib/scorecard-access";
import { buttonStyles } from "@/components/ui/button";

interface NavItem {
  href: string;
  label: string;
}

export default function SiteHeader({
  status,
  competitionSlug,
  light = false,
  navItems,
}: {
  status?: ReactNode;
  competitionSlug?: string;
  light?: boolean;
  navItems?: NavItem[];
}) {
  const pathname = usePathname();
  const [scorecardHref, setScorecardHref] = useState(
    competitionSlug ? buildCompetitionPath(competitionSlug, "scorecard") : "/"
  );
  const [hasSavedScorecard, setHasSavedScorecard] = useState(false);

  const resolvedNavItems = useMemo(() => {
    if (navItems) {
      return navItems;
    }

    if (!competitionSlug) {
      return [];
    }

    return [
      { href: buildCompetitionPath(competitionSlug), label: "Overview" },
      { href: buildCompetitionPath(competitionSlug, "register"), label: "Register" },
      { href: buildCompetitionPath(competitionSlug, "scorecard"), label: "Scorecard" },
      { href: buildCompetitionPath(competitionSlug, "leaderboard"), label: "Rankings" },
      { href: buildDisplayPath(competitionSlug), label: "Display" },
    ];
  }, [competitionSlug, navItems]);

  useEffect(() => {
    const access = readScorecardAccess(competitionSlug);
    if (competitionSlug && access?.competitionSlug === competitionSlug) {
      setScorecardHref(buildCompetitionPath(competitionSlug, "scorecard"));
      setHasSavedScorecard(true);
      return;
    }

    if (competitionSlug) {
      setScorecardHref(buildCompetitionPath(competitionSlug, "scorecard"));
      setHasSavedScorecard(false);
      return;
    }

    setScorecardHref("/");
    setHasSavedScorecard(false);
  }, [competitionSlug, pathname]);

  const normalizedScorecardPath = scorecardHref.split("#")[0]?.split("?")[0] || "/";
  const showMobileScorecardTray =
    Boolean(competitionSlug) && hasSavedScorecard && pathname !== normalizedScorecardPath;

  return (
    <>
      <header className={`app-header ${light ? "app-header-light" : ""}`}>
        <div className="flex flex-col gap-4 text-left lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="results-brand-lockup max-w-full">
            <div className={`results-brand-mark ${light ? "" : "border-white/20"}`}>
              <Image src="/brand-logo.png" alt="Summit Series logo" width={72} height={72} className="results-brand-logo" />
            </div>
            <div className="results-brand-wordmark">
              <div className={`results-brand-title ${light ? "text-slate-500" : "text-slate-200"}`}>Summit Series</div>
              <div className={`results-brand-subtitle ${light ? "text-slate-900" : "text-chalk"}`}>Competition Results</div>
            </div>
          </Link>

          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:items-end">
            {resolvedNavItems.length ? (
              <nav className={`nav-scroll ${competitionSlug || navItems ? "lg:justify-end" : "sm:justify-start lg:justify-end"}`}>
                {resolvedNavItems.map((item) => {
                  const href = item.label === "Scorecard" ? scorecardHref : item.href;
                  const activeHref = (item.label === "Scorecard" ? scorecardHref : item.href).split("#")[0] || "/";
                  const isActive =
                    activeHref === "/"
                      ? pathname === "/"
                      : pathname === activeHref || pathname?.startsWith(`${activeHref}/`);

                  return (
                    <Link
                      key={item.href}
                      href={href}
                      className={`nav-pill shrink-0 ${isActive ? "nav-pill-active" : ""} ${light ? "nav-pill-light" : ""}`}
                    >
                      {item.label === "Scorecard" && hasSavedScorecard ? "My Scorecard" : item.label}
                    </Link>
                  );
                })}
              </nav>
            ) : null}

            {status ? <div className="flex w-full flex-wrap items-center justify-start gap-2 lg:justify-end">{status}</div> : null}
          </div>
        </div>
      </header>

      {showMobileScorecardTray ? (
        <div className="sticky-active-bar md:hidden">
          <div className="sticky-active-bar__content">
            <div className="text-center">
              <div className="meta-label text-slate-300">Quick Access</div>
              <div className="mt-2 text-lg font-semibold text-white">My Scorecard</div>
              <div className="mt-1 text-sm text-slate-300">
                Jump back into your saved scorecard for this event.
              </div>
            </div>
            <Link href={scorecardHref} className={buttonStyles({ variant: "primary", fullWidth: true })}>
              Open My Scorecard
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
