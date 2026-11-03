import type { TripType } from "@/lib/demo-data";

/** Each trip type's own hue (tokens in styles.css): scenes, the trip chip and suggestions. */
export const TRIP_COLOR: Record<TripType, string> = {
  "road-trip": "var(--trip-road)",
  flight: "var(--trip-flight)",
  cruise: "var(--trip-cruise)",
  rail: "var(--trip-rail)",
  staycation: "var(--trip-home)",
};
