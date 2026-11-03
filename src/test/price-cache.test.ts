import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cachedLookup,
  layeredCache,
  memoryCache,
  type PriceCache,
} from "@/lib/prices/cache.server";
import { reusedNote } from "@/lib/prices/live";
import { fetchLivePrices, type LivePricesRequest } from "@/lib/prices/live-prices.server";

describe("the price cache", () => {
  it("keeps an answer until it expires, then looks again", async () => {
    let t = 1_000;
    const cache = memoryCache(() => t);
    const load = vi.fn(async () => 42);
    const first = await cachedLookup(cache, "k", 100, load, () => t);
    expect(first).toEqual({ value: 42, savedAt: 1_000, hit: false });
    t = 1_050;
    expect(await cachedLookup(cache, "k", 100, load, () => t)).toEqual({
      value: 42,
      savedAt: 1_000,
      hit: true,
    });
    t = 1_101;
    expect((await cachedLookup(cache, "k", 100, load, () => t)).hit).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never remembers a failed lookup", async () => {
    const cache = memoryCache();
    await expect(
      cachedLookup(cache, "k", 1000, () => Promise.reject(new Error("no"))),
    ).rejects.toThrow("no");
    expect(await cache.get("k")).toBeNull();
  });

  it("treats a broken cache as a miss instead of failing", async () => {
    const broken: PriceCache = {
      get: () => Promise.reject(new Error("down")),
      set: () => Promise.reject(new Error("down")),
    };
    const cache = layeredCache([broken, memoryCache()]);
    const res = await cachedLookup(cache, "k", 1000, async () => "fresh");
    expect(res.value).toBe("fresh");
    expect((await cache.get<string>("k"))?.value).toBe("fresh");
  });

  it("says how old reused prices are", () => {
    const now = Date.parse("2026-11-03T12:00:00Z");
    expect(reusedNote("2026-11-03T11:20:00Z", now)).toBe(
      "Same prices as a search 40 minutes ago. Prices are checked again after a few hours.",
    );
    expect(reusedNote("2026-11-03T10:00:00Z", now)).toContain("2 hours ago");
  });
});

const REQ: LivePricesRequest = {
  destination: "Phoenix, AZ",
  origin: "Chicago, IL",
  startDate: "2026-12-10",
  endDate: "2026-12-13",
  travelers: 2,
  rooms: 1,
  style: "comfort",
  includeFlights: true,
  includeHotels: true,
  originAirport: "",
  destinationAirport: "",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

/** A stand-in for SerpApi that counts each search by engine. */
function fakeSerpApi() {
  const searches: string[] = [];
  const fetcher = vi.fn(async (url: string) => {
    const engine = new URL(url).searchParams.get("engine") ?? "";
    searches.push(engine);
    if (engine === "google_flights_autocomplete") {
      const q = new URL(url).searchParams.get("q") ?? "";
      return json({
        suggestions: [{ type: "airport", id: q.startsWith("Chicago") ? "ORD" : "PHX" }],
      });
    }
    if (engine === "google_hotels")
      return json({
        properties: [
          { name: "Desert Inn", rate_per_night: { extracted_before_taxes_fees: 120 } },
          { name: "Sun Suites", rate_per_night: { extracted_before_taxes_fees: 180 } },
          { name: "Grand Mesa", rate_per_night: { extracted_before_taxes_fees: 320 } },
        ],
      });
    return json({
      best_flights: [
        {
          price: 480,
          total_duration: 230,
          flights: [
            {
              airline: "Sky",
              departure_airport: { time: "8:00" },
              arrival_airport: { time: "10:50" },
            },
          ],
        },
      ],
    });
  });
  return { searches, fetcher };
}

describe("live prices reuse a recent identical search", () => {
  beforeEach(() => {
    vi.stubEnv("SERPAPI_API_KEY", "test-key");
    vi.stubEnv("EIA_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("spends searches once, then answers the same trip from the cache", async () => {
    const { searches, fetcher } = fakeSerpApi();
    vi.stubGlobal("fetch", fetcher);
    const cache = memoryCache();

    const first = await fetchLivePrices(REQ, cache);
    expect(first.ok).toBe(true);
    expect(searches.sort()).toEqual([
      "google_flights",
      "google_flights_autocomplete",
      "google_flights_autocomplete",
      "google_hotels",
    ]);
    if (!first.ok) return;
    expect(first.prices.reused).toBe(false);
    expect(first.prices.flights?.perPerson).toBe(240);

    searches.length = 0;
    const again = await fetchLivePrices({ ...REQ, style: "luxury" }, cache);
    expect(searches).toEqual([]);
    expect(again.ok && again.prices.reused).toBe(true);
    if (!again.ok) return;
    // Another style still picks its own rate from the same listings.
    expect(again.prices.hotels!.nightly).toBeGreaterThan(first.prices.hotels!.nightly);
    expect(again.prices.fetchedAt).toBe(first.prices.fetchedAt);

    // New dates are a new search, but the airports are remembered.
    await fetchLivePrices({ ...REQ, startDate: "2026-12-11" }, cache);
    expect(searches.sort()).toEqual(["google_flights", "google_hotels"]);
  });

  it("tries again after a failed search instead of remembering the failure", async () => {
    const { searches, fetcher } = fakeSerpApi();
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (fail && url.includes("engine=google_flights&")) {
          return new Response(JSON.stringify({ error: "busy" }), { status: 503 });
        }
        return fetcher(url);
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cache = memoryCache();
    const first = await fetchLivePrices(REQ, cache);
    expect(first.ok && first.prices.flights).toBeNull();
    fail = false;
    searches.length = 0;
    const again = await fetchLivePrices(REQ, cache);
    expect(searches).toEqual(["google_flights"]);
    expect(again.ok && again.prices.flights?.perPerson).toBe(240);
  });
});
