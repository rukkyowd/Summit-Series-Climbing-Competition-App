"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildCompetitionPath } from "@/lib/scoring";

export default function CompetitionSubnav({
  competitionSlug,
}: {
  competitionSlug: string;
}) {
  const pathname = usePathname();
  const links = [
    { href: buildCompetitionPath(competitionSlug), label: "Overview" },
    { href: buildCompetitionPath(competitionSlug, "leaderboard"), label: "Rankings" },
    { href: buildCompetitionPath(competitionSlug, "register"), label: "Register" },
  ];

  return (
    <nav className="results-subnav">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link key={link.href} href={link.href} className={`results-subnav__link ${active ? "results-subnav__link-active" : ""}`}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
