import Link from "next/link";
import SiteHeader from "@/components/site-header";

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
  { label: "Route 1", value: "1,000 points" },
  { label: "Route 2", value: "2,000 points" },
  { label: "Route 3", value: "3,000 points" },
  { label: "Penalty", value: "-200 per failed attempt" },
  { label: "Tie-break", value: "Lowest total time" },
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
            <span className="eyebrow">Summit Series</span>
            <div className="space-y-4">
              <h1 className="section-title text-6xl sm:text-7xl lg:text-[5.5rem]">
                Simple live scoring for your climbing competition.
              </h1>
              <p className="mx-auto max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Register athletes, update scorecards, and follow the leaderboard from one clean set
                of pages.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className="btn-primary min-w-52">
                Register Athletes
              </Link>
              <Link href="/scorecard" className="btn-ghost min-w-52">
                Open Scorecards
              </Link>
              <Link href="/leaderboard" className="btn-ghost min-w-52">
                View Leaderboard
              </Link>
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
          </div>
        </section>

        <section className="card text-center">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="meta-label">Scoring</div>
            <h2 className="section-title text-4xl sm:text-5xl">How scoring works</h2>
            <p className="text-sm leading-7 text-slate-300 sm:text-base">
              Route scores increase from one wall to the next. Failed attempts reduce the score, and
              the lowest total time breaks ties.
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {SCORING_RULES.map((rule) => (
              <div key={rule.label} className="hero-stat text-center">
                <div className="meta-label">{rule.label}</div>
                <div className="mt-3 text-lg font-semibold text-chalk">{rule.value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
