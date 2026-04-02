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

const WORLD_CLIMBING_SOURCE_URL =
  "https://www.worldclimbing.com/news/ifsc-announces-climbing-and-para-climbing-calendar-2026";
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

function extractVisibleText(html: string) {
  return normalizeWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
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

function buildWorldClimbingEventUrl(location: string, year: number) {
  return `https://www.worldclimbing.com/events/world-climbing-series-${slugify(location)}-${year}`;
}

function parseWorldClimbingEvents(html: string): OfficialEvent[] {
  const text = extractVisibleText(html);
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

    const officialEventUrl = buildWorldClimbingEventUrl(location, 2026);

    events.push({
      id: `world-climbing-${slugify(location)}-${parsedRange.start_date}`,
      title: `${eventType} - ${location}`,
      series: "World Climbing",
      location: `${location}, ${countryCode}`,
      disciplines: disciplines.trim(),
      description: `${eventType} in ${location} featuring ${disciplines
        .trim()
        .toLowerCase()}, as listed on the official World Climbing calendar.`,
      source_name: "World Climbing 2026 calendar",
      source_url: WORLD_CLIMBING_SOURCE_URL,
      official_event_url: officialEventUrl,
      official_registration_url: "",
      official_schedule_url: officialEventUrl,
      registration_opens_at: null,
      registration_closes_at: null,
      hero_image_url: "",
      ...parsedRange,
    });
  }

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

function parseUsaClimbingEvents(html: string): OfficialEvent[] {
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
