/**
 * Reading one message: places, dates, money, people and preferences, each reader
 * taking out what it used so the next one doesn't misread it ("5 nights" is never
 * a budget, "march 3" is never a group size). Pure and fast; runs in the browser.
 */
import type { Gazetteer } from "./gazetteer";
import { readMoney, type MoneyFacts } from "./money";
import { readPeople, type PeopleFacts } from "./people";
import { readPrefs, type PrefFacts } from "./prefs";
import { normalize, plainName } from "./text";
import { readWhen, type WhenFacts } from "./when";
import { readWhere, type WhereFacts } from "./where";

export interface MessageFacts {
  where: WhereFacts;
  when: Omit<WhenFacts, "rest">;
  money: Omit<MoneyFacts, "rest">;
  people: Omit<PeopleFacts, "rest">;
  prefs: PrefFacts;
  /** The message as read (normalized), for bare answers ("2", "yes") */
  text: string;
  /** What was left over after every reader took its part */
  leftover: string;
}

export interface ReadContext {
  today: string;
  gazetteer: Gazetteer;
  homeCity?: string;
  homeCountry?: string;
}

/** Uppercase words that are never airport codes or state codes. */
const NOT_CODES = new Set([
  "AND",
  "THE",
  "FOR",
  "YOU",
  "CAN",
  "ANY",
  "ALL",
  "BUT",
  "NOT",
  "USA",
  "LOL",
  "OMG",
  "BTW",
  "IDK",
  "TBH",
  "PLS",
  "AKA",
  "ASAP",
  "DIY",
  "FAQ",
  "FYI",
  "AM",
  "PM",
  "OK",
  "TV",
  "BBQ",
  "RV",
  "ATV",
  "VIP",
  "NYE",
  "MLK",
  "UK",
  "EU",
  "US",
  "I",
  "A",
  "AI",
  "WE",
  "ME",
  "MY",
  "IS",
  "IT",
  "IN",
  "ON",
  "OR",
  "TO",
  "SO",
  "NO",
  "GO",
  "DO",
  "BE",
  "AT",
  "BY",
  "HOW",
  "WHO",
  "WHY",
  "NEW",
  "BIG",
  "FUN",
  "SUN",
  "SEA",
  "SKI",
  "SPA",
  "BAR",
  "ZOO",
  "GYM",
  "EAT",
  "ART",
  "MAX",
  "MIN",
  "TOP",
  "OUT",
  "OFF",
  "WAY",
  "DAY",
  "PER",
  "YES",
  "TWO",
  "ONE",
  "SIX",
  "TEN",
  "NOW",
]);

export function readMessage(original: string, ctx: ReadContext): MessageFacts {
  const text = normalize(original);
  const raw = String(original ?? "");
  const shouting = raw.length > 6 && raw === raw.toUpperCase();
  const capitalized = new Set<string>();
  const upperCodes = new Set<string>();
  if (!shouting) {
    for (const m of raw.matchAll(/\b[A-Z][\p{L}'\u2019]*/gu)) capitalized.add(plainName(m[0]));
    for (const m of raw.matchAll(/\b[A-Z]{2,3}\b/g)) if (!NOT_CODES.has(m[0])) upperCodes.add(m[0]);
  }
  const where = readWhere(text, {
    gazetteer: ctx.gazetteer,
    capitalized,
    upperCodes,
    ...(ctx.homeCity ? { homeCity: ctx.homeCity } : {}),
    ...(ctx.homeCountry ? { homeCountry: ctx.homeCountry } : {}),
  });
  const { rest: r1, ...when } = readWhen(where.rest, ctx.today);
  const { rest: r2, ...money } = readMoney(r1);
  const { rest: r3, ...people } = readPeople(r2);
  const prefs = readPrefs(text);
  return { where, when, money, people, prefs, text, leftover: r3 };
}
