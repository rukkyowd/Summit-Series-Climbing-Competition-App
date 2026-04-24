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
  official_event_url: string;
  official_registration_url: string;
  official_schedule_url: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  hero_image_url: string;
}

const WORLD_CLIMBING_SOURCE_URL = "https://www.worldclimbing.com/calendar/index";
const USA_CLIMBING_NACS_URL = "https://usaclimbing.org/compete/north-american-cup-series/";

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#8211;|&#x2013;|&ndash;/gi, "\u2013")
    .replace(/&#8212;|&#x2014;|&mdash;/gi, "\u2014")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function repairMojibake(value: string) {
  if (!/Ã|Â|â/.test(value)) {
    return value;
  }

  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

function stripTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "));
}

function normalizeWhitespace(value: string) {
  return repairMojibake(value).replace(/\s+/g, " ").trim();
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

function parseNamedDateRange(range: string) {
  const normalized = normalizeWhitespace(range.replace(/[\u2013\u2014-]/g, "\u2013"));
  const match = normalized.match(/^([A-Za-z]+) (\d{1,2})\u2013(\d{1,2}), (\d{4})$/);
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

function absolutizeUrl(baseUrl: string, href: string) {
  if (!href) {
    return "";
  }

  try {
    return new URL(decodeHtmlEntities(href), baseUrl).toString();
  } catch {
    return decodeHtmlEntities(href);
  }
}

async function fetchSourceHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "ScorecardOfficialEvents/1.0",
    },
    next: { revalidate: 21600 },
  });

  if (!response.ok) {
    throw new Error(`Unable to load official events from ${url}.`);
  }

  return response.text();
}

function extractWorldClimbingSeasonYear(html: string) {
  const seasonMatch = html.match(/Season (\d{4})/i);
  if (seasonMatch) {
    return Number(seasonMatch[1]);
  }

  const datedMonthMatch = html.match(
    /<span class="d3-ty-caption[^"]*">([A-Za-z]+)\s+(\d{4})<\/span>/i
  );
  if (datedMonthMatch) {
    return Number(datedMonthMatch[2]);
  }

  return new Date().getFullYear();
}

function parseCalendarCardDateRange(dayLabel: string, monthLabel: string, fallbackYear: number) {
  const normalizedDay = normalizeWhitespace(dayLabel);
  const normalizedMonth = normalizeWhitespace(monthLabel);
  const monthMatch = normalizedMonth.match(/^([A-Za-z]+)(?:\s+(\d{4}))?$/);
  const dayMatch = normalizedDay.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!monthMatch || !dayMatch) {
    return null;
  }

  const [, monthRaw, yearRaw] = monthMatch;
  const [, startDayRaw, endDayRaw] = dayMatch;
  const month = monthNumber(monthRaw);
  if (!month) {
    return null;
  }

  const year = yearRaw ? Number(yearRaw) : fallbackYear;
  const startDay = Number(startDayRaw);
  const endDay = endDayRaw ? Number(endDayRaw) : startDay;

  return {
    start_date: formatIsoDate(year, month, startDay),
    end_date: formatIsoDate(year, month, endDay),
  };
}

export function parseWorldClimbingEvents(html: string): OfficialEvent[] {
  const fallbackYear = extractWorldClimbingSeasonYear(html);
  const cards = html.split('<div class="card__event-horizontal">').slice(1);

  const events: OfficialEvent[] = [];
  cards.forEach((card) => {
    const titleMatch = card.match(
      /<a aria-label="([^"]+)" href="([^"]+)">\s*<h4[^>]*>([^<]+)<\/h4>\s*<\/a>/i
    );
    const dateMatch = card.match(
      /<span class="d3-ty-caption-large[^>]*">([^<]+)<\/span>\s*<span class="d3-ty-caption[^>]*">([^<]+)<\/span>/i
    );
    const disciplineMatch = card.match(/<div class="uppercase[^>]*">([^<]+)<\/div>/i);
    const locationMatch = card.match(/<span class="d3-ty-body-small[^>]*">[\s\S]*?<\/svg>([^<]+)<\/span>/i);
    if (!titleMatch || !dateMatch || !disciplineMatch || !locationMatch) {
      return;
    }

    const [, , href, rawTitle] = titleMatch;
    const [, rawDayLabel, rawMonthLabel] = dateMatch;
    const [, rawDisciplines] = disciplineMatch;
    const [, rawLocation] = locationMatch;

    const title = normalizeWhitespace(stripTags(rawTitle));
    const disciplines = normalizeWhitespace(stripTags(rawDisciplines));
    const location = normalizeWhitespace(stripTags(rawLocation));
    if (!/^World Climbing Series\b/i.test(title) || !disciplines.toLowerCase().includes("boulder")) {
      return;
    }

    const parsedRange = parseCalendarCardDateRange(rawDayLabel, rawMonthLabel, fallbackYear);
    if (!parsedRange) {
      return;
    }

    const infoSheetUrl = absolutizeUrl(
      WORLD_CLIMBING_SOURCE_URL,
      card.match(/<a title="Info sheet"[^>]*href="([^"]+)"/i)?.[1] ?? ""
    );
    const registrationUrl = absolutizeUrl(
      WORLD_CLIMBING_SOURCE_URL,
      card.match(/<a title="Registrations"[^>]*href="([^"]+)"/i)?.[1] ?? ""
    );
    const officialEventUrl = absolutizeUrl(WORLD_CLIMBING_SOURCE_URL, href);

    events.push({
      id: `world-climbing-${slugify(location)}-${parsedRange.start_date}`,
      title,
      series: "World Climbing",
      location,
      disciplines,
      description: `${title} in ${location} featuring ${disciplines.toLowerCase()}, as listed on the live World Climbing calendar.`,
      source_name: "World Climbing live calendar",
      source_url: WORLD_CLIMBING_SOURCE_URL,
      official_event_url: officialEventUrl,
      official_registration_url: registrationUrl,
      official_schedule_url: infoSheetUrl || officialEventUrl,
      registration_opens_at: null,
      registration_closes_at: null,
      hero_image_url: "",
      ...parsedRange,
    });
  });

  return events;
}

function extractAnchorHrefs(segment: string) {
  const anchors = new Map<string, string>();
  const anchorPattern =
    /<a[^>]*class="[^"]*icon-tile[^"]*"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(segment)) !== null) {
    const [, href, labelHtml] = match;
    const label = normalizeWhitespace(stripTags(labelHtml));
    if (!label) {
      continue;
    }

    anchors.set(label, absolutizeUrl(USA_CLIMBING_NACS_URL, href));
  }

  return anchors;
}

function extractUsaClimbingHeroImage(segment: string) {
  const heroMatch =
    segment.match(/data-src="([^"]+\.(?:jpg|jpeg|png|webp))"/i) ??
    segment.match(/src="([^"]+\.(?:jpg|jpeg|png|webp))"/i);
  return heroMatch?.[1] ?? "";
}

function findUsaClimbingLocationUrl(anchors: Map<string, string>) {
  for (const [label, href] of Array.from(anchors.entries())) {
    if (label.toLowerCase().startsWith("location:")) {
      return href;
    }
  }

  return "";
}

export function parseUsaClimbingEvents(html: string): OfficialEvent[] {
  const sectionPattern = /<li>\s*<a class="uk-accordion-title uk-accordion-title--event"[\s\S]*?<\/li>/gi;

  const events: OfficialEvent[] = [];
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(html)) !== null) {
    const segment = match[0];
    const title = normalizeWhitespace(stripTags(segment.match(/<h3>([^<]+)<\/h3>/i)?.[1] ?? ""));
    const dateAndLocation = normalizeWhitespace(
      stripTags(segment.match(/<h3 class="uk-text-light">([^<]+)<\/h3>/i)?.[1] ?? "").replace(
        /[\u2013\u2014-]/g,
        "\u2013"
      )
    );
    const dateMatch = dateAndLocation.match(/^([A-Za-z]+ \d{1,2}\u2013\d{1,2}, \d{4}) in (.+)$/);
    const disciplineMatch = title.match(/\(([^)]+)\)/);
    const disciplines = disciplineMatch?.[1]?.trim() ?? "";
    if (!disciplines.toLowerCase().includes("boulder")) {
      continue;
    }

    if (!dateMatch) {
      continue;
    }

    const parsedRange = parseNamedDateRange(dateMatch[1]);
    if (!parsedRange) {
      continue;
    }

    const location = dateMatch[2].trim();
    const anchors = extractAnchorHrefs(segment);
    const heroImageUrl = extractUsaClimbingHeroImage(segment);
    const locationUrl = findUsaClimbingLocationUrl(anchors);
    const infoSheetUrl = anchors.get("Info Sheet") ?? "";
    const registrationUrl = anchors.get("Athlete Registration") ?? "";
    const scheduleUrl = anchors.get("Schedule") ?? "";
    const resultsUrl = anchors.get("Registered Athletes/Results") ?? "";
    const officialEventUrl = infoSheetUrl || locationUrl || resultsUrl || scheduleUrl || USA_CLIMBING_NACS_URL;

    events.push({
      id: `nacs-${slugify(location)}-${parsedRange.start_date}`,
      title,
      series: "North American Cup Series",
      location,
      disciplines,
      description:
        "Part of the official North American Cup Series calendar. This event is published by USA Climbing and may include separate registration and schedule resources on the official event page.",
      source_name: "USA Climbing North American Cup Series",
      source_url: USA_CLIMBING_NACS_URL,
      official_event_url: officialEventUrl,
      official_registration_url: registrationUrl,
      official_schedule_url: scheduleUrl || infoSheetUrl || officialEventUrl,
      registration_opens_at: null,
      registration_closes_at: null,
      hero_image_url: heroImageUrl,
      ...parsedRange,
    });
  }

  return events;
}

function mergeOfficialEvents(primary: OfficialEvent[], secondary: OfficialEvent[]) {
  const merged = new Map<string, OfficialEvent>();

  [...primary, ...secondary].forEach((event) => {
    const key = `${event.start_date}:${slugify(event.location)}:${slugify(event.disciplines)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, event);
      return;
    }

    merged.set(key, {
      ...existing,
      description: existing.description || event.description,
      source_name: existing.source_name || event.source_name,
      source_url: existing.source_url || event.source_url,
      official_event_url: existing.official_event_url || event.official_event_url,
      official_registration_url: existing.official_registration_url || event.official_registration_url,
      official_schedule_url: existing.official_schedule_url || event.official_schedule_url,
      registration_opens_at: existing.registration_opens_at ?? event.registration_opens_at,
      registration_closes_at: existing.registration_closes_at ?? event.registration_closes_at,
      hero_image_url: existing.hero_image_url || event.hero_image_url,
    });
  });

  return Array.from(merged.values());
}

export async function fetchOfficialBoulderingEvents() {
  const [worldClimbingHtml, usaClimbingHtml] = await Promise.all([
    fetchSourceHtml(WORLD_CLIMBING_SOURCE_URL),
    fetchSourceHtml(USA_CLIMBING_NACS_URL),
  ]);

  return mergeOfficialEvents(parseWorldClimbingEvents(worldClimbingHtml), parseUsaClimbingEvents(usaClimbingHtml)).sort(
    (left, right) => left.start_date.localeCompare(right.start_date)
  );
}
