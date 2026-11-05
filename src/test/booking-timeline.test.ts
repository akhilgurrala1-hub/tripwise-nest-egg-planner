import { describe, expect, it } from "vitest";

import type { BookingItem } from "@/lib/booking";
import {
  bookBy,
  bookingTimeline,
  prepChecklist,
  toICalendar,
  tripCalendar,
} from "@/lib/booking-timeline";
import { countryOfPlace } from "@/lib/understand/gazetteer";

const item = (key: string, kind: BookingItem["kind"], optional = false): BookingItem => ({
  key,
  kind,
  title: `${kind} title`,
  detail: "detail",
  budget: 100,
  links: [{ label: "Search", url: "https://example.com/" }],
  optional,
});
const ctx = (today: string, abroad = false) => ({
  today,
  startDate: "2027-06-10",
  abroad,
  country: abroad ? "IT" : "US",
});

describe("when to book", () => {
  it("books international flights earlier than domestic ones", () => {
    expect(bookBy(item("flight", "flight"), ctx("2027-01-01", true)).by).toBe("2027-04-11");
    expect(bookBy(item("flight", "flight"), ctx("2027-01-01")).by).toBe("2027-05-13");
  });

  it("says how urgent it is, and never gives a date in the past", () => {
    expect(bookBy(item("flight", "flight"), ctx("2027-01-01")).urgency).toBe("later");
    expect(bookBy(item("tickets", "tickets"), ctx("2027-05-20")).urgency).toBe("now");
    const late = bookBy(item("cruise", "cruise"), ctx("2027-05-01"));
    expect(late.urgency).toBe("overdue");
    expect(late.by).toBe("2027-05-01");
  });

  it("groups the checklist by when to act, with done items last", () => {
    const items = [
      item("flight", "flight"),
      item("hotel", "hotel"),
      item("tickets", "tickets"),
      item("dining", "dining", true),
    ];
    const groups = bookingTimeline(
      items,
      { dining: { status: "skipped", confirmation: "", price: null } },
      ctx("2027-05-25"),
    );
    expect(groups.map((g) => g.key)).toEqual(["overdue", "done"]);
    expect(groups[0]!.items.map((i) => i.item.key)).toEqual(["flight", "hotel", "tickets"]);
    expect(groups.at(-1)!.items[0]!.item.key).toBe("dining");
  });
});

describe("before you go", () => {
  const base = {
    startDate: "2027-06-10",
    endDate: "2027-06-20",
    homeCountry: "US",
    destName: "Rome, Italy",
    tripType: "flight",
    transportMode: "flight",
    totalBudget: 2500,
  };

  it("lists passports, entry rules and the rest for trips abroad", () => {
    const keys = prepChecklist({ ...base, destCountry: "IT" }).map((p) => p.key);
    expect(keys).toEqual([
      "prep-passport",
      "prep-entry",
      "prep-phone",
      "prep-money",
      "prep-insurance",
    ]);
    const passport = prepChecklist({ ...base, destCountry: "IT" })[0]!;
    expect(passport.detail).toMatch(/Dec 20, 2027/);
    expect(passport.links[0]!.url).toMatch(/^https:\/\/travel\.state\.gov/);
  });

  it("has nothing to add for a short trip at home, but suggests insurance for cruises", () => {
    expect(prepChecklist({ ...base, destCountry: "US", destName: "Denver, CO" })).toEqual([]);
    expect(
      prepChecklist({ ...base, destCountry: "US", tripType: "cruise" }).map((p) => p.key),
    ).toEqual(["prep-insurance"]);
  });

  it("knows the country of a place name", () => {
    expect(countryOfPlace("Kyoto, Japan")).toBe("JP");
    expect(countryOfPlace("Asheville, NC")).toBe("US");
    expect(countryOfPlace("Toronto, ON")).toBe("CA");
    expect(countryOfPlace("Japan")).toBe("JP");
  });
});

describe("calendar file", () => {
  it("is a valid iCalendar file with the trip and each booking reminder", () => {
    const groups = bookingTimeline(
      [item("flight", "flight"), item("hotel", "hotel")],
      {},
      ctx("2027-01-01", true),
    );
    const events = tripCalendar({
      tripId: "t-1",
      title: "Trip: Rome, Italy",
      startDate: "2027-06-10",
      endDate: "2027-06-20",
      groups,
    });
    expect(events).toHaveLength(3);
    const ics = toICalendar(events, "20270101T120000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20270610\r\nDTEND;VALUE=DATE:20270621");
    // Commas are escaped, and no line is longer than 75 characters.
    expect(ics).toContain("SUMMARY:Trip: Rome\\, Italy");
    expect(
      toICalendar([{ uid: "x", start: "2027-01-01", end: "2027-01-02", title: "a;b\\c" }], "s"),
    ).toContain("SUMMARY:a\\;b\\\\c");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  });
});

describe("entry rules name the country", () => {
  it("says Italy, not Rome", () => {
    const entry = prepChecklist({
      startDate: "2027-06-10",
      endDate: "2027-06-20",
      homeCountry: "US",
      destCountry: "IT",
      destName: "Rome",
      destCountryName: "Italy",
      tripType: "flight",
      transportMode: "flight",
      totalBudget: 2000,
    }).find((p) => p.key === "prep-entry")!;
    expect(entry.title).toBe("Entry rules for Italy");
  });
});

describe("entry rules for their passport", () => {
  it("says what this passport needs, with the source date", () => {
    const entry = prepChecklist({
      startDate: "2027-06-10",
      endDate: "2027-06-20",
      homeCountry: "US",
      destCountry: "IT",
      destName: "Rome",
      destCountryName: "Italy",
      tripType: "flight",
      transportMode: "flight",
      totalBudget: 2000,
      entry: {
        passportName: "United States",
        text: "visa-free for up to 90 days",
        updated: "2026-02-17",
      },
    }).find((p) => p.key === "prep-entry")!;
    expect(entry.detail).toMatch(
      /On a United States passport: visa-free for up to 90 days \(Passport Index, 2026-02-17\)/,
    );
  });
});
