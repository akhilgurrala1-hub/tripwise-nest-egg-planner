/**
 * What a trip needs booked, in order, with links that open each provider's own
 * search already filled in with the trip's place, dates and group size. Waypoint
 * never books or takes payment; travelers book on the provider's site and record
 * it here. Pure, so the checklist rules are testable.
 */
import type { BudgetTotals, TripCoverage, TripShape } from "./budget";
import { cabinInfo, type Cabin, type DemoDestination } from "./demo-data";
import { citySchedule, type TripCity } from "./multi-city";
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
    coverage?: TripCoverage | null;
    /** Multi-city: the cities after the destination */
    cities?: TripCity[] | null;
    cabin?: Cabin | null;
  };
  inputs: { nightlyRate: number; rooms: number };
  itinerary: Itinerary | null;
}

const enc = encodeURIComponent;
/** "2027-03-14" → "270314" (Skyscanner's date format) */
const yymmdd = (iso: string) => iso.slice(2).replace(/-/g, "");
const KAYAK_CABIN: Record<Cabin, string> = {
  economy: "economy",
  premium: "premium",
  business: "business",
  first: "first",
};
const SKYSCANNER_CABIN: Record<Cabin, string> = {
  economy: "economy",
  premium: "premiumeconomy",
  business: "business",
  first: "first",
};
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
  /** Airport codes for home and each city in order (from the airport table), when known */
  airports: readonly (string | null | undefined)[] = [],
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
  const legs =
    cruise || s.tripType === "staycation"
      ? []
      : citySchedule(shape.nights, { name: place, point: null }, s.cities);
  const multi = legs.length > 1;
  const short = (x: string) => x.split(",")[0]!.trim();
  const cabin = s.cabin && s.cabin !== "economy" ? cabinInfo(s.cabin).label : "";

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

  if (s.transportMode === "flight" && multi) {
    // Home → each city → home, each leg on the day the traveler moves on.
    // Airport codes where we know them: searches find the right airport, not a namesake.
    const code = (i: number) => airports[i] || null;
    const names = [from || "home", ...legs.map((l) => l.name), from || "home"];
    const stops = names.map((n, i) => code(i === names.length - 1 ? 0 : i) ?? n);
    const dates = [start, ...legs.slice(1).map((l) => addDays(start, l.arriveDay)), end];
    const route = names
      .map((n, i) => {
        const c = code(i === names.length - 1 ? 0 : i);
        return c ? `${short(n)} (${c})` : short(n);
      })
      .join(" → ");
    const query = stops
      .slice(0, -1)
      .map((a, i) => `${a} to ${stops[i + 1]} on ${dates[i]}`)
      .join(", ");
    items.push({
      key: "flight",
      kind: "flight",
      title: `Flights ${route}`,
      detail: `Multi-city · ${when} · ${who}${cabin ? ` · ${cabin}` : ""}`,
      budget: c.transportation,
      optional: false,
      links: [
        {
          label: "Google Flights",
          url: `https://www.google.com/travel/flights?q=${enc(`Multi-city flights ${query}${cabin ? ` ${cabin.toLowerCase()} class` : ""}`)}`,
        },
        { label: "Compare fares", url: google(`multi-city flights ${route} ${monthYear(start)}`) },
      ],
    });
  } else if (s.transportMode === "flight") {
    const to = cruise ? port : place;
    const fromCode = airports[0] || "";
    const toCode = airports[1] || "";
    const fromName = from ? `${from.split(",")[0]}${fromCode ? ` (${fromCode})` : ""}` : "";
    const toName = `${to.split(",")[0]}${toCode ? ` (${toCode})` : ""}`;
    items.push({
      key: "flight",
      kind: "flight",
      title: fromName ? `Flights ${fromName} → ${toName}` : `Flights to ${toName}`,
      detail: `Round trip · ${when} · ${who}${cabin ? ` · ${cabin}` : ""}`,
      budget: c.transportation,
      optional: false,
      links: [
        {
          label: "Google Flights",
          url: `https://www.google.com/travel/flights?q=${enc(`Flights to ${toCode || to}${from ? ` from ${fromCode || from}` : ""} on ${cruise ? addDays(start, -1) : start} through ${end}${cabin ? ` ${cabin.toLowerCase()} class` : ""}`)}`,
        },
        // With both airports known, two more fare searches open on the exact route.
        ...(fromCode && toCode
          ? [
              {
                label: "KAYAK",
                url: `https://www.kayak.com/flights/${fromCode}-${toCode}/${cruise ? addDays(start, -1) : start}/${end}/${Math.min(n, 9)}adults${s.cabin && s.cabin !== "economy" ? `/${KAYAK_CABIN[s.cabin]}` : ""}`,
              },
              {
                label: "Skyscanner",
                url: `https://www.skyscanner.com/transport/flights/${fromCode.toLowerCase()}/${toCode.toLowerCase()}/${yymmdd(cruise ? addDays(start, -1) : start)}/${yymmdd(end)}/?adultsv2=${Math.min(n, 9)}&cabinclass=${SKYSCANNER_CABIN[s.cabin ?? "economy"]}`,
              },
            ]
          : [
              {
                label: "Compare fares",
                url: google(
                  `cheap flights ${from ? `${fromCode || from} to ` : "to "}${toCode || to} ${start}`,
                ),
              },
            ]),
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
  if (lodging && multi) {
    // One stay per city, for its own nights; the budget splits by nights.
    const rooms = Math.max(1, trip.inputs.rooms);
    legs.forEach((leg, i) => {
      if (leg.nights < 1) return;
      const inDate = addDays(start, leg.arriveDay);
      const outDate = addDays(start, leg.arriveDay + leg.nights);
      items.push({
        key: i === 0 ? "hotel" : `hotel-${i + 1}`,
        kind: "hotel",
        title: `Stay in ${short(leg.name)}`,
        detail: `${leg.nights} night${leg.nights === 1 ? "" : "s"} · ${day(inDate)} – ${day(outDate)} · ${rooms} room${rooms > 1 ? "s" : ""}, ${who}`,
        budget: shape.nights > 0 ? Math.round((c.accommodations * leg.nights) / shape.nights) : 0,
        optional: false,
        links: [
          {
            label: "Booking.com",
            url: `https://www.booking.com/searchresults.html?ss=${enc(leg.name)}&checkin=${inDate}&checkout=${outDate}&group_adults=${n}&no_rooms=${rooms}`,
          },
          {
            label: "Google Hotels",
            url: `https://www.google.com/travel/search?q=${enc(`hotels in ${leg.name}`)}`,
          },
          {
            label: "Airbnb",
            url: `https://www.airbnb.com/s/${enc(leg.name)}/homes?checkin=${inDate}&checkout=${outDate}&adults=${n}`,
          },
          {
            label: "Expedia",
            url: `https://www.expedia.com/Hotel-Search?destination=${enc(leg.name)}&startDate=${inDate}&endDate=${outDate}&adults=${n}&rooms=${rooms}`,
          },
        ],
      });
    });
  } else if (lodging) {
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
        {
          label: "Expedia",
          url: `https://www.expedia.com/Hotel-Search?destination=${enc(place)}&startDate=${start}&endDate=${end}&adults=${n}&rooms=${rooms}`,
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

  const transfer = s.coverage?.transfer ?? 0;
  const fareMode =
    s.transportMode === "flight" || s.transportMode === "train" || s.transportMode === "bus";
  if (fareMode && transfer > 0) {
    const station = s.transportMode === "flight" ? "airport" : "station";
    items.push({
      key: "transfer",
      kind: "car",
      title: `Ride to the ${station}`,
      detail: `${from ? `From ${from.split(",")[0]}` : "From where you start"} to the ${station} and back · ${who}`,
      budget: transfer,
      optional: true,
      links: [
        { label: "Uber", url: "https://m.uber.com/" },
        { label: "Lyft", url: "https://www.lyft.com/" },
        {
          label: "Transit",
          url: `https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=${enc(`${from.split(",")[0] ?? ""} ${station}`.trim())}`,
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
  if (!s.coverage?.activities || stops.length > 0)
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

  if (!cruise && s.style !== "budget" && !s.coverage?.meals) {
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
