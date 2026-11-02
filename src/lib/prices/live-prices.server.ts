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

async function gasQuote(place: string, key: string): Promise<GasQuote> {
  const area = gasAreaFor(place);
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

async function hotelQuote(req: LivePricesRequest, key: string): Promise<HotelQuote> {
  const params = {
    engine: "google_hotels",
    q: req.destination,
    check_in_date: req.startDate,
    check_out_date: req.endDate,
    adults: Math.max(1, Math.min(6, Math.ceil(req.travelers / Math.max(1, req.rooms)))),
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
  const pick = pickNightly(options, req.style);
  const searchUrl = `https://www.google.com/travel/hotels/${encodeURIComponent(req.destination)}?q=${encodeURIComponent(
    `hotels in ${req.destination}`,
  )}&dates=${req.startDate},${req.endDate}`;
  return {
    checkIn: req.startDate,
    checkOut: req.endDate,
    nightly: pick.nightly,
    pickLabel: pick.label,
    options,
    searchUrl,
  };
}

async function airportFor(place: string, key: string): Promise<string | null> {
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

async function flightQuote(req: LivePricesRequest, key: string): Promise<FlightQuote> {
  const [from, to] = await Promise.all([
    req.originAirport || airportFor(req.origin, key),
    req.destinationAirport || airportFor(req.destination, key),
  ]);
  if (!from || !to)
    throw new PriceError(
      "Flight prices: couldn't find an airport for your start or destination. Add your home airport in your profile.",
    );
  if (from === to)
    throw new PriceError("Flight prices: your start and destination use the same airport.");
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

export async function fetchLivePrices(req: LivePricesRequest): Promise<LivePricesResult> {
  const serp = process.env["SERPAPI_API_KEY"];
  const eia = process.env["EIA_API_KEY"];
  if (!serp && !eia) return { ok: false, error: "Live prices aren't connected yet." };
  const notes: string[] = [];
  const missing = (label: string) => Promise.reject(new PriceError(`${label}: not connected.`));

  const [gas, hotels, flights] = await Promise.allSettled([
    eia ? gasQuote(req.destination, eia) : missing("Gas prices"),
    req.endDate <= req.startDate || !req.includeHotels
      ? Promise.resolve(null)
      : serp
        ? hotelQuote(req, serp)
        : missing("Hotel prices"),
    req.includeFlights
      ? serp
        ? flightQuote(req, serp)
        : missing("Flight prices")
      : Promise.resolve(null),
  ]);
  for (const r of [gas, hotels, flights]) if (r.status === "rejected") notes.push(reason(r));
  const prices = {
    fetchedAt: new Date().toISOString(),
    gas: gas.status === "fulfilled" ? gas.value : null,
    hotels: hotels.status === "fulfilled" ? hotels.value : null,
    flights: flights.status === "fulfilled" ? flights.value : null,
    notes,
  };
  if (!prices.gas && !prices.hotels && !prices.flights)
    return { ok: false, error: notes[0] ?? "Live prices are unavailable right now." };
  return { ok: true, prices };
}
