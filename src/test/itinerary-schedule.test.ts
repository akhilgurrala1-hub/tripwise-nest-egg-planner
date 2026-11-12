import { describe, expect, it } from "vitest";

import type { ItineraryItem } from "@/lib/itinerary";
import { clock, plainHours, scheduleDay, travelBetween } from "@/lib/itinerary-schedule";

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: "a",
  time: "Morning",
  kind: "sight",
  name: "Place",
  area: "",
  note: "",
  costPerPerson: 0,
  ...over,
});
// Two points about half a mile apart, and one about 30 miles away (Chicago area).
const A = { lat: 41.88, lon: -87.63 };
const NEAR = { lat: 41.888, lon: -87.63 };
const FAR = { lat: 42.3, lon: -88.0 };

describe("travel estimates", () => {
  it("is null when either place has no coordinates: nothing is invented", () => {
    expect(travelBetween(item({ ...A }), item({}))).toBeNull();
    expect(travelBetween(item({}), item({ ...FAR }))).toBeNull();
  });
  it("walks short hops and drives long ones", () => {
    expect(travelBetween(item({ ...A }), item({ ...NEAR }))?.mode).toBe("walk");
    const far = travelBetween(item({ ...A }), item({ ...FAR }));
    expect(far?.mode).toBe("drive");
    expect(far!.minutes).toBeGreaterThan(60);
  });
});

describe("a timed day", () => {
  it("starts each stop at its slot and ends it after a typical visit", () => {
    const day = scheduleDay([
      item({ id: "1", time: "Morning" }),
      item({ id: "2", time: "Lunch", kind: "restaurant" }),
    ]);
    expect(clock(day[0]!.start)).toBe("9:00 AM");
    expect(clock(day[0]!.end)).toBe("11:00 AM");
    expect(clock(day[1]!.start)).toBe("12:30 PM");
    expect(day[1]!.warnings).toEqual([]);
  });

  it("pushes the next stop later when travel does not fit, and says so", () => {
    const day = scheduleDay([
      item({ id: "1", time: "Morning", ...A }),
      item({ id: "2", time: "Afternoon", ...FAR }),
      item({ id: "3", time: "Dinner", kind: "restaurant", ...A }),
    ]);
    // Morning ends 11:00, a 60+ minute drive still fits before 2 PM; the drive back is long.
    expect(day[1]!.travel?.mode).toBe("drive");
    expect(day[2]!.start).toBeGreaterThanOrEqual(day[1]!.end + day[2]!.travel!.minutes);
    expect(day[2]!.warnings.join(" ")).toMatch(/travel/i);
  });

  it("warns when published plain hours do not cover the visit, and stays quiet for unclear hours", () => {
    const early = scheduleDay([item({ hours: "Daily 10AM-5PM" })]);
    expect(early[0]!.warnings.join(" ")).toMatch(/Check the hours/);
    expect(scheduleDay([item({ hours: "Daily 8AM-6PM" })])[0]!.warnings).toEqual([]);
    expect(scheduleDay([item({ hours: "Tu-Su 10AM-5PM; Mo closed" })])[0]!.warnings).toEqual([]);
  });

  it("reads only plain daily hours", () => {
    expect(plainHours("Daily 9AM-5PM")).toEqual({ open: 540, close: 1020 });
    expect(plainHours("9:30 AM - 5:30 PM")).toEqual({ open: 570, close: 1050 });
    expect(plainHours("Mon-Fri 9AM-5PM")).toBeNull();
    expect(plainHours(null)).toBeNull();
  });
});
