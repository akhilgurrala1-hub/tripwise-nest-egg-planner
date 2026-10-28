import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isIsoDate } from "./dates";

const inputSchema = z.object({
  destination: z.string().min(1).max(120),
  region: z.string().max(120),
  origin: z.string().max(120),
  tripType: z.string().max(40),
  style: z.string().max(40),
  days: z.number().int().min(1).max(14),
  startDate: z.string().refine(isIsoDate, "Choose a real calendar date"),
  travelers: z.number().int().min(1).max(20),
  interests: z.array(z.string().max(40)).max(12),
  activityBudgetPerPerson: z.number().min(0).max(100000),
  foodBudgetPerPersonDay: z.number().min(0).max(10000),
});

export const createAiItinerary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { generateAiItinerary } = await import("./ai/itinerary-ai.server");
    return generateAiItinerary(data);
  });
