import { describe, expect, it } from "vitest";

import { joinChunkPlans, planChunks, shareOf, SINGLE_REQUEST_DAYS } from "@/lib/ai-chunks";
import { calculateBudget, tripShape } from "@/lib/budget";
import { addDays, dateRangeError, MAX_TRIP_DAYS, todayIso } from "@/lib/dates";
import { citySchedule } from "@/lib/multi-city";
import { buildTrip, sampleSetup, tripLegs } from "@/lib/trip-store";
import { planWeather, recordYearsBack, yearsEarlier } from "@/lib/live/weather";
import type { Itinerary } from "@/lib/itinerary";

const today = todayIso();

describe("trips of any length", () => {
  it("allows trips up to a year, planned any time ahead", () => {
    const start = addDays(today, 500);
    expect(MAX_TRIP_DAYS).toBe(365);
    expect(dateRangeError(start, addDays(start, 89))).toBe("");
    expect(dateRangeError(start, addDays(start, 364))).toBe("");
    expect(dateRangeError(start, addDays(start, 365))).toMatch(/up to 365 days/);
  });

  it("builds a full plan and budget for a two-month stay", () => {
    const start = addDays(today, 60);
    const setup = { ...sampleSetup(), startDate: start, endDate: addDays(start, 59) };
    const trip = buildTrip(setup);
    expect(trip.itinerary!.days).toHaveLength(60);
    const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
    const t = calculateBudget(trip.inputs, shape, setup.totalBudget, setup.emergencyFund);
    expect(t.categories.accommodations).toBeGreaterThan(0);
    expect(shape.nights).toBe(59);
  });

  it("plans a long multi-city trip city by city", () => {
    const start = addDays(today, 30);
    const setup = {
      ...sampleSetup(),
      tripType: "flight" as const,
      transportMode: "flight" as const,
      startDate: start,
      endDate: addDays(start, 44),
      cities: [
        { name: "Kyoto, Japan", nights: 14 },
        { name: "Osaka, Japan", nights: 10 },
      ],
    };
    const legs = tripLegs(setup);
    expect(legs.map((l) => l.nights)).toEqual([20, 14, 10]);
    const days = buildTrip(setup).itinerary!.days;
    expect(days).toHaveLength(45);
    expect(days[20]!.title).toBe("Travel to Kyoto");
    expect(days[34]!.title).toBe("Travel to Osaka");
  });
});

describe("the AI plans long trips in parts", () => {
  it("one request for up to two weeks", () => {
    const legs = citySchedule(13, { name: "Rome", point: null }, []);
    expect(planChunks(legs, 14, 14)).toHaveLength(1);
    expect(SINGLE_REQUEST_DAYS).toBe(14);
  });

  it("splits long stays evenly and never across a city change", () => {
    const legs = citySchedule(44, { name: "Tokyo", point: null }, [
      { name: "Kyoto", nights: 14 },
      { name: "Osaka", nights: 10 },
    ]);
    const chunks = planChunks(legs, 45);
    // Tokyo 20 days → 10 + 10, Kyoto 14 → 7 + 7, Osaka 11 (10 nights + day home) → 6 + 5.
    expect(chunks.map((c) => [c.city, c.from, c.days])).toEqual([
      [0, 0, 10],
      [0, 10, 10],
      [1, 20, 7],
      [1, 27, 7],
      [2, 34, 6],
      [2, 40, 5],
    ]);
    expect(chunks.filter((c) => c.travelDay).map((c) => c.from)).toEqual([20, 34]);
    // Every day is covered exactly once.
    const covered = chunks.flatMap((c) => Array.from({ length: c.days }, (_, i) => c.from + i));
    expect(covered).toEqual(Array.from({ length: 45 }, (_, i) => i));
  });

  it("shares a city's places out between its parts", () => {
    const places = ["a", "b", "c", "d", "e"];
    expect(shareOf(places, 0, 2)).toEqual(["a", "c", "e"]);
    expect(shareOf(places, 1, 2)).toEqual(["b", "d"]);
    expect(shareOf(places, 0, 1)).toEqual(places);
  });

  it("joins the parts into one plan, numbered and dated", () => {
    const start = addDays(today, 10);
    const legs = citySchedule(19, { name: "Lisbon", point: null }, []);
    const chunks = planChunks(legs, 20);
    const part = (n: number): Itinerary => ({
      source: "ai",
      tips: [`tip ${n}`],
      days: Array.from({ length: 10 }, (_, i) => ({
        day: i + 1,
        date: "x",
        title: `Part ${n} day ${i + 1}`,
        items: [
          {
            id: `d${i + 1}-a`,
            time: "Morning",
            kind: "sight",
            name: `S${n}-${i}`,
            area: "",
            note: "",
            costPerPerson: 0,
          },
        ],
      })),
    });
    const plan = joinChunkPlans(chunks, [part(1), part(2)], start);
    expect(plan.days).toHaveLength(20);
    expect(plan.days[10]!.day).toBe(11);
    expect(plan.days[10]!.date).toBe(addDays(start, 10));
    expect(plan.days[10]!.title).toBe("Part 2 day 1");
    const ids = plan.days.flatMap((d) => d.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(plan.tips).toEqual(["tip 1", "tip 2"]);
  });
});

describe("weather for trips far ahead", () => {
  it("uses last year's record, or earlier when the trip is more than a year out", () => {
    expect(recordYearsBack(addDays(today, 60), today)).toBe(1);
    expect(recordYearsBack(addDays(today, 500), today)).toBe(2);
    expect(yearsEarlier("2028-02-29", 1)).toBe("2027-02-28");
    const plan = planWeather(addDays(today, 400), addDays(today, 430), today);
    expect(plan.forecast).toBeNull();
    expect(plan.typical).not.toBeNull();
  });
});
