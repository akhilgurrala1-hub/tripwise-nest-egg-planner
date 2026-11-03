/**
 * Free, keyless open data for any place in the world, called from the browser:
 * - Wikipedia: a destination's photo and introduction, and notable landmarks nearby
 * - OpenStreetMap (Overpass): real restaurants nearby
 * - Nager.Date: public holidays in the destination's country
 * Parsers are pure (and tested); fetchers take an AbortSignal.
 */
import { milesBetween, type GeoPoint } from "../catalog";
import type { Interest } from "../demo-data";
import type { RealPlace } from "../places/types";

const WIKI = "https://en.wikipedia.org/w/api.php";

// ---------- Destination summary ----------

export interface PlaceSummary {
  title: string;
  extract: string;
  /** Image URL (Wikimedia), when the article has one */
  image: string | null;
  url: string;
}

/**
 * Wikipedia's opening sentence, minus the asides before "is": pronunciations
 * ("Nashville ( NASH-vil) is…"), native spellings and the like. Also swaps em
 * dashes for plain punctuation.
 */
export function tidyExtract(text: string): string {
  const verb = text.search(/\s(is|was|are|were|refers)\s/);
  const cutoff = verb > 0 ? verb : Math.min(text.length, 120);
  let out = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (i < cutoff || depth > 0) {
      if (ch === "(" || ch === "[") {
        depth++;
        continue;
      }
      if ((ch === ")" || ch === "]") && depth > 0) {
        depth--;
        continue;
      }
      if (depth > 0) continue;
    }
    out += ch;
  }
  return out
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Articles about things that share a place's name: never used for a destination's photo. */
const NOT_A_PLACE =
  /\b(film|movie|album|song|single|band|novel|book|television|tv series|sitcom|video game|episode|musical|opera|magazine|newspaper|football club|sports team|surname|given name|disambiguation|ship|aircraft|company|brand|character)\b/i;

/** How far an article's coordinates may be from the destination and still describe it. */
const MAX_KM = 350;

/**
 * The search result that's really about the place: not a film or album of the
 * same name, and (when the destination's location is known) an article whose own
 * coordinates are nearby. A result without coordinates is only trusted when it's
 * the top match and nothing nearby was found.
 */
export function parseSummary(body: unknown, near?: GeoPoint | null): PlaceSummary | null {
  const pages = (body as { query?: { pages?: Record<string, Record<string, unknown>> } })?.query
    ?.pages;
  if (!pages) return null;
  const ranked = Object.values(pages)
    .filter((p) => p["missing"] === undefined)
    .sort((a, b) => Number(a["index"] ?? 0) - Number(b["index"] ?? 0))
    .filter((p) => !NOT_A_PLACE.test(String(p["description"] ?? "")));
  const coordsOf = (p: Record<string, unknown>) =>
    (p["coordinates"] as { lat: number; lon: number }[] | undefined)?.[0] ?? null;
  const nearby = near
    ? ranked.find((p) => {
        const c = coordsOf(p);
        return c && milesBetween(near, { lat: c.lat, lon: c.lon }) * 1.609 <= MAX_KM;
      })
    : undefined;
  const page = nearby ?? (near ? ranked.find((p, i) => i === 0 && !coordsOf(p)) : ranked[0]);
  if (!page) return null;
  const title = String(page["title"] ?? "");
  const extract = tidyExtract(String(page["extract"] ?? ""));
  if (!title || !extract) return null;
  const thumb = page["thumbnail"] as { source?: string } | undefined;
  return {
    title,
    extract: extract.length > 360 ? `${extract.slice(0, 357).trimEnd()}…` : extract,
    image: typeof thumb?.source === "string" ? thumb.source : null,
    url: String(page["fullurl"] ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`),
  };
}

/** Photo and short introduction for a place, from the Wikipedia article really about it. */
export async function fetchPlaceSummary(
  query: string,
  signal?: AbortSignal,
  near?: GeoPoint | null,
): Promise<PlaceSummary | null> {
  const u = new URL(WIKI);
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "5",
    prop: "pageimages|extracts|info|coordinates|description",
    piprop: "thumbnail",
    pithumbsize: "960",
    pilimit: "5",
    exintro: "1",
    explaintext: "1",
    exsentences: "2",
    exlimit: "5",
    colimit: "5",
    inprop: "url",
    redirects: "1",
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), signal ? { signal } : {});
  if (!res.ok) throw new Error(`Wikipedia error (${res.status})`);
  return parseSummary(await res.json(), near);
}

// ---------- Landmarks (Wikipedia geosearch) ----------

/** What a landmark's short description says it is, mapped to interests; null = not a sight. */
const SIGHT_RULES: [RegExp, Interest[]][] = [
  [/\b(art )?museum|gallery\b/i, ["arts", "history"]],
  [/\b(national|state|provincial) park\b|\bnature reserve|wildlife\b/i, ["nature", "adventure"]],
  [/\bpark\b|\bgarden|botanic/i, ["nature", "family"]],
  [/\bbeach|bay\b|\bcoast/i, ["beaches", "nature"]],
  [
    /\bwaterfall|\blake\b|\bmountain|\bpeak\b|\bcanyon|\bcave|\bglacier|\bvolcano|\btrail\b/i,
    ["nature", "adventure"],
  ],
  [
    /\bcathedral|\bbasilica|\bchurch|\bmosque|\btemple|\bshrine|\bsynagogue|\bmonastery|\babbey/i,
    ["history", "arts"],
  ],
  [
    /\bcastle|\bpalace|\bfort(ress)?\b|\bruins?\b|\barchaeological|\bmonument|\bmemorial|\bhistoric|\bmansion|\bmission\b/i,
    ["history"],
  ],
  [/\bzoo\b|\baquarium|\bamusement|\btheme park|\bscience (centre|center)/i, ["family"]],
  [/\bmarket\b|\bbazaar|\bshopping/i, ["shopping", "food"]],
  [/\btheat(re|er)|\bopera|\bconcert hall|\bmusic venue/i, ["arts", "nightlife"]],
  [
    /\bsquare\b|\bplaza\b|\bbridge\b|\btower\b|\blighthouse|\bobservatory|\bpier\b|\bpromenade|\bboardwalk|\blandmark/i,
    ["history", "arts"],
  ],
];

const NOT_SIGHTS =
  /\b(school|university|college|station|airport|hospital|company|corporation|neighbou?rhood|district|suburb|census|county|municipality|village|town|city in|road|street|highway|railway|stadium|hotel|office|building in|apartment|bank|cemetery)\b/i;

export function classifySight(description: string): Interest[] | null {
  if (!description || NOT_SIGHTS.test(description)) return null;
  for (const [re, interests] of SIGHT_RULES) if (re.test(description)) return interests;
  return null;
}

function mapsSearch(name: string, near: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${near}`)}`;
}

export function parseLandmarks(body: unknown, near: string): RealPlace[] {
  const pages = (body as { query?: { pages?: Record<string, Record<string, unknown>> } })?.query
    ?.pages;
  if (!pages) return [];
  const out: (RealPlace & { _dist: number })[] = [];
  for (const p of Object.values(pages)) {
    const title = String(p["title"] ?? "");
    const description = String(p["description"] ?? "");
    const interests = classifySight(description);
    if (!title || !interests) continue;
    const coords = (
      p["coordinates"] as { lat: number; lon: number; dist?: number }[] | undefined
    )?.[0];
    out.push({
      placeId: `wiki:${String(p["pageid"] ?? title)}`,
      name: title,
      kind: "sight",
      typeLabel: description.charAt(0).toUpperCase() + description.slice(1),
      description: description.charAt(0).toUpperCase() + description.slice(1),
      address: null,
      rating: null,
      ratingCount: null,
      mapsUrl: mapsSearch(title, near),
      costPerPerson: 0,
      costSource: "unknown",
      interests,
      source: "wikipedia",
      _dist: coords?.dist ?? Number(p["index"] ?? 0) * 100,
    });
  }
  return out.sort((a, b) => a._dist - b._dist).map(({ _dist, ...p }) => p);
}

/** Notable landmarks within ~10 km, from Wikipedia articles with coordinates. */
export async function fetchLandmarks(
  at: GeoPoint,
  near: string,
  signal?: AbortSignal,
): Promise<RealPlace[]> {
  const u = new URL(WIKI);
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    origin: "*",
    generator: "geosearch",
    ggscoord: `${at.lat}|${at.lon}`,
    ggsradius: "10000",
    ggslimit: "80",
    prop: "description|coordinates",
    colimit: "80",
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), signal ? { signal } : {});
  if (!res.ok) throw new Error(`Wikipedia error (${res.status})`);
  return parseLandmarks(await res.json(), near);
}

// ---------- Restaurants (OpenStreetMap) ----------

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const CUISINE_INTERESTS: [RegExp, Interest[]][] = [
  [/seafood|fish/i, ["beaches", "food"]],
  [/bbq|barbecue|steak|burger|pizza|american|diner/i, ["food", "family"]],
  [/coffee|cafe|bakery|ice_cream/i, ["food", "arts"]],
];

export function parseRestaurants(body: unknown, near: string): RealPlace[] {
  const elements = (body as { elements?: Record<string, unknown>[] })?.elements ?? [];
  const seen = new Set<string>();
  const out: RealPlace[] = [];
  for (const e of elements) {
    const tags = (e["tags"] ?? {}) as Record<string, string>;
    const name = tags["name"]?.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const cuisine = (tags["cuisine"] ?? "").split(";")[0]!.replace(/_/g, " ").trim();
    const label = cuisine
      ? `${cuisine.charAt(0).toUpperCase()}${cuisine.slice(1)} restaurant`
      : "Restaurant";
    const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
    out.push({
      placeId: `osm:${String(e["type"] ?? "node")}/${String(e["id"] ?? name)}`,
      name,
      kind: "restaurant",
      typeLabel: label,
      description: label,
      address: street || null,
      rating: null,
      ratingCount: null,
      mapsUrl: mapsSearch(name, near),
      costPerPerson: 0,
      costSource: "unknown",
      interests: CUISINE_INTERESTS.find(([re]) => re.test(cuisine))?.[1] ?? ["food"],
      ...(tags["opening_hours"] ? { hours: tags["opening_hours"].slice(0, 80) } : {}),
      source: "osm",
    });
  }
  return out;
}

/** Named restaurants within ~3 km, from OpenStreetMap (two public Overpass servers). */
export async function fetchRestaurants(
  at: GeoPoint,
  near: string,
  signal?: AbortSignal,
): Promise<RealPlace[]> {
  const query = `[out:json][timeout:15];nwr(around:3000,${at.lat},${at.lon})["amenity"="restaurant"]["name"];out tags 80;`;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        ...(signal ? { signal } : {}),
      });
      if (res.ok) return parseRestaurants(await res.json(), near);
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  throw new Error("OpenStreetMap didn't respond.");
}

// ---------- Public holidays (Nager.Date) ----------

export interface Holiday {
  date: string;
  /** English name */
  name: string;
  /** Name in the local language, when different */
  localName: string;
  countryCode: string;
}

export function parseHolidays(body: unknown): Holiday[] {
  if (!Array.isArray(body)) return [];
  return body
    .map((h: Record<string, unknown>) => ({
      date: String(h["date"] ?? ""),
      name: String(h["name"] ?? ""),
      localName: String(h["localName"] ?? ""),
      countryCode: String(h["countryCode"] ?? ""),
      global: h["global"] !== false,
    }))
    .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.name && h.global)
    .map(({ global: _g, ...h }) => h);
}

/** Public holidays that fall on the trip's dates. */
export function holidaysBetween(list: Holiday[], start: string, end: string): Holiday[] {
  return list.filter((h) => h.date >= start && h.date <= end);
}

export async function fetchHolidays(
  year: number,
  country: string,
  signal?: AbortSignal,
): Promise<Holiday[]> {
  const res = await fetch(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(country)}`,
    signal ? { signal } : {},
  );
  // 404 = a country the service doesn't cover; that's "no data", not an error.
  if (res.status === 404 || res.status === 204) return [];
  if (!res.ok) throw new Error(`Holiday service error (${res.status})`);
  return parseHolidays(await res.json());
}
