/**
 * Spring physics for interface motion, the way native platforms do it: a damped
 * harmonic oscillator described by how quickly it responds and how much it
 * bounces (SwiftUI's `response` and `dampingFraction`), solved exactly rather than
 * stepped, so a frame never overshoots by accident and an animation can be
 * retargeted mid-flight while keeping its current velocity.
 *
 * Also here: Apple's momentum projection (where a flick would come to rest) and
 * rubber-banding (how far content follows the finger past an edge). Pure, so the
 * numbers are tested; React hooks in `components/app/motion.tsx` drive them.
 */

export interface SpringConfig {
  /** Seconds for one (undamped) oscillation: lower is snappier. */
  response: number;
  /** 1 is critically damped (no bounce); 0.7–0.9 leaves a little bounce. */
  damping: number;
}

/** UI defaults: critically damped for anything the traveler didn't throw. */
export const SPRINGS = {
  /** Controls following the pointer, selection indicators */
  snappy: { response: 0.32, damping: 1 },
  /** Surfaces, sheets, page content */
  smooth: { response: 0.45, damping: 1 },
  /** Released after a flick: carries the momentum into a small bounce */
  bouncy: { response: 0.42, damping: 0.78 },
  /** Press feedback: immediate down, quick settle up */
  press: { response: 0.22, damping: 1 },
} as const satisfies Record<string, SpringConfig>;

export interface SpringState {
  /** Position, in whatever unit is animated (px, scale, 0..1) */
  x: number;
  /** Velocity, units per second */
  v: number;
}

/**
 * The spring's state `t` seconds after it starts at `from` (with velocity `v0`)
 * heading for `to`. Exact solution of x'' + 2ζωx' + ω²x = 0 around the target.
 */
export function springAt(
  from: number,
  to: number,
  v0: number,
  t: number,
  { response, damping }: SpringConfig,
): SpringState {
  const omega = (2 * Math.PI) / Math.max(0.01, response);
  const zeta = Math.min(1, Math.max(0.05, damping));
  const x0 = from - to;
  if (zeta >= 1 - 1e-6) {
    // Critically damped: the fastest return with no overshoot (unless thrown).
    const b = v0 + omega * x0;
    const e = Math.exp(-omega * t);
    return { x: to + (x0 + b * t) * e, v: (v0 - omega * b * t) * e };
  }
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const a = x0;
  const b = (v0 + zeta * omega * x0) / wd;
  const e = Math.exp(-zeta * omega * t);
  const cos = Math.cos(wd * t);
  const sin = Math.sin(wd * t);
  return {
    x: to + e * (a * cos + b * sin),
    v: e * (-zeta * omega * (a * cos + b * sin) + wd * (-a * sin + b * cos)),
  };
}

/** Close enough to rest that one more frame changes nothing visible. */
export function isSettled(s: SpringState, to: number, precision = 0.01): boolean {
  return Math.abs(s.x - to) < precision && Math.abs(s.v) < precision * 10;
}

/** How long the spring takes to settle from a unit step, in seconds (for CSS durations). */
export function settleTime(config: SpringConfig, precision = 0.001): number {
  for (let t = 0; t < 5; t += 1 / 240) {
    const s = springAt(0, 1, 0, t, config);
    if (Math.abs(s.x - 1) < precision && Math.abs(s.v) < precision * 10) return t;
  }
  return 5;
}

/**
 * The same spring as a CSS easing (`linear()` with sampled points) and its
 * duration, so CSS transitions move like the JS springs. Browsers without
 * `linear()` fall back to the ease-out declared before it.
 */
export function springEasing(config: SpringConfig, samples = 40): { easing: string; ms: number } {
  const duration = settleTime(config);
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (duration * i) / samples;
    pts.push(String(Math.round(springAt(0, 1, 0, t, config).x * 1000) / 1000));
  }
  pts[pts.length - 1] = "1";
  return { easing: `linear(${pts.join(", ")})`, ms: Math.round(duration * 1000) };
}

/**
 * Where content thrown at `velocity` (units per second) comes to rest, Apple's
 * UIScrollView projection: deceleration 0.998 per millisecond is "normal".
 */
export function projectMomentum(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * How far content follows the pointer past an edge: it keeps moving but resists
 * more the further it goes, never more than `dimension` (Apple's rubber band,
 * constant 0.55). `overshoot` is signed.
 */
export function rubberBand(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0 || overshoot === 0) return 0;
  const d = Math.abs(overshoot);
  const banded = (1 - 1 / ((d * constant) / dimension + 1)) * dimension;
  return Math.sign(overshoot) * banded;
}

/** A position clamped to [min, max] with the part beyond rubber-banded. */
export function rubberClamp(x: number, min: number, max: number, dimension: number): number {
  if (x < min) return min + rubberBand(x - min, dimension);
  if (x > max) return max + rubberBand(x - max, dimension);
  return x;
}

/** The index a released drag should settle on: the nearest after projecting the flick. */
export function snapIndex(
  position: number,
  velocity: number,
  stops: readonly number[],
  decelerationRate = 0.99,
): number {
  if (!stops.length) return -1;
  const projected = position + projectMomentum(velocity, decelerationRate);
  let best = 0;
  for (let i = 1; i < stops.length; i++)
    if (Math.abs(stops[i]! - projected) < Math.abs(stops[best]! - projected)) best = i;
  return best;
}
