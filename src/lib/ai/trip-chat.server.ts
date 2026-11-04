import { generateText, Output } from "ai";
import { z } from "zod";

import { aiAttempts, aiErrorInfo, withFallbacks } from "./gateway.server";

const SERVER_TIMEOUT_MS = 50_000;

export const TRIP_TYPE_IDS = ["road-trip", "flight", "cruise", "rail", "staycation"] as const;
export const MODE_IDS = ["car", "rental-car", "flight", "train", "bus"] as const;
export const STYLE_IDS = ["budget", "comfort", "luxury"] as const;
export const INTEREST_IDS = [
  "nature",
  "food",
  "history",
  "beaches",
  "arts",
  "adventure",
  "family",
  "nightlife",
  "shopping",
] as const;

/** Everything known about the trip so far; null = not decided yet. */
export const tripDraftSchema = z.object({
  destination: z.string().nullable(),
  origin: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  nights: z.number().nullable(),
  travelers: z.number().nullable(),
  tripType: z.enum(TRIP_TYPE_IDS).nullable(),
  transportMode: z.enum(MODE_IDS).nullable(),
  style: z.enum(STYLE_IDS).nullable(),
  totalBudget: z.number().nullable(),
  interests: z.array(z.enum(INTEREST_IDS)),
  /** What they won't pay for on this trip (staying at home, eating with family...) */
  covered: z.object({
    lodging: z.boolean(),
    meals: z.boolean(),
    activities: z.boolean(),
    localTransport: z.boolean(),
  }),
  /** Round trip from where they start (dorm, home) to the airport or station, whole group, USD */
  transferCost: z.number().nullable(),
  /** Multi-city: every city in the order visited with its nights; empty for a one-place trip */
  cities: z.array(z.object({ name: z.string(), nights: z.number() })),
  /** Flight cabin; null when not flying */
  cabin: z.enum(["economy", "premium", "business", "first"]).nullable(),
});

export const tripChatSchema = z.object({
  reply: z.string(),
  ready: z.boolean(),
  questions: z.array(z.object({ question: z.string(), options: z.array(z.string()) })),
  ideas: z.array(z.object({ name: z.string(), why: z.string() })),
  trip: tripDraftSchema,
});

export type TripDraft = z.infer<typeof tripDraftSchema>;
export type TripChatAnswer = z.infer<typeof tripChatSchema>;

export interface TripChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  today: string;
  homeCity: string;
  draft: TripDraft | null;
  /** The traveler's country (ISO code) and the currency they think in */
  country: string;
  currency: string;
  /** Real places Waypoint suggests from their home, "Name (Region): trip type, distance" */
  nearby: string[];
  /** Their nearest airport ("CLT (Charlotte Douglas International Airport), 8 miles away") */
  homeAirport?: string;
}

export type TripChatResult =
  | { ok: true; answer: TripChatAnswer }
  /** `detail` is the AI service's own reason, shown small so problems can be reported */
  | { ok: false; status: number; error: string; detail?: string };

const INSTRUCTIONS = `You are Waypoint's trip assistant. Help the traveler shape one trip, then hand it to the planner.
You need: a destination, dates (a start date plus an end date or a number of nights), and how many people. Also useful: trip type (road-trip, flight = fly-away, cruise, rail = train & bus, staycation), travel style (budget = savvy, comfort, luxury), a total budget in USD, and interests.
Several cities (multi-city trips): when the traveler visits more than one place, list EVERY city in "cities" in the order they visit, each with whole nights (at least 1) that add up to the trip's nights, and put the first city in "destination". Never drop, merge or reorder a city they named. If they didn't say how long in each, split the nights sensibly and say so. Without an end date, nights = the sum of the cities' nights. For a one-place trip, cities = []. Trips can be any length up to a year, and any time ahead: plan the whole thing, never only part of it. When ready, the reply names every city with its nights (e.g. "Rome 3 nights, Florence 2, Venice 2").
Flights: cabin = "economy" unless they ask for premium economy ("premium"), business or first; null when not flying.
Budget: totalBudget only when the traveler gives a number (never lower than what they said); otherwise null, and Waypoint works it out from the trip's real costs. Never invent one.
Each turn:
- Return the full "trip" with everything known so far, carrying over earlier answers. Use null for anything not decided. Never invent a budget, dates or traveler count the traveler hasn't implied.
- If destination, dates and travelers are all known, set ready=true, give a one- or two-sentence summary in "reply", and ask nothing more (questions = []).
- Otherwise set ready=false and ask at most 3 short questions, most important first, each with 2–4 short tappable answer options (e.g. "Just me", "2 people", "Family of 4").
- If they don't know where to go, offer 3 "ideas": real places in "City, ST" form (or a departure port city for cruises) that fit their starting city, the season, their interests and trip type, each with a short "why" (under 12 words). Otherwise ideas = [].
Work out what the traveler actually pays for, and leave out what they don't:
- covered.lodging = true when they stay somewhere free: their own home, family, friends, a dorm ("I live there", "staying with my parents", "going home").
- covered.meals = true when they'll eat at home or with family (usually true when going home or staying with family); otherwise false.
- covered.activities = true when they only care about getting there ("just the flight", "only the ticket") or are going home; false when they want to do things.
- covered.localTransport = true when they'll have a car or rides at the destination (family picking them up, their own car).
- transferCost: when they fly or take a train or bus, the round trip for the whole group from where they're leaving (dorm, campus, home) to the airport or station and back, in USD. Estimate it from the distance: rideshare is about $1.50 to $2.50 per mile plus $5 per ride; transit is a few dollars. Use null when there's no such leg.
- origin is where they're leaving from (e.g. the college town with their dorm), even when they "live" at the destination. If that isn't clear, ask where they're starting from.
- When something is covered, say what you left out in "reply", e.g. "Since you're staying at home, I only counted the flight and rides to the airport."
Rules: today's date is given; resolve "next weekend", "in March" etc. to real dates that are not in the past (a month without days = a 4-day trip starting the first Friday). Weekend = Friday to Sunday. A road trip or staycation starts from their home city when they don't say otherwise. Destination is "City, ST" for US places, "City, Country" elsewhere. Dates are YYYY-MM-DD. Keep "reply" under 50 words, warm and plain. No emoji, no markdown, no em dashes.`;

function requestSignal(clientSignal?: AbortSignal): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function")
    return clientSignal;
  const timeout = AbortSignal.timeout(SERVER_TIMEOUT_MS);
  if (!clientSignal || typeof AbortSignal.any !== "function") return timeout;
  return AbortSignal.any([timeout, clientSignal]);
}

export async function runTripChat(
  req: TripChatRequest,
  clientSignal?: AbortSignal,
): Promise<TripChatResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false, status: 401, error: "The AI assistant isn't configured yet." };
  const context = [
    `Today: ${req.today} (${new Date(`${req.today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })})`,
    `Traveler's home city: ${req.homeCity || "unknown"}${req.country ? ` (country ${req.country})` : ""}`,
    ...(req.homeAirport ? [`Their nearest airport: ${req.homeAirport}`] : []),
    ...(req.currency && req.currency !== "USD"
      ? [
          `They think in ${req.currency}. Budgets in "trip" are always US dollars: convert any amount they give in ${req.currency} to USD.`,
        ]
      : []),
    ...(req.nearby.length
      ? [
          `Places Waypoint can plan in detail from their home (prefer these for ideas when they fit):\n${req.nearby.map((n) => `- ${n}`).join("\n")}`,
        ]
      : []),
    `Trip so far: ${req.draft ? JSON.stringify(req.draft) : "nothing yet"}`,
  ].join("\n");

  const abortSignal = requestSignal(clientSignal);
  try {
    const answer = await withFallbacks(
      aiAttempts(apiKey, "chat"),
      async ({ model, providerOptions }) => {
        // generateText (not streaming) so gateway errors keep their status and message.
        const result = await generateText({
          ...(abortSignal ? { abortSignal } : {}),
          model,
          instructions: `${INSTRUCTIONS}\n\n${context}`,
          messages: req.messages,
          output: Output.object({ schema: tripChatSchema }),
          ...(providerOptions ? { providerOptions } : {}),
        });
        if (!result.output) throw new Error("The model returned no answer.");
        return result.output;
      },
      abortSignal,
    );
    return { ok: true, answer };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "TimeoutError" || (abortSignal?.aborted && !clientSignal?.aborted))
      return { ok: false, status: 504, error: "The assistant took too long. Try again." };
    const { status, detail } = aiErrorInfo(err);
    console.error("Trip chat failed", status, detail);
    if (status === 402)
      return {
        ok: false,
        status,
        error: "The workspace is out of AI credits. Add credits in Lovable to keep chatting.",
        detail,
      };
    if (status === 429)
      return {
        ok: false,
        status,
        error: "The assistant is busy right now. Try again in a moment.",
        detail,
      };
    if (status === 401 || status === 403)
      return {
        ok: false,
        status,
        error: "AI isn't enabled for this workspace. Turn on Lovable AI in the project settings.",
        detail,
      };
    return { ok: false, status, error: "The assistant couldn't answer. Try again.", detail };
  }
}
