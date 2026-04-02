export interface OfficialEvent {
  id: string;
  title: string;
  series: string;
  location: string;
  disciplines: string;
  start_date: string;
  end_date: string;
  description: string;
  source_name: string;
  source_url: string;
}

const WORLD_CLIMBING_SOURCE_URL =
  "https://www.worldclimbing.com/news/ifsc-announces-climbing-and-para-climbing-calendar-2026";
const CEC_SOURCE_URL =
  "https://climbingcanada.ca/climbing-escalade-canada-usa-climbing-announce-the-2026-north-american-cup-series-calendar/";

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractVisibleText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function monthNumber(month: string) {
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  return months.indexOf(month.toLowerCase()) + 1;
}

function formatIsoDate(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function parseWorldClimbingDateRange(range: string, year: number) {
  const match = range.match(/^(\d{1,2})-(\d{1,2}) ([A-Za-z]+)$/);
  if (!match) {
    return null;
  }

  const [, startDayRaw, endDayRaw, monthRaw] = match;
  const month = monthNumber(monthRaw);
  if (!month) {
    return null;
  }

  return {
    start_date: formatIsoDate(year, month, Number(startDayRaw)),
    end_date: formatIsoDate(year, month, Number(endDayRaw)),
  };
}

function parseNamedDateRange(range: string) {
  const match = range.match(/^([A-Za-z]+) (\d{1,2})[–-](\d{1,2}), (\d{4})$/);
  if (!match) {
    return null;
  }

  const [, monthRaw, startDayRaw, endDayRaw, yearRaw] = match;
  const month = monthNumber(monthRaw);
  if (!month) {
    return null;
  }

  const year = Number(yearRaw);
  return {
    start_date: formatIsoDate(year, month, Number(startDayRaw)),
    end_date: formatIsoDate(year, month, Number(endDayRaw)),
  };
}

async function fetchSourceText(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "ScorecardOfficialEvents/1.0",
    },
    next: { revalidate: 21600 },
  });

  if (!response.ok) {
    throw new Error(`Unable to load official events from ${url}.`);
  }

  return extractVisibleText(await response.text());
}

function parseWorldClimbingEvents(text: string): OfficialEvent[] {
  const marker = "The provisional calendar of Climbing and Para Climbing events in 2026 is as follows:";
  const startIndex = text.indexOf(marker);
  if (startIndex < 0) {
    return [];
  }

  const section = text.slice(startIndex + marker.length);
  const pattern =
    /(\d{1,2}-\d{1,2} [A-Za-z]+)\s+(Climbing World Cup)\s+([A-Za-z .'-]+?)\s+\(([A-Z]{3})\)\s+([A-Za-z, ]+?)(?=\s+\d{1,2}-\d{1,2} [A-Za-z]+\s+(?:Climbing World Cup|Para Climbing World Cup|Climbing Youth World Championships)|\s+After being|\s+A WELCOME RETURN|\s+CONSOLIDATED PRESENCE|$)/g;

  const events: OfficialEvent[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(section)) !== null) {
    const [, dateRange, eventType, location, countryCode, disciplines] = match;
    if (!disciplines.toLowerCase().includes("boulder")) {
      continue;
    }

    const parsedRange = parseWorldClimbingDateRange(dateRange, 2026);
    if (!parsedRange) {
      continue;
    }

    events.push({
      id: `world-climbing-${slugify(location)}-${parsedRange.start_date}`,
      title: `${eventType} - ${location}`,
      series: "World Climbing",
      location: `${location} (${countryCode})`,
      disciplines: disciplines.trim(),
      description: `${eventType} in ${location} featuring ${disciplines.trim().toLowerCase()}, as listed on the official World Climbing 2026 calendar.`,
      source_name: "World Climbing 2026 calendar",
      source_url: WORLD_CLIMBING_SOURCE_URL,
      ...parsedRange,
    });
  }

  return events;
}

function parseCecEvents(text: string): OfficialEvent[] {
  const marker = "2026 NORTH AMERICAN CUP SERIES CALENDAR";
  const startIndex = text.indexOf(marker);
  if (startIndex < 0) {
    return [];
  }

  const section = text.slice(startIndex + marker.length);
  const pattern =
    /NACS\s+[–-]\s+([A-Za-z &]+)\s+([A-Za-z]+ \d{1,2}[–-]\d{1,2}, \d{4})\s+(.+?)(?=\s+(?:Hosted by|Part of)|\s+NACS\s+[–-]|\s+A Continental Stage|$)/g;

  const events: OfficialEvent[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(section)) !== null) {
    const [, disciplines, dateRange, location] = match;
    if (!disciplines.toLowerCase().includes("boulder")) {
      continue;
    }

    const parsedRange = parseNamedDateRange(dateRange);
    if (!parsedRange) {
      continue;
    }

    events.push({
      id: `cec-nacs-${slugify(location)}-${parsedRange.start_date}`,
      title: `NACS - ${disciplines.trim()}`,
      series: "North American Cup Series",
      location: location.trim(),
      disciplines: disciplines.trim(),
      description:
        `Part of the official 2026 North American Cup Series calendar. The series is run by Climbing Escalade Canada and USA Climbing to provide high-level competition opportunities across North America.`,
      source_name: "Climbing Escalade Canada / USA Climbing 2026 NACS calendar",
      source_url: CEC_SOURCE_URL,
      ...parsedRange,
    });
  }

  return events;
}

export async function fetchOfficialBoulderingEvents() {
  const [worldClimbingText, cecText] = await Promise.all([
    fetchSourceText(WORLD_CLIMBING_SOURCE_URL),
    fetchSourceText(CEC_SOURCE_URL),
  ]);

  return [...parseWorldClimbingEvents(worldClimbingText), ...parseCecEvents(cecText)].sort((left, right) =>
    left.start_date.localeCompare(right.start_date)
  );
}
