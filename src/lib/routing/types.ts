import type { Interest } from "../demo-data";

/**
 * Mapping-service contract. The demo provider implements it today; a real
 * provider (Google Maps, Mapbox, HERE, …) can be dropped in later without
 * changing the road-trip screen.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export type StopKind = "viewpoint" | "restaurant" | "park" | "attraction" | "free-activity";
export type StopTag = "free" | "food" | "sightseeing" | "family" | "hidden-gem";

export interface RouteStop {
  id: string;
  name: string;
  kind: StopKind;
  description: string;
  /** 0 = start, 1 = destination */
  position: number;
  /** Estimated cost per person in USD */
  costPerPerson: number;
  /** Extra driving time for the detour, round trip, in minutes */
  extraMinutes: number;
  interests: Interest[];
  tags: StopTag[];
  /** Filled in by real providers; null for demo data */
  location: LatLng | null;
  /** Provider place id for future reviews/booking lookups */
  placeId: string | null;
  isDemo: boolean;
  /** Where the cost estimate came from */
  costSource: CostSource;
  rating: number | null;
  ratingCount: number | null;
  address: string | null;
  mapsUrl: string | null;
}

/**
 * demo = sample value; listed = price range published on the map listing;
 * price-level = estimated from the listing's $ level; unknown = no price published.
 */
export type CostSource = "demo" | "listed" | "price-level" | "unknown";

export interface RealRoute {
  distanceMiles: number;
  durationMinutes: number;
  encodedPolyline: string;
  start: LatLng;
  end: LatLng;
}

export type RealStopsResult =
  { ok: true; route: RealRoute; stops: RouteStop[] } | { ok: false; error: string };

export interface RouteRequest {
  origin: string;
  destination: string;
  interests: Interest[];
  maxDetourMinutes: number;
}

export interface RouteSummary {
  /** Null until a real mapping service provides them */
  distanceMiles: number | null;
  durationMinutes: number | null;
  polyline: LatLng[] | null;
}

export interface RouteProvider {
  id: string;
  label: string;
  isDemo: boolean;
  getRoute(req: RouteRequest): Promise<RouteSummary>;
  findStopsAlongRoute(req: RouteRequest): Promise<RouteStop[]>;
}
