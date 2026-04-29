import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";

const demoRoles = [
  {
    title: "Live scoring demo",
    description:
      "See the fastest proof loop in the product: a judge saves one score and the public leaderboard reacts immediately.",
    href: "/demo/interactive",
    badge: "Judge + leaderboard",
  },
  {
    title: "Competitor experience",
    description:
      "Open a seeded climber's private scorecard and see the event from the athlete's point of view.",
    href: "/demo/competitor",
    badge: "Private scorecard",
  },
  {
    title: "Organizer workflow",
    description:
      "Step through event setup, schedule planning, stages, and the operational dashboard used before comp day.",
    href: "/staff/demo",
    badge: "Staff demo",
  },
];

export default function DemoLandingPage() {
  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light />

        <Surface variant="card" className="overflow-hidden">
          <div className="space-y-4">
            <div className="results-kicker">Demo roles</div>
            <h1 className="results-editorial-title text-4xl font-semibold text-slate-950 sm:text-5xl">
              Choose the story you want to tell first.
            </h1>
            <p className="max-w-3xl text-base leading-relaxed text-slate-600">
              Start with the live scoring loop if you want the fastest aha moment. Use the competitor
              path to show the climber-facing experience, or jump into the organizer workflow to frame
              how the whole event gets built.
            </p>
          </div>
        </Surface>

        <section className="grid gap-4 lg:grid-cols-3">
          {demoRoles.map((role) => (
            <Link key={role.href} href={role.href} className="block">
              <Surface variant="row" className="h-full space-y-4">
                <Badge>{role.badge}</Badge>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{role.title}</h2>
                  <p className="text-sm leading-relaxed text-slate-600">{role.description}</p>
                </div>
                <div className="text-sm font-semibold text-sky-700">Open this demo flow</div>
              </Surface>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
