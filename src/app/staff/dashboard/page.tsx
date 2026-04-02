import StaffDashboard from "@/components/staff-dashboard";

function readSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default function StaffDashboardPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return (
    <StaffDashboard
      initialCreateDraft={{
        name: readSingleValue(searchParams?.createName).trim(),
        location: readSingleValue(searchParams?.createLocation).trim(),
        startDate: readSingleValue(searchParams?.createStartDate).trim(),
        endDate: readSingleValue(searchParams?.createEndDate).trim(),
        description: readSingleValue(searchParams?.createDescription).trim(),
        format: readSingleValue(searchParams?.createFormat).trim(),
      }}
    />
  );
}
