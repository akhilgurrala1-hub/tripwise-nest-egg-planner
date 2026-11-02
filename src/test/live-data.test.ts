import { describe, expect, it } from "vitest";

import { safeRedirect } from "@/lib/auth-context";
import { defaultInputs } from "@/lib/budget";
import { DESTINATIONS, buildCustomDestination, getDestination } from "@/lib/demo-data";
import { parseGeocode, splitQuery } from "@/lib/live/geocode";
import { destinationQuery } from "@/lib/live/place";
import { categorySource, liveCategories } from "@/lib/live/sources";
import { weatherPlaceText } from "@/lib/live/use-live";
import {
  describeCode,
  isWetDay,
  lastYear,
  parseDaily,
  planWeather,
  summarize,
} from "@/lib/live/weather";
import type { LivePrices } from "@/lib/prices/live";

describe("geocoding", () => {
  const body = {
    results: [
      {
        name: "Springfield",
        latitude: 39.8,
        longitude: -89.64,
        country: "United States",
        country_code: "US",
        admin1: "Illinois",
        timezone: "America/Chicago",
      },
      {
        name: "Springfield",
        latitude: 37.2,
        longitude: -93.29,
        country: "United States",
        country_code: "US",
        admin1: "Missouri",
        timezone: "America/Chicago",
      },
      {
        name: "Lisbon",
        latitude: 38.72,
        longitude: -9.14,
        country: "Portugal",
        country_code: "PT",
        admin1: "Lisbon",
      },
      { name: "Broken" },
    ],
  };

  it("splits a 'City, ST' query", () => {
    expect(splitQuery("Springfield, MO")).toEqual({ name: "Springfield", qualifier: "mo" });
    expect(splitQuery("Lisbon")).toEqual({ name: "Lisbon", qualifier: "" });
  });

  it("labels U.S. places with state codes and others with the country, dropping bad rows", () => {
    const all = parseGeocode(body);
    expect(all.map((p) => p.label)).toEqual([
      "Springfield, IL",
      "Springfield, MO",
      "Lisbon, Portugal",
    ]);
  });

  it("prefers results in the state the traveler typed", () => {
    expect(parseGeocode(body, "mo")[0]!.label).toBe("Springfield, MO");
    expect(parseGeocode(body, "missouri")[0]!.label).toBe("Springfield, MO");
    // An unmatched qualifier falls back to every result instead of nothing.
    expect(parseGeocode(body, "zz")).toHaveLength(3);
  });

  it("handles an empty response", () => {
    expect(parseGeocode({})).toEqual([]);
    expect(parseGeocode(null)).toEqual([]);
  });
});

describe("weather", () => {
  it("maps WMO codes", () => {
    expect(describeCode(0).kind).toBe("clear");
    expect(describeCode(63).kind).toBe("rain");
    expect(describeCode(81).label).toBe("Showers");
    expect(describeCode(75).kind).toBe("snow");
    expect(describeCode(96).kind).toBe("storm");
  });

  it("uses the live forecast inside 16 days and last year's weather after that", () => {
    expect(planWeather("2026-11-05", "2026-11-08", "2026-11-02")).toEqual({
      forecast: { start: "2026-11-05", end: "2026-11-08" },
      typical: null,
    });
    expect(planWeather("2026-11-15", "2026-11-20", "2026-11-02")).toEqual({
      forecast: { start: "2026-11-15", end: "2026-11-17" },
      typical: { start: "2026-11-18", end: "2026-11-20" },
    });
    expect(planWeather("2026-12-20", "2026-12-23", "2026-11-02")).toEqual({
      forecast: null,
      typical: { start: "2026-12-20", end: "2026-12-23" },
    });
  });

  it("skips days that already happened and invalid ranges", () => {
    expect(planWeather("2026-10-30", "2026-11-03", "2026-11-02").forecast).toEqual({
      start: "2026-11-02",
      end: "2026-11-03",
    });
    expect(planWeather("2026-10-01", "2026-10-03", "2026-11-02")).toEqual({
      forecast: null,
      typical: null,
    });
    expect(planWeather("2026-11-05", "2026-11-01", "2026-11-02")).toEqual({
      forecast: null,
      typical: null,
    });
  });

  it("maps leap days to Feb 28 last year", () => {
    expect(lastYear("2028-02-29")).toBe("2027-02-28");
    expect(lastYear("2026-07-04")).toBe("2025-07-04");
  });

  it("parses forecast days and shifts last year's dates onto the trip", () => {
    const forecast = parseDaily(
      {
        daily: {
          time: ["2026-11-05", "2026-11-06"],
          weather_code: [61, 1],
          temperature_2m_max: [58.4, 64.6],
          temperature_2m_min: [44.1, 41.9],
          precipitation_probability_max: [80, 5],
          precipitation_sum: [0.41, 0],
          sunrise: ["2026-11-05T06:58", "2026-11-06T06:59"],
          sunset: ["2026-11-05T17:31", "2026-11-06T17:30"],
        },
      },
      "forecast",
    );
    expect(forecast[0]).toMatchObject({
      date: "2026-11-05",
      kind: "rain",
      highF: 58,
      lowF: 44,
      precipChance: 80,
    });
    expect(isWetDay(forecast[0]!)).toBe(true);
    expect(isWetDay(forecast[1]!)).toBe(false);

    const typical = parseDaily(
      {
        daily: {
          time: ["2025-12-20"],
          weather_code: [3],
          temperature_2m_max: [50],
          temperature_2m_min: [33],
          precipitation_sum: [0.3],
        },
      },
      "typical",
      1,
    );
    expect(typical[0]).toMatchObject({
      date: "2026-12-20",
      source: "typical",
      precipChance: null,
      sunset: null,
    });
    expect(isWetDay(typical[0]!)).toBe(true);
    expect(summarize([...forecast, ...typical])).toBe("Highs 50–65°F · wet weather on 2 of 3 days");
  });

  it("skips days with missing values instead of showing zeros", () => {
    const days = parseDaily(
      {
        daily: {
          time: ["2026-11-05"],
          weather_code: [null],
          temperature_2m_max: [null],
          temperature_2m_min: [null],
        },
      },
      "forecast",
    );
    expect(days).toEqual([]);
  });
});

describe("real places for searches", () => {
  const hometown = getDestination("hometown");
  it("searches home for a staycation and never sends generic labels", () => {
    expect(destinationQuery(hometown, "Austin, TX")).toBe("Austin, TX");
    expect(destinationQuery(hometown, "", "Denver, CO")).toBe("Denver, CO");
    expect(destinationQuery(buildCustomDestination("Chattanooga, TN"))).toBe("Chattanooga, TN");
    expect(destinationQuery(DESTINATIONS[0]!)).toBe("Blue Ridge Mountains, North Carolina");
  });

  it("uses each demo area's real anchor town for weather", () => {
    expect(weatherPlaceText(DESTINATIONS[0]!, "")).toBe("Asheville, NC");
    expect(weatherPlaceText(hometown, "Austin, TX")).toBe("Austin, TX");
    expect(weatherPlaceText(hometown, "")).toBe("");
  });

  it("does not let a custom destination inherit the template's anchor town", () => {
    expect(buildCustomDestination("Lisbon").anchor).toBeUndefined();
  });
});

describe("price sources", () => {
  const dest = DESTINATIONS[0]!;
  const inputs = {
    ...defaultInputs(dest, "comfort", "road-trip", 2, "car"),
    gasPrice: 3.11,
    nightlyRate: 142,
  };
  const live: LivePrices = {
    fetchedAt: "2026-11-02T12:00:00Z",
    gas: { price: 3.11, areaLabel: "Lower Atlantic", period: "2026-10-27" },
    hotels: {
      checkIn: "2026-11-05",
      checkOut: "2026-11-08",
      nightly: 142,
      pickLabel: "",
      options: [],
      searchUrl: "",
    },
    flights: null,
    notes: [],
  };

  it("marks categories live while they still use the fetched price", () => {
    expect(liveCategories(inputs, {}, live)).toEqual(["gas", "accommodations"]);
    expect(categorySource("food", inputs, {}, live)).toBe("estimate");
  });

  it("stops calling a price live once it's edited or overridden", () => {
    expect(categorySource("gas", { ...inputs, gasPrice: 3.5 }, {}, live)).toBe("estimate");
    expect(categorySource("accommodations", inputs, { accommodations: 300 }, live)).toBe("custom");
    expect(liveCategories(inputs, {}, null)).toEqual([]);
  });
});

describe("separate trip types", () => {
  it("searches a cruise's port of call, not its departure label", async () => {
    const { getDestination: get } = await import("@/lib/demo-data");
    expect(destinationQuery(get("caribbean-cruise"))).toBe("Nassau, Bahamas");
  });
});

describe("sign-in redirects", () => {
  it("allows same-site paths only", () => {
    expect(safeRedirect("/itinerary")).toBe("/itinerary");
    expect(safeRedirect("/trips?x=1")).toBe("/trips?x=1");
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/\\\\evil.com",
      "https://evil.com",
      "evil.com",
      "/a\nb",
      42,
      undefined,
    ])
      expect(safeRedirect(bad)).toBeUndefined();
  });
});
