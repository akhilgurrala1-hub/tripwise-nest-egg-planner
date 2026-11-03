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
    includeHotels: z.boolean().default(true),
    originAirport: z.string().regex(/^([A-Z]{3})?$/),
    destinationAirport: z.string().regex(/^([A-Z]{3})?$/),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "The trip must end on or after its start date",
  });

/** Signed-in only: each call spends paid price searches, so it runs on an explicit button press. */
export const getLivePrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { takeRate } = await import("../rate-limit.server");
    const limited = takeRate(context.userId, "prices");
    if (limited) return { ok: false as const, error: limited };
    const { fetchLivePrices } = await import("./live-prices.server");
    return fetchLivePrices(data);
  });

/** Which live price sources have keys configured, so the UI never offers a search that can't run. */
// Public on purpose: it only says which price sources are configured (no lookups, no cost),
// so signed-out travelers aren't asked to sign in for prices that can't be fetched yet.
export const getLivePriceStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { priceKey } = await import("./keys.server");
  const serp = !!priceKey("serpapi");
  return { gas: !!priceKey("eia"), hotels: serp, flights: serp };
});

/**
 * Signed-in only: asks each price service whether its key works, and which secret
 * name it was found under (names only, never the keys). Uses no searches.
 */
export const testPriceKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { takeRate } = await import("../rate-limit.server");
    const limited = takeRate(context.userId, "keyTest");
    if (limited) throw new Error(limited);
    const { checkPriceKeys } = await import("./keys.server");
    return checkPriceKeys();
  });
