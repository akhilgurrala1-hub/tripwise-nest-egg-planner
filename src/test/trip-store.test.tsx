import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateBudget, roundMoney } from "@/lib/budget";
import { itineraryActivityCost } from "@/lib/itinerary";
import type { TripState } from "@/lib/trip-store";

async function setupStore() {
  const store = await import("@/lib/trip-store");
  const hook = renderHook(() => store.useTrip());
  return { ...store, ...hook };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

describe("trip store integration", () => {
  it("keeps newer manual inputs and a deliberate return to estimates when undoing", async () => {
    const { result, tripActions } = await setupStore();
    act(() => tripActions.setOverride("food", 500));
    act(() => tripActions.applySaving("picnic"));
    act(() => tripActions.setInput("foodPerPersonDay", 17));
    act(() => tripActions.undoSaving("picnic"));
    expect(result.current.trip.inputs.foodPerPersonDay).toBe(17);
    expect(result.current.trip.overrides.food).toBeUndefined();
    act(() => tripActions.setOverride("food", 500));
    act(() => tripActions.applySaving("picnic"));
    act(() => tripActions.setOverride("food", undefined));
    act(() => tripActions.undoSaving("picnic"));
    expect(result.current.trip.overrides.food).toBeUndefined();
  });
  it("renders the trip summary without the savings argument crash", async () => {
    const { result } = await setupStore();
    expect(result.current.savings.length).toBeGreaterThan(0);
    expect(result.current.totals.planned).toBeGreaterThan(0);
  });

  it("shows savings that equal the actual budget change, including custom taxes and cushion", async () => {
    const { result, tripActions } = await setupStore();
    act(() => {
      tripActions.setOverride("food", 500);
      tripActions.setOverride("taxes", 71.23);
      tripActions.setOverride("misc", 27.89);
    });
    const before = result.current.totals.planned;
    const tip = result.current.savings.find((s) => s.id === "picnic")!;
    expect(tip.replacesCustom).toBe(true);
    act(() => tripActions.applySaving(tip.id));
    expect(roundMoney(before - result.current.totals.planned)).toBe(tip.totalSavings);
    act(() => tripActions.undoSaving(tip.id));
    expect(result.current.totals.planned).toBe(before);
    expect(result.current.trip.overrides.food).toBe(500);
  });

  it("does not apply a saving twice or overwrite a newer custom total during undo", async () => {
    const { result, tripActions } = await setupStore();
    act(() => tripActions.applySaving("picnic"));
    const first = result.current.totals.planned;
    act(() => tripActions.applySaving("picnic"));
    expect(result.current.totals.planned).toBe(first);
    act(() => tripActions.setOverride("food", 123.45));
    act(() => tripActions.undoSaving("picnic"));
    expect(result.current.totals.categories.food).toBe(123.45);
  });

  it("calculates combined potential savings using the same engine as applying all tips", async () => {
    const { result, tripActions } = await setupStore();
    const before = result.current;
    const ids = before.savings.map((s) => s.id);
    act(() => ids.forEach((id) => tripActions.applySaving(id)));
    expect(roundMoney(before.totals.planned - result.current.totals.planned)).toBe(
      before.potentialSavings,
    );
  });

  it("keeps sightseeing edits separate until linked, then updates taxes, cushion and reserve correctly", async () => {
    const { result, tripActions } = await setupStore();
    const original = result.current.totals;
    const itinerary = result.current.trip.itinerary!;
    const paid = itinerary.days
      .flatMap((d) => d.items)
      .find((i) => i.kind !== "restaurant" && i.costPerPerson > 0)!;
    act(() => tripActions.removeItineraryItem(paid.id));
    expect(result.current.totals.planned).toBe(original.planned);
    act(() => tripActions.setActivitySync(true));
    expect(result.current.totals.categories.activities).toBe(
      itineraryActivityCost(result.current.trip.itinerary, result.current.shape.travelers),
    );
    expect(result.current.savings.some((s) => s.category === "activities")).toBe(false);
    const nextPaid = result.current.trip
      .itinerary!.days.flatMap((d) => d.items)
      .find((i) => i.kind !== "restaurant" && i.costPerPerson > 0)!;
    const before = result.current.totals;
    act(() => tripActions.removeItineraryItem(nextPaid.id));
    const summary = result.current;
    const expected = calculateBudget(
      summary.trip.inputs,
      summary.shape,
      summary.trip.setup.totalBudget,
      summary.trip.emergencyFund,
      {
        ...summary.trip.overrides,
        activities: itineraryActivityCost(summary.trip.itinerary, summary.shape.travelers),
      },
      summary.stopsTotal,
    );
    expect(summary.totals).toEqual(expected);
    expect(summary.totals.planned).toBeLessThan(before.planned);
    expect(summary.totals.emergencyFund).toBe(before.emergencyFund);
    act(() => tripActions.setOverride("activities", 42));
    expect(result.current.trip.syncActivities).toBe(false);
    expect(result.current.totals.categories.activities).toBe(42);
  });

  it("does not let an old AI response replace a trip edited during generation", async () => {
    const { result, tripActions } = await setupStore();
    const oldTrip = result.current.trip;
    act(() => tripActions.startTrip({ ...oldTrip.setup, totalBudget: 3000 }));
    const currentItinerary = result.current.trip.itinerary;
    let accepted = true;
    act(() => {
      accepted = tripActions.setItinerary({ source: "ai", days: [], tips: [] }, oldTrip);
    });
    expect(accepted).toBe(false);
    expect(result.current.trip.itinerary).toBe(currentItinerary);
  });

  it("preserves the latest reserve when returning to the setup form", async () => {
    const { result, tripActions } = await setupStore();
    act(() => tripActions.setEmergencyFund(350));
    expect(result.current.trip.setup.emergencyFund).toBe(350);
    act(() => tripActions.setTotalBudget(300));
    expect(result.current.trip.setup.emergencyFund).toBe(300);
    expect(result.current.totals.spendable).toBe(0);
    expect(result.current.totals.percentUsed).toBeNull();
  });

  it("migrates v1 and v2 trips without changing custom amounts or enabling sync", async () => {
    const { buildTrip, sampleSetup, migrate, summarizeTrip } = await import("@/lib/trip-store");
    const current = buildTrip(sampleSetup());
    for (const version of [1, 2]) {
      const old = {
        ...current,
        version,
        overrides: { food: 123.45 },
        savingOverrides: undefined,
        syncActivities: undefined,
      };
      const migrated = migrate(old)!;
      expect(migrated.version).toBe(3);
      expect(migrated.syncActivities).toBe(false);
      expect(migrated.savingOverrides).toEqual({});
      expect(summarizeTrip(migrated).totals.categories.food).toBe(123.45);
    }
  });

  it("persists the new version and keeps account state out of the trip", async () => {
    const { result, tripActions, unmount } = await setupStore();
    act(() => tripActions.setActivitySync(true));
    const saved = JSON.parse(localStorage.getItem("waypoint.trip.v1")!) as TripState;
    expect(saved.version).toBe(3);
    expect(saved.syncActivities).toBe(true);
    expect(saved.setup).toEqual(result.current.trip.setup);
    expect(saved).not.toHaveProperty("user_id");
    unmount();
    vi.resetModules();
    const reloaded = await setupStore();
    expect(reloaded.result.current.trip.syncActivities).toBe(true);
    expect(reloaded.result.current.trip.setup).toEqual(saved.setup);
  });
});
