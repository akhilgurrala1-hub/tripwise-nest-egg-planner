import { cleanAiPlan } from "./ai-quality";
import { addDays } from "./dates";
import {
  buildCustomDestination,
  type DemoDestination,
  type Interest,
  type TravelStyle,
  type TripType,
} from "./demo-data";
import type { CityLeg } from "./multi-city";
import type { PlaceSource, RealPlace } from "./places/types";
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
  /** Opening hours and price as the source publishes them */
  hours?: string | null;
  priceText?: string | null;
  /** Where the place came from (travel guide, Wikipedia, OpenStreetMap, Google Maps) */
  source?: PlaceSource;
  /** Added or edited by the traveler (shown as "Your stop"; never replaced by suggestions) */
  custom?: boolean;
}

export interface ItineraryDay {
  day: number;
  date: string;
  title: string;
  items: ItineraryItem[];
}

export interface Itinerary {
  /** google = Google Maps; open = Wikipedia landmarks + OpenStreetMap restaurants (free) */
  source: "demo" | "ai" | "google" | "open";
  days: ItineraryDay[];
  tips: string[];
}

// Calendar math runs in UTC (see dates.ts): local-noon + toISOString shifted dates for travelers east of UTC+12.
export { addDays } from "./dates";

/** First stop on day one, by how the trip is taken (staycations start at home). */
const ARRIVAL: Partial<Record<TripType, { name: string; note: string }>> = {
  "road-trip": {
    name: "Scenic drive & roadside stop",
    note: "Stretch, refuel and grab a photo. Fuel is in your gas budget.",
  },
  flight: {
    name: "Fly in & check in",
    note: "Your fare is in Transportation; leave time for the airport transfer.",
  },
  rail: {
    name: "Ride in by train or bus",
    note: "Your ticket is in Transportation. Pack snacks for the ride.",
  },
  cruise: {
    name: "Board the ship",
    note: "Check-in, muster drill and sail-away. Cabin and main dining are in your fare.",
  },
};

const TIERS: Record<TravelStyle, { lunch: number[]; dinner: number[] }> = {
  budget: { lunch: [1], dinner: [1, 2] },
  comfort: { lunch: [1, 2], dinner: [2] },
  luxury: { lunch: [2], dinner: [3] },
};

/**
 * A plan that respects what's already covered: with meals taken care of, meals are
 * at home ($0); with no paid activities, paid sights become free time. The
 * traveler's own stops are never changed.
 */
export function fitToCoverage(
  itin: Itinerary,
  coverage: { meals?: boolean; activities?: boolean } | null | undefined,
): Itinerary {
  if (!coverage?.meals && !coverage?.activities) return itin;
  return {
    ...itin,
    days: itin.days.map((d) => ({
      ...d,
      items: d.items.map((i): ItineraryItem => {
        if (i.custom) return i;
        if (coverage.meals && i.kind === "restaurant")
          return {
            id: i.id,
            time: i.time,
            kind: i.kind,
            name: "Meal at home",
            area: "",
            note: "Covered",
            costPerPerson: 0,
          };
        if (coverage.activities && i.kind === "sight" && i.costPerPerson > 0)
          return {
            id: i.id,
            time: i.time,
            kind: i.kind,
            name: "Free time",
            area: "",
            note: "No paid activities planned",
            costPerPerson: 0,
          };
        return i;
      }),
    })),
  };
}

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
        note: "Unplanned time to revisit a favorite or rest up",
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
      style === "budget"
        ? "Free stops are prioritized to stretch your budget."
        : style === "luxury"
          ? "Signature experiences are prioritized for a premium trip."
          : "A balanced mix of free and paid experiences.",
    ],
  };
}

const shortName = (name: string) => name.split(",")[0]!.trim() || name;

/**
 * Join one plan per city into the whole trip's plan: each city's days in order,
 * renumbered and dated, with a travel stop to start each new city and day titles
 * that name the city. Pure, so example, real-places and AI plans join the same way.
 */
export function stitchCityPlans(
  legs: readonly CityLeg[],
  parts: readonly Itinerary[],
  totalDays: number,
  startDate: string,
  source: Itinerary["source"],
  tips: string[] = [],
): Itinerary {
  const days: ItineraryDay[] = [];
  legs.forEach((leg, i) => {
    const city = shortName(leg.name);
    (parts[i]?.days ?? []).slice(0, leg.days).forEach((d, j) => {
      const index = leg.arriveDay + j;
      if (index >= totalDays) return;
      const lastOfTrip = index === totalDays - 1 && totalDays > 1;
      let items = d.items.map((it) => ({ ...it, id: `c${i + 1}-${it.id}` }));
      if (i > 0 && j === 0) {
        const prev = shortName(legs[i - 1]!.name);
        items = [
          {
            id: `c${i + 1}-travel`,
            time: "Morning",
            kind: "stop",
            name: `Travel to ${city}`,
            area: `From ${prev}`,
            note: "Between cities. The fare is in your transportation budget.",
            costPerPerson: 0,
          },
          ...items.filter((it) => it.time !== "Morning" && it.kind !== "stop"),
        ];
      }
      days.push({
        ...d,
        day: index + 1,
        date: addDays(startDate, index),
        items,
        title: lastOfTrip
          ? `Last look at ${city} & head home`
          : i > 0 && j === 0
            ? `Travel to ${city}`
            : index === 0
              ? `Arrive in ${city}`
              : `Explore ${city}`,
      });
    });
  });
  const merged = [...new Set([...tips, ...parts.flatMap((p) => p.tips)])].slice(0, 6);
  return { source, days, tips: merged };
}

/**
 * The example plan for a whole trip. One city: the usual plan. Several cities: a
 * plan per city for its own days (the first city uses the destination's ideas,
 * the others generic ones), joined in order, with a travel day into each new city.
 */
export function generateTripItinerary(opts: {
  dest: DemoDestination;
  days: number;
  startDate: string;
  interests: Interest[];
  style: TravelStyle;
  tripType: TripType;
  legs?: readonly CityLeg[] | null;
}): Itinerary {
  const legs = opts.legs ?? [];
  if (legs.length < 2) return generateDemoItinerary(opts);
  const parts = legs.map((leg) =>
    generateDemoItinerary({
      ...opts,
      dest: leg.main ? opts.dest : buildCustomDestination(leg.name),
      days: leg.days,
      startDate: addDays(opts.startDate, leg.arriveDay),
    }),
  );
  return stitchCityPlans(legs, parts, opts.days, opts.startDate, "demo", [
    `${legs.length} cities: ${legs.map((l) => shortName(l.name)).join(", ")}. Each move between cities gets its own travel day.`,
  ]);
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
  // Travel-guide picks were chosen and described by travelers, so they rank ahead of bare map pins.
  const recommended = p.source === "wikivoyage" ? 4 + (p.description ? 1 : 0) : 0;
  return match * 5 + reviews + recommended;
}

function placeItem(p: RealPlace, id: string, time: SlotTime): ItineraryItem {
  return {
    id,
    time,
    kind: p.kind,
    name: p.name,
    area: p.address ?? p.typeLabel,
    // Don't repeat the type when it's already shown as the area.
    note:
      p.description && p.description !== (p.address ?? p.typeLabel)
        ? p.description
        : p.address
          ? p.typeLabel
          : "",
    costPerPerson: p.costPerPerson,
    placeId: p.placeId,
    mapsUrl: p.mapsUrl,
    rating: p.rating,
    ratingCount: p.ratingCount,
    costSource: p.costSource,
    ...(p.hours ? { hours: p.hours } : {}),
    ...(p.priceText ? { priceText: p.priceText } : {}),
    ...(p.source ? { source: p.source } : {}),
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
  source?: "google" | "open";
  /** Practical advice to add to the plan's tips (e.g. from the travel guide) */
  extraTips?: string[];
  /** The food budget per person per day: meals that would blow it aren't picked */
  mealBudgetPerPersonDay?: number;
}): Itinerary {
  const { destName, days, startDate, interests, tripType, source = "google" } = opts;
  const sights = [...opts.sights].sort(
    (a, b) => placeScore(b, interests) - placeScore(a, interests),
  );
  // Bars and music venues fill evenings rather than meals.
  const eveningPool = opts.restaurants
    .filter((r) => r.evening)
    .sort((a, b) => placeScore(b, interests) - placeScore(a, interests));
  const meal = opts.mealBudgetPerPersonDay;
  const affordable = (r: RealPlace, share: number) =>
    !meal || meal <= 0 || r.costSource === "unknown" || r.costPerPerson <= meal * share;
  const byScore = opts.restaurants
    .filter((r) => !r.evening && affordable(r, 0.75))
    .sort((a, b) => placeScore(b, interests) - placeScore(a, interests));
  // Cheaper half for lunch, pricier half for dinner; fall back to whatever is left.
  const byCost = [...byScore].sort((a, b) => a.costPerPerson - b.costPerPerson);
  const half = Math.ceil(byCost.length / 2);
  const lunchPool = byScore.filter((r) => byCost.indexOf(r) < half && affordable(r, 0.45));
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
    note: "No more highly rated places matched. Choose something on the day",
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
    // Not on the last evening (heading home); never invented when there's no real pick.
    const ev = d < days - 1 || days === 1 ? take(eveningPool) : null;
    if (ev) items.push(placeItem(ev, id("eve"), "Evening"));
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
    source,
    days: out,
    tips:
      source === "open"
        ? [
            ...(opts.extraTips ?? []).slice(0, 2),
            "Picks come from Wikivoyage (written by travelers), Wikipedia and OpenStreetMap. Check opening hours before you go.",
            "Places that don't publish a price show as not listed and aren't counted in the plan's total.",
          ]
        : [
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

/** Restaurant picks in the plan, for the whole group. */
export function itineraryMealCost(itin: Itinerary | null, travelers: number): number {
  if (!itin) return 0;
  const perPerson = itin.days
    .flatMap((d) => d.items)
    .filter((i) => i.kind === "restaurant")
    .reduce((s, i) => s + (Number.isFinite(i.costPerPerson) ? i.costPerPerson : 0), 0);
  return Math.round(perPerson * Math.max(1, travelers) * 100) / 100;
}

export type BudgetFit = "matches" | "under" | "over";

/**
 * How the plan's total compares to the budget set aside for it. Within 5% (or $10)
 * counts as matching so small rounding never raises a flag.
 */
export function compareToBudget(
  planned: number,
  budget: number,
): { fit: BudgetFit; difference: number } {
  const difference = Math.round((planned - budget) * 100) / 100;
  const tolerance = Math.max(10, Math.abs(budget) * 0.05);
  if (Math.abs(difference) <= tolerance) return { fit: "matches", difference };
  return { fit: difference > 0 ? "over" : "under", difference };
}

/** Shape of a day plan returned by the AI planner (before ids and dates are added). */
export interface AiPlanDay {
  title: string;
  items: Omit<ItineraryItem, "id" | "costSource" | "custom">[];
}

/** Turn the AI planner's answer into an itinerary for these dates (checked and cleaned; see ai-quality.ts). */
export function fromAiPlan(
  plan: { days: AiPlanDay[]; tips: string[] },
  startDate: string,
  days: number,
): Itinerary {
  return cleanAiPlan(plan, { days, startDate });
}
