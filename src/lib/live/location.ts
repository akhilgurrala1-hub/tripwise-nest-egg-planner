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
    return { label: label.slice(0, 80), lat, lon, source: "approximate" };
  } catch {
    return null;
  }
}

/** City name for coordinates (BigDataCloud's free client-side lookup; only after the traveler asks). */
export async function reverseGeocode(
  point: GeoPoint,
  signal?: AbortSignal,
): Promise<string | null> {
  const u = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  u.searchParams.set("latitude", point.lat.toFixed(4));
  u.searchParams.set("longitude", point.lon.toFixed(4));
  u.searchParams.set("localityLanguage", "en");
  const res = await fetch(u.toString(), signal ? { signal } : {});
  if (!res.ok) return null;
  return labelFromReverse(await res.json());
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

/** Ask the device where it is (shows the browser's permission prompt). */
export function devicePosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation)
      return reject(new Error("This browser can't share its location."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? "Location access is off for this site. Type your city instead."
              : "Couldn't get your location. Type your city instead.",
          ),
        ),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30 * 60_000 },
    );
  });
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
