import { beforeEach, describe, expect, it, vi } from "vitest";

// The AI SDK is replaced with a scripted model so no credits are spent.
const sdk = vi.hoisted(() => ({ answers: [] as unknown[], prompts: [] as string[] }));
vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  generateText: async (opts: { messages: { content: unknown }[] }) => {
    sdk.prompts.push(JSON.stringify(opts.messages));
    return { output: sdk.answers.shift() };
  },
}));

import { cleanChatAnswer } from "@/lib/ai-quality";
import { generateAiItinerary } from "@/lib/ai/itinerary-ai.server";
import { setupFromDraft, type TripDraft } from "@/lib/assistant";
import { calculateBudget, tripShape } from "@/lib/budget";
import { bookingPlan } from "@/lib/booking";
import { addDays, todayIso } from "@/lib/dates";
import { destinationFor } from "@/lib/demo-data";
import { citySchedule, routeLegMiles } from "@/lib/multi-city";
import {
  buildTrip,
  currentTrip,
  fitBudget,
  sampleSetup,
  tripActions,
  tripLegs,
  type TripSetup,
} from "@/lib/trip-store";

const today = todayIso();
const start = addDays(today, 45);
const CHICAGO = { lat: 41.88, lon: -87.63 };

const draft = (patch: Partial<TripDraft>): TripDraft => ({
  destination: null,
  origin: "Chicago, IL",
  startDate: start,
  endDate: null,
  nights: null,
  travelers: 2,
  tripType: "flight",
  transportMode: "flight",
  style: null,
  totalBudget: null,
  interests: [],
  covered: { lodging: false, meals: false, activities: false, localTransport: false },
  transferCost: null,
  cities: [],
  cabin: null,
  ...patch,
});
const base = (): TripSetup => ({ ...sampleSetup(), origin: "Chicago, IL", originPoint: CHICAGO });

/** What the assistant's answer becomes, end to end, after the places are found. */
function plan(d: TripDraft, points: Record<string, { lat: number; lon: number }> = {}) {
  const answer = cleanChatAnswer({ reply: "Ok", ready: true, questions: [], ideas: [], trip: d });
  const setup = setupFromDraft(answer.trip, base(), today);
  const located: TripSetup = {
    ...setup,
    destinationPoint: points[setup.customDestination] ?? setup.destinationPoint ?? null,
    cities: (setup.cities ?? []).map((c) => ({ ...c, point: points[c.name] ?? null })),
  };
  const note = tripActions.startTrip(located);
  const trip = currentTrip();
  const shape = tripShape(trip.setup.startDate, trip.setup.endDate, trip.setup.travelers);
  const totals = calculateBudget(
    trip.inputs,
    shape,
    trip.setup.totalBudget,
    trip.emergencyFund,
    trip.overrides,
  );
  return { setup: trip.setup, trip, totals, shape, note };
}

const ITALY = {
  "Rome, Italy": { lat: 41.9, lon: 12.5 },
  "Florence, Italy": { lat: 43.77, lon: 11.25 },
  "Venice, Italy": { lat: 45.44, lon: 12.32 },
};

describe("a trip never starts over budget", () => {
  it("fits the budget after the destination is found (the Reykjavik case)", () => {
    const { totals, setup, note } = plan(draft({ destination: "Reykjavik, Iceland", nights: 6 }), {
      "Reykjavik, Iceland": { lat: 64.15, lon: -21.94 },
    });
    expect(totals.remaining).toBeGreaterThanOrEqual(0);
    expect(setup.budgetAuto).toBe(true);
    expect(note).toBeNull();
  });

  it("keeps a budget the traveler gave when it covers the trip", () => {
    const { setup, note, totals } = plan(
      draft({ destination: "Milwaukee, WI", nights: 2, totalBudget: 6000 }),
    );
    expect(setup.totalBudget).toBe(6000);
    expect(setup.budgetAuto).toBe(false);
    expect(note).toBeNull();
    expect(totals.remaining).toBeGreaterThan(0);
  });

  it("raises a budget that's too small, and says so", () => {
    const { setup, note, totals } = plan(
      draft({ destination: "Lisbon, Portugal", nights: 6, totalBudget: 400 }),
    );
    expect(totals.remaining).toBeGreaterThanOrEqual(0);
    expect(setup.totalBudget).toBeGreaterThan(400);
    expect(note).toMatch(/\$400 doesn't cover this trip/);
  });

  it("follows the trip when the budget was Waypoint's: switching travel re-fits it", () => {
    plan(draft({ destination: "Denver, CO", nights: 3 }));
    tripActions.setTransportMode("car");
    let t = currentTrip();
    const shape = tripShape(t.setup.startDate, t.setup.endDate, t.setup.travelers);
    expect(
      calculateBudget(t.inputs, shape, t.setup.totalBudget, t.emergencyFund).remaining,
    ).toBeGreaterThanOrEqual(0);
    // Once the traveler types their own number, Waypoint leaves it alone.
    tripActions.setTotalBudget(900);
    tripActions.setCabin("business");
    t = currentTrip();
    expect(t.setup.totalBudget).toBe(900);
    expect(t.setup.budgetAuto).toBe(false);
  });

  it("a live price that costs more raises a Waypoint budget instead of going negative", () => {
    plan(draft({ destination: "Austin, TX", nights: 3 }));
    tripActions.applyLivePrices({
      fetchedAt: new Date().toISOString(),
      gas: null,
      hotels: null,
      flights: { perPerson: 2400 },
      notes: [],
    } as never);
    const t = currentTrip();
    const shape = tripShape(t.setup.startDate, t.setup.endDate, t.setup.travelers);
    expect(
      calculateBudget(t.inputs, shape, t.setup.totalBudget, t.emergencyFund).remaining,
    ).toBeGreaterThanOrEqual(0);
  });

  it("fitBudget keeps a reserve the traveler chose", () => {
    const s = { ...base(), budgetAuto: true, emergencyFund: 777, totalBudget: 2000 };
    expect(fitBudget(s).setup.emergencyFund).toBe(777);
  });
});

describe("multi-city trips", () => {
  const ROME_FLORENCE_VENICE = draft({
    destination: "Rome, Italy",
    nights: 7,
    cities: [
      { name: "Rome, Italy", nights: 3 },
      { name: "Florence, Italy", nights: 2 },
      { name: "Venice, Italy", nights: 2 },
    ],
  });

  it("keeps every city the traveler named, in order, with its nights", () => {
    const { setup } = plan(ROME_FLORENCE_VENICE, ITALY);
    expect(setup.cities?.map((c) => [c.name, c.nights])).toEqual([
      ["Florence, Italy", 2],
      ["Venice, Italy", 2],
    ]);
    expect(tripLegs(setup).map((l) => [l.name.split(",")[0], l.nights, l.arriveDay])).toEqual([
      ["Rome", 3, 0],
      ["Florence", 2, 3],
      ["Venice", 2, 5],
    ]);
  });

  it("plans every day in its own city, with a travel day into each new one", () => {
    const { trip } = plan(ROME_FLORENCE_VENICE, ITALY);
    const titles = trip.itinerary!.days.map((d) => d.title);
    expect(titles).toHaveLength(8);
    expect(titles[0]).toMatch(/Rome/);
    expect(titles[3]).toBe("Travel to Florence");
    expect(titles[5]).toBe("Travel to Venice");
    expect(titles[7]).toMatch(/Venice/);
    expect(trip.itinerary!.days[3]!.items[0]!.name).toBe("Travel to Florence");
    // Item ids stay unique across cities.
    const ids = trip.itinerary!.days.flatMap((d) => d.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prices the whole route: flights for every leg, hotels for every night", () => {
    const { trip, totals } = plan(ROME_FLORENCE_VENICE, ITALY);
    const single = buildTrip({ ...trip.setup, cities: [] });
    expect(trip.inputs.farePerPerson).toBeGreaterThan(single.inputs.farePerPerson);
    expect(totals.remaining).toBeGreaterThanOrEqual(0);
    const legs = routeLegMiles(CHICAGO, tripLegs(trip.setup));
    expect(legs).toHaveLength(4); // home → Rome → Florence → Venice → home
  });

  it("books a stay in each city and multi-city flights", () => {
    const { trip, shape, totals } = plan(ROME_FLORENCE_VENICE, ITALY);
    const items = bookingPlan(trip, destinationFor(trip.setup), shape, totals);
    const hotels = items.filter((i) => i.kind === "hotel").map((i) => i.title);
    expect(hotels).toEqual(["Stay in Rome", "Stay in Florence", "Stay in Venice"]);
    const flight = items.find((i) => i.key === "flight")!;
    expect(flight.title).toBe("Flights Chicago → Rome → Florence → Venice → Chicago");
    expect(flight.detail).toMatch(/Multi-city/);
  });

  it("works out the dates from the cities when there's no end date", () => {
    const { shape } = plan(
      draft({
        cities: [
          { name: "Tokyo, Japan", nights: 4 },
          { name: "Kyoto, Japan", nights: 3 },
        ],
      }),
    );
    expect(shape.nights).toBe(7);
  });

  it("trims cities that don't fit in the trip instead of breaking it", () => {
    const legs = citySchedule(3, { name: "Paris", point: null }, [
      { name: "Lyon", nights: 2 },
      { name: "Nice", nights: 2 },
    ]);
    expect(legs.map((l) => [l.name, l.nights])).toEqual([
      ["Paris", 1],
      ["Lyon", 2],
    ]);
  });

  it("cruises and staycations stay one place", () => {
    const cruise = plan(
      draft({
        destination: "Miami, FL",
        tripType: "cruise",
        nights: 5,
        cities: [
          { name: "Miami, FL", nights: 3 },
          { name: "Nassau, Bahamas", nights: 2 },
        ],
      }),
    );
    expect(tripLegs(cruise.setup)).toHaveLength(1);
  });

  it("the AI planner is told which city every day is in", async () => {
    sdk.answers.push({ days: [], tips: [] }, { days: [], tips: [] });
    process.env["LOVABLE_API_KEY"] = "test";
    await generateAiItinerary({
      destination: "Rome, Italy",
      region: "",
      origin: "Chicago, IL",
      tripType: "Fly-away",
      style: "Comfort",
      days: 8,
      startDate: start,
      travelers: 2,
      interests: [],
      activityBudgetPerPerson: 300,
      foodBudgetPerPersonDay: 60,
      weather: [],
      places: [],
      guide: [],
      covered: [],
      notes: [],
      instructions: "",
      current: [],
      cities: ["Days 1-3: Rome, Italy", "Days 4-5: Florence, Italy", "Days 6-8: Venice, Italy"],
    });
    expect(sdk.prompts[0]).toMatch(/Multi-city trip, 3 cities/);
    expect(sdk.prompts[0]).toMatch(/Florence/);
    expect(sdk.prompts[0]).toMatch(/Venice/);
  });
});

describe("cabins", () => {
  beforeEach(() => {
    sdk.answers.length = 0;
  });

  it("business class costs more, and a Waypoint budget follows it", () => {
    plan(draft({ destination: "Lisbon, Portugal", nights: 6 }));
    const economy = currentTrip();
    tripActions.setCabin("business");
    const business = currentTrip();
    expect(business.inputs.farePerPerson).toBeGreaterThan(economy.inputs.farePerPerson * 3);
    expect(business.setup.totalBudget).toBeGreaterThan(economy.setup.totalBudget);
    const shape = tripShape(business.setup.startDate, business.setup.endDate, 2);
    expect(
      calculateBudget(business.inputs, shape, business.setup.totalBudget, business.emergencyFund)
        .remaining,
    ).toBeGreaterThanOrEqual(0);
  });

  it("the assistant's cabin reaches the trip", () => {
    const { setup, trip } = plan(
      draft({ destination: "Lisbon, Portugal", nights: 6, cabin: "first" }),
    );
    expect(setup.cabin).toBe("first");
    expect(trip.inputs.farePerPerson).toBeGreaterThan(2000);
  });
});
