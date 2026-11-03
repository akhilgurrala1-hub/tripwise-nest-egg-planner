/**
 * Geometry for the travel scenes (pure, so the final frame can be server-rendered
 * and tested). Scenes live in a 560×108 SVG; the ground is at y = 78. Every scene
 * runs from the hollow origin ring on the left to the coral destination dot on the
 * right, like the logo.
 */
import type { TransportMode, TripType } from "@/lib/demo-data";

export const SCENE_W = 560;
export const SCENE_H = 108;
export const GROUND = 78;
export const WATER = 76;
export const ORIGIN_X = 28;
export const DEST_X = 532;

export type SceneKind = "car" | "flight" | "cruise" | "train" | "bus" | "home";

/** Which picture a trip gets: by how it's taken, so switching the mode replays the scene too. */
export function sceneFor(tripType: TripType, mode: TransportMode): SceneKind {
  if (tripType === "staycation") return "home";
  if (tripType === "cruise") return "cruise";
  if (tripType === "flight") return "flight";
  if (tripType === "rail") return mode === "bus" ? "bus" : "train";
  return "car";
}

export interface Pose {
  x: number;
  y: number;
  /** Heading in degrees (0 = pointing right) */
  angle: number;
}

interface Motion {
  /** Fraction of the track where the vehicle comes to rest (it parks short of the dot) */
  stopAt: number;
  durationMs: number;
  /** Whether the vehicle turns to follow the track */
  follow: boolean;
  ease: (t: number) => number;
}

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeInOutQuart = (t: number) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const MOTION: Record<Exclude<SceneKind, "home">, Motion> = {
  car: { stopAt: 0.86, durationMs: 1300, follow: false, ease: easeInOutCubic },
  bus: { stopAt: 0.85, durationMs: 1400, follow: false, ease: easeInOutCubic },
  train: { stopAt: 0.84, durationMs: 1100, follow: false, ease: easeInOutQuart },
  flight: { stopAt: 0.84, durationMs: 1600, follow: true, ease: easeInOutCubic },
  cruise: { stopAt: 0.82, durationMs: 2000, follow: false, ease: easeOutCubic },
};

/** The flight's arc: a quadratic from the origin, peaking near the top of the scene, down to the destination. */
const ARC = { x0: ORIGIN_X, y0: GROUND, cx: SCENE_W / 2, cy: -6, x1: DEST_X, y1: GROUND };

export const FLIGHT_PATH = `M ${ARC.x0} ${ARC.y0} Q ${ARC.cx} ${ARC.cy} ${ARC.x1} ${ARC.y1}`;

function arcAt(u: number) {
  const a = 1 - u;
  return {
    x: a * a * ARC.x0 + 2 * a * u * ARC.cx + u * u * ARC.x1,
    y: a * a * ARC.y0 + 2 * a * u * ARC.cy + u * u * ARC.y1,
    dx: 2 * a * (ARC.cx - ARC.x0) + 2 * u * (ARC.x1 - ARC.cx),
    dy: 2 * a * (ARC.cy - ARC.y0) + 2 * u * (ARC.y1 - ARC.cy),
  };
}

// Arc-length table, so the plane moves at the speed the route draws (the route uses pathLength=1).
const ARC_STEPS = 96;
const ARC_TABLE: number[] = (() => {
  const out = [0];
  let prev = arcAt(0);
  for (let i = 1; i <= ARC_STEPS; i++) {
    const p = arcAt(i / ARC_STEPS);
    out.push(out[i - 1]! + Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  return out;
})();

function arcParamForLength(fraction: number): number {
  const target = Math.max(0, Math.min(1, fraction)) * ARC_TABLE[ARC_STEPS]!;
  let i = 1;
  while (i < ARC_STEPS && ARC_TABLE[i]! < target) i++;
  const a = ARC_TABLE[i - 1]!;
  const b = ARC_TABLE[i]!;
  const local = b > a ? (target - a) / (b - a) : 0;
  return (i - 1 + local) / ARC_STEPS;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Where the vehicle is when `fraction` of the track (by length) has been covered. */
export function poseAt(kind: Exclude<SceneKind, "home">, fraction: number): Pose {
  if (kind === "flight") {
    const p = arcAt(arcParamForLength(fraction));
    return { x: round(p.x), y: round(p.y), angle: round((Math.atan2(p.dy, p.dx) * 180) / Math.PI) };
  }
  const y = kind === "cruise" ? WATER : GROUND;
  return { x: round(ORIGIN_X + (DEST_X - ORIGIN_X) * fraction), y, angle: 0 };
}

/** The resting pose, rendered on the server and shown whenever nothing is animating. */
export function restingPose(kind: Exclude<SceneKind, "home">): Pose {
  return poseAt(kind, MOTION[kind].stopAt);
}

export interface SceneFrame {
  /** 0–1 through the animation */
  offset: number;
  pose: Pose;
  /** 0–1 of the route drawn behind the vehicle */
  route: number;
  /** Distance travelled, for turning wheels */
  distance: number;
}

/** Keyframes sampled from the eased motion: linear between samples, eased overall. */
export function sceneFrames(kind: Exclude<SceneKind, "home">, samples = 32): SceneFrame[] {
  const m = MOTION[kind];
  const start = 0.02;
  const frames: SceneFrame[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const fraction = start + (m.stopAt - start) * m.ease(t);
    frames.push({
      offset: round(t * 1000) / 1000,
      pose: poseAt(kind, fraction),
      route: fraction,
      distance: (DEST_X - ORIGIN_X) * fraction,
    });
  }
  return frames;
}

export function poseTransform(p: Pose, follow: boolean): string {
  return follow
    ? `translate(${p.x}px, ${p.y}px) rotate(${p.angle}deg)`
    : `translate(${p.x}px, ${p.y}px)`;
}

/** A gentle repeating wave across the scene (and one wavelength past it, so it can scroll). */
export function wavePath(y: number, wavelength = 40, amplitude = 2.5): string {
  const half = wavelength / 2;
  let d = `M ${-wavelength} ${y} q ${half / 2} ${-amplitude} ${half} 0`;
  const count = Math.ceil((SCENE_W + wavelength * 2) / half);
  for (let i = 0; i < count; i++) d += ` t ${half} 0`;
  return d;
}
