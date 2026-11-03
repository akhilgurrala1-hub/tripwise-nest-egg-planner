import { describe, expect, it } from "vitest";

import {
  cleanAiPlan,
  cleanChatAnswer,
  groundedCount,
  matchRealPlace,
  placeLines,
  planLines,
} from "@/lib/ai-quality";
import type { RealPlace } from "@/lib/places/types";

const place = (name: string, typeLabel = "Museum"): RealPlace => ({
  placeId: `wiki:${name}`,
  name,
  kind: "sight",
  typeLabel,
  description: typeLabel,
  address: null,
  rating: null,
  ratingCount: null,
  mapsUrl: `https://maps.example/${encodeURIComponent(name)}`,
  costPerPerson: 0,
  costSource: "unknown",
  interests: ["arts"],
});

describe("AI itinerary answers are checked before they're shown", () => {
  it("returns exactly the trip's days on the trip's dates", () => {
    const short = cleanAiPlan(
      {
        days: [
          {
            title: "Arrive",
            items: [
              {
                time: "Morning",
                kind: "sight",
                name: "Walk",
                area: "",
                note: "",
                costPerPerson: 0,
              },
            ],
          },
        ],
        tips: [],
      },
      { days: 3, startDate: "2026-12-01" },
    );
    expect(short.days.map((d) => d.date)).toEqual(["2026-12-01", "2026-12-02", "2026-12-03"]);
    expect(short.days[2]).toMatchObject({ title: "Free day", items: [] });
    const long = cleanAiPlan(
      { days: Array.from({ length: 9 }, () => ({ title: "x", items: [] })), tips: [] },
      { days: 2, startDate: "2026-12-01" },
    );
    expect(long.days).toHaveLength(2);
  });

  it("drops unknown times, kinds and blank names; sorts by time; removes repeats; bounds prices", () => {
    const plan = cleanAiPlan(
      {
        days: [
          {
            title: "Day",
            items: [
              { time: "Dinner", kind: "restaurant", name: "Bistro", costPerPerson: 40 },
              { time: "Morning", kind: "sight", name: "Castle", costPerPerson: -5 },
              { time: "Brunch", kind: "restaurant", name: "Bad time", costPerPerson: 10 },
              { time: "Lunch", kind: "teleport", name: "Bad kind", costPerPerson: 10 },
              { time: "Afternoon", kind: "sight", name: "   ", costPerPerson: 10 },
              { time: "Afternoon", kind: "sight", name: "castle", costPerPerson: 12 },
              { time: "Evening", kind: "sight", name: "Opera", costPerPerson: 99999 },
              { time: "Lunch", kind: "restaurant", name: "Cafe", costPerPerson: "abc" },
            ],
          },
        ],
        tips: ["  Go early  ", "", 42],
      },
      { days: 1, startDate: "2026-12-01" },
    );
    const items = plan.days[0]!.items;
    expect(items.map((i) => `${i.time}:${i.name}`)).toEqual([
      "Morning:Castle",
      "Lunch:Cafe",
      "Dinner:Bistro",
      "Evening:Opera",
    ]);
    expect(items[0]!.costPerPerson).toBe(0);
    expect(items[1]!.costPerPerson).toBe(0);
    expect(items[3]!.costPerPerson).toBe(1500);
    expect(plan.tips).toEqual(["Go early", "42"]);
  });

  it("shortens runaway text", () => {
    const plan = cleanAiPlan(
      {
        days: [
          {
            title: "T".repeat(200),
            items: [
              {
                time: "Morning",
                kind: "sight",
                name: "N".repeat(200),
                area: "A".repeat(200),
                note: "x ".repeat(200),
                costPerPerson: 1,
              },
            ],
          },
        ],
        tips: [],
      },
      { days: 1, startDate: "2026-12-01" },
    );
    const d = plan.days[0]!;
    expect(d.title.length).toBeLessThanOrEqual(60);
    expect(d.items[0]!.name.length).toBeLessThanOrEqual(80);
    expect(d.items[0]!.note.length).toBeLessThanOrEqual(140);
  });

  it("links stops that name a real nearby place", () => {
    const real = [place("British Museum"), place("Hyde Park", "Royal park")];
    expect(matchRealPlace("The British Museum", real)?.name).toBe("British Museum");
    expect(matchRealPlace("Morning in Hyde Park", real)?.name).toBe("Hyde Park");
    expect(matchRealPlace("Park", real)).toBeNull();
    expect(matchRealPlace("Local bakery", real)).toBeNull();
    const plan = cleanAiPlan(
      {
        days: [
          {
            title: "Day",
            items: [
              { time: "Morning", kind: "sight", name: "The British Museum", costPerPerson: 0 },
              { time: "Lunch", kind: "restaurant", name: "Local bakery", costPerPerson: 9 },
            ],
          },
        ],
        tips: [],
      },
      { days: 1, startDate: "2026-12-01", realPlaces: real },
    );
    expect(plan.days[0]!.items[0]!.mapsUrl).toContain("British%20Museum");
    expect(plan.days[0]!.items[1]!.mapsUrl).toBeUndefined();
    expect(groundedCount(plan)).toBe(1);
  });

  it("describes real places and the current plan compactly for the prompt", () => {
    expect(
      placeLines(
        [place("Louvre")],
        [{ ...place("Chez Paul", "French restaurant"), kind: "restaurant" }],
      ),
    ).toEqual(["Louvre — Museum", "Chez Paul — French restaurant"]);
    const plan = cleanAiPlan(
      {
        days: [
          {
            title: "D",
            items: [{ time: "Morning", kind: "sight", name: "Louvre", costPerPerson: 22 }],
          },
        ],
        tips: [],
      },
      { days: 1, startDate: "2026-12-01" },
    );
    expect(planLines(plan)).toEqual(["Day 1 Morning: Louvre (sight)"]);
  });
});

describe("assistant answers are checked before they're shown", () => {
  const base = {
    reply: "  Sounds great!  ",
    ready: false,
    questions: [
      {
        question: "How many?",
        options: ["2 people", "2 people", "", "Just me", "Family of 4", "Group", "Six"],
      },
      { question: "", options: ["x"] },
      { question: "When?", options: [] },
      { question: "Budget?", options: [] },
      { question: "Style?", options: [] },
    ],
    ideas: [
      { name: "Austin, TX", why: "Live music" },
      { name: "", why: "nothing" },
    ],
    trip: {
      destination: null,
      origin: null,
      startDate: null,
      endDate: null,
      nights: 45.6,
      travelers: 0,
      tripType: null,
      transportMode: null,
      style: null,
      totalBudget: -100,
      interests: ["food", "food"] as "food"[],
    },
  };

  it("bounds questions, options, ideas and numbers", () => {
    const a = cleanChatAnswer(base);
    expect(a.reply).toBe("Sounds great!");
    expect(a.questions.map((q) => q.question)).toEqual(["How many?", "When?", "Budget?"]);
    expect(a.questions[0]!.options).toEqual(["2 people", "Just me", "Family of 4", "Group"]);
    expect(a.ideas).toEqual([{ name: "Austin, TX", why: "Live music" }]);
    expect(a.trip.travelers).toBe(1);
    expect(a.trip.nights).toBe(30);
    expect(a.trip.totalBudget).toBeNull();
    expect(a.trip.interests).toEqual(["food"]);
  });

  it("never shows an empty reply", () => {
    expect(cleanChatAnswer({ ...base, reply: "   " }).reply).toMatch(/Tell me a bit more/);
  });
});
