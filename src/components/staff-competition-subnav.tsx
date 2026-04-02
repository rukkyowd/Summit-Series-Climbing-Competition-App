"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  buildCompetitionPath,
  buildDisplayPath,
  buildStaffCompetitionPath,
} from "@/lib/scoring";

export default function StaffCompetitionSubnav({ competitionSlug }: { competitionSlug: string }) {
  const pathname = usePathname();
  const items = [
    { href: buildStaffCompetitionPath(competitionSlug), label: "Admin" },
    { href: buildStaffCompetitionPath(competitionSlug, "judge"), label: "Judge" },
    { href: buildStaffCompetitionPath(competitionSlug, "preflight"), label: "Preflight" },
    { href: buildCompetitionPath(competitionSlug), label: "Public" },
    { href: buildDisplayPath(competitionSlug), label: "Display" },
  ];

  return (
    <nav className="results-workspace-card py-3">
      <div className="nav-scroll">
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
      </div>
    </nav>
  );
}
