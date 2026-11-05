/**
 * What the assistant says: Waypoint's own answer (used for everyone signed out,
 * and whenever the AI can't answer), and the check every AI answer goes through
 * so it never drops a city, invents a budget, ignores a date or asks again about
 * something the traveler already said.
 */
import type { ChatAnswer } from "../ai-quality";
import { formatMoney } from "../budget";
import { formatCalendarDate, isIsoDate } from "../dates";
import { cabinInfo, tripTypeInfo } from "../demo-data";
import { plainName } from "./text";
import {
  missingRequired,
  planQuestions,
  type AskField,
  type LocalQuestion,
  type UnderstandContext,
  type Understanding,
} from "./conversation";

export interface AssistantAnswer extends ChatAnswer {
  /** What each question asks about, in order (so the next reply reads the answer right) */
  fields: AskField[];
  /** Who wrote it: Waypoint's own reading, or the AI checked by it */
  source: "waypoint" | "ai";
}

const day = (iso: string) => formatCalendarDate(iso, { month: "short", day: "numeric" });

/** "Rome 3 nights, Florence 2 · May 7 to 14 · 2 travelers" */
export function tripSummary(u: Understanding): string {
  const d = u.draft;
  const parts: string[] = [];
  if (d.tripType === "staycation") parts.push("a staycation at home");
  else if (d.cities.length >= 2)
    parts.push(
      d.cities
        .map(
          (c, i) =>
            `${c.name.split(",")[0]} ${c.nights}${i === 0 ? ` night${c.nights === 1 ? "" : "s"}` : ""}`,
        )
        .join(", "),
    );
  else if (d.destination) parts.push(d.destination);
  if (d.startDate && d.endDate)
    parts.push(
      d.startDate === d.endDate ? day(d.startDate) : `${day(d.startDate)} to ${day(d.endDate)}`,
    );
  else if (d.startDate) parts.push(`from ${day(d.startDate)}`);
  else if (d.nights !== null)
    parts.push(d.nights === 0 ? "a day trip" : `${d.nights} night${d.nights === 1 ? "" : "s"}`);
  if (d.travelers) parts.push(d.travelers === 1 ? "just you" : `${d.travelers} travelers`);
  if (d.tripType && d.tripType !== "staycation")
    parts.push(tripTypeInfo(d.tripType).label.toLowerCase());
  if (d.cabin && d.cabin !== "economy") parts.push(cabinInfo(d.cabin).label.toLowerCase());
  if (d.totalBudget) parts.push(`${formatMoney(d.totalBudget)} budget`);
  return parts.join(", ");
}

function coverNote(u: Understanding): string {
  const c = u.draft.covered;
  const left = [
    c.lodging && "a place to stay",
    c.meals && "meals",
    c.activities && "activities",
    c.localTransport && "getting around",
  ].filter(Boolean) as string[];
  if (!left.length) return "";
  return ` I left out ${left.length > 1 ? `${left.slice(0, -1).join(", ")} and ${left.at(-1)}` : left[0]}, since that's taken care of.`;
}

/** Waypoint's own answer to the conversation so far. */
export function localAnswer(u: Understanding, ctx: UnderstandContext): AssistantAnswer {
  const missing = missingRequired(u);
  const { questions, ideas } = planQuestions(u, ctx);
  const summary = tripSummary(u);
  const ready = missing.length === 0;
  let reply: string;
  if (ready) {
    const split =
      u.draft.cities.length >= 2 && u.last?.where.cities.some((c) => !c.nights)
        ? " I split the nights between the cities; change them if you like."
        : "";
    const approx = u.datesApprox ? " The dates are a starting point you can move." : "";
    reply = `Here's your trip: ${summary}.${coverNote(u)}${split}${approx} Build it, or tell me anything to change.`;
  } else if (u.statedBudget) {
    reply = `Got it${summary ? `: ${summary}` : ""}. I'll treat ${u.statedBudget.amount} ${u.statedBudget.currency} as your budget once I know the exchange rate.`;
  } else if (summary) {
    reply = `Got it: ${summary}.${coverNote(u)}`;
  } else if (u.unsure || u.vibes.length) {
    reply = ideas.length
      ? "Here are a few places that fit. Pick one, or tell me more about what you like."
      : "Happy to find somewhere. Tell me a little about what you like.";
  } else {
    reply = "Happy to help you plan. A few quick questions to start.";
  }
  if (!ready && ideas.length && summary) reply += " Here are a few places that fit.";
  return {
    reply,
    ready,
    questions: questions.map(({ question, options }) => ({ question, options })),
    fields: questions.map((q) => q.field),
    ideas: ideas.slice(0, 3),
    trip: u.draft,
    source: "waypoint",
  };
}

/** Which field a question (from the AI) asks about, by its words. */
export function questionField(q: string): AskField | null {
  const t = q.toLowerCase();
  if (
    /\bwhere\b.*\b(from|leaving|start|depart|based|live)\b|\bleaving from\b|\bhome (city|airport)\b/.test(
      t,
    )
  )
    return "origin";
  if (/\bhow long\b|\bhow many (nights|days)\b|\blength\b/.test(t)) return "length";
  if (/\bwhen\b|\bdates?\b|\btime of year\b|\bmonth\b|\bseason\b/.test(t)) return "dates";
  if (
    /\bhow many\b.*\b(people|travel|going|guests|adults|of you|in your group)\b|\bwho('s| is)? (going|coming|traveling)\b|\btravel(l)?ing with\b|\bgroup size\b|\bhow many of you\b/.test(
      t,
    )
  )
    return "travelers";
  if (/\bbudget\b|\bspend\b|\bprice range\b|\bhow much\b/.test(t)) return "budget";
  if (/\bnon ?stop\b|\bdirect\b|\bstops?\b|\blayovers?\b|\bconnections?\b|\bstopovers?\b/.test(t))
    return "stops";
  if (/\bcabin\b|\bclass\b|\beconomy\b|\bbusiness\b/.test(t)) return "cabin";
  if (/\b(drive|fly|flying|driving|train|bus|get there|getting there|transport)\b/.test(t))
    return "transport";
  if (
    /\binterest|\benjoy\b|\blike to do\b|\bactivities\b|\binto\b|\bvibe\b|\bwhat (do|would) you (want|like)\b/.test(
      t,
    )
  )
    return "interests";
  if (/\bstyle\b|\bluxury\b|\bcomfort\b|\bfancy\b|\bsplurge\b/.test(t)) return "style";
  if (/\bwhich (city|cities|part|area|island|region)\b|\bwhere in\b/.test(t)) return "narrow";
  if (/\bwhere\b|\bdestination\b|\bwhich place\b|\bgo\b/.test(t)) return "destination";
  return null;
}

const sameCity = (a: string, b: string) =>
  plainName(a.split(",")[0] ?? a) === plainName(b.split(",")[0] ?? b);

/** Every number the traveler typed, so a budget the AI reports can be checked against their words. */
function numbersTyped(texts: readonly string[]): number[] {
  return texts.flatMap((t) =>
    [...t.replace(/,(\d{3})/g, "$1").matchAll(/(\d+(?:\.\d+)?)\s*(k|thousand|grand)?/gi)].map((m) =>
      Math.round(Number(m[1]) * (m[2] ? 1000 : 1)),
    ),
  );
}

/**
 * The AI's answer, checked against what Waypoint read from the traveler's own words.
 * Their words win: named cities stay in order, exact dates and group sizes they gave
 * are kept, a budget they never gave is dropped, and questions about things they
 * already said are replaced with ones that matter.
 */
export function reconcile(
  ai: ChatAnswer,
  u: Understanding,
  ctx: UnderstandContext,
  userTexts: readonly string[],
): AssistantAnswer {
  const t = {
    ...ai.trip,
    covered: { ...ai.trip.covered },
    cities: ai.trip.cities.map((c) => ({ ...c })),
    interests: [...ai.trip.interests],
  };
  const d = u.draft;
  const fixes: string[] = [];

  // Places: never fewer cities than they named, never a different first city.
  if (d.cities.length >= 2 && t.cities.length < d.cities.length) {
    t.cities = d.cities.map((c) => ({
      name: c.name,
      nights: ai.trip.cities.find((x) => sameCity(x.name, c.name))?.nights ?? c.nights,
    }));
    t.destination = d.cities[0]!.name;
    fixes.push(
      `I kept every city you named: ${d.cities.map((c) => c.name.split(",")[0]).join(", ")}.`,
    );
  } else if (d.cities.length >= 2) {
    const aiNames = new Set(t.cities.map((c) => plainName(c.name.split(",")[0]!)));
    const missingCity = d.cities.find((c) => !aiNames.has(plainName(c.name.split(",")[0]!)));
    if (missingCity) {
      t.cities = d.cities.map((c) => ({
        name: c.name,
        nights: ai.trip.cities.find((x) => sameCity(x.name, c.name))?.nights ?? c.nights,
      }));
      t.destination = d.cities[0]!.name;
    }
  }
  if (!t.destination?.trim() && d.destination) t.destination = d.destination;
  if (
    d.destination &&
    t.destination &&
    !u.broad &&
    d.cities.length < 2 &&
    t.cities.length < 2 &&
    !sameCity(t.destination, d.destination)
  ) {
    // The AI moved them somewhere else: keep where they asked to go.
    const lastNamed = u.last?.where.cities.length ? u.last.where.cities[0]!.name : null;
    if (lastNamed && sameCity(lastNamed, d.destination)) t.destination = d.destination;
  }
  if (!t.origin && d.origin) t.origin = d.origin;

  // When: the traveler's exact dates win; a past or broken date is replaced.
  const validStart = t.startDate && isIsoDate(t.startDate) && t.startDate >= ctx.today;
  if (d.startDate && (!validStart || (!u.datesApprox && t.startDate !== d.startDate))) {
    t.startDate = d.startDate;
    t.endDate = d.endDate;
  } else if (!validStart) {
    t.startDate = null;
    t.endDate = null;
  }
  if (t.endDate && (!isIsoDate(t.endDate) || (t.startDate && t.endDate < t.startDate)))
    t.endDate = null;
  if (
    d.nights !== null &&
    (t.nights === null ||
      (u.last?.when.nights !== undefined && t.nights !== d.nights && !t.endDate))
  )
    t.nights = d.nights;

  // Who: a number they said wins over the AI's guess.
  if (d.travelers && (!t.travelers || (!u.travelersGuessed && t.travelers !== d.travelers)))
    t.travelers = d.travelers;

  // Budget: theirs, never invented, never lower than what they said.
  const typed = numbersTyped(userTexts);
  if (d.totalBudget) t.totalBudget = d.totalBudget;
  else if (
    t.totalBudget &&
    !u.statedBudget &&
    !typed.some((n) => Math.abs(n - t.totalBudget!) <= Math.max(1, t.totalBudget! * 0.02))
  )
    t.totalBudget = null;

  // How: what they said in so many words.
  if (d.tripType && t.tripType !== d.tripType) t.tripType = d.tripType;
  if (d.transportMode && !t.transportMode) t.transportMode = d.transportMode;
  if (d.cabin && t.cabin !== d.cabin) t.cabin = d.cabin;
  if (d.stops && t.stops !== d.stops) t.stops = d.stops;
  if (d.style && !t.style) t.style = d.style;
  for (const i of d.interests) if (!t.interests.includes(i)) t.interests.push(i);
  for (const k of ["lodging", "meals", "activities", "localTransport"] as const)
    if (d.covered[k]) t.covered[k] = true;
  if (t.tripType === "staycation") t.cities = [];

  const checked: Understanding = { ...u, draft: t };
  const missing = missingRequired(checked);
  const ready = missing.length === 0;
  const local = planQuestions(checked, ctx);
  // Keep the AI's questions only when they ask about something still open.
  const known = new Set<AskField>(u.answered);
  if (t.destination && !u.broad) known.add("destination");
  if (t.startDate) known.add("dates");
  if (t.nights !== null || t.endDate) known.add("length");
  if (t.travelers && !u.travelersGuessed) known.add("travelers");
  if (t.origin) known.add("origin");
  if (t.totalBudget) known.add("budget");
  if (t.cabin) known.add("cabin");
  if (t.stops) known.add("stops");
  if (t.style) known.add("style");
  if (t.interests.length) known.add("interests");
  if (t.tripType) known.add("transport");
  const aiQs = ai.questions
    .map((q) => ({ q, field: questionField(q.question) }))
    .filter(({ field }) => !field || !known.has(field) || (!ready && missing.includes(field)));
  let questions: LocalQuestion[] = aiQs.map(({ q, field }) => ({
    field: field ?? "interests",
    question: q.question,
    options: q.options,
  }));
  // Required questions the AI didn't ask come first.
  for (const lq of local.questions)
    if (missing.includes(lq.field) && !questions.some((q) => q.field === lq.field))
      questions.unshift(lq);
  if (ready && !questions.length) questions = local.questions;
  questions = questions.slice(0, 3);

  let reply = ai.reply;
  if (ai.ready && !ready) reply = localAnswer(checked, ctx).reply;
  else if (!ai.ready && ready)
    reply = `Here's your trip: ${tripSummary(checked)}. Build it, or tell me anything to change.`;
  if (fixes.length) reply = `${reply} ${fixes.join(" ")}`.trim();
  const ideas = ai.ideas.length ? ai.ideas : !t.destination ? local.ideas : [];
  return {
    reply: reply.slice(0, 400),
    ready,
    questions: questions.map(({ question, options }) => ({ question, options })),
    fields: questions.map((q) => q.field),
    ideas: ideas.slice(0, 3),
    trip: t,
    source: "ai",
  };
}

/** The lines the AI is sent about what Waypoint already read, so it starts from facts. */
export function factLines(u: Understanding): string[] {
  const d = u.draft;
  const out: string[] = [];
  if (d.cities.length >= 2)
    out.push(
      `Cities named, in order: ${d.cities.map((c) => `${c.name} (${c.nights} nights)`).join(", ")}`,
    );
  else if (d.destination)
    out.push(
      `Destination named: ${d.destination}${u.broad ? " (a whole country or region: ask which city)" : ""}`,
    );
  if (d.origin) out.push(`Leaving from: ${d.origin}`);
  if (d.startDate)
    out.push(
      `Start: ${d.startDate}${u.datesApprox ? " (approximate, from a month or season)" : ""}`,
    );
  if (d.nights !== null) out.push(`Length: ${d.nights} nights`);
  if (d.travelers)
    out.push(
      `Travelers: ${d.travelers}${u.travelersGuessed ? " (a guess from their words, confirm it)" : ""}`,
    );
  if (d.totalBudget) out.push(`Budget they gave: $${d.totalBudget} total`);
  else if (u.statedBudget)
    out.push(
      `Budget they gave: ${u.statedBudget.amount} ${u.statedBudget.currency} (convert to USD)`,
    );
  if (d.tripType) out.push(`Trip type: ${d.tripType}`);
  if (d.cabin) out.push(`Cabin: ${d.cabin}`);
  if (d.stops)
    out.push(
      `Flight stops: ${d.stops === "nonstop" ? "nonstop only" : d.stops === "one" ? "one stop at most" : "any"}`,
    );
  if (d.style) out.push(`Style: ${d.style}`);
  if (d.interests.length) out.push(`Interests: ${d.interests.join(", ")}`);
  const cov = Object.entries(d.covered)
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (cov.length) out.push(`Already covered: ${cov.join(", ")}`);
  if (u.unsure)
    out.push(
      `They don't know where yet${u.vibes.length ? ` and want: ${u.vibes.join(", ")}` : ""}: offer ideas`,
    );
  if (u.answered.length) out.push(`Already asked (don't ask again): ${u.answered.join(", ")}`);
  return out.map((l) => l.slice(0, 200)).slice(0, 14);
}
