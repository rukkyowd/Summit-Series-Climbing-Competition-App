import {
  DEMO_TARGET_CLIMB_NUMBER,
  DEMO_TARGET_CLIMBER_NUMBER,
} from "@/lib/demo-scenario";

export const DEMO_MIN_FIELD_SIZE = 18;
export const DEMO_MAX_FIELD_SIZE = 20;
export const DEMO_ATHLETES_PER_CATEGORY = 3;
export const DEMO_DEFAULT_QUALIFIER_PROBLEM_COUNT = 6;
export const DEMO_DEFAULT_FINALS_PROBLEM_COUNT = 4;

export type DemoSeedCategory = {
  id: string;
  gender_division: string;
  age_group: string;
  display_name: string;
  sort_order?: number | null;
};

export type DemoAthleteSeed = {
  name: string;
  climberNumber: string;
  province: string;
  seedIndex: number;
  category: DemoSeedCategory;
  skill: number;
};

export type DemoQualifierScoreSeed = {
  competitionId: string;
  roundId: string;
  roundIndex: number;
  roundType?: string | null;
  climber: Pick<DemoAthleteSeed, "climberNumber" | "seedIndex" | "skill">;
  climbNumber: number;
  problemCount: number;
};

export type DemoFinalScoreSeed = {
  competitionId: string;
  roundId: string;
  climberId: string;
  qualifierRank?: number | null;
  climbingOrder?: number | null;
  finalistIndex: number;
  climbNumber: number;
  problemCount: number;
};

const FIRST_NAMES = [
  "Avery",
  "Amelia",
  "Aria",
  "Austin",
  "Beatrice",
  "Ben",
  "Brooke",
  "Camille",
  "Charlie",
  "Chloe",
  "Cole",
  "Dylan",
  "Emmett",
  "Eva",
  "Felix",
  "Georgia",
  "Grace",
  "Hannah",
  "Harper",
  "Isaac",
  "Isla",
  "Jasper",
  "Jordan",
  "Julian",
  "Keira",
  "Logan",
  "Maya",
  "Maeve",
  "Malik",
  "Noah",
  "Olivia",
  "Quinn",
  "Sofia",
  "Liam",
  "Iris",
  "Eli",
  "Nora",
  "Theo",
  "Clara",
  "Kai",
  "Mila",
  "Owen",
  "Zoe",
  "Miles",
  "Jade",
  "Leo",
  "Sadie",
  "Finn",
  "Ruby",
  "Rowan",
  "Elena",
  "Caleb",
  "Tessa",
  "Layla",
  "Ari",
  "Riley",
  "Sam",
  "Mason",
  "Piper",
  "Wyatt",
  "Naomi",
  "Ethan",
  "Freya",
  "Nathan",
  "Mia",
  "Lucas",
  "Ella",
  "Jonah",
  "Vivian",
  "Oscar",
  "Audrey",
  "Henry",
  "Luna",
  "Mateo",
  "Sienna",
  "Hugo",
  "Aisha",
  "Declan",
  "Molly",
  "Carter",
  "Anika",
  "Simon",
  "Claire",
  "Evan",
  "Leah",
  "Rafael",
  "Maren",
  "Gavin",
  "Priya",
  "Xavier",
  "Elise",
  "Micah",
  "Anya",
  "Connor",
  "Lydia",
  "Juliette",
  "Marcus",
  "Nadia",
  "Adam",
  "Celia",
];

const LAST_NAMES = [
  "Chen",
  "Anderson",
  "Bouchard",
  "Brown",
  "Bryant",
  "Clarke",
  "Coleman",
  "Cote",
  "Davis",
  "Desrosiers",
  "Evans",
  "Fleming",
  "Gagnon",
  "Garcia",
  "Gillis",
  "Harris",
  "Henderson",
  "Hill",
  "Ivanov",
  "Johnson",
  "Kim",
  "King",
  "Lam",
  "Laurent",
  "Lewis",
  "Li",
  "MacLeod",
  "MacDonald",
  "Marshall",
  "Patel",
  "Nguyen",
  "Singh",
  "Martin",
  "Leblanc",
  "Kaur",
  "Wilson",
  "Roy",
  "Murphy",
  "Grant",
  "Young",
  "Foster",
  "Taylor",
  "Campbell",
  "Ahmed",
  "Bennett",
  "Carter",
  "Fraser",
  "Morris",
  "Reid",
  "Thomas",
  "Walker",
  "Wang",
  "Watson",
  "White",
  "Williams",
  "Wong",
  "Wood",
  "Yamada",
  "Zhang",
  "Morin",
  "Nielsen",
  "Park",
  "Peters",
  "Poirier",
  "Price",
  "Roberts",
  "Ross",
  "Santos",
  "Scott",
  "Sharma",
  "Silva",
  "Stewart",
  "Tremblay",
  "Turner",
  "Vargas",
  "Vega",
  "Villeneuve",
  "Wells",
  "West",
  "Yoon",
];

const PROVINCES = ["NS", "NB", "PE", "NL", "QC", "ON", "BC", "AB", "MB", "SK", "YT", "NT"];

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createDemoRandom(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function seededShuffle<T>(items: T[], seed: string) {
  const rng = createDemoRandom(seed);
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function getDemoFieldSize(categoryCount: number) {
  return Math.min(
    DEMO_MAX_FIELD_SIZE,
    Math.max(DEMO_MIN_FIELD_SIZE, categoryCount * DEMO_ATHLETES_PER_CATEGORY)
  );
}

function getAttemptCount(raw: number) {
  return clamp(Math.round(raw), 1, 5);
}

function buildName(firstNames: string[], lastNames: string[], index: number) {
  const lastNameIndex = (index * 17 + Math.floor(index / firstNames.length)) % lastNames.length;
  return `${firstNames[index % firstNames.length]} ${lastNames[lastNameIndex]}`;
}

export function createDemoAthleteSeeds({
  competitionId,
  categories,
  fieldSize,
}: {
  competitionId: string;
  categories: DemoSeedCategory[];
  fieldSize?: number;
}) {
  const orderedCategories = [...categories].sort((left, right) => {
    const orderDiff = (left.sort_order ?? 0) - (right.sort_order ?? 0);
    return orderDiff || left.display_name.localeCompare(right.display_name);
  });

  if (!orderedCategories.length) {
    return [];
  }

  const targetFieldSize = clamp(fieldSize ?? getDemoFieldSize(orderedCategories.length), 10, DEMO_MAX_FIELD_SIZE);
  const firstNames = seededShuffle(FIRST_NAMES, `${competitionId}:first-names`);
  const lastNames = seededShuffle(LAST_NAMES, `${competitionId}:last-names`);
  const provinces = seededShuffle(PROVINCES, `${competitionId}:provinces`);
  const categoryCounts = new Map<string, number>();

  return Array.from({ length: targetFieldSize }, (_, index) => {
    const category = orderedCategories[index % orderedCategories.length];
    const categoryEntryIndex = categoryCounts.get(category.id) ?? 0;
    categoryCounts.set(category.id, categoryEntryIndex + 1);
    const rng = createDemoRandom(`${competitionId}:athlete:${index}`);
    const skill = clamp(0.93 - categoryEntryIndex * 0.047 + rng() * 0.07 - 0.035, 0.34, 0.97);

    return {
      name: buildName(firstNames, lastNames, index),
      climberNumber: String(101 + index),
      province: provinces[index % provinces.length],
      seedIndex: index,
      category,
      skill,
    };
  });
}

export function buildDemoTargetSeedScore() {
  return {
    attempt_count: 3,
    zone: true,
    topped: true,
    attempts_to_top: 3,
    attempts_to_zone: 1,
  };
}

export function buildDemoTargetCorrectScore() {
  return {
    attempt_count: 1,
    zone: true,
    topped: true,
    attempts_to_top: 1,
    attempts_to_zone: 1,
  };
}

export function buildDemoQualifierScore({
  competitionId,
  roundId,
  roundIndex,
  roundType,
  climber,
  climbNumber,
  problemCount,
}: DemoQualifierScoreSeed) {
  if (
    roundIndex === 0 &&
    climber.climberNumber === DEMO_TARGET_CLIMBER_NUMBER &&
    climbNumber === DEMO_TARGET_CLIMB_NUMBER
  ) {
    return buildDemoTargetSeedScore();
  }

  const rng = createDemoRandom(`${competitionId}:${roundId}:${climber.climberNumber}:${climbNumber}`);
  const normalizedClimb = problemCount > 1 ? (climbNumber - 1) / (problemCount - 1) : 0;
  const semifinalPenalty = roundType === "semifinal" || roundIndex > 0 ? 0.09 : 0;
  const difficulty = 0.32 + normalizedClimb * 0.44 + semifinalPenalty + (rng() - 0.5) * 0.1;
  const skillEdge = climber.skill - difficulty;
  const topProbability = clamp(0.34 + skillEdge * 1.28, 0.03, 0.92);
  const zoneProbability = clamp(0.64 + skillEdge * 1.12, 0.1, 0.98);
  const topped = rng() < topProbability;
  const zone = topped || rng() < zoneProbability;

  if (!topped && !zone) {
    return {
      attempt_count: 0,
      zone: false,
      topped: false,
      attempts_to_top: null,
      attempts_to_zone: null,
    };
  }

  const attemptsToTop = topped ? getAttemptCount(1 + (difficulty - climber.skill + 0.28) * 4.8 + rng() * 2.1) : null;
  const attemptsToZone = zone
    ? getAttemptCount(Math.min(attemptsToTop ?? 5, 1 + (difficulty - climber.skill + 0.2) * 4.2 + rng() * 1.6))
    : null;
  const attemptCount = topped ? attemptsToTop ?? 1 : attemptsToZone ?? 1;

  return {
    attempt_count: attemptCount,
    zone,
    topped,
    attempts_to_top: attemptsToTop,
    attempts_to_zone: attemptsToZone,
  };
}

export function buildDemoFinalScore({
  competitionId,
  roundId,
  climberId,
  qualifierRank,
  climbingOrder,
  finalistIndex,
  climbNumber,
  problemCount,
}: DemoFinalScoreSeed) {
  const rng = createDemoRandom(`${competitionId}:${roundId}:${climberId}:${climbNumber}:finals`);
  const rank = Math.max(1, qualifierRank ?? finalistIndex + 1);
  const orderBoost = Math.max(0, (climbingOrder ?? finalistIndex + 1) - 1) * 0.01;
  const rankSkill = clamp(0.9 - (rank - 1) * 0.035 + orderBoost, 0.42, 0.94);
  const normalizedClimb = problemCount > 1 ? (climbNumber - 1) / (problemCount - 1) : 0;
  const difficulty = 0.52 + normalizedClimb * 0.25 + (rng() - 0.5) * 0.08;
  const skillEdge = rankSkill - difficulty;
  const top = rng() < clamp(0.38 + skillEdge * 1.2, 0.06, 0.88);
  const zone = top || rng() < clamp(0.72 + skillEdge * 1.05, 0.18, 0.98);
  const attemptsToTop = top ? getAttemptCount(1.1 + (difficulty - rankSkill + 0.25) * 5 + rng() * 1.5) : null;
  const attemptsToZone = zone
    ? getAttemptCount(Math.min(attemptsToTop ?? 5, 1 + (difficulty - rankSkill + 0.18) * 4 + rng() * 1.2))
    : null;

  return {
    top,
    zone,
    attempts_to_top: attemptsToTop,
    attempts_to_zone: attemptsToZone,
  };
}
