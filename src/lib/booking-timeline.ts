/**
 * When to book each part of a trip, what to sort out before leaving, and the trip
 * as a calendar file. Pure, so the timing rules are tested.
 *
 * The "book by" dates are rules of thumb (when fares and rooms usually stop getting
 * better, when timed tickets sell out), not promises; the page says so.
 */
import type { BookingItem, BookingLink, BookingRecord } from "./booking";
import { addDays, formatCalendarDate, isIsoDate } from "./dates";

export type Urgency = "overdue" | "now" | "soon" | "later";

export interface BookBy {
  /** Book on or before this day (YYYY-MM-DD) */
  by: string;
  why: string;
  urgency: Urgency;
}

export interface TimelineContext {
  today: string;
  startDate: string;
  /** Leaving the traveler's country */
  abroad: boolean;
  /** The destination country (ISO), for rail and entry rules */
  country: string;
}

const RAIL_AHEAD = new Set(["GB", "FR", "ES", "IT", "DE", "NL", "BE", "CH", "AT", "JP", "PT"]);

/** Days before the trip to book, and the reason, by kind. */
function leadTime(item: BookingItem, c: TimelineContext): [number, string] {
  switch (item.kind) {
    case "flight":
      return c.abroad
        ? [60, "International fares are usually best 2 to 6 months out."]
        : [28, "Domestic fares usually climb in the last 3 to 4 weeks."];
    case "hotel":
      return [30, "Pick a refundable rate now; popular places fill up in the last month."];
    case "cruise":
      return [120, "The best cabins go early, and final payment is often due about 90 days out."];
    case "car":
      return item.key === "transfer"
        ? [1, "Book the ride the day before, or use transit."]
        : [14, "Reserve with free cancellation, then rebook if the price drops."];
    case "rail":
      return RAIL_AHEAD.has(c.country)
        ? [30, "Advance train fares are much cheaper and open a few months out."]
        : [14, "Saver fares sell out closer to the date."];
    case "bus":
      return [7, "Cheapest seats go first."];
    case "parking":
      return [7, "Prebooked parking is usually cheaper than the gate rate."];
    case "tickets":
      return [14, "Timed-entry tickets and tours often sell out a couple of weeks ahead."];
    case "dining":
      return [14, "Popular restaurants open reservations about 2 to 4 weeks ahead."];
    default:
      return [14, ""];
  }
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** When to book one item. Never later than the day before the trip, never before today. */
export function bookBy(item: BookingItem, c: TimelineContext): BookBy {
  const [lead, why] = leadTime(item, c);
  let by = addDays(c.startDate, -lead);
  const latest = addDays(c.startDate, -1);
  if (by > latest) by = latest;
  const left = daysBetween(c.today, by);
  const urgency: Urgency = left < 0 ? "overdue" : left <= 7 ? "now" : left <= 30 ? "soon" : "later";
  return { by: left < 0 ? c.today : by, why, urgency };
}

export interface TimelineGroup {
  key: Urgency | "done";
  label: string;
  items: { item: BookingItem; when: BookBy | null }[];
}

const LABEL: Record<TimelineGroup["key"], string> = {
  overdue: "Book now",
  now: "Book this week",
  soon: "Book this month",
  later: "Later",
  done: "Done",
};

/** The checklist grouped by when to act: what's due first, then later, then done. */
export function bookingTimeline(
  items: readonly BookingItem[],
  records: Record<string, BookingRecord>,
  c: TimelineContext,
): TimelineGroup[] {
  const groups = new Map<TimelineGroup["key"], TimelineGroup>();
  const order: TimelineGroup["key"][] = ["overdue", "now", "soon", "later", "done"];
  for (const k of order) groups.set(k, { key: k, label: LABEL[k], items: [] });
  for (const item of items) {
    const status = records[item.key]?.status;
    if (status === "booked" || status === "skipped") {
      groups.get("done")!.items.push({ item, when: null });
      continue;
    }
    const when = bookBy(item, c);
    groups.get(when.urgency)!.items.push({ item, when });
  }
  for (const g of groups.values())
    g.items.sort((a, b) => (a.when?.by ?? "").localeCompare(b.when?.by ?? ""));
  // "Book now" and "this week" read as one group when both are there.
  const now = groups.get("overdue")!;
  now.items.push(...groups.get("now")!.items);
  groups.get("now")!.items = [];
  return order.map((k) => groups.get(k)!).filter((g) => g.items.length);
}

export interface PrepItem {
  key: string;
  title: string;
  detail: string;
  links: BookingLink[];
  optional: boolean;
}

export interface PrepContext {
  startDate: string;
  endDate: string;
  /** ISO countries: where they live and where they're going */
  homeCountry: string;
  destCountry: string;
  destName: string;
  /** The destination country's name ("Italy"), for the entry-rules line */
  destCountryName?: string;
  tripType: string;
  transportMode: string;
  /** The trip's total budget, to suggest insurance for big trips */
  totalBudget: number;
}

const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

/** What to sort out before leaving, beyond bookings: passports, entry rules, insurance, phones. */
export function prepChecklist(c: PrepContext): PrepItem[] {
  const out: PrepItem[] = [];
  const abroad = !!c.destCountry && !!c.homeCountry && c.destCountry !== c.homeCountry;
  const day = (iso: string) =>
    formatCalendarDate(iso, { month: "short", day: "numeric", year: "numeric" });
  const where = c.destCountryName || c.destName.split(",").at(-1)!.trim() || c.destName;
  if (abroad) {
    const valid = isIsoDate(c.endDate) ? addDays(c.endDate, 183) : "";
    out.push({
      key: "prep-passport",
      title: "Check your passports",
      detail: `Many countries want a passport valid 6 months past your return${valid ? `, so through ${day(valid)}` : ""}. Renewals can take weeks.`,
      links:
        c.homeCountry === "US"
          ? [
              {
                label: "Passport help",
                url: "https://travel.state.gov/content/travel/en/passports.html",
              },
            ]
          : [{ label: "Passport help", url: google("renew passport") }],
      optional: false,
    });
    out.push({
      key: "prep-entry",
      title: `Entry rules for ${where}`,
      detail:
        "Check visas, electronic travel permits and any health rules before you book flights.",
      links:
        c.homeCountry === "US"
          ? [
              {
                label: "Country information",
                url: "https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages.html",
              },
            ]
          : [{ label: "Entry rules", url: google(`${where} entry requirements visa`) }],
      optional: false,
    });
    out.push({
      key: "prep-phone",
      title: "Phone and data abroad",
      detail: "Check your plan's international rates, or get a local or eSIM data plan.",
      links: [{ label: "Compare eSIMs", url: google(`esim ${where} travel data`) }],
      optional: true,
    });
    out.push({
      key: "prep-money",
      title: "Cards and cash",
      detail: "Use a card without foreign transaction fees and tell your bank you're traveling.",
      links: [],
      optional: true,
    });
    if (c.transportMode === "rental-car")
      out.push({
        key: "prep-driving",
        title: "Driving permit",
        detail: "Some countries require an International Driving Permit alongside your license.",
        links: [{ label: "About permits", url: google(`international driving permit ${where}`) }],
        optional: true,
      });
  }
  if (abroad || c.tripType === "cruise" || c.totalBudget >= 3000)
    out.push({
      key: "prep-insurance",
      title: "Travel insurance",
      detail:
        c.tripType === "cruise"
          ? "Worth a look for cruises: missed departures and medical care at sea are expensive."
          : "Worth a look for trips abroad or with big prepaid costs; check what your card already covers.",
      links: [{ label: "Compare plans", url: google("compare travel insurance") }],
      optional: true,
    });
  return out;
}

// --- Calendar (iCalendar, RFC 5545) ---

const icsDate = (iso: string) => iso.replace(/-/g, "");
const icsText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold long lines at 75 octets, as the format requires. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curLen = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (curLen + len > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export interface CalendarEvent {
  uid: string;
  /** All-day: first day and the day after the last (exclusive), YYYY-MM-DD */
  start: string;
  end: string;
  title: string;
  description?: string;
  url?: string;
}

/** An .ics file any calendar app opens: the trip, and a reminder for each "book by" date. */
export function toICalendar(events: readonly CalendarEvent[], stamp: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Waypoint//Trip planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.start)}`,
      `DTEND;VALUE=DATE:${icsDate(e.end)}`,
      `SUMMARY:${icsText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** The trip and its open bookings as calendar events. */
export function tripCalendar(opts: {
  tripId: string;
  title: string;
  startDate: string;
  endDate: string;
  groups: readonly TimelineGroup[];
}): CalendarEvent[] {
  const id = opts.tripId.replace(/[^a-zA-Z0-9-]/g, "") || "trip";
  const events: CalendarEvent[] = [
    {
      uid: `${id}-trip@waypoint`,
      start: opts.startDate,
      end: addDays(opts.endDate, 1),
      title: opts.title,
      description: "Planned with Waypoint.",
    },
  ];
  for (const g of opts.groups) {
    if (g.key === "done") continue;
    for (const { item, when } of g.items) {
      if (!when) continue;
      events.push({
        uid: `${id}-${item.key.replace(/[^a-zA-Z0-9-]/g, "")}@waypoint`,
        start: when.by,
        end: addDays(when.by, 1),
        title: `Book: ${item.title}`,
        description: [item.detail, when.why].filter(Boolean).join("\n"),
        ...(item.links[0] ? { url: item.links[0].url } : {}),
      });
    }
  }
  return events;
}
