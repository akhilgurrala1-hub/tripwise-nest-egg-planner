import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently deletes the signed-in traveler's account and everything saved under it.
 * Only ever acts on the account in the request's own token, and the traveler must type
 * their email address to confirm. The tables have no foreign key to auth.users, so the
 * rows are removed first and the sign-in last.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ confirmEmail: z.string().max(320) }).parse(data))
  .handler(async ({ data, context }) => {
    const email = String(context.claims["email"] ?? "").toLowerCase();
    if (!email || data.confirmEmail.trim().toLowerCase() !== email) {
      return { ok: false as const, error: "Type your email address exactly to confirm." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const table of ["bookings", "trips", "traveler_preferences"] as const) {
      const { error } = await supabaseAdmin.from(table).delete().eq("user_id", context.userId);
      if (error) {
        return {
          ok: false as const,
          error:
            "Couldn't delete your saved data. Nothing was removed from your sign-in; try again.",
        };
      }
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) {
      return {
        ok: false as const,
        error:
          "Your saved data is deleted, but removing the sign-in failed. Contact us and we'll finish it.",
      };
    }
    return { ok: true as const };
  });
