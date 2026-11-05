import { useQuery } from "@tanstack/react-query";

import { loadVisas, type VisaTable } from "../visas";
import { useHydrated } from "./use-live";

/** The visa table, loaded once in the browser when a page needs it (never during SSR). */
export function useVisas(): VisaTable | null {
  const hydrated = useHydrated();
  const q = useQuery({
    queryKey: ["visas"],
    queryFn: loadVisas,
    enabled: hydrated,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return q.data ?? null;
}
