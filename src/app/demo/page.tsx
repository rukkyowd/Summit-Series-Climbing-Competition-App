import { DemoCommandCenter } from "@/components/demo/demo-command-center";
import { getDemoStoryState } from "@/lib/demo-story";

export const dynamic = "force-dynamic";

export default async function DemoLandingPage() {
  const initialState = await getDemoStoryState();

  return <DemoCommandCenter initialState={initialState} />;
}
