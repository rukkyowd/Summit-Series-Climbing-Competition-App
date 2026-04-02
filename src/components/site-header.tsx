"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { buildCompetitionPath, buildDisplayPath } from "@/lib/scoring";
import { readScorecardAccess } from "@/lib/scorecard-access";

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
  const [scorecardHref, setScorecardHref] = useState(competitionSlug ? buildCompetitionPath(competitionSlug, "scorecard") : "/");

  const resolvedNavItems = useMemo(() => {
    if (navItems) {
      return navItems;
    }

    if (!competitionSlug) {
      return [{ href: "/", label: "Events" }];
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
    const access = readScorecardAccess();
    if (competitionSlug && access?.competitionSlug === competitionSlug) {
      setScorecardHref(`${buildCompetitionPath(competitionSlug, "scorecard")}?token=${access.token}`);
      return;
    }

    if (competitionSlug) {
      setScorecardHref(buildCompetitionPath(competitionSlug, "scorecard"));
      return;
    }

    setScorecardHref("/");
  }, [competitionSlug, pathname]);

  return (
    <header className={`app-header ${light ? "app-header-light" : ""}`}>
      <div className="flex flex-col gap-4 text-left lg:flex-row lg:items-center lg:justify-between">
        <Link href="/" className="results-brand-lockup">
          <div className={`results-brand-mark ${light ? "" : "border-white/20"}`}>
            <span className="results-brand-ridge" aria-hidden="true" />
            {!light ? <span className="aurora-ring" /> : null}
          </div>
          <div className="results-brand-wordmark">
            <div className={`results-brand-title ${light ? "text-slate-500" : "text-slate-200"}`}>Summit Series</div>
            <div className={`results-brand-subtitle ${light ? "text-slate-900" : "text-chalk"}`}>Competition Results</div>
          </div>
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:items-end">
          <nav className={`nav-scroll ${competitionSlug || navItems ? "lg:justify-end" : "sm:justify-start lg:justify-end"}`}>
            {resolvedNavItems.map((item) => {
              const href = item.label === "Scorecard" ? scorecardHref : item.href;
              const isActive =
                href === "/"
                  ? pathname === "/"
                  : pathname === href || pathname?.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={href}
                  className={`nav-pill ${isActive ? "nav-pill-active" : ""} ${light ? "nav-pill-light" : ""}`}
                >
                  {item.label === "Scorecard" && scorecardHref.includes("?token=") ? "My Scorecard" : item.label}
                </Link>
              );
            })}
          </nav>

          {status ? <div className="flex w-full flex-wrap items-center justify-start gap-2 lg:justify-end">{status}</div> : null}
        </div>
      </div>
    </header>
  );
}
