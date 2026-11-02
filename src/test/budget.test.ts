import { describe, expect, it } from "vitest";

import {
  applySaving,
  calculateBudget,
  defaultEmergencyFund,
  reductionPlan,
  savingsOpportunities,
  stopCost,
  tripShape,
  withSaving,
  type BudgetInputs,
} from "@/lib/budget";
import { DESTINATIONS } from "@/lib/demo-data";

const car: BudgetInputs = {
  transportMode: "car",
  roundTripMiles: 280,
  mpg: 28,
  gasPrice: 3.5,
  farePerPerson: 200,
  rentalPerDay: 60,
  localTransitPerDay: 0,
  foodPerPersonDay: 40,
  snacksPerPersonDay: 5,
  waterPerPersonDay: 4,
  nightlyRate: 150,
  rooms: 1,
  parkingPerDay: 10,
  tolls: 12,
  activitiesPerPerson: 50,
  taxRatePct: 10,
  miscPct: 5,
  cruisePerNight: 0,
  portFeesPerPerson: 0,
  gratuitiesPerNight: 0,
};
// 3 days, 2 nights, 2 travelers
const trip = tripShape("2026-11-01", "2026-11-03", 2);

describe("trip length", () => {
  it("counts days inclusively and nights as days minus one", () => {
    expect(trip).toEqual({ travelers: 2, days: 3, nights: 2 });
  });
});

describe("budget calculator", () => {
  it("computes each category from its inputs when driving your own car", () => {
    const t = calculateBudget(car, trip, 2000, 200);
    expect(t.categories.transportation).toBe(0);
    expect(t.categories.gas).toBe(35); // 280/28 * 3.5
    expect(t.categories.tolls).toBe(12);
    expect(t.categories.parking).toBe(30); // 10 * 3
    expect(t.categories.accommodations).toBe(300); // 150 * 1 * 2
    expect(t.categories.food).toBe(240); // 40 * 2 * 3
    expect(t.categories.snacks).toBe(30); // 5 * 2 * 3
    expect(t.categories.water).toBe(24); // 4 * 2 * 3
    expect(t.categories.activities).toBe(100);
    expect(t.categories.taxes).toBe(67); // 10% of 300 + 240 + 30 + 100
    expect(t.categories.misc).toBe(41.9); // 5% of 838
    expect(t.planned).toBe(879.9);
  });

  it("charges fares instead of gas and tolls when flying", () => {
    const t = calculateBudget({ ...car, transportMode: "flight" }, trip, 2000, 200);
    expect(t.categories.transportation).toBe(400); // 200 * 2 travelers
    expect(t.categories.gas).toBe(0);
    expect(t.categories.tolls).toBe(0);
    expect(t.categories.misc).toBe(59.55); // 5% of 1191
    expect(t.planned).toBe(1250.55);
  });

  it("adds a daily rental charge for a rental car on top of gas", () => {
    const t = calculateBudget({ ...car, transportMode: "rental-car" }, trip, 2000, 200);
    expect(t.categories.transportation).toBe(180); // 60 * 3 days
    expect(t.categories.gas).toBe(35);
  });

  it("excludes the emergency reserve from spendable money", () => {
    const t = calculateBudget(car, trip, 2000, 200);
    expect(t.spendable).toBe(1800);
    expect(t.remaining).toBe(920.1);
  });

  it("keeps the emergency reserve intact when spending goes over budget", () => {
    const t = calculateBudget(car, trip, 900, 200);
    expect(t.emergencyFund).toBe(200);
    expect(t.overBudget).toBe(true);
    expect(t.remaining).toBe(-179.9);
  });

  it("uses a custom amount instead of the estimate when one is set", () => {
    const t = calculateBudget(car, trip, 2000, 0, { accommodations: 500 });
    expect(t.categories.accommodations).toBe(500);
    expect(t.estimates.accommodations).toBe(300);
    expect(t.categories.taxes).toBe(87); // 10% of 500 + 240 + 30 + 100
  });

  it("defaults the emergency reserve to 10% of the budget rounded to $25", () => {
    expect(defaultEmergencyFund(2000)).toBe(200);
    expect(defaultEmergencyFund(1130)).toBe(125);
  });
});

describe("road-trip stops", () => {
  it("costs entry for every traveler plus detour fuel at the sample speed", () => {
    // 20 entry + (30 min at 35 mph = 17.5 mi) / 28 mpg * $3.50
    expect(stopCost({ costPerPerson: 10, extraMinutes: 30 }, 2, car)).toBe(22.19);
    expect(
      stopCost({ costPerPerson: 10, extraMinutes: 30 }, 2, { ...car, transportMode: "flight" }),
    ).toBe(20);
  });

  it("raises planned spending by exactly the stop cost", () => {
    const without = calculateBudget(car, trip, 2000, 200);
    const withStop = calculateBudget(car, trip, 2000, 200, {}, 22.19);
    expect(withStop.planned).toBe(902.09);
    expect(withStop.remaining).toBe(without.remaining - 22.19);
  });
});

describe("over-budget recommendations", () => {
  it("reports the gap and an exact saving that includes taxes and cushion", () => {
    const plan = reductionPlan(car, trip, 900, 200);
    expect(plan.gap).toBe(179.9);
    const hotel = plan.suggestions.find((s) => s.category === "accommodations");
    // Max 40% hotel cut = 120; saves 120 * 1.10 tax * 1.05 cushion
    expect(hotel?.cut).toBe(120);
    expect(hotel?.saves).toBe(138.6);
  });

  it("suggestions marked 'back on budget' really bring remaining to zero or above", () => {
    const plan = reductionPlan(car, trip, 1000, 200); // gap 79.90
    const closers = plan.suggestions.filter((s) => s.closesGap && s.category !== "stops");
    expect(closers.length).toBeGreaterThan(0);
    for (const s of closers) {
      const after = calculateBudget(car, trip, 1000, 200, { [s.category]: s.current - s.cut });
      expect(after.remaining).toBeGreaterThanOrEqual(0);
      expect(after.remaining).toBeLessThan(0.05);
    }
  });

  it("has no suggestions when the trip fits the budget", () => {
    expect(reductionPlan(car, trip, 2000, 200).suggestions).toEqual([]);
  });
});

describe("savings", () => {
  const dest = DESTINATIONS[0]!;
  const t = calculateBudget(car, trip, 2000, 200);

  it("estimates 30% off meals for picnic lunches and skips applied ideas", () => {
    const tips = savingsOpportunities(car, trip, {}, 0, dest);
    const picnic = tips.find((s) => s.id === "picnic");
    expect(picnic?.amount).toBe(72);
    // 72 off food also removes its 10% tax and 5% cushion: 72 * 1.10 * 1.05
    expect(picnic?.totalSavings).toBe(83.16);
    const after = savingsOpportunities(car, trip, {}, 0, dest, ["picnic"]);
    expect(after.find((s) => s.id === "picnic")).toBeUndefined();
  });

  it("a saving's preview equals the real drop in planned spending once applied", () => {
    const tips = savingsOpportunities(car, trip, {}, 0, dest);
    for (const tip of tips) {
      const next = withSaving(tip.id, car, {}, dest);
      const after = calculateBudget(next.inputs, trip, 2000, 200, next.overrides);
      expect(Math.round((t.planned - after.planned) * 100) / 100).toBe(tip.totalSavings);
    }
  });

  it("applying the toll-free route sets tolls to zero", () => {
    expect(applySaving("tolls", car, dest)).toEqual({ tolls: 0 });
  });
});

describe("demo itinerary scheduling", () => {
  it("keeps evening-only events in the evening and never repeats a stop", async () => {
    const { generateDemoItinerary } = await import("@/lib/itinerary");
    for (const dest of DESTINATIONS) {
      const itin = generateDemoItinerary({
        dest,
        days: 6,
        startDate: "2026-11-01",
        interests: ["nature", "arts", "nightlife", "history", "family"],
        style: "comfort",
        tripType: "flight",
      });
      const eveningNames = new Set(dest.sights.filter((s) => s.evening).map((s) => s.name));
      const seen = new Set<string>();
      for (const day of itin.days) {
        for (const item of day.items) {
          if (eveningNames.has(item.name)) expect(item.time).toBe("Evening");
          if (item.kind === "sight" && item.name !== "Open time to wander") {
            expect(seen.has(item.name)).toBe(false);
            seen.add(item.name);
          }
        }
      }
    }
  });

  it("labels each day with consecutive calendar dates", async () => {
    const { generateDemoItinerary } = await import("@/lib/itinerary");
    const itin = generateDemoItinerary({
      dest: DESTINATIONS[0]!,
      days: 3,
      startDate: "2026-12-31",
      interests: [],
      style: "budget",
      tripType: "road-trip",
    });
    expect(itin.days.map((d) => d.date)).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("spendable money", () => {
  it("a $1,000 trip with a $200 reserve has $800 to spend before expenses", () => {
    const empty: BudgetInputs = {
      ...car,
      roundTripMiles: 0,
      farePerPerson: 0,
      foodPerPersonDay: 0,
      snacksPerPersonDay: 0,
      waterPerPersonDay: 0,
      nightlyRate: 0,
      parkingPerDay: 0,
      tolls: 0,
      activitiesPerPerson: 0,
    };
    const t = calculateBudget(empty, trip, 1000, 200);
    expect(t.spendable).toBe(800);
    expect(t.remaining).toBe(800);
  });
});
