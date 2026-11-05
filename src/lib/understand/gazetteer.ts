/**
 * Every place name Waypoint can recognize in a message, with the name the app
 * writes for it ("Charlotte, NC", "Kyoto, Japan", "Japan"). Built from the data in
 * src/data (countries, states, nicknames, the suggestion catalog) and, once loaded,
 * the airport table, which covers every town with scheduled flights worldwide.
 */
import aliasRows from "../../data/place-aliases.json";
import rules from "../../data/rules.json";
import countryRows from "../../data/countries.json";
import stateRows from "../../data/states.json";
import { airportCity, type Airport } from "../airports";
import { CATALOG, CRUISES, type GeoPoint } from "../catalog";
import { DESTINATIONS } from "../demo-data";
import { plainName } from "./text";

export type PlaceKind = "city" | "country" | "state" | "region";

export interface PlaceCandidate {
  /** How the app writes it */
  name: string;
  kind: PlaceKind;
  /** ISO country, when known */
  country: string;
  /** State or province code (US, Canada, Australia) */
  region: string;
  point: GeoPoint | null;
  /** How likely this is the place meant when a name is shared (bigger = more likely) */
  weight: number;
}

export interface Gazetteer {
  /** Plain name (1 to 5 words) → places it may mean */
  names: Map<string, PlaceCandidate[]>;
  /** Plain country name or alias → ISO code */
  countries: Map<string, string>;
  /** ISO code → country name */
  countryName: Map<string, string>;
  /** Plain state name or code → [country, code, name] */
  states: Map<string, [string, string, string]>;
  /** Airport code ("JFK") → the town it serves, once the airport table is loaded */
  codes: Map<string, PlaceCandidate>;
  /** First words of names with more than one word ("can" for "Can Tho") */
  starts: Set<string>;
  maxWords: number;
}

interface CountryRow {
  code: string;
  name: string;
  aliases: string[];
}

/**
 * Names that are also everyday words ("nice weather", "split the cost", "reading"):
 * they only count as places when typed with a capital or followed by a country.
 */
export const EVERYDAY_WORDS = new Set<string>(rules.everydayPlaceWords);

/** Short names that are safe even in lowercase: everyone means the place. */
const ALWAYS_PLACES = new Set(["dc", "sf", "atl", "rio", "austin", "florence", "georgia"]);

const strip = (s: string) => plainName(s).replace(/^the /, "");

function add(map: Map<string, PlaceCandidate[]>, key: string, c: PlaceCandidate) {
  const k = strip(key);
  if (k.length < 2) return;
  const list = map.get(k);
  if (!list) map.set(k, [c]);
  else if (!list.some((x) => x.name === c.name)) list.push(c);
  else {
    // Keep the strongest reading of the same place.
    const i = list.findIndex((x) => x.name === c.name);
    if (list[i]!.weight < c.weight)
      list[i] = { ...list[i]!, ...c, point: c.point ?? list[i]!.point };
  }
}

const startsOf = (names: Map<string, unknown>) =>
  new Set([...names.keys()].filter((k) => k.includes(" ")).map((k) => k.split(" ")[0]!));

let base: Gazetteer | null = null;
const withAirports = new WeakMap<readonly Airport[], Gazetteer>();

function buildBase(): Gazetteer {
  const names = new Map<string, PlaceCandidate[]>();
  const countries = new Map<string, string>();
  const countryName = new Map<string, string>();
  const states = new Map<string, [string, string, string]>();

  for (const c of countryRows as CountryRow[]) {
    countryName.set(c.code, c.name);
    for (const n of [c.name, ...c.aliases]) {
      countries.set(strip(n), c.code);
      add(names, n, {
        name: c.name,
        kind: "country",
        country: c.code,
        region: "",
        point: null,
        weight: 4,
      });
    }
  }
  for (const [country, code, name] of stateRows as [string, string, string][]) {
    const row: [string, string, string] = [country, code, name];
    states.set(strip(name), row);
    if (!states.has(code.toLowerCase())) states.set(code.toLowerCase(), row);
    const label = country === "US" ? name : `${name}, ${countryName.get(country) ?? country}`;
    add(names, name, { name: label, kind: "state", country, region: code, point: null, weight: 3 });
  }
  // A Georgia traveler from the US means the state; the country is still listed.
  for (const p of CATALOG) {
    const cand: PlaceCandidate = {
      name: p.town,
      kind: "city",
      country: p.country,
      region: p.country === "US" ? (p.town.split(",")[1]?.trim() ?? "") : "",
      point: { lat: p.lat, lon: p.lon },
      weight: 6,
    };
    add(names, p.town.split(",")[0]!, cand);
    add(names, p.name, cand);
  }
  for (const c of CRUISES)
    add(names, c.port.split(",")[0]!, {
      name: c.port,
      kind: "city",
      country: c.country ?? "US",
      region: "",
      point: c.portPoint,
      weight: 5,
    });
  for (const d of DESTINATIONS) {
    if (!d.anchor || d.id === "hometown") continue;
    const cand: PlaceCandidate = {
      name: d.anchor.name,
      kind: "city",
      country: d.country ?? "US",
      region: d.anchor.name.split(",")[1]?.trim() ?? "",
      point: { lat: d.anchor.lat, lon: d.anchor.lon },
      weight: 6,
    };
    add(names, d.anchor.name.split(",")[0]!, cand);
    add(names, d.name, cand);
  }
  for (const [alias, name, kind] of aliasRows as [string, string, string][]) {
    add(names, alias, {
      name,
      kind: kind === "region" ? "region" : "city",
      country: "",
      region: "",
      point: null,
      // Above any airport town, below a place Waypoint plans in detail ("Marrakech").
      weight: 5.5,
    });
  }
  return {
    names,
    countries,
    countryName,
    states,
    codes: new Map(),
    starts: startsOf(names),
    maxWords: 5,
  };
}

/** How the app writes an airport's town: "Charlotte, NC" in the US, "Kyoto, Japan" elsewhere. */
export function airportPlaceName(a: Airport, countryName: Map<string, string>): string {
  const city = airportCity(a.city);
  if (a.country === "US") return a.region ? `${city}, ${a.region}` : `${city}, USA`;
  return `${city}, ${countryName.get(a.country) ?? a.country}`;
}

/** The place index, with the airport table's towns when it's loaded. */
export function gazetteer(airports?: readonly Airport[] | null): Gazetteer {
  base ??= buildBase();
  if (!airports?.length) return base;
  const cached = withAirports.get(airports);
  if (cached) return cached;
  const names = new Map<string, PlaceCandidate[]>();
  const codes = new Map<string, PlaceCandidate>();
  for (const [k, v] of base.names) names.set(k, [...v]);
  for (const a of airports) {
    const city = airportCity(a.city);
    if (!city) continue;
    const cand: PlaceCandidate = {
      name: airportPlaceName(a, base.countryName),
      kind: "city",
      country: a.country,
      region: a.region,
      point: { lat: a.lat, lon: a.lon },
      weight: a.large ? 3 : 1,
    };
    add(names, city, cand);
    for (const other of a.also) add(names, other, { ...cand, weight: cand.weight - 1 });
    codes.set(a.code, cand);
  }
  const g = { ...base, names, codes, starts: startsOf(names) };
  withAirports.set(airports, g);
  return g;
}

/** Whether a name that's also an everyday word should count here. */
export function everydayWordAllowed(word: string, typedCapitalized: boolean, qualified: boolean) {
  if (!EVERYDAY_WORDS.has(word)) return true;
  if (ALWAYS_PLACES.has(word)) return true;
  return typedCapitalized || qualified;
}

/**
 * The country a place name is in ("Kyoto, Japan" → JP, "Asheville, NC" → US), from
 * its last part or, failing that, the best-known place of that name. "" when unknown.
 */
export function countryOfPlace(name: string, airports?: readonly Airport[] | null): string {
  const g = gazetteer(airports);
  const parts = name.split(",").map((p) => plainName(p).replace(/^the /, ""));
  const last = parts.at(-1) ?? "";
  if (parts.length > 1) {
    const country = g.countries.get(last);
    if (country) return country;
    const state = g.states.get(last);
    if (state) return state[0];
  }
  const whole = g.countries.get(parts[0] ?? "");
  if (whole) return whole;
  const cands = g.names.get(parts[0] ?? "");
  const best = cands && [...cands].sort((a, b) => b.weight - a.weight)[0];
  return best?.country ?? "";
}

/** A country's name from its ISO code ("IT" → "Italy"), or "" when unknown. */
export const countryName = (code: string) => gazetteer().countryName.get(code) ?? "";
