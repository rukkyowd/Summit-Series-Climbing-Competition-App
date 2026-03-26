"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/register", label: "Register" },
  { href: "/scorecard", label: "Scorecard" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export default function SiteHeader({
  status,
}: {
  status?: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <header className="app-header">
      <div className="flex flex-col items-center gap-4 text-center">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-xl font-display text-chalk">
            <span>SS</span>
            <span className="aurora-ring" />
          </div>
          <div className="min-w-0">
            <div className="meta-label text-slate-200">Summit Series</div>
            <div className="truncate font-body text-sm text-slate-300">Live Scoring</div>
          </div>
        </Link>

        <nav className="flex flex-wrap justify-center gap-2">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-pill ${isActive ? "nav-pill-active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {status ? <div className="flex flex-wrap items-center justify-center gap-2">{status}</div> : null}
      </div>
    </header>
  );
}
