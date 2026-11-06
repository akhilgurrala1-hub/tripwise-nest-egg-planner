/**
 * Towns travelers name that the airport table doesn't cover (Cambridge, Siena,
 * Sedona, Hallstatt...), from GeoNames (CC BY 4.0), built by
 * `python -m waypoint_data towns`. Loaded on demand in the browser, like airports.
 */

/** [name, country, region, lat, lon, population in thousands, also an everyday word] */
export type TownRow = [string, string, string, number, number, number, 0 | 1];

export interface Town {
  name: string;
  country: string;
  /** State or province code in the US, Canada and Australia, else "" */
  region: string;
  lat: number;
  lon: number;
  /** Population, in thousands */
  popK: number;
  /** The name is also an everyday word ("March", "Normal"): only a place when it's clearly meant */
  word: boolean;
}

export const toTown = (r: TownRow): Town => ({
  name: r[0],
  country: r[1],
  region: r[2],
  lat: r[3],
  lon: r[4],
  popK: r[5],
  word: r[6] === 1,
});

/** The table's rows without its first (source and date) row. */
export const townsFrom = (rows: readonly unknown[]): Town[] =>
  (rows as unknown[][])
    .filter((r) => Array.isArray(r) && r[0] !== "_meta" && r.length === 7)
    .map((r) => toTown(r as TownRow));

let all: Promise<Town[]> | null = null;

export function loadTowns(): Promise<Town[]> {
  all ??= import("../data/towns.json").then((m) => townsFrom(m.default as unknown[]));
  return all;
}
