/** The visitor's approximate location from the host's request data (never from the client). */
export type VisitorGeo = {
  city: unknown;
  regionCode: unknown;
  region: unknown;
  country: unknown;
  lat: number;
  lon: number;
};

export function cloudflareGeo(cf: Record<string, unknown>): VisitorGeo | null {
  const lat = Number(cf["latitude"]);
  const lon = Number(cf["longitude"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    city: cf["city"] ?? "",
    regionCode: cf["regionCode"] ?? "",
    region: cf["region"] ?? "",
    country: cf["country"] ?? "",
    lat,
    lon,
  };
}

/** Vercel's edge sets these on every request (clients can't override them). */
export function vercelGeo(h: Headers): VisitorGeo | null {
  const lat = Number(h.get("x-vercel-ip-latitude") ?? NaN);
  const lon = Number(h.get("x-vercel-ip-longitude") ?? NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let city = h.get("x-vercel-ip-city") ?? "";
  try {
    city = decodeURIComponent(city);
  } catch {
    /* keep it as sent */
  }
  const regionCode = h.get("x-vercel-ip-country-region") ?? "";
  return {
    city,
    regionCode,
    region: regionCode,
    country: h.get("x-vercel-ip-country") ?? "",
    lat,
    lon,
  };
}
