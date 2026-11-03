import { useQuery } from "@tanstack/react-query";

import {
  airportByCode,
  airportByName,
  airportFor,
  airportsNear,
  loadAirports,
  type Airport,
  type NearbyAirport,
} from "../airports";
import type { GeoPoint } from "../catalog";
import { useTrip } from "../trip-store";
import { useHydrated } from "./use-live";

/** Every airport, loaded once in the browser on first use (never during SSR). */
export function useAirports(): Airport[] | null {
  const hydrated = useHydrated();
  const q = useQuery({
    queryKey: ["airports"],
    queryFn: loadAirports,
    enabled: hydrated,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return q.data ?? null;
}

/**
 * The airport for each place (null where there's none within reach), plus the
 * closest one anywhere when a place has none, so the page can say how far it is.
 */
export function useAirportsFor(
  points: readonly (GeoPoint | null | undefined)[],
  /** Place names, for places whose location isn't known yet */
  names: readonly string[] = [],
): {
  ready: boolean;
  airports: (NearbyAirport | null)[];
  closest: (NearbyAirport | null)[];
} {
  const all = useAirports();
  if (!all)
    return { ready: false, airports: points.map(() => null), closest: points.map(() => null) };
  const airports = points.map((p, i) => {
    if (p) return airportFor(all, p);
    const byName = names[i] ? airportByName(all, names[i]!) : null;
    return byName ? { ...byName, miles: 0 } : null;
  });
  const closest = points.map((p, i) =>
    p && !airports[i] ? (airportsNear(all, p, 1, 1500)[0] ?? null) : null,
  );
  return { ready: true, airports, closest };
}

/**
 * The airports for the current trip: home first, then each city in order. The
 * traveler's home airport from their profile wins over the nearest one.
 */
export function useTripAirports(homeAirport?: string | null) {
  const { trip, legs } = useTrip();
  const all = useAirports();
  const found = useAirportsFor(
    [trip.setup.originPoint, ...legs.map((l) => l.point)],
    [trip.setup.origin, ...legs.map((l) => l.name)],
  );
  const home = all && homeAirport ? airportByCode(all, homeAirport) : null;
  const airports = home ? [{ ...home, miles: 0 }, ...found.airports.slice(1)] : found.airports;
  return {
    ...found,
    airports,
    codes: airports.map((a) => a?.code ?? null),
  };
}
