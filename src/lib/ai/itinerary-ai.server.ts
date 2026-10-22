import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export const aiItinerarySchema = z.object({
  days: z.array(
    z.object({
      day: z.number(),
      title: z.string(),
      items: z.array(
        z.object({
          time: z.enum(["Morning", "Lunch", "Afternoon", "Dinner", "Evening"]),
          kind: z.enum(["sight", "restaurant", "stop"]),
          name: z.string(),
          area: z.string(),
          note: z.string(),
          costPerPerson: z.number(),
        }),
      ),
    }),
  ),
  tips: z.array(z.string()),
});

export type AiItinerary = z.infer<typeof aiItinerarySchema>;

export interface AiItineraryRequest {
  destination: string;
  region: string;
  origin: string;
  tripType: string;
  style: string;
  days: number;
  startDate: string;
  travelers: number;
  interests: string[];
  activityBudgetPerPerson: number;
  foodBudgetPerPersonDay: number;
}

export type AiItineraryResult =
  | { ok: true; itinerary: AiItinerary }
  | { ok: false; status: number; error: string };

const INSTRUCTIONS = `You are Waypoint, a friendly travel planner focused on budget-friendly vacations, road trips and staycations, while still delighting luxury travelers.
Create a realistic day-by-day itinerary. Each day has 4-5 items: a Morning stop, Lunch, an Afternoon stop, Dinner, and optionally an Evening item.
Use "restaurant" for meals, "sight" for attractions, "stop" for drive breaks. Prefer well-known, real places when you are confident; otherwise describe a type of place (e.g. "Local farmers market").
costPerPerson is an estimated USD amount per person (0 for free). Keep sightseeing spend near the activity budget and meals near the food budget.
Only place weekday-specific events (markets, weekly shows) on a day whose weekday matches. Put after-dark activities in the Evening. Keep notes under 90 characters. Give 2-4 short money-saving or practical tips.`;

function describeError(err: unknown): { status: number; error: string } {
  const e = err as { statusCode?: number; status?: number; message?: string; cause?: unknown; responseBody?: string };
  const status = e?.statusCode ?? e?.status ?? (e?.cause as { statusCode?: number } | undefined)?.statusCode ?? 500;
  let safe = "";
  try {
    const body = e?.responseBody ? JSON.parse(e.responseBody) : null;
    safe = body?.message || body?.error?.message || "";
  } catch {
    /* not JSON */
  }
  if (status === 402) return { status, error: safe || "AI credits have run out. Add credits to keep generating itineraries." };
  if (status === 429) return { status, error: "The AI planner is busy right now. Please wait a moment and try again." };
  if (status === 403) return { status, error: safe || "AI planning isn't available for this workspace right now." };
  return { status, error: safe || "The AI planner couldn't create an itinerary. Your demo plan is still available." };
}

export async function generateAiItinerary(req: AiItineraryRequest): Promise<AiItineraryResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false, status: 401, error: "AI planning isn't configured yet." };

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const prompt = [
    `Destination: ${req.destination} (${req.region})`,
    `Starting from: ${req.origin || "not specified"}`,
    `Trip type: ${req.tripType}; travel style: ${req.style}`,
    `Length: ${req.days} day(s); travelers: ${req.travelers}`,
    `Calendar: ${Array.from({ length: req.days }, (_, i) => {
      const d = new Date(`${req.startDate}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return `Day ${i + 1} = ${d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}`;
    }).join("; ")}`,
    `Interests: ${req.interests.join(", ") || "a bit of everything"}`,
    `Sightseeing budget per person for the whole trip: $${Math.round(req.activityBudgetPerPerson)}`,
    `Food budget per person per day: $${Math.round(req.foodBudgetPerPersonDay)}`,
  ].join("\n");

  try {
    const result = streamText({
      model: provider.responses(MODEL),
      instructions: INSTRUCTIONS,
      messages: [{ role: "user", content: prompt }],
      output: Output.object({ schema: aiItinerarySchema }),
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const output = await result.output;
    if (!output || !Array.isArray(output.days) || output.days.length === 0) {
      return { ok: false, status: 502, error: "The AI planner returned an empty plan. Your demo plan is still available." };
    }
    return { ok: true, itinerary: output };
  } catch (err) {
    console.error("AI itinerary failed", err);
    return { ok: false, ...describeError(err) };
  }
}
