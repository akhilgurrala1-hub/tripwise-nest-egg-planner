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
  /** Flight cabin (economy when unset) */
  cabin?: "economy" | "premium" | "business" | "first";
  /** Multi-city: every city in order with its check-in and check-out dates */
  cities?: { name: string; checkIn: string; checkOut: string }[];
}

/** Google Flights' travel_class codes. */
const TRAVEL_CLASS = { economy: 1, premium: 2, business: 3, first: 4 } as const;

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
    ["flights", from, to, req.startDate, req.endDate, req.travelers, req.cabin ?? "economy"].join(
      "|",
    ),
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
        travel_class: TRAVEL_CLASS[req.cabin ?? "economy"],
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

/** The cheapest one-way flight for one leg of a multi-city trip, per person. */
async function oneWayLeg(
  from: string,
  to: string,
  date: string,
  req: LivePricesRequest,
  key: string,
  cache: PriceCache,
): Promise<Cached<{ from: string; to: string; date: string; option: FlightOption }>> {
  return cachedLookup(
    cache,
    ["leg", from, to, date, req.travelers, req.cabin ?? "economy"].join("|"),
    PRICE_TTL.flights,
    async () => {
      const body = await getJson(
        serpUrl(
          {
            engine: "google_flights",
            departure_id: from,
            arrival_id: to,
            outbound_date: date,
            type: 2,
            adults: req.travelers,
            travel_class: TRAVEL_CLASS[req.cabin ?? "economy"],
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
      ].filter((g) => typeof g.price === "number" && g.price > 0 && g.flights?.length);
      const best = groups.sort((a, b) => a.price! - b.price!)[0];
      if (!best) throw new PriceError(`Flight prices: no flights listed from ${from} to ${to}.`);
      return {
        from,
        to,
        date,
        option: {
          airlines: Array.from(new Set(best.flights!.map((f) => f.airline ?? "").filter(Boolean))),
          stops: best.flights!.length - 1,
          durationMinutes: best.total_duration ?? 0,
          departs: best.flights![0]!.departure_airport?.time ?? "",
          arrives: best.flights![best.flights!.length - 1]!.arrival_airport?.time ?? "",
          perPerson: perPersonFare(best.price!, req.travelers),
        },
      };
    },
  );
}

/**
 * Multi-city flights: each leg (home → city → city → home) priced as a one-way
 * flight on the day the traveler moves on, added up per person.
 */
async function multiCityFlights(
  req: LivePricesRequest,
  key: string,
  cache: PriceCache,
): Promise<Cached<FlightQuote>> {
  const cities = req.cities ?? [];
  const places = [req.origin, ...cities.map((c) => c.name), req.origin];
  const airports = await Promise.all(
    places.map((p, i) =>
      i === 0 || i === places.length - 1
        ? req.originAirport || airportFor(p, key, cache)
        : airportFor(p, key, cache),
    ),
  );
  if (airports.some((a) => !a))
    throw new PriceError(
      "Flight prices: couldn't find an airport for one of the cities. Add your home airport in your profile.",
    );
  const dates = [cities[0]!.checkIn, ...cities.slice(1).map((c) => c.checkIn), req.endDate];
  const legs = await Promise.all(
    airports
      .slice(0, -1)
      .map((a, i) => [a!, airports[i + 1]!, dates[i]!] as const)
      .filter(([a, b]) => a !== b)
      .map(([a, b, d]) => oneWayLeg(a, b, d, req, key, cache)),
  );
  const perPerson = Math.round(legs.reduce((t, l) => t + l.value.option.perPerson, 0) * 100) / 100;
  return {
    value: {
      originAirport: airports[0]!,
      destinationAirport: airports[1]!,
      departDate: req.startDate,
      returnDate: req.endDate,
      perPerson,
      typicalRange: null,
      options: legs.map((l) => l.value.option),
      bookingUrl: null,
      legs: legs.map((l) => ({
        from: l.value.from,
        to: l.value.to,
        date: l.value.date,
        perPerson: l.value.option.perPerson,
      })),
    },
    savedAt: Math.min(...legs.map((l) => l.savedAt)),
    hit: legs.every((l) => l.hit),
  };
}

/** Multi-city hotels: each city's own nights, averaged into one nightly rate by nights. */
async function multiCityHotels(
  req: LivePricesRequest,
  key: string,
  cache: PriceCache,
): Promise<Cached<HotelQuote>> {
  const stays = (req.cities ?? []).filter((c) => c.checkOut > c.checkIn);
  const quotes = await Promise.all(
    stays.map((c) =>
      hotelQuote(
        { ...req, destination: c.name, startDate: c.checkIn, endDate: c.checkOut },
        key,
        cache,
      ),
    ),
  );
  const nights = (c: { checkIn: string; checkOut: string }) =>
    Math.max(1, Math.round((Date.parse(c.checkOut) - Date.parse(c.checkIn)) / 86_400_000));
  const totalNights = stays.reduce((t, c) => t + nights(c), 0);
  const nightly =
    Math.round(
      (quotes.reduce((t, q, i) => t + q.value.nightly * nights(stays[i]!), 0) /
        Math.max(1, totalNights)) *
        100,
    ) / 100;
  return {
    value: {
      checkIn: req.startDate,
      checkOut: req.endDate,
      nightly,
      pickLabel: `Average across ${stays.length} cities, by nights`,
      options: quotes.flatMap((q) => q.value.options.slice(0, 4)),
      searchUrl: quotes[0]?.value.searchUrl ?? "",
    },
    savedAt: Math.min(...quotes.map((q) => q.savedAt)),
    hit: quotes.every((q) => q.hit),
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
        ? (req.cities?.length ?? 0) > 1
          ? multiCityHotels(req, serp, cache)
          : hotelQuote(req, serp, cache)
        : missing("Hotel prices"),
    req.includeFlights
      ? serp
        ? (req.cities?.length ?? 0) > 1
          ? multiCityFlights(req, serp, cache)
          : flightQuote(req, serp, cache)
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
