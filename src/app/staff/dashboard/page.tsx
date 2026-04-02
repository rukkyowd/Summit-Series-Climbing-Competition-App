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
  const directName = readSingleValue(searchParams?.createName).trim();
  const directLocation = readSingleValue(searchParams?.createLocation).trim();
  const directStartDate = readSingleValue(searchParams?.createStartDate).trim();
  const directEndDate = readSingleValue(searchParams?.createEndDate).trim();
  const directDescription = readSingleValue(searchParams?.createDescription).trim();
  const directRegistrationOpensAt = readSingleValue(searchParams?.createRegistrationOpensAt).trim();
  const directRegistrationClosesAt = readSingleValue(searchParams?.createRegistrationClosesAt).trim();
  const directOfficialEventUrl = readSingleValue(searchParams?.createOfficialEventUrl).trim();
  const directOfficialRegistrationUrl = readSingleValue(searchParams?.createOfficialRegistrationUrl).trim();
  const directOfficialScheduleUrl = readSingleValue(searchParams?.createOfficialScheduleUrl).trim();
  const directHeroImageUrl = readSingleValue(searchParams?.createHeroImageUrl).trim();
  const directDisciplineLabel = readSingleValue(searchParams?.createDisciplineLabel).trim();
  const directFormat = readSingleValue(searchParams?.createFormat).trim();

  return (
    <StaffDashboard
      initialCreateDraft={{
        name: directName || importedOfficialEvent?.title || "",
        location: directLocation || importedOfficialEvent?.location || "",
        startDate: directStartDate || importedOfficialEvent?.start_date || "",
        endDate: directEndDate || importedOfficialEvent?.end_date || "",
        description: directDescription || importedOfficialEvent?.description || "",
        registrationOpensAt:
          directRegistrationOpensAt || importedOfficialEvent?.registration_opens_at || null,
        registrationClosesAt:
          directRegistrationClosesAt || importedOfficialEvent?.registration_closes_at || null,
        officialEventUrl: directOfficialEventUrl || importedOfficialEvent?.official_event_url || "",
        officialRegistrationUrl:
          directOfficialRegistrationUrl || importedOfficialEvent?.official_registration_url || "",
        officialScheduleUrl:
          directOfficialScheduleUrl || importedOfficialEvent?.official_schedule_url || "",
        heroImageUrl: directHeroImageUrl || importedOfficialEvent?.hero_image_url || "",
        disciplineLabel: directDisciplineLabel || importedOfficialEvent?.disciplines || "",
        format: directFormat || (importedOfficialEvent ? "flash_format" : ""),
      }}
    />
  );
}
