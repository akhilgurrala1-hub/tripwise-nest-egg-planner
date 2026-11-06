import { describe, expect, it } from "vitest";

import rows from "@/data/airports.json";
import townRows from "@/data/towns.json";
import type { ChatAnswer } from "@/lib/ai-quality";
import { toAirport, type AirportRow } from "@/lib/airports";
import { townsFrom } from "@/lib/towns";
import { emptyDraft, understand, type ConversationTurn } from "@/lib/understand/conversation";
import { gazetteer } from "@/lib/understand/gazetteer";
import { factLines, localAnswer, questionField, reconcile } from "@/lib/understand/reply";

const g = gazetteer(
  (rows as unknown as AirportRow[]).map(toAirport),
  townsFrom(townRows as unknown[]),
);
const ctx = {
  today: "2026-11-05",
  gazetteer: g,
  homeCity: "Charlotte, NC",
  homeCountry: "US",
  from: { lat: 35.22, lon: -80.84 },
};

/** Talk to Waypoint's own assistant: each message gets its answer, which shapes the next. */
function chat(...messages: string[]) {
  const turns: ConversationTurn[] = [];
  let answer = localAnswer(understand([], ctx), ctx);
  for (const m of messages) {
    turns.push({ role: "user", content: m });
    answer = localAnswer(understand(turns, ctx), ctx);
    turns.push({ role: "assistant", content: answer.reply, fields: answer.fields });
  }
  return { answer, u: understand(turns, ctx) };
}

const aiAnswer = (
  trip: Partial<ChatAnswer["trip"]>,
  rest: Partial<ChatAnswer> = {},
): ChatAnswer => ({
  reply: "Sounds great.",
  ready: true,
  questions: [],
  ideas: [],
  trip: { ...emptyDraft(), ...trip },
  ...rest,
});

describe("Waypoint's own assistant", () => {
  it("asks the basics, with tap answers, when the message says nothing", () => {
    const { answer } = chat("help");
    expect(answer.ready).toBe(false);
    expect(answer.fields).toEqual(["destination", "dates", "travelers"]);
    expect(answer.questions.every((q) => q.options.length >= 3)).toBe(true);
    expect(answer.ideas.length).toBeGreaterThan(0);
  });

  it("every tap answer it offers is understood", () => {
    const { answer } = chat("help");
    const [where, when, who] = answer.questions;
    // Kinds of places lead to ideas; dates, lengths and group sizes fill the trip.
    for (const o of where!.options) expect(chat("help", o).u.unsure).toBe(true);
    for (const o of when!.options) expect(chat("help", o).u.draft.startDate).not.toBeNull();
    for (const o of who!.options) expect(chat("help", o).u.draft.travelers).toBeGreaterThan(0);
    for (const o of ["A weekend", "4 nights", "A week", "2 weeks"])
      expect(chat("Rome next month", o).u.draft.nights).toBeGreaterThan(0);
    const styles: [string, string][] = [
      ["Keep it cheap", "budget"],
      ["Comfortable", "comfort"],
      ["Treat ourselves", "luxury"],
    ];
    for (const [o, style] of styles)
      expect(chat("Rome next month for a week, 2 of us", o).u.draft.style).toBe(style);
  });

  it("builds the trip one answer at a time, with bare answers in the right place", () => {
    const { answer, u } = chat("i wanna go somewhere", "Denver", "next weekend", "2");
    expect(u.draft.destination).toBe("Denver, CO");
    expect(u.draft.startDate).toBe("2026-11-13");
    expect(u.draft.travelers).toBe(2);
    expect(answer.ready).toBe(true);
    expect(answer.reply).toMatch(/Denver, CO/);
  });

  it("goes deeper once the basics are known, and never asks the same thing twice", () => {
    const first = chat("Rome for a week in May, 2 of us").answer;
    expect(first.ready).toBe(true);
    expect(first.fields.length).toBeGreaterThan(0);
    const second = chat("Rome for a week in May, 2 of us", "something else").answer;
    for (const f of first.fields) expect(second.fields).not.toContain(f);
  });

  it("narrows a country to a city", () => {
    const one = chat("2 weeks in japan in april, just me");
    expect(one.answer.fields[0]).toBe("narrow");
    expect(one.answer.questions[0]!.options).toContain("Tokyo, Japan");
    const two = chat("2 weeks in japan in april, just me", "Kyoto, Japan");
    expect(two.u.draft.destination).toBe("Kyoto, Japan");
    expect(two.answer.ready).toBe(true);
  });

  it("asks which one for 'paris or rome', and 'both' makes it a route", () => {
    const one = chat("paris or rome for 6 nights in may, 2 of us");
    expect(one.answer.questions[0]!.question).toMatch(/Paris or Rome/);
    expect(chat("paris or rome for 6 nights in may, 2 of us", "Rome").u.draft.destination).toBe(
      "Rome, Italy",
    );
    const both = chat("paris or rome for 6 nights in may, 2 of us", "Both").u.draft;
    expect(both.cities.map((c) => c.name.split(",")[0])).toEqual(["Paris", "Rome"]);
    expect(both.cities.reduce((t, c) => t + c.nights, 0)).toBe(6);
  });

  it("'not sure yet' gives a date to start from instead of asking forever", () => {
    const { u, answer } = chat("Austin for a long weekend with my wife", "Not sure yet");
    expect(u.draft.startDate).not.toBeNull();
    expect(answer.ready).toBe(true);
    expect(answer.reply).toMatch(/starting point/);
  });

  it("checks the group when it's a guess", () => {
    const { answer } = chat("orlando for a week in june with the kids");
    expect(answer.fields).toContain("travelers");
  });
});

describe("checking the AI's answers", () => {
  const said = "3 nights in rome, 2 in florence and 2 in venice for 2 people from may 7";
  const u = understand([{ role: "user", content: said }], ctx);

  it("puts back cities the AI dropped", () => {
    const fixed = reconcile(
      aiAnswer({ destination: "Rome, Italy", startDate: "2027-05-07", nights: 7, travelers: 2 }),
      u,
      ctx,
      [said],
    );
    expect(fixed.trip.cities.map((c) => c.name.split(",")[0])).toEqual([
      "Rome",
      "Florence",
      "Venice",
    ]);
    expect(fixed.reply).toMatch(/kept every city/);
    expect(fixed.ready).toBe(true);
  });

  it("drops a budget the traveler never gave, keeps one they did", () => {
    const invented = reconcile(
      aiAnswer({
        destination: "Rome, Italy",
        totalBudget: 4200,
        startDate: "2027-05-07",
        nights: 7,
        travelers: 2,
      }),
      u,
      ctx,
      [said],
    );
    expect(invented.trip.totalBudget).toBeNull();
    const own = "rome may 7 for a week, 2 of us, 3.5k";
    const u2 = understand([{ role: "user", content: own }], ctx);
    expect(
      reconcile(aiAnswer({ destination: "Rome, Italy", totalBudget: 2000 }), u2, ctx, [own]).trip
        .totalBudget,
    ).toBe(3500);
  });

  it("replaces past or wrong dates with the traveler's", () => {
    const fixed = reconcile(
      aiAnswer({ destination: "Rome, Italy", startDate: "2025-05-07", nights: 7, travelers: 2 }),
      u,
      ctx,
      [said],
    );
    expect(fixed.trip.startDate).toBe("2027-05-07");
  });

  it("isn't ready when the AI says it is but something's missing", () => {
    const vague = "somewhere warm";
    const u3 = understand([{ role: "user", content: vague }], ctx);
    const fixed = reconcile(aiAnswer({ destination: null }), u3, ctx, [vague]);
    expect(fixed.ready).toBe(false);
    expect(fixed.questions.length).toBeGreaterThan(0);
  });

  it("drops questions about things the traveler already said", () => {
    const fixed = reconcile(
      aiAnswer(
        { destination: "Rome, Italy", startDate: "2027-05-07", nights: 7, travelers: 2 },
        {
          ready: false,
          questions: [
            { question: "How many people are going?", options: ["1", "2"] },
            { question: "What do you like to do?", options: ["Food"] },
          ],
        },
      ),
      u,
      ctx,
      [said],
    );
    expect(fixed.questions.map((q) => q.question)).not.toContain("How many people are going?");
    expect(fixed.ready).toBe(true);
  });

  it("knows what an AI question is about", () => {
    expect(questionField("Where are you leaving from?")).toBe("origin");
    expect(questionField("How many people are traveling?")).toBe("travelers");
    expect(questionField("When would you like to go?")).toBe("dates");
    expect(questionField("How long is the trip?")).toBe("length");
    expect(questionField("Do you have a budget in mind?")).toBe("budget");
    expect(questionField("Which part of Japan?")).toBe("narrow");
  });

  it("tells the AI what was already read", () => {
    const lines = factLines(u);
    expect(lines[0]).toMatch(
      /Rome, Italy \(3 nights\), Florence, Italy \(2 nights\), Venice, Italy \(2 nights\)/,
    );
    expect(lines.some((l) => /Travelers: 2/.test(l))).toBe(true);
  });
});

describe("no hotel means no hotel money", () => {
  it("leaves lodging out of the budget, the booking list and the plan", async () => {
    const { setupFromDraft } = await import("@/lib/assistant");
    const { buildTrip, sampleSetup } = await import("@/lib/trip-store");
    const { calculateBudget, tripShape } = await import("@/lib/budget");
    const { bookingPlan } = await import("@/lib/booking");
    const { destinationFor } = await import("@/lib/demo-data");
    const u = understand(
      [
        {
          role: "user",
          content: "Rome then Florence for a week in May, 2 of us, we don't need a hotel",
        },
      ],
      ctx,
    );
    const setup = setupFromDraft(u.draft, sampleSetup(), ctx.today);
    const trip = buildTrip(setup);
    const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
    const totals = calculateBudget(trip.inputs, shape, setup.totalBudget, setup.emergencyFund);
    expect(totals.categories.accommodations).toBe(0);
    expect(
      bookingPlan(trip, destinationFor(setup), shape, totals).some((i) => i.kind === "hotel"),
    ).toBe(false);
  });

  it("keeps hotels for people who want one", () => {
    for (const m of [
      "we need a hotel near the beach",
      "find me a hotel in rome",
      "is the hotel booked?",
      "we have a hotel in mind",
    ])
      expect(understand([{ role: "user", content: m }], ctx).draft.covered.lodging).toBe(false);
  });
});

describe("nonstop or stops", () => {
  const stops = (m: string) => understand([{ role: "user", content: m }], ctx).draft.stops;
  it("reads how they feel about stops", () => {
    expect(stops("Tokyo in April for a week, nonstop flights only")).toBe("nonstop");
    expect(stops("london in may, 2 of us, no layovers please")).toBe("nonstop");
    expect(stops("direct flight to cancun next month")).toBe("nonstop");
    expect(stops("bali for 2 weeks, one stop max")).toBe("one");
    expect(stops("rome in june, 1 layover is fine")).toBe("one");
    expect(stops("cheapest flights to lisbon, layovers are fine")).toBe("any");
    expect(stops("paris in march, i dont mind stops")).toBe("any");
    expect(stops("paris in march")).toBeNull();
  });

  it("asks once for a flight, and every tap answer is understood", () => {
    const first = chat("Tokyo for a week in April, just me").answer;
    expect(first.fields).toContain("stops");
    const q = first.questions[first.fields.indexOf("stops")]!;
    const want = ["nonstop", "one", "any"];
    q.options.forEach((o, i) =>
      expect(chat("Tokyo for a week in April, just me", o).u.draft.stops).toBe(want[i]),
    );
  });

  it("goes from the conversation to the trip and its booking links", async () => {
    const { setupFromDraft } = await import("@/lib/assistant");
    const { buildTrip, sampleSetup } = await import("@/lib/trip-store");
    const { calculateBudget, tripShape } = await import("@/lib/budget");
    const { bookingPlan } = await import("@/lib/booking");
    const { destinationFor } = await import("@/lib/demo-data");
    const u = understand(
      [{ role: "user", content: "Tokyo for a week in April, just me, nonstop only" }],
      ctx,
    );
    const setup = setupFromDraft(u.draft, { ...sampleSetup(), origin: "Charlotte, NC" }, ctx.today);
    expect(setup.flightStops).toBe("nonstop");
    const trip = buildTrip(setup);
    const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
    const totals = calculateBudget(trip.inputs, shape, setup.totalBudget, setup.emergencyFund);
    const flight = bookingPlan(trip, destinationFor(setup), shape, totals, "", ["CLT", "HND"]).find(
      (i) => i.key === "flight",
    )!;
    expect(flight.detail).toMatch(/Nonstop only/);
    expect(flight.links[0]!.url).toMatch(/nonstop/i);
    expect(flight.links.find((l) => l.label === "KAYAK")!.url).toMatch(/fs=stops=0/);
  });
});
