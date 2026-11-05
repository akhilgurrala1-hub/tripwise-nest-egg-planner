/** The trip that was just built, so the Overview can mark the moment once (see TripReady). */
export const JUST_PLANNED_KEY = "waypoint.justPlanned";

/** Called right after a trip is built. */
export function markJustPlanned(tripId: string) {
  try {
    window.sessionStorage.setItem(JUST_PLANNED_KEY, tripId);
  } catch {
    /* storage may be unavailable */
  }
}
