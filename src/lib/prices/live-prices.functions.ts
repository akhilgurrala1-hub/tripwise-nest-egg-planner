import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const inputSchema = z
  .object({
    destination: z.string().trim().min(2).max(160),
    origin: z.string().trim().max(160),
    startDate: isoDate,
    endDate: isoDate,
    travelers: z.number().int().min(1).max(9),
    rooms: z.number().int().min(1).max(10),
    style: z.enum(["budget", "comfort", "luxury"]),
    includeFlights: z.boolean(),
    originAirport: z.string().regex(/^([A-Z]{3})?$/),
    destinationAirport: z.string().regex(/^([A-Z]{3})?$/),
  })
  .refine((d) => d.endDate > d.startDate, { message: "Check-out must be after check-in" });

/** Signed-in only: each call spends paid price searches, so it runs on an explicit button press. */
export const getLivePrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { fetchLivePrices } = await import("./live-prices.server");
    return fetchLivePrices(data);
  });
