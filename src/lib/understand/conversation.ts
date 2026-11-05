/**
 * The whole conversation as one trip: every message read in order (later answers
 * win, bare answers like "2" or "chicago" go to the question they answer), plus
 * what's still missing, what to ask next, and ideas when they don't know where.
 *
 * This is Waypoint's own understanding, free and instant. It runs for everyone,
 * answers on its own when the AI isn't available, and checks the AI's answers
 * (see reconcile.ts) so a city the traveler named is never dropped.
 */
import type { TripDraft } from "../ai/trip-chat.server";
import type { GeoPoint } from "../catalog";
import { CATALOG } from "../catalog";
import { addDays, isIsoDate } from "../dates";
import { getDestination, type Interest, type TripType } from "../demo-data";
import { recommendDestinations } from "../recommend";
import type { Gazetteer } from "./gazetteer";
import { readMessage, type MessageFacts } from "./read";
import type { PlaceRef } from "./where";

export type AskField =
  | "destination"
  | "narrow"
  | "dates"
  | "length"
  | "travelers"
  | "origin"
  | "style"
  | "interests"
  | "budget"
  | "cabin"
  | "stops"
  | "transport";

export interface LocalQuestion {
  field: AskField;
  question: string;
  options: string[];
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  /** What the assistant asked in that turn (so bare answers land in the right place) */
  fields?: AskField[];
}

export interface UnderstandContext {
  today: string;
  gazetteer: Gazetteer;
  homeCity?: string;
  homeCountry?: string;
  /** Where they start, for nearby ideas */
  from?: GeoPoint | null;
  /** US dollars per unit of other currencies ({ EUR: 1.08 }) */
  usdPer?: Record<string, number>;
}

export interface Understanding {
  draft: TripDraft;
  /** The group size came from words like "the kids" and should be checked */
  travelersGuessed: boolean;
  /** Dates came from "sometime", a season or a month, not exact days */
  datesApprox: boolean;
  /** A country or region that needs a city ("Japan", "Europe") */
  broad: PlaceRef | null;
  unsure: boolean;
  vibes: string[];
  kids: boolean;
  group?: string;
  /** The last message said yes */
  confirmed: boolean;
  /** Fields already asked and answered (or passed on), never asked again */
  answered: AskField[];
  /** The budget the traveler said, in its own currency, when it wasn't dollars */
  statedBudget?: { amount: number; currency: string };
  /** Every place they named that Waypoint read (for checking the AI) */
  named: PlaceRef[];
  /** The last message read */
  last: MessageFacts | null;
  /** Places they're choosing between ("paris or rome") */
  choices: PlaceRef[];
}

export const emptyDraft = (): TripDraft => ({
  destination: null,
  origin: null,
  startDate: null,
  endDate: null,
  nights: null,
  travelers: null,
  tripType: null,
  transportMode: null,
  style: null,
  totalBudget: null,
  interests: [],
  covered: { lodging: false, meals: false, activities: false, localTransport: false },
  transferCost: null,
  cities: [],
  cabin: null,
  stops: null,
});

const BARE_NUMBER =
  /^\s*(?:about |around |maybe |like )?(\d{1,6})(?:\s*(?:people|of us|nights?|days?))?\s*[.!]?\s*$/;
const NOT_SURE =
  /\b(not sure|no idea|i do not know|flexible|any ?time|whenever|does not matter|up to you|you (pick|choose|decide)|surprise me|no preference|either|whatever)\b/;
const WORK_IT_OUT =
  /\b(work it out|you decide|no budget|not sure|whatever it costs|no idea|figure it out|no limit|do not have one|none)\b/;
const ADD_CITY = /\b(add|also|plus|then|and then|after that|followed by|as well|too)\b/;

const DAY_MS = 86_400_000;
const nightsBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);
const fridayAfter = (iso: string) =>
  addDays(iso, (5 - new Date(`${iso}T12:00:00Z`).getUTCDay() + 7) % 7);

/** A neighbor you can drive to (so being abroad doesn't mean flying). */
const DRIVABLE: Record<string, string[]> = { US: ["CA", "MX"], CA: ["US"], MX: ["US"] };

export function understand(
  turns: readonly ConversationTurn[],
  ctx: UnderstandContext,
): Understanding {
  const draft = emptyDraft();
  const u: Understanding = {
    draft,
    travelersGuessed: false,
    datesApprox: false,
    broad: null,
    unsure: false,
    vibes: [],
    kids: false,
    confirmed: false,
    answered: [],
    named: [],
    last: null,
    choices: [],
  };
  const answered = new Set<AskField>();
  let perPerson = false;
  let destRef: PlaceRef | null = null;
  let cityRefs: PlaceRef[] = [];
  let asked: AskField[] = [];
  const readCtx = {
    today: ctx.today,
    gazetteer: ctx.gazetteer,
    ...(ctx.homeCity ? { homeCity: ctx.homeCity } : {}),
    ...(ctx.homeCountry ? { homeCountry: ctx.homeCountry } : {}),
  };

  for (const turn of turns) {
    if (turn.role === "assistant") {
      asked = turn.fields ?? [];
      continue;
    }
    const f = readMessage(turn.content, readCtx);
    u.last = f;
    const text = f.text;
    const bare = text.match(BARE_NUMBER);
    let cities = f.where.cities;
    let origin = f.where.origin;
    u.named.push(...cities, ...(origin ? [origin] : []));

    // A place given as the answer to "where from?" is the start.
    if (asked.includes("origin") && !origin && cities.length === 1 && !/\bto\b/.test(text)) {
      origin = cities[0];
      cities = [];
    }
    const cruise = (f.prefs.tripType ?? draft.tripType) === "cruise";
    // "a cruise from miami" or "to the bahamas from port canaveral": the port is the
    // trip's place (cruises are planned from where they sail).
    if (cruise && origin) {
      cities = [origin];
      origin = undefined;
    }
    // "paris or rome?": they'll pick one; "both" makes it a route.
    if (f.where.choices?.length) {
      u.choices = f.where.choices.map((c) => ({ ...c }));
      if (!cities.length) {
        destRef = null;
        cityRefs = [];
      }
    } else if (
      u.choices.length &&
      !cities.length &&
      /\b(both|all of them|all 3|all three|why not both)\b/.test(text)
    ) {
      cities = u.choices;
      u.choices = [];
    } else if (cities.length) u.choices = [];
    if (cities.length >= 2) {
      cityRefs = cities.map((c) => ({ ...c }));
      destRef = cityRefs[0]!;
    } else if (cities.length === 1) {
      const c = cities[0]!;
      const broadSame =
        c.kind !== "city" &&
        destRef?.kind === "city" &&
        destRef.country &&
        destRef.country === c.country;
      if (broadSame) {
        // "Japan" after "Tokyo": nothing new.
      } else if (cityRefs.length >= 2 && ADD_CITY.test(text) && !asked.includes("narrow")) {
        if (!cityRefs.some((x) => x.name === c.name)) cityRefs.push({ ...c });
      } else if (asked.includes("narrow") && cityRefs.length >= 2) {
        cityRefs = [{ ...c }];
        destRef = cityRefs[0]!;
      } else {
        destRef = { ...c };
        cityRefs = [];
      }
    }
    if (origin) draft.origin = origin.name;

    // When and how long.
    const w = f.when;
    if (w.startDate) {
      draft.startDate = w.startDate;
      draft.endDate = w.endDate ?? null;
      u.datesApprox = w.startKind === "month" || w.startKind === "season";
      if (!w.endDate && w.nights === undefined && draft.nights === null) draft.endDate = null;
    }
    // One place with its own length ("napa for 7 nights", "tripoli for 3 days") is the trip's.
    const solo = f.where.cities.length === 1 ? f.where.cities[0] : undefined;
    const soloNights =
      solo?.nights !== undefined
        ? solo.days
          ? Math.max(0, solo.nights - 1)
          : solo.nights
        : undefined;
    const length = w.nights ?? f.where.totalNights ?? soloNights;
    if (length !== undefined) {
      draft.nights = length;
      if (!w.endDate) draft.endDate = null;
    }
    if (bare && asked.includes("length") && length === undefined) {
      draft.nights = Math.min(364, +bare[1]!);
      draft.endDate = null;
    }
    if (asked.includes("dates") && !w.startDate && NOT_SURE.test(text)) {
      // No date in mind: a placeholder about six weeks out that's easy to change.
      draft.startDate = fridayAfter(addDays(ctx.today, 42));
      u.datesApprox = true;
    }

    // Who.
    if (f.people.travelers) {
      draft.travelers = f.people.travelers;
      u.travelersGuessed = !f.people.sure;
    } else if (bare && asked.includes("travelers") && +bare[1]! >= 1 && +bare[1]! <= 20) {
      draft.travelers = +bare[1]!;
      u.travelersGuessed = false;
    }
    if (f.people.kids) u.kids = true;
    if (f.people.group) u.group = f.people.group;

    // Money.
    const money = f.money;
    if (money.amount) {
      const rate = money.currency && money.currency !== "USD" ? ctx.usdPer?.[money.currency] : 1;
      if (rate) draft.totalBudget = Math.round(money.amount * rate);
      else {
        draft.totalBudget = null;
        u.statedBudget = { amount: money.amount, currency: money.currency! };
      }
      perPerson = !!money.perPerson;
    } else if (bare && asked.includes("budget") && +bare[1]! >= 50) {
      draft.totalBudget = +bare[1]!;
      perPerson = false;
    }
    if (asked.includes("budget") && !money.amount && WORK_IT_OUT.test(text))
      draft.totalBudget = null;

    // How.
    const p = f.prefs;
    if (p.tripType) draft.tripType = p.tripType;
    if (p.transportMode) draft.transportMode = p.transportMode;
    if (p.cabin) draft.cabin = p.cabin;
    if (p.stops) draft.stops = p.stops;
    if (p.style) draft.style = p.style;
    for (const i of p.interests) if (!draft.interests.includes(i)) draft.interests.push(i);
    for (const k of ["lodging", "meals", "activities", "localTransport"] as const)
      if (p.covered[k]) draft.covered[k] = true;
    if (p.unsure && !cities.length) u.unsure = true;
    // Answering "where?" with a kind of place ("mountains", "a big city") means ideas, please.
    if (asked.includes("destination") && !cities.length) u.unsure = true;
    if (
      asked.includes("stops") &&
      !p.stops &&
      /^\s*(any|cheapest|whatever|do not care|does not matter|either)\b/.test(text)
    )
      draft.stops = "any";
    if (asked.includes("cabin") && !p.cabin) {
      const c = text.match(/^\s*(economy|premium|business|first)\b/)?.[1];
      if (c) draft.cabin = c as TripDraft["cabin"];
    }
    if (cities.length) u.unsure = false;
    for (const v of p.vibes) if (!u.vibes.includes(v)) u.vibes.push(v);
    u.confirmed = !!p.confirm;
    // Whatever was asked has had its turn: optional questions are never repeated.
    for (const a of asked) answered.add(a);
    asked = [];
  }

  // The places, as the draft writes them.
  if (cityRefs.length >= 2) {
    draft.cities = cityRefs.map((c) => ({ name: c.name, nights: c.nights ?? 0 }));
    draft.destination = cityRefs[0]!.name;
  } else if (destRef) {
    draft.destination = destRef.name;
    draft.cities = [];
  }
  const where = cityRefs[0] ?? destRef;
  u.broad = where && where.kind !== "city" && cityRefs.length < 2 ? where : null;

  // Lengths: the cities' nights add up to the trip when no length was given.
  if (draft.cities.length >= 2) {
    const given = draft.cities.filter((c) => c.nights > 0);
    const sum = given.reduce((t, c) => t + c.nights, 0);
    if (draft.nights === null && !draft.endDate && given.length === draft.cities.length)
      draft.nights = sum;
    const total =
      draft.nights ??
      (draft.startDate && draft.endDate ? nightsBetween(draft.startDate, draft.endDate) : null);
    if (total !== null && given.length < draft.cities.length) {
      // Share what's left evenly among the cities without nights.
      const left = Math.max(draft.cities.length - given.length, total - sum);
      const without = draft.cities.filter((c) => !(c.nights > 0));
      without.forEach(
        (c, i) =>
          (c.nights = Math.max(
            1,
            Math.floor(left / without.length) + (i < left % without.length ? 1 : 0),
          )),
      );
    }
    for (const c of draft.cities) if (!(c.nights > 0)) c.nights = 2;
    if (draft.nights === null && !draft.endDate)
      draft.nights = draft.cities.reduce((t, c) => t + c.nights, 0);
  }
  if (draft.startDate && !draft.endDate && draft.nights !== null)
    draft.endDate = addDays(draft.startDate, draft.nights);
  if (draft.startDate && draft.endDate && draft.nights === null)
    draft.nights = nightsBetween(draft.startDate, draft.endDate);
  if (draft.startDate && !isIsoDate(draft.startDate)) draft.startDate = null;

  if (perPerson && draft.totalBudget && draft.travelers) draft.totalBudget *= draft.travelers;
  if (u.kids && !draft.interests.includes("family")) draft.interests.push("family");

  // Going abroad (past a drivable border) means flying, unless they said otherwise.
  const dest = cityRefs[0] ?? destRef;
  if (
    !draft.tripType &&
    dest?.country &&
    ctx.homeCountry &&
    dest.country !== ctx.homeCountry &&
    !(DRIVABLE[ctx.homeCountry] ?? []).includes(dest.country)
  ) {
    draft.tripType = "flight";
    draft.transportMode = "flight";
  }
  if (draft.tripType === "staycation") {
    draft.destination = null;
    draft.cities = [];
    u.broad = null;
  }
  if (draft.tripType && draft.tripType !== "flight") draft.cabin = null;
  u.answered = [...answered];
  return u;
}

/** What has to be known before the trip can be built (the same rule as the planner's). */
export function missingRequired(u: Understanding): AskField[] {
  const d = u.draft;
  const out: AskField[] = [];
  if (d.tripType !== "staycation" && (!d.destination || u.broad))
    out.push(u.broad ? "narrow" : "destination");
  if (!d.startDate) out.push("dates");
  else if (d.nights === null && !d.endDate) out.push("length");
  if (!d.travelers) out.push("travelers");
  return out;
}

/** Ideas for a region people name without a city. */
const REGION_IDEAS: Record<string, string[]> = {
  Europe: ["Paris, France", "Rome, Italy", "Barcelona, Spain", "London, United Kingdom"],
  Caribbean: [
    "San Juan, Puerto Rico",
    "Nassau, Bahamas",
    "Montego Bay, Jamaica",
    "Punta Cana, Dominican Republic",
  ],
  Asia: ["Tokyo, Japan", "Bangkok, Thailand", "Seoul, South Korea", "Bali, Indonesia"],
  "Southeast Asia": [
    "Bangkok, Thailand",
    "Bali, Indonesia",
    "Hanoi, Vietnam",
    "Singapore, Singapore",
  ],
  "South America": [
    "Rio de Janeiro, Brazil",
    "Buenos Aires, Argentina",
    "Cusco, Peru",
    "Cartagena, Colombia",
  ],
  "Central America": [
    "San Jose, Costa Rica",
    "Tulum, Mexico",
    "Antigua, Guatemala",
    "Panama City, Panama",
  ],
  Africa: ["Cape Town, South Africa", "Marrakesh, Morocco", "Nairobi, Kenya", "Cairo, Egypt"],
  "Middle East": [
    "Dubai, United Arab Emirates",
    "Petra, Jordan",
    "Istanbul, Turkey",
    "Doha, Qatar",
  ],
  Scandinavia: ["Copenhagen, Denmark", "Stockholm, Sweden", "Oslo, Norway", "Bergen, Norway"],
  Balkans: ["Dubrovnik, Croatia", "Split, Croatia", "Kotor, Montenegro", "Ljubljana, Slovenia"],
  "New England": ["Boston, MA", "Portland, ME", "Bar Harbor, ME", "Burlington, VT"],
  "Pacific Northwest": [
    "Seattle, WA",
    "Portland, OR",
    "Vancouver, Canada",
    "Olympic National Park, WA",
  ],
  Midwest: ["Chicago, IL", "Minneapolis, MN", "Door County, WI", "Mackinac Island, MI"],
  "American South": ["Nashville, TN", "New Orleans, LA", "Charleston, SC", "Savannah, GA"],
  "East Coast": ["New York, NY", "Washington, DC", "Charleston, SC", "Boston, MA"],
  "West Coast": ["San Francisco, CA", "Los Angeles, CA", "San Diego, CA", "Seattle, WA"],
  Alps: [
    "Interlaken, Switzerland",
    "Chamonix, France",
    "Innsbruck, Austria",
    "Zermatt, Switzerland",
  ],
  Patagonia: [
    "El Calafate, Argentina",
    "Puerto Natales, Chile",
    "Bariloche, Argentina",
    "Ushuaia, Argentina",
  ],
  "Greek islands": ["Santorini, Greece", "Mykonos, Greece", "Crete, Greece", "Naxos, Greece"],
};

/** Cities to offer for a country, state or region ("Where in Japan?"). */
export function narrowOptions(broad: PlaceRef, g: Gazetteer, limit = 4): string[] {
  const fixed = REGION_IDEAS[broad.name.split(",")[0]!];
  if (fixed) return fixed.slice(0, limit);
  const out: string[] = [];
  const push = (n: string) => {
    if (n && !out.includes(n) && out.length < limit) out.push(n);
  };
  for (const p of CATALOG)
    if (broad.kind === "country" ? p.country === broad.country : p.region === broad.name)
      push(p.town);
  // Then the biggest airports' towns there.
  const seen = new Map<string, number>();
  for (const list of g.names.values())
    for (const c of list)
      if (
        c.kind === "city" &&
        (broad.kind === "country"
          ? c.country === broad.country
          : c.region && broad.name.startsWith(stateName(g, c))) &&
        c.weight >= 3
      )
        seen.set(c.name, Math.max(seen.get(c.name) ?? 0, c.weight));
  [...seen.entries()].sort((a, b) => b[1] - a[1]).forEach(([n]) => push(n));
  return out;
}
const stateName = (g: Gazetteer, c: { region: string; country: string }) =>
  [...g.states.values()].find((s) => s[0] === c.country && s[1] === c.region)?.[2] ?? "\u0000";

export interface Idea {
  name: string;
  why: string;
}

/** Places that fit what they've said, from where they start. */
export function ideasFor(u: Understanding, ctx: UnderstandContext, limit = 3): Idea[] {
  const interests: Interest[] = [...u.draft.interests];
  const v = u.vibes;
  if (v.includes("warm") && !interests.includes("beaches")) interests.push("beaches");
  if (v.includes("snow") && !interests.includes("adventure")) interests.push("adventure");
  if (v.includes("city")) interests.push("food", "arts");
  if (v.includes("quiet") && !interests.includes("nature")) interests.push("nature");
  if (v.includes("romantic") && !interests.includes("food")) interests.push("food");
  const tripType: TripType =
    u.draft.tripType && u.draft.tripType !== "staycation"
      ? u.draft.tripType
      : v.includes("close")
        ? "road-trip"
        : v.includes("abroad")
          ? "flight"
          : "road-trip";
  const all = recommendDestinations({ from: ctx.from ?? null, tripType, interests, limit: 12 });
  // Places that match what they asked for first ("somewhere warm" → beaches), and for
  // warm, the warmest (nearest the equator) of those.
  const lat = (id: string) => Math.abs(getDestination(id).anchor?.lat ?? 40);
  const ranked = [...all].sort(
    (a, b) =>
      b.matches.length - a.matches.length ||
      (v.includes("warm") ? lat(a.id) - lat(b.id) : v.includes("snow") ? lat(b.id) - lat(a.id) : 0),
  );
  const picks = interests.length || v.length ? ranked : all;
  const ideas: Idea[] = [];
  for (const s of picks) {
    const d = getDestination(s.id);
    const name = d.anchor?.name ?? d.port ?? s.name;
    if (v.includes("abroad") && (d.country ?? "US") === (ctx.homeCountry ?? "US")) continue;
    if (ideas.some((i) => i.name === name)) continue;
    const why = `${s.tagline}${s.distanceLabel ? `, ${s.distanceLabel}` : ""}`;
    ideas.push({ name, why: why.length > 90 ? s.tagline : why });
    if (ideas.length >= limit) break;
  }
  return ideas;
}

/** The next questions, required first, then a few that make the plan better. */
export function planQuestions(
  u: Understanding,
  ctx: UnderstandContext,
  max = 3,
): { questions: LocalQuestion[]; ideas: Idea[] } {
  const d = u.draft;
  const qs: LocalQuestion[] = [];
  let ideas: Idea[] = [];
  const missing = missingRequired(u);
  const answered = new Set(u.answered);
  const country = (name: string) => name.split(",").pop()!.trim();

  for (const field of missing) {
    if (field === "destination" && u.choices.length >= 2) {
      const names = u.choices.map((c) => c.name.split(",")[0]!);
      qs.push({
        field,
        question: `Which one: ${names.slice(0, -1).join(", ")} or ${names.at(-1)}?`,
        options: [
          ...u.choices.map((c) => c.name).slice(0, 3),
          names.length === 2 ? "Both" : "All of them",
        ],
      });
      continue;
    }
    if (field === "narrow" && u.broad) {
      qs.push({
        field,
        question: `Where in ${country(u.broad.name)}?`,
        options: narrowOptions(u.broad, ctx.gazetteer),
      });
    } else if (field === "destination") {
      ideas = ideasFor(u, ctx);
      qs.push(
        u.unsure || u.vibes.length
          ? {
              field,
              question: ideas.length ? "Any of these, or somewhere else?" : "What kind of place?",
              options: ideas.length
                ? []
                : ["Somewhere warm", "A big city", "Mountains and nature", "Surprise me"],
            }
          : {
              field,
              question: "Where do you want to go?",
              options: ["Somewhere warm", "A big city", "Mountains and nature", "Surprise me"],
            },
      );
    } else if (field === "dates") {
      const n = d.nights;
      qs.push({
        field,
        question:
          n !== null
            ? `When do you want to go for those ${n === 0 ? "day" : `${n} night${n === 1 ? "" : "s"}`}?`
            : "When are you thinking, and for how long?",
        options:
          n !== null
            ? ["Next month", "In 3 months", "This summer", "Not sure yet"]
            : ["This weekend", "A week next month", "2 weeks this summer", "Not sure yet"],
      });
    } else if (field === "length") {
      qs.push({
        field,
        question: "How long is the trip?",
        options: ["A weekend", "4 nights", "A week", "2 weeks"],
      });
    } else if (field === "travelers") {
      qs.push(
        u.kids || u.group === "family"
          ? {
              field,
              question: "How many of you, kids included?",
              options: ["3 people", "4 people", "5 people", "6 people"],
            }
          : u.group === "friends"
            ? {
                field,
                question: "How many in the group?",
                options: ["3 people", "4 people", "6 people", "8 people"],
              }
            : {
                field,
                question: "Who's going?",
                options: ["Just me", "2 of us", "Family of 4", "A group of 6"],
              },
      );
    }
  }
  if (
    u.travelersGuessed &&
    d.travelers &&
    !answered.has("travelers") &&
    !missing.includes("travelers")
  )
    qs.push({
      field: "travelers",
      question: `Is that ${d.travelers} of you in all?`,
      options: [
        `Yes, ${d.travelers} of us`,
        `${d.travelers + 1} people`,
        `${d.travelers + 2} people`,
      ],
    });
  if (!d.origin && !ctx.homeCity && d.tripType !== "staycation" && !answered.has("origin"))
    qs.push({ field: "origin", question: "Where are you leaving from?", options: [] });

  // Going deeper, once the basics are known (each asked once).
  const optional: LocalQuestion[] = [];
  if (!d.style && !answered.has("style"))
    optional.push({
      field: "style",
      question: "What kind of trip, money-wise?",
      options: ["Keep it cheap", "Comfortable", "Treat ourselves"],
    });
  if (!d.interests.length && !answered.has("interests"))
    optional.push({
      field: "interests",
      question: "What do you want to do there?",
      options: ["Great food", "Outdoors and hiking", "Museums and history", "Nightlife"],
    });
  if (d.tripType === "flight" && !d.stops && !answered.has("stops"))
    optional.push({
      field: "stops",
      question: "Nonstop only, or are stops OK?",
      options: ["Nonstop only", "One stop is fine", "Any, cheapest"],
    });
  if (d.tripType === "flight" && !d.cabin && !answered.has("cabin"))
    optional.push({
      field: "cabin",
      question: "Which cabin?",
      options: ["Economy", "Premium economy", "Business", "First class"],
    });
  if (!d.tripType && !answered.has("transport") && (d.destination || d.cities.length))
    optional.push({
      field: "transport",
      question: "How do you want to get there?",
      options: ["Drive", "Fly", "Train or bus"],
    });
  if (d.totalBudget === null && !u.statedBudget && !answered.has("budget"))
    optional.push({
      field: "budget",
      question: "Do you have a budget in mind?",
      options: ["Under $1,000", "About $2,500", "$5,000 or more", "Work it out for me"],
    });

  // On a flight, how they fly (stops, cabin) shapes the booking most, so it comes first.
  if (d.tripType === "flight") {
    const rank = (f: AskField) => (f === "stops" ? 0 : f === "cabin" ? 1 : 2);
    optional.sort((a, b) => rank(a.field) - rank(b.field));
  }
  const required = qs.slice(0, max);
  // While basics are missing, at most one extra; once ready, up to two to go deeper.
  const room = required.length ? Math.min(1, max - required.length) : 2;
  return { questions: [...required, ...optional.slice(0, room)], ideas };
}
