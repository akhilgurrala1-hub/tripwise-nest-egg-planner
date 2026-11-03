/**
 * Per-account limits on the features that cost money or spend a shared allowance
 * (AI credits, map-service calls, SerpApi searches). Sign-up is instant, so without
 * a limit one account could run up the bill. Normal use never comes close.
 *
 * Counts live in this server instance's memory (a sliding window per account and
 * feature), so they're a guard against runaway use, not an exact meter.
 */

export interface Limit {
  max: number;
  windowMs: number;
}

const HOUR = 60 * 60 * 1000;

export const LIMITS = {
  /** Generating or refining a day-by-day plan */
  aiPlan: { max: 20, windowMs: HOUR },
  /** Turns with the trip assistant */
  aiChat: { max: 80, windowMs: HOUR },
  /** Real places in the destination (Google Maps) */
  places: { max: 30, windowMs: HOUR },
  /** Real stops along a route (Google Maps) */
  stops: { max: 30, windowMs: HOUR },
  /** Live flight, hotel and gas prices (SerpApi, EIA) */
  prices: { max: 20, windowMs: HOUR },
  /** "Test connection" for the price keys */
  keyTest: { max: 10, windowMs: HOUR },
} satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

const MAX_TRACKED = 5000;

export function rateLimiter(now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    /**
     * Count one use. Returns null when it's allowed, or a plain-language message
     * saying when to try again.
     */
    take(user: string, name: LimitName, limit: Limit = LIMITS[name]): string | null {
      const key = `${name}:${user}`;
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < limit.windowMs);
      if (recent.length >= limit.max) {
        hits.set(key, recent);
        const minutes = Math.max(1, Math.ceil((recent[0]! + limit.windowMs - t) / 60_000));
        return `You've used this a lot in the last hour. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
      }
      recent.push(t);
      hits.delete(key);
      // Oldest accounts go first so memory stays bounded.
      while (hits.size >= MAX_TRACKED) hits.delete(hits.keys().next().value!);
      hits.set(key, recent);
      return null;
    },
  };
}

const shared = rateLimiter();

/** Count one use of `name` by this account; a message when over the limit, else null. */
export const takeRate = (user: string, name: LimitName) => shared.take(user, name);
