import { describe, expect, it } from "vitest";

import { calculateBudget, tripShape, type BudgetTotals } from "@/lib/budget";
import type { BookingRecord } from "@/lib/booking";
import { sharedTripPayload } from "@/lib/share";
import {
  addExpense,
  addPerson,
  balances,
  bookedCosts,
  bookingCategory,
  cleanSpending,
  defaultExpenseDate,
  EMPTY_SPENDING,
  expensesByDay,
  MAX_EXPENSES,
  plannedByCategory,
  removeExpense,
  removePerson,
  restoreExpense,
  settleUp,
  spendCategoriesFor,
  spendingCsv,
  spendingSummary,
  tripPhase,
  updateExpense,
  type Spending,
} from "@/lib/spending";
import { migrate } from "@/lib/trip/migrate";
import { buildTrip, currentTrip, sampleSetup, tripActions } from "@/lib/trip-store";

const totals = (over: Partial<Record<string, number>>, spendable = 2000): BudgetTotals => {
  const categories = {
    cruise: 0,
    transportation: 0,
    gas: 0,
    tolls: 0,
    parking: 0,
    accommodations: 0,
    food: 0,
    snacks: 0,
    water: 0,
    activities: 0,
    stops: 0,
    taxes: 0,
    misc: 0,
    ...over,
  } as BudgetTotals["categories"];
  const planned = Object.values(categories).reduce((s, n) => s + n, 0);
  return {
    categories,
    estimates: categories,
    totalBudget: spendable + 300,
    emergencyFund: 300,
    spendable,
    planned,
    remaining: spendable - planned,
    overBudget: planned > spendable,
    percentUsed: (planned / spendable) * 100,
    perPersonPerDay: 0,
  };
};

const CATS = spendCategoriesFor("flight", "flight");
const withPeople = (...names: string[]): Spending =>
  names.reduce((s, n) => addPerson(s, n), EMPTY_SPENDING);
const log = (s: Spending, amount: number, extra: Partial<Parameters<typeof addExpense>[1]> = {}) =>
  addExpense(s, { date: "2027-03-02", amount, category: "food", note: "", ...extra });

describe("planned money by category", () => {
  it("folds taxes into the categories they're charged on, adding up to the plan exactly", () => {
    const t = totals({ accommodations: 600, food: 300, activities: 100, taxes: 100.01, misc: 50 });
    const p = plannedByCategory(t, CATS);
    expect(p.accommodations).toBeCloseTo(660, 1);
    expect(p.food).toBeCloseTo(330, 1);
    const sum = Object.values(p).reduce((s, n) => s + Math.round(n * 100), 0);
    expect(sum).toBe(Math.round(t.planned * 100));
  });

  it("never lists taxes as a category of their own", () => {
    expect(CATS).not.toContain("taxes");
    expect(CATS[CATS.length - 1]).toBe("misc");
    expect(spendCategoriesFor("road-trip", "car")).toContain("gas");
    expect(spendCategoriesFor("flight", "flight")).not.toContain("gas");
  });

  it("puts taxes in Other when nothing taxable is planned", () => {
    const p = plannedByCategory(totals({ transportation: 500, taxes: 20 }), CATS);
    expect(p.misc).toBe(20);
  });
});

describe("booked prices count as spent", () => {
  it("maps each booking to its budget category", () => {
    expect(bookingCategory("hotel")).toBe("accommodations");
    expect(bookingCategory("hotel-3")).toBe("accommodations");
    expect(bookingCategory("flight")).toBe("transportation");
    expect(bookingCategory("tickets")).toBe("activities");
    expect(bookingCategory("prep-passport")).toBeNull();
  });

  it("only counts bookings marked booked with a price", () => {
    const b: Record<string, BookingRecord> = {
      hotel: { status: "booked", confirmation: "X", price: 640 },
      flight: { status: "booked", confirmation: "", price: null },
      car: { status: "todo", confirmation: "", price: 200 },
      tickets: { status: "skipped", confirmation: "", price: 80 },
      "prep-insurance": { status: "booked", confirmation: "", price: 50 },
    };
    expect(bookedCosts(b)).toEqual([{ key: "hotel", category: "accommodations", amount: 640 }]);
  });
});

describe("spending summary", () => {
  const base = {
    totals: totals({ transportation: 600, accommodations: 600, food: 400, misc: 100 }),
    cats: CATS,
    bookings: { hotel: { status: "booked" as const, confirmation: "", price: 640 } },
    startDate: "2027-03-01",
    endDate: "2027-03-05",
  };

  it("adds logged costs and booked prices, by category and in total", () => {
    let s = log(EMPTY_SPENDING, 45.5);
    s = log(s, 30, { date: "2027-03-03", category: "activities" });
    const sum = spendingSummary({ ...base, spending: s, today: "2027-03-03" });
    expect(sum.logged).toBe(75.5);
    expect(sum.booked).toBe(640);
    expect(sum.spent).toBe(715.5);
    expect(sum.left).toBe(2000 - 715.5);
    expect(sum.today).toBe(30);
    const hotel = sum.categories.find((c) => c.category === "accommodations")!;
    expect(hotel).toMatchObject({ planned: 600, spent: 640, left: -40, over: true });
    // Nothing planned for activities, but money was spent there, so it shows.
    expect(sum.categories.find((c) => c.category === "activities")?.spent).toBe(30);
    expect(sum.categories.find((c) => c.category === "parking")).toBeUndefined();
  });

  it("shares what's left over the days still to come, today included", () => {
    const sum = spendingSummary({ ...base, spending: EMPTY_SPENDING, today: "2027-03-04" });
    expect(sum.phase).toBe("during");
    expect(sum.daysLeft).toBe(2);
    expect(sum.perDayLeft).toBe((2000 - 640) / 2);
  });

  it("has no per-day figure before or after the trip", () => {
    const before = spendingSummary({ ...base, spending: EMPTY_SPENDING, today: "2027-02-01" });
    expect(before.phase).toBe("before");
    expect(before.daysLeft).toBe(5);
    expect(before.perDayLeft).toBeNull();
    const after = spendingSummary({ ...base, spending: EMPTY_SPENDING, today: "2027-04-01" });
    expect(after).toMatchObject({ phase: "after", daysLeft: 0, perDayLeft: null });
  });

  it("goes over without touching the emergency fund", () => {
    const s = log(EMPTY_SPENDING, 1500);
    const sum = spendingSummary({ ...base, spending: s, today: "2027-03-05" });
    expect(sum.over).toBe(true);
    expect(sum.left).toBe(2000 - 2140);
    expect(sum.emergencyFund).toBe(300);
    expect(sum.perDayLeft).toBe(0);
  });

  it("keeps costs from a category the trip no longer uses, under Other", () => {
    const s = log(EMPTY_SPENDING, 20, { category: "gas" });
    const sum = spendingSummary({ ...base, spending: s, bookings: {}, today: "2027-03-02" });
    expect(sum.categories.find((c) => c.category === "misc")?.spent).toBe(20);
    expect(sum.spent).toBe(20);
  });

  it("works with the app's real budget numbers", () => {
    const trip = buildTrip(sampleSetup());
    const shape = tripShape(trip.setup.startDate, trip.setup.endDate, trip.setup.travelers);
    const t = calculateBudget(trip.inputs, shape, trip.setup.totalBudget, trip.emergencyFund);
    const cats = spendCategoriesFor(trip.setup.tripType, trip.setup.transportMode);
    const sum = spendingSummary({
      totals: t,
      cats,
      spending: EMPTY_SPENDING,
      bookings: {},
      startDate: trip.setup.startDate,
      endDate: trip.setup.endDate,
      today: trip.setup.startDate,
    });
    const planned = sum.categories.reduce((s, c) => s + Math.round(c.planned * 100), 0);
    expect(planned).toBe(Math.round(t.planned * 100));
    expect(sum.left).toBe(t.spendable);
  });
});

describe("dates", () => {
  it("knows where the trip is", () => {
    expect(tripPhase("2027-03-01", "2027-03-05", "2027-03-01")).toBe("during");
    expect(tripPhase("2027-03-01", "2027-03-05", "2027-03-06")).toBe("after");
  });
  it("logs on today, or the last day once the trip is over", () => {
    expect(defaultExpenseDate("2027-03-05", "2027-03-02")).toBe("2027-03-02");
    expect(defaultExpenseDate("2027-03-05", "2027-04-02")).toBe("2027-03-05");
  });
  it("groups costs by day, newest first", () => {
    let s = log(EMPTY_SPENDING, 10, { date: "2027-03-01" });
    s = log(s, 5, { date: "2027-03-03" });
    s = log(s, 2.25, { date: "2027-03-01" });
    const days = expensesByDay(s.expenses);
    expect(days.map((d) => d.date)).toEqual(["2027-03-03", "2027-03-01"]);
    expect(days[1]!.total).toBe(12.25);
  });
});

describe("editing costs", () => {
  it("cleans what's stored: cents, bounds, known categories, valid dates", () => {
    let s = log(EMPTY_SPENDING, 10.005, { note: "  Gelato   by the  river " });
    expect(s.expenses[0]).toMatchObject({ amount: 10.01, note: "Gelato by the river" });
    expect(log(s, 0).expenses).toHaveLength(1);
    expect(log(s, -5).expenses).toHaveLength(1);
    expect(log(s, 10, { date: "soon" }).expenses).toHaveLength(1);
    s = log(s, 10, { category: "taxes" as never });
    expect(s.expenses[1]!.category).toBe("misc");
  });

  it("updates, removes and restores in place for Undo", () => {
    let s = log(log(log(EMPTY_SPENDING, 1), 2), 3);
    const mid = s.expenses[1]!.id;
    s = updateExpense(s, mid, { amount: 20, note: "Taxi" });
    expect(s.expenses[1]).toMatchObject({ id: mid, amount: 20, note: "Taxi" });
    // A bad edit leaves the cost as it was.
    expect(updateExpense(s, mid, { amount: -1 }).expenses[1]!.amount).toBe(20);
    const { spending, removed } = removeExpense(s, mid);
    expect(spending.expenses).toHaveLength(2);
    expect(restoreExpense(spending, removed!).expenses.map((e) => e.id)).toEqual(
      s.expenses.map((e) => e.id),
    );
  });

  it("keeps a typed currency next to the dollars", () => {
    const s = log(EMPTY_SPENDING, 21.6, { local: { amount: 20, currency: "EUR" } });
    expect(s.expenses[0]!.local).toEqual({ amount: 20, currency: "EUR" });
    expect(
      log(EMPTY_SPENDING, 5, { local: { amount: 5, currency: "USD" } }).expenses[0]!.local,
    ).toBeUndefined();
  });

  it("stops at the cap", () => {
    const full: Spending = {
      people: [],
      expenses: Array.from({ length: MAX_EXPENSES }, (_, i) => ({
        id: `e${i}`,
        date: "2027-03-01",
        amount: 1,
        category: "food" as const,
        note: "",
      })),
    };
    expect(log(full, 5).expenses).toHaveLength(MAX_EXPENSES);
  });
});

describe("splitting costs", () => {
  it("splits equally to the cent and settles with the fewest payments", () => {
    let s = withPeople("Ana", "Ben", "Cy");
    const [ana, ben] = s.people;
    s = log(s, 100, { paidBy: ana!.id });
    s = log(s, 30, { paidBy: ben!.id });
    const b = balances(s);
    expect(b.map((x) => x.paid)).toEqual([100, 30, 0]);
    // 130 / 3 = 43.33 with a cent left over, which goes to the first sharer.
    expect(b.map((x) => x.share)).toEqual([43.34, 43.33, 43.33]);
    expect(b.reduce((t, x) => t + Math.round(x.net * 100), 0)).toBe(0);
    const pay = settleUp(s);
    expect(pay.map((p) => [p.from.name, p.to.name, p.amount])).toEqual([
      ["Cy", "Ana", 43.33],
      ["Ben", "Ana", 13.33],
    ]);
  });

  it("splits only with the people a cost names", () => {
    let s = withPeople("Ana", "Ben", "Cy");
    const [ana, ben] = s.people;
    s = log(s, 50, { paidBy: ana!.id, splitWith: [ana!.id, ben!.id] });
    expect(settleUp(s).map((p) => [p.from.name, p.amount])).toEqual([["Ben", 25]]);
    // Naming everyone is stored as "everyone".
    s = log(s, 9, { paidBy: ana!.id, splitWith: s.people.map((p) => p.id) });
    expect(s.expenses[1]!.splitWith).toEqual([]);
  });

  it("leaves costs with no payer out of the split", () => {
    const s = log(withPeople("Ana", "Ben"), 80);
    expect(settleUp(s)).toEqual([]);
  });

  it("removing someone clears them from payers and splits", () => {
    let s = withPeople("Ana", "Ben", "Cy");
    const [ana, ben] = s.people;
    s = log(s, 40, { paidBy: ben!.id, splitWith: [ana!.id, ben!.id] });
    s = removePerson(s, ben!.id);
    expect(s.people.map((p) => p.name)).toEqual(["Ana", "Cy"]);
    expect(s.expenses[0]).toMatchObject({ paidBy: null, splitWith: [ana!.id] });
  });

  it("ignores blank names and caps the group", () => {
    expect(addPerson(EMPTY_SPENDING, "   ").people).toHaveLength(0);
    const many = Array.from({ length: 25 }, (_, i) => `P${i}`);
    expect(withPeople(...many).people).toHaveLength(20);
  });
});

describe("stored spending", () => {
  it("is cleaned when loaded: junk dropped, bounds kept, duplicates removed", () => {
    const s = cleanSpending({
      people: [{ id: "p1", name: "Ana" }, { id: "p1", name: "Dup" }, { name: "No id" }, "x"],
      expenses: [
        { id: "a", date: "2027-03-01", amount: 12, category: "food", note: "ok", paidBy: "p1" },
        { id: "a", date: "2027-03-01", amount: 5, category: "food", note: "dup" },
        { id: "b", date: "bad", amount: 5, category: "food", note: "" },
        { id: "c", date: "2027-03-01", amount: "NaN", category: "food", note: "" },
        { id: "d", date: "2027-03-01", amount: 1e12, category: "nope", note: "", paidBy: "ghost" },
      ],
    });
    expect(s.people).toEqual([{ id: "p1", name: "Ana" }]);
    expect(s.expenses.map((e) => e.id)).toEqual(["a", "d"]);
    expect(s.expenses[1]).toMatchObject({ amount: 1_000_000, category: "misc", paidBy: null });
    expect(cleanSpending(null)).toEqual({ people: [], expenses: [] });
  });

  it("older trips get empty spending when migrated to v7", () => {
    const { spending: _s, ...old } = buildTrip(sampleSetup());
    const m = migrate({ ...old, version: 6 });
    expect(m?.version).toBe(7);
    expect(m?.spending).toEqual({ people: [], expenses: [] });
  });

  it("is never put in share links", () => {
    const trip = { ...buildTrip(sampleSetup()), spending: log(withPeople("Ana"), 20) };
    expect("spending" in sharedTripPayload(trip)).toBe(false);
  });

  it("the store logs, removes and restores costs", () => {
    tripActions.startTrip(sampleSetup());
    tripActions.addPerson("Ana");
    tripActions.addExpense({ date: "2027-03-01", amount: 12, category: "food", note: "Tacos" });
    expect(currentTrip().spending.expenses).toHaveLength(1);
    const id = currentTrip().spending.expenses[0]!.id;
    const removed = tripActions.removeExpense(id);
    expect(currentTrip().spending.expenses).toHaveLength(0);
    tripActions.restoreExpense(removed!);
    expect(currentTrip().spending.expenses[0]!.note).toBe("Tacos");
    expect(currentTrip().spending.people[0]!.name).toBe("Ana");
  });
});

describe("spreadsheet export", () => {
  it("writes every cost, booked prices too, and keeps formulas as text", () => {
    let s = withPeople("Ana", "Ben");
    s = log(s, 12.5, { note: '=HYPERLINK("x")', paidBy: s.people[0]!.id });
    s = log(s, 20, {
      date: "2027-03-01",
      note: "Cafe, Rome",
      local: { amount: 18, currency: "EUR" },
    });
    const csv = spendingCsv(s, { hotel: { status: "booked", confirmation: "", price: 300 } });
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Date,Category,Note,Amount (USD),Original amount,Paid by,Split with");
    expect(lines[1]).toBe('2027-03-01,Meals,"Cafe, Rome",20.00,18.00 EUR,,');
    expect(lines[2]).toBe(`2027-03-02,Meals,"'=HYPERLINK(""x"")",12.50,,Ana,Ana; Ben`);
    expect(lines[3]).toBe(",Hotels & lodging,Booked: hotel,300.00,,,");
  });
});
