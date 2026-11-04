/**
 * Long trips are planned by the AI in parts: a model writes a careful plan for
 * up to two weeks at a time, so a month in Japan becomes a few parts that run at
 * once and are joined back into one plan. Pure, so the split and the join are tested.
 */
import { addDays } from "./dates";
import type { Itinerary, ItineraryDay } from "./itinerary";
import type { CityLeg } from "./multi-city";

/** Trips up to this long are one request, as before. */
export const SINGLE_REQUEST_DAYS = 14;
/** Days per part when a trip is longer (the server takes up to 14). */
export const CHUNK_DAYS = 10;

export interface PlanChunk {
  /** Day index (0-based) the part starts on */
  from: number;
  days: number;
  /** Which city it's in (index into the trip's legs) */
  city: number;
  /** The part starts with the move into a new city */
  travelDay: boolean;
  /** Which of this city's parts it is, and how many it has (to share out its places) */
  part: number;
  parts: number;
}

/**
 * Split a trip into parts of at most `size` days, never across a city change, so
 * every part plans one place. A trip that fits in one request is one part.
 */
export function planChunks(
  legs: readonly CityLeg[],
  totalDays: number,
  size = CHUNK_DAYS,
): PlanChunk[] {
  const out: PlanChunk[] = [];
  const cities = legs.length ? legs : [{ arriveDay: 0, days: totalDays } as CityLeg];
  cities.forEach((leg, city) => {
    const start = Math.min(leg.arriveDay, totalDays);
    const end = Math.min(totalDays, leg.arriveDay + leg.days);
    const length = end - start;
    if (length <= 0) return;
    const parts = Math.ceil(length / size);
    // Even parts (a 12-day stay is 6 + 6, not 10 + 2).
    const each = Math.ceil(length / parts);
    for (let p = 0; p < parts; p++) {
      const from = start + p * each;
      const days = Math.min(each, end - from);
      if (days > 0) out.push({ from, days, city, travelDay: city > 0 && p === 0, part: p, parts });
    }
  });
  return out;
}

/** This part's share of a city's places: every n-th one, so parts don't repeat each other. */
export const shareOf = <T>(list: readonly T[], part: number, parts: number): T[] =>
  parts <= 1 ? [...list] : list.filter((_, i) => i % parts === part);

/** Join the parts' plans (each numbered from day 1) into the whole trip's plan. */
export function joinChunkPlans(
  chunks: readonly PlanChunk[],
  plans: readonly Itinerary[],
  startDate: string,
): Itinerary {
  const days: ItineraryDay[] = [];
  chunks.forEach((c, k) => {
    (plans[k]?.days ?? []).slice(0, c.days).forEach((d, j) => {
      const index = c.from + j;
      days.push({
        ...d,
        day: index + 1,
        date: addDays(startDate, index),
        items: d.items.map((it) => ({ ...it, id: `p${k + 1}-${it.id}` })),
      });
    });
  });
  days.sort((a, b) => a.day - b.day);
  const tips = [...new Set(plans.flatMap((p) => p.tips))].slice(0, 6);
  return { source: "ai", days, tips };
}
