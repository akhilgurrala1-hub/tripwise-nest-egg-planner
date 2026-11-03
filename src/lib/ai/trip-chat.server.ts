import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";

import { modelFor, reasoningOptions } from "./models.server";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
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
}

export type TripChatResult =
  { ok: true; answer: TripChatAnswer } | { ok: false; status: number; error: string };

const INSTRUCTIONS = `You are Waypoint's trip assistant. Help the traveler shape one trip, then hand it to the planner.
You need: a destination, dates (a start date plus an end date or a number of nights), and how many people. Also useful: trip type (road-trip, flight = fly-away, cruise, rail = train & bus, staycation), travel style (budget = savvy, comfort, luxury), a total budget in USD, and interests.
Each turn:
- Return the full "trip" with everything known so far, carrying over earlier answers. Use null for anything not decided. Never invent a budget, dates or traveler count the traveler hasn't implied.
- If destination, dates and travelers are all known, set ready=true, give a one- or two-sentence summary in "reply", and ask nothing more (questions = []).
- Otherwise set ready=false and ask at most 3 short questions, most important first, each with 2–4 short tappable answer options (e.g. "Just me", "2 people", "Family of 4").
- If they don't know where to go, offer 3 "ideas": real places in "City, ST" form (or a departure port city for cruises) that fit their starting city, the season, their interests and trip type, each with a short "why" (under 12 words). Otherwise ideas = [].
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
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const context = [
    `Today: ${req.today} (${new Date(`${req.today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })})`,
    `Traveler's home city: ${req.homeCity || "unknown"}${req.country ? ` (country ${req.country})` : ""}`,
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

  try {
    const abortSignal = requestSignal(clientSignal);
    const result = streamText({
      ...(abortSignal ? { abortSignal } : {}),
      model: provider.responses(modelFor("chat")),
      instructions: `${INSTRUCTIONS}\n\n${context}`,
      messages: req.messages,
      output: Output.object({ schema: tripChatSchema }),
      providerOptions: reasoningOptions("chat"),
    });
    const answer = await result.output;
    if (!answer)
      return { ok: false, status: 502, error: "The assistant didn't answer. Try again." };
    return { ok: true, answer };
  } catch (err) {
    const e = err as { name?: string; statusCode?: number; status?: number };
    if (e?.name === "TimeoutError")
      return { ok: false, status: 504, error: "The assistant took too long. Try again." };
    const status = e?.statusCode ?? e?.status ?? 500;
    console.error("Trip chat failed", err);
    if (status === 402)
      return { ok: false, status, error: "AI credits have run out. Add credits to keep chatting." };
    if (status === 429)
      return {
        ok: false,
        status,
        error: "The assistant is busy right now. Try again in a moment.",
      };
    return { ok: false, status, error: "The assistant couldn't answer. Try again." };
  }
}
