import { describe, expect, it } from "vitest";

import { MEMBERSHIPS } from "@/lib/account";
import { PERKS, perksFor } from "@/lib/perks";

describe("perk reminders", () => {
  it("covers every membership the Profile page offers, so none is saved without a purpose", () => {
    for (const m of MEMBERSHIPS) expect(PERKS[m], m).toBeDefined();
  });

  it("shows only the reminders that fit the booking, in the traveler's order", () => {
    expect(perksFor("flight", ["Costco", "Priority Pass"]).map((p) => p.membership)).toEqual([
      "Priority Pass",
    ]);
    expect(perksFor("hotel", ["AAA", "Costco"]).map((p) => p.membership)).toEqual([
      "AAA",
      "Costco",
    ]);
    expect(perksFor("dining", [...MEMBERSHIPS])).toEqual([]);
    expect(perksFor("hotel", [])).toEqual([]);
  });

  it("ignores names it does not know, including inherited object keys", () => {
    expect(perksFor("hotel", ["toString", "__proto__", "Unknown card"])).toEqual([]);
  });

  it("never promises a saving: every tip tells the traveler to check, compare or ask", () => {
    for (const [name, rule] of Object.entries(PERKS))
      expect(rule.tip, name).toMatch(/check|compar|ask/i);
    for (const rule of Object.values(PERKS))
      expect(rule.tip).not.toMatch(/\$|%|guarantee|save \w+/i);
  });
});
