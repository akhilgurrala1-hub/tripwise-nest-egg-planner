/**
 * Turns a day's stops into a timed plan: start and end times, estimated travel between
 * stops, and warnings. Everything here is an estimate and says so: travel comes from the
 * straight-line distance between the places' published coordinates (never invented; a
 * stop with no coordinates simply has no travel estimate), and hours are only checked
 * when the source's text is plain enough to read.
 */
import { milesBetween } from "./catalog";
import type { ItineraryItem, SlotTime } from "./itinerary";

/** When each slot normally starts, in minutes after midnight. */
const SLOT_START: Record<SlotTime, number> = {
  Morning: 9 * 60,
  Lunch: 12 * 60 + 30,
  Afternoon: 14 * 60,
  Dinner: 19 * 60,
  Evening: 21 * 60,
};

/** A typical visit length in minutes (a rule of thumb, not data about the place). */
function visitMinutes(item: ItineraryItem): number {
  if (item.kind === "stop") return 30;
  if (item.kind === "restaurant") return item.time === "Lunch" ? 60 : 90;
  return 120;
}

/** Roads are longer than the straight line between two points. */
const ROAD_FACTOR = 1.3;
const WALK_MAX_MILES = 1;
const WALK_MIN_PER_MILE = 20;
const DRIVE_MPH = 25;

export interface Travel {
  mode: "walk" | "drive";
  minutes: number;
  /** Straight-line miles between the two places */
  miles: number;
}

export interface TimedStop {
  item: ItineraryItem;
  start: number;
  end: number;
  /** From the previous stop; null for the first stop or when either place has no coordinates */
  travel: Travel | null;
  warnings: string[];
}

export function travelBetween(a: ItineraryItem, b: ItineraryItem): Travel | null {
  if (a.lat === undefined || a.lon === undefined || b.lat === undefined || b.lon === undefined)
    return null;
  const miles = milesBetween({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon });
  const road = miles * ROAD_FACTOR;
  if (road <= WALK_MAX_MILES)
    return { mode: "walk", minutes: Math.max(1, Math.ceil(road * WALK_MIN_PER_MILE)), miles };
  return { mode: "drive", minutes: Math.ceil((road / DRIVE_MPH) * 60) + 5, miles };
}

const TIME = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;

/**
 * Daily opening and closing minutes from plain text like "Daily 9AM-5PM". Returns null for
 * anything with days, seasons or several ranges: better no check than a wrong one.
 */
export function plainHours(
  text: string | null | undefined,
): { open: number; close: number } | null {
  if (!text) return null;
  if (
    /[;,]|mo|tu|we|th|fr|sa|su(?!n)|closed|season|apr|may|jun|jul|aug|sep|oct|nov|dec|jan|feb|mar/i.test(
      text.replace(/daily|every day|sun-sat|mon-sun/gi, ""),
    )
  )
    return null;
  const times = [...text.matchAll(TIME)].map((m) => {
    let h = Number(m[1]) % 12;
    if (m[3]!.toLowerCase() === "pm") h += 12;
    return h * 60 + Number(m[2] ?? 0);
  });
  if (times.length !== 2 || times[1]! <= times[0]!) return null;
  return { open: times[0]!, close: times[1]! };
}

export function clock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The day, in order, with each stop starting at its slot or later if travel pushes it. */
export function scheduleDay(items: ItineraryItem[]): TimedStop[] {
  const out: TimedStop[] = [];
  let prev: TimedStop | null = null;
  for (const item of items) {
    const travel = prev ? travelBetween(prev.item, item) : null;
    const anchor = SLOT_START[item.time];
    const earliest = prev ? prev.end + (travel?.minutes ?? 0) : 0;
    const start = Math.max(anchor, earliest);
    const end = start + visitMinutes(item);
    const warnings: string[] = [];
    if (start > anchor)
      warnings.push(
        `Starts about ${start - anchor} min after the usual ${item.time.toLowerCase()} time because the stop before it runs long or is far away.`,
      );
    if (travel && travel.minutes >= 45)
      warnings.push(`About ${travel.minutes} min of travel from the stop before (an estimate).`);
    const hours = plainHours(item.hours);
    if (hours && (start < hours.open || end > hours.close))
      warnings.push(
        `Check the hours: listed as ${item.hours}, and this plan runs ${clock(start)} to ${clock(end)}.`,
      );
    if (end > 23 * 60) warnings.push("Runs very late.");
    const stop: TimedStop = { item, start, end, travel, warnings };
    out.push(stop);
    prev = stop;
  }
  return out;
}
