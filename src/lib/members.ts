/**
 * Sharing a saved trip with people who can look at it (group travel, phase 1). Everything here
 * goes through the database functions and policies in migration 0004, which decide who may do
 * what; this file only calls them and words their answers for people.
 */
import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export const JOIN_PATH = "/join";
/** Where a pending invite waits while the person signs in (this tab only). */
export const JOIN_STORAGE_KEY = "waypoint.join";

/** The link to send. The token sits after the # so it never reaches our server or its logs. */
export const inviteUrl = (origin: string, token: string) => `${origin}${JOIN_PATH}#${token}`;

/** A token from a link fragment: exactly 64 hex characters, else nothing. */
export function tokenFromHash(hash: string): string | null {
  const t = hash.replace(/^#/, "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(t) ? t : null;
}

const MESSAGES: Record<string, string> = {
  invalid_invite:
    "This invite link isn't valid any more. It may have been used, revoked or expired. Ask for a new one.",
  own_trip: "This is your own trip, so there's nothing to join.",
  member_limit: "This trip already has as many people as it can have.",
  not_a_member: "You don't have access to this trip.",
  not_your_trip: "Only the person who owns this trip can do that.",
  too_many_invites: "Too many invites were made in the last hour. Try again later.",
  role_not_available: "That kind of invite isn't available yet.",
  not_signed_in: "Sign in first.",
};

/** A plain sentence for whatever the database said (its error codes are the first words). */
export function friendlyShareError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const code = Object.keys(MESSAGES).find((c) => msg.includes(c));
  return code ? MESSAGES[code]! : "Something went wrong. Try again.";
}

async function rpc<T>(call: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await call;
  if (error) throw new Error(friendlyShareError(error.message));
  return data as T;
}

export const createInvite = (tripId: string) =>
  rpc<string>(supabase.rpc("create_trip_invite", { p_trip_id: tripId }));

export const acceptInvite = (token: string, nickname: string) =>
  rpc<string>(supabase.rpc("accept_trip_invite", { p_token: token, p_nickname: nickname }));

export const revokeInvite = async (inviteId: string) => {
  await rpc<undefined>(supabase.rpc("revoke_trip_invite", { p_invite_id: inviteId }));
};

export interface SharedTripView {
  id: string;
  name: string;
  role: string;
  updated_at: string;
  /** The trip with everything private and about money already removed by the database */
  plan: Json;
}

export const getSharedTrip = (tripId: string) =>
  rpc<Json>(
    supabase.rpc("get_shared_trip", { p_trip_id: tripId }),
  ) as Promise<unknown> as Promise<SharedTripView>;

export const sharedTripsQuery = queryOptions({
  queryKey: ["account", "shared-trips"],
  queryFn: () => rpc(supabase.rpc("list_my_shared_trips")),
});

export interface MemberRow {
  user_id: string;
  role: string;
  nickname: string;
  created_at: string;
}
export interface InviteRow {
  id: string;
  role: string;
  expires_at: string;
  created_at: string;
}

export const membersQuery = (tripId: string) =>
  queryOptions({
    queryKey: ["account", "trip-members", tripId],
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, role, nickname, created_at")
        .eq("trip_id", tripId)
        .order("created_at");
      if (error) throw new Error("Couldn't load the people on this trip.");
      return data ?? [];
    },
  });

export const invitesQuery = (tripId: string) =>
  queryOptions({
    queryKey: ["account", "trip-invites", tripId],
    queryFn: async (): Promise<InviteRow[]> => {
      const { data, error } = await supabase
        .from("trip_invites")
        .select("id, role, expires_at, created_at")
        .eq("trip_id", tripId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw new Error("Couldn't load the open invites.");
      return data ?? [];
    },
  });

/** The owner removes someone, or a member leaves (the row policies allow exactly these two). */
export async function removeMember(tripId: string, userId: string) {
  const { error } = await supabase
    .from("trip_members")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", userId);
  if (error) throw new Error("Couldn't remove that person.");
}
