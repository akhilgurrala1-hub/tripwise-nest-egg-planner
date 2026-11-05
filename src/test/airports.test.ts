import { describe, expect, it } from "vitest";

import rows from "@/data/airports.json";
import {
  airportByCode,
  airportFor,
  airportsNear,
  toAirport,
  type AirportRow,
} from "@/lib/airports";

const airports = (rows as unknown as AirportRow[]).map(toAirport);
const at = (lat: number, lon: number) => ({ lat, lon });

describe("finding the airport for a place", () => {
  it("has the world's airports with scheduled flights", () => {
    expect(airports.length).toBeGreaterThan(3000);
    for (const code of ["ORD", "PHX", "FCO", "KEF", "NRT", "LHR", "CDG", "SYD", "GRU", "JNB"])
      expect(airportByCode(airports, code)?.code).toBe(code);
  });

  it("picks the big airport a traveler would actually use", () => {
    expect(airportFor(airports, at(33.4255, -111.94))?.code).toBe("PHX"); // Tempe
    expect(airportFor(airports, at(41.9, 12.5))?.code).toMatch(/FCO|CIA/); // Rome
    expect(airportFor(airports, at(64.15, -21.94))?.code).toBe("KEF"); // Reykjavik, not the domestic field
    expect(airportFor(airports, at(40.71, -74.0))?.code).toMatch(/JFK|LGA|EWR/); // New York
  });

  it("uses a regional airport when the hub is far", () => {
    // Asheville, NC: its own airport, not Charlotte two hours away.
    expect(airportFor(airports, at(35.5951, -82.5515))?.code).toBe("AVL");
  });

  it("lists a few options, nearest first among equals", () => {
    const near = airportsNear(airports, at(41.88, -87.63), 3);
    expect(near.map((a) => a.code)).toEqual(expect.arrayContaining(["ORD", "MDW"]));
    expect(near.every((a) => a.miles < 60)).toBe(true);
  });

  it("finds nothing in the middle of the ocean rather than something far away", () => {
    expect(airportFor(airports, at(-40, -140))).toBeNull();
    expect(airportFor(airports, null)).toBeNull();
  });

  it("reads codes in any case and ignores junk", () => {
    expect(airportByCode(airports, " ord ")?.city).toBe("Chicago");
    expect(airportByCode(airports, "XXXX")).toBeNull();
  });

  it("never uses em dashes in names", () => {
    expect(airports.some((a) => /[–—]/.test(a.name + a.city))).toBe(false);
  });
});

describe("airports in booking searches", () => {
  it("names the airports and searches by code", async () => {
    const { bookingPlan } = await import("@/lib/booking");
    const { calculateBudget, tripShape } = await import("@/lib/budget");
    const { destinationFor } = await import("@/lib/demo-data");
    const { buildTrip, sampleSetup } = await import("@/lib/trip-store");
    const setup = {
      ...sampleSetup(),
      tripType: "flight" as const,
      transportMode: "flight" as const,
      origin: "Chicago, IL",
    };
    const trip = buildTrip(setup);
    const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
    const totals = calculateBudget(trip.inputs, shape, setup.totalBudget, setup.emergencyFund);
    const flight = bookingPlan(trip, destinationFor(setup), shape, totals, "", ["ORD", "AVL"]).find(
      (i) => i.key === "flight",
    )!;
    expect(flight.title).toMatch(/Chicago \(ORD\) → .* \(AVL\)/);
    expect(decodeURIComponent(flight.links[0]!.url)).toMatch(/Flights to AVL from ORD/);
  });
});

describe("airports by city name", () => {
  it("finds the airport when only the name is known", async () => {
    const { airportByName } = await import("@/lib/airports");
    expect(airportByName(airports, "Charlotte, NC")?.code).toBe("CLT");
    expect(airportByName(airports, "Chicago, IL")?.large).toBe(true);
    expect(airportByName(airports, "Portland, OR")?.code).toBe("PDX");
    expect(airportByName(airports, "Reykjavík, Iceland")?.code).toMatch(/KEF|RKV/);
    expect(airportByName(airports, "PHX")?.code).toBe("PHX");
    expect(airportByName(airports, "Nowhereville, ZZ")).toBeNull();
  });
});

describe("airports by name, with states", () => {
  it("tells Portland, OR from Portland, ME", async () => {
    const { airportByName } = await import("@/lib/airports");
    expect(airportByName(airports, "Portland, OR")?.code).toBe("PDX");
    expect(airportByName(airports, "Portland, ME")?.code).toBe("PWM");
    expect(airportByName(airports, "Paris, France")?.code).toMatch(/CDG|ORY/);
  });
});

describe("a city's main airport", () => {
  it("flies Rome from Fiumicino and Chicago from O'Hare", () => {
    expect(airportFor(airports, at(41.9, 12.5))?.code).toBe("FCO");
    expect(airportFor(airports, at(41.88, -87.63))?.code).toBe("ORD");
    expect(airportFor(airports, at(51.51, -0.13))?.code).toBe("LHR");
  });
});
