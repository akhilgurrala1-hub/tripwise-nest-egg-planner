// Account data (saved trips, preferences, bookings) read and written with the signed-in user's session; row-level security keeps each user to their own rows.
import { queryOptions, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { useAuth } from "./auth-context";
import type { Interest, TransportMode, TravelStyle } from "./demo-data";
import { currentTrip, tripActions, tripForSaving } from "./trip-store";

export type SavedTripRow = Pick<
  Tables<"trips">,
  "id" | "name" | "revision" | "updated_at" | "created_at" | "deleted_at" | "data"
>;
export type BookingRow = Tables<"bookings">;

export interface Preferences {
  home_city: string;
  home_airport: string;
  travel_style: TravelStyle;
  travelers: number;
  transport_mode: TransportMode;
  interests: Interest[];
  memberships: string[];
}

export const DEFAULT_PREFERENCES: Preferences = {
  home_city: "",
  home_airport: "",
  travel_style: "comfort",
  travelers: 2,
  transport_mode: "car",
  interests: [],
  memberships: [],
};

export const MEMBERSHIPS = [
  "Costco",
  "AAA",
  "AARP",
  "Priority Pass",
  "Chase Sapphire Reserve",
  "Chase Sapphire Preferred",
  "Amex Platinum",
  "Capital One Venture X",
] as const;

// ---------- Saved trips ----------

export const savedTripsQuery = queryOptions({
  queryKey: ["account", "trips"],
  queryFn: async (): Promise<SavedTripRow[]> => {
    const { data, error } = await supabase
      .from("trips")
      .select("id, name, revision, updated_at, created_at, deleted_at, data")
      .order("updated_at", { ascending: false });
    if (error) throw new Error("Couldn't load your saved trips.");
    return data ?? [];
  },
});

export type SaveResult = { ok: true } | { ok: false; conflict: boolean; error: string };

const SAVED_COLUMNS = "id, revision, name, updated_at";

/**
 * Saves the current trip. An existing saved trip is only overwritten when it
 * hasn't changed elsewhere since it was opened (same revision); otherwise the
 * caller is told about the conflict.
 */
export async function saveCurrentTrip(name?: string): Promise<SaveResult> {
  const trip = currentTrip();
  const data = tripForSaving(trip) as unknown as Json;
  if (trip.cloud) {
    const { data: rows, error } = await supabase
      .from("trips")
      .update({ data, name: name ?? trip.cloud.name, schema_version: 3 })
      .eq("id", trip.cloud.id)
      .eq("revision", trip.cloud.revision)
      .is("deleted_at", null)
      .select(SAVED_COLUMNS);
    if (error)
      return { ok: false, conflict: false, error: "Couldn't save your trip. Please try again." };
    const row = rows?.[0];
    if (!row) {
      return {
        ok: false,
        conflict: true,
        error: "This trip was changed or deleted in another tab or device since you opened it.",
      };
    }
    tripActions.setCloudLink({
      id: row.id,
      revision: row.revision,
      name: row.name,
      savedAt: row.updated_at,
    });
    return { ok: true };
  }
  return saveCurrentTripAsNew(name ?? defaultTripName());
}

export async function saveCurrentTripAsNew(name: string): Promise<SaveResult> {
  const data = tripForSaving(currentTrip()) as unknown as Json;
  const { data: row, error } = await supabase
    .from("trips")
    .insert({ name: name.slice(0, 120), data, schema_version: 3 })
    .select(SAVED_COLUMNS)
    .single();
  if (error || !row)
    return { ok: false, conflict: false, error: "Couldn't save your trip. Please try again." };
  tripActions.setCloudLink({
    id: row.id,
    revision: row.revision,
    name: row.name,
    savedAt: row.updated_at,
  });
  return { ok: true };
}

export function defaultTripName(): string {
  const t = currentTrip();
  const dest = t.setup.customDestination.trim() || t.roadTrip.destination || "My trip";
  return `${dest} · ${t.setup.startDate}`.slice(0, 120);
}

export async function renameTrip(id: string, name: string) {
  const { error } = await supabase
    .from("trips")
    .update({ name: name.trim().slice(0, 120) })
    .eq("id", id);
  if (error) throw new Error("Couldn't rename the trip.");
  const t = currentTrip();
  if (t.cloud?.id === id) tripActions.setCloudLink({ ...t.cloud, name: name.trim().slice(0, 120) });
}

export async function duplicateTrip(row: SavedTripRow) {
  const { error } = await supabase
    .from("trips")
    .insert({ name: `${row.name} (copy)`.slice(0, 120), data: row.data, schema_version: 3 });
  if (error) throw new Error("Couldn't copy the trip.");
}

/** Deleted trips stay recoverable until deleted forever. */
export async function setTripDeleted(id: string, deleted: boolean) {
  const { error } = await supabase
    .from("trips")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(deleted ? "Couldn't delete the trip." : "Couldn't restore the trip.");
  const t = currentTrip();
  if (deleted && t.cloud?.id === id) tripActions.setCloudLink(null);
}

export async function deleteTripForever(id: string) {
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) throw new Error("Couldn't delete the trip.");
}

// ---------- Preferences ----------

export const preferencesQuery = (userId: string) =>
  queryOptions({
    queryKey: ["account", "preferences", userId],
    queryFn: async (): Promise<Preferences | null> => {
      const { data, error } = await supabase.from("traveler_preferences").select("*").maybeSingle();
      if (error) throw new Error("Couldn't load your preferences.");
      if (!data) return null;
      return {
        home_city: data.home_city,
        home_airport: data.home_airport,
        travel_style: data.travel_style as TravelStyle,
        travelers: data.travelers,
        transport_mode: data.transport_mode as TransportMode,
        interests: data.interests as Interest[],
        memberships: data.memberships,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

/** Preferences of the signed-in user, or null when signed out or none saved. */
export function usePreferences(): Preferences | null {
  const { user } = useAuth();
  const q = useQuery({ ...preferencesQuery(user?.id ?? "none"), enabled: !!user });
  return user ? (q.data ?? null) : null;
}

export async function savePreferences(userId: string, prefs: Preferences) {
  const { error } = await supabase
    .from("traveler_preferences")
    .upsert({ user_id: userId, ...prefs });
  if (error) throw new Error("Couldn't save your preferences.");
}

// ---------- Bookings ----------

export const bookingsQuery = queryOptions({
  queryKey: ["account", "bookings"],
  queryFn: async (): Promise<BookingRow[]> => {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Couldn't load your bookings.");
    return data ?? [];
  },
});

export interface NewBooking {
  kind: "hotel" | "flight" | "car";
  title: string;
  provider: string;
  url: string;
  start_date: string | null;
  end_date: string | null;
  price: number | null;
}

export async function addBooking(b: NewBooking) {
  const { error } = await supabase
    .from("bookings")
    .insert({ ...b, trip_id: currentTrip().cloud?.id ?? null });
  if (error) throw new Error("Couldn't add it to your bookings.");
}

export async function updateBooking(
  id: string,
  patch: Partial<Pick<BookingRow, "status" | "confirmation_code" | "notes">>,
) {
  const { error } = await supabase.from("bookings").update(patch).eq("id", id);
  if (error) throw new Error("Couldn't update the booking.");
}

export async function deleteBooking(id: string) {
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) throw new Error("Couldn't remove the booking.");
}
