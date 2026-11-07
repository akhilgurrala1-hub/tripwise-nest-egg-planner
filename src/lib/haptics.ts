/**
 * A light tap of haptic feedback for meaningful moments only: a switch flipping, a
 * dragged control snapping home. Fired on the same frame as the visual change.
 * Phones that support it (Vibration API) feel it; everything else ignores it.
 */
export function haptic(ms = 8) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    /* not allowed here */
  }
}
