/**
 * Airports with scheduled flights (OurAirports, public domain; see
 * scripts/airports.py), so finding the airport for a city never depends on a
 * search: the nearest real airport to a place, by distance, preferring big ones.
 *
 * The table (`src/data/airports.json`, built by `python -m waypoint_data airports`)
 * is ~90 KB gzipped, so it's loaded on demand (`loadAirports`) and kept out of the
 * first page load. The finding logic is pure and works on any list.
 */
import countryRows from "../data/countries.json";
import rules from "../data/rules.json";
import { milesBetween, type GeoPoint } from "./catalog";

/**
 * One row of the table: [IATA, lat, lon, size (L large, M medium), town (in English),
 * country, name, region (state or province in the US, Canada, Australia), other names
 * for the town (its local name, the district the runway is in)].
 */
export type AirportRow = [
  string,
  number,
  number,
  "H" | "L" | "M",
  string,
  string,
  string,
  string?,
  string[]?,
];

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  /** Large hubs have the most flights (and usually the best fares) */
  large: boolean;
  /** The city's main international airport, where it has more than one large one */
  hub: boolean;
  /** State or province code in the US, Canada and Australia ("NC"), else "" */
  region: string;
  /** Other names for the town ("Firenze" for Florence) */
  also: string[];
}

export const toAirport = ([
  code,
  lat,
  lon,
  size,
  city,
  country,
  name,
  region = "",
  also = [],
]: AirportRow): Airport => ({
  code,
  lat,
  lon,
  large: size !== "M",
  hub: size === "H",
  city,
  country,
  name,
  region,
  also,
});

let all: Promise<Airport[]> | null = null;

/** Every airport, loaded once. */
export function loadAirports(): Promise<Airport[]> {
  all ??= import("../data/airports.json").then((m) =>
    (m.default as unknown as AirportRow[]).map(toAirport),
  );
  return all;
}

export interface NearbyAirport extends Airport {
  /** Straight-line miles from the place */
  miles: number;
}

/** How much nearer a small airport must be to beat a big one (big hubs mean more flights). */
const HUB_BONUS_MILES = 45;
/** And a city's main hub beats its other large airports unless they're much nearer (FCO, not Ciampino). */
const MAIN_HUB_BONUS_MILES = 30;
/** Further than this, there's no airport for the place (a remote island, a park far from any). */
export const MAX_AIRPORT_MILES: number = rules.maxAirportMiles;

/** Miles, less the bonus a bigger airport earns. */
const reach = (a: NearbyAirport) =>
  a.miles - (a.large ? HUB_BONUS_MILES : 0) - (a.hub ? MAIN_HUB_BONUS_MILES : 0);

/**
 * Airports near a place, best first: a large hub within reach beats a nearer
 * regional field unless the regional one is much closer.
 */
export function airportsNear(
  airports: readonly Airport[],
  point: GeoPoint,
  limit = 3,
  maxMiles = MAX_AIRPORT_MILES,
): NearbyAirport[] {
  // A cheap box first: a degree of latitude is ~69 miles.
  const dLat = maxMiles / 69;
  const dLon = maxMiles / Math.max(10, 69 * Math.cos((point.lat * Math.PI) / 180));
  return airports
    .filter((a) => {
      const lon = Math.abs(a.lon - point.lon);
      // Longitude wraps at the date line (Fiji, Alaska's Aleutians).
      return Math.abs(a.lat - point.lat) <= dLat && Math.min(lon, 360 - lon) <= dLon;
    })
    .map((a) => ({ ...a, miles: Math.round(milesBetween(point, a)) }))
    .filter((a) => a.miles <= maxMiles)
    .sort((a, b) => reach(a) - reach(b))
    .slice(0, limit);
}

/** The best airport for a place, or null when none is within reach. */
export const airportFor = (airports: readonly Airport[], point: GeoPoint | null | undefined) =>
  point ? (airportsNear(airports, point, 1)[0] ?? null) : null;

/** An airport by its code ("ord" works). */
export const airportByCode = (airports: readonly Airport[], code: string) => {
  const c = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? (airports.find((a) => a.code === c) ?? null) : null;
};

const plain = (x: string) =>
  x
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

let countryIndex: Map<string, string> | null = null;
/** ISO code for a country's name or common alias ("france" → FR, "uk" → GB). */
function countryCode(name: string): string {
  countryIndex ??= new Map(
    (countryRows as { code: string; name: string; aliases: string[] }[]).flatMap((c) =>
      [c.name, ...c.aliases].map((n) => [plain(n), c.code] as const),
    ),
  );
  return countryIndex.get(name) ?? "";
}

/** The town an airport serves, without the source's asides: "Paris (Roissy-en-France)" → "Paris". */
export const airportCity = (city: string) =>
  city
    .replace(/\s*\(.*?\)\s*/g, " ")
    .split("/")[0]!
    .trim();

/**
 * The airport for a place by its name when its location isn't known yet
 * ("Charlotte, NC" → CLT): the airports serving that city, a large one first.
 * A typed code ("ORD") also works.
 */
export function airportByName(airports: readonly Airport[], name: string): Airport | null {
  const code = airportByCode(airports, name);
  if (code) return code;
  const parts = name.split(",").map((p) => p.trim());
  const city = plain(parts[0] ?? "");
  if (city.length < 3) return null;
  const hint = plain(parts.slice(1).join(" "));
  const matches = airports.filter(
    (a) => plain(airportCity(a.city)) === city || a.also.some((n) => plain(n) === city),
  );
  if (!matches.length) return null;
  // "Portland, OR" vs "Portland, ME": a state code or a country narrows it.
  const state = /^[a-z]{2,3}$/.test(hint) ? hint.toUpperCase() : "";
  const country = countryCode(hint);
  const narrowed = matches.filter((a) =>
    !hint
      ? true
      : state
        ? a.region === state || (a.country === "US" && !a.region)
        : a.country === country || plain(a.name).includes(hint) || a.country.toLowerCase() === hint,
  );
  const pool = narrowed.length ? narrowed : matches;
  return (
    [...pool].sort(
      (x, y) => Number(y.hub) - Number(x.hub) || Number(y.large) - Number(x.large),
    )[0] ?? null
  );
}

/** "ORD · Chicago O'Hare International Airport, 14 mi away" */
export const airportLabel = (a: NearbyAirport | Airport) =>
  `${a.code} · ${a.name}${"miles" in a && a.miles >= 5 ? `, ${a.miles} mi away` : ""}`;
