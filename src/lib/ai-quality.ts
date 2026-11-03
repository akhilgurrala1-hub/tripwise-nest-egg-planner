/**
 * Checks on what the AI sends back, before anyone sees it. The model isn't trained
 * by the app; quality comes from grounding it in real data (places, weather,
 * holidays) and from these deterministic clean-ups, which are tested.
 */
import type { TripDraft } from "./ai/trip-chat.server";
import { addDays } from "./dates";
import type { Itinerary, ItineraryDay, ItineraryItem, ItemKind, SlotTime } from "./itinerary";
import type { RealPlace } from "./places/types";

const SLOTS: SlotTime[] = ["Morning", "Lunch", "Afternoon", "Dinner", "Evening"];
const KINDS: ItemKind[] = ["sight", "restaurant", "stop"];
const MAX_ITEMS_PER_DAY = 6;
const MAX_COST = 1500;

/** Em dashes (and spaced en dashes) read as machine-written; plain punctuation instead. */
export function plainDashes(text: string): string {
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+–\s+/g, ", ")
    .replace(/,\s*([.,;:!?])/g, "$1")
    .replace(/^,\s*/, "");
}

const clip = (s: unknown, n: number) => {
  const t = plainDashes(String(s ?? ""))
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

export const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The real place an AI item refers to, if its name clearly matches one. */
export function matchRealPlace(name: string, places: RealPlace[]): RealPlace | null {
  const n = normName(name);
  if (n.length < 4) return null;
  for (const p of places) {
    const m = normName(p.name);
    if (m.length < 4) continue;
    if (n === m) return p;
    // "The British Museum" ↔ "British Museum", "Visit Hyde Park" ↔ "Hyde Park"
    if ((n.includes(m) && m.length >= 6) || (m.includes(n) && n.length >= 6)) return p;
  }
  return null;
}

/**
 * Places from several sources as one list: `primary` first, then anything from
 * `secondary` that isn't the same place (by name). A duplicate still lends the
 * primary its missing details (hours, address, map link).
 */
export function mergePlaces(primary: RealPlace[], secondary: RealPlace[]): RealPlace[] {
  const out = primary.map((p) => ({ ...p }));
  for (const s of secondary) {
    const same = matchRealPlace(s.name, out);
    if (!same) {
      out.push(s);
      continue;
    }
    if (!same.hours && s.hours) same.hours = s.hours;
    if (!same.address && s.address) same.address = s.address;
  }
  return out;
}

/** Real nearby places as short lines for the prompt ("British Museum — Museum in London"). */
export function placeLines(sights: RealPlace[], restaurants: RealPlace[]): string[] {
  const line = (p: RealPlace) => {
    const facts = [
      p.description && p.description !== p.typeLabel ? p.description : "",
      p.priceText
        ? `price: ${p.priceText}`
        : p.costSource === "price-level" && p.costPerPerson > 0
          ? `about $${Math.round(p.costPerPerson)} per person`
          : "",
      p.hours ? `hours: ${p.hours}` : "",
      p.source === "wikivoyage" ? "recommended by travelers" : "",
    ].filter(Boolean);
    return clip(`${p.name} (${p.typeLabel})${facts.length ? `: ${facts.join("; ")}` : ""}`, 260);
  };
  return [...sights.slice(0, 25).map(line), ...restaurants.slice(0, 15).map(line)];
}

/** The current plan, one line per item, so a refinement knows what to keep. */
export function planLines(itin: Itinerary | null): string[] {
  if (!itin) return [];
  return itin.days.flatMap((d) =>
    d.items.map((i) => clip(`Day ${d.day} ${i.time}: ${i.name} (${i.kind})`, 160)),
  );
}

interface RawItem {
  time?: unknown;
  kind?: unknown;
  name?: unknown;
  area?: unknown;
  note?: unknown;
  costPerPerson?: unknown;
}
interface RawPlan {
  days?: { title?: unknown; items?: RawItem[] }[];
  tips?: unknown[];
}

/**
 * A safe itinerary from the AI's answer: exactly `days` days on the trip's dates,
 * known times and kinds only, sorted, no repeats within a day, sane prices, short
 * text, and items that name a real nearby place linked to it on the map.
 */
export function cleanAiPlan(
  plan: RawPlan,
  opts: { days: number; startDate: string; realPlaces?: RealPlace[] },
): Itinerary {
  const real = opts.realPlaces ?? [];
  const raw = Array.isArray(plan.days) ? plan.days : [];
  const days: ItineraryDay[] = [];
  for (let di = 0; di < opts.days; di++) {
    const d = raw[di];
    const seen = new Set<string>();
    const items: ItineraryItem[] = [];
    for (const [ii, it] of (Array.isArray(d?.items) ? d!.items : []).entries()) {
      const time = SLOTS.includes(it?.time as SlotTime) ? (it.time as SlotTime) : null;
      const kind = KINDS.includes(it?.kind as ItemKind) ? (it.kind as ItemKind) : null;
      const name = clip(it?.name, 80);
      if (!time || !kind || !name) continue;
      const key = normName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      const cost = Number(it.costPerPerson);
      const match = matchRealPlace(name, real);
      items.push({
        id: `ai-${di}-${ii}`,
        time,
        kind,
        name,
        area: clip(it.area, 60),
        note: clip(it.note, 140),
        // A price the source publishes beats the model's guess.
        costPerPerson:
          match?.costSource === "listed"
            ? match.costPerPerson
            : Number.isFinite(cost)
              ? Math.round(Math.min(MAX_COST, Math.max(0, cost)) * 100) / 100
              : 0,
        ...(match
          ? {
              placeId: match.placeId,
              mapsUrl: match.mapsUrl,
              ...(match.costSource === "listed" ? { costSource: "listed" as const } : {}),
              ...(match.hours ? { hours: match.hours } : {}),
              ...(match.priceText ? { priceText: match.priceText } : {}),
              ...(match.source ? { source: match.source } : {}),
            }
          : {}),
      });
    }
    items.sort((a, b) => SLOTS.indexOf(a.time) - SLOTS.indexOf(b.time));
    days.push({
      day: di + 1,
      date: addDays(opts.startDate, di),
      title: clip(d?.title, 60) || (items.length ? `Day ${di + 1}` : "Free day"),
      items: items.slice(0, MAX_ITEMS_PER_DAY),
    });
  }
  const tips = (Array.isArray(plan.tips) ? plan.tips : [])
    .map((t) => clip(t, 220))
    .filter(Boolean)
    .slice(0, 4);
  return { source: "ai", days, tips };
}

/**
 * Problems worth one automatic retry: a missing or thin day, a sight repeated on
 * different days, or spending well past the budget. Each is phrased as an
 * instruction the model can act on. An empty list means the plan is fine as is.
 */
export function planProblems(
  plan: RawPlan,
  want: { days: number; activityBudgetPerPerson: number; foodBudgetPerPersonDay: number },
): string[] {
  const days = Array.isArray(plan.days) ? plan.days : [];
  const problems: string[] = [];
  if (days.length !== want.days)
    problems.push(`Return exactly ${want.days} days (you returned ${days.length}).`);
  const seen = new Map<string, number>();
  let sights = 0;
  let meals = 0;
  days.slice(0, want.days).forEach((d, i) => {
    const items = Array.isArray(d?.items) ? d.items : [];
    if (items.length < 3)
      problems.push(`Day ${i + 1} has only ${items.length} item(s); give it at least 4.`);
    for (const it of items) {
      const cost = Number(it?.costPerPerson);
      const c = Number.isFinite(cost) && cost > 0 ? cost : 0;
      if (it?.kind === "restaurant") meals += c;
      else sights += c;
      if (it?.kind !== "sight") continue;
      const key = normName(String(it?.name ?? ""));
      if (key.length < 4) continue;
      const first = seen.get(key);
      if (first !== undefined && first !== i + 1)
        problems.push(`"${clip(it?.name, 60)}" is on day ${first} and day ${i + 1}; use it once.`);
      else seen.set(key, i + 1);
    }
  });
  const sightBudget = Math.max(0, want.activityBudgetPerPerson);
  if (sights > sightBudget * 1.25 + 15)
    problems.push(
      `Sightseeing adds up to $${Math.round(sights)} per person but the budget is $${Math.round(sightBudget)}; swap in free or cheaper sights.`,
    );
  const n = Math.max(1, Math.min(days.length, want.days));
  const mealsPerDay = meals / n;
  const foodBudget = Math.max(0, want.foodBudgetPerPersonDay);
  if (foodBudget > 0 && mealsPerDay > foodBudget * 1.35 + 5)
    problems.push(
      `Meals average $${Math.round(mealsPerDay)} per person per day but the food budget is $${Math.round(foodBudget)}; choose cheaper restaurants.`,
    );
  return problems.slice(0, 6);
}

/** How much of the AI's plan matched real places, for the success message. */
export function groundedCount(itin: Itinerary): number {
  return itin.days.flatMap((d) => d.items).filter((i) => i.placeId).length;
}

export interface ChatAnswer {
  reply: string;
  ready: boolean;
  questions: { question: string; options: string[] }[];
  ideas: { name: string; why: string }[];
  trip: TripDraft;
}

/** Trim and bound the assistant's answer so the conversation always renders cleanly. */
export function cleanChatAnswer(a: ChatAnswer): ChatAnswer {
  const t = a.trip;
  const travelers =
    t.travelers === null || !Number.isFinite(t.travelers)
      ? null
      : Math.min(20, Math.max(1, Math.round(t.travelers)));
  const nights =
    t.nights === null || !Number.isFinite(t.nights)
      ? null
      : Math.min(30, Math.max(0, Math.round(t.nights)));
  const budget =
    t.totalBudget === null || !Number.isFinite(t.totalBudget) || t.totalBudget <= 0
      ? null
      : Math.round(Math.min(1_000_000, t.totalBudget));
  return {
    reply: clip(a.reply, 400) || "Tell me a bit more about the trip you have in mind.",
    ready: !!a.ready,
    questions: a.questions
      .map((q) => ({
        question: clip(q.question, 140),
        options: [...new Set(q.options.map((o) => clip(o, 40)).filter(Boolean))].slice(0, 4),
      }))
      .filter((q) => q.question)
      .slice(0, 3),
    ideas: a.ideas
      .map((i) => ({ name: clip(i.name, 60), why: clip(i.why, 90) }))
      .filter((i) => i.name)
      .slice(0, 3),
    trip: {
      ...t,
      destination: t.destination ? clip(t.destination, 120) : null,
      origin: t.origin ? clip(t.origin, 120) : null,
      travelers,
      nights,
      totalBudget: budget,
      interests: [...new Set(t.interests)],
      covered: {
        lodging: !!t.covered?.lodging,
        meals: !!t.covered?.meals,
        activities: !!t.covered?.activities,
        localTransport: !!t.covered?.localTransport,
      },
      // Every city the traveler named, in order, with whole nights (at least one).
      cities: (Array.isArray(t.cities) ? t.cities : [])
        .map((c) => ({
          name: clip(String(c?.name ?? ""), 120),
          nights: Math.min(30, Math.max(1, Math.round(Number(c?.nights) || 1))),
        }))
        .filter((c) => c.name)
        .slice(0, 8),
      cabin: (["economy", "premium", "business", "first"] as const).includes(t.cabin as "economy")
        ? t.cabin
        : null,
      // A round trip to the airport or station: never negative, never absurd.
      transferCost:
        t.transferCost === null || t.transferCost === undefined || !Number.isFinite(t.transferCost)
          ? null
          : Math.round(Math.min(500, Math.max(0, t.transferCost))),
    },
  };
}
