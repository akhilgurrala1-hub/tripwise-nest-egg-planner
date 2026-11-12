import { describe, expect, it } from "vitest";

import { ACCESSIBILITY, DIETARY, cleanNeeds, needsFacts } from "@/lib/needs";

describe("saved food and access needs", () => {
  it("keeps only values from the fixed lists, once each", () => {
    expect(cleanNeeds(["vegan", "vegan", "pizza", 3, "halal"], DIETARY)).toEqual([
      "vegan",
      "halal",
    ]);
    expect(cleanNeeds("vegan", DIETARY)).toEqual([]);
    expect(cleanNeeds(null, ACCESSIBILITY)).toEqual([]);
    expect(cleanNeeds(["wheelchair", "vegan"], ACCESSIBILITY)).toEqual(["wheelchair"]);
  });

  it("tells the AI planner what to favor, without ever claiming a place is safe or certified", () => {
    const facts = needsFacts(["vegan", "nut-allergy"], ["step-free"]);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatch(/vegan, nut allergy/);
    expect(facts[0]).toMatch(/never say a place is certified or safe/i);
    expect(facts[1]).toMatch(/step-free access/);
    expect(facts[1]).toMatch(/confirm access with the venue/i);
  });

  it("adds nothing when no needs are saved, and every line fits the planner's 160-character limit", () => {
    expect(needsFacts([], [])).toEqual([]);
    const all = needsFacts(
      DIETARY.map((d) => d.id),
      ACCESSIBILITY.map((a) => a.id),
    );
    for (const l of all) expect(l.length).toBeLessThanOrEqual(160);
  });
});
