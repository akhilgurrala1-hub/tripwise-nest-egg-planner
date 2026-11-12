import { describe, expect, it } from "vitest";

import { currentTrip, planKey, tripActions } from "@/lib/trip-store";

import type { Itinerary, ItineraryItem } from "@/lib/itinerary";
import { dayCostPerPerson, parseDayNumber, replaceDay, restoreDay } from "@/lib/itinerary-edit";

const it_ = (id: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id,
  time: "Morning",
  kind: "sight",
  name: id,
  area: "",
  note: "",
  costPerPerson: 10,
  ...over,
});
const plan = (): Itinerary => ({
  source: "demo",
  tips: ["tip"],
  days: [
    {
      day: 1,
      date: "2027-03-01",
      title: "One",
      items: [it_("a1"), it_("a2", { time: "Lunch", kind: "restaurant" })],
    },
    {
      day: 2,
      date: "2027-03-02",
      title: "Two",
      items: [it_("b1", { costPerPerson: 40 }), it_("mine", { custom: true, time: "Afternoon" })],
    },
    { day: 3, date: "2027-03-03", title: "Three", items: [it_("c1", { custom: true })] },
  ],
});

describe("which day a request is about", () => {
  it("finds a day number on the trip and ignores others", () => {
    expect(parseDayNumber("make day 2 cheaper", 3)).toBe(2);
    expect(parseDayNumber("No museums on Day3", 3)).toBe(3);
    expect(parseDayNumber("make day 9 cheaper", 3)).toBeNull();
    expect(parseDayNumber("make it cheaper", 3)).toBeNull();
    expect(parseDayNumber("day 0", 3)).toBeNull();
    // Several days are not one day: the whole plan handles those.
    expect(parseDayNumber("make day 1 and day 2 cheaper", 3)).toBeNull();
    expect(parseDayNumber("day 2 is too long, shorten day 2", 3)).toBe(2);
  });
});

describe("replacing one day", () => {
  it("changes only that day: every other day is the very same object", () => {
    const before = plan();
    const { itinerary } = replaceDay(before, 1, {
      title: "Cheaper",
      items: [it_("n1", { costPerPerson: 5 })],
    });
    expect(itinerary.days[0]).toBe(before.days[0]);
    expect(itinerary.days[2]).toBe(before.days[2]);
    expect(itinerary.tips).toEqual(["tip"]);
    expect(itinerary.days[1]!.title).toBe("Cheaper");
    expect(itinerary.days[1]!.items.map((i) => i.name)).toEqual(["n1", "mine"]);
    expect(itinerary.days[1]!.date).toBe("2027-03-02");
  });

  it("keeps the traveler's own stops on that day, once, with fresh ids, and not on other days", () => {
    const { itinerary, kept } = replaceDay(plan(), 1, { title: "", items: [it_("n1")] });
    expect(kept).toBe(1);
    const mine = itinerary.days[1]!.items.filter((i) => i.custom);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.id).not.toBe("mine");
    expect(itinerary.days[2]!.items.filter((i) => i.custom)).toHaveLength(1);
  });

  it("keeps the old title when the new one is empty, and ignores a day that does not exist", () => {
    const p = plan();
    expect(replaceDay(p, 0, { title: "", items: [] }).itinerary.days[0]!.title).toBe("One");
    expect(replaceDay(p, 9, { title: "x", items: [] }).itinerary).toBe(p);
  });

  it("updates the day's cost, and Undo puts the day back exactly", () => {
    const p = plan();
    const day = p.days[1]!;
    expect(dayCostPerPerson(day)).toBe(50);
    const { itinerary } = replaceDay(p, 1, {
      title: "Cheaper",
      items: [it_("n1", { costPerPerson: 5 })],
    });
    expect(dayCostPerPerson(itinerary.days[1]!)).toBe(15);
    const back = restoreDay(itinerary, 1, day);
    expect(back.days[1]).toEqual(day);
    expect(back.days[0]).toBe(p.days[0]);
  });
});

describe("the store's one-day edit", () => {
  it("replaces one day, refuses a plan for a changed trip, and Undo restores the day", () => {
    tripActions.setItinerary(plan());
    const key = planKey(currentTrip());
    const before = currentTrip().itinerary!;
    expect(tripActions.setDayFor("another-trip", 1, { title: "x", items: [it_("n")] })).toBeNull();
    expect(currentTrip().itinerary).toBe(before);

    const r = tripActions.setDayFor(key, 1, {
      title: "Cheaper",
      items: [it_("n1", { costPerPerson: 5 })],
    });
    expect(r?.kept).toBe(1);
    const after = currentTrip().itinerary!;
    expect(after.days[0]).toBe(before.days[0]);
    expect(after.days[2]).toBe(before.days[2]);
    expect(after.days[1]!.items.map((i) => i.name)).toEqual(["n1", "mine"]);

    tripActions.restoreDay(1, r!.before);
    expect(currentTrip().itinerary!.days[1]).toEqual(before.days[1]);
  });
});
