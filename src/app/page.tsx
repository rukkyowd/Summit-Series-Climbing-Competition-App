import Link from "next/link";
import HomeOperations from "./home-operations";

const ACTIONS = [
  {
    href: "/register",
    label: "Register",
    title: "Check athletes in fast",
    description: "Create a competitor record and send them straight to their live scorecard.",
    accent: "text-accent",
    ring: "border-accent/25 group-hover:border-accent/45",
    glow: "bg-accent/10",
    stat: "Front desk ready",
  },
  {
    href: "/scorecard",
    label: "Scorecard",
    title: "Track every attempt",
    description: "Log fails, completion times, and judge actions from a single route view.",
    accent: "text-blue-400",
    ring: "border-blue-500/25 group-hover:border-blue-400/45",
    glow: "bg-blue-500/10",
    stat: "Judge workflow",
  },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    title: "Keep the room live",
    description: "Project the current top performers with rank movement and tie-break timing.",
    accent: "text-yellow-400",
    ring: "border-yellow-500/25 group-hover:border-yellow-400/45",
    glow: "bg-yellow-500/10",
    stat: "Audience facing",
  },
];

const CLIMB_RULES = [
  { label: "Route 01", points: "1,000", tone: "text-green-400" },
  { label: "Route 02", points: "2,000", tone: "text-blue-400" },
  { label: "Route 03", points: "3,000", tone: "text-accent" },
];

export default function Home() {
  return (
    <main className="page-shell">
      <div className="content-frame space-y-8">
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="card relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            <div className="absolute -left-20 top-10 h-52 w-52 rounded-full bg-accent/10 blur-3xl" />
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-yellow-400/10 blur-3xl" />

            <div className="relative space-y-8">
              <div className="space-y-5">
                <span className="eyebrow">Summit Series live scoring</span>
                <div className="max-w-3xl space-y-4">
                  <p className="meta-label">Boulder comp control room</p>
                  <h1 className="section-title text-6xl leading-none sm:text-7xl lg:text-8xl">
                    A sharper scoring desk for fast-moving finals.
                  </h1>
                  <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                    Run athlete registration, route logging, and spectator-facing rankings from one
                    focused interface built for judges under pressure.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/scorecard" className="btn-primary">
                  Open scorecards
                </Link>
                <Link href="/leaderboard" className="btn-ghost">
                  View live board
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="stat-card">
                  <div className="meta-label">Routes</div>
                  <div className="mt-2 font-display text-4xl text-chalk">3</div>
                  <p className="mt-2 font-body text-sm text-slate-300">
                    Distinct score tiers keep route value obvious at a glance.
                  </p>
                </div>
                <div className="stat-card">
                  <div className="meta-label">Penalty model</div>
                  <div className="mt-2 font-display text-4xl text-chalk">-200</div>
                  <p className="mt-2 font-body text-sm text-slate-300">
                    Failed attempts are capped, so route progression still matters.
                  </p>
                </div>
                <div className="stat-card">
                  <div className="meta-label">Tie-break</div>
                  <div className="mt-2 font-display text-4xl text-chalk">Time</div>
                  <p className="mt-2 font-body text-sm text-slate-300">
                    Lowest combined completion time wins when scores match.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <aside className="card flex h-full flex-col gap-6">
            <div className="space-y-4">
              <span className="eyebrow">Scoring at a glance</span>
              <div>
                <h2 className="section-title text-4xl gradient-text">Route values stay visible without eating the page.</h2>
                <p className="mt-3 font-body text-sm leading-7 text-slate-300">
                  Judges still get the route-point reference, but the homepage now gives more room to
                  live event context and operational actions.
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              {CLIMB_RULES.map((rule) => (
                <div key={rule.label} className="card-muted flex items-center justify-between gap-4">
                  <div>
                    <div className="meta-label">{rule.label}</div>
                    <div className={`mt-1 font-display text-2xl ${rule.tone}`}>{rule.points}</div>
                  </div>
                  <div className="text-right font-body text-sm text-slate-300">base points</div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="meta-label">Reminder</div>
              <div className="mt-3 space-y-2 font-body text-sm text-slate-300">
                <p>Only the first three failed attempts on each route are penalized.</p>
                <p>Final board order stays score first, lowest total time second.</p>
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {ACTIONS.map((action) => (
            <Link key={action.href} href={action.href} className={`group action-card ${action.ring}`}>
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
              <div className={`mb-5 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs font-mono uppercase tracking-widest ${action.glow} ${action.accent}`}>
                {action.label}
              </div>
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="section-title text-3xl leading-none">{action.title}</h3>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-slate-300">
                    {action.stat}
                  </span>
                </div>
                <p className="text-sm leading-7 text-slate-300">{action.description}</p>
              </div>
              <div className="mt-8 flex items-center justify-between text-sm font-medium text-slate-300">
                <span>Open panel</span>
                <span className={action.accent}>Explore</span>
              </div>
            </Link>
          ))}
        </section>

        <HomeOperations />
      </div>
    </main>
  );
}
