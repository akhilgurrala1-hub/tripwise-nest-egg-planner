// Server-only: real routes and places along a route via the Google Maps connector.
import type { Interest } from "../demo-data";
import type { CostSource, RealStopsResult, RouteStop, StopKind, StopTag } from "../routing/types";

export const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const MAX_QUERIES = 5;
/** Google bills Text Search per request, so ask for a full page and spread picks along the route. */
const RESULTS_PER_QUERY = 20;
const KEEP_PER_QUERY = 8;

interface QuerySpec {
  text: string;
  kind: StopKind;
}

const BASE_QUERIES: QuerySpec[] = [
  { text: "scenic viewpoint", kind: "viewpoint" },
  { text: "local restaurant", kind: "restaurant" },
  { text: "park", kind: "park" },
];

const INTEREST_QUERIES: Partial<Record<Interest, QuerySpec>> = {
  history: { text: "history museum", kind: "attraction" },
  beaches: { text: "beach", kind: "park" },
  arts: { text: "art gallery", kind: "attraction" },
  family: { text: "family attraction", kind: "attraction" },
  adventure: { text: "hiking trail", kind: "park" },
  shopping: { text: "farmers market", kind: "free-activity" },
  nightlife: { text: "brewery", kind: "restaurant" },
  nature: { text: "waterfall", kind: "park" },
  food: { text: "bakery", kind: "restaurant" },
};

export const FOOD_TYPES = ["restaurant", "cafe", "bakery", "food", "meal_takeaway", "bar", "brewery", "winery", "coffee_shop"];
const FAMILY_TYPES = ["amusement_park", "zoo", "aquarium", "playground", "park", "museum", "water_park", "childrens_camp"];
export const TYPE_INTERESTS: [string, Interest][] = [
  ["park", "nature"],
  ["scenic_spot", "nature"],
  ["hiking_area", "adventure"],
  ["national_park", "nature"],
  ["museum", "history"],
  ["historical_landmark", "history"],
  ["historical_place", "history"],
  ["art_gallery", "arts"],
  ["beach", "beaches"],
  ["restaurant", "food"],
  ["bakery", "food"],
  ["cafe", "food"],
  ["market", "shopping"],
  ["shopping_mall", "shopping"],
  ["bar", "nightlife"],
  ["brewery", "nightlife"],
  ["amusement_park", "family"],
  ["zoo", "family"],
  ["aquarium", "family"],
];

/** Per-person estimate when a listing only publishes a $ level. */
const PRICE_LEVEL_ESTIMATE: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 12,
  PRICE_LEVEL_MODERATE: 25,
  PRICE_LEVEL_EXPENSIVE: 50,
  PRICE_LEVEL_VERY_EXPENSIVE: 90,
};

export interface GPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  priceRange?: { startPrice?: { units?: string }; endPrice?: { units?: string } };
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  editorialSummary?: { text?: string };
  goodForChildren?: boolean;
  googleMapsUri?: string;
}

interface GLeg {
  duration?: string;
}

const seconds = (d?: string) => {
  const n = d ? parseFloat(d.replace("s", "")) : NaN;
  return Number.isFinite(n) ? n : null;
};

export class GatewayError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function gatewayPost(path: string, body: unknown, fieldMask: string, keys: { lovable: string; maps: string }) {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${keys.lovable}`,
      "X-Connection-Api-Key": keys.maps,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Maps gateway ${path} failed [${res.status}]: ${text}`);
    if (res.status === 403) {
      if (text.includes("API_KEY_HTTP_REFERRER_BLOCKED"))
        throw new GatewayError(403, "The map service key is restricted to websites. Set its application restriction to None or IP addresses.");
      if (text.includes("API_KEY_SERVICE_BLOCKED"))
        throw new GatewayError(403, "The map service key doesn't allow this API. Add Routes API and Places API (New) to its allowed APIs.");
      throw new GatewayError(403, "The map service denied the request.");
    }
    if (res.status === 429) throw new GatewayError(429, "The map service is busy. Please try again in a minute.");
    throw new GatewayError(res.status, "The map service couldn't complete the request.");
  }
  return res.json();
}

function buildQueries(interests: Interest[]): QuerySpec[] {
  const list = [...BASE_QUERIES];
  for (const i of interests) {
    const q = INTEREST_QUERIES[i];
    if (q && !list.some((x) => x.text === q.text)) list.push(q);
    if (list.length >= MAX_QUERIES) break;
  }
  if (list.length < MAX_QUERIES) list.push({ text: "tourist attraction", kind: "attraction" });
  return list.slice(0, MAX_QUERIES);
}

export function costFor(p: GPlace): { cost: number; source: CostSource } {
  const start = Number(p.priceRange?.startPrice?.units);
  const end = Number(p.priceRange?.endPrice?.units);
  if (Number.isFinite(start) && start >= 0) {
    const hi = Number.isFinite(end) && end >= start ? end : start;
    return { cost: Math.round(((start + hi) / 2) * 100) / 100, source: "listed" };
  }
  if (p.priceLevel && p.priceLevel in PRICE_LEVEL_ESTIMATE) {
    return { cost: PRICE_LEVEL_ESTIMATE[p.priceLevel]!, source: "price-level" };
  }
  return { cost: 0, source: "unknown" };
}

function toStop(p: GPlace, legs: GLeg[] | undefined, spec: QuerySpec, routeSeconds: number): RouteStop | null {
  const name = p.displayName?.text;
  if (!name || !p.location) return null;
  const types = p.types ?? [];
  const toPlace = seconds(legs?.[0]?.duration);
  const toDest = seconds(legs?.[1]?.duration);
  if (toPlace === null || toDest === null) return null;

  const detourMin = Math.max(0, Math.round((toPlace + toDest - routeSeconds) / 60));
  const position = Math.min(0.98, Math.max(0.02, toPlace / (toPlace + toDest)));
  const { cost, source } = costFor(p);

  const isFood = FOOD_TYPES.some((t) => types.includes(t));
  const kind: StopKind = isFood ? "restaurant" : spec.kind;
  const tags = new Set<StopTag>();
  if (p.priceLevel === "PRICE_LEVEL_FREE") tags.add("free");
  if (isFood) tags.add("food");
  else tags.add("sightseeing");
  if (p.goodForChildren || FAMILY_TYPES.some((t) => types.includes(t))) tags.add("family");
  if ((p.rating ?? 0) >= 4.5 && (p.userRatingCount ?? 0) > 0 && (p.userRatingCount ?? 0) < 500) tags.add("hidden-gem");

  const interests = Array.from(new Set(TYPE_INTERESTS.filter(([t]) => types.includes(t)).map(([, i]) => i)));

  return {
    id: `g-${p.id}`,
    name,
    kind,
    description: p.editorialSummary?.text ?? p.primaryTypeDisplayName?.text ?? "",
    position,
    costPerPerson: cost,
    extraMinutes: detourMin,
    interests,
    tags: Array.from(tags),
    location: { lat: p.location.latitude, lng: p.location.longitude },
    placeId: p.id,
    isDemo: false,
    costSource: source,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    address: p.formattedAddress ?? null,
    mapsUrl: p.googleMapsUri ?? null,
  };
}

/** Keep results in Google's relevance order but round-robin across route quarters so stops aren't all near the start. */
function spreadAlongRoute(list: RouteStop[], keep: number): RouteStop[] {
  const buckets: RouteStop[][] = [[], [], [], []];
  for (const s of list) buckets[Math.min(3, Math.floor(s.position * 4))]!.push(s);
  const out: RouteStop[] = [];
  for (let i = 0; out.length < keep && buckets.some((b) => b.length > i); i++) {
    for (const b of buckets) if (b[i] && out.length < keep) out.push(b[i]!);
  }
  return out;
}

export async function findRealStops(input: {
  origin: string;
  destination: string;
  interests: Interest[];
}): Promise<RealStopsResult> {
  const lovable = process.env["LOVABLE_API_KEY"];
  const maps = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovable || !maps) return { ok: false, error: "The map service isn't connected yet." };
  const keys = { lovable, maps };

  try {
    const routeRes = await gatewayPost(
      "/routes/directions/v2:computeRoutes",
      {
        origin: { address: input.origin },
        destination: { address: input.destination },
        travelMode: "DRIVE",
        polylineQuality: "OVERVIEW",
      },
      "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation",
      keys,
    );
    const route = routeRes?.routes?.[0];
    const polyline: string | undefined = route?.polyline?.encodedPolyline;
    const routeSeconds = seconds(route?.duration);
    const start = route?.legs?.[0]?.startLocation?.latLng;
    const end = route?.legs?.[route?.legs?.length - 1]?.endLocation?.latLng;
    if (!polyline || routeSeconds === null || !start || !end) {
      return { ok: false, error: "Couldn't find a driving route between those places. Try a city and state." };
    }

    const queries = buildQueries(input.interests);
    const fieldMask = [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.rating",
      "places.userRatingCount",
      "places.priceLevel",
      "places.priceRange",
      "places.primaryType",
      "places.primaryTypeDisplayName",
      "places.types",
      "places.editorialSummary",
      "places.goodForChildren",
      "places.googleMapsUri",
      "routingSummaries",
    ].join(",");

    const results = await Promise.allSettled(
      queries.map((q) =>
        gatewayPost(
          "/places/v1/places:searchText",
          {
            textQuery: q.text,
            pageSize: RESULTS_PER_QUERY,
            searchAlongRouteParameters: { polyline: { encodedPolyline: polyline } },
            routingParameters: { origin: { latitude: start.latitude, longitude: start.longitude } },
          },
          fieldMask,
          keys,
        ).then((data) => ({ q, data })),
      ),
    );

    const firstError = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    const stops = new Map<string, RouteStop>();
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const places: GPlace[] = r.value.data?.places ?? [];
      const summaries: { legs?: GLeg[] }[] = r.value.data?.routingSummaries ?? [];
      const candidates = places
        .map((p, i) => (stops.has(`g-${p.id}`) ? null : toStop(p, summaries[i]?.legs, r.value.q, routeSeconds)))
        .filter((x): x is RouteStop => x !== null);
      for (const stop of spreadAlongRoute(candidates, KEEP_PER_QUERY)) stops.set(stop.id, stop);
    }
    if (stops.size === 0 && firstError) {
      const e = firstError.reason;
      return { ok: false, error: e instanceof GatewayError ? e.message : "The map service couldn't find stops." };
    }

    return {
      ok: true,
      route: {
        distanceMiles: Math.round(((route.distanceMeters ?? 0) / 1609.344) * 10) / 10,
        durationMinutes: Math.round(routeSeconds / 60),
        encodedPolyline: polyline,
        start: { lat: start.latitude, lng: start.longitude },
        end: { lat: end.latitude, lng: end.longitude },
      },
      stops: Array.from(stops.values()).sort((a, b) => a.position - b.position),
    };
  } catch (err) {
    if (err instanceof GatewayError) return { ok: false, error: err.message };
    console.error("findRealStops failed", err);
    return { ok: false, error: "The map service couldn't complete the request." };
  }
}
