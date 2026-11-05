/**
 * The trip assistant against 10,000 messages and conversations people really type
 * (tools/corpus/assistant-prompts.jsonl, generated with expected answers by the
 * Python tools). Every field Waypoint reads is scored; the test fails if any field
 * drops below its bar, and prints the cases it got wrong so they can be fixed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import rows from "@/data/airports.json";
import { toAirport, type AirportRow } from "@/lib/airports";
import { understand, missingRequired, type ConversationTurn } from "@/lib/understand/conversation";
import { gazetteer } from "@/lib/understand/gazetteer";
import { localAnswer } from "@/lib/understand/reply";
import { plainName } from "@/lib/understand/text";

interface Case {
  id: number;
  kind: string;
  today: string;
  messages?: string[];
  turns?: ({ user: string } | { asked: string[] })[];
  expect: {
    dest?: string | null;
    ask?: string;
    cities?: string[];
    cityNights?: number[];
    origin?: string;
    start?: string;
    approx?: boolean;
    nights?: number;
    travelers?: number;
    budget?: number;
    style?: string;
    cabin?: string;
    tripType?: string;
    interests?: string[];
    covered?: Record<string, boolean>;
  };
}

const cases: Case[] = readFileSync(
  resolve(__dirname, "../../tools/corpus/assistant-prompts.jsonl"),
  "utf8",
)
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Case);

const g = gazetteer((rows as unknown as AirportRow[]).map(toAirport));
const town = (name: string | null | undefined) => plainName((name ?? "").split(",")[0] ?? "");

/** The bar each field must clear (share of cases where it's read right). */
const BAR: Record<string, number> = {
  dest: 0.995,
  ask: 0.99,
  cities: 0.995,
  cityNights: 0.995,
  origin: 0.99,
  start: 0.995,
  nights: 0.995,
  travelers: 0.995,
  budget: 0.995,
  style: 0.98,
  cabin: 0.98,
  tripType: 0.97,
  interests: 0.97,
  covered: 0.97,
  reply: 1,
};

function run(c: Case) {
  const turns: ConversationTurn[] = c.messages
    ? c.messages.map((content) => ({ role: "user", content }))
    : c.turns!.map((t) =>
        "user" in t
          ? { role: "user", content: t.user }
          : { role: "assistant", content: "", fields: t.asked as never },
      );
  const ctx = {
    today: c.today,
    gazetteer: g,
    homeCity: "Charlotte, NC",
    homeCountry: "US",
    from: { lat: 35.22, lon: -80.84 },
  };
  const u = understand(turns, ctx);
  return { u, answer: localAnswer(u, ctx) };
}

describe("the trip assistant reads 10,000 real-world messages", () => {
  it("has the whole test set", () => {
    expect(cases.length).toBe(10_000);
  });

  it("reads every field well enough", () => {
    const score: Record<string, { ok: number; all: number; misses: string[] }> = {};
    const check = (field: string, ok: boolean, c: Case, got: unknown) => {
      const s = (score[field] ??= { ok: 0, all: 0, misses: [] });
      s.all++;
      if (ok) s.ok++;
      else if (s.misses.length < 12)
        s.misses.push(
          `#${c.id} ${JSON.stringify(c.messages ?? c.turns?.filter((t) => "user" in t).map((t) => (t as { user: string }).user))} → got ${JSON.stringify(got)}, want ${JSON.stringify((c.expect as Record<string, unknown>)[field])}`,
        );
    };
    for (const c of cases) {
      const { u, answer } = run(c);
      const d = u.draft;
      const e = c.expect;
      // Every answer renders: a reply, and questions with tappable answers.
      check(
        "reply",
        !!answer.reply && answer.questions.every((q) => q.question.length > 0),
        c,
        answer.reply,
      );
      if (e.dest === null) check("dest", !d.destination && !d.cities.length, c, d.destination);
      else if (e.dest !== undefined)
        check("dest", town(d.destination) === e.dest, c, d.destination);
      if (e.ask)
        check(
          "ask",
          missingRequired(u).includes(e.ask as never) && answer.questions.length > 0,
          c,
          missingRequired(u),
        );
      if (e.cities)
        check(
          "cities",
          JSON.stringify(d.cities.map((x) => town(x.name))) === JSON.stringify(e.cities),
          c,
          d.cities.map((x) => x.name),
        );
      if (e.cityNights)
        check(
          "cityNights",
          JSON.stringify(d.cities.map((x) => x.nights)) === JSON.stringify(e.cityNights),
          c,
          d.cities.map((x) => x.nights),
        );
      if (e.origin) check("origin", town(d.origin) === e.origin, c, d.origin);
      if (e.start) check("start", d.startDate === e.start, c, d.startDate);
      if (e.nights !== undefined) check("nights", d.nights === e.nights, c, d.nights);
      if (e.travelers) check("travelers", d.travelers === e.travelers, c, d.travelers);
      if (e.budget) check("budget", d.totalBudget === e.budget, c, d.totalBudget);
      if (e.style) check("style", d.style === e.style, c, d.style);
      if (e.cabin) check("cabin", d.cabin === e.cabin, c, d.cabin);
      if (e.tripType) check("tripType", d.tripType === e.tripType, c, d.tripType);
      if (e.interests)
        check(
          "interests",
          e.interests.every((i) => d.interests.includes(i as never)),
          c,
          d.interests,
        );
      if (e.covered)
        check(
          "covered",
          Object.keys(e.covered).every((k) => d.covered[k as "lodging"]),
          c,
          d.covered,
        );
    }
    const report = Object.entries(score)
      .map(
        ([f, s]) =>
          `${f.padEnd(11)} ${((100 * s.ok) / s.all).toFixed(2).padStart(6)}%  (${s.ok}/${s.all})`,
      )
      .join("\n");
    console.log(`Trip assistant accuracy on ${cases.length} cases:\n${report}`);
    const failing = Object.entries(score).filter(([f, s]) => s.ok / s.all < (BAR[f] ?? 0.98));
    // CORPUS_REPORT=1 prints a sample of misses for every field, to keep improving.
    const show = process.env["CORPUS_REPORT"] ? Object.entries(score) : failing;
    for (const [f, s] of show)
      if (s.misses.length) console.log(`\n${f} misses:\n${s.misses.join("\n")}`);
    expect(failing.map(([f]) => f)).toEqual([]);
  }, 120_000);
});
