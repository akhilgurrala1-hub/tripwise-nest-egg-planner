import { describe, expect, it } from "vitest";

import {
  isSettled,
  projectMomentum,
  rubberBand,
  rubberClamp,
  settleTime,
  snapIndex,
  springAt,
  springEasing,
  SPRINGS,
} from "@/lib/spring";

describe("springs", () => {
  it("start where they are and end at the target", () => {
    expect(springAt(0, 100, 0, 0, SPRINGS.smooth).x).toBe(0);
    const end = springAt(0, 100, 0, 2, SPRINGS.smooth);
    expect(end.x).toBeCloseTo(100, 3);
    expect(isSettled(end, 100)).toBe(true);
  });

  it("a critically damped spring never overshoots from rest", () => {
    let max = 0;
    for (let t = 0; t < 1.5; t += 1 / 120)
      max = Math.max(max, springAt(0, 1, 0, t, SPRINGS.snappy).x);
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("an underdamped spring carries momentum into a small bounce", () => {
    let max = 0;
    for (let t = 0; t < 1.5; t += 1 / 120)
      max = Math.max(max, springAt(0, 1, 0, t, SPRINGS.bouncy).x);
    expect(max).toBeGreaterThan(1.01);
    expect(max).toBeLessThan(1.15);
  });

  it("keeps its velocity when retargeted mid-flight (interruptible)", () => {
    const mid = springAt(0, 100, 0, 0.1, SPRINGS.smooth);
    expect(mid.v).toBeGreaterThan(0);
    // Retarget from the current state: the first frame continues at the same speed.
    const next = springAt(mid.x, 40, mid.v, 0, SPRINGS.smooth);
    expect(next.x).toBe(mid.x);
    expect(next.v).toBe(mid.v);
  });

  it("matches its velocity numerically", () => {
    for (const cfg of [SPRINGS.smooth, SPRINGS.bouncy]) {
      const t = 0.12;
      const h = 1e-5;
      const a = springAt(0, 1, 2, t - h, cfg).x;
      const b = springAt(0, 1, 2, t + h, cfg).x;
      expect(springAt(0, 1, 2, t, cfg).v).toBeCloseTo((b - a) / (2 * h), 3);
    }
  });

  it("gives CSS an easing that ends exactly at 1", () => {
    const { easing, ms } = springEasing(SPRINGS.smooth, 20);
    expect(easing.startsWith("linear(0, ")).toBe(true);
    expect(easing.endsWith(", 1)")).toBe(true);
    expect(ms).toBe(Math.round(settleTime(SPRINGS.smooth) * 1000));
    expect(ms).toBeGreaterThan(300);
    expect(ms).toBeLessThan(1200);
  });
});

describe("momentum and edges", () => {
  it("projects a flick the way UIScrollView does", () => {
    expect(projectMomentum(1000)).toBeCloseTo(499, 0);
    expect(projectMomentum(-1000)).toBeCloseTo(-499, 0);
    expect(projectMomentum(0)).toBe(0);
  });

  it("rubber-bands past an edge, resisting more the further it goes", () => {
    const a = rubberBand(50, 300);
    const b = rubberBand(100, 300);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(50);
    expect(b - a).toBeLessThan(a);
    expect(rubberBand(10_000, 300)).toBeLessThan(300);
    expect(rubberBand(-50, 300)).toBeCloseTo(-a);
    expect(rubberClamp(150, 0, 200, 300)).toBe(150);
    expect(rubberClamp(250, 0, 200, 300)).toBeGreaterThan(200);
    expect(rubberClamp(250, 0, 200, 300)).toBeLessThan(250);
  });

  it("snaps a released drag to the stop the flick was heading for", () => {
    const stops = [0, 100, 200, 300];
    expect(snapIndex(40, 0, stops)).toBe(0);
    expect(snapIndex(60, 0, stops)).toBe(1);
    // A quick flick right from 40 lands further along.
    expect(snapIndex(40, 1500, stops)).toBeGreaterThan(0);
    expect(snapIndex(260, -2000, stops)).toBeLessThan(3);
  });
});
