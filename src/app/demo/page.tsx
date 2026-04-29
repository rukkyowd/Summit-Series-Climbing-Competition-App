import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";

const demoRoles = [
  {
    title: "Experience as a Judge",
    description:
      "Judge one climber on one boulder and watch the public leaderboard update instantly from the same event state.",
    href: "/demo/interactive",
    badge: "Start here",
  },
  {
    title: "Experience as a Competitor",
    description:
      "Open a seeded athlete scorecard halfway through qualifiers and see exactly what a climber would see on comp day.",
    href: "/demo/competitor",
    badge: "Private scorecard",
  },
  {
    title: "Experience as an Organizer",
    description:
      "Step through setup, schedule planning, rounds, and the staff controls that shape the whole event before it goes live.",
    href: "/staff/demo",
    badge: "Organizer workflow",
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
              Start with the role that makes the product click.
            </h1>
            <p className="max-w-3xl text-base leading-relaxed text-slate-600">
              The judge path is the clearest first demo because it shows one action changing everyone
              else’s view in real time. The competitor and organizer paths are here when you want to
              widen the story.
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
