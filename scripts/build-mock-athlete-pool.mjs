import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const curatedPath = path.join(repoRoot, "sql", "mock-athlete-curated-full-names.txt");
const supplementalPath = "C:\\Users\\Paul\\Downloads\\list.txt";
const outputPath = path.join(repoRoot, "src", "lib", "mock-athlete-name-pool.ts");
const mockEventsSeedPath = path.join(repoRoot, "sql", "mock-events-seed.sql");
const springSendRegistrationsPath = path.join(repoRoot, "sql", "spring-send", "02-seed-registrations.sql");

function normalizeToken(value) {
  return value
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFullName(value) {
  return normalizeToken(value)
    .replace(/\s+/g, " ")
    .trim();
}

function isSimpleNameToken(value) {
  return /^[A-Za-z][A-Za-z'’-]*$/.test(value);
}

function dedupe(values) {
  const seen = new Set();
  const result = [];

  values.forEach((value) => {
    const normalized = normalizeToken(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(normalized);
  });

  return result;
}

const curatedFullNames = dedupe(
  fs
    .readFileSync(curatedPath, "utf8")
    .split(/\r?\n/)
    .map((line) => normalizeFullName(line))
    .filter((line) => line.split(" ").length >= 2)
);

const curatedFirstNames = dedupe(curatedFullNames.map((name) => name.split(" ")[0]));
const curatedLastNames = dedupe(curatedFullNames.map((name) => name.split(" ").slice(1).join(" ")));

const supplementalTokens = dedupe(
  fs
    .readFileSync(supplementalPath, "utf8")
    .split(/\r?\n/)
    .map((line) => normalizeToken(line))
    .filter(isSimpleNameToken)
);

const supplementalFirstNames = supplementalTokens.filter((token) => token.length >= 3).slice(0, 280);
const supplementalLastNames = supplementalTokens
  .filter((token) => token.length >= 4)
  .slice(Math.max(0, supplementalTokens.length - 420), supplementalTokens.length - 40);

const firstNames = dedupe([...curatedFirstNames, ...supplementalFirstNames]).slice(0, 240);
const lastNames = dedupe([...curatedLastNames, ...supplementalLastNames]).slice(0, 320);

const synthesizedFullNames = [];
for (let index = 0; index < 600; index += 1) {
  const firstName = firstNames[index % firstNames.length];
  const lastName = lastNames[(index * 17 + 23) % lastNames.length];
  const combined = normalizeFullName(`${firstName} ${lastName}`);

  if (combined.split(" ").length < 2) {
    continue;
  }

  synthesizedFullNames.push(combined);
}

const fullNames = dedupe([...curatedFullNames, ...synthesizedFullNames]);

function toArrayLiteral(values) {
  return values.map((value) => `  ${JSON.stringify(value)}`).join(",\n");
}

function toSqlLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

const fileContents = `export const MOCK_ATHLETE_CURATED_FULL_NAMES = [\n${toArrayLiteral(
  curatedFullNames
)}\n] as const;\n\nexport const MOCK_ATHLETE_FIRST_NAMES = [\n${toArrayLiteral(
  firstNames
)}\n] as const;\n\nexport const MOCK_ATHLETE_LAST_NAMES = [\n${toArrayLiteral(
  lastNames
)}\n] as const;\n\nexport const MOCK_ATHLETE_FULL_NAME_POOL = [\n${toArrayLiteral(
  fullNames
)}\n] as const;\n`;

fs.writeFileSync(outputPath, fileContents);

const sqlArrayLiteral = fullNames.map((value) => `        ${toSqlLiteral(value)}`).join(",\n");

const mockEventsNameExpression = `    (\n      array[\n${sqlArrayLiteral}\n      ]\n    )[1 + ((na.global_sequence - 1) % ${fullNames.length})] as name,`;

const springSendNameExpression = `    (\n      array[\n${sqlArrayLiteral}\n      ]\n    )[1 + (((series.n - 1) * 11) % ${fullNames.length})] as athlete_name,`;

const mockEventsSeed = fs.readFileSync(mockEventsSeedPath, "utf8").replace(
  /\(\s*array\[[\s\S]*?\]\s*\)\[1 \+ \(\(na\.global_sequence - 1\) % 40\)\]\s*\|\|\s*' '\s*\|\|\s*\(\s*array\[[\s\S]*?\]\s*\)\[1 \+ \(\(\(na\.global_sequence - 1\) \* 7\) % 40\)\] as name,/,
  mockEventsNameExpression
);
fs.writeFileSync(mockEventsSeedPath, mockEventsSeed);

const springSendRegistrations = fs.readFileSync(springSendRegistrationsPath, "utf8").replace(
  /case \(\(series\.n \* 17\) % 24\)[\s\S]*?end \|\| ' ' \|\| series\.n as athlete_name,/,
  springSendNameExpression
);
fs.writeFileSync(springSendRegistrationsPath, springSendRegistrations);

console.log(
  JSON.stringify(
    {
      curatedFullNames: curatedFullNames.length,
      firstNames: firstNames.length,
      lastNames: lastNames.length,
      fullNamePool: fullNames.length,
      outputPath,
    },
    null,
    2
  )
);
