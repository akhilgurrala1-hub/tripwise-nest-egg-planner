import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  destination: z.string().min(1).max(120),
  region: z.string().max(120),
  origin: z.string().max(120),
  tripType: z.string().max(40),
  style: z.string().max(40),
  days: z.number().int().min(1).max(14),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  travelers: z.number().int().min(1).max(20),
  interests: z.array(z.string().max(40)).max(12),
  activityBudgetPerPerson: z.number().min(0).max(100000),
  foodBudgetPerPersonDay: z.number().min(0).max(10000),
  /** Real weather per trip day, e.g. "Day 2: Rain, high 58°F, 80% chance of rain (forecast)" */
  weather: z.array(z.string().max(120)).max(14).default([]),
  /** Real nearby places ("Name — what it is") so the plan uses places that exist */
  places: z.array(z.string().max(140)).max(40).default([]),
  /** Public holidays and other dates to know */
  notes: z.array(z.string().max(160)).max(10).default([]),
  /** When refining: what the traveler wants changed, and the current plan */
  instructions: z.string().max(300).default(""),
  current: z.array(z.string().max(160)).max(80).default([]),
});

/** Signed-in only: each call spends AI credits, so it must never be callable anonymously. */
export const createAiItinerary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const [{ generateAiItinerary }, { getRequest }] = await Promise.all([
      import("./ai/itinerary-ai.server"),
      import("@tanstack/react-start/server"),
    ]);
    // Stop generating (and spending credits) when the traveler cancels or closes the page.
    return generateAiItinerary(data, getRequest()?.signal);
  });
