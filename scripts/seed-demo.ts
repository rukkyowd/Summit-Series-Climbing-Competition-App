import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { resetDemoCompetition } = await import("../src/lib/demo-reset");
  const result = await resetDemoCompetition();
  console.log(`Demo competition reset: ${result.name} (${result.slug}) [${result.competitionId}]`);
}

void main();
