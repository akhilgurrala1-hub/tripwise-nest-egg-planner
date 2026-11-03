/**
 * Short-lived cache for price lookups, so the same search (same places, dates and
 * group size) within a few hours reuses the earlier answer instead of spending
 * another search from the monthly allowance.
 *
 * Two layers, both best-effort: a small in-memory map for this server instance, and
 * Cloudflare's cache (shared by instances in the same data center) when it's there.
 * Keys hold places and dates only, never API keys. A failing cache never fails a lookup.
 */

export interface Cached<T> {
  value: T;
  /** When the lookup really ran (ms since epoch) */
  savedAt: number;
  /** True when this came from the cache */
  hit: boolean;
}

export interface PriceCache {
  get<T>(key: string): Promise<{ value: T; savedAt: number } | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

/** How long each kind of answer stays good. */
export const PRICE_TTL = {
  /** Fares and room rates move during the day, so a few hours at most */
  flights: 3 * 3_600_000,
  hotels: 3 * 3_600_000,
  /** The government survey is weekly */
  gas: 12 * 3_600_000,
  /** Which airport serves a city doesn't change */
  airport: 7 * 24 * 3_600_000,
} as const;

const MAX_ENTRIES = 300;

/** In-memory cache with expiry; the oldest entry goes first when it's full. */
export function memoryCache(now: () => number = Date.now): PriceCache {
  const map = new Map<string, { value: unknown; savedAt: number; expires: number }>();
  return {
    async get<T>(key: string) {
      const e = map.get(key);
      if (!e) return null;
      if (e.expires <= now()) {
        map.delete(key);
        return null;
      }
      return { value: e.value as T, savedAt: e.savedAt };
    },
    async set<T>(key: string, value: T, ttlMs: number) {
      map.delete(key);
      while (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value!);
      const t = now();
      map.set(key, { value, savedAt: t, expires: t + ttlMs });
    },
  };
}

interface EdgeCache {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
}

/** Cloudflare's per-data-center cache (`caches.default`), or null elsewhere. */
function edgeCache(now: () => number): PriceCache | null {
  const store = (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;
  if (!store || typeof store.match !== "function") return null;
  const url = (key: string) => `https://price-cache.waypoint.invalid/${encodeURIComponent(key)}`;
  return {
    async get<T>(key: string) {
      const res = await store.match(new Request(url(key)));
      if (!res) return null;
      const body = (await res.json()) as { value: T; savedAt: number; expires: number };
      return body.expires > now() ? { value: body.value, savedAt: body.savedAt } : null;
    },
    async set<T>(key: string, value: T, ttlMs: number) {
      const t = now();
      await store.put(
        new Request(url(key)),
        new Response(JSON.stringify({ value, savedAt: t, expires: t + ttlMs }), {
          headers: {
            "content-type": "application/json",
            "cache-control": `max-age=${Math.round(ttlMs / 1000)}`,
          },
        }),
      );
    },
  };
}

/** Memory first, then the shared cache; writes go to both. */
export function layeredCache(layers: PriceCache[]): PriceCache {
  return {
    async get<T>(key: string) {
      for (const layer of layers) {
        try {
          const hit = await layer.get<T>(key);
          if (hit) return hit;
        } catch {
          /* a cache problem is just a miss */
        }
      }
      return null;
    },
    async set<T>(key: string, value: T, ttlMs: number) {
      await Promise.all(layers.map((layer) => layer.set(key, value, ttlMs).catch(() => undefined)));
    },
  };
}

let shared: PriceCache | null = null;

/** The cache used by live price lookups on this server. */
export function priceCache(): PriceCache {
  if (!shared) {
    const edge = edgeCache(Date.now);
    shared = layeredCache(edge ? [memoryCache(), edge] : [memoryCache()]);
  }
  return shared;
}

/** Normalize a place or other free text for a cache key ("  New York, NY " = "new york, ny"). */
export const keyPart = (s: string | number) => String(s).trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The cached answer for `key`, or run `load` and remember what it returns.
 * Only answers are cached: a failed lookup is tried again next time.
 */
export async function cachedLookup<T>(
  cache: PriceCache,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  now: () => number = Date.now,
): Promise<Cached<T>> {
  const hit = await cache.get<T>(key).catch(() => null);
  if (hit) return { ...hit, hit: true };
  const value = await load();
  const savedAt = now();
  await cache.set(key, value, ttlMs).catch(() => undefined);
  return { value, savedAt, hit: false };
}
