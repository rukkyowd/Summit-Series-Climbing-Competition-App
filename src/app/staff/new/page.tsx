import StaffDashboard from "@/components/staff-dashboard";

function readSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function StaffNewCompetitionPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const demo = readSingleValue(searchParams?.demo);

  return <StaffDashboard demoSeedOnCreate={demo === "act1" || demo === "1"} />;
}
