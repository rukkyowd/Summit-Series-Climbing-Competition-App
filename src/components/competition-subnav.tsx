"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  buildCompetitionPath,
  buildDisplayPath,
} from "@/lib/scoring";

export default function CompetitionSubnav({ competitionSlug }: { competitionSlug: string }) {
  const pathname = usePathname();
  const items = [
    { href: buildCompetitionPath(competitionSlug), label: "Overview" },
    { href: buildCompetitionPath(competitionSlug, "register"), label: "Register" },
    { href: buildCompetitionPath(competitionSlug, "scorecard"), label: "Scorecard" },
    { href: buildCompetitionPath(competitionSlug, "leaderboard"), label: "Rankings" },
    { href: buildDisplayPath(competitionSlug), label: "Display" },
  ];

  return (
    <nav className="nav-scroll">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname?.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-pill nav-pill-light ${isActive ? "nav-pill-active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
