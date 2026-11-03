import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const draft = z
  .object({
    destination: z.string().max(120).nullable(),
    origin: z.string().max(120).nullable(),
    startDate: z.string().max(10).nullable(),
    endDate: z.string().max(10).nullable(),
    nights: z.number().int().min(0).max(30).nullable(),
    travelers: z.number().int().min(1).max(20).nullable(),
    tripType: z.enum(["road-trip", "flight", "cruise", "rail", "staycation"]).nullable(),
    transportMode: z.enum(["car", "rental-car", "flight", "train", "bus"]).nullable(),
    style: z.enum(["budget", "comfort", "luxury"]).nullable(),
    totalBudget: z.number().min(0).max(1_000_000).nullable(),
    interests: z
      .array(
        z.enum([
          "nature",
          "food",
          "history",
          "beaches",
          "arts",
          "adventure",
          "family",
          "nightlife",
          "shopping",
        ]),
      )
      .max(9),
    // Older saved conversations predate these two fields.
    covered: z
      .object({
        lodging: z.boolean(),
        meals: z.boolean(),
        activities: z.boolean(),
        localTransport: z.boolean(),
      })
      .default({ lodging: false, meals: false, activities: false, localTransport: false }),
    transferCost: z.number().min(0).max(5000).nullable().default(null),
    // Older saved conversations predate multi-city trips and cabins.
    cities: z
      .array(z.object({ name: z.string().max(120), nights: z.number().min(0).max(30) }))
      .max(8)
      .default([]),
    cabin: z.enum(["economy", "premium", "business", "first"]).nullable().default(null),
  })
  .nullable();

const inputSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(1200) }))
    .min(1)
    .max(16),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  homeCity: z.string().max(120),
  draft,
  country: z.string().max(2).default(""),
  currency: z.string().max(3).default("USD"),
  nearby: z.array(z.string().max(120)).max(16).default([]),
  /** Their nearest airport, from Waypoint's airport table */
  homeAirport: z.string().max(160).default(""),
});

/** Signed-in only: every turn spends AI credits, so it is never callable anonymously. */
export const tripChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { takeRate } = await import("./rate-limit.server");
    const limited = takeRate(context.userId, "aiChat");
    if (limited) return { ok: false as const, status: 429, error: limited };
    const [{ runTripChat }, { getRequest }] = await Promise.all([
      import("./ai/trip-chat.server"),
      import("@tanstack/react-start/server"),
    ]);
    return runTripChat(data, getRequest()?.signal);
  });
