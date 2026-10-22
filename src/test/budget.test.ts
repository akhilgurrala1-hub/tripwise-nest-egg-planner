import { describe, expect, it } from "vitest";

import {
  applySaving,
  calculateBudget,
  defaultEmergencyFund,
  savingsOpportunities,
  tripShape,
  type BudgetInputs,
} from "@/lib/budget";
import { DESTINATIONS } from "@/lib/demo-data";

const inputs: BudgetInputs = {
  roundTripMiles: 280,
  mpg: 28,
  gasPrice: 3.5,
  foodPerPersonDay: 40,
  waterPerPersonDay: 4,
  nightlyRate: 150,
  rooms: 1,
  parkingPerDay: 10,
  tolls: 12,
  activitiesPerPerson: 50,
  taxRatePct: 10,
  miscPct: 5,
};
// 3 days, 2 nights, 2 travelers
const trip = tripShape("2026-11-01", "2026-11-03", 2);

describe("trip length", () => {
  it("counts days inclusively and nights as days minus one", () => {
    expect(trip).toEqual({ travelers: 2, days: 3, nights: 2 });
  });
});

describe("budget calculator", () => {
  it("computes each category from its inputs", () => {
    const t = calculateBudget(inputs, trip, 2000, 200);
    expect(t.categories.gas).toBe(35); // 280/28 * 3.5
    expect(t.categories.food).toBe(240); // 40 * 2 * 3
    expect(t.categories.water).toBe(24); // 4 * 2 * 3
    expect(t.categories.accommodations).toBe(300); // 150 * 1 * 2
    expect(t.categories.parking).toBe(30);
    expect(t.categories.tolls).toBe(12);
    expect(t.categories.activities).toBe(100);
    expect(t.categories.taxes).toBe(64); // 10% of 300 + 240 + 100
    expect(t.categories.misc).toBe(40.25); // 5% of 805
    expect(t.planned).toBe(845.25);
  });

  it("excludes the protected emergency fund from spendable money", () => {
    const t = calculateBudget(inputs, trip, 2000, 200);
    expect(t.spendable).toBe(1800);
    expect(t.remaining).toBe(1800 - 845.25);
  });

  it("keeps the emergency fund intact when spending goes over budget", () => {
    const t = calculateBudget(inputs, trip, 900, 200);
    expect(t.emergencyFund).toBe(200);
    expect(t.overBudget).toBe(true);
    expect(t.remaining).toBe(700 - 845.25);
  });

  it("uses a custom amount instead of the estimate when one is set", () => {
    const t = calculateBudget(inputs, trip, 2000, 0, { accommodations: 500 });
    expect(t.categories.accommodations).toBe(500);
    expect(t.estimates.accommodations).toBe(300);
    expect(t.categories.taxes).toBe(84); // 10% of 500 + 240 + 100
  });

  it("defaults the emergency fund to 10% of the budget rounded to $25", () => {
    expect(defaultEmergencyFund(2000)).toBe(200);
    expect(defaultEmergencyFund(1130)).toBe(125);
  });
});

describe("savings", () => {
  const dest = DESTINATIONS[0]!;
  const t = calculateBudget(inputs, trip, 2000, 200);

  it("estimates 30% off food for picnic lunches and skips applied ideas", () => {
    const tips = savingsOpportunities(inputs, trip, t.categories, dest);
    expect(tips.find((s) => s.id === "picnic")?.amount).toBe(72);
    const after = savingsOpportunities(inputs, trip, t.categories, dest, ["picnic"]);
    expect(after.find((s) => s.id === "picnic")).toBeUndefined();
  });

  it("applying the toll-free route sets tolls to zero", () => {
    expect(applySaving("tolls", inputs, dest)).toEqual({ tolls: 0 });
  });
});
