import { describe, expect, it } from "vitest";

import {
  DEST_X,
  GROUND,
  MOTION,
  ORIGIN_X,
  poseAt,
  restingPose,
  sceneFor,
  sceneFrames,
  wavePath,
} from "@/components/app/travel-scene-geometry";
import { formatDateRange } from "@/components/app/TripHeader";

describe("travel scenes", () => {
  it("shows each trip type the way it's taken", () => {
    expect(sceneFor("road-trip", "car")).toBe("car");
    expect(sceneFor("road-trip", "rental-car")).toBe("car");
    expect(sceneFor("flight", "flight")).toBe("flight");
    expect(sceneFor("cruise", "flight")).toBe("cruise");
    expect(sceneFor("rail", "train")).toBe("train");
    expect(sceneFor("rail", "bus")).toBe("bus");
    expect(sceneFor("staycation", "car")).toBe("home");
  });

  it("ends every journey on the pose the server renders", () => {
    for (const kind of Object.keys(MOTION) as (keyof typeof MOTION)[]) {
      const frames = sceneFrames(kind);
      expect(frames[0]!.offset).toBe(0);
      expect(frames.at(-1)!.offset).toBe(1);
      expect(frames.at(-1)!.pose).toEqual(restingPose(kind));
      // Always forward, and parked short of the destination dot.
      for (let i = 1; i < frames.length; i++)
        expect(frames[i]!.pose.x).toBeGreaterThanOrEqual(frames[i - 1]!.pose.x);
      expect(restingPose(kind).x).toBeLessThan(DEST_X - 20);
      expect(frames.at(-1)!.route).toBeCloseTo(MOTION[kind].stopAt);
    }
  });

  it("flies the plane up, over and down toward the destination", () => {
    const takeoff = poseAt("flight", 0.05);
    const top = poseAt("flight", 0.5);
    const landing = poseAt("flight", 0.95);
    expect(takeoff.angle).toBeLessThan(-10); // climbing (SVG y grows downward)
    expect(Math.abs(top.angle)).toBeLessThan(2);
    expect(landing.angle).toBeGreaterThan(10);
    expect(top.y).toBeLessThan(GROUND - 30);
    expect(poseAt("flight", 0).x).toBeCloseTo(ORIGIN_X);
    expect(poseAt("flight", 1).x).toBeCloseTo(DEST_X);
  });

  it("covers the scene with waves that can scroll a full wavelength", () => {
    const d = wavePath(80, 40);
    expect(d.startsWith("M -40 80")).toBe(true);
    const segments = d.split(" t ").length;
    expect(segments * 20).toBeGreaterThan(560 + 40);
  });
});

describe("trip dates in the header", () => {
  it("reads naturally without time-zone shifts", () => {
    expect(formatDateRange("2026-12-03", "2026-12-06")).toBe("Dec 3 – 6, 2026");
    expect(formatDateRange("2026-11-28", "2026-12-02")).toBe("Nov 28 – Dec 2, 2026");
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("Dec 30, 2026 – Jan 2, 2027");
    expect(formatDateRange("2026-12-03", "2026-12-03")).toBe("Dec 3, 2026");
  });
});
