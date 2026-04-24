import { describe, expect, it } from "vitest";

import { parseUsaClimbingEvents, parseWorldClimbingEvents } from "./official-events";

describe("parseWorldClimbingEvents", () => {
  it("reads current world climbing series cards from the live calendar format", () => {
    const html = `
      <div>Season 2026</div>
      <div class="card__event-horizontal">
        <div class="card__container">
          <span class="d3-ty-caption-large font-semibold">01-03</span>
          <span class="d3-ty-caption font-semibold">May 2026</span>
          <div class="uppercase d3-ty-tag-large text-purple">boulder</div>
          <a aria-label="World Climbing Series Keqiao 2026" href="https://www.ifsc-climbing.org/events/world-climbing-series-keqiao-2026/">
            <h4>World Climbing Series Keqiao 2026</h4>
          </a>
          <span class="d3-ty-body-small text-navy-dark"><svg></svg>Keqiao, China</span>
          <div class="flex flex-row gap-6">
            <a title="Info sheet" href="https://ifsc.results.info/events/1524/infosheet">Info sheet</a>
            <a title="Registrations" href="https://ifsc.results.info/event/1524/registrations">Registrations</a>
          </div>
        </div>
      </div>
      <div class="card__event-horizontal">
        <div class="card__container">
          <span class="d3-ty-caption-large font-semibold">08-10</span>
          <span class="d3-ty-caption font-semibold">May 2026</span>
          <div class="uppercase d3-ty-tag-large text-purple">lead speed</div>
          <a aria-label="World Climbing Series Wujiang 2026" href="https://www.ifsc-climbing.org/events/world-climbing-series-wujiang-2026/">
            <h4>World Climbing Series Wujiang 2026</h4>
          </a>
          <span class="d3-ty-body-small text-navy-dark"><svg></svg>Wujiang, China</span>
        </div>
      </div>
    `;

    expect(parseWorldClimbingEvents(html)).toEqual([
      expect.objectContaining({
        title: "World Climbing Series Keqiao 2026",
        location: "Keqiao, China",
        start_date: "2026-05-01",
        end_date: "2026-05-03",
        official_schedule_url: "https://ifsc.results.info/events/1524/infosheet",
        official_registration_url: "https://ifsc.results.info/event/1524/registrations",
      }),
    ]);
  });
});

describe("parseUsaClimbingEvents", () => {
  it("keeps NACS bouldering events and ignores non-boulder stops", () => {
    const html = `
      <li>
        <a class="uk-accordion-title uk-accordion-title--event">
          <h3>North American Cup Bridgeport (Lead & Speed)</h3>
          <h3 class="uk-text-light">April 25–26, 2026 in Bridgeport, PA, USA</h3>
        </a>
      </li>
      <li>
        <a class="uk-accordion-title uk-accordion-title--event">
          <h3>North American Cup (Boulder)</h3>
          <h3 class="uk-text-light">May 2–3, 2026 in Québec City, Canada</h3>
        </a>
        <div class="uk-accordion-content uk-accordion-content--event">
          <a class="icon-tile uk-link-reset in-event-accordion" href="https://delireescalade.com/">
            <h4>Location: Délire Escalade – Ste-Foy</h4>
          </a>
          <a class="icon-tile uk-link-reset in-event-accordion" href="https://example.com/register">
            <h4>Athlete Registration</h4>
          </a>
          <a class="icon-tile uk-link-reset in-event-accordion" href="https://example.com/schedule">
            <h4>Schedule</h4>
          </a>
        </div>
      </li>
    `;

    expect(parseUsaClimbingEvents(html)).toEqual([
      expect.objectContaining({
        title: "North American Cup (Boulder)",
        location: "Québec City, Canada",
        start_date: "2026-05-02",
        end_date: "2026-05-03",
        official_registration_url: "https://example.com/register",
        official_schedule_url: "https://example.com/schedule",
      }),
    ]);
  });
});
