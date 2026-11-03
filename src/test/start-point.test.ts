import { afterEach, describe, expect, it, vi } from "vitest";

import { devicePosition, LocationError } from "@/lib/live/location";
import { destinationForNewStart, recommendDestinations } from "@/lib/recommend";

const NYC = { lat: 40.7128, lon: -74.006 };
const CHARLOTTE = { lat: 35.2271, lon: -80.8431 };

describe("changing where the trip starts", () => {
  it("moves a road trip off a far-away pick to the best fit from the new start", () => {
    // Blue Ridge suits a trip from Charlotte, not a road trip from New York.
    const fromCharlotte = recommendDestinations({
      from: CHARLOTTE,
      tripType: "road-trip",
      interests: [],
    });
    const pick = fromCharlotte[0]!.id;
    const next = destinationForNewStart({
      destinationId: pick,
      tripType: "road-trip",
      interests: [],
      from: NYC,
    });
    const fromNyc = recommendDestinations({
      from: NYC,
      tripType: "road-trip",
      interests: [],
      limit: 5,
    });
    expect(next).toBe(fromNyc[0]!.id);
    expect(fromNyc.map((s) => s.id)).not.toContain(pick);
  });

  it("keeps a pick that still suits the new start", () => {
    const top = recommendDestinations({
      from: NYC,
      tripType: "road-trip",
      interests: [],
      limit: 5,
    });
    expect(
      destinationForNewStart({
        destinationId: top[2]!.id,
        tripType: "road-trip",
        interests: [],
        from: NYC,
      }),
    ).toBeNull();
  });

  it("never changes a typed destination or a staycation", () => {
    expect(
      destinationForNewStart({
        destinationId: "custom",
        tripType: "flight",
        interests: [],
        from: NYC,
      }),
    ).toBeNull();
    expect(
      destinationForNewStart({
        destinationId: "hometown",
        tripType: "staycation",
        interests: [],
        from: NYC,
      }),
    ).toBeNull();
  });
});

describe("asking the device for its location", () => {
  const original = navigator.geolocation;
  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", { value: original, configurable: true });
  });

  const fake = (outcomes: ("ok" | "denied" | "unavailable")[]) => {
    const calls: PositionOptions[] = [];
    const getCurrentPosition = vi.fn(
      (ok: PositionCallback, fail: PositionErrorCallback, opts: PositionOptions) => {
        calls.push(opts);
        const o = outcomes[calls.length - 1] ?? "unavailable";
        if (o === "ok") ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition);
        else
          fail({
            code: o === "denied" ? 1 : 2,
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
      },
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    return calls;
  };

  it("tries again with high accuracy when the first fix fails", async () => {
    const calls = fake(["unavailable", "ok"]);
    await expect(devicePosition()).resolves.toEqual({ lat: 1, lon: 2 });
    expect(calls.map((c) => c.enableHighAccuracy)).toEqual([false, true]);
  });

  it("doesn't ask again after a refusal", async () => {
    const calls = fake(["denied"]);
    const err = await devicePosition().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LocationError);
    expect((err as LocationError).reason).toBe("denied");
    expect(calls).toHaveLength(1);
  });

  it("explains what to check when the device has no fix", async () => {
    fake(["unavailable", "unavailable"]);
    await expect(devicePosition()).rejects.toThrow(/Location Services/);
  });
});
