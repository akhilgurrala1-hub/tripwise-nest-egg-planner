import { describe, expect, it } from "vitest";

import { busProviders, railProviders } from "@/lib/booking";
import { CATALOG, CRUISES } from "@/lib/catalog";
import { buildRealItinerary } from "@/lib/itinerary";
import {
  classifySight,
  holidaysBetween,
  parseHolidays,
  parseLandmarks,
  parseRestaurants,
  parseSummary,
} from "@/lib/live/open-data";
import { wikiQuery } from "@/lib/live/use-open-data";
import {
  countryFromLocale,
  currencyForCountry,
  formatApprox,
  formatDistance,
  formatTemp,
  parseRate,
  unitsForCountry,
} from "@/lib/locale";
import { getDestination } from "@/lib/demo-data";
import { recommendDestinations } from "@/lib/recommend";
import { summarize } from "@/lib/live/weather";

const PARIS = { lat: 48.8566, lon: 2.3522 };
const TOKYO = { lat: 35.6762, lon: 139.6503 };
const SYDNEY = { lat: -33.8688, lon: 151.2093 };

describe("worldwide suggestions", () => {
  it("has real places on every continent, each with a country", () => {
    const countries = new Set(CATALOG.map((p) => p.country));
    for (const c of ["US", "CA", "MX", "FR", "IT", "JP", "AU", "ZA", "BR"])
      expect(countries).toContain(c);
    expect(new Set(CATALOG.map((p) => p.id)).size).toBe(CATALOG.length);
    for (const p of CATALOG) {
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
    }
    expect(CRUISES.some((c) => c.country === "ES")).toBe(true);
  });

  it("suggests European trips from Paris and Asian/Oceanian ones from Tokyo and Sydney", () => {
    const road = recommendDestinations({ from: PARIS, tripType: "road-trip", interests: ["arts"] });
    expect(road.length).toBeGreaterThan(1);
    for (const s of road) expect(getDestination(s.id).country).not.toBe("US");
    const rail = recommendDestinations({ from: PARIS, tripType: "rail", interests: [] });
    expect(rail.map((s) => s.name)).toEqual(expect.arrayContaining(["London"]));
    const fromTokyo = recommendDestinations({
      from: TOKYO,
      tripType: "rail",
      interests: ["history"],
    });
    expect(fromTokyo[0]!.name).toBe("Kyoto");
    const cruise = recommendDestinations({ from: SYDNEY, tripType: "cruise", interests: [] });
    expect(cruise[0]!.region).toMatch(/Sydney/);
  });

  it("shows distances in the traveler's units", () => {
    const km = recommendDestinations({
      from: PARIS,
      tripType: "flight",
      interests: [],
      units: "metric",
    });
    expect(km[0]!.distanceLabel).toMatch(/km away$/);
  });

  it("links the right train and bus sellers for the country", () => {
    expect(railProviders("US")[0]!.label).toBe("Amtrak");
    expect(railProviders("FR")[0]!.label).toBe("Trainline");
    expect(railProviders("CA")[0]!.label).toBe("VIA Rail");
    expect(railProviders("TH")).toEqual([]);
    expect(busProviders("DE").map((l) => l.label)).toEqual(["FlixBus"]);
  });
});

describe("units and currency", () => {
  it("picks units and currency from the country", () => {
    expect(unitsForCountry("US")).toBe("imperial");
    expect(unitsForCountry("GB")).toBe("metric");
    expect(unitsForCountry(null)).toBe("imperial");
    expect(currencyForCountry("FR")).toBe("EUR");
    expect(currencyForCountry("JP")).toBe("JPY");
    expect(currencyForCountry("ZZ")).toBe("USD");
    expect(countryFromLocale("en-GB")).toBe("GB");
    expect(countryFromLocale("pt_BR")).toBe("BR");
    expect(countryFromLocale("fr")).toBeNull();
  });

  it("formats temperatures, distances and converted money", () => {
    expect(formatTemp(68, "metric")).toBe("20°C");
    expect(formatTemp(68, "imperial")).toBe("68°F");
    expect(formatDistance(100, "metric")).toBe("161 km");
    expect(formatApprox(1000, "EUR", 0.92)).toBe("≈ €920");
    expect(formatApprox(10, "JPY", 150)).toBe("≈ ¥1,500");
    expect(parseRate({ rates: { EUR: 0.92 } }, "EUR")).toBe(0.92);
    expect(parseRate({ rates: {} }, "EUR")).toBeNull();
    expect(parseRate({ rates: { EUR: -1 } }, "EUR")).toBeNull();
  });

  it("summarizes the weather in Celsius", () => {
    const day = (highF: number) => ({
      date: "2026-12-01",
      source: "forecast" as const,
      kind: "clear" as const,
      label: "Clear",
      highF,
      lowF: 40,
      precipChance: 0,
      precipInches: 0,
      sunrise: null,
      sunset: null,
    });
    expect(summarize([day(50), day(68)], "metric")).toMatch(/^Highs 10–20°C/);
  });
});

describe("free open data", () => {
  it("reads a Wikipedia summary", () => {
    const s = parseSummary({
      query: {
        pages: {
          "1": {
            index: 1,
            title: "Lisbon",
            extract: "Lisbon is the capital of Portugal.",
            thumbnail: { source: "https://upload.wikimedia.org/x.jpg" },
            fullurl: "https://en.wikipedia.org/wiki/Lisbon",
          },
        },
      },
    });
    expect(s).toEqual({
      title: "Lisbon",
      extract: "Lisbon is the capital of Portugal.",
      image: "https://upload.wikimedia.org/x.jpg",
      url: "https://en.wikipedia.org/wiki/Lisbon",
    });
    expect(parseSummary({})).toBeNull();
  });

  it("keeps landmarks, drops stations and schools, nearest first", () => {
    expect(classifySight("Art museum in Paris, France")).toEqual(["arts", "history"]);
    expect(classifySight("Railway station in Paris")).toBeNull();
    expect(classifySight("Secondary school in London")).toBeNull();
    expect(classifySight("Gothic cathedral")).toEqual(["history", "arts"]);
    const places = parseLandmarks(
      {
        query: {
          pages: {
            "1": {
              pageid: 1,
              title: "Far Museum",
              description: "museum",
              coordinates: [{ lat: 1, lon: 1, dist: 900 }],
            },
            "2": {
              pageid: 2,
              title: "Gare X",
              description: "railway station",
              coordinates: [{ lat: 1, lon: 1, dist: 10 }],
            },
            "3": {
              pageid: 3,
              title: "Near Park",
              description: "urban park",
              coordinates: [{ lat: 1, lon: 1, dist: 50 }],
            },
          },
        },
      },
      "Paris, France",
    );
    expect(places.map((p) => p.name)).toEqual(["Near Park", "Far Museum"]);
    expect(places[0]!.costSource).toBe("unknown");
    expect(places[0]!.mapsUrl).toContain("google.com/maps/search");
  });

  it("reads OpenStreetMap restaurants without inventing prices", () => {
    const r = parseRestaurants(
      {
        elements: [
          {
            type: "node",
            id: 1,
            tags: {
              name: "Tasca Lx",
              cuisine: "portuguese;seafood",
              "addr:street": "Rua A",
              "addr:housenumber": "5",
            },
          },
          { type: "node", id: 2, tags: { name: "tasca lx" } },
          { type: "node", id: 3, tags: { amenity: "restaurant" } },
        ],
      },
      "Lisbon, Portugal",
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      name: "Tasca Lx",
      typeLabel: "Portuguese restaurant",
      address: "5 Rua A",
      costPerPerson: 0,
      costSource: "unknown",
    });
  });

  it("builds a plan from open data, labeled as such", () => {
    const sight = parseLandmarks(
      {
        query: {
          pages: {
            "1": {
              pageid: 1,
              title: "Belém Tower",
              description: "fortified tower",
              coordinates: [{ lat: 1, lon: 1, dist: 5 }],
            },
          },
        },
      },
      "Lisbon",
    );
    const food = parseRestaurants(
      { elements: [{ type: "node", id: 9, tags: { name: "Cervejaria" } }] },
      "Lisbon",
    );
    const plan = buildRealItinerary({
      sights: sight,
      restaurants: food,
      destName: "Lisbon",
      days: 2,
      startDate: "2026-12-01",
      interests: [],
      tripType: "flight",
      source: "open",
    });
    expect(plan.source).toBe("open");
    expect(plan.days[0]!.items.map((i) => i.name)).toEqual(
      expect.arrayContaining(["Belém Tower", "Cervejaria"]),
    );
    expect(plan.tips[0]).toMatch(/Wikipedia/);
  });

  it("keeps national public holidays on the trip's dates", () => {
    const list = parseHolidays([
      {
        date: "2026-12-25",
        name: "Christmas Day",
        localName: "Noël",
        countryCode: "FR",
        global: true,
      },
      {
        date: "2026-12-26",
        name: "St. Stephen's Day",
        localName: "Stephanstag",
        countryCode: "FR",
        global: false,
      },
      {
        date: "2026-07-14",
        name: "Bastille Day",
        localName: "Fête nationale",
        countryCode: "FR",
        global: true,
      },
    ]);
    expect(list.map((h) => h.name)).toEqual(["Christmas Day", "Bastille Day"]);
    expect(holidaysBetween(list, "2026-12-20", "2026-12-27").map((h) => h.name)).toEqual([
      "Christmas Day",
    ]);
    expect(parseHolidays({ error: true })).toEqual([]);
  });

  it("looks up the right Wikipedia article for each kind of destination", () => {
    expect(wikiQuery(getDestination("place:paris"), "")).toBe("Paris France");
    expect(wikiQuery(getDestination("gulf-coast"), "")).toBe("Gulf Shores, AL");
    expect(wikiQuery(getDestination("hometown"), "Austin, TX")).toBe("Austin");
    expect(wikiQuery(getDestination("custom", "Tulsa, OK"), "")).toBe("Tulsa, OK");
  });
});
