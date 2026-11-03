import { beforeEach, describe, expect, it, vi } from "vitest";

// The AI SDK is replaced with a scripted model so no credits are spent.
const sdk = vi.hoisted(() => ({
  answers: [] as unknown[],
  calls: [] as { messages: unknown[]; model: string }[],
}));
vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  generateText: async (opts: { messages: unknown[]; model: { modelId: string } }) => {
    sdk.calls.push({ messages: opts.messages, model: opts.model.modelId });
    const next = sdk.answers.shift();
    if (next instanceof Error) throw next;
    return { output: next };
  },
}));

import { planProblems } from "@/lib/ai-quality";
import { aiErrorInfo, fallbackModels } from "@/lib/ai/gateway.server";
import { DEFAULT_MODEL, effortFor, modelFor } from "@/lib/ai/models.server";
import { generateAiItinerary, type AiItineraryRequest } from "@/lib/ai/itinerary-ai.server";
import { runTripChat } from "@/lib/ai/trip-chat.server";

/** An error shaped like the AI SDK's APICallError. */
const apiError = (statusCode: number, message: string) =>
  Object.assign(new Error(`HTTP ${statusCode}`), {
    statusCode,
    responseBody: JSON.stringify({ error: { message } }),
  });

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

const CHAT = {
  messages: [{ role: "user" as const, content: "A weekend in Asheville for 2" }],
  today: "2026-11-03",
  homeCity: "Charlotte, NC",
  draft: null,
  country: "US",
  currency: "USD",
  nearby: [],
};
const ANSWER = {
  reply: "Sounds good.",
  ready: false,
  questions: [],
  ideas: [],
  trip: {
    destination: "Asheville, NC",
    origin: null,
    startDate: null,
    endDate: null,
    nights: null,
    travelers: 2,
    tripType: null,
    transportMode: null,
    style: null,
    totalBudget: null,
    interests: [],
  },
};

describe("when the AI service fails", () => {
  beforeEach(() => {
    sdk.answers = [];
    sdk.calls = [];
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
  });

  it("tries the plain chat API, then a fallback model, before giving up", async () => {
    sdk.answers.push(
      apiError(400, "Unsupported parameter"),
      apiError(404, "Model not found"),
      ANSWER,
    );
    const res = await runTripChat(CHAT);
    expect(res.ok).toBe(true);
    expect(sdk.calls.map((c) => c.model)).toEqual([
      DEFAULT_MODEL,
      DEFAULT_MODEL,
      fallbackModels()[0],
    ]);
  });

  it("says why when every attempt fails", async () => {
    for (let i = 0; i < 4; i++)
      sdk.answers.push(apiError(404, "Model openai/gpt-6-astra not found"));
    const res = await runTripChat(CHAT);
    expect(res).toMatchObject({
      ok: false,
      status: 404,
      error: "The assistant couldn't answer. Try again.",
      detail: "Model openai/gpt-6-astra not found",
    });
  });

  it("doesn't retry (or spend more) when credits run out or it's rate limited", async () => {
    sdk.answers.push(apiError(402, "Not enough credits"));
    const a = await runTripChat(CHAT);
    expect(sdk.calls).toHaveLength(1);
    expect(a).toMatchObject({ ok: false, status: 402 });
    expect(!a.ok && a.error).toContain("out of AI credits");

    sdk.calls = [];
    sdk.answers.push(apiError(429, "Slow down"));
    const b = await runTripChat(CHAT);
    expect(sdk.calls).toHaveLength(1);
    expect(b).toMatchObject({ ok: false, status: 429 });
  });

  it("explains a workspace without AI access", async () => {
    for (let i = 0; i < 4; i++) sdk.answers.push(apiError(403, "AI is disabled"));
    const res = await runTripChat(CHAT);
    expect(!res.ok && res.error).toContain("Turn on Lovable AI");
  });

  it("reads the service's message without echoing secrets", () => {
    expect(aiErrorInfo(apiError(401, "Invalid key sk-abcdefghijklmnopqrstu"))).toEqual({
      status: 401,
      detail: "Invalid key [hidden]",
    });
    expect(aiErrorInfo(new Error("socket hang up"))).toEqual({
      status: 500,
      detail: "socket hang up",
    });
  });

  it("the itinerary planner falls back the same way", async () => {
    sdk.answers.push(apiError(404, "Model not found"), {
      days: [good(1), good(2)],
      tips: [],
    });
    const res = await generateAiItinerary(REQ);
    expect(res.ok).toBe(true);
    expect(sdk.calls).toHaveLength(2);
  });
});
