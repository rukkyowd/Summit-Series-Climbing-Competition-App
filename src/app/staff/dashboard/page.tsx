import { Suspense } from "react";
import StaffDashboard from "@/components/staff-dashboard";

export default function StaffDashboardPage() {
  return (
    <Suspense fallback={null}>
      <StaffDashboard />
    </Suspense>
  );
}
