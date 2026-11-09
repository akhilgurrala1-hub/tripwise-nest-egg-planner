// Real driving routes and stops along them from free, keyless open data, called
// from the browser (never during SSR): the road from public OSRM servers
// (OpenStreetMap roads), sights near it from Wikipedia (fast, reliable, ranked by
// how well known they are) and, best effort, independent restaurants right by it
// from OpenStreetMap through Overpass. No Google Maps, no keys, no cost, so it
// works for everyone, signed out included.
import type { Interest } from "../demo-data";
import { searchPlaces } from "../live/geocode";
import { classifySight, fameScore, OVERPASS_URLS, restaurantScore } from "../live/open-data";
import type { CostSource, LatLng, RealRoute, RouteStop, StopKind, StopTag } from "./types";

/** Public OSRM servers on OpenStreetMap roads, tried in order (same API). */
const OSRM = [
  "https://router.project-osrm.org/route/v1/driving",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving",
];
/** Most stops kept for one route, spread along it. */
const MAX_STOPS = 36;
/** How far off the road a sight (8 km) or a meal (1 km) may be. */
const SIGHT_MAX_KM = 8;
const FOOD_RADIUS_M = 1000;
/** Points of the route sent to Overpass (enough to follow the road, small enough to stay fast). */
const QUERY_POINTS = 30;
/** Wikipedia searches along the road: one every ~30 km, 3 to 10 of them. */
const WIKI_SPACING_KM = 30;
const WIKI_MAX_POINTS = 10;
/** Food is a bonus: never wait longer than this for OpenStreetMap. */
const FOOD_TIMEOUT_MS = 8_000;
const WIKI = "https://en.wikipedia.org/w/api.php";
/** Average speed on the roads off a highway, for detour time. */
const DETOUR_KMH = 45;

const toRad = (d: number) => (d * Math.PI) / 180;
export function kmBetween(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** OSRM's answer as a route, or null when there's no drivable route. */
export function parseOsrm(body: unknown): RealRoute | null {
  const r = (body as { code?: string; routes?: unknown[] })?.routes?.[0] as
    | { distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }
    | undefined;
  const coords = r?.geometry?.coordinates ?? [];
  const path = coords
    .filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map(([lng, lat]) => ({ lat, lng }));
  if (!r || path.length < 2 || !Number.isFinite(r.distance) || !Number.isFinite(r.duration))
    return null;
  return {
    distanceMiles: Math.round(((r.distance ?? 0) / 1609.344) * 10) / 10,
    durationMinutes: Math.round((r.duration ?? 0) / 60),
    path,
    start: path[0]!,
    end: path[path.length - 1]!,
  };
}

export async function fetchOpenRoute(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal,
): Promise<RealRoute | null> {
  const pts = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  let lastError: unknown = null;
  for (const base of OSRM) {
    try {
      const res = await fetch(`${base}/${pts}?overview=simplified&geometries=geojson`, {
        ...(signal ? { signal } : {}),
      });
      // OSRM answers 400 "NoRoute" when the places aren't connected by road.
      if (res.status === 400) return null;
      if (res.ok) return parseOsrm(await res.json());
      lastError = new Error(`Routing failed (${res.status})`);
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError ?? new Error("Routing failed");
}

/** At most `max` points, evenly spaced along the path, always keeping both ends. */
export function thinPath(path: LatLng[], max: number): LatLng[] {
  if (path.length <= max) return path;
  const out: LatLng[] = [];
  for (let i = 0; i < max; i++) out.push(path[Math.round((i * (path.length - 1)) / (max - 1))]!);
  return out;
}

/** The Overpass query for independent restaurants and cafés right by the road. */
export function foodQuery(path: LatLng[]): string {
  const line = thinPath(path, QUERY_POINTS)
    .map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
    .join(",");
  return `[out:json][timeout:15];node(around:${FOOD_RADIUS_M},${line})["amenity"~"^(restaurant|cafe)$"]["name"]["cuisine"][!"brand"];out tags 120;`;
}

/** Evenly spaced points along the road (not its very ends) to search for sights around. */
export function routeSamplePoints(path: LatLng[]): LatLng[] {
  const cum = cumulative(path);
  const total = cum[cum.length - 1] ?? 0;
  const n = Math.max(3, Math.min(WIKI_MAX_POINTS, Math.round(total / WIKI_SPACING_KM)));
  const out: LatLng[] = [];
  for (let k = 1; k <= n; k++) {
    const target = (total * k) / (n + 1);
    const i = Math.max(
      0,
      cum.findIndex((d) => d >= target),
    );
    out.push(path[i]!);
  }
  return out;
}

/** Cumulative distance (km) at each vertex of the path. */
function cumulative(path: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1]! + kmBetween(path[i - 1]!, path[i]!));
  return out;
}

/** Where a place is along the route (0 to 1) and how far off it (km). */
export function placeOnRoute(
  p: LatLng,
  path: LatLng[],
  cum: number[] = cumulative(path),
): { position: number; offKm: number } {
  let best = 0;
  let bestKm = Infinity;
  for (let i = 0; i < path.length; i++) {
    const km = kmBetween(p, path[i]!);
    if (km < bestKm) {
      bestKm = km;
      best = i;
    }
  }
  const total = cum[cum.length - 1] || 1;
  return { position: cum[best]! / total, offKm: bestKm };
}

/** Extra driving for a there-and-back detour, in 5-minute steps (at least 5). */
export function detourMinutes(offKm: number): number {
  const minutes = ((offKm * 2) / DETOUR_KMH) * 60 + 2;
  return Math.max(5, Math.round(minutes / 5) * 5);
}

interface Kind {
  kind: StopKind;
  label: string;
  interests: Interest[];
  /** Typical entry per person when nothing is published (an estimate), or null */
  typical: number | null;
  free?: boolean;
  family?: boolean;
}

function kindOf(tags: Record<string, string>): Kind | null {
  const t = tags["tourism"];
  const n = tags["natural"];
  const l = tags["leisure"];
  const h = tags["historic"];
  const a = tags["amenity"];
  if (a === "restaurant" || a === "cafe") {
    const cuisine = (tags["cuisine"] ?? "").split(";")[0]!.replace(/_/g, " ").trim();
    const label = a === "cafe" ? "Café" : cuisine ? `${cap(cuisine)} restaurant` : "Restaurant";
    return { kind: "restaurant", label, interests: ["food"], typical: a === "cafe" ? 10 : 20 };
  }
  if (t === "viewpoint")
    return {
      kind: "viewpoint",
      label: "Scenic viewpoint",
      interests: ["nature"],
      typical: 0,
      free: true,
    };
  if (n === "waterfall")
    return {
      kind: "park",
      label: "Waterfall",
      interests: ["nature", "adventure"],
      typical: 0,
      free: true,
    };
  if (n === "beach")
    return {
      kind: "park",
      label: "Beach",
      interests: ["beaches", "nature"],
      typical: 0,
      free: true,
      family: true,
    };
  if (n === "peak")
    return {
      kind: "viewpoint",
      label: "Summit",
      interests: ["nature", "adventure"],
      typical: 0,
      free: true,
    };
  if (n === "cave_entrance")
    return { kind: "attraction", label: "Cave", interests: ["adventure", "nature"], typical: null };
  if (l === "park" || l === "garden")
    return {
      kind: "park",
      label: l === "garden" ? "Garden" : "Park",
      interests: ["nature"],
      typical: 0,
      free: true,
      family: true,
    };
  if (l === "nature_reserve")
    return {
      kind: "park",
      label: "Nature reserve",
      interests: ["nature", "adventure"],
      typical: 0,
      free: true,
    };
  if (t === "museum") {
    const art = /art/i.test(tags["museum"] ?? "");
    return {
      kind: "attraction",
      label: art ? "Art museum" : "Museum",
      interests: [art ? "arts" : "history"],
      typical: 15,
      family: true,
    };
  }
  if (t === "gallery")
    return { kind: "attraction", label: "Gallery", interests: ["arts"], typical: 0, free: true };
  if (t === "zoo")
    return { kind: "attraction", label: "Zoo", interests: ["family"], typical: 25, family: true };
  if (t === "aquarium")
    return {
      kind: "attraction",
      label: "Aquarium",
      interests: ["family"],
      typical: 30,
      family: true,
    };
  if (t === "theme_park")
    return {
      kind: "attraction",
      label: "Theme park",
      interests: ["family", "adventure"],
      typical: 60,
      family: true,
    };
  if (h)
    return {
      kind: "free-activity",
      label: cap(h.replace(/_/g, " ")),
      interests: ["history"],
      typical: null,
    };
  if (t === "attraction")
    return { kind: "attraction", label: "Attraction", interests: [], typical: null };
  return null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A price from OSM tags: fee=no is free, a "$12" charge is listed; anything else isn't known. */
export function costFromTags(
  tags: Record<string, string>,
  k: Pick<Kind, "typical" | "free">,
): { cost: number; source: CostSource } {
  if (tags["fee"] === "no") return { cost: 0, source: "listed" };
  const charge = /(?:\$|USD\s?)(\d+(?:\.\d{1,2})?)/.exec(tags["charge"] ?? "");
  if (charge) return { cost: Number(charge[1]), source: "listed" };
  if (tags["fee"] !== "yes" && k.free) return { cost: 0, source: "price-level" };
  if (k.typical !== null && k.typical > 0) return { cost: k.typical, source: "price-level" };
  return { cost: 0, source: "unknown" };
}

function notability(tags: Record<string, string>, k: Kind, offKm: number): number {
  let s = 0;
  if (tags["wikipedia"]) s += 4;
  else if (tags["wikidata"]) s += 2.5;
  if (k.kind === "restaurant") s += restaurantScore(tags, null) - 1;
  if (tags["website"] || tags["contact:website"]) s += 0.6;
  if (tags["description"]) s += 0.4;
  if (k.kind === "viewpoint") s += 1;
  return s - offKm * 0.3;
}

/** Overpass elements as stops along the route, best first within each stretch. */
export function parseRouteStops(body: unknown, route: RealRoute): RouteStop[] {
  const elements = (body as { elements?: Record<string, unknown>[] })?.elements ?? [];
  const cum = cumulative(route.path);
  const seen = new Set<string>();
  const found: (RouteStop & { _score: number })[] = [];
  for (const e of elements) {
    const tags = (e["tags"] ?? {}) as Record<string, string>;
    const name = tags["name"]?.trim();
    const k = kindOf(tags);
    if (!name || !k || name.length > 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    const c = (e["center"] as { lat?: number; lon?: number } | undefined) ?? e;
    const lat = Number((c as { lat?: unknown }).lat);
    const lng = Number((c as { lon?: unknown }).lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    seen.add(key);
    const loc = { lat, lng };
    const { position, offKm } = placeOnRoute(loc, route.path, cum);
    // The very start and end are the trip itself, not a stop on the way.
    if (position < 0.03 || position > 0.97) continue;
    const { cost, source } = costFromTags(tags, k);
    const tagSet = new Set<StopTag>();
    if (cost === 0 && source !== "unknown") tagSet.add("free");
    if (k.kind === "restaurant") tagSet.add("food");
    else tagSet.add("sightseeing");
    if (k.family) tagSet.add("family");
    if (!tags["wikipedia"] && !tags["wikidata"] && k.kind !== "restaurant")
      tagSet.add("hidden-gem");
    const type = String(e["type"] ?? "node");
    const id = String(e["id"] ?? key);
    const town = tags["addr:city"] ?? tags["is_in:city"] ?? null;
    found.push({
      id: `osm-${type}-${id}`,
      name,
      kind: k.kind,
      description: (tags["description"]?.slice(0, 160) || k.label) + (town ? ` · ${town}` : ""),
      position: Math.round(position * 1000) / 1000,
      costPerPerson: cost,
      extraMinutes: detourMinutes(offKm),
      interests: k.interests,
      tags: [...tagSet],
      location: loc,
      placeId: `osm:${type}/${id}`,
      isDemo: false,
      costSource: source,
      rating: null,
      ratingCount: null,
      address: town,
      mapsUrl: `https://www.openstreetmap.org/${type}/${id}`,
      _score: notability(tags, k, offKm),
    });
  }
  return spreadAlongRoute(
    found.sort((a, b) => b._score - a._score),
    MAX_STOPS,
  )
    .map(({ _score, ...s }) => s)
    .sort((a, b) => a.position - b.position);
}

/** What kind of stop a Wikipedia sight is, from its short description. */
function wikiKind(description: string): Pick<Kind, "kind" | "typical" | "free" | "family"> {
  if (/\bzoo\b|aquarium/i.test(description))
    return { kind: "attraction", typical: 25, family: true };
  if (/theme park|amusement park/i.test(description))
    return { kind: "attraction", typical: 60, family: true };
  if (/museum|gallery|science (centre|center)/i.test(description))
    return { kind: "attraction", typical: 15, family: true };
  if (
    /waterfall|\bfalls\b|overlook|lookout|viewpoint|summit|mountain|\bpeak\b|gorge|canyon|scenic/i.test(
      description,
    )
  )
    return { kind: "viewpoint", typical: 0, free: true };
  if (/\bpark\b|forest|reserve|\blake\b|garden|\btrail\b|beach|river/i.test(description))
    return { kind: "park", typical: 0, free: true, family: true };
  return { kind: "free-activity", typical: null };
}

/** Not a road-trip stop, whatever Wikipedia files it under. */
const NOT_STOPS =
  /\b(shopping (mall|center|centre)|mall\b|baseball|softball|football|soccer|stadium|arena|country club|golf|school|college|inn\b|hotel|motel|resort|office|apartment|cemetery|ranger station|post office|courthouse|jail|prison)\b/i;
/** The register's long tail (a listed house or district): only worth a detour when people read about it. */
const LISTED_ONLY =
  /^(united states historic place|historic (house|home|district|farm|building|church|library)|house in|building in)/i;

/** Whether enough people look a sight up for it to be worth the detour (monthly page views). */
export function worthTheDetour(description: string, kind: StopKind, views: number | null): boolean {
  if (NOT_STOPS.test(description)) return false;
  if (views === null) return !LISTED_ONLY.test(description);
  if (LISTED_ONLY.test(description)) return views >= 2500;
  return views >= (kind === "viewpoint" || kind === "park" ? 60 : 250);
}

/** Wikipedia's nearby sights as stops along the route, keeping only those near the road. */
export function parseWikiRouteStops(bodies: unknown[], route: RealRoute): RouteStop[] {
  const cum = cumulative(route.path);
  const seen = new Set<string>();
  const out: (RouteStop & { _score: number })[] = [];
  for (const body of bodies) {
    const pages = (body as { query?: { pages?: Record<string, Record<string, unknown>> } })?.query
      ?.pages;
    for (const p of Object.values(pages ?? {})) {
      const title = String(p["title"] ?? "");
      const description = String(p["description"] ?? "");
      const interests = classifySight(description);
      const c = (p["coordinates"] as { lat: number; lon: number }[] | undefined)?.[0];
      if (!title || !interests || !c || seen.has(title)) continue;
      const loc = { lat: c.lat, lng: c.lon };
      const { position, offKm } = placeOnRoute(loc, route.path, cum);
      if (offKm > SIGHT_MAX_KM || position < 0.03 || position > 0.97) continue;
      seen.add(title);
      const k = wikiKind(description);
      const views =
        typeof p["pageviews"] === "object" && p["pageviews"]
          ? Object.values(p["pageviews"] as Record<string, unknown>).reduce<number>(
              (n, v) => n + (typeof v === "number" ? v : 0),
              0,
            )
          : null;
      if (!worthTheDetour(description, k.kind, views)) continue;
      const { cost, source } = costFromTags({}, k);
      const tags = new Set<StopTag>(["sightseeing"]);
      if (cost === 0 && source !== "unknown") tags.add("free");
      if (k.family) tags.add("family");
      if (views !== null && views < 1500) tags.add("hidden-gem");
      const label = description.charAt(0).toUpperCase() + description.slice(1);
      const id = String(p["pageid"] ?? title);
      out.push({
        id: `wiki-${id}`,
        name: title,
        kind: k.kind,
        description: label.slice(0, 160),
        position: Math.round(position * 1000) / 1000,
        costPerPerson: cost,
        extraMinutes: detourMinutes(offKm),
        interests,
        tags: [...tags],
        location: loc,
        placeId: `wiki:${id}`,
        isDemo: false,
        costSource: source,
        rating: null,
        ratingCount: null,
        address: null,
        mapsUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        _score: fameScore(
          views,
          typeof p["length"] === "number" ? (p["length"] as number) : null,
          offKm,
        ),
      });
    }
  }
  return out.sort((a, b) => b._score - a._score).map(({ _score, ...s }) => s);
}

/** One Wikipedia API call, asking once more after a short wait if it's busy. */
async function wikiApi(params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const u = new URL(WIKI);
  for (const [key, v] of Object.entries({
    action: "query",
    format: "json",
    origin: "*",
    ...params,
  }))
    u.searchParams.set(key, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(u.toString(), signal ? { signal } : {});
    if (res.ok) return res.json();
    if (res.status !== 429 || attempt > 0) throw new Error(`Wikipedia error (${res.status})`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

type WikiPages = Record<string, Record<string, unknown>>;
const pagesOf = (body: unknown): WikiPages =>
  (body as { query?: { pages?: WikiPages } })?.query?.pages ?? {};

/**
 * The 50 articles nearest a point on the road with their short descriptions,
 * coordinates and length. Geosearch is cheap for Wikipedia to answer.
 */
function wikiNear(at: LatLng, signal?: AbortSignal) {
  return wikiApi(
    {
      generator: "geosearch",
      ggscoord: `${at.lat.toFixed(4)}|${at.lng.toFixed(4)}`,
      ggsradius: "10000",
      ggslimit: "50",
      prop: "description|coordinates|info",
      colimit: "max",
    },
    signal,
  );
}

/**
 * The likely sights among all the articles found along the road: described as
 * something travelers visit and close enough to the road, longest articles
 * first, so one page-views request can rank the best 50.
 */
export function sightCandidates(pages: WikiPages, route: RealRoute, max = 50): string[] {
  const cum = cumulative(route.path);
  return Object.entries(pages)
    .filter(([, p]) => {
      const description = String(p["description"] ?? "");
      const c = (p["coordinates"] as { lat: number; lon: number }[] | undefined)?.[0];
      if (!c || !classifySight(description) || NOT_STOPS.test(description)) return false;
      return placeOnRoute({ lat: c.lat, lng: c.lon }, route.path, cum).offKm <= SIGHT_MAX_KM;
    })
    .sort(([, a], [, b]) => Number(b["length"] ?? 0) - Number(a["length"] ?? 0))
    .slice(0, max)
    .map(([id]) => id);
}

/** Best first, taken in turn from each fifth of the route so stops aren't all near one town. */
export function spreadAlongRoute<T extends { position: number }>(list: T[], keep: number): T[] {
  const buckets: T[][] = [[], [], [], [], []];
  for (const s of list) buckets[Math.min(4, Math.floor(s.position * 5))]!.push(s);
  const out: T[] = [];
  for (let i = 0; out.length < keep && buckets.some((b) => b.length > i); i++)
    for (const b of buckets) if (b[i] && out.length < keep) out.push(b[i]!);
  return out;
}

async function foodAlongRoute(route: RealRoute, signal?: AbortSignal): Promise<RouteStop[]> {
  const query = foodQuery(route.path);
  const timeout = AbortSignal.timeout(FOOD_TIMEOUT_MS);
  const both = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal: both,
      });
      if (res.ok) return parseRouteStops(await res.json(), route);
    } catch (e) {
      if (both.aborted) throw e;
    }
  }
  throw new Error("OpenStreetMap didn't respond.");
}

/**
 * Sights from Wikipedia along the whole road plus, when OpenStreetMap answers in
 * time, independent places to eat right by it; spread along the route. Throws
 * only when there are no sights at all.
 */
export async function fetchStopsAlongRoute(
  route: RealRoute,
  signal?: AbortSignal,
): Promise<{ stops: RouteStop[]; food: boolean }> {
  const food = foodAlongRoute(route, signal).catch((e) => {
    if (signal?.aborted) throw e;
    return null;
  });
  // One point at a time: a handful of cheap requests, never a burst.
  const pages: WikiPages = {};
  let answered = 0;
  for (const point of routeSamplePoints(route.path)) {
    try {
      Object.assign(pages, pagesOf(await wikiNear(point, signal)));
      answered++;
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  if (answered === 0) throw new Error("Wikipedia didn't respond.");
  const ids = sightCandidates(pages, route);
  // Rank by how many people read about each place; without views, the stricter rules apply.
  if (ids.length) {
    try {
      const views = pagesOf(
        await wikiApi({ pageids: ids.join("|"), prop: "pageviews", pvipdays: "30" }, signal),
      );
      for (const id of ids)
        if (views[id]?.["pageviews"]) pages[id]!["pageviews"] = views[id]!["pageviews"];
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  const sights = parseWikiRouteStops(
    [{ query: { pages: Object.fromEntries(ids.map((id) => [id, pages[id]!])) } }],
    route,
  );
  const meals = await food;
  const names = new Set(sights.map((s) => s.name.toLowerCase()));
  const extra = (meals ?? []).filter((s) => !names.has(s.name.toLowerCase()));
  const stops = [
    ...spreadAlongRoute(sights, MAX_STOPS - Math.min(12, extra.length)),
    ...spreadAlongRoute(extra, 12),
  ].sort((a, b) => a.position - b.position);
  return { stops, food: meals !== null };
}

export type OpenRouteResult =
  /** `food` is false when OpenStreetMap didn't answer in time, so there are no meal stops. */
  { ok: true; route: RealRoute; stops: RouteStop[]; food: boolean } | { ok: false; error: string };

/**
 * The whole lookup for the road-trip page: find both places (known points win
 * over a text search), the road between them, then the stops along it.
 */
export async function findOpenRoute(
  req: { origin: string; destination: string; from?: LatLng | null; to?: LatLng | null },
  signal?: AbortSignal,
): Promise<OpenRouteResult> {
  const locate = async (text: string, known?: LatLng | null) => {
    if (known) return known;
    const [hit] = await searchPlaces(text, 1, signal);
    return hit ? { lat: hit.lat, lng: hit.lon } : null;
  };
  const [from, to] = await Promise.all([
    locate(req.origin, req.from),
    locate(req.destination, req.to),
  ]);
  if (!from || !to)
    return {
      ok: false,
      error: `We couldn't find ${!from ? req.origin : req.destination} on the map. Try a city and state.`,
    };
  const route = await fetchOpenRoute(from, to, signal);
  if (!route)
    return {
      ok: false,
      error: "There's no driving route between those places. Try nearby cities.",
    };
  const { stops, food } = await fetchStopsAlongRoute(route, signal);
  return { ok: true, route, stops, food };
}
