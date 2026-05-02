import StaffDashboard from "@/components/staff-dashboard";

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function StaffDemoPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const demoStory = readSearchParam(searchParams?.demoStory);

  return <StaffDashboard demoMode demoStoryAct={demoStory === "act1" ? "act1" : undefined} />;
}
