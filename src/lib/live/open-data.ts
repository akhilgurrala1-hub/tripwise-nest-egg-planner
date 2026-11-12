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

/**
 * Wikipedia's lead image for a region is often a map, flag or locator drawn as a PNG or SVG.
 * Photos are JPEGs, so anything else (or a file named like a map) is no photo of the place.
 */
const NOT_A_PHOTO =
  /\.(png|svg|gif)(\.\w+)?(\?|$)|[/_ -](map|maps|locator|location|flag|seal|coat_of_arms|logo|diagram)[_. -]/i;

/**
 * Wikimedia makes standard thumbnail sizes on demand. Ask for the width a card needs
 * (500px is about 50KB) instead of the 960px default (about 220KB).
 */
export function thumbAt(url: string, width: number): string {
  // Wikimedia answers only standard widths (anything else is an HTTP 400, so the photo never
  // shows): use the nearest standard one at or above what was asked for.
  const std = THUMB_WIDTHS.find((w) => w >= width) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1]!;
  return url.replace(/\/\d+px-(?=[^/]+$)/, `/${std}px-`);
}

/** Thumbnail widths Wikimedia serves (checked against upload.wikimedia.org). */
const THUMB_WIDTHS = [250, 330, 500, 960, 1280, 1920];

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
    image:
      typeof thumb?.source === "string" && !NOT_A_PHOTO.test(thumb.source) ? thumb.source : null,
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

// ---------- Landmarks (Wikipedia) ----------

/**
 * What a landmark's short description says it is, mapped to interests; null = not a sight.
 * Wikipedia's short descriptions name the thing plainly ("Ancient amphitheatre in Rome",
 * "Fountain in Rome", "Colossal sculpture on Liberty Island"), so these cover what
 * travelers go to see.
 */
const SIGHT_RULES: [RegExp, Interest[]][] = [
  [/\b(art )?museum|gallery\b/i, ["arts", "history"]],
  [/\b(national|state|provincial) park\b|\bnature reserve|wildlife\b/i, ["nature", "adventure"]],
  [/\bpark\b|\bgarden|botanic/i, ["nature", "family"]],
  [/\bbeach|bay\b|\bcoast/i, ["beaches", "nature"]],
  [
    /\bwaterfall|\blake\b|\bmountain|\bpeak\b|\bcanyon|\bcave|\bglacier|\bvolcano|\btrail\b|\bgorge\b|\bcliffs?\b/i,
    ["nature", "adventure"],
  ],
  [
    /\bcathedral|\bbasilica|\bchurch|\bmosque|\btemple|\bshrine|\bsynagogue|\bmonastery|\babbey|\bpagoda|\bchapel\b/i,
    ["history", "arts"],
  ],
  [
    /\bcastle|\bpalace|\bfort(ress)?\b|\bruin(s|ed)?\b|\barchaeological|\bmonument|\bmemorial|\bhistoric|\bmansion|\bmission\b|\bamphithea(tre|ter)|\bcolosseum|\bforum\b|\baqueduct|\bbaths\b|\btomb\b|\bmausoleum|\bpyramid|\bnecropolis|\bcatacombs?|\bcitadel|\bwalls\b|\bold town|\bmedina\b|\bwonder\b/i,
    ["history"],
  ],
  [/\bzoo\b|\baquarium|\bamusement|\btheme park|\bscience (centre|center)/i, ["family"]],
  [/\bmarket\b|\bbazaar|\bshopping/i, ["shopping", "food"]],
  [/\btheat(re|er)|\bopera|\bconcert hall|\bmusic venue/i, ["arts", "nightlife"]],
  [
    /\bfountain|\bstatue|\bsculpture|\bsteps\b|\bstairs?\b|\b(triumphal )?arch\b|\bgate\b|\bsquare\b|\bplaza\b|\bpiazza|\bbridge\b|\btower\b|\blighthouse|\bobservatory|\bobservation deck|\bviewpoint|\blookout|\bpier\b|\bpromenade|\bboardwalk|\blandmark|\bskyscraper/i,
    ["history", "arts"],
  ],
];

const NOT_SIGHTS =
  /\b(school|university|college|station|airport|hospital|company|corporation|neighbou?rhood|district|suburb|census|county|municipality|village|town|city in|road|street|highway|railway|stadium|hotel|office|building in|apartment|bank|cemetery|embassy|consulate|ministry|headquarters|government agency)\b/i;
/** Words that make it a sight even when the description also says "building" or "district". */
const ALWAYS_SIGHTS =
  /\b(museum|cathedral|basilica|castle|palace|amphithea(tre|ter)|ruins|monument|historic (building|house|district|centre|center|quarter|site)|old town|world heritage)\b/i;

export function classifySight(description: string): Interest[] | null {
  if (!description) return null;
  if (NOT_SIGHTS.test(description) && !ALWAYS_SIGHTS.test(description)) return null;
  for (const [re, interests] of SIGHT_RULES) if (re.test(description)) return interests;
  return null;
}

function mapsSearch(name: string, near: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${near}`)}`;
}

/** Views over the last month, from Wikipedia's page-view counts (null when not reported). */
function monthViews(p: Record<string, unknown>): number | null {
  const v = p["pageviews"];
  if (!v || typeof v !== "object") return null;
  let sum = 0;
  let any = false;
  for (const n of Object.values(v as Record<string, unknown>)) {
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
      sum += n;
      any = true;
    }
  }
  return any ? sum : null;
}

/**
 * How well known a place is, for ranking: page views when Wikipedia reports
 * them (the Colosseum gets hundreds of thousands a month, a side chapel a few
 * hundred), else the article's length, minus a little for distance from the
 * center. Pure, so the order is testable.
 */
export function fameScore(views: number | null, length: number | null, km: number): number {
  const base =
    views !== null ? Math.log10(views + 1) : length ? Math.max(0, Math.log10(length) - 1.2) : 0;
  return base - 0.08 * km;
}

export function parseLandmarks(body: unknown, near: string, at?: GeoPoint | null): RealPlace[] {
  const pages = (body as { query?: { pages?: Record<string, Record<string, unknown>> } })?.query
    ?.pages;
  if (!pages) return [];
  const out: (RealPlace & { _score: number })[] = [];
  const seen = new Set<string>();
  for (const p of Object.values(pages)) {
    const title = String(p["title"] ?? "");
    const description = String(p["description"] ?? "");
    const interests = classifySight(description);
    if (!title || !interests || seen.has(title)) continue;
    seen.add(title);
    const coords = (
      p["coordinates"] as { lat: number; lon: number; dist?: number }[] | undefined
    )?.[0];
    const km =
      typeof coords?.dist === "number"
        ? coords.dist / 1000
        : coords && at
          ? milesBetween(at, { lat: coords.lat, lon: coords.lon }) * 1.609
          : Number(p["index"] ?? 0) / 10;
    const views = monthViews(p);
    const length = typeof p["length"] === "number" ? (p["length"] as number) : null;
    const label = description.charAt(0).toUpperCase() + description.slice(1);
    out.push({
      placeId: `wiki:${String(p["pageid"] ?? title)}`,
      name: title,
      kind: "sight",
      typeLabel: label,
      description: label,
      address: null,
      rating: null,
      ratingCount: null,
      mapsUrl: mapsSearch(title, near),
      costPerPerson: 0,
      costSource: "unknown",
      interests,
      source: "wikipedia",
      ...(coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)
        ? { lat: coords.lat, lon: coords.lon }
        : {}),
      ...(views !== null ? { fame: views } : {}),
      _score: fameScore(views, length, km),
    });
  }
  return out.sort((a, b) => b._score - a._score).map(({ _score, ...p }) => p);
}

/** Both searches' pages in one body (the same article from both counts once). */
export function mergeWikiBodies(...bodies: unknown[]): {
  query: { pages: Record<string, unknown> };
} {
  const pages: Record<string, unknown> = {};
  for (const b of bodies) {
    const ps = (b as { query?: { pages?: Record<string, Record<string, unknown>> } })?.query?.pages;
    if (!ps) continue;
    for (const [id, p] of Object.entries(ps)) {
      const prev = pages[id] as Record<string, unknown> | undefined;
      // Keep whichever copy reported page views.
      if (!prev || (prev["pageviews"] === undefined && p["pageviews"] !== undefined)) pages[id] = p;
    }
  }
  return { query: { pages } };
}

async function wikiQuery(params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const u = new URL(WIKI);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), signal ? { signal } : {});
  if (!res.ok) throw new Error(`Wikipedia error (${res.status})`);
  return res.json();
}

/**
 * Notable landmarks within ~10 km, best known first. Two searches run together:
 * the articles most linked to from the rest of Wikipedia near the place (where
 * the Colosseum and Trevi Fountain are), and the nearest articles (small gems
 * in the center); both report page views, which decide the order.
 */
export async function fetchLandmarks(
  at: GeoPoint,
  near: string,
  signal?: AbortSignal,
): Promise<RealPlace[]> {
  const props = {
    action: "query",
    format: "json",
    origin: "*",
    prop: "description|coordinates|pageviews|info",
    colimit: "max",
    codistancefrompoint: `${at.lat}|${at.lon}`,
    pvipdays: "30",
  };
  const [linked, nearest] = await Promise.allSettled([
    wikiQuery(
      {
        ...props,
        generator: "search",
        gsrsearch: `nearcoord:10km,${at.lat},${at.lon}`,
        gsrsort: "incoming_links_desc",
        gsrlimit: "50",
        gsrnamespace: "0",
      },
      signal,
    ),
    wikiQuery(
      {
        ...props,
        generator: "geosearch",
        ggscoord: `${at.lat}|${at.lon}`,
        ggsradius: "10000",
        ggslimit: "50",
      },
      signal,
    ),
  ]);
  if (linked.status === "rejected" && nearest.status === "rejected") throw nearest.reason;
  return parseLandmarks(
    mergeWikiBodies(
      linked.status === "fulfilled" ? linked.value : null,
      nearest.status === "fulfilled" ? nearest.value : null,
    ),
    near,
    at,
  );
}

// ---------- Restaurants (OpenStreetMap) ----------

export const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const CUISINE_INTERESTS: [RegExp, Interest[]][] = [
  [/seafood|fish/i, ["beaches", "food"]],
  [/bbq|barbecue|steak|burger|pizza|american|diner/i, ["food", "family"]],
  [/coffee|cafe|bakery|ice_cream/i, ["food", "arts"]],
];

/** Chains and fast food: real, but not what anyone travels for. */
const CHAIN_NAMES =
  /^(mcdonald'?s|burger king|kfc|subway|domino'?s|pizza hut|starbucks|wendy'?s|taco bell|five guys|nando'?s|telepizza|vapiano|hard rock cafe|tgi friday'?s|applebee'?s|chili'?s|olive garden|denny'?s|ihop|panda express|chipotle|popeyes|dunkin'?)\b/i;

/**
 * How promising a restaurant looks from what OpenStreetMap knows about it: a
 * Wikipedia or Wikidata entry (notable), a website, published hours, a cuisine
 * and a phone number, a little less the farther it is from the center. Chains
 * sink to the bottom. Pure, so the order is testable.
 */
export function restaurantScore(tags: Record<string, string>, km: number | null): number {
  let s = 0;
  if (tags["wikidata"] || tags["wikipedia"]) s += 3;
  if (tags["website"] || tags["contact:website"]) s += 1;
  if (tags["opening_hours"]) s += 0.6;
  if (tags["cuisine"]) s += 0.5;
  if (tags["phone"] || tags["contact:phone"]) s += 0.3;
  if (tags["addr:street"]) s += 0.2;
  if (tags["brand"] || tags["brand:wikidata"] || CHAIN_NAMES.test(tags["name"] ?? "")) s -= 6;
  if (/fast_food|burger/i.test(tags["cuisine"] ?? "")) s -= 1;
  if (km !== null) s -= 0.4 * km;
  return s;
}

export function parseRestaurants(body: unknown, near: string, at?: GeoPoint | null): RealPlace[] {
  const elements = (body as { elements?: Record<string, unknown>[] })?.elements ?? [];
  const seen = new Set<string>();
  const out: (RealPlace & { _score: number })[] = [];
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
    const center = (e["center"] as { lat?: number; lon?: number } | undefined) ?? e;
    const lat = Number((center as { lat?: unknown }).lat);
    const lon = Number((center as { lon?: unknown }).lon);
    const km =
      at && Number.isFinite(lat) && Number.isFinite(lon)
        ? milesBetween(at, { lat, lon }) * 1.609
        : null;
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
      ...(Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : {}),
      _score: restaurantScore(tags, km),
    });
  }
  // Stable: equally promising places keep OpenStreetMap's order.
  return out
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p._score - a.p._score || a.i - b.i)
    .map(({ p: { _score, ...p } }) => p);
}

/**
 * Restaurants worth a meal near the center, from OpenStreetMap: notable ones
 * (with a Wikipedia entry) within 3 km, well-documented independents within 2 km
 * and anything named close by; chains are left out where the data says so.
 */
export async function fetchRestaurants(
  at: GeoPoint,
  near: string,
  signal?: AbortSignal,
): Promise<RealPlace[]> {
  const a = `${at.lat},${at.lon}`;
  const query = `[out:json][timeout:20];(nwr(around:3000,${a})["amenity"="restaurant"]["name"]["wikidata"];nwr(around:2000,${a})["amenity"="restaurant"]["name"]["website"][!"brand"];nwr(around:800,${a})["amenity"="restaurant"]["name"][!"brand"];);out center 200;`;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        ...(signal ? { signal } : {}),
      });
      if (res.ok) return parseRestaurants(await res.json(), near, at);
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
