import { useSyncExternalStore } from "react";

/**
 * Whether a trip is being planned right now (places being looked up before the
 * budget is fitted), so every "Plan trip" button can show it and none can be
 * pressed twice: the one in the page and the one in the trip bar.
 */
let planning = false;
const listeners = new Set<() => void>();

export function setPlanning(next: boolean) {
  if (planning === next) return;
  planning = next;
  for (const l of listeners) l();
}

export function usePlanning() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => planning,
    () => false,
  );
}
