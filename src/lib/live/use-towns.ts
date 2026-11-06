import { useQuery } from "@tanstack/react-query";

import { loadTowns, type Town } from "../towns";
import { useHydrated } from "./use-live";

/** Every town in the towns table, loaded once in the browser on first use (never during SSR). */
export function useTowns(): Town[] | null {
  const hydrated = useHydrated();
  const q = useQuery({
    queryKey: ["towns"],
    queryFn: loadTowns,
    enabled: hydrated,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return q.data ?? null;
}
