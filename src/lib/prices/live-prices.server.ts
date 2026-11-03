// Server-only: live gas (U.S. EIA), hotel and flight prices (Google via SerpApi).
import type { TravelStyle } from "../demo-data";
import {
  gasAreaFor,
  perPersonFare,
  pickNightly,
  type FlightOption,
  type FlightQuote,
  type GasQuote,
  type HotelOption,
  type HotelQuote,
  type LivePricesResult,
} from "./live";

import {
  cachedLookup,
  keyPart,
  priceCache,
  PRICE_TTL,
  type Cached,
  type PriceCache,
} from "./cache.server";
import { priceKey } from "./keys.server";

const SERPAPI = "https://serpapi.com/search.json";
const EIA = "https://api.eia.gov/v2/petroleum/pri/gnd/data/";

export interface LivePricesRequest {
  destination: string;
  origin: string;
  startDate: string;
  endDate: string;
  travelers: number;
  rooms: number;
  style: TravelStyle;
  includeFlights: boolean;
  /** False on cruises (the cabin replaces hotels) and staycations at home */
  includeHotels: boolean;
  originAirport: string;
  destinationAirport: string;
}

class PriceError extends Error {}

async function getJson(url: string, label: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok || typeof body["error"] === "string") {
    // Never log the request URL: it carries the API key.
    console.error(
      `${label} failed [${res.status}]: ${String(body["error"] ?? text).slice(0, 300)}`,
    );
    if (res.status === 401 || res.status === 403)
      throw new PriceError(`${label}: the API key was rejected.`);
    if (res.status === 429)
      throw new PriceError(`${label}: the monthly search allowance is used up or busy.`);
    if (
      typeof body["error"] === "string" &&
      /hasn't returned any results/i.test(body["error"] as string)
    ) {
      throw new PriceError(`${label}: no results for these dates and places.`);
    }
    throw new PriceError(`${label}: the price service didn't respond.`);
  }
  return body;
}

function serpUrl(params: Record<string, string | number>, key: string) {
  const u = new URL(SERPAPI);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  u.searchParams.set("api_key", key);
  return u.toString();
}

function gasQuote(place: string, key: string, cache: PriceCache): Promise<Cached<GasQuote>> {
  const area = gasAreaFor(place);
  return cachedLookup(cache, `gas|${area.code}`, PRICE_TTL.gas, () => loadGas(area, key));
}

async function loadGas(area: ReturnType<typeof gasAreaFor>, key: string): Promise<GasQuote> {
  const u = new URL(EIA);
  u.searchParams.set("api_key", key);
  u.searchParams.set("frequency", "weekly");
  u.searchParams.append("data[0]", "value");
  u.searchParams.append("facets[product][]", "EPMR");
  u.searchParams.append("facets[duoarea][]", area.code);
  u.searchParams.append("sort[0][column]", "period");
  u.searchParams.append("sort[0][direction]", "desc");
  u.searchParams.set("length", "1");
  const body = await getJson(u.toString(), "Gas prices");
  const row = ((body["response"] as { data?: { period: string; value: string }[] } | undefined)
    ?.data ?? [])[0];
  const price = Number(row?.value);
  if (!row || !Number.isFinite(price) || price <= 0)
    throw new PriceError("Gas prices: no recent survey found.");
  return { price: Math.round(price * 100) / 100, areaLabel: area.label, period: row.period };
}

interface SerpHotel {
  type?: string;
  name?: string;
  extracted_hotel_class?: number;
  overall_rating?: number;
  reviews?: number;
  link?: string;
  images?: { thumbnail?: string }[];
  rate_per_night?: { extracted_before_taxes_fees?: number; extracted_lowest?: number };
  total_rate?: { extracted_lowest?: number };
}

async function hotelQuote(
  req: LivePricesRequest,
  key: string,
  cache: PriceCache,
): Promise<Cached<HotelQuote>> {
  const adults = Math.max(1, Math.min(6, Math.ceil(req.travelers / Math.max(1, req.rooms))));
  // The listings don't depend on travel style, so every style shares one search.
  const listed = await cachedLookup(
    cache,
    ["hotels", keyPart(req.destination), req.startDate, req.endDate, adults].join("|"),
    PRICE_TTL.hotels,
    () => hotelOptions(req, adults, key),
  );
  const options = listed.value;
  const pick = pickNightly(options, req.style);
  const searchUrl = `https://www.google.com/travel/hotels/${encodeURIComponent(req.destination)}?q=${encodeURIComponent(
    `hotels in ${req.destination}`,
  )}&dates=${req.startDate},${req.endDate}`;
  return {
    ...listed,
    value: {
      checkIn: req.startDate,
      checkOut: req.endDate,
      nightly: pick.nightly,
      pickLabel: pick.label,
      options,
      searchUrl,
    },
  };
}

async function hotelOptions(
  req: LivePricesRequest,
  adults: number,
  key: string,
): Promise<HotelOption[]> {
  const params = {
    engine: "google_hotels",
    q: req.destination,
    check_in_date: req.startDate,
    check_out_date: req.endDate,
    adults,
    currency: "USD",
    gl: "us",
    hl: "en",
  };
  const body = await getJson(serpUrl(params, key), "Hotel prices");
  const options: HotelOption[] = ((body["properties"] as SerpHotel[] | undefined) ?? [])
    .map((p) => {
      const nightly =
        p.rate_per_night?.extracted_before_taxes_fees ?? p.rate_per_night?.extracted_lowest ?? 0;
      return {
        name: p.name ?? "",
        hotelClass: p.extracted_hotel_class ?? null,
        rating: p.overall_rating ?? null,
        reviews: p.reviews ?? null,
        nightly: Math.round(nightly * 100) / 100,
        totalWithTaxes: p.total_rate?.extracted_lowest ?? null,
        link: p.link ?? null,
        image: p.images?.[0]?.thumbnail ?? null,
      };
    })
    .filter((o) => o.name && o.nightly > 0)
    .slice(0, 12);
  if (options.length === 0) throw new PriceError("Hotel prices: no rooms listed for these dates.");
  return options;
}

/** The airport for a place, remembered for a week (only when one was found). */
async function airportFor(place: string, key: string, cache: PriceCache): Promise<string | null> {
  const cacheKey = `airport|${keyPart(place)}`;
  const known = await cache.get<string>(cacheKey).catch(() => null);
  if (known) return known.value;
  const code = await lookupAirport(place, key);
  if (code) await cache.set(cacheKey, code, PRICE_TTL.airport).catch(() => undefined);
  return code;
}

async function lookupAirport(place: string, key: string): Promise<string | null> {
  const body = await getJson(
    serpUrl({ engine: "google_flights_autocomplete", q: place, gl: "us", hl: "en" }, key),
    "Airport lookup",
  );
  const s = (
    body["suggestions"] as
      { type?: string; id?: string; airports?: { id?: string }[] }[] | undefined
  )?.[0];
  if (!s) return null;
  if (s.type === "airport" && s.id && /^[A-Z]{3}$/.test(s.id)) return s.id;
  return s.airports?.find((a) => a.id && /^[A-Z]{3}$/.test(a.id))?.id ?? null;
}

interface SerpFlightGroup {
  price?: number;
  total_duration?: number;
  flights?: {
    airline?: string;
    departure_airport?: { time?: string };
    arrival_airport?: { time?: string };
  }[];
}

async function flightQuote(
  req: LivePricesRequest,
  key: string,
  cache: PriceCache,
): Promise<Cached<FlightQuote>> {
  const [from, to] = await Promise.all([
    req.originAirport || airportFor(req.origin, key, cache),
    req.destinationAirport || airportFor(req.destination, key, cache),
  ]);
  if (!from || !to)
    throw new PriceError(
      "Flight prices: couldn't find an airport for your start or destination. Add your home airport in your profile.",
    );
  if (from === to)
    throw new PriceError("Flight prices: your start and destination use the same airport.");
  return cachedLookup(
    cache,
    ["flights", from, to, req.startDate, req.endDate, req.travelers].join("|"),
    PRICE_TTL.flights,
    () => loadFlights(req, from, to, key),
  );
}

async function loadFlights(
  req: LivePricesRequest,
  from: string,
  to: string,
  key: string,
): Promise<FlightQuote> {
  const body = await getJson(
    serpUrl(
      {
        engine: "google_flights",
        departure_id: from,
        arrival_id: to,
        outbound_date: req.startDate,
        return_date: req.endDate,
        type: 1,
        adults: req.travelers,
        currency: "USD",
        gl: "us",
        hl: "en",
      },
      key,
    ),
    "Flight prices",
  );
  const groups = [
    ...((body["best_flights"] as SerpFlightGroup[]) ?? []),
    ...((body["other_flights"] as SerpFlightGroup[]) ?? []),
  ];
  const options: FlightOption[] = groups
    .filter((g) => typeof g.price === "number" && g.price > 0 && g.flights?.length)
    .map((g) => ({
      airlines: Array.from(new Set(g.flights!.map((f) => f.airline ?? "").filter(Boolean))),
      stops: g.flights!.length - 1,
      durationMinutes: g.total_duration ?? 0,
      departs: g.flights![0]!.departure_airport?.time ?? "",
      arrives: g.flights![g.flights!.length - 1]!.arrival_airport?.time ?? "",
      perPerson: perPersonFare(g.price!, req.travelers),
    }))
    .sort((a, b) => a.perPerson - b.perPerson)
    .slice(0, 8);
  if (options.length === 0)
    throw new PriceError("Flight prices: no round trips listed for these dates.");
  const insights = body["price_insights"] as { typical_price_range?: [number, number] } | undefined;
  const range = insights?.typical_price_range;
  return {
    originAirport: from,
    destinationAirport: to,
    departDate: req.startDate,
    returnDate: req.endDate,
    perPerson: options[0]!.perPerson,
    typicalRange: range
      ? [perPersonFare(range[0], req.travelers), perPersonFare(range[1], req.travelers)]
      : null,
    options,
    bookingUrl:
      (body["search_metadata"] as { google_flights_url?: string } | undefined)
        ?.google_flights_url ?? null,
  };
}

const reason = (r: PromiseRejectedResult) =>
  r.reason instanceof PriceError ? r.reason.message : "A price service didn't respond.";

export async function fetchLivePrices(
  req: LivePricesRequest,
  cache: PriceCache = priceCache(),
): Promise<LivePricesResult> {
  const serp = priceKey("serpapi")?.key;
  const eia = priceKey("eia")?.key;
  if (!serp && !eia) return { ok: false, error: "Live prices aren't connected yet." };
  const notes: string[] = [];
  const missing = (label: string) => Promise.reject(new PriceError(`${label}: not connected.`));

  const [gas, hotels, flights] = await Promise.allSettled([
    eia ? gasQuote(req.destination, eia, cache) : missing("Gas prices"),
    req.endDate <= req.startDate || !req.includeHotels
      ? Promise.resolve(null)
      : serp
        ? hotelQuote(req, serp, cache)
        : missing("Hotel prices"),
    req.includeFlights
      ? serp
        ? flightQuote(req, serp, cache)
        : missing("Flight prices")
      : Promise.resolve(null),
  ]);
  for (const r of [gas, hotels, flights]) if (r.status === "rejected") notes.push(reason(r));
  const got = <T>(r: PromiseSettledResult<Cached<T> | null>) =>
    r.status === "fulfilled" ? r.value : null;
  const parts = [got(gas), got(hotels), got(flights)].filter((p) => p !== null);
  // The oldest part decides how fresh the prices are, so a reused answer never looks new.
  const fetchedAt = parts.length ? Math.min(...parts.map((p) => p.savedAt)) : Date.now();
  const prices = {
    fetchedAt: new Date(fetchedAt).toISOString(),
    gas: got(gas)?.value ?? null,
    hotels: got(hotels)?.value ?? null,
    flights: got(flights)?.value ?? null,
    notes,
    // Hotel or flight answers reused from an earlier search (they cost no searches).
    reused: [got(hotels), got(flights)].some((p) => p?.hit),
  };
  if (!prices.gas && !prices.hotels && !prices.flights)
    return { ok: false, error: notes[0] ?? "Live prices are unavailable right now." };
  return { ok: true, prices };
}
