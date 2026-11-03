import { useQuery, type QueryClient } from "@tanstack/react-query";

import type { GeoPoint } from "../catalog";
import type { DemoDestination } from "../demo-data";
import { useTrip } from "../trip-store";
import { fetchHolidays, fetchPlaceSummary, holidaysBetween } from "./open-data";
import { fetchTravelGuide } from "./travel-guide";
import { useHomePlace } from "./use-home";
import { geocodeQuery, useHydrated } from "./use-live";

/** What to look up on Wikipedia for a destination. */
export function wikiQuery(dest: DemoDestination, origin: string): string {
  if (dest.id === "hometown") return origin.split(",")[0]?.trim() ?? "";
  if (dest.id === "custom") return dest.name;
  if (dest.port) return dest.anchor?.name ?? dest.name;
  if (dest.id.startsWith("place:")) return `${dest.name} ${dest.region}`;
  return dest.anchor?.name ?? dest.name;
}

/** Photo and introduction for a destination (Wikipedia, free). */
export function useDestinationSummary(dest: DemoDestination, origin: string) {
  const hydrated = useHydrated();
  const q = wikiQuery(dest, origin).trim();
  return useQuery({
    queryKey: ["live", "wiki-summary", q.toLowerCase()],
    queryFn: ({ signal }) => fetchPlaceSummary(q, signal),
    enabled: hydrated && q.length >= 2,
    staleTime: 7 * 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

/** The travel-guide lookup for a destination, shared by the Overview and the planner (cached). */
export function travelGuideQuery(dest: DemoDestination, origin: string, country: string | null) {
  const q = wikiQuery(dest, origin).trim();
  const near = dest.anchor?.name ?? dest.name;
  return {
    queryKey: ["live", "travel-guide", q.toLowerCase(), country ?? ""],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchTravelGuide(q, near, country ?? "US", signal),
    staleTime: 7 * 24 * 60 * 60 * 1000,
    retry: 1,
  };
}

/** Wikivoyage's listings and practical tips for the trip's destination (free). */
export function useTravelGuide() {
  const { trip, dest } = useTrip();
  const hydrated = useHydrated();
  const country = useTripCountry();
  const q = wikiQuery(dest, trip.setup.origin).trim();
  return useQuery({
    ...travelGuideQuery(dest, trip.setup.origin, country),
    enabled: hydrated && q.length >= 2,
  });
}

/** Where a destination is, as a point: its town, or a typed place looked up (free geocoding). */
export async function destinationPoint(
  queryClient: QueryClient,
  dest: DemoDestination,
  origin: string,
  typed?: GeoPoint | null,
): Promise<{ point: GeoPoint; near: string } | null> {
  if (dest.id !== "custom" && dest.id !== "hometown" && dest.anchor)
    return { point: { lat: dest.anchor.lat, lon: dest.anchor.lon }, near: dest.anchor.name };
  if (typed) return { point: typed, near: dest.name };
  const text = dest.id === "hometown" ? origin : dest.name;
  if (text.trim().length < 2) return null;
  const found = await queryClient.fetchQuery(geocodeQuery(text));
  const p = found[0];
  return p ? { point: { lat: p.lat, lon: p.lon }, near: p.label } : null;
}

/** The destination's country: catalog places know it, typed places are looked up, home uses the traveler's. */
export function useTripCountry(): string | null {
  const { trip, dest } = useTrip();
  const hydrated = useHydrated();
  const { place } = useHomePlace();
  const typed = dest.id === "custom" ? dest.name : "";
  const geo = useQuery({ ...geocodeQuery(typed), enabled: hydrated && typed.length >= 2 });
  if (dest.country) return dest.country;
  if (dest.id === "custom") return geo.data?.[0]?.countryCode ?? null;
  if (dest.id === "hometown") return place?.country ?? (trip.setup.origin ? "US" : null);
  return "US";
}

/** Public holidays during the trip at the destination (Nager.Date, free). */
export function useTripHolidays() {
  const { trip } = useTrip();
  const hydrated = useHydrated();
  const country = useTripCountry();
  const { startDate, endDate } = trip.setup;
  const years = [...new Set([startDate.slice(0, 4), endDate.slice(0, 4)])].map(Number);
  const q = useQuery({
    queryKey: ["live", "holidays", country, years.join(",")],
    queryFn: async ({ signal }) =>
      (await Promise.all(years.map((y) => fetchHolidays(y, country!, signal)))).flat(),
    enabled: hydrated && !!country && years.every((y) => y > 2000),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
  return holidaysBetween(q.data ?? [], startDate, endDate);
}
