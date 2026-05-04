import SiteHeader from "@/components/site-header";
import { DemoEntry } from "@/components/demo-entry";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";

async function getDemoCompetitions() {
  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("competitions")
      .select("id, slug, name, created_at")
      .eq("is_demo", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((competition) => ({
      id: competition.id as string,
      slug: competition.slug as string,
      name: competition.name as string,
      created_at: (competition.created_at as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

export default async function DemoPage() {
  const demos = await getDemoCompetitions();
  const latestDemo = demos[0] ?? null;

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light />
        <DemoEntry latestDemo={latestDemo} />
      </div>
    </main>
  );
}
