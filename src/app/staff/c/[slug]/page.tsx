import StaffDashboard from "@/components/staff-dashboard";

export default async function StaffCompetitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const demoStory = Array.isArray(resolvedSearchParams.demoStory)
    ? resolvedSearchParams.demoStory[0]
    : resolvedSearchParams.demoStory;

  return <StaffDashboard initialCompetitionSlug={slug} demoStoryAct={demoStory === "act3" ? "act3" : undefined} />;
}
