import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addDays, todayIso } from "@/lib/dates";
import { compareToBudget, fromAiPlan, itineraryMealCost } from "@/lib/itinerary";
import { buildTrip, migrate, planKey, sampleSetup, SAMPLE_TRIP_ID } from "@/lib/trip-store";

const STORAGE_KEY = "waypoint.trip.v1";

/** A fresh copy of the store module, so each test starts with nothing loaded. */
async function freshStore() {
  vi.resetModules();
  return import("@/lib/trip-store");
}

function future(days: number) {
  return addDays(todayIso(), days);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("stable trip ids", () => {
  it("gives each new trip its own id, and the sample a fixed one", () => {
    const a = buildTrip(sampleSetup());
    const b = buildTrip(sampleSetup());
    expect(a.id).not.toBe(b.id);
    expect(buildTrip(sampleSetup(), true).id).toBe(SAMPLE_TRIP_ID);
  });

  it("adds an id to v4 trips and keeps an existing one", () => {
    const { id: _id, ...v4 } = { ...buildTrip(sampleSetup()), version: 4 };
    const upgraded = migrate(JSON.parse(JSON.stringify(v4)))!;
    expect(upgraded.version).toBe(6);
    expect(upgraded.id).toMatch(/.+/);
    const kept = migrate(JSON.parse(JSON.stringify(upgraded)))!;
    expect(kept.id).toBe(upgraded.id);
  });

  it("keeps the id through a trip-type switch but not a new trip", async () => {
    const store = await freshStore();
    store.tripActions.startTrip({
      ...store.sampleSetup(),
      startDate: future(10),
      endDate: future(12),
    });
    const id = store.currentTrip().id;
    store.tripActions.setTripType("flight");
    expect(store.currentTrip().id).toBe(id);
    store.tripActions.startTrip(store.sampleSetup());
    expect(store.currentTrip().id).not.toBe(id);
  });
});

describe("plans only land on the trip they were made for", () => {
  it("changes the key when the trip, type, place or dates change", () => {
    const trip = buildTrip({ ...sampleSetup(), startDate: future(5), endDate: future(7) });
    const key = planKey(trip);
    expect(planKey({ ...trip })).toBe(key);
    expect(planKey({ ...trip, id: "other" })).not.toBe(key);
    expect(planKey({ ...trip, setup: { ...trip.setup, endDate: future(8) } })).not.toBe(key);
    expect(planKey({ ...trip, setup: { ...trip.setup, tripType: "flight" } })).not.toBe(key);
    // Budget or style edits don't make a plan stale.
    expect(planKey({ ...trip, setup: { ...trip.setup, totalBudget: 9999 } })).toBe(key);
  });

  it("applies a plan for the current trip and discards one for a trip that changed", async () => {
    const store = await freshStore();
    store.tripActions.startTrip({
      ...store.sampleSetup(),
      startDate: future(10),
      endDate: future(11),
    });
    const plan = fromAiPlan(
      {
        tips: ["Go early"],
        days: [
          {
            title: "Day one",
            items: [
              {
                time: "Morning",
                kind: "sight",
                name: "Museum",
                area: "Downtown",
                note: "",
                costPerPerson: 12,
              },
            ],
          },
        ],
      },
      store.currentTrip().setup.startDate,
      2,
    );
    const key = store.planKey(store.currentTrip());
    expect(store.tripActions.setItineraryFor(key, plan)).toBe(0);
    expect(store.currentTrip().itinerary?.source).toBe("ai");

    // The traveler moves the dates while a second request is out.
    const staleKey = store.planKey(store.currentTrip());
    store.tripActions.startTrip({
      ...store.sampleSetup(),
      startDate: future(20),
      endDate: future(21),
    });
    expect(store.tripActions.setItineraryFor(staleKey, plan)).toBeNull();
    expect(store.currentTrip().itinerary?.source).toBe("demo");
  });
});

describe("tabs stay in sync", () => {
  it("picks up a trip written by another tab", async () => {
    const store = await freshStore();
    const { result } = renderHook(() => store.useTrip());
    expect(result.current.trip.isSample).toBe(true);

    const other = buildTrip({
      ...sampleSetup(),
      tripType: "flight",
      transportMode: "flight",
      destinationId: "red-rock",
      startDate: future(15),
      endDate: future(18),
    });
    act(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(other));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: JSON.stringify(other),
          storageArea: window.localStorage,
        }),
      );
    });
    expect(result.current.trip.id).toBe(other.id);
    expect(result.current.trip.setup.tripType).toBe("flight");
  });

  it("falls back to the sample when another tab clears storage", async () => {
    const store = await freshStore();
    store.tripActions.startTrip({ ...store.sampleSetup(), totalBudget: 3000 });
    const { result } = renderHook(() => store.useTrip());
    expect(result.current.trip.setup.totalBudget).toBe(3000);
    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current.trip.isSample).toBe(true);
  });
});

describe("plan vs. budget", () => {
  it("treats small differences as matching", () => {
    expect(compareToBudget(145, 140).fit).toBe("matches");
    expect(compareToBudget(224, 140)).toEqual({ fit: "over", difference: 84 });
    expect(compareToBudget(60, 140).fit).toBe("under");
    expect(compareToBudget(0, 0).fit).toBe("matches");
  });

  it("totals restaurant picks for the group", () => {
    const plan = fromAiPlan(
      {
        tips: [],
        days: [
          {
            title: "",
            items: [
              {
                time: "Lunch",
                kind: "restaurant",
                name: "A",
                area: "",
                note: "",
                costPerPerson: 12.5,
              },
              {
                time: "Dinner",
                kind: "restaurant",
                name: "B",
                area: "",
                note: "",
                costPerPerson: -5,
              },
              {
                time: "Afternoon",
                kind: "sight",
                name: "C",
                area: "",
                note: "",
                costPerPerson: 30,
              },
            ],
          },
        ],
      },
      "2026-12-01",
      1,
    );
    // Negative AI prices are clamped to 0; sights aren't meals.
    expect(itineraryMealCost(plan, 2)).toBe(25);
    expect(plan.days[0]!.date).toBe("2026-12-01");
  });
});

describe("the sample trip starts where the traveler is", () => {
  const CHICAGO = { label: "Chicago, IL", lat: 41.8781, lon: -87.6298 };

  it("moves an untouched sample to their city and a nearby place", async () => {
    const store = await freshStore();
    store.tripActions.personalizeSample(CHICAGO);
    const t = store.currentTrip();
    expect(t.isSample).toBe(true);
    expect(t.setup.origin).toBe("Chicago, IL");
    expect(t.setup.originPoint).toEqual({ lat: CHICAGO.lat, lon: CHICAGO.lon });
    expect(t.setup.destinationId).not.toBe("blue-ridge");
  });

  it("leaves a sample the traveler changed, and real trips, alone", async () => {
    const store = await freshStore();
    store.tripActions.setOverride("food", 99);
    store.tripActions.personalizeSample(CHICAGO);
    expect(store.currentTrip().setup.origin).toBe("Charlotte, NC");
    store.tripActions.startTrip(store.sampleSetup());
    store.tripActions.personalizeSample(CHICAGO);
    expect(store.currentTrip().setup.origin).toBe("Charlotte, NC");
  });
});

describe("booking records", () => {
  it("merges updates and keeps confirmations short", async () => {
    const store = await freshStore();
    store.tripActions.setBooking("hotel", { status: "booked", confirmation: "X".repeat(200) });
    store.tripActions.setBooking("hotel", { price: 480 });
    const r = store.currentTrip().bookings["hotel"]!;
    expect(r.status).toBe("booked");
    expect(r.confirmation).toHaveLength(80);
    expect(r.price).toBe(480);
    // A new trip starts with an empty checklist.
    store.tripActions.startTrip(store.sampleSetup());
    expect(store.currentTrip().bookings).toEqual({});
  });
});
