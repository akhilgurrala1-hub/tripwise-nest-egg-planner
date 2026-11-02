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
  origin: z.string().trim().min(2).max(120),
  destination: z.string().trim().min(2).max(120),
  interests: z.array(z.enum(INTEREST_IDS)).max(9),
});

/** Signed-in only: real route + places along it (billable map-service calls). */
export const getRealStops = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { findRealStops } = await import("./google-stops.server");
    return findRealStops(data);
  });
