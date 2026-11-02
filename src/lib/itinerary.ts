import { addDays } from "./dates";
import type { DemoDestination, Interest, TravelStyle, TripType } from "./demo-data";
import type { RealPlace } from "./places/types";
import type { CostSource } from "./routing/types";

export type SlotTime = "Morning" | "Lunch" | "Afternoon" | "Dinner" | "Evening";
export type ItemKind = "sight" | "restaurant" | "stop";

export interface ItineraryItem {
  id: string;
  time: SlotTime;
  kind: ItemKind;
  name: string;
  area: string;
  note: string;
  costPerPerson: number;
  /** Set for real places from the map service */
  placeId?: string;
  mapsUrl?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  costSource?: CostSource;
}

export interface ItineraryDay {
  day: number;
  date: string;
  title: string;
  items: ItineraryItem[];
}

export interface Itinerary {
  source: "demo" | "ai" | "google";
  days: ItineraryDay[];
  tips: string[];
}

// Calendar math runs in UTC (see dates.ts): local-noon + toISOString shifted dates for travelers east of UTC+12.
export { addDays } from "./dates";

/** First stop on day one, by how the trip is taken (staycations start at home). */
const ARRIVAL: Partial<Record<TripType, { name: string; note: string }>> = {
  "road-trip": {
    name: "Scenic drive & roadside stop",
    note: "Stretch, refuel and grab a photo — fuel is in your gas budget.",
  },
  flight: {
    name: "Fly in & check in",
    note: "Your fare is in Transportation; leave time for the airport transfer.",
  },
  rail: {
    name: "Ride in by train or bus",
    note: "Your ticket is in Transportation — pack snacks for the ride.",
  },
  cruise: {
    name: "Board the ship",
    note: "Check-in, muster drill and sail-away — cabin and main dining are in your fare.",
  },
};

const TIERS: Record<TravelStyle, { lunch: number[]; dinner: number[] }> = {
  budget: { lunch: [1], dinner: [1, 2] },
  comfort: { lunch: [1, 2], dinner: [2] },
  luxury: { lunch: [2], dinner: [3] },
};

export function generateDemoItinerary(opts: {
  dest: DemoDestination;
  days: number;
  startDate: string;
  interests: Interest[];
  style: TravelStyle;
  tripType: TripType;
}): Itinerary {
  const { dest, days, startDate, interests, style, tripType } = opts;
  const maxCost = style === "budget" ? 60 : style === "comfort" ? 120 : Infinity;

  const sights = [...dest.sights]
    .map((s) => ({
      s,
      score:
        s.interests.filter((i) => interests.includes(i)).length * 10 -
        (style === "budget" ? s.costPerPerson / 10 : 0) +
        (style === "luxury" ? s.costPerPerson / 40 : 0) -
        (s.costPerPerson > maxCost ? 50 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);

  const byTier = (tiers: number[]) => {
    const list = dest.restaurants.filter((r) => tiers.includes(r.tier));
    return list.length ? list : dest.restaurants;
  };
  const lunches = byTier(TIERS[style].lunch);
  const dinners = byTier(TIERS[style].dinner);

  const daySights = sights.filter((x) => !x.evening);
  const eveningSights = sights.filter(
    (x) => x.evening && x.interests.some((i) => interests.includes(i)),
  );
  const out: ItineraryDay[] = [];
  let si = 0;
  let ei = 0;
  for (let d = 0; d < days; d++) {
    const items: ItineraryItem[] = [];
    const id = (k: string) => `d${d + 1}-${k}`;
    // Never repeat a stop; once ideas run out, leave open time instead.
    const nextSight = () =>
      daySights[si++] ?? {
        name: "Open time to wander",
        area: dest.name,
        note: "Unplanned time — revisit a favorite or rest up",
        costPerPerson: 0,
        interests: [],
      };

    const arrival = d === 0 ? ARRIVAL[tripType] : undefined;
    if (arrival) {
      items.push({
        id: id("arrive"),
        time: "Morning",
        kind: "stop",
        name: arrival.name,
        area:
          tripType === "cruise"
            ? `Port of ${dest.port ?? dest.name}`
            : `On the way to ${dest.name}`,
        note: arrival.note,
        costPerPerson: 0,
      });
    } else {
      const m = nextSight();
      items.push({
        id: id("am"),
        time: "Morning",
        kind: "sight",
        name: m.name,
        area: m.area,
        note: m.note,
        costPerPerson: m.costPerPerson,
      });
    }

    const l = lunches[d % lunches.length]!;
    items.push({
      id: id("lunch"),
      time: "Lunch",
      kind: "restaurant",
      name: l.name,
      area: l.cuisine,
      note: tierNote(l.tier),
      costPerPerson: l.costPerPerson,
    });

    const a = nextSight();
    items.push({
      id: id("pm"),
      time: "Afternoon",
      kind: "sight",
      name: a.name,
      area: a.area,
      note: a.note,
      costPerPerson: a.costPerPerson,
    });

    const dn = dinners[(d + 1) % dinners.length]!;
    items.push({
      id: id("dinner"),
      time: "Dinner",
      kind: "restaurant",
      name: dn.name,
      area: dn.cuisine,
      note: tierNote(dn.tier),
      costPerPerson: dn.costPerPerson,
    });

    const ev = eveningSights[ei];
    if (ev && d < days - 1) {
      ei++;
      items.push({
        id: id("eve"),
        time: "Evening",
        kind: "sight",
        name: ev.name,
        area: ev.area,
        note: ev.note,
        costPerPerson: ev.costPerPerson,
      });
    }

    out.push({
      day: d + 1,
      date: addDays(startDate, d),
      title:
        tripType === "cruise"
          ? d === 0
            ? "Embarkation day"
            : d === days - 1 && days > 1
              ? "Disembark & head home"
              : `Ports & sea days · ${dest.name}`
          : d === 0
            ? "Arrive & settle in"
            : d === days - 1 && days > 1
              ? "Last look & head home"
              : `Explore ${dest.name}`,
      items,
    });
  }

  return {
    source: "demo",
    days: out,
    tips: [
      "Demo itinerary — venues and prices are examples, not live listings.",
      style === "budget"
        ? "Free stops are prioritized to stretch your budget."
        : style === "luxury"
          ? "Signature experiences are prioritized for a premium trip."
          : "A balanced mix of free and paid experiences.",
    ],
  };
}

function tierNote(tier: 1 | 2 | 3) {
  return tier === 1
    ? "$ · Casual & affordable"
    : tier === 2
      ? "$$ · Sit-down favorite"
      : "$$$ · Special occasion";
}

/** Planned per-person spend on sightseeing (excludes meals, which live in the food budget). */
export function itineraryActivityCost(itin: Itinerary | null, travelers: number): number {
  if (!itin) return 0;
  const perPerson = itin.days
    .flatMap((d) => d.items)
    .filter((i) => i.kind !== "restaurant")
    .reduce((s, i) => s + (Number.isFinite(i.costPerPerson) ? i.costPerPerson : 0), 0);
  return Math.round(perPerson * Math.max(1, travelers) * 100) / 100;
}

/** Higher for places that match the traveler's interests and are well reviewed by many people. */
function placeScore(p: RealPlace, interests: Interest[]): number {
  const match = p.interests.filter((i) => interests.includes(i)).length;
  const reviews = p.rating !== null && p.ratingCount ? p.rating * Math.log10(p.ratingCount + 1) : 0;
  return match * 5 + reviews;
}

function placeItem(p: RealPlace, id: string, time: SlotTime): ItineraryItem {
  return {
    id,
    time,
    kind: p.kind,
    name: p.name,
    area: p.address ?? p.typeLabel,
    note: p.description || p.typeLabel,
    costPerPerson: p.costPerPerson,
    placeId: p.placeId,
    mapsUrl: p.mapsUrl,
    rating: p.rating,
    ratingCount: p.ratingCount,
    costSource: p.costSource,
  };
}

/**
 * Day-by-day plan from real places. Every place appears at most once; when real
 * places run out the slot is left as open time rather than invented.
 */
export function buildRealItinerary(opts: {
  sights: RealPlace[];
  restaurants: RealPlace[];
  destName: string;
  days: number;
  startDate: string;
  interests: Interest[];
  tripType: TripType;
}): Itinerary {
  const { destName, days, startDate, interests, tripType } = opts;
  const sights = [...opts.sights].sort(
    (a, b) => placeScore(b, interests) - placeScore(a, interests),
  );
  const byScore = [...opts.restaurants].sort(
    (a, b) => placeScore(b, interests) - placeScore(a, interests),
  );
  // Cheaper half for lunch, pricier half for dinner; fall back to whatever is left.
  const byCost = [...byScore].sort((a, b) => a.costPerPerson - b.costPerPerson);
  const half = Math.ceil(byCost.length / 2);
  const lunchPool = byScore.filter((r) => byCost.indexOf(r) < half);
  const dinnerPool = byScore.filter((r) => byCost.indexOf(r) >= half);
  const used = new Set<string>();
  const take = (...pools: RealPlace[][]) => {
    for (const pool of pools) {
      const p = pool.find((x) => !used.has(x.placeId));
      if (p) {
        used.add(p.placeId);
        return p;
      }
    }
    return null;
  };
  const open = (id: string, time: SlotTime, kind: ItemKind): ItineraryItem => ({
    id,
    time,
    kind,
    name: kind === "restaurant" ? "Your pick for a meal" : "Open time to wander",
    area: destName,
    note: "No more highly rated places matched — choose something on the day",
    costPerPerson: 0,
    costSource: "unknown",
  });

  const out: ItineraryDay[] = [];
  for (let d = 0; d < days; d++) {
    const id = (k: string) => `g${d + 1}-${k}`;
    const items: ItineraryItem[] = [];
    if (d === 0 && tripType === "road-trip") {
      items.push({
        id: id("drive"),
        time: "Morning",
        kind: "stop",
        name: `Drive to ${destName}`,
        area: "Find real stops on the Road trip page",
        note: "Fuel is in your gas budget.",
        costPerPerson: 0,
      });
    } else {
      const m = take(sights);
      items.push(m ? placeItem(m, id("am"), "Morning") : open(id("am"), "Morning", "sight"));
    }
    const l = take(lunchPool, dinnerPool);
    items.push(l ? placeItem(l, id("lunch"), "Lunch") : open(id("lunch"), "Lunch", "restaurant"));
    const a = take(sights);
    items.push(a ? placeItem(a, id("pm"), "Afternoon") : open(id("pm"), "Afternoon", "sight"));
    const dn = take(dinnerPool, lunchPool);
    items.push(
      dn ? placeItem(dn, id("dinner"), "Dinner") : open(id("dinner"), "Dinner", "restaurant"),
    );
    out.push({
      day: d + 1,
      date: addDays(startDate, d),
      title:
        d === 0
          ? "Arrive & settle in"
          : d === days - 1 && days > 1
            ? "Last look & head home"
            : `Explore ${destName}`,
      items,
    });
  }

  return {
    source: "google",
    days: out,
    tips: [
      "Places, ratings and addresses come from Google Maps. Check opening hours before you go.",
      "Restaurant costs are estimated from each listing's price range or $ level. Attractions rarely publish ticket prices, so those show as not listed.",
    ],
  };
}

/** Items whose price isn't published, so the budget can't include them. */
export function unpricedItems(itin: Itinerary | null): number {
  if (!itin) return 0;
  return itin.days.flatMap((d) => d.items).filter((i) => i.costSource === "unknown" && i.placeId)
    .length;
}
