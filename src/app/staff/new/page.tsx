import StaffDashboard from "@/components/staff-dashboard";
import { buildDefaultGuidedDemoEventSetup } from "@/lib/guided-demo-setup";

function readSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function StaffNewCompetitionPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const demoStory = readSingleValue(searchParams?.demoStory);
  const isGuidedDemoAct1 = demoStory === "act1";
  const defaults = buildDefaultGuidedDemoEventSetup();

  return (
    <StaffDashboard
      demoStoryAct={isGuidedDemoAct1 ? "act1" : undefined}
      initialCreateDraft={
        isGuidedDemoAct1
          ? {
              name: defaults.name,
              location: defaults.locationName,
              startDate: defaults.startDate,
              endDate: defaults.endDate,
              description: defaults.description,
              registrationOpensAt: defaults.registrationOpensAt,
              registrationClosesAt: defaults.registrationClosesAt,
            }
          : undefined
      }
    />
  );
}
