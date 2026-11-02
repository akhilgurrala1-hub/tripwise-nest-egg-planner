import { describe, expect, it } from "vitest";

import type { Itinerary, ItineraryItem, SlotTime } from "@/lib/itinerary";
import {
  addItem,
  canMove,
  insertionIndex,
  keepCustomItems,
  moveItem,
  moveItemToDay,
  removeItem,
  restoreItem,
  updateItem,
} from "@/lib/itinerary-edit";

const item = (id: string, time: SlotTime, cost = 10): ItineraryItem => ({
  id,
  time,
  kind: time === "Lunch" || time === "Dinner" ? "restaurant" : "sight",
  name: id,
  area: "",
  note: "",
  costPerPerson: cost,
});
const plan = (): Itinerary => ({
  source: "demo",
  tips: [],
  days: [
    {
      day: 1,
      date: "2026-12-01",
      title: "Day 1",
      items: [item("a", "Morning"), item("b", "Lunch"), item("c", "Dinner")],
    },
    {
      day: 2,
      date: "2026-12-02",
      title: "Day 2",
      items: [item("d", "Morning"), item("e", "Evening")],
    },
  ],
});
const names = (it: Itinerary, d: number) => it.days[d]!.items.map((i) => `${i.name}:${i.time}`);

describe("adding", () => {
  it("places a new item by its time slot and marks it as the traveler's", () => {
    const next = addItem(plan(), 0, { ...item("x", "Afternoon"), name: "Aquarium" });
    expect(names(next, 0)).toEqual(["a:Morning", "b:Lunch", "Aquarium:Afternoon", "c:Dinner"]);
    const added = next.days[0]!.items[2]!;
    expect(added.custom).toBe(true);
    expect(added.id).toMatch(/^custom-/);
  });

  it("puts a second item with the same slot after the first", () => {
    expect(insertionIndex(plan().days[0]!.items, "Lunch")).toBe(2);
    expect(insertionIndex(plan().days[0]!.items, "Morning")).toBe(1);
    expect(insertionIndex([], "Evening")).toBe(0);
  });

  it("never reuses an id", () => {
    const once = addItem(plan(), 0, item("x", "Morning"));
    const twice = addItem(once, 0, item("y", "Morning"));
    const ids = twice.days.flatMap((d) => d.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not change the original", () => {
    const original = plan();
    addItem(original, 0, item("x", "Morning"));
    expect(original.days[0]!.items).toHaveLength(3);
  });
});

describe("editing", () => {
  it("updates fields and re-sorts when the time slot changes", () => {
    const next = updateItem(plan(), "a", { time: "Evening", name: "Night market" });
    expect(names(next, 0)).toEqual(["b:Lunch", "c:Dinner", "Night market:Evening"]);
  });

  it("turns an edited price into the traveler's own figure", () => {
    const priced = { ...plan() };
    priced.days[0]!.items[0] = { ...item("a", "Morning"), costSource: "price-level" };
    const next = updateItem(priced, "a", { costPerPerson: 35 });
    expect(next.days[0]!.items[0]).toMatchObject({
      costPerPerson: 35,
      costSource: "listed",
      custom: true,
    });
  });

  it("clamps negative or invalid prices to zero", () => {
    expect(updateItem(plan(), "a", { costPerPerson: -5 }).days[0]!.items[0]!.costPerPerson).toBe(0);
    expect(
      updateItem(plan(), "a", { costPerPerson: Number.NaN }).days[0]!.items[0]!.costPerPerson,
    ).toBe(0);
  });

  it("ignores unknown ids", () => {
    const p = plan();
    expect(updateItem(p, "nope", { name: "x" })).toBe(p);
  });
});

describe("reordering", () => {
  it("swaps neighbors and keeps the day in time order", () => {
    const next = moveItem(plan(), "a", 1);
    expect(names(next, 0)).toEqual(["b:Morning", "a:Lunch", "c:Dinner"]);
    expect(moveItem(plan(), "c", -1).days[0]!.items.map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("stops at the ends of a day", () => {
    const p = plan();
    expect(moveItem(p, "a", -1)).toBe(p);
    expect(moveItem(p, "c", 1)).toBe(p);
    expect(canMove(p, "a", -1)).toBe(false);
    expect(canMove(p, "a", 1)).toBe(true);
  });

  it("moves an item to another day at its time slot", () => {
    const next = moveItemToDay(plan(), "b", 1);
    expect(names(next, 0)).toEqual(["a:Morning", "c:Dinner"]);
    expect(names(next, 1)).toEqual(["d:Morning", "b:Lunch", "e:Evening"]);
    expect(moveItemToDay(plan(), "b", 9).days[0]!.items).toHaveLength(3);
  });
});

describe("remove and undo", () => {
  it("restores an item to exactly where it was", () => {
    const { itinerary, removed } = removeItem(plan(), "b");
    expect(names(itinerary, 0)).toEqual(["a:Morning", "c:Dinner"]);
    expect(names(restoreItem(itinerary, removed!), 0)).toEqual([
      "a:Morning",
      "b:Lunch",
      "c:Dinner",
    ]);
  });

  it("does not duplicate on a second undo", () => {
    const { itinerary, removed } = removeItem(plan(), "b");
    const once = restoreItem(itinerary, removed!);
    expect(restoreItem(once, removed!)).toBe(once);
  });

  it("clamps the position if the day got shorter meanwhile", () => {
    const { itinerary, removed } = removeItem(plan(), "c");
    const shorter = removeItem(itinerary, "b").itinerary;
    expect(names(restoreItem(shorter, removed!), 0)).toEqual(["a:Morning", "c:Dinner"]);
  });
});

describe("rebuilding a plan", () => {
  it("carries the traveler's own stops to the same day, with fresh ids", () => {
    const mine = addItem(plan(), 1, { ...item("x", "Afternoon"), name: "Aquarium" });
    const fresh = plan();
    const { itinerary, kept } = keepCustomItems(mine, fresh);
    expect(kept).toBe(1);
    expect(names(itinerary, 1)).toEqual(["d:Morning", "Aquarium:Afternoon", "e:Evening"]);
    const ids = itinerary.days.flatMap((d) => d.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("drops own stops on days the new plan doesn't have, and keeps nothing extra", () => {
    const mine = addItem(plan(), 1, item("x", "Morning"));
    const oneDay: Itinerary = { ...plan(), days: [plan().days[0]!] };
    expect(keepCustomItems(mine, oneDay).kept).toBe(0);
    expect(keepCustomItems(null, oneDay).itinerary).toBe(oneDay);
    expect(keepCustomItems(plan(), plan()).kept).toBe(0);
  });
});
