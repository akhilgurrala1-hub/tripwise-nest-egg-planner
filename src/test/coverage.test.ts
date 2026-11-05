import { describe, expect, it } from "vitest";

import { cleanChatAnswer } from "@/lib/ai-quality";
import { coverageFromDraft, setupFromDraft, type TripDraft } from "@/lib/assistant";
import {
  applyCoverage,
  calculateBudget,
  coveredLabels,
  defaultInputs,
  transportParts,
  tripShape,
} from "@/lib/budget";
import { addDays, todayIso } from "@/lib/dates";
import { bookingPlan } from "@/lib/booking";
import { DESTINATIONS, destinationFor } from "@/lib/demo-data";
import { fitToCoverage, generateDemoItinerary } from "@/lib/itinerary";
import {
  buildTrip,
  currentTrip,
  sampleSetup,
  suggestedBudget,
  tripActions,
  type TripSetup,
} from "@/lib/trip-store";

const today = todayIso();
const start = addDays(today, 20);

/** "Plan my trip to Phoenix. I live there, I just need the flight and a ride from my dorm to the airport." */
const GOING_HOME: TripDraft = {
  destination: "Phoenix, AZ",
  origin: "Berkeley, CA",
  startDate: start,
  endDate: addDays(start, 4),
  nights: 4,
  travelers: 1,
  tripType: "flight",
  transportMode: "flight",
  style: "budget",
  totalBudget: null,
  interests: [],
  covered: { lodging: true, meals: true, activities: true, localTransport: true },
  transferCost: 45,
  cities: [],
  cabin: null,
  stops: null,
};

describe("only the costs a traveler actually has", () => {
  it("drops covered costs and adds the trip to the airport", () => {
    const dest = DESTINATIONS[0]!;
    const base = defaultInputs(dest, "comfort", "flight", 1, "flight");
    const inputs = applyCoverage(base, {
      lodging: true,
      meals: true,
      activities: true,
      localTransport: true,
      transfer: 45,
    });
    const t = calculateBudget(inputs, tripShape(start, addDays(start, 4), 1), 2000, 0);
    const c = t.categories;
    expect([c.accommodations, c.food, c.snacks, c.water, c.activities, c.taxes, c.parking]).toEqual(
      [0, 0, 0, 0, 0, 0, 0],
    );
    expect(c.transportation).toBe(base.farePerPerson + 45);
    // Everything planned is the fare, the airport rides and the small cushion on them.
    expect(t.planned).toBeCloseTo(c.transportation + c.misc, 2);
    expect(c.misc).toBeCloseTo(c.transportation * 0.05, 2);
  });

  it("leaves a trip unchanged when nothing is covered", () => {
    const base = defaultInputs(DESTINATIONS[0]!, "comfort", "road-trip", 2, "car");
    expect(applyCoverage(base, null)).toBe(base);
    expect(applyCoverage(base, {})).toEqual(base);
  });

  it("says what was left out in plain words", () => {
    expect(coveredLabels({ lodging: true, meals: true, transfer: 40 })).toEqual([
      "a place to stay",
      "meals",
    ]);
    expect(coveredLabels(null)).toEqual([]);
  });
});

describe("the assistant works out what to count", () => {
  it("turns 'I live there, just the flight and a ride to the airport' into a flight-only budget", () => {
    const setup = setupFromDraft(GOING_HOME, sampleSetup(), today);
    expect(setup.coverage).toEqual({
      lodging: true,
      meals: true,
      activities: true,
      localTransport: true,
      transfer: 45,
    });
    const trip = buildTrip(setup);
    const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
    const t = calculateBudget(trip.inputs, shape, setup.totalBudget, setup.emergencyFund);
    expect(t.categories.accommodations).toBe(0);
    expect(t.categories.food).toBe(0);
    expect(t.categories.transportation).toBe(trip.inputs.farePerPerson + 45);
    // The suggested budget is just enough for that (plus the usual reserve), not a hotel stay.
    const full = suggestedBudget({ ...setup, coverage: null });
    expect(setup.totalBudget).toBeLessThan(full / 2);
    expect(setup.totalBudget).toBeGreaterThanOrEqual(t.planned);
  });

  it("only adds an airport trip when the traveler flies or takes a train or bus", () => {
    expect(
      coverageFromDraft({ ...GOING_HOME, tripType: "road-trip", transportMode: "car" }),
    ).toEqual({ lodging: true, meals: true, activities: true, localTransport: true });
    expect(
      coverageFromDraft({
        ...GOING_HOME,
        covered: { lodging: false, meals: false, activities: false, localTransport: false },
        transferCost: null,
      }),
    ).toBeNull();
  });

  it("keeps the assistant's estimates sane", () => {
    const answer = cleanChatAnswer({
      reply: "Got it.",
      ready: true,
      questions: [],
      ideas: [],
      trip: { ...GOING_HOME, transferCost: 9000 },
    });
    expect(answer.trip.transferCost).toBe(500);
    const old = cleanChatAnswer({
      reply: "Hi",
      ready: false,
      questions: [],
      ideas: [],
      // A conversation saved before these fields existed.
      trip: { ...GOING_HOME, covered: undefined, transferCost: undefined } as unknown as TripDraft,
    });
    expect(old.trip.covered).toEqual({
      lodging: false,
      meals: false,
      activities: false,
      localTransport: false,
    });
    expect(old.trip.transferCost).toBeNull();
  });
});

describe("plans respect what's covered", () => {
  const setup: TripSetup = { ...sampleSetup(), coverage: { meals: true, activities: true } };

  it("puts meals at home and drops paid sights from the example plan", () => {
    const items = buildTrip(setup).itinerary!.days.flatMap((d) => d.items);
    const meals = items.filter((i) => i.kind === "restaurant");
    expect(meals.length).toBeGreaterThan(0);
    expect(meals.every((i) => i.name === "Meal at home" && i.costPerPerson === 0)).toBe(true);
    expect(items.filter((i) => i.kind === "sight").every((i) => i.costPerPerson === 0)).toBe(true);
  });

  it("never touches the traveler's own stops", () => {
    const plan = generateDemoItinerary({
      dest: DESTINATIONS[0]!,
      days: 2,
      startDate: start,
      interests: [],
      style: "comfort",
      tripType: "road-trip",
    });
    const mine = {
      ...plan.days[0]!.items[1]!,
      kind: "restaurant" as const,
      custom: true,
      costPerPerson: 30,
    };
    plan.days[0]!.items[1] = mine;
    expect(fitToCoverage(plan, { meals: true }).days[0]!.items[1]).toEqual(mine);
  });
});

describe("booking only lists what's needed", () => {
  it("asks for the flight and the ride to the airport, not a hotel or dinner reservations", () => {
    const setup = {
      ...setupFromDraft(GOING_HOME, sampleSetup(), today),
      style: "comfort" as const,
    };
    const trip = buildTrip(setup);
    const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
    const totals = calculateBudget(trip.inputs, shape, setup.totalBudget, setup.emergencyFund);
    const keys = bookingPlan(trip, destinationFor(setup), shape, totals).map((i) => i.key);
    expect(keys).toContain("flight");
    expect(keys).toContain("transfer");
    expect(keys).not.toContain("hotel");
    expect(keys).not.toContain("dining");
    expect(keys).not.toContain("tickets");
  });
});

describe("what Transportation is made of", () => {
  it("names each part and adds up to the total", () => {
    const base = defaultInputs(DESTINATIONS[0]!, "comfort", "flight", 2, "flight");
    const inputs = applyCoverage(base, { localTransport: true, transfer: 45 });
    const shape = tripShape(start, addDays(start, 3), 2);
    const parts = transportParts(inputs, shape);
    expect(parts.map((p) => p.label)).toEqual(["Flights", "Ride to the airport"]);
    expect(parts[0]!.detail).toBe(`$${inputs.farePerPerson} × 2 round trips`);
    const total = calculateBudget(inputs, shape, 5000, 0).categories.transportation;
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(total, 2);
  });

  it("lists a rental and rides at the destination when there are some", () => {
    const inputs = defaultInputs(DESTINATIONS[0]!, "comfort", "road-trip", 1, "rental-car");
    const shape = tripShape(start, addDays(start, 1), 1);
    const labels = transportParts({ ...inputs, localTransitPerDay: 10 }, shape).map((p) => p.label);
    expect(labels).toEqual(["Rental car", "Getting around there"]);
  });
});

describe("live prices respect what's covered", () => {
  it("never adds a hotel price when the traveler has a place to stay", () => {
    tripActions.startTrip(setupFromDraft(GOING_HOME, sampleSetup(), today));
    tripActions.applyLivePrices({
      fetchedAt: new Date().toISOString(),
      gas: null,
      hotels: { nightly: 180 },
      flights: { perPerson: 212 },
    } as never);
    const t = currentTrip();
    expect(t.inputs.nightlyRate).toBe(0);
    expect(t.inputs.farePerPerson).toBe(212);
  });
});
