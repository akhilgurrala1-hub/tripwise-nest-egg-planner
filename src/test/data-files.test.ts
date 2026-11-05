import { describe, expect, it } from "vitest";

import rules from "@/data/rules.json";
import { MAX_AIRPORT_MILES } from "@/lib/airports";
import { CATALOG, CRUISES } from "@/lib/catalog";
import { getDestination, INTERESTS, TRIP_TYPES } from "@/lib/demo-data";

// The data in src/data is checked in depth by the Python tools (tools/waypoint_data).
// These tests make sure the rules they check against are the app's own, and that
// the app reads the files the way it expects.
describe("data files follow the app's own rules", () => {
  it("rules.json uses the app's interests and trip types", () => {
    expect(rules.interests).toEqual(INTERESTS.map((i) => i.id));
    expect(rules.tripTypes).toEqual(TRIP_TYPES.map((t) => t.id));
    for (const t of rules.placeTripTypes) expect(rules.tripTypes).toContain(t);
    expect(MAX_AIRPORT_MILES).toBe(rules.maxAirportMiles);
  });

  it("every place and cruise has the fields the app reads", () => {
    const interests = new Set<string>(rules.interests);
    for (const p of CATALOG) {
      expect(Object.keys(p).sort()).toEqual([...rules.placeFields].sort());
      expect(p.tags.every((t) => interests.has(t))).toBe(true);
      expect(p.types.every((t) => rules.placeTripTypes.includes(t))).toBe(true);
      expect(rules.tiers).toContain(p.tier);
    }
    for (const c of CRUISES) {
      for (const k of Object.keys(c)) expect(rules.cruiseFields).toContain(k);
      expect(c.tags.every((t) => interests.has(t))).toBe(true);
      expect(Number.isFinite(c.portPoint.lat) && Number.isFinite(c.callPoint.lon)).toBe(true);
    }
  });

  it("every catalog place and cruise becomes a destination", () => {
    for (const p of CATALOG) expect(getDestination(`place:${p.id}`).name).toBe(p.name);
    for (const c of CRUISES) expect(getDestination(`cruise:${c.id}`).id).toBe(`cruise:${c.id}`);
  });
});
