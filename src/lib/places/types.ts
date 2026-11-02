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
}

export type DestinationPlacesResult =
  { ok: true; sights: RealPlace[]; restaurants: RealPlace[] } | { ok: false; error: string };
