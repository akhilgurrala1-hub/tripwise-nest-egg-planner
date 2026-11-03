/**
 * Multi-city trips: the trip's destination is the first city, and `cities` lists
 * the ones after it, in order, with the nights spent in each. Pure, so the rules
 * (who gets which nights, which day you travel, how far the whole route is) are
 * testable and every page works them out the same way.
 */
import { roadMiles, type GeoPoint } from "./catalog";

export interface TripCity {
  /** As the traveler named it ("Florence, Italy") */
  name: string;
  nights: number;
  /** Where it is, once looked up (for distances and fares) */
  point?: GeoPoint | null;
}

/** Five cities in all (the destination plus four more) keeps plans readable. */
export const MAX_CITIES = 5;

export interface CityLeg {
  name: string;
  nights: number;
  /** Day index (0-based) the traveler arrives, so it's a travel day after the first city */
  arriveDay: number;
  /** Days spent here, counting the arrival day (the last city also gets the day home) */
  days: number;
  point: GeoPoint | null;
  /** The trip's main destination (first city) */
  main: boolean;
}

/** The extra cities, cleaned: named, whole nights of at least one, at most MAX_CITIES - 1. */
export function cleanCities(cities: readonly TripCity[] | null | undefined): TripCity[] {
  return (cities ?? [])
    .map((c) => ({
      name: String(c?.name ?? "")
        .trim()
        .slice(0, 120),
      nights: Math.max(1, Math.round(Number(c?.nights) || 1)),
      point:
        c?.point && Number.isFinite(c.point.lat) && Number.isFinite(c.point.lon)
          ? { lat: c.point.lat, lon: c.point.lon }
          : null,
    }))
    .filter((c) => c.name)
    .slice(0, MAX_CITIES - 1);
}

/**
 * Every city in order with its nights. The main destination gets whatever nights
 * the other cities leave (at least one); if the trip is too short for all of them,
 * cities drop off the end until it fits. A day trip has just the main city.
 */
export function citySchedule(
  totalNights: number,
  main: { name: string; point: GeoPoint | null },
  cities: readonly TripCity[] | null | undefined,
): CityLeg[] {
  const nights = Math.max(0, Math.round(totalNights));
  const extra = cleanCities(cities);
  // Each extra city needs a night, and the main city keeps at least one.
  while (extra.length && extra.reduce((s, c) => s + c.nights, 0) > nights - 1) {
    const last = extra[extra.length - 1]!;
    if (last.nights > 1) last.nights -= 1;
    else extra.pop();
  }
  const mainNights = nights - extra.reduce((s, c) => s + c.nights, 0);
  const all = [{ name: main.name, nights: mainNights, point: main.point, main: true }].concat(
    extra.map((c) => ({ name: c.name, nights: c.nights, point: c.point ?? null, main: false })),
  );
  let day = 0;
  return all.map((c, i) => {
    const leg: CityLeg = {
      ...c,
      arriveDay: day,
      days: c.nights + (i === all.length - 1 ? 1 : 0),
    };
    day += c.nights;
    return leg;
  });
}

/** True when the trip visits more than one city. */
export const isMultiCity = (cities: readonly TripCity[] | null | undefined) =>
  cleanCities(cities).length > 0;

/** Rough distance for a leg whose city hasn't been located yet. */
export const UNKNOWN_LEG_MILES = 250;

/**
 * One-way miles of each leg of the route: from home to the first city, between
 * cities, and from the last city home. Unknown places count as a typical leg.
 */
export function routeLegMiles(origin: GeoPoint | null, legs: readonly CityLeg[]): number[] {
  const stops = [origin, ...legs.map((l) => l.point), origin];
  const out: number[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    out.push(a && b ? roadMiles(a, b) : UNKNOWN_LEG_MILES);
  }
  return out;
}

/** "Rome → Florence → Venice" */
export const routeLabel = (legs: readonly { name: string }[]) =>
  legs.map((l) => l.name.split(",")[0]!.trim()).join(" → ");
