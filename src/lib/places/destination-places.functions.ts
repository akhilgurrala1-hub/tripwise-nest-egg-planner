import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INTEREST_IDS = [
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

const inputSchema = z.object({
  destination: z.string().trim().min(2).max(160),
  interests: z.array(z.enum(INTEREST_IDS)).max(9),
  style: z.enum(["budget", "comfort", "luxury"]),
});

/** Signed-in only: real sights and restaurants in the destination (billable map-service calls). */
export const getDestinationPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { takeRate } = await import("../rate-limit.server");
    const limited = takeRate(context.userId, "places");
    if (limited) return { ok: false as const, error: limited };
    const { findDestinationPlaces } = await import("./destination-places.server");
    return findDestinationPlaces(data);
  });
