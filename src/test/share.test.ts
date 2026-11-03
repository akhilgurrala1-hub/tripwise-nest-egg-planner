import { describe, expect, it } from "vitest";

import {
  cleanSharedTrip,
  codeFromHash,
  decodeTrip,
  encodeTrip,
  sharedTripPayload,
  shareUrl,
} from "@/lib/share";
import { buildTrip, currentTrip, sampleSetup, tripActions } from "@/lib/trip-store";

const myTrip = () => {
  const trip = buildTrip({
    ...sampleSetup(),
    origin: "Tempe, AZ",
    originPoint: { lat: 33.4255, lon: -111.94 },
  });
  return {
    ...trip,
    bookings: { hotel: { status: "booked" as const, confirmation: "ABC123", price: 412 } },
  };
};

describe("sharing a trip by link", () => {
  it("round-trips the plan through a link", async () => {
    const trip = myTrip();
    const url = await shareUrl(trip, "https://waypoint.example");
    expect(url.startsWith("https://waypoint.example/shared#trip=z")).toBe(true);
    // Short enough for texts and chat apps.
    expect(url.length).toBeLessThan(8000);
    const back = await decodeTrip(codeFromHash(new URL(url).hash));
    expect(back?.setup.destinationId).toBe(trip.setup.destinationId);
    expect(back?.setup.travelers).toBe(trip.setup.travelers);
    expect(back?.inputs).toEqual(trip.inputs);
    expect(back?.itinerary?.days.length).toBe(trip.itinerary?.days.length);
  });

  it("leaves out bookings, confirmation numbers and the exact start location", async () => {
    const payload = sharedTripPayload(myTrip());
    const text = JSON.stringify(payload);
    expect(text).not.toContain("ABC123");
    expect(text).not.toContain("33.4255");
    expect(payload.setup.origin).toBe("Tempe, AZ");
    expect("bookings" in payload || "cloud" in payload || "id" in payload).toBe(false);
  });

  it("rejects links that are cut off or aren't a trip", async () => {
    const code = await encodeTrip(sharedTripPayload(myTrip()));
    expect(await decodeTrip(code.slice(0, code.length / 2))).toBeNull();
    expect(await decodeTrip("")).toBeNull();
    expect(await decodeTrip("zzzz")).toBeNull();
    expect(await decodeTrip("j" + btoa(JSON.stringify({ hello: 1 })))).toBeNull();
  });

  it("treats an edited link as untrusted", () => {
    const payload = sharedTripPayload(myTrip());
    const item = payload.itinerary!.days[0]!.items[0]!;
    const evil = {
      ...payload,
      setup: { ...payload.setup, travelers: 5000, originPoint: { lat: 1, lon: 2 } },
      itinerary: {
        ...payload.itinerary!,
        days: [
          {
            ...payload.itinerary!.days[0]!,
            items: [
              { ...item, mapsUrl: "javascript:alert(1)" },
              { ...item, mapsUrl: "https://maps.google.com/?q=x" },
            ],
          },
        ],
      },
    };
    const clean = cleanSharedTrip(JSON.parse(JSON.stringify(evil)))!;
    expect(clean.setup.travelers).toBe(20);
    expect("originPoint" in clean.setup).toBe(false);
    expect(clean.itinerary!.days[0]!.items[0]!.mapsUrl).toBeNull();
    expect(clean.itinerary!.days[0]!.items[1]!.mapsUrl).toBe("https://maps.google.com/?q=x");
  });

  it("opens as the traveler's own new trip, without the sender's bookings", async () => {
    const sender = myTrip();
    const shared = await decodeTrip(await encodeTrip(sharedTripPayload(sender)));
    expect(tripActions.openSharedTrip(shared!)).toBe(true);
    const mine = currentTrip();
    expect(mine.id).not.toBe(sender.id);
    expect(mine.isSample).toBe(false);
    expect(mine.bookings).toEqual({});
    expect(mine.cloud).toBeNull();
    expect(mine.setup.destinationId).toBe(sender.setup.destinationId);
  });
});
