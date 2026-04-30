import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type ScriptOptions = {
  dryRun: boolean;
  competitionIds: string[];
  slugs: string[];
};

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    dryRun: false,
    competitionIds: [],
    slugs: [],
  };

  argv.forEach((arg) => {
    if (arg === "--dry-run") {
      options.dryRun = true;
      return;
    }

    if (arg.startsWith("--id=")) {
      options.competitionIds.push(arg.slice("--id=".length));
      return;
    }

    if (arg.startsWith("--slug=")) {
      options.slugs.push(arg.slice("--slug=".length));
    }
  });

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { listCompetitions, saveCompetitionConfig } = await import("../src/lib/db");
  const { normalizeCompetitionFinalsSetup } = await import("../src/lib/competition-structure");

  const competitions = await listCompetitions(true);
  const selectedCompetitions = competitions.filter((competition) => {
    if (options.competitionIds.length && !options.competitionIds.includes(competition.id)) {
      return false;
    }

    if (options.slugs.length && !options.slugs.includes(competition.slug)) {
      return false;
    }

    return true;
  });

  if (!selectedCompetitions.length) {
    console.log("No competitions matched the provided filters.");
    return;
  }

  let repairedCount = 0;
  let unchangedCount = 0;
  let skippedDemoCount = 0;

  for (const competition of selectedCompetitions) {
    const normalized = normalizeCompetitionFinalsSetup(competition);

    if (!normalized.changed) {
      unchangedCount += 1;
      console.log(`UNCHANGED  ${competition.slug} (${competition.id})`);
      continue;
    }

    if (competition.is_demo) {
      skippedDemoCount += 1;
      console.log(`SKIPPED    ${competition.slug} (${competition.id}) protected demo competition`);
      continue;
    }

    const finalsRound = normalized.competition.rounds?.find((round) => round.scoring_bucket === "finals") ?? null;
    const summary = finalsRound
      ? `finals round "${finalsRound.name}" linked`
      : "finals scoring removed";

    if (options.dryRun) {
      repairedCount += 1;
      console.log(`DRY RUN    ${competition.slug} (${competition.id}) -> ${summary}`);
      continue;
    }

    await saveCompetitionConfig(normalized.competition.id, {
      ...normalized.competition,
      schedule_blocks: normalized.competition.schedule_blocks,
      rounds: normalized.competition.rounds ?? [],
    });
    repairedCount += 1;
    console.log(`REPAIRED   ${competition.slug} (${competition.id}) -> ${summary}`);
  }

  console.log("");
  console.log(`Processed: ${selectedCompetitions.length}`);
  console.log(`Repaired: ${repairedCount}${options.dryRun ? " (dry run)" : ""}`);
  console.log(`Unchanged: ${unchangedCount}`);
  console.log(`Skipped demo competitions: ${skippedDemoCount}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
