import { describe, expect, it } from "vitest";

import { buildRealItinerary, itineraryActivityCost, unpricedItems } from "@/lib/itinerary";
import type { RealPlace } from "@/lib/places/types";

const place = (id: string, kind: RealPlace["kind"], cost: number, source: RealPlace["costSource"] = "price-level"): RealPlace => ({
  placeId: id,
  name: `Place ${id}`,
  kind,
  typeLabel: kind === "sight" ? "Museum" : "Restaurant",
  description: "",
  address: "1 Main St",
  rating: 4.5,
  ratingCount: 100,
  mapsUrl: `https://maps.google.com/?cid=${id}`,
  costPerPerson: cost,
  costSource: source,
  interests: [],
});

const sights = [place("s1", "sight", 0, "unknown"), place("s2", "sight", 0, "unknown"), place("s3", "sight", 20, "listed")];
const restaurants = [place("r1", "restaurant", 12), place("r2", "restaurant", 25), place("r3", "restaurant", 50), place("r4", "restaurant", 12)];

describe("itinerary from real places", () => {
  const itin = buildRealItinerary({
    sights,
    restaurants,
    destName: "Asheville",
    days: 3,
    startDate: "2026-11-01",
    interests: [],
    tripType: "flight",
  });
  const items = itin.days.flatMap((d) => d.items);

  it("never uses the same real place twice", () => {
    const ids = items.map((i) => i.placeId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fills slots with open time instead of inventing places once real ones run out", () => {
    // 3 sights for 6 sight slots, 4 restaurants for 6 meal slots
    expect(items.filter((i) => i.placeId).length).toBe(7);
    expect(items.filter((i) => !i.placeId).length).toBe(5);
    expect(items.filter((i) => !i.placeId).every((i) => i.costPerPerson === 0)).toBe(true);
  });

  it("counts unpriced places separately and leaves them out of sightseeing cost", () => {
    expect(unpricedItems(itin)).toBe(2);
    expect(itineraryActivityCost(itin, 2)).toBe(40); // only the $20 listed sight, for 2 travelers
  });

  it("starts a road trip with the drive instead of a sight", () => {
    const road = buildRealItinerary({ sights, restaurants, destName: "Asheville", days: 1, startDate: "2026-11-01", interests: [], tripType: "road-trip" });
    expect(road.days[0]!.items[0]!.kind).toBe("stop");
  });
});
