/**
 * Messages written by hand, the way real travelers type (not generated from the
 * same templates as the 10,000-case set), with what a person would understand.
 * Read on Thursday, November 5, 2026, from Charlotte, NC.
 */
import { describe, expect, it } from "vitest";

import rows from "@/data/airports.json";
import { toAirport, type AirportRow } from "@/lib/airports";
import { missingRequired, understand } from "@/lib/understand/conversation";
import { gazetteer } from "@/lib/understand/gazetteer";

const g = gazetteer((rows as unknown as AirportRow[]).map(toAirport));
const ctx = { today: "2026-11-05", gazetteer: g, homeCity: "Charlotte, NC", homeCountry: "US" };
const town = (s: string | null) => (s ?? "").split(",")[0];

type Want = {
  dest?: string | null;
  cities?: string[];
  origin?: string;
  start?: string;
  nights?: number;
  travelers?: number | null;
  budget?: number;
  tripType?: string;
  style?: string;
  cabin?: string;
  interests?: string[];
  covered?: string[];
  asks?: string;
};

const GOLDEN: [string, Want][] = [
  [
    "Hey! My boyfriend and I want to do something special for our 5 year anniversary in February. Thinking Paris or maybe Rome? We have about $5k",
    { dest: null, start: "2027-02-05", travelers: 2, budget: 5000, asks: "destination" },
  ],
  [
    "need to get outta here for a few days, somewhere I can hike, leaving friday",
    { dest: null, start: "2026-11-06", nights: 2, interests: ["nature"], asks: "destination" },
  ],
  [
    "Can you plan a 10 day Japan trip for me and my two teenage sons, mostly Tokyo and Kyoto, sometime next spring?",
    {
      cities: ["Tokyo", "Kyoto"],
      nights: 9,
      travelers: 3,
      start: "2027-04-02",
      tripType: "flight",
    },
  ],
  [
    "bachelorette weekend nashville jan 16-18, 9 girls, wanna party",
    { dest: "Nashville", start: "2027-01-16", nights: 2, travelers: 9, interests: ["nightlife"] },
  ],
  [
    "We're a family of 6 (4 kids under 10) and we want to drive to the beach this summer for a week, not too expensive",
    {
      dest: null,
      travelers: 6,
      nights: 7,
      tripType: "road-trip",
      interests: ["beaches", "family"],
      asks: "destination",
    },
  ],
  [
    "flying out of ORD to Cancun over spring break, me + 3 college friends, cheapest possible",
    {
      dest: "Cancun",
      origin: "Chicago",
      start: "2027-03-13",
      nights: 7,
      travelers: 4,
      style: "budget",
    },
  ],
  [
    "I'm visiting my grandma in Phoenix for thanksgiving, just need flights and maybe a rental car",
    { dest: "Phoenix", start: "2026-11-25", nights: 4, covered: ["activities"] },
  ],
  [
    "Iceland in March to see the northern lights, 2 people, 6 nights, splurge a little",
    { dest: "Reykjavík", start: "2027-03-05", nights: 6, travelers: 2, style: "luxury" },
  ],
  [
    "What's a good place for a solo trip in December? I like museums and good coffee, budget is 1500",
    {
      dest: null,
      travelers: 1,
      budget: 1500,
      start: "2026-12-04",
      interests: ["history", "food"],
      asks: "destination",
    },
  ],
  [
    "Amalfi coast honeymoon, 9 nights in june, money is no object, business class",
    { dest: "Positano", nights: 9, travelers: 2, style: "luxury", cabin: "business" },
  ],
  [
    "road trip from Denver through Utah national parks, 8 days, 2 of us + dog",
    { origin: "Denver", nights: 7, travelers: 2, tripType: "road-trip", asks: "narrow" },
  ],
  [
    "3 nights Lisbon then 3 nights Porto in October, comfortable hotels, two adults",
    { cities: ["Lisbon", "Porto"], nights: 6, travelers: 2, style: "comfort" },
  ],
  [
    "somewhere snowy for christmas with the kids?? 5 of us total",
    { dest: null, start: "2026-12-23", travelers: 5, asks: "destination" },
  ],
  [
    "can we do disneyland for my daughter's 7th birthday, april 10-13, me my husband and her",
    { dest: "Anaheim", start: "2027-04-10", nights: 3, interests: ["family"] },
  ],
  [
    "Want to see NYC for New Years Eve, 4 nights, me and my best friend, ~$3000 total",
    { dest: "New York", start: "2026-12-30", nights: 4, travelers: 2, budget: 3000 },
  ],
  [
    "weekend in savannah ga next month with my mom",
    { dest: "Savannah", start: "2026-12-04", nights: 2, travelers: 2 },
  ],
  [
    "London and Edinburgh by train, 12 days, starting May 20, just me",
    {
      cities: ["London", "Edinburgh"],
      start: "2027-05-20",
      nights: 11,
      travelers: 1,
      tripType: "rail",
    },
  ],
  [
    "i have $800 and want a beach weekend lol",
    { dest: null, budget: 800, nights: 2, interests: ["beaches"], asks: "destination" },
  ],
  [
    "Taking my parents to Hawaii for their 40th anniversary, 8 nights in August, 4 of us",
    { start: "2027-08-06", nights: 8, travelers: 4, asks: "narrow" },
  ],
  [
    "Thinking Costa Rica for 2 weeks in Jan, adventure stuff like ziplining and rafting, me and my wife",
    { nights: 14, travelers: 2, interests: ["adventure"], tripType: "flight", asks: "narrow" },
  ],
  [
    "cruise to the bahamas from Port Canaveral for 4 nights, family of four",
    { dest: "Port Canaveral", nights: 4, travelers: 4, tripType: "cruise" },
  ],
  [
    "staycation this weekend, 2 adults, want good restaurants",
    { tripType: "staycation", start: "2026-11-06", nights: 2, travelers: 2, interests: ["food"] },
  ],
  [
    "help me plan a girls trip to Tulum for 5 days in march, 6 of us, $1200 each",
    { dest: "Tulum", start: "2027-03-05", nights: 4, travelers: 6, budget: 7200 },
  ],
  [
    "I live in Seattle and want to go to Vancouver for a long weekend by train",
    { dest: "Vancouver", origin: "Seattle", nights: 3, tripType: "rail" },
  ],
  [
    "Barcelona, Madrid, Seville. 10 nights total. Late September. Me and my husband.",
    { cities: ["Barcelona", "Madrid", "Seville"], nights: 10, travelers: 2, start: "2027-09-24" },
  ],
  [
    "yo whats good, need a vacay asap. me n my gf. somewhere w beaches. like 2k max",
    { dest: null, travelers: 2, budget: 2000, interests: ["beaches"], asks: "destination" },
  ],
  [
    "Planning our 25th anniversary trip to Santorini, Sept 12-19, staying somewhere nice",
    { dest: "Santorini", start: "2027-09-12", nights: 7, travelers: 2 },
  ],
  [
    "Chicago -> Milwaukee day trip saturday with the kids (3 of them) and my husband",
    { dest: "Milwaukee", origin: "Chicago", start: "2026-11-07", nights: 0 },
  ],
  [
    "8 day trip to peru, machu picchu for sure, mid range, 2 of us leaving from Miami",
    { dest: "Cusco", origin: "Miami", nights: 7, travelers: 2, style: "comfort" },
  ],
  [
    "My company is sending 12 of us to Austin for SXSW in March, 5 nights",
    { dest: "Austin", start: "2027-03-05", nights: 5, travelers: 12 },
  ],
  [
    "first time in europe!! want paris, amsterdam and berlin, 2 weeks in july, just me, on a budget",
    { cities: ["Paris", "Amsterdam", "Berlin"], nights: 14, travelers: 1, style: "budget" },
  ],
  [
    "We want to take an Alaska cruise from Seattle in June for 7 nights, 2 adults 2 kids",
    { dest: "Seattle", nights: 7, travelers: 4, tripType: "cruise" },
  ],
  [
    "Weekend getaway to Asheville NC from Atlanta, 2 people, $600",
    { dest: "Asheville", origin: "Atlanta", nights: 2, travelers: 2, budget: 600 },
  ],
  [
    "Is Bali good in August? Thinking 10 nights, me and my partner, nice villas",
    { start: "2027-08-06", nights: 10, travelers: 2, tripType: "flight" },
  ],
  [
    "grandparents taking 4 grandkids to Orlando for spring break, 6 people, a week",
    { dest: "Orlando", start: "2027-03-13", nights: 7, travelers: 6, interests: ["family"] },
  ],
  [
    "flying first class to Dubai for new year's, 5 nights, me and my husband",
    { dest: "Dubai", start: "2026-12-30", nights: 5, travelers: 2, cabin: "first" },
  ],
  [
    "i dont know where to go, i have a week off in may and like hiking",
    { dest: null, start: "2027-05-07", nights: 7, interests: ["nature"], asks: "destination" },
  ],
  [
    "Need a quick trip to DC for a conference oct 14-16, solo",
    { dest: "Washington", start: "2027-10-14", nights: 2, travelers: 1 },
  ],
  [
    "family reunion in Gatlinburg tn, 15 of us, labor day weekend",
    { dest: "Gatlinburg", start: "2027-09-03", nights: 3, travelers: 15 },
  ],
  [
    "London 4 nights, Paris 3 nights, by train, in April, honeymoon",
    { cities: ["London", "Paris"], nights: 7, travelers: 2, tripType: "rail" },
  ],
  [
    "Somewhere I can ski in January, 4 friends, around $1500 per person",
    { dest: null, start: "2027-01-01", interests: ["adventure"], asks: "destination" },
  ],
  [
    "visiting my sister in Denver for 5 days in early December",
    { dest: "Denver", start: "2026-12-04", nights: 4, travelers: null },
  ],
  [
    "boston to nyc on amtrak next weekend",
    { dest: "New York", origin: "Boston", start: "2026-11-13", nights: 2, tripType: "rail" },
  ],
  [
    "cheap spring break trip for college students, 5 of us, somewhere warm, driving",
    {
      dest: null,
      travelers: 5,
      tripType: "road-trip",
      style: "budget",
      interests: ["beaches"],
      asks: "destination",
    },
  ],
  [
    "Mexico City for 4 nights in Feb, foodie trip, me and 2 friends",
    { dest: "Mexico City", start: "2027-02-05", nights: 4, travelers: 3, interests: ["food"] },
  ],
  [
    "We'd like to do Rome, then the Amalfi Coast, then Sicily in late May for 12 days",
    { cities: ["Rome", "Positano", "Sicily"], nights: 11, start: "2027-05-28" },
  ],
  [
    "kyoto for the cherry blossoms, early april, a week, just my wife and I",
    { dest: "Kyoto", start: "2027-04-02", nights: 7, travelers: 2 },
  ],
  [
    "a month backpacking southeast asia starting in january, solo, super cheap",
    { nights: 30, travelers: 1, style: "budget", asks: "narrow" },
  ],
  [
    "can you plan napa wine weekend for my 40th bday, 8 girls, fancy",
    { dest: "Napa", nights: 2, travelers: 8, style: "luxury", interests: ["food"] },
  ],
  [
    "need flights only to Puerto Rico, staying at my aunts place, Dec 20 to Jan 3, 3 of us",
    { start: "2026-12-20", nights: 14, travelers: 3, covered: ["lodging"], asks: "narrow" },
  ],
  [
    "We wanna do NYC over thanksgiving w/ our 3 kids. Hotel near times square",
    { dest: "New York", start: "2026-11-25", nights: 4, travelers: 5, interests: ["family"] },
  ],
  [
    "I need to go to Denver for work Nov 12-14 then stay the weekend",
    { dest: "Denver", start: "2026-11-12", nights: 3 },
  ],
  [
    "honeymoon in greece in june, santorini and mykonos, 10 nights, budget 8k",
    { cities: ["Santorini", "Mykonos"], nights: 10, travelers: 2, budget: 8000 },
  ],
  [
    "can u plan a trip 2 london from atlanta, 9 days, leaving dec 26",
    { dest: "London", origin: "Atlanta", start: "2026-12-26", nights: 8 },
  ],
  [
    "5 days in Banff in the summer, hiking, 4 friends, renting a car",
    { dest: "Banff", nights: 4, travelers: 4, interests: ["nature"] },
  ],
  [
    "taking the train from nyc to washington dc for the cherry blossoms in april",
    { dest: "Washington", origin: "New York", tripType: "rail", asks: "length" },
  ],
  [
    "Disney world with 2 kids under 5, sometime in March, 5 nights",
    { dest: "Orlando", nights: 5, interests: ["family"] },
  ],
];

describe("the trip assistant understands hand-written messages", () => {
  it.each(GOLDEN)("%s", (message, want) => {
    const u = understand([{ role: "user", content: message }], ctx);
    const d = u.draft;
    if (want.dest === null) expect(d.destination).toBeNull();
    else if (want.dest) expect(town(d.destination)).toBe(want.dest);
    if (want.cities) expect(d.cities.map((c) => town(c.name))).toEqual(want.cities);
    if (want.origin) expect(town(d.origin)).toBe(want.origin);
    if (want.start) expect(d.startDate).toBe(want.start);
    if (want.nights !== undefined) expect(d.nights).toBe(want.nights);
    if (want.travelers !== undefined) expect(d.travelers).toBe(want.travelers);
    if (want.budget) expect(d.totalBudget).toBe(want.budget);
    if (want.tripType) expect(d.tripType).toBe(want.tripType);
    if (want.style) expect(d.style).toBe(want.style);
    if (want.cabin) expect(d.cabin).toBe(want.cabin);
    for (const i of want.interests ?? []) expect(d.interests).toContain(i);
    for (const c of want.covered ?? []) expect(d.covered[c as "lodging"]).toBe(true);
    if (want.asks) expect(missingRequired(u)).toContain(want.asks);
  });
});
