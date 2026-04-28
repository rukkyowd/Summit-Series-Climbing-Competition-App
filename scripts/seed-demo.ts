import { resetDemoCompetition } from "../src/lib/demo-reset";

async function main() {
  const result = await resetDemoCompetition();
  console.log(`Demo competition reset: ${result.name} (${result.slug}) [${result.competitionId}]`);
}

void main();
