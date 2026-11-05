/**
 * Real places Waypoint can suggest, with real coordinates. Only facts live here
 * (where a place is, what it's known for, which trips suit it); prices for these
 * places are demo estimates built in `demo-data.ts`.
 */
import cruisesData from "../data/cruises.json";
import placesData from "../data/places.json";
import type { Interest, TripType } from "./demo-data";

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface CatalogPlace {
  /** Stable id; destinations use `place:<id>` */
  id: string;
  /** Town used for search and weather, e.g. "Gatlinburg, TN" */
  town: string;
  /** What the card shows, e.g. "Great Smoky Mountains" */
  name: string;
  region: string;
  lat: number;
  lon: number;
  tagline: string;
  tags: Interest[];
  types: TripType[];
  /** Typical lodging cost level */
  tier: "value" | "mid" | "premium";
  /** ISO country code */
  country: string;
}

export interface CatalogCruise {
  id: string;
  /** Where the ship sails, e.g. "Western Caribbean" */
  name: string;
  tagline: string;
  port: string;
  portPoint: GeoPoint;
  /** A real port of call, for weather and sights */
  callTown: string;
  callPoint: GeoPoint;
  tier: "value" | "mid" | "premium";
  tags: Interest[];
  /** ISO country code of the departure port (US when not given) */
  country?: string;
}

// The places and cruises are data, kept in src/data and checked by the Python data
// tools (tools/waypoint_data: ids, coordinates, vocabulary, an airport for every
// place suggested for flights). Edit the JSON there, then run `bun run data:check`.
export const CATALOG = placesData as CatalogPlace[];

export const CRUISES = cruisesData as CatalogCruise[];

const EARTH_MILES = 3958.8;

/** Straight-line distance in miles. */
export function milesBetween(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Roads wind: about a quarter longer than the straight line. */
export const ROAD_FACTOR = 1.25;

export function roadMiles(a: GeoPoint, b: GeoPoint): number {
  return Math.round(milesBetween(a, b) * ROAD_FACTOR);
}

/** "3 h 10 min drive" / "45 min drive", at an average 55 mph. */
export function driveLabel(miles: number): string {
  const minutes = Math.max(5, Math.round(((miles / 55) * 60) / 5) * 5);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h ? `${h} h` : ""}${h && m ? " " : ""}${m ? `${m} min` : ""} drive`;
}

export function catalogPlace(id: string): CatalogPlace | undefined {
  return CATALOG.find((p) => p.id === id);
}

export function catalogCruise(id: string): CatalogCruise | undefined {
  return CRUISES.find((c) => c.id === id);
}
