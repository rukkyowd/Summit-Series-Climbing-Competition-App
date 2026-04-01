import StaffDashboard from "@/components/staff-dashboard";

export default async function StaffCompetitionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StaffDashboard initialCompetitionSlug={slug} />;
}
