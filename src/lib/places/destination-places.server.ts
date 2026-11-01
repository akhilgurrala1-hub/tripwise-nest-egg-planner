// Server-only: real sights and restaurants in a destination via the Google Maps connector.
import type { Interest, TravelStyle } from "../demo-data";
import { FOOD_TYPES, GatewayError, TYPE_INTERESTS, costFor, gatewayPost, type GPlace } from "./google-stops.server";
import type { DestinationPlacesResult, RealPlace } from "./types";

/** Each Text Search is billed per request: a fixed number of queries, one page each. */
const MAX_INTEREST_QUERIES = 2;
const PAGE_SIZE = 20;

const INTEREST_QUERY: Partial<Record<Interest, string>> = {
  nature: "parks and nature spots",
  history: "history museums and landmarks",
  beaches: "beaches",
  arts: "art museums and galleries",
  adventure: "hiking trails and outdoor activities",
  family: "family-friendly attractions",
  nightlife: "live music venues",
  shopping: "shopping districts and markets",
  food: "food markets",
};

const RESTAURANT_PRICE_LEVELS: Record<TravelStyle, string[]> = {
  budget: ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"],
  comfort: ["PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE"],
  luxury: ["PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"],
};

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.priceRange",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.editorialSummary",
  "places.googleMapsUri",
  "places.businessStatus",
].join(",");

type Place = GPlace & { businessStatus?: string };

function toRealPlace(p: Place, kind: RealPlace["kind"]): RealPlace | null {
  const name = p.displayName?.text;
  if (!name || (p.businessStatus && p.businessStatus !== "OPERATIONAL")) return null;
  const types = p.types ?? [];
  const { cost, source } = costFor(p);
  return {
    placeId: p.id,
    name,
    kind,
    typeLabel: p.primaryTypeDisplayName?.text ?? "",
    description: p.editorialSummary?.text ?? "",
    address: p.formattedAddress ?? null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    mapsUrl: p.googleMapsUri ?? null,
    costPerPerson: cost,
    costSource: source,
    interests: Array.from(new Set(TYPE_INTERESTS.filter(([t]) => types.includes(t)).map(([, i]) => i))),
  };
}

export async function findDestinationPlaces(input: {
  destination: string;
  interests: Interest[];
  style: TravelStyle;
}): Promise<DestinationPlacesResult> {
  const lovable = process.env["LOVABLE_API_KEY"];
  const maps = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovable || !maps) return { ok: false, error: "The map service isn't connected yet." };
  const keys = { lovable, maps };

  const sightQueries = [
    "top tourist attractions",
    ...input.interests.map((i) => INTEREST_QUERY[i]).filter((q): q is string => !!q).slice(0, MAX_INTEREST_QUERIES),
  ];
  const requests = [
    ...sightQueries.map((q) => ({
      kind: "sight" as const,
      body: { textQuery: `${q} in ${input.destination}`, pageSize: PAGE_SIZE },
    })),
    {
      kind: "restaurant" as const,
      body: {
        textQuery: `restaurants in ${input.destination}`,
        pageSize: PAGE_SIZE,
        priceLevels: RESTAURANT_PRICE_LEVELS[input.style],
        minRating: 4,
      },
    },
  ];

  try {
    const results = await Promise.allSettled(
      requests.map((r) => gatewayPost("/places/v1/places:searchText", r.body, FIELD_MASK, keys).then((data) => ({ r, data }))),
    );
    const sights = new Map<string, RealPlace>();
    const restaurants = new Map<string, RealPlace>();
    for (const res of results) {
      if (res.status !== "fulfilled") continue;
      for (const p of (res.value.data?.places ?? []) as Place[]) {
        const isFood = FOOD_TYPES.some((t) => (p.types ?? []).includes(t));
        const kind = res.value.r.kind === "restaurant" || isFood ? "restaurant" : "sight";
        const target = kind === "restaurant" ? restaurants : sights;
        if (sights.has(p.id) || restaurants.has(p.id)) continue;
        const place = toRealPlace(p, kind);
        if (place) target.set(p.id, place);
      }
    }
    if (sights.size === 0 && restaurants.size === 0) {
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) {
        const e = failed.reason;
        return { ok: false, error: e instanceof GatewayError ? e.message : "The map service couldn't find places." };
      }
      return { ok: false, error: `No places found for "${input.destination}". Try a city and state.` };
    }
    return { ok: true, sights: Array.from(sights.values()), restaurants: Array.from(restaurants.values()) };
  } catch (err) {
    if (err instanceof GatewayError) return { ok: false, error: err.message };
    console.error("findDestinationPlaces failed", err);
    return { ok: false, error: "The map service couldn't complete the request." };
  }
}
