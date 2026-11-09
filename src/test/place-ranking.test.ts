/**
 * Picking the places worth a traveler's day: famous landmarks before obscure
 * plaques, independents before chains, travel-guide picks near the top.
 */
import { describe, expect, it } from "vitest";

import { mergePlaces, placeLines, rankSights } from "@/lib/ai-quality";
import { buildRealItinerary } from "@/lib/itinerary";
import {
  classifySight,
  fameScore,
  mergeWikiBodies,
  parseLandmarks,
  parseRestaurants,
  restaurantScore,
} from "@/lib/live/open-data";
import type { RealPlace } from "@/lib/places/types";

const ROME = { lat: 41.8986, lon: 12.4769 };
const views = (perDay: number) =>
  Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, "0")}`, perDay]),
  );
const page = (
  id: number,
  title: string,
  description: string,
  dist: number,
  perDay?: number,
  length?: number,
) => ({
  pageid: id,
  title,
  description,
  coordinates: [{ lat: ROME.lat, lon: ROME.lon, dist }],
  ...(perDay !== undefined ? { pageviews: views(perDay) } : {}),
  ...(length !== undefined ? { length } : {}),
});

describe("what counts as a sight", () => {
  it.each([
    ["Ancient amphitheatre in Rome, Italy", ["history"]],
    ["Fountain in Rome, Italy", ["history", "arts"]],
    ["Colossal neoclassical sculpture on Liberty Island", ["history", "arts"]],
    ["Ruined area in Rome", ["history"]],
    ["Set of steps in Rome, Italy", ["history", "arts"]],
    ["Historic building in Prague", ["history"]],
    ["Museum building in Berlin", ["arts", "history"]],
    ["Clock tower in London", ["history", "arts"]],
    ["Triumphal arch in Paris", ["history", "arts"]],
  ])("%s", (d, want) => {
    expect(classifySight(d)).toEqual(want);
  });

  it.each([
    "Railway station in Rome",
    "Embassy of Italy",
    "Secondary school in London",
    "Office building in Manhattan",
    "1066 battle",
    "Neighbourhood of Rome",
  ])("not %s", (d) => {
    expect(classifySight(d)).toBeNull();
  });
});

describe("landmarks, best known first", () => {
  it("ranks by page views, not by distance from the center", () => {
    const body = {
      query: {
        pages: {
          "1": page(1, "Plaque to a poet", "Memorial plaque in Rome", 40, 3),
          "2": page(2, "Colosseum", "Ancient amphitheatre in Rome, Italy", 2100, 12_000),
          "3": page(3, "Trevi Fountain", "Fountain in Rome, Italy", 600, 9_000),
          "4": page(4, "Santa Maria in Via", "Church in Rome", 300, 40),
        },
      },
    };
    const out = parseLandmarks(body, "Rome, Italy", ROME);
    expect(out.map((p) => p.name)).toEqual([
      "Colosseum",
      "Trevi Fountain",
      "Santa Maria in Via",
      "Plaque to a poet",
    ]);
    expect(out[0]!.fame).toBe(360_000);
  });

  it("uses the article's length when views aren't reported", () => {
    expect(fameScore(null, 120_000, 1)).toBeGreaterThan(fameScore(null, 2_000, 1));
    expect(fameScore(5_000, null, 9)).toBeLessThan(fameScore(5_000, null, 0));
  });

  it("merges both searches, counting an article once and keeping its views", () => {
    const linked = {
      query: { pages: { "2": page(2, "Colosseum", "Ancient amphitheatre", 2100, 100) } },
    };
    const nearest = {
      query: {
        pages: {
          "2": page(2, "Colosseum", "Ancient amphitheatre", 2100),
          "9": page(9, "Piazza Venezia", "Square in Rome", 50, 50),
        },
      },
    };
    const merged = mergeWikiBodies(nearest, linked, null);
    const out = parseLandmarks(merged, "Rome", ROME);
    expect(out.map((p) => p.name)).toEqual(["Colosseum", "Piazza Venezia"]);
    expect(out[0]!.fame).toBe(3000);
  });
});

describe("restaurants worth a meal", () => {
  const osm = (id: number, tags: Record<string, string>, lat = ROME.lat, lon = ROME.lon) => ({
    type: "node",
    id,
    lat,
    lon,
    tags: { amenity: "restaurant", ...tags },
  });

  it("puts notable, well-documented places first and chains last", () => {
    const out = parseRestaurants(
      {
        elements: [
          osm(1, { name: "McDonald's", brand: "McDonald's", cuisine: "burger" }),
          osm(2, {
            name: "Trattoria Da Enzo",
            cuisine: "italian",
            website: "https://x",
            opening_hours: "Mo-Su 12:00-23:00",
          }),
          osm(3, { name: "Bar Pizza" }),
          osm(4, { name: "La Pergola", wikidata: "Q123", cuisine: "italian" }),
          osm(5, { name: "Burger King" }),
        ],
      },
      "Rome",
      ROME,
    );
    expect(out.map((r) => r.name).slice(0, 3)).toEqual([
      "La Pergola",
      "Trattoria Da Enzo",
      "Bar Pizza",
    ]);
    expect(
      out
        .slice(3)
        .map((r) => r.name)
        .sort(),
    ).toEqual(["Burger King", "McDonald's"]);
  });

  it("prefers places near the center, and reads a way's center point", () => {
    const near = restaurantScore({ name: "A", website: "x" }, 0.2);
    const far = restaurantScore({ name: "B", website: "x" }, 2.8);
    expect(near).toBeGreaterThan(far);
    const out = parseRestaurants(
      {
        elements: [
          {
            type: "way",
            id: 7,
            center: { lat: 41.93, lon: 12.5 },
            tags: { name: "Far Osteria", website: "x" },
          },
          {
            type: "way",
            id: 8,
            center: { lat: 41.899, lon: 12.477 },
            tags: { name: "Near Osteria", website: "x" },
          },
        ],
      },
      "Rome",
      ROME,
    );
    expect(out.map((r) => r.name)).toEqual(["Near Osteria", "Far Osteria"]);
  });
});

const sight = (name: string, extra: Partial<RealPlace> = {}): RealPlace => ({
  placeId: name,
  name,
  kind: "sight",
  typeLabel: "Landmark",
  description: "",
  address: null,
  rating: null,
  ratingCount: null,
  mapsUrl: null,
  costPerPerson: 0,
  costSource: "unknown",
  interests: ["history"],
  ...extra,
});

describe("sights in the order worth seeing them", () => {
  it("leads with famous places and travel-guide picks", () => {
    const ranked = rankSights([
      sight("Obscure plaque", { source: "wikipedia", fame: 90 }),
      sight("Guide's hidden courtyard", { source: "wikivoyage" }),
      sight("Colosseum", { source: "wikipedia", fame: 360_000 }),
    ]);
    expect(ranked.map((p) => p.name)).toEqual([
      "Colosseum",
      "Guide's hidden courtyard",
      "Obscure plaque",
    ]);
  });

  it("a guide pick that's also famous gets the views when merged", () => {
    const merged = mergePlaces(
      [sight("Colosseum", { source: "wikivoyage" })],
      [sight("Colosseum", { source: "wikipedia", fame: 360_000 })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.fame).toBe(360_000);
  });

  it("tells the AI planner which sights are the best known", () => {
    const lines = placeLines(
      [sight("Colosseum", { fame: 360_000 }), sight("Plaque", { fame: 90 })],
      [],
    );
    expect(lines[0]).toContain("one of the best-known sights here");
    expect(lines[1]).not.toContain("best-known");
  });

  it("the free real-places plan visits the famous sight first", () => {
    const plan = buildRealItinerary({
      sights: [
        sight("Obscure plaque", { fame: 90 }),
        sight("Small church", { fame: 900 }),
        sight("Colosseum", { fame: 360_000 }),
      ],
      restaurants: [],
      destName: "Rome",
      days: 1,
      startDate: "2026-12-01",
      interests: ["history"],
      tripType: "flight",
      source: "open",
    });
    const names = plan.days[0]!.items.filter((i) => i.kind === "sight").map((i) => i.name);
    expect(names[0]).toBe("Colosseum");
  });
});
