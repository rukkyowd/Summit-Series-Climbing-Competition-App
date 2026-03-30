import Link from "next/link";
import SiteHeader from "@/components/site-header";
import HomeOperations from "@/app/home-operations";

const ACTIONS = [
  {
    href: "/register",
    title: "Register Athletes",
    description: "Add a competitor and open their scorecard right away.",
    accent: "text-accent",
  },
  {
    href: "/scorecard",
    title: "Open Scorecards",
    description: "Find an athlete, record attempts, and log route times.",
    accent: "text-blue-300",
  },
  {
    href: "/leaderboard",
    title: "View Leaderboard",
    description: "See the latest rankings, scores, and tie-break times.",
    accent: "text-yellow-300",
  },
];

const SCORING_RULES = [
  "30 climbs",
  "Progressive point values",
  "Penalty values from event settings",
  "Per-climb fail cap from settings",
  "Tie-break: Lowest total time",
];

export default function Home() {
  return (
    <main className="page-shell">
      <div className="content-frame space-y-6">
        <SiteHeader />

        <section className="card relative overflow-hidden text-center">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
          <div className="absolute -left-24 top-10 h-56 w-56 rounded-full bg-accent/12 blur-3xl" />
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-yellow-400/10 blur-3xl" />

          <div className="relative mx-auto max-w-4xl space-y-8">
            <span className="eyebrow border-fbc-yellow/20 bg-fbc-yellow/10 text-fbc-yellow">
              Summit Series x FBC
            </span>

            <div className="space-y-4">
              <h1 className="section-title text-6xl sm:text-7xl lg:text-[5.2rem]">
                Built for the Fredericton Bouldering Co-op floor.
              </h1>
              <p className="mx-auto max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Register athletes, score in dead zones, and keep the room in sync from one set of
                judge-ready pages.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {ACTIONS.map((action) => (
                <Link key={action.href} href={action.href} className="command-link text-center">
                  <div className="w-full">
                    <div className="text-lg font-semibold text-chalk">{action.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{action.description}</p>
                    <div className={`mt-4 text-sm font-semibold ${action.accent}`}>Open</div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {SCORING_RULES.map((rule) => (
                <span
                  key={rule}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300"
                >
                  {rule}
                </span>
              ))}
            </div>
          </div>
        </section>

        <HomeOperations />
      </div>
    </main>
  );
}
