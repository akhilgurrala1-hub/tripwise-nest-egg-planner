import { generateText, Output, type ModelMessage } from "ai";
import { z } from "zod";

import { planProblems } from "../ai-quality";
import { aiAttempts, aiErrorInfo, withFallbacks } from "./gateway.server";

/** A review pass only starts if the first answer came back within this, so both fit in the timeout. */
const REPAIR_DEADLINE_MS = 40_000;

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
  weather: string[];
  /** Real places near the destination ("Name (what it is)"), to ground the plan */
  places: string[];
  /** Practical advice from the travel guide */
  guide: string[];
  /** Costs the traveler doesn't have, e.g. "a place to stay", "meals" */
  covered: string[];
  /** Dates to know about, e.g. public holidays */
  notes: string[];
  /** The traveler's requested changes, when refining a plan */
  instructions: string;
  /** The current plan, one line per item, when refining */
  current: string[];
}

export type AiItineraryResult =
  | { ok: true; itinerary: AiItinerary }
  /** `detail` is the AI service's own reason, shown small so problems can be reported */
  | { ok: false; status: number; error: string; detail?: string };

const INSTRUCTIONS = `You are Waypoint, a friendly travel planner focused on budget-friendly vacations, road trips and staycations, while still delighting luxury travelers.
Create a realistic day-by-day itinerary. Each day has 4-5 items: a Morning stop, Lunch, an Afternoon stop, Dinner, and optionally an Evening item.
Use "restaurant" for meals, "sight" for attractions, "stop" for drive breaks. Prefer well-known, real places when you are confident; otherwise describe a type of place (e.g. "Local farmers market").
costPerPerson is an estimated USD amount per person (0 for free). Keep sightseeing spend near the activity budget and meals near the food budget.
Only place weekday-specific events (markets, weekly shows) on a day whose weekday matches. Put after-dark activities in the Evening. Keep notes under 90 characters. Give 2-4 short money-saving or practical tips.
For a cruise: Day 1 is boarding at the departure port and the last day is disembarking; meals in the main dining room and buffet are included (costPerPerson 0); fill port days with shore excursions and sea days with onboard activities.
For a fly-away trip, Day 1 starts with the flight in; for a train or bus trip, with the ride in. Only road trips get "stop" items for drive breaks.
When weather is given, plan around it: put indoor sights on days with rain, snow or storms, save outdoor highlights for dry days, and mention the weather in a tip when it matters.
When a list of real nearby places is given, build the plan from those exact names wherever they fit the traveler's interests, and don't make up specific venue names; if you need something the list doesn't have, describe the kind of place instead (e.g. "Neighborhood bakery").
When public holidays are given, expect closures and crowds on those days: favor outdoor sights and markets that stay open, and say so in a tip.
Return exactly the number of days asked for, in order.
When the traveler asks for changes to their current plan, make those changes and keep everything they didn't ask to change.
Write plainly, like a friend who knows the place. Never use em dashes.`;

function describeError(err: unknown): { status: number; error: string; detail: string } {
  const { status, detail } = aiErrorInfo(err);
  if (status === 402)
    return {
      status,
      detail,
      error: "The workspace is out of AI credits. Add credits in Lovable to keep planning with AI.",
    };
  if (status === 429)
    return {
      status,
      detail,
      error: "The AI planner is busy right now. Please wait a moment and try again.",
    };
  if (status === 401 || status === 403)
    return {
      status,
      detail,
      error: "AI isn't enabled for this workspace. Turn on Lovable AI in the project settings.",
    };
  return {
    status,
    detail,
    error: "The AI planner couldn't create an itinerary. Your current plan is unchanged.",
  };
}

/** Longest a single generation may run on the server, so a stuck request can't hold credits or a worker. */
const SERVER_TIMEOUT_MS = 85_000;

function requestSignal(clientSignal?: AbortSignal): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function")
    return clientSignal;
  const timeout = AbortSignal.timeout(SERVER_TIMEOUT_MS);
  if (!clientSignal || typeof AbortSignal.any !== "function") return timeout;
  return AbortSignal.any([timeout, clientSignal]);
}

export async function generateAiItinerary(
  req: AiItineraryRequest,
  clientSignal?: AbortSignal,
): Promise<AiItineraryResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false, status: 401, error: "AI planning isn't configured yet." };

  const prompt = [
    `Destination: ${req.destination}${req.region ? ` (${req.region})` : ""}`,
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
    ...(req.weather.length ? [`Weather (real data):\n${req.weather.join("\n")}`] : []),
    ...(req.covered.length
      ? [
          `Already taken care of, so don't plan or price it: ${req.covered.join(", ")}.${req.covered.includes("meals") ? " Meals are at home (costPerPerson 0); suggest at most one optional meal out." : ""}${req.covered.includes("activities") ? " Keep sights free (costPerPerson 0)." : ""}`,
        ]
      : []),
    ...(req.notes.length ? [`Dates to know:\n${req.notes.join("\n")}`] : []),
    ...(req.guide.length ? [`Advice from travelers (Wikivoyage):\n${req.guide.join("\n")}`] : []),
    ...(req.places.length
      ? [
          `Real places at the destination (from the Wikivoyage travel guide, Wikipedia and OpenStreetMap):\n${req.places.map((p) => `- ${p}`).join("\n")}`,
        ]
      : []),
    ...(req.instructions
      ? [
          `Current plan:\n${req.current.join("\n")}`,
          `The traveler asks for these changes: "${req.instructions}"`,
        ]
      : []),
  ].join("\n");

  const started = Date.now();
  const abortSignal = requestSignal(clientSignal);
  // Whichever attempt answers first is used again for the review pass.
  let attempts = aiAttempts(apiKey, "planner");
  const ask = (messages: ModelMessage[]) =>
    withFallbacks(
      attempts,
      async (attempt) => {
        // generateText (not streaming) so gateway errors keep their status and message.
        const result = await generateText({
          ...(abortSignal ? { abortSignal } : {}),
          model: attempt.model,
          instructions: INSTRUCTIONS,
          messages,
          output: Output.object({ schema: aiItinerarySchema }),
          ...(attempt.providerOptions ? { providerOptions: attempt.providerOptions } : {}),
        });
        attempts = attempts.slice(attempts.indexOf(attempt));
        return result.output;
      },
      abortSignal,
    );
  const want = {
    days: req.days,
    activityBudgetPerPerson: req.activityBudgetPerPerson,
    foodBudgetPerPersonDay: req.foodBudgetPerPersonDay,
  };

  try {
    const first: ModelMessage[] = [{ role: "user", content: prompt }];
    let output = await ask(first);
    if (!output || !Array.isArray(output.days) || output.days.length === 0) {
      return {
        ok: false,
        status: 502,
        error: "The AI planner returned an empty plan. Your current plan is unchanged.",
      };
    }
    // One review pass, only when the plan has a clear problem and there's time left.
    // It costs a second call, so ordinary good plans never pay for it.
    const problems = planProblems(output, want);
    if (problems.length > 0 && Date.now() - started < REPAIR_DEADLINE_MS) {
      try {
        const fixed = await ask([
          ...first,
          { role: "assistant", content: JSON.stringify(output) },
          {
            role: "user",
            content: `Fix these problems and return the whole corrected plan, keeping everything else:\n${problems.map((p) => `- ${p}`).join("\n")}`,
          },
        ]);
        if (
          fixed &&
          Array.isArray(fixed.days) &&
          fixed.days.length > 0 &&
          planProblems(fixed, want).length < problems.length
        )
          output = fixed;
      } catch (err) {
        // A failed review keeps the first plan; only a cancel or timeout ends the request.
        if (abortSignal?.aborted) throw err;
      }
    }
    return { ok: true, itinerary: output };
  } catch (err) {
    if (
      (err as { name?: string })?.name === "TimeoutError" ||
      (abortSignal?.aborted && !clientSignal?.aborted)
    )
      return {
        ok: false,
        status: 504,
        error: "The AI planner took too long. Your current plan is unchanged. Try again.",
      };
    console.error("AI itinerary failed", err);
    return { ok: false, ...describeError(err) };
  }
}
