/**
 * What a trip needs booked, in order, with links that open each provider's own
 * search already filled in with the trip's place, dates and group size. Waypoint
 * never books or takes payment; travelers book on the provider's site and record
 * it here. Pure, so the checklist rules are testable.
 */
import type { BudgetTotals, TripShape } from "./budget";
import type { DemoDestination } from "./demo-data";
import { addDays, formatCalendarDate } from "./dates";
import type { Itinerary } from "./itinerary";
import { destinationQuery } from "./live/place";

export type BookingKind =
  "flight" | "hotel" | "cruise" | "car" | "rail" | "bus" | "parking" | "tickets" | "dining";

export interface BookingLink {
  label: string;
  url: string;
}

export interface BookingItem {
  key: string;
  kind: BookingKind;
  title: string;
  detail: string;
  /** What the budget sets aside for it */
  budget: number;
  links: BookingLink[];
  optional: boolean;
  /** For tickets: the plan's paid stops that may need booking ahead */
  stops?: string[];
}

export type BookingStatus = "todo" | "booked" | "skipped";

export interface BookingRecord {
  status: BookingStatus;
  confirmation: string;
  /** What it actually cost, when the traveler noted it */
  price: number | null;
}

export interface BookingTrip {
  setup: {
    tripType: string;
    transportMode: string;
    origin: string;
    startDate: string;
    endDate: string;
    travelers: number;
    style: string;
  };
  inputs: { nightlyRate: number; rooms: number };
  itinerary: Itinerary | null;
}

const enc = encodeURIComponent;
const google = (q: string) => `https://www.google.com/search?q=${enc(q)}`;

function monthYear(iso: string): string {
  const [y, m] = iso.split("-");
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${names[Number(m) - 1] ?? ""} ${y ?? ""}`.trim();
}

const EUROPE = new Set([
  "GB",
  "IE",
  "FR",
  "ES",
  "PT",
  "NL",
  "BE",
  "LU",
  "DE",
  "CZ",
  "AT",
  "CH",
  "IT",
  "DK",
  "SE",
  "NO",
  "FI",
  "PL",
  "HU",
  "HR",
  "SI",
  "SK",
  "GR",
]);

/** Train operators or sellers for a destination country (the US when unknown). */
export function railProviders(country = "US"): BookingLink[] {
  if (country === "US") return [{ label: "Amtrak", url: "https://www.amtrak.com/" }];
  if (country === "CA") return [{ label: "VIA Rail", url: "https://www.viarail.ca/en" }];
  if (EUROPE.has(country)) return [{ label: "Trainline", url: "https://www.thetrainline.com/" }];
  if (country === "JP") return [{ label: "JR trains", url: "https://www.japanrailpass.net/en/" }];
  return [];
}

export function busProviders(country = "US"): BookingLink[] {
  if (country === "US" || country === "CA")
    return [
      { label: "Greyhound", url: "https://www.greyhound.com/" },
      { label: "FlixBus", url: "https://www.flixbus.com/" },
    ];
  if (EUROPE.has(country)) return [{ label: "FlixBus", url: "https://www.flixbus.com/" }];
  return [];
}

/** The booking checklist for a trip. */
export function bookingPlan(
  trip: BookingTrip,
  dest: DemoDestination,
  shape: TripShape,
  totals: BudgetTotals,
  homeCity = "",
): BookingItem[] {
  const s = trip.setup;
  const place = destinationQuery(dest, s.origin, homeCity);
  const from = s.origin.trim() || homeCity.trim();
  const n = shape.travelers;
  const start = s.startDate;
  const end = s.endDate;
  const who = `${n} traveler${n > 1 ? "s" : ""}`;
  const day = (iso: string) => formatCalendarDate(iso, { month: "short", day: "numeric" });
  const when = start === end ? day(start) : `${day(start)} – ${day(end)}`;
  const c = totals.categories;
  const items: BookingItem[] = [];
  const cruise = s.tripType === "cruise";
  const port = dest.port ?? place;

  if (cruise) {
    items.push({
      key: "cruise",
      kind: "cruise",
      title: `Cruise from ${port}`,
      detail: `${shape.nights} night${shape.nights === 1 ? "" : "s"} · ${who} · cabin, main dining, port fees & tips`,
      budget: c.cruise,
      optional: false,
      links: [
        {
          label: "Find sailings",
          url: google(`${dest.name} cruise from ${port} ${monthYear(start)}`),
        },
        { label: "Reviews", url: google(`cruise critic ${dest.name} cruise from ${port}`) },
      ],
    });
  }

  if (s.transportMode === "flight") {
    const to = cruise ? port : place;
    items.push({
      key: "flight",
      kind: "flight",
      title: from
        ? `Flights ${from.split(",")[0]} → ${to.split(",")[0]}`
        : `Flights to ${to.split(",")[0]}`,
      detail: `Round trip · ${when} · ${who}`,
      budget: c.transportation,
      optional: false,
      links: [
        {
          label: "Google Flights",
          url: `https://www.google.com/travel/flights?q=${enc(`Flights to ${to}${from ? ` from ${from}` : ""} on ${cruise ? addDays(start, -1) : start} through ${end}`)}`,
        },
        {
          label: "Compare fares",
          url: google(`cheap flights ${from ? `${from} to ` : "to "}${to} ${start}`),
        },
      ],
    });
  }

  if ((s.transportMode === "train" || s.transportMode === "bus") && !cruise) {
    const train = s.transportMode === "train";
    items.push({
      key: train ? "rail" : "bus",
      kind: train ? "rail" : "bus",
      title: `${train ? "Train" : "Bus"} tickets${from ? ` from ${from.split(",")[0]}` : ""}`,
      detail: `Round trip · ${when} · ${who}`,
      budget: c.transportation,
      optional: false,
      links: [
        ...(train ? railProviders(dest.country) : busProviders(dest.country)),
        {
          label: "Compare routes",
          url: google(
            `${train ? "train" : "bus"} ${from ? `from ${from} ` : ""}to ${place} ${start}`,
          ),
        },
      ],
    });
  }

  const lodging = !cruise && shape.nights > 0 && trip.inputs.nightlyRate > 0;
  if (lodging) {
    const rooms = Math.max(1, trip.inputs.rooms);
    items.push({
      key: "hotel",
      kind: "hotel",
      title: `Stay in ${place.split(",")[0]}`,
      detail: `${shape.nights} night${shape.nights === 1 ? "" : "s"} · ${when} · ${rooms} room${rooms > 1 ? "s" : ""}, ${who}`,
      budget: c.accommodations,
      optional: false,
      links: [
        {
          label: "Booking.com",
          url: `https://www.booking.com/searchresults.html?ss=${enc(place)}&checkin=${start}&checkout=${end}&group_adults=${n}&no_rooms=${rooms}`,
        },
        {
          label: "Google Hotels",
          url: `https://www.google.com/travel/search?q=${enc(`hotels in ${place}`)}`,
        },
        {
          label: "Airbnb",
          url: `https://www.airbnb.com/s/${enc(place)}/homes?checkin=${start}&checkout=${end}&adults=${n}`,
        },
      ],
    });
  }

  if (cruise && s.transportMode === "flight") {
    items.push({
      key: "pre-cruise-hotel",
      kind: "hotel",
      title: `Night before in ${port.split(",")[0]}`,
      detail: `Arrive a day early so a delayed flight can't make you miss the ship · ${day(addDays(start, -1))}`,
      budget: 0,
      optional: true,
      links: [
        {
          label: "Booking.com",
          url: `https://www.booking.com/searchresults.html?ss=${enc(port)}&checkin=${addDays(start, -1)}&checkout=${start}&group_adults=${n}&no_rooms=1`,
        },
      ],
    });
  }

  if (s.transportMode === "rental-car") {
    items.push({
      key: "car",
      kind: "car",
      title: `Rental car${from ? ` from ${from.split(",")[0]}` : ""}`,
      detail: `${when} · ${shape.days} day${shape.days > 1 ? "s" : ""}`,
      budget: c.transportation,
      optional: false,
      links: [
        {
          label: "KAYAK",
          url: `https://www.kayak.com/cars/${enc(from || place)}/${start}/${end}`,
        },
        { label: "Compare", url: google(`car rental ${from || place} ${start} to ${end}`) },
      ],
    });
  }

  if (cruise && s.transportMode !== "flight") {
    items.push({
      key: "parking",
      kind: "parking",
      title: `Cruise parking in ${port.split(",")[0]}`,
      detail: `${shape.days} day${shape.days > 1 ? "s" : ""} at or near the terminal. Booking ahead is usually cheaper`,
      budget: c.parking,
      optional: true,
      links: [{ label: "Find parking", url: google(`cruise port parking ${port}`) }],
    });
  }

  // Paid sights in the plan that tend to sell out or cost less online.
  const paid = (trip.itinerary?.days ?? [])
    .flatMap((d) => d.items)
    .filter((i) => i.kind !== "restaurant" && i.costPerPerson >= 15)
    .map((i) => i.name);
  const stops = [...new Set(paid)].slice(0, 6);
  items.push({
    key: "tickets",
    kind: "tickets",
    title: cruise ? "Shore excursions & tickets" : "Tickets & tours",
    detail:
      stops.length > 0
        ? `${stops.length} paid stop${stops.length > 1 ? "s" : ""} in your plan · ${who}`
        : `Tours and timed-entry tickets · ${who}`,
    budget: c.activities,
    optional: stops.length === 0,
    stops,
    links: [
      {
        label: "GetYourGuide",
        url: `https://www.getyourguide.com/s/?q=${enc(cruise ? (dest.anchor?.name ?? place) : place)}&date_from=${start}&date_to=${end}`,
      },
      {
        label: "Viator",
        url: `https://www.viator.com/searchResults/all?text=${enc(cruise ? (dest.anchor?.name ?? place) : place)}`,
      },
    ],
  });

  if (!cruise && s.style !== "budget") {
    items.push({
      key: "dining",
      kind: "dining",
      title: "Dinner reservations",
      detail: `Popular spots fill up · ${who}`,
      budget: 0,
      optional: true,
      links: [
        {
          label: "OpenTable",
          url: `https://www.opentable.com/s?term=${enc(place)}&dateTime=${start}T19%3A00&covers=${Math.min(n, 20)}`,
        },
        { label: "Resy", url: google(`resy ${place} restaurants`) },
      ],
    });
  }
  return items;
}

/** Progress through the checklist: required items booked, and what's been spent. */
export function bookingProgress(items: BookingItem[], records: Record<string, BookingRecord>) {
  const active = items.filter((i) => records[i.key]?.status !== "skipped");
  const booked = active.filter((i) => records[i.key]?.status === "booked");
  const required = items.filter((i) => !i.optional);
  const requiredBooked = required.filter((i) => records[i.key]?.status === "booked");
  const spent = booked.reduce((s, i) => s + (records[i.key]?.price ?? i.budget), 0);
  const budgeted = booked.reduce((s, i) => s + i.budget, 0);
  const next = active.find((i) => records[i.key]?.status !== "booked") ?? null;
  return {
    total: active.length,
    booked: booked.length,
    requiredDone: requiredBooked.length === required.length,
    spent: Math.round(spent * 100) / 100,
    budgeted: Math.round(budgeted * 100) / 100,
    next,
  };
}

/** Only http(s) links are ever opened. */
export function safeExternalUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
