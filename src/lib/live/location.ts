/**
 * Where the traveler is, so trips start from home and suggestions are nearby.
 * Three sources, best first: the home city in their profile, their device's
 * location (only when they tap "Use my location"), and the approximate city
 * Cloudflare sees for their connection (no third-party lookup).
 */
import type { GeoPoint } from "../catalog";

export interface HomePlace extends GeoPoint {
  /** "Charlotte, NC" */
  label: string;
  source: "profile" | "device" | "approximate";
  /** ISO country code, when known */
  country?: string;
}

const STORAGE_KEY = "waypoint.home";

/** Parse the header src/server.ts sets from Cloudflare's request.cf. */
export function parseVisitorGeo(header: string | null): HomePlace | null {
  if (!header) return null;
  try {
    const g = JSON.parse(decodeURIComponent(header)) as Record<string, unknown>;
    const lat = Number(g["lat"]);
    const lon = Number(g["lon"]);
    const city = typeof g["city"] === "string" ? g["city"].trim() : "";
    if (!city || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const country = typeof g["country"] === "string" ? g["country"] : "";
    const region = typeof g["regionCode"] === "string" ? g["regionCode"] : "";
    const label =
      country === "US" && region ? `${city}, ${region}` : country ? `${city}, ${country}` : city;
    return {
      label: label.slice(0, 80),
      lat,
      lon,
      source: "approximate",
      ...(country ? { country } : {}),
    };
  } catch {
    return null;
  }
}

/** City name for coordinates (BigDataCloud's free client-side lookup; only after the traveler asks). */
export async function reverseGeocode(
  point: GeoPoint,
  signal?: AbortSignal,
): Promise<{ label: string; country: string } | null> {
  const u = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  u.searchParams.set("latitude", point.lat.toFixed(4));
  u.searchParams.set("longitude", point.lon.toFixed(4));
  u.searchParams.set("localityLanguage", "en");
  const res = await fetch(u.toString(), signal ? { signal } : {});
  if (!res.ok) return null;
  const body = (await res.json()) as Record<string, unknown>;
  const label = labelFromReverse(body);
  return label ? { label, country: String(body["countryCode"] ?? "") } : null;
}

export function labelFromReverse(body: unknown): string | null {
  const b = body as Record<string, unknown> | null;
  if (!b) return null;
  const city = String(b["city"] || b["locality"] || "").trim();
  if (!city) return null;
  const country = String(b["countryCode"] ?? "");
  const sub = String(b["principalSubdivisionCode"] ?? "");
  if (country === "US" && sub.startsWith("US-")) return `${city}, ${sub.slice(3)}`;
  const countryName = String(b["countryName"] ?? country).replace(/ \(the\)$/, "");
  return countryName ? `${city}, ${countryName}` : city;
}

/** Why the device didn't share a location: "denied" (permission off) or "unavailable". */
export class LocationError extends Error {
  readonly reason: "denied" | "unavailable";
  constructor(reason: "denied" | "unavailable", message: string) {
    super(message);
    this.reason = reason;
  }
}

function askDevice(highAccuracy: boolean, timeout: number): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) =>
        reject(
          e.code === e.PERMISSION_DENIED
            ? new LocationError(
                "denied",
                "Location access is off for this site. Allow it in your browser's site settings, or type your city.",
              )
            : new LocationError(
                "unavailable",
                "Your device didn't share a location. On a computer, check that Location Services are on for your browser, or type your city.",
              ),
        ),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 30 * 60_000 },
    );
  });
}

/**
 * Ask the device where it is (shows the browser's permission prompt). A quick
 * network-based fix first; if that fails for any reason but a refusal, one
 * more try that may use GPS / Wi-Fi scanning.
 */
export async function devicePosition(): Promise<GeoPoint> {
  if (typeof navigator === "undefined" || !navigator.geolocation)
    throw new LocationError(
      "unavailable",
      "This browser can't share its location. Type your city.",
    );
  try {
    return await askDevice(false, 10_000);
  } catch (e) {
    if (e instanceof LocationError && e.reason === "denied") throw e;
    return askDevice(true, 15_000);
  }
}

export function readDevicePlace(): HomePlace | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const p = raw ? (JSON.parse(raw) as HomePlace) : null;
    return p && typeof p.label === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lon)
      ? { ...p, source: "device" }
      : null;
  } catch {
    return null;
  }
}

export function saveDevicePlace(p: HomePlace) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...p, source: "device" }));
  } catch {
    /* storage may be unavailable */
  }
}
