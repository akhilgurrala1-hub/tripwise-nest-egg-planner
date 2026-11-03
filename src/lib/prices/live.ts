// Browser-safe types and pure helpers for live prices (no network calls here).
import type { TravelStyle } from "../demo-data";

export interface GasQuote {
  /** Regular gasoline, USD per gallon, before any rewards */
  price: number;
  areaLabel: string;
  /** Week the government survey was taken (YYYY-MM-DD) */
  period: string;
}

export interface HotelOption {
  name: string;
  hotelClass: number | null;
  rating: number | null;
  reviews: number | null;
  /** Per room per night, before taxes and fees (the budget adds taxes itself) */
  nightly: number;
  /** Whole stay, after taxes and fees, when listed */
  totalWithTaxes: number | null;
  link: string | null;
  image: string | null;
}

export interface HotelQuote {
  checkIn: string;
  checkOut: string;
  /** The nightly rate chosen for the traveler's style */
  nightly: number;
  pickLabel: string;
  options: HotelOption[];
  searchUrl: string;
}

export interface FlightOption {
  airlines: string[];
  stops: number;
  durationMinutes: number;
  departs: string;
  arrives: string;
  /** Round trip, per person */
  perPerson: number;
}

export interface FlightQuote {
  originAirport: string;
  destinationAirport: string;
  departDate: string;
  returnDate: string;
  /** Cheapest listed round trip, per person */
  perPerson: number;
  typicalRange: [number, number] | null;
  options: FlightOption[];
  bookingUrl: string | null;
  /** Multi-city: each one-way leg and its cheapest fare per person */
  legs?: { from: string; to: string; date: string; perPerson: number }[];
}

export interface LivePrices {
  fetchedAt: string;
  gas: GasQuote | null;
  hotels: HotelQuote | null;
  flights: FlightQuote | null;
  /** Why a part couldn't be loaded, in plain language */
  notes: string[];
  /** Hotel or flight prices came from a recent identical search (no search spent) */
  reused?: boolean;
}

export type LivePricesResult = { ok: true; prices: LivePrices } | { ok: false; error: string };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx]!;
}

/**
 * Nightly rate for a travel style from real listings: budget travelers get the
 * cheaper quarter of the market, comfort the middle, luxury the upper fifth
 * (4-star and up when available).
 */
export function pickNightly(
  options: HotelOption[],
  style: TravelStyle,
): { nightly: number; label: string } {
  const all = options
    .map((o) => o.nightly)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (all.length === 0) return { nightly: 0, label: "No prices listed" };
  if (style === "budget")
    return { nightly: percentile(all, 0.25), label: "Lower-priced quarter of listed hotels" };
  if (style === "comfort")
    return { nightly: percentile(all, 0.5), label: "Middle of listed hotel prices" };
  const upscale = options
    .filter((o) => (o.hotelClass ?? 0) >= 4 && o.nightly > 0)
    .map((o) => o.nightly)
    .sort((a, b) => a - b);
  return upscale.length
    ? { nightly: percentile(upscale, 0.5), label: "Typical 4- and 5-star rate" }
    : { nightly: percentile(all, 0.8), label: "Upper fifth of listed hotel prices" };
}

/** Google Flights quotes a group's total; the budget stores fares per person. */
export function perPersonFare(groupTotal: number, travelers: number): number {
  return Math.round((groupTotal / Math.max(1, travelers)) * 100) / 100;
}

/** EIA weekly retail gasoline series by area. State series exist only for a few states. */
const STATE_AREAS: Record<string, [string, string]> = {
  CA: ["SCA", "California"],
  CO: ["SCO", "Colorado"],
  FL: ["SFL", "Florida"],
  MA: ["SMA", "Massachusetts"],
  MN: ["SMN", "Minnesota"],
  NY: ["SNY", "New York"],
  OH: ["SOH", "Ohio"],
  TX: ["STX", "Texas"],
  WA: ["SWA", "Washington"],
};
const REGION_STATES: [string, string, string[]][] = [
  ["R1X", "New England", ["CT", "ME", "NH", "RI", "VT"]],
  ["R1Y", "Central Atlantic", ["DE", "DC", "MD", "NJ", "PA"]],
  ["R1Z", "Lower Atlantic", ["GA", "NC", "SC", "VA", "WV"]],
  [
    "R20",
    "Midwest",
    ["IL", "IN", "IA", "KS", "KY", "MI", "MO", "NE", "ND", "SD", "OK", "TN", "WI"],
  ],
  ["R30", "Gulf Coast", ["AL", "AR", "LA", "MS", "NM"]],
  ["R40", "Rocky Mountain", ["ID", "MT", "UT", "WY"]],
  ["R5XCA", "West Coast (except California)", ["AK", "AZ", "HI", "NV", "OR"]],
];
export const STATE_NAMES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

/** First U.S. state mentioned in free text ("Austin, TX", "Southern Utah", "Alabama & Florida"). */
export function findState(text: string): string | null {
  const lower = ` ${text.toLowerCase()} `;
  // Longest names first so "west virginia" wins over "virginia".
  let best: { code: string; at: number } | null = null;
  for (const name of Object.keys(STATE_NAMES).sort((a, b) => b.length - a.length)) {
    const at = lower.search(new RegExp(`[^a-z]${name}[^a-z]`));
    if (at >= 0 && (!best || at < best.at)) best = { code: STATE_NAMES[name]!, at };
  }
  const abbr = text.match(/(?:,|\s)\s*([A-Z]{2})\b/);
  if (abbr && Object.values(STATE_NAMES).includes(abbr[1]!)) {
    const at = text.indexOf(abbr[1]!);
    if (!best || at < best.at) best = { code: abbr[1]!, at };
  }
  return best?.code ?? null;
}

/** Which government gas-price series covers a place. Falls back to the U.S. average. */
export function gasAreaFor(text: string): { code: string; label: string } {
  const state = findState(text);
  if (state) {
    const own = STATE_AREAS[state];
    if (own) return { code: own[0], label: own[1] };
    const region = REGION_STATES.find(([, , states]) => states.includes(state));
    if (region) return { code: region[0], label: region[1] };
  }
  return { code: "NUS", label: "U.S. average" };
}

/** Same search a little while ago: say how old the prices are. */
export function reusedNote(fetchedAt: string, now = Date.now()): string {
  const minutes = Math.max(1, Math.round((now - new Date(fetchedAt).getTime()) / 60_000));
  const age =
    minutes < 60
      ? `${minutes} minute${minutes === 1 ? "" : "s"}`
      : `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"}`;
  return `Same prices as a search ${age} ago. Prices are checked again after a few hours.`;
}
