import StaffDashboard from "@/components/staff-dashboard";
import { fetchOfficialBoulderingEvents } from "@/lib/official-events";

function readSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default async function StaffDashboardPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const importedOfficialEventId = readSingleValue(searchParams?.importOfficialEvent).trim();
  const officialEvents = importedOfficialEventId ? await fetchOfficialBoulderingEvents().catch(() => []) : [];
  const importedOfficialEvent = officialEvents.find((event) => event.id === importedOfficialEventId);

  return (
    <StaffDashboard
      initialCreateDraft={{
        name: importedOfficialEvent?.title || readSingleValue(searchParams?.createName).trim(),
        location: importedOfficialEvent?.location || readSingleValue(searchParams?.createLocation).trim(),
        startDate: importedOfficialEvent?.start_date || readSingleValue(searchParams?.createStartDate).trim(),
        endDate: importedOfficialEvent?.end_date || readSingleValue(searchParams?.createEndDate).trim(),
        description: importedOfficialEvent?.description || readSingleValue(searchParams?.createDescription).trim(),
        registrationOpensAt: importedOfficialEvent?.registration_opens_at ?? null,
        registrationClosesAt: importedOfficialEvent?.registration_closes_at ?? null,
        officialEventUrl: importedOfficialEvent?.official_event_url || "",
        officialRegistrationUrl: importedOfficialEvent?.official_registration_url || "",
        officialScheduleUrl: importedOfficialEvent?.official_schedule_url || "",
        heroImageUrl: importedOfficialEvent?.hero_image_url || "",
        disciplineLabel: importedOfficialEvent?.disciplines || "",
        format: importedOfficialEvent ? "flash_format" : readSingleValue(searchParams?.createFormat).trim(),
      }}
    />
  );
}
