// Real place lookup via Open-Meteo's free geocoding service (no key, CORS-enabled).
// Browser-safe: these calls are free, so they run from the client.
import { STATE_NAMES } from "../prices/live";

export interface GeoPlace {
  name: string;
  /** State, province or region */
  admin1: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  timezone: string;
  /** "Chattanooga, TN" in the U.S., "Lisbon, Portugal" elsewhere */
  label: string;
}

const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";

const STATE_CODES = new Map(Object.entries(STATE_NAMES).map(([name, code]) => [code, name]));

interface RawResult {
  name?: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  timezone?: string;
  population?: number;
}

export function labelFor(r: {
  name: string;
  admin1: string;
  country: string;
  countryCode: string;
}): string {
  if (r.countryCode === "US") {
    const code = STATE_NAMES[r.admin1.toLowerCase()];
    return code ? `${r.name}, ${code}` : `${r.name}, ${r.admin1 || "USA"}`;
  }
  return [r.name, r.country].filter(Boolean).join(", ");
}

/** "Chattanooga, TN" → search "Chattanooga", prefer results in Tennessee. */
export function splitQuery(text: string): { name: string; qualifier: string } {
  const [name = "", ...rest] = text.split(",");
  return { name: name.trim(), qualifier: rest.join(",").trim().toLowerCase() };
}

function matchesQualifier(r: GeoPlace, qualifier: string): boolean {
  if (!qualifier) return true;
  const admin = r.admin1.toLowerCase();
  const country = r.country.toLowerCase();
  const stateName = STATE_CODES.get(qualifier.toUpperCase());
  return (
    admin === qualifier ||
    country === qualifier ||
    r.countryCode.toLowerCase() === qualifier ||
    (!!stateName && admin === stateName) ||
    (qualifier.length > 3 && (admin.includes(qualifier) || country.includes(qualifier)))
  );
}

export function parseGeocode(body: unknown, qualifier = ""): GeoPlace[] {
  const results = ((body as { results?: RawResult[] } | null)?.results ?? [])
    .filter((r) => r.name && Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map((r): GeoPlace => {
      const base = {
        name: r.name!,
        admin1: r.admin1 ?? "",
        country: r.country ?? "",
        countryCode: (r.country_code ?? "").toUpperCase(),
      };
      return {
        ...base,
        lat: r.latitude!,
        lon: r.longitude!,
        timezone: r.timezone ?? "auto",
        label: labelFor(base),
      };
    });
  const matching = results.filter((r) => matchesQualifier(r, qualifier));
  const ordered = matching.length ? matching : results;
  // Drop duplicates that render the same label (e.g. two "Springfield, IL" entries).
  const seen = new Set<string>();
  return ordered.filter((r) => (seen.has(r.label) ? false : (seen.add(r.label), true)));
}

/** Up to `count` real places matching free text. Throws on network failure. */
export async function searchPlaces(
  text: string,
  count = 6,
  signal?: AbortSignal,
): Promise<GeoPlace[]> {
  const { name, qualifier } = splitQuery(text);
  if (name.length < 2) return [];
  const u = new URL(GEOCODE);
  u.searchParams.set("name", name);
  u.searchParams.set("count", String(qualifier ? 20 : count));
  u.searchParams.set("language", "en");
  u.searchParams.set("format", "json");
  const res = await fetch(u.toString(), signal ? { signal } : {});
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  return parseGeocode(await res.json(), qualifier).slice(0, count);
}
