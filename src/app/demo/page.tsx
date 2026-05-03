import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { buttonStyles } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

async function getLatestDemoSlug() {
  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data } = await supabase
      .from("competitions")
      .select("slug")
      .eq("is_demo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return typeof data?.slug === "string" ? data.slug : null;
  } catch {
    return null;
  }
}

export default async function DemoPage() {
  const demoSlug = await getLatestDemoSlug();
  const judgeHref = demoSlug ? `/staff/c/${demoSlug}/judge` : "/staff/new?demo=1";
  const publicHref = demoSlug ? `/c/${demoSlug}` : "/staff/new?demo=1";

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light />

        <Surface variant="card" className="space-y-6">
          <div className="space-y-3">
            <div className="results-kicker text-sky-700">Scorecard demo</div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
              Run the real app with sample climbers.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Create a real competition, let the demo seed a small field with one intentional scoring
              mistake, then use the actual judge panel, organizer dashboard, and public results pages.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.25rem] border border-slate-200 bg-white/80 p-4">
              <div className="text-sm font-semibold text-slate-950">1. Organizer</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Fill out the normal staff event creation form with a finals-capable preset.
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-white/80 p-4">
              <div className="text-sm font-semibold text-slate-950">2. Judge</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Find #104 Maya Chen on B3 and correct the seeded mistake from Top in 3 to Top in 1.
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-white/80 p-4">
              <div className="text-sm font-semibold text-slate-950">3. Public</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Open the public page and leaderboard to see the same event competitors and spectators see.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/staff/new?demo=1" className={buttonStyles({ variant: "primary" })}>
              Start Demo
            </Link>
            <Link href={judgeHref} className={buttonStyles({ variant: "secondary" })}>
              Skip to Judge
            </Link>
            <Link href={publicHref} className={buttonStyles({ variant: "secondary" })}>
              Skip to Public
            </Link>
          </div>

          {!demoSlug ? (
            <p className="text-sm leading-6 text-slate-500">
              Skip links will open event creation until a seeded demo event exists.
            </p>
          ) : null}
        </Surface>
      </div>
    </main>
  );
}
