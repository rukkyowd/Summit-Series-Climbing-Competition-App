import StaffDashboard from "@/components/staff-dashboard";
import { fetchOfficialBoulderingEvents } from "@/lib/official-events";

function readSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function sanitizeDraftText(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") {
    return "";
  }

  return trimmed;
}

function sanitizeDraftNullable(value: string) {
  const trimmed = sanitizeDraftText(value);
  return trimmed || null;
}

export default async function StaffDashboardPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const importedOfficialEventId = readSingleValue(searchParams?.importOfficialEvent).trim();
  const officialEvents = importedOfficialEventId ? await fetchOfficialBoulderingEvents().catch(() => []) : [];
  const importedOfficialEvent = officialEvents.find((event) => event.id === importedOfficialEventId);
  const directName = sanitizeDraftText(readSingleValue(searchParams?.createName));
  const directLocation = sanitizeDraftText(readSingleValue(searchParams?.createLocation));
  const directStartDate = sanitizeDraftText(readSingleValue(searchParams?.createStartDate));
  const directEndDate = sanitizeDraftText(readSingleValue(searchParams?.createEndDate));
  const directDescription = sanitizeDraftText(readSingleValue(searchParams?.createDescription));
  const directRegistrationOpensAt = sanitizeDraftNullable(readSingleValue(searchParams?.createRegistrationOpensAt));
  const directRegistrationClosesAt = sanitizeDraftNullable(readSingleValue(searchParams?.createRegistrationClosesAt));
  const directOfficialEventUrl = sanitizeDraftText(readSingleValue(searchParams?.createOfficialEventUrl));
  const directOfficialRegistrationUrl = sanitizeDraftText(readSingleValue(searchParams?.createOfficialRegistrationUrl));
  const directOfficialScheduleUrl = sanitizeDraftText(readSingleValue(searchParams?.createOfficialScheduleUrl));
  const directHeroImageUrl = sanitizeDraftText(readSingleValue(searchParams?.createHeroImageUrl));
  const directDisciplineLabel = sanitizeDraftText(readSingleValue(searchParams?.createDisciplineLabel));
  const directFormat = sanitizeDraftText(readSingleValue(searchParams?.createFormat));

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
