import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";

const secondaryDemoRoles = [
  {
    title: "Experience as a Judge",
    description:
      "Jump straight into the live scoring split-screen after the organizer story, or use it as a standalone fast pitch.",
    href: "/demo/interactive",
    badge: "Judge live flow",
  },
  {
    title: "Experience as a Competitor",
    description:
      "Open a seeded athlete scorecard midway through qualifiers and see exactly what a climber would see on comp day.",
    href: "/demo/competitor",
    badge: "Private scorecard",
  },
];

export default function DemoLandingPage() {
  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light />

        <Surface variant="card" className="overflow-hidden">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] xl:items-end">
            <div className="space-y-4">
              <div className="results-kicker">Live demo</div>
              <h1 className="results-editorial-title text-4xl font-semibold text-slate-950 sm:text-5xl xl:text-6xl">
                Build the comp. Hand it into live judging. Watch the gym react.
              </h1>
              <p className="max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Start with the organizer story. It shows how the event gets built, then hands the
                same competition directly into the judge station where one score save moves the
                public leaderboard and survives a Wi-Fi drop.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/staff/demo">
                  <Button variant="primary" className="min-w-[14rem]">
                    Open organizer sales demo
                  </Button>
                </Link>
                <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/90 px-4 py-2 text-sm font-medium text-emerald-800">
                  <span className="demo-live-dot" aria-hidden="true" />
                  <span>Organizer setup, live judging, and offline recovery in one continuous flow</span>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200/80 bg-white/72 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="results-kicker">What they feel</div>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">
                <p>1. The organizer picks a comp format.</p>
                <p>2. The event structure appears automatically.</p>
                <p>3. The same event opens in the judge station.</p>
                <p>4. One score moves the leaderboard and survives bad Wi-Fi.</p>
              </div>
            </div>
          </div>
        </Surface>

        <section className="grid gap-4 lg:grid-cols-2">
          {secondaryDemoRoles.map((role) => (
            <Link key={role.href} href={role.href} className="block">
              <Surface variant="row" className="h-full space-y-4">
                <Badge>{role.badge}</Badge>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{role.title}</h2>
                  <p className="text-sm leading-relaxed text-slate-600">{role.description}</p>
                </div>
                <div className="text-sm font-semibold text-sky-700">Open this secondary demo path</div>
              </Surface>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
