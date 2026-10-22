import type { DemoDestination, Interest, TravelStyle, TripType } from "./demo-data";

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
}

export interface ItineraryDay {
  day: number;
  date: string;
  title: string;
  items: ItineraryItem[];
}

export interface Itinerary {
  source: "demo" | "ai";
  days: ItineraryDay[];
  tips: string[];
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

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
  const eveningSights = sights.filter((x) => x.evening && x.interests.some((i) => interests.includes(i)));
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

    if (d === 0 && tripType === "road-trip") {
      items.push({
        id: id("drive"),
        time: "Morning",
        kind: "stop",
        name: "Scenic drive & roadside stop",
        area: `On the way to ${dest.name}`,
        note: "Stretch, refuel and grab a photo — fuel is in your gas budget.",
        costPerPerson: 0,
      });
    } else {
      const m = nextSight();
      items.push({ id: id("am"), time: "Morning", kind: "sight", name: m.name, area: m.area, note: m.note, costPerPerson: m.costPerPerson });
    }

    const l = lunches[d % lunches.length]!;
    items.push({ id: id("lunch"), time: "Lunch", kind: "restaurant", name: l.name, area: l.cuisine, note: tierNote(l.tier), costPerPerson: l.costPerPerson });

    const a = nextSight();
    items.push({ id: id("pm"), time: "Afternoon", kind: "sight", name: a.name, area: a.area, note: a.note, costPerPerson: a.costPerPerson });

    const dn = dinners[(d + 1) % dinners.length]!;
    items.push({ id: id("dinner"), time: "Dinner", kind: "restaurant", name: dn.name, area: dn.cuisine, note: tierNote(dn.tier), costPerPerson: dn.costPerPerson });

    const ev = eveningSights[ei];
    if (ev && d < days - 1) {
      ei++;
      items.push({ id: id("eve"), time: "Evening", kind: "sight", name: ev.name, area: ev.area, note: ev.note, costPerPerson: ev.costPerPerson });
    }

    out.push({
      day: d + 1,
      date: addDays(startDate, d),
      title: d === 0 ? "Arrive & settle in" : d === days - 1 && days > 1 ? "Last look & head home" : `Explore ${dest.name}`,
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
  return tier === 1 ? "$ · Casual & affordable" : tier === 2 ? "$$ · Sit-down favorite" : "$$$ · Special occasion";
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
