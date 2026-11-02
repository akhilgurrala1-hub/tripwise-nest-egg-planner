import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { usePreferences } from "../account";
import { todayIso } from "../dates";
import type { DemoDestination } from "../demo-data";
import { useTrip } from "../trip-store";
import { searchPlaces, type GeoPlace } from "./geocode";
import { fetchTripWeather, type DayWeather } from "./weather";

/** The real place a trip happens in: the destination, or home for a staycation. */
export function weatherPlaceText(dest: DemoDestination, origin: string, homeCity = ""): string {
  if (dest.anchor) return dest.anchor.name;
  if (dest.id === "hometown") return origin.trim() || homeCity.trim();
  return dest.name.trim();
}

export function geocodeQuery(text: string) {
  return {
    queryKey: ["live", "geocode", text.trim().toLowerCase()],
    queryFn: ({ signal }: { signal: AbortSignal }) => searchPlaces(text, 6, signal),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  };
}

/** True after the first client render; live lookups never run during server rendering. */
function useHydrated() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

export type LiveStatus = "no-place" | "loading" | "not-found" | "error" | "ready";

export function useTripWeather() {
  const { trip, dest } = useTrip();
  const prefs = usePreferences();
  const hydrated = useHydrated();
  const text = weatherPlaceText(dest, trip.setup.origin, prefs?.home_city ?? "");
  const anchor = dest.anchor;

  const geo = useQuery({
    ...geocodeQuery(text),
    enabled: hydrated && !anchor && text.length >= 2,
  });
  const place: Pick<GeoPlace, "lat" | "lon" | "label"> | null = anchor
    ? { lat: anchor.lat, lon: anchor.lon, label: anchor.name }
    : (geo.data?.[0] ?? null);

  const today = hydrated ? todayIso() : "";
  const { startDate, endDate } = trip.setup;
  const weather = useQuery({
    queryKey: ["live", "weather", place?.lat, place?.lon, startDate, endDate, today],
    queryFn: ({ signal }) =>
      fetchTripWeather({
        lat: place!.lat,
        lon: place!.lon,
        placeLabel: place!.label,
        startDate,
        endDate,
        today,
        signal,
      }),
    enabled: hydrated && !!place && !!today,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const byDate = useMemo(() => {
    const m = new Map<string, DayWeather>();
    for (const d of weather.data?.days ?? []) m.set(d.date, d);
    return m;
  }, [weather.data]);

  let status: LiveStatus;
  if (text.length < 2) status = "no-place";
  else if (!hydrated || (!anchor && geo.isPending) || (place && weather.isPending))
    status = "loading";
  else if (!anchor && geo.isError) status = "error";
  else if (!place) status = "not-found";
  else if (weather.isError) status = "error";
  else status = "ready";

  return {
    status,
    placeText: text,
    placeLabel: place?.label ?? text,
    weather: weather.data ?? null,
    byDate,
    refetch: () => (geo.isError ? geo.refetch() : weather.refetch()),
  };
}
