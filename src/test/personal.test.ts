import { describe, expect, it } from "vitest";

import { draftDates, matchDestination, missingFields, setupFromDraft } from "@/lib/assistant";
import type { TripDraft } from "@/lib/assistant";
import { bookingPlan, bookingProgress } from "@/lib/booking";
import { calculateBudget, defaultInputs, tripShape } from "@/lib/budget";
import { milesBetween, roadMiles } from "@/lib/catalog";
import { destinationFor, faresForDistance, getDestination } from "@/lib/demo-data";
import { addDays, todayIso } from "@/lib/dates";
import { labelFromReverse, parseVisitorGeo } from "@/lib/live/location";
import { recommendDestinations } from "@/lib/recommend";
import { buildTrip, migrate, sampleSetup, type TripSetup } from "@/lib/trip-store";

const CHICAGO = { lat: 41.8781, lon: -87.6298 };
const SEATTLE = { lat: 47.6062, lon: -122.3321 };
const HOUSTON = { lat: 29.7604, lon: -95.3698 };

describe("suggestions depend on where the traveler starts", () => {
  it("road trips from Chicago and Seattle get different, nearby places", () => {
    const chicago = recommendDestinations({
      from: CHICAGO,
      tripType: "road-trip",
      interests: ["nature"],
    });
    const seattle = recommendDestinations({
      from: SEATTLE,
      tripType: "road-trip",
      interests: ["nature"],
    });
    expect(chicago.length).toBeGreaterThan(2);
    expect(seattle.length).toBeGreaterThan(1);
    expect(chicago.map((s) => s.id)).not.toEqual(seattle.map((s) => s.id));
    for (const s of chicago) expect(s.miles!).toBeLessThan(560);
    expect(chicago[0]!.distanceLabel).toMatch(/drive$/);
  });

  it("fly-aways are far, cruises start at the closest ports, staycations stay home", () => {
    const fly = recommendDestinations({
      from: CHICAGO,
      tripType: "flight",
      interests: ["beaches"],
    });
    for (const s of fly) expect(s.miles!).toBeGreaterThan(350);
    const cruise = recommendDestinations({ from: HOUSTON, tripType: "cruise", interests: [] });
    expect(cruise[0]!.region).toMatch(/Galveston|New Orleans/);
    expect(recommendDestinations({ from: CHICAGO, tripType: "staycation", interests: [] })).toEqual(
      [],
    );
  });

  it("ranks by interests when the start isn't known, without distance labels", () => {
    const list = recommendDestinations({
      from: null,
      tripType: "road-trip",
      interests: ["arts", "nightlife"],
    });
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.matches.length).toBeGreaterThan(0);
    expect(list.every((s) => s.distanceLabel === null)).toBe(true);
  });

  it("never suggests home itself", () => {
    const list = recommendDestinations({
      from: { lat: 35.5951, lon: -82.5515 },
      tripType: "road-trip",
      interests: [],
    });
    expect(list.some((s) => s.id === "blue-ridge")).toBe(false);
  });
});

describe("distances and fares follow the start", () => {
  it("measures real-world distances", () => {
    expect(Math.round(milesBetween(CHICAGO, SEATTLE))).toBeGreaterThan(1700);
    expect(Math.round(milesBetween(CHICAGO, SEATTLE))).toBeLessThan(1760);
    expect(roadMiles(CHICAGO, CHICAGO)).toBe(0);
  });

  it("works out drive miles and fares from the origin", () => {
    const near = destinationFor({
      destinationId: "place:door-county",
      customDestination: "",
      originPoint: CHICAGO,
    });
    const far = destinationFor({
      destinationId: "place:door-county",
      customDestination: "",
      originPoint: SEATTLE,
    });
    expect(near.roundTripMiles).toBeLessThan(far.roundTripMiles);
    expect(near.fares.flight).toBeLessThan(far.fares.flight);
    // Without an origin, the demo default stays.
    expect(
      destinationFor({ destinationId: "place:door-county", customDestination: "" }).roundTripMiles,
    ).toBe(getDestination("place:door-county").roundTripMiles);
    expect(faresForDistance(100).flight).toBeLessThan(faresForDistance(2000).flight);
  });

  it("catalog places are real towns with their own weather anchor", () => {
    const d = getDestination("place:smokies");
    expect(d.name).toBe("Great Smoky Mountains");
    expect(d.anchor?.name).toBe("Gatlinburg, TN");
    const c = getDestination("cruise:galveston-western");
    expect(c.port).toBe("Galveston, TX");
    expect(c.cruisePerNight).toBeDefined();
  });
});

describe("visitor location", () => {
  it("reads the approximate city Cloudflare provides", () => {
    const h = encodeURIComponent(
      JSON.stringify({ city: "Charlotte", regionCode: "NC", country: "US", lat: 35.2, lon: -80.8 }),
    );
    expect(parseVisitorGeo(h)).toMatchObject({ label: "Charlotte, NC", source: "approximate" });
    const abroad = encodeURIComponent(
      JSON.stringify({ city: "Toronto", regionCode: "ON", country: "CA", lat: 43.6, lon: -79.4 }),
    );
    expect(parseVisitorGeo(abroad)?.label).toBe("Toronto, CA");
    expect(parseVisitorGeo(null)).toBeNull();
    expect(parseVisitorGeo("not json")).toBeNull();
    expect(
      parseVisitorGeo(encodeURIComponent(JSON.stringify({ city: "", lat: 1, lon: 1 }))),
    ).toBeNull();
  });

  it("names a device position", () => {
    expect(
      labelFromReverse({ city: "Austin", principalSubdivisionCode: "US-TX", countryCode: "US" }),
    ).toBe("Austin, TX");
    expect(labelFromReverse({ locality: "Lyon", countryCode: "FR", countryName: "France" })).toBe(
      "Lyon, France",
    );
    expect(labelFromReverse({})).toBeNull();
  });
});

const today = todayIso();
const draft = (patch: Partial<TripDraft>): TripDraft => ({
  destination: null,
  origin: null,
  startDate: null,
  endDate: null,
  nights: null,
  travelers: null,
  tripType: null,
  transportMode: null,
  style: null,
  totalBudget: null,
  interests: [],
  covered: { lodging: false, meals: false, activities: false, localTransport: false },
  transferCost: null,
  cities: [],
  cabin: null,
  stops: null,
  ...patch,
});

describe("assistant drafts become trips", () => {
  it("knows what's still missing", () => {
    expect(missingFields(null, today)).toEqual(["destination", "dates", "travelers"]);
    const start = addDays(today, 20);
    expect(
      missingFields(
        draft({ destination: "Austin, TX", startDate: start, nights: 3, travelers: 2 }),
        today,
      ),
    ).toEqual([]);
    // Past dates don't count.
    expect(
      missingFields(
        draft({ destination: "Austin, TX", startDate: "2020-01-01", nights: 3, travelers: 2 }),
        today,
      ),
    ).toContain("dates");
  });

  it("works out end dates from nights and keeps long trips whole (up to a year)", () => {
    const start = addDays(today, 10);
    expect(draftDates(draft({ startDate: start, nights: 3 }), today)).toEqual({
      startDate: start,
      endDate: addDays(start, 3),
    });
    expect(
      draftDates(draft({ startDate: start, endDate: addDays(start, 40) }), today)!.endDate,
    ).toBe(addDays(start, 40));
    expect(
      draftDates(draft({ startDate: start, endDate: addDays(start, 900) }), today)!.endDate,
    ).toBe(addDays(start, 364));
    expect(draftDates(draft({ startDate: start, endDate: addDays(start, -1) }), today)).toBeNull();
  });

  it("matches named places to suggestions, else uses them as typed", () => {
    expect(matchDestination("Austin, TX", "road-trip")).toBe("place:austin");
    expect(matchDestination("Asheville, NC", "road-trip")).toBe("blue-ridge");
    expect(matchDestination("Galveston, TX", "cruise")).toBe("cruise:galveston-western");
    expect(matchDestination("Tulsa, OK", "road-trip")).toBeNull();
  });

  it("builds a complete setup, with a suggested budget when none was given", () => {
    const base = { ...sampleSetup(), originPoint: CHICAGO } as TripSetup;
    const start = addDays(today, 30);
    const s = setupFromDraft(
      draft({
        destination: "Tulsa, OK",
        startDate: start,
        nights: 2,
        travelers: 3,
        tripType: "flight",
        interests: ["food"],
      }),
      base,
      today,
    );
    expect(s.destinationId).toBe("custom");
    expect(s.customDestination).toBe("Tulsa, OK");
    expect(s.tripType).toBe("flight");
    expect(s.transportMode).toBe("flight");
    expect(s.endDate).toBe(addDays(start, 2));
    expect(s.travelers).toBe(3);
    expect(s.interests).toEqual(["food"]);
    expect(s.totalBudget).toBeGreaterThan(0);
    expect(s.emergencyFund).toBeLessThan(s.totalBudget);
    const withBudget = setupFromDraft(
      draft({
        destination: "Austin, TX",
        startDate: start,
        nights: 2,
        travelers: 2,
        totalBudget: 1234,
      }),
      base,
      today,
    );
    expect(withBudget.totalBudget).toBe(1234);
    expect(withBudget.destinationId).toBe("place:austin");
  });
});

describe("booking checklist", () => {
  function planFor(patch: Partial<TripSetup>) {
    const start = addDays(today, 20);
    const trip = buildTrip({
      ...sampleSetup(),
      startDate: start,
      endDate: addDays(start, 3),
      ...patch,
    });
    const dest = destinationFor(trip.setup);
    const shape = tripShape(trip.setup.startDate, trip.setup.endDate, trip.setup.travelers);
    const totals = calculateBudget(trip.inputs, shape, trip.setup.totalBudget, trip.emergencyFund);
    return { trip, items: bookingPlan(trip, dest, shape, totals) };
  }

  it("asks each trip type for what it needs", () => {
    const road = planFor({ tripType: "road-trip", transportMode: "car" }).items.map((i) => i.key);
    expect(road).toContain("hotel");
    expect(road).not.toContain("flight");
    expect(
      planFor({ tripType: "road-trip", transportMode: "rental-car" }).items.map((i) => i.key),
    ).toContain("car");
    const fly = planFor({
      tripType: "flight",
      transportMode: "flight",
      destinationId: "red-rock",
    }).items.map((i) => i.key);
    expect(fly.slice(0, 2)).toEqual(["flight", "hotel"]);
    const cruise = planFor({
      tripType: "cruise",
      transportMode: "flight",
      destinationId: "caribbean-cruise",
    }).items.map((i) => i.key);
    expect(cruise).toEqual(expect.arrayContaining(["cruise", "flight", "pre-cruise-hotel"]));
    expect(cruise).not.toContain("hotel");
    const driveToShip = planFor({
      tripType: "cruise",
      transportMode: "car",
      destinationId: "caribbean-cruise",
    }).items.map((i) => i.key);
    expect(driveToShip).toContain("parking");
    const rail = planFor({ tripType: "rail", transportMode: "train" }).items.map((i) => i.key);
    expect(rail).toContain("rail");
  });

  it("fills provider searches with the trip's dates and group", () => {
    const { trip, items } = planFor({ tripType: "road-trip", transportMode: "car", travelers: 3 });
    const hotel = items.find((i) => i.key === "hotel")!;
    const booking = hotel.links.find((l) => l.label === "Booking.com")!.url;
    expect(booking).toContain(`checkin=${trip.setup.startDate}`);
    expect(booking).toContain(`checkout=${trip.setup.endDate}`);
    expect(booking).toContain("group_adults=3");
    for (const i of items) for (const l of i.links) expect(l.url.startsWith("https://")).toBe(true);
  });

  it("tracks progress and spending against the budget", () => {
    const { items } = planFor({ tripType: "road-trip", transportMode: "car" });
    const hotel = items.find((i) => i.key === "hotel")!;
    const p0 = bookingProgress(items, {});
    expect(p0.booked).toBe(0);
    expect(p0.next?.key).toBe(items[0]!.key);
    const p1 = bookingProgress(items, {
      hotel: { status: "booked", confirmation: "X1", price: hotel.budget - 50 },
    });
    expect(p1.booked).toBe(1);
    expect(p1.spent).toBeCloseTo(hotel.budget - 50);
    expect(p1.budgeted).toBeCloseTo(hotel.budget);
    const skipped = bookingProgress(items, {
      dining: { status: "skipped", confirmation: "", price: null },
    });
    expect(skipped.total).toBe(items.length - 1);
  });

  it("older saved trips get an empty checklist", () => {
    const { trip } = planFor({});
    const { bookings: _b, ...old } = { ...trip, version: 5 };
    const upgraded = migrate(JSON.parse(JSON.stringify(old)))!;
    expect(upgraded.version).toBe(7);
    expect(upgraded.bookings).toEqual({});
    // The budget defaults still work for the destination it suggests.
    expect(
      defaultInputs(getDestination("place:austin"), "comfort", "road-trip", 2).nightlyRate,
    ).toBeGreaterThan(0);
  });
});
