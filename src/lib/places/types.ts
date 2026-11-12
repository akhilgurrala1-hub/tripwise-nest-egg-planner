import type { Interest } from "../demo-data";
import type { CostSource } from "../routing/types";

/** A real place returned by the map service for a destination (browser-safe shape). */
export interface RealPlace {
  placeId: string;
  name: string;
  kind: "sight" | "restaurant";
  /** Short type label, e.g. "Art museum" or "Mexican restaurant" */
  typeLabel: string;
  description: string;
  address: string | null;
  rating: number | null;
  ratingCount: number | null;
  mapsUrl: string | null;
  /** Estimated cost per person in USD; 0 with costSource "unknown" means no price is published */
  costPerPerson: number;
  costSource: CostSource;
  interests: Interest[];
  /** Opening hours as published, e.g. "Daily 9AM-5PM" */
  hours?: string | null;
  /** The price as published, e.g. "Adults $29.95, children $19.95" */
  priceText?: string | null;
  /** A bar, café or music venue: better for an evening than a meal */
  evening?: boolean;
  /** Wikipedia page views over the last month: how well known it is, for ranking */
  fame?: number;
  /** Where it came from: travel guide, Wikipedia, OpenStreetMap or Google Maps */
  source?: PlaceSource;
  /** Where it is, when the source publishes coordinates (never guessed) */
  lat?: number;
  lon?: number;
}

export type PlaceSource = "wikivoyage" | "wikipedia" | "osm" | "google";

export type DestinationPlacesResult =
  { ok: true; sights: RealPlace[]; restaurants: RealPlace[] } | { ok: false; error: string };
