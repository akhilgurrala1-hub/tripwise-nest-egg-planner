import { beforeEach, describe, expect, it, vi } from "vitest";

// The AI SDK is replaced with a scripted model so no credits are spent.
const sdk = vi.hoisted(() => ({
  answers: [] as unknown[],
  calls: [] as { messages: unknown[] }[],
}));
vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  streamText: (opts: { messages: unknown[] }) => {
    sdk.calls.push({ messages: opts.messages });
    const next = sdk.answers.shift();
    return { output: next instanceof Error ? Promise.reject(next) : Promise.resolve(next) };
  },
}));

import { planProblems } from "@/lib/ai-quality";
import { DEFAULT_MODEL, effortFor, modelFor } from "@/lib/ai/models.server";
import { generateAiItinerary, type AiItineraryRequest } from "@/lib/ai/itinerary-ai.server";

const item = (name: string, kind = "sight", costPerPerson = 0, time = "Morning") => ({
  time,
  kind,
  name,
  area: "",
  note: "",
  costPerPerson,
});
const day = (n: number, items: ReturnType<typeof item>[]) => ({ day: n, title: `Day ${n}`, items });
const good = (n: number) =>
  day(n, [
    item(`Sight ${n}A`),
    item(`Lunch ${n}`, "restaurant", 15, "Lunch"),
    item(`Sight ${n}B`, "sight", 10, "Afternoon"),
    item(`Dinner ${n}`, "restaurant", 30, "Dinner"),
  ]);

const want = { days: 2, activityBudgetPerPerson: 100, foodBudgetPerPersonDay: 60 };

describe("checking an AI plan", () => {
  it("passes a complete plan within budget", () => {
    expect(planProblems({ days: [good(1), good(2)] }, want)).toEqual([]);
  });

  it("names each problem as something to fix", () => {
    const problems = planProblems(
      {
        days: [
          day(1, [item("Ryman Auditorium", "sight", 200), item("Steakhouse", "restaurant", 200)]),
          day(2, [item("Ryman Auditorium"), item("A"), item("B")]),
        ],
      },
      want,
    );
    expect(problems).toEqual([
      "Day 1 has only 2 item(s); give it at least 4.",
      '"Ryman Auditorium" is on day 1 and day 2; use it once.',
      "Sightseeing adds up to $200 per person but the budget is $100; swap in free or cheaper sights.",
      "Meals average $100 per person per day but the food budget is $60; choose cheaper restaurants.",
    ]);
    expect(planProblems({ days: [good(1)] }, want)[0]).toBe(
      "Return exactly 2 days (you returned 1).",
    );
  });
});

describe("model settings", () => {
  it("defaults to today's model and effort", () => {
    expect(modelFor("planner", {})).toBe(DEFAULT_MODEL);
    expect(effortFor("chat", {})).toBe("low");
  });

  it("can be switched with Lovable Cloud secrets, ignoring junk", () => {
    expect(modelFor("planner", { AI_PLANNER_MODEL: "google/gemini-3-pro" })).toBe(
      "google/gemini-3-pro",
    );
    expect(modelFor("chat", { AI_CHAT_MODEL: "not a model; rm" })).toBe(DEFAULT_MODEL);
    expect(effortFor("planner", { AI_PLANNER_EFFORT: "High" })).toBe("high");
    expect(effortFor("planner", { AI_PLANNER_EFFORT: "max" })).toBe("low");
  });
});

const REQ: AiItineraryRequest = {
  destination: "Nashville, TN",
  region: "",
  origin: "Atlanta, GA",
  tripType: "Road trip",
  style: "Comfort",
  days: 2,
  startDate: "2026-12-03",
  travelers: 2,
  interests: ["Arts & music"],
  activityBudgetPerPerson: 100,
  foodBudgetPerPersonDay: 60,
  weather: [],
  places: [],
  guide: [],
  notes: [],
  instructions: "",
  current: [],
};

describe("the AI planner's review pass", () => {
  beforeEach(() => {
    sdk.answers = [];
    sdk.calls = [];
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
  });

  it("makes one call when the first plan is fine", async () => {
    sdk.answers.push({ days: [good(1), good(2)], tips: [] });
    const res = await generateAiItinerary(REQ);
    expect(res.ok).toBe(true);
    expect(sdk.calls).toHaveLength(1);
  });

  it("asks once for fixes and keeps the better plan", async () => {
    sdk.answers.push({ days: [good(1)], tips: [] }, { days: [good(1), good(2)], tips: ["Fixed"] });
    const res = await generateAiItinerary(REQ);
    expect(sdk.calls).toHaveLength(2);
    const followUp = JSON.stringify(sdk.calls[1]!.messages);
    expect(followUp).toContain("Return exactly 2 days (you returned 1).");
    expect(res.ok && res.itinerary.tips).toEqual(["Fixed"]);
  });

  it("keeps the first plan when the fix is no better or fails", async () => {
    sdk.answers.push({ days: [good(1)], tips: ["First"] }, { days: [], tips: [] });
    const a = await generateAiItinerary(REQ);
    expect(a.ok && a.itinerary.tips).toEqual(["First"]);

    sdk.answers.push({ days: [good(1)], tips: ["First"] }, new Error("gateway hiccup"));
    const b = await generateAiItinerary(REQ);
    expect(b.ok && b.itinerary.tips).toEqual(["First"]);
  });
});
