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
      <div className="flex flex-col items-center gap-4 text-center">
        <Link href="/" className="flex min-w-0 items-center justify-center gap-3 self-center">
          <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border text-xl font-display ${light ? "border-slate-200 bg-white text-slate-900" : "border-white/10 bg-white/[0.05] text-chalk"}`}>
            <span>SS</span>
            {!light ? <span className="aurora-ring" /> : null}
          </div>
          <div className="min-w-0 text-center">
            <div className={`meta-label ${light ? "text-slate-500" : "text-slate-200"}`}>Summit Series</div>
            <div className={`truncate font-body text-sm ${light ? "text-slate-600" : "text-slate-300"}`}>Competition Results</div>
          </div>
        </Link>

        <nav className={`nav-scroll ${competitionSlug || navItems ? "" : "sm:justify-start"}`}>
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

        {status ? <div className="flex w-full flex-wrap items-center justify-center gap-2">{status}</div> : null}
      </div>
    </header>
  );
}
