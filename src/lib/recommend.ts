/**
 * Destination suggestions for one traveler: places that suit the trip type, at
 * a sensible distance from where they start, that match what they enjoy.
 */
import { CATALOG, CRUISES, driveLabel, milesBetween, roadMiles, type GeoPoint } from "./catalog";
import {
  CRUISE_PREFIX,
  DESTINATIONS,
  INTERESTS,
  PLACE_PREFIX,
  type Interest,
  type TripType,
} from "./demo-data";

export interface Suggestion {
  /** Destination id for the trip setup */
  id: string;
  name: string;
  region: string;
  tagline: string;
  /** One-way road miles from the start (to the port for cruises), when known */
  miles: number | null;
  /** "3 h 10 min drive", "1,240 mi away" or "2 h drive to the port" */
  distanceLabel: string | null;
  /** Interests this place is good for, from the traveler's list */
  matches: Interest[];
  /** Has hand-written demo venues (the original example destinations) */
  featured: boolean;
}

interface Candidate {
  id: string;
  name: string;
  region: string;
  tagline: string;
  point: GeoPoint;
  tags: Interest[];
  types: TripType[];
  featured: boolean;
}

/** The original demo destinations count as candidates too, tagged by their sights. */
const FEATURED: Candidate[] = DESTINATIONS.filter((d) => d.anchor || d.portPoint).map((d) => ({
  id: d.id,
  name: d.name,
  region: d.region,
  tagline: d.tagline,
  point: d.portPoint ?? { lat: d.anchor!.lat, lon: d.anchor!.lon },
  tags: [...new Set(d.sights.flatMap((s) => s.interests))],
  types: d.bestFor,
  featured: true,
}));

const PLACES: Candidate[] = CATALOG.map((p) => ({
  id: PLACE_PREFIX + p.id,
  name: p.name,
  region: p.region,
  tagline: p.tagline,
  point: { lat: p.lat, lon: p.lon },
  tags: p.tags,
  types: p.types,
  featured: false,
}));

const SHIPS: Candidate[] = CRUISES.map((c) => ({
  id: CRUISE_PREFIX + c.id,
  name: c.name,
  region: `From ${c.port}`,
  tagline: c.tagline,
  point: c.portPoint,
  tags: c.tags,
  types: ["cruise"],
  featured: false,
}));

/** How well a one-way distance (straight-line miles) suits the trip type: 0 (poor) to 3 (ideal). */
export function distanceFit(tripType: TripType, miles: number): number {
  const band = (ideal: [number, number], ok: [number, number]) =>
    miles >= ideal[0] && miles <= ideal[1] ? 3 : miles >= ok[0] && miles <= ok[1] ? 1.5 : 0;
  switch (tripType) {
    case "road-trip":
      return band([90, 320], [35, 420]);
    case "rail":
      return band([80, 350], [40, 600]);
    case "flight":
      return band([450, 2600], [300, 5200]);
    case "cruise":
      // Closer ports are easier: full marks within a day's drive.
      return miles <= 450 ? 3 : miles <= 900 ? 2 : 1;
    default:
      return 0;
  }
}

/**
 * Best places for this trip, nearest-fitting first. Without a starting point the
 * list is ordered by interests alone (and says nothing about distance).
 */
export function recommendDestinations(opts: {
  from: GeoPoint | null;
  tripType: TripType;
  interests: Interest[];
  limit?: number;
}): Suggestion[] {
  const { from, tripType, interests, limit = 6 } = opts;
  if (tripType === "staycation") return [];
  const pool = tripType === "cruise" ? [...FEATURED, ...SHIPS] : [...FEATURED, ...PLACES];
  const scored = pool
    .filter((c) => c.types.includes(tripType))
    .map((c) => {
      const straight = from ? milesBetween(from, c.point) : null;
      const matches = interests.filter((i) => c.tags.includes(i));
      const fit = straight === null ? 1.5 : distanceFit(tripType, straight);
      // Don't suggest home itself (except as a cruise port).
      const tooClose = straight !== null && straight < 25 && tripType !== "cruise";
      const score =
        fit * 2 +
        matches.length * 1.5 +
        (c.featured ? 0.4 : 0) -
        (tripType === "cruise" && straight !== null ? straight / 2000 : 0);
      return { c, straight, matches, fit, score, tooClose };
    })
    .filter((x) => !x.tooClose && (x.straight === null || x.fit > 0));
  scored.sort((a, b) => b.score - a.score || (a.straight ?? 0) - (b.straight ?? 0));
  return scored.slice(0, limit).map(({ c, straight, matches }) => {
    const miles = from && straight !== null ? roadMiles(from, c.point) : null;
    return {
      id: c.id,
      name: c.name,
      region: c.region,
      tagline: c.tagline,
      miles,
      distanceLabel: miles === null ? null : distanceText(tripType, miles),
      matches,
      featured: c.featured,
    };
  });
}

function distanceText(tripType: TripType, miles: number): string {
  if (tripType === "flight") return `${Math.round(miles / 1.25).toLocaleString("en-US")} mi away`;
  if (tripType === "cruise")
    return miles < 15 ? "Sails from your city" : `${driveLabel(miles)} to the port`;
  if (tripType === "rail") return `About ${miles.toLocaleString("en-US")} mi by rail`;
  return driveLabel(miles);
}

export function interestLabel(id: Interest): string {
  return INTERESTS.find((i) => i.id === id)?.label ?? id;
}
