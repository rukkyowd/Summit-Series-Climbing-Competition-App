import { redirect } from "next/navigation";

export default function LegacyStaffDemoNewPage() {
  redirect("/staff/new?demoStory=act1");
}
