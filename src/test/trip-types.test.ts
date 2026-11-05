import { describe, expect, it } from "vitest";

import {
  calculateBudget,
  categoriesFor,
  defaultInputs,
  savingsOpportunities,
  tripShape,
} from "@/lib/budget";
import {
  DESTINATIONS,
  TRIP_TYPES,
  buildCustomDestination,
  getDestination,
  modeForTripType,
  upgradeTripType,
} from "@/lib/demo-data";
import { generateDemoItinerary } from "@/lib/itinerary";
import { buildTrip, destinationForTripType, migrate, sampleSetup } from "@/lib/trip-store";

const shape = tripShape("2026-12-01", "2026-12-05", 2); // 5 days, 4 nights

describe("trip types are separate categories", () => {
  it("each type has its own transport options", () => {
    expect(TRIP_TYPES.map((t) => t.id)).toEqual([
      "road-trip",
      "flight",
      "cruise",
      "rail",
      "staycation",
    ]);
    expect(modeForTripType("flight", "car")).toBe("flight");
    expect(modeForTripType("road-trip", "flight")).toBe("car");
    expect(modeForTripType("road-trip", "rental-car")).toBe("rental-car");
    expect(modeForTripType("rail", "car")).toBe("train");
    expect(modeForTripType("cruise", "flight")).toBe("flight");
  });

  it("shows only the budget categories that apply", () => {
    expect(categoriesFor("road-trip", "car")).toContain("stops");
    expect(categoriesFor("road-trip", "car")).not.toContain("cruise");
    expect(categoriesFor("flight", "flight")).not.toContain("gas");
    expect(categoriesFor("flight", "flight")).not.toContain("stops");
    expect(categoriesFor("cruise", "flight")).toContain("cruise");
    expect(categoriesFor("cruise", "car")).toEqual(
      expect.arrayContaining(["cruise", "gas", "parking"]),
    );
    expect(categoriesFor("rail", "train")).not.toContain("tolls");
    expect(categoriesFor("cruise", "flight")).not.toContain("parking");
  });

  it("every destination fits at least one trip type, and cruises are cruise-only", () => {
    for (const d of DESTINATIONS) expect(d.bestFor.length).toBeGreaterThan(0);
    expect(getDestination("caribbean-cruise").bestFor).toEqual(["cruise"]);
    expect(buildCustomDestination("Galveston, TX").bestFor).toContain("cruise");
  });
});

describe("cruise budget", () => {
  const dest = getDestination("caribbean-cruise");
  const inputs = defaultInputs(dest, "comfort", "cruise", 2, "flight");

  it("replaces hotel nights with the cruise fare, gratuities and port fees", () => {
    const t = calculateBudget(inputs, shape, 5000, 500);
    expect(t.categories.accommodations).toBe(0);
    // (140 fare + 18 tips) × 2 people × 4 nights + 150 port fees × 2
    expect(t.categories.cruise).toBe(158 * 2 * 4 + 300);
    expect(t.categories.gas).toBe(0);
    expect(t.categories.transportation).toBe(280 * 2 + 10 * 5);
  });

  it("is excluded from taxes (port fees already include them)", () => {
    const t = calculateBudget(inputs, shape, 5000, 500);
    const taxable = t.categories.food + t.categories.snacks + t.categories.activities;
    expect(t.categories.taxes).toBeCloseTo((taxable * inputs.taxRatePct) / 100, 1);
  });

  it("offers an inside-cabin saving that lowers the cruise fare", () => {
    const tips = savingsOpportunities(inputs, shape, {}, 0, dest);
    const cabin = tips.find((t) => t.id === "cabin");
    expect(cabin?.category).toBe("cruise");
    expect(cabin!.amount).toBeCloseTo(140 * 0.25 * 2 * 4, 1);
  });

  it("is zero for every other trip type", () => {
    const road = defaultInputs(DESTINATIONS[0]!, "comfort", "road-trip", 2, "car");
    expect(calculateBudget(road, shape, 0, 0).categories.cruise).toBe(0);
  });

  it("starts the itinerary by boarding the ship", () => {
    const itin = generateDemoItinerary({
      dest,
      days: 5,
      startDate: "2026-12-01",
      interests: [],
      style: "comfort",
      tripType: "cruise",
    });
    expect(itin.days[0]!.title).toBe("Embarkation day");
    expect(itin.days[0]!.items[0]!.name).toBe("Board the ship");
    expect(itin.days[4]!.title).toBe("Disembark & head home");
  });
});

describe("switching trip type", () => {
  const setup = sampleSetup();

  it("keeps a destination that fits and explains when it has to change", () => {
    expect(destinationForTripType(setup, "flight")).toEqual({
      destinationId: "blue-ridge",
      reason: "",
    });
    const cruise = destinationForTripType(setup, "cruise");
    expect(cruise.destinationId).toBe("caribbean-cruise");
    expect(cruise.reason).toMatch(/isn't a cruise destination/);
    expect(destinationForTripType(setup, "staycation").destinationId).toBe("hometown");
    expect(destinationForTripType({ ...setup, destinationId: "custom" }, "cruise")).toEqual({
      destinationId: "custom",
      reason: "",
    });
  });

  it("never builds a trip with a transport mode its type doesn't allow", () => {
    const t = buildTrip({ ...setup, tripType: "flight", transportMode: "car" });
    expect(t.setup.transportMode).toBe("flight");
    expect(t.inputs.transportMode).toBe("flight");
  });
});

describe("upgrading saved trips", () => {
  it("maps the old Getaway type by how the trip travels", () => {
    expect(upgradeTripType("budget-vacation", "flight")).toBe("flight");
    expect(upgradeTripType("budget-vacation", "train")).toBe("rail");
    expect(upgradeTripType("budget-vacation", "car")).toBe("road-trip");
    expect(upgradeTripType("road-trip", "flight")).toBe("flight");
    expect(upgradeTripType("staycation", "car")).toBe("staycation");
  });

  it("migrates a v3 trip to the current version with the new cruise inputs zeroed", () => {
    const v4 = buildTrip({ ...sampleSetup(), transportMode: "flight", tripType: "flight" });
    const {
      cruisePerNight: _a,
      portFeesPerPerson: _b,
      gratuitiesPerNight: _c,
      ...oldInputs
    } = v4.inputs;
    const v3 = {
      ...v4,
      version: 3,
      setup: { ...v4.setup, tripType: "budget-vacation" },
      inputs: oldInputs,
    };
    const out = migrate(JSON.parse(JSON.stringify(v3)))!;
    expect(out.version).toBe(7);
    expect(out.id).toBeTruthy();
    expect(out.setup.tripType).toBe("flight");
    expect(out.inputs.cruisePerNight).toBe(0);
    expect(calculateBudget(out.inputs, shape, 0, 0).categories.cruise).toBe(0);
  });
});
