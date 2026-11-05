import { describe, expect, it } from "vitest";

import rows from "@/data/visas.json";
import { layoverAdvice } from "@/lib/layovers";
import { entersFreely, entryRule, entryText, visaTable } from "@/lib/visas";

const visas = visaTable(rows as string[][]);
const at = (code: string, name: string, city: string, country: string) => ({
  code,
  name,
  city,
  country,
});

describe("entry rules by passport", () => {
  it("reads the table", () => {
    expect(visas.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entryRule(visas, "US", "IT")).toEqual({ kind: "free", days: 90 });
    expect(entryRule(visas, "US", "US")).toEqual({ kind: "home" });
    expect(entryRule(visas, "IN", "US")!.kind).toBe("visa");
    expect(entryRule(visas, "ZZ", "US")).toBeNull();
    expect(entryText({ kind: "free", days: 90 })).toBe("visa-free for up to 90 days");
    expect(entersFreely({ kind: "arrival" })).toBe(true);
    expect(entersFreely({ kind: "eta" })).toBe(false);
  });
});

describe("layover advice", () => {
  it("a long layover on a visa-free passport: go see the city", () => {
    const a = layoverAdvice({
      minutes: 9 * 60,
      ...at("IST", "Istanbul Airport", "Istanbul", "TR"),
      entry: entryRule(visas, "US", "TR"),
      passport: "US",
    });
    expect(a.canLeave).toBe("yes");
    expect(a.verdict).toBe("go");
    expect(a.outsideMinutes).toBe(6 * 60);
    expect(a.notes.join(" ")).toMatch(/Touristanbul/);
    expect(a.links.at(-1)!.url).toMatch(/iatatravelcentre/);
  });

  it("a short one: stay in the airport, whatever the passport", () => {
    const a = layoverAdvice({
      minutes: 150,
      ...at("FRA", "Frankfurt Airport", "Frankfurt", "DE"),
      entry: entryRule(visas, "US", "DE"),
      passport: "US",
    });
    expect(a.verdict).toBe("stay");
    expect(a.inside.length).toBeGreaterThan(1);
  });

  it("needs a visa to leave, and says what to do inside instead", () => {
    const a = layoverAdvice({
      minutes: 10 * 60,
      overnight: true,
      ...at("LHR", "London Heathrow Airport", "London", "GB"),
      entry: entryRule(visas, "IN", "GB"),
      passport: "IN",
    });
    expect(a.canLeave).toBe("visa");
    expect(a.leaveText).toMatch(/visa/);
    expect(a.inside.join(" ")).toMatch(/transit hotel/);
    expect(a.notes.join(" ")).toMatch(/overnight/);
    expect(a.notes.join(" ")).toMatch(/airport transit visa/);
  });

  it("warns that connecting in the US means clearing immigration", () => {
    const a = layoverAdvice({
      minutes: 3 * 60,
      ...at("JFK", "John F. Kennedy International Airport", "New York", "US"),
      entry: entryRule(visas, "GB", "US"),
      passport: "GB",
    });
    expect(a.notes.join(" ")).toMatch(/goes through immigration/);
  });

  it("knows about China's visa-free transit", () => {
    const a = layoverAdvice({
      minutes: 12 * 60,
      ...at("PEK", "Beijing Capital International Airport", "Beijing", "CN"),
      entry: entryRule(visas, "US", "CN"),
      passport: "US",
    });
    expect(a.notes.join(" ")).toMatch(/240 hours/);
  });

  it("at home, a shorter buffer", () => {
    const a = layoverAdvice({
      minutes: 5 * 60,
      ...at("ORD", "Chicago O'Hare International Airport", "Chicago", "US"),
      entry: entryRule(visas, "US", "US"),
      passport: "US",
    });
    expect(a.outsideMinutes).toBe(210);
    expect(a.canLeave).toBe("yes");
  });
});

describe("never promises time outside to someone who can't leave", () => {
  it("says what a visa would buy instead", () => {
    const a = layoverAdvice({
      minutes: 9 * 60,
      code: "IST",
      name: "Istanbul Airport",
      city: "Istanbul",
      country: "TR",
      entry: { kind: "visa" },
      passport: "IN",
    });
    expect(a.verdictText).toMatch(
      /^With a visa, there'd be about 6h outside\. Without it, plan to stay in the airport\./,
    );
    expect(a.notes.join(" ")).not.toMatch(/Touristanbul/);
    expect(a.links.some((l) => l.label.startsWith("Near"))).toBe(false);
  });
});
