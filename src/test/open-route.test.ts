import { describe, expect, it } from "vitest";

import {
  costFromTags,
  detourMinutes,
  parseOsrm,
  parseRouteStops,
  foodQuery,
  parseWikiRouteStops,
  worthTheDetour,
  placeOnRoute,
  routeSamplePoints,
  spreadAlongRoute,
  thinPath,
} from "@/lib/routing/open-route";
import type { RealRoute } from "@/lib/routing/types";

// Charlotte to Asheville, roughly along I-40/US-74.
const PATH = [
  { lat: 35.22, lng: -80.84 },
  { lat: 35.26, lng: -81.2 },
  { lat: 35.3, lng: -81.6 },
  { lat: 35.4, lng: -82.0 },
  { lat: 35.5, lng: -82.3 },
  { lat: 35.59, lng: -82.55 },
];
const ROUTE: RealRoute = {
  distanceMiles: 128,
  durationMinutes: 140,
  path: PATH,
  start: PATH[0]!,
  end: PATH[5]!,
};

describe("routes from OSRM", () => {
  it("reads distance, time and the road", () => {
    const r = parseOsrm({
      code: "Ok",
      routes: [
        {
          distance: 200627,
          duration: 9387,
          geometry: {
            coordinates: [
              [-80.84, 35.22],
              [-81.2, 35.26],
              [-82.55, 35.59],
            ],
          },
        },
      ],
    });
    expect(r).toMatchObject({ distanceMiles: 124.7, durationMinutes: 156 });
    expect(r!.start).toEqual({ lat: 35.22, lng: -80.84 });
    expect(r!.end).toEqual({ lat: 35.59, lng: -82.55 });
  });

  it("gives null when there's no road between the places", () => {
    expect(parseOsrm({ code: "NoRoute", routes: [] })).toBeNull();
    expect(parseOsrm(null)).toBeNull();
  });

  it("thins a long road to a few points, keeping both ends", () => {
    const long = Array.from({ length: 500 }, (_, i) => ({ lat: i / 100, lng: 0 }));
    const thin = thinPath(long, 60);
    expect(thin).toHaveLength(60);
    expect(thin[0]).toEqual(long[0]);
    expect(thin[59]).toEqual(long[499]);
    expect(thinPath(PATH, 60)).toBe(PATH);
  });

  it("asks Overpass only for independent places to eat right by the road", () => {
    const q = foodQuery(PATH);
    expect(q).toContain("around:1000,35.2200,-80.8400,");
    expect(q).toContain('[!"brand"]');
    expect(q).toContain("restaurant|cafe");
  });

  it("searches for sights at evenly spaced points along the road, never at its ends", () => {
    const pts = routeSamplePoints(PATH);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(pts.length).toBeLessThanOrEqual(10);
    expect(pts).not.toContainEqual(PATH[0]);
    expect(pts).not.toContainEqual(PATH[5]);
  });
});

describe("stops along the road", () => {
  it("knows where a place is along the route and how far off it", () => {
    const mid = placeOnRoute({ lat: 35.32, lng: -81.6 }, PATH);
    expect(mid.position).toBeGreaterThan(0.3);
    expect(mid.position).toBeLessThan(0.6);
    expect(mid.offKm).toBeCloseTo(2.2, 0);
  });

  it("turns distance off the road into detour minutes, in 5-minute steps", () => {
    expect(detourMinutes(0.2)).toBe(5);
    expect(detourMinutes(4)).toBe(15);
    expect(detourMinutes(10)).toBe(30);
  });

  it("prices honestly: published fees count, free places are free, the rest is an estimate or not listed", () => {
    expect(costFromTags({ fee: "no" }, { typical: 15 })).toEqual({ cost: 0, source: "listed" });
    expect(costFromTags({ charge: "$12 adults" }, { typical: 15 })).toEqual({
      cost: 12,
      source: "listed",
    });
    expect(costFromTags({}, { typical: 0, free: true })).toEqual({
      cost: 0,
      source: "price-level",
    });
    expect(costFromTags({}, { typical: 15 })).toEqual({ cost: 15, source: "price-level" });
    // An attraction with no fee published is never counted as free.
    expect(costFromTags({}, { typical: null })).toEqual({ cost: 0, source: "unknown" });
    expect(costFromTags({ fee: "yes" }, { typical: 0, free: true }).source).toBe("unknown");
  });

  it("builds real stops from OpenStreetMap, skipping the ends, duplicates and unnamed places", () => {
    const stops = parseRouteStops(
      {
        elements: [
          {
            type: "node",
            id: 1,
            lat: 35.31,
            lon: -81.6,
            tags: { tourism: "viewpoint", name: "Gorge Overlook" },
          },
          {
            type: "node",
            id: 2,
            lat: 35.31,
            lon: -81.6,
            tags: { tourism: "viewpoint", name: "Gorge Overlook" },
          },
          {
            type: "node",
            id: 3,
            lat: 35.22,
            lon: -80.84,
            tags: { tourism: "museum", name: "Start Museum" },
          },
          { type: "node", id: 4, lat: 35.4, lon: -82.0, tags: { tourism: "viewpoint" } },
          {
            type: "way",
            id: 5,
            center: { lat: 35.41, lon: -82.01 },
            tags: {
              tourism: "museum",
              name: "Mountain Heritage Center",
              wikipedia: "en:X",
              fee: "no",
            },
          },
          {
            type: "node",
            id: 6,
            lat: 35.5,
            lon: -82.3,
            tags: { amenity: "restaurant", name: "Biscuit Barn", cuisine: "american;breakfast" },
          },
        ],
      },
      ROUTE,
    );
    expect(stops.map((s) => s.name)).toEqual([
      "Gorge Overlook",
      "Mountain Heritage Center",
      "Biscuit Barn",
    ]);
    const [view, museum, food] = stops;
    expect(view).toMatchObject({ kind: "viewpoint", costPerPerson: 0, isDemo: false });
    expect(view!.tags).toContain("free");
    expect(view!.tags).toContain("hidden-gem");
    expect(museum).toMatchObject({
      kind: "attraction",
      costSource: "listed",
      interests: ["history"],
    });
    expect(museum!.mapsUrl).toBe("https://www.openstreetmap.org/way/5");
    expect(food).toMatchObject({
      kind: "restaurant",
      costSource: "price-level",
      description: "American restaurant",
    });
    expect(food!.tags).toEqual(["food"]);
  });

  it("spreads picks along the whole route instead of bunching near one town", () => {
    const near = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, position: 0.1 }));
    const far = [{ id: "b", position: 0.9 }];
    const kept = spreadAlongRoute([...near, ...far], 3);
    expect(kept.map((s) => s.id)).toContain("b");
  });

  it("turns Wikipedia's nearby sights into stops, best known first, near the road only", () => {
    const page = (
      id: number,
      title: string,
      description: string,
      lat: number,
      lng: number,
      views: number,
    ) => ({
      pageid: id,
      title,
      description,
      coordinates: [{ lat, lon: lng }],
      pageviews: { a: views },
      length: 5000,
    });
    const stops = parseWikiRouteStops(
      [
        {
          query: {
            pages: {
              1: page(
                1,
                "Chimney Rock State Park",
                "State park in North Carolina",
                35.43,
                -82.0,
                20000,
              ),
              2: page(2, "Lake Lure", "Town in North Carolina", 35.42, -82.2, 9000),
              3: page(3, "Far Museum", "Art museum", 36.5, -79.0, 50000),
              4: page(4, "Old Mill Falls", "Waterfall in North Carolina", 35.3, -81.62, 300),
            },
          },
        },
        {
          query: {
            pages: {
              1: page(
                1,
                "Chimney Rock State Park",
                "State park in North Carolina",
                35.43,
                -82.0,
                20000,
              ),
            },
          },
        },
      ],
      ROUTE,
    );
    // A town isn't a sight, and a museum 100+ km away isn't on the way.
    expect(stops.map((s) => s.name)).toEqual(["Chimney Rock State Park", "Old Mill Falls"]);
    expect(stops[0]).toMatchObject({ kind: "park", costPerPerson: 0, costSource: "price-level" });
    expect(stops[0]!.mapsUrl).toBe("https://en.wikipedia.org/wiki/Chimney_Rock_State_Park");
    expect(stops[1]).toMatchObject({ kind: "viewpoint" });
    expect(stops[1]!.tags).toContain("hidden-gem");
  });

  it("keeps only sights worth the detour", () => {
    expect(worthTheDetour("Shopping mall in North Carolina", "free-activity", 90000)).toBe(false);
    expect(worthTheDetour("Baseball park in North Carolina", "park", 5000)).toBe(false);
    // A house on the historic register needs real interest to be a stop.
    expect(worthTheDetour("Historic house in North Carolina", "free-activity", 300)).toBe(false);
    expect(worthTheDetour("Historic house in North Carolina", "free-activity", 8000)).toBe(true);
    expect(worthTheDetour("Mountain in North Carolina", "viewpoint", 80)).toBe(true);
    expect(worthTheDetour("Museum in Arizona", "attraction", 100)).toBe(false);
    expect(worthTheDetour("Cliff dwelling in Arizona", "free-activity", 40000)).toBe(true);
  });
});
