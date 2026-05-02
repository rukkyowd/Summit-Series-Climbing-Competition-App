import { redirect } from "next/navigation";

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function StaffDemoPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const demoStory = readSearchParam(searchParams?.demoStory);
  if (demoStory === "act1") {
    redirect("/staff/demo/new");
  }

  redirect("/demo");
}
