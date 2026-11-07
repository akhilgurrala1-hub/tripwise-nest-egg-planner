import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties } from "react";

import { TRIP_COLOR } from "./trip-colors";

import type { TransportMode, TripType } from "@/lib/demo-data";
import { springEasing, SPRINGS } from "@/lib/spring";
import { cn } from "@/lib/utils";

/** The smooth spring as a Web Animations easing, or ease-out where linear() isn't supported. */
let settleEasing: string | null = null;
const SETTLE_EASING = () =>
  (settleEasing ??=
    typeof CSS !== "undefined" && CSS.supports?.("transition-timing-function", "linear(0, 1)")
      ? springEasing(SPRINGS.smooth).easing
      : "ease-out");
import {
  DEST_X,
  FLIGHT_PATH,
  GROUND,
  MOTION,
  ORIGIN_X,
  SCENE_H,
  SCENE_W,
  WATER,
  poseTransform,
  restingPose,
  sceneFor,
  sceneFrames,
  wavePath,
  type SceneKind,
} from "./travel-scene-geometry";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Wheel radius in scene units, for turning wheels at road speed. */
const WHEEL_R = 5;
const DOT_MS = 380;

/**
 * A small picture of how the trip is taken. Switching trip type (or how you get
 * there) plays the journey: the car drives the road, the plane flies its arc, the
 * ship sails, the train pulls in — drawing the route from the origin ring to the
 * coral destination dot, like the logo. It rests on the final frame, which is also
 * what the server renders, so nothing moves on page load or with reduced motion.
 */
export function TravelScene({
  tripType,
  mode,
  caption,
  from,
  to,
  className,
}: {
  tripType: TripType;
  mode: TransportMode;
  caption?: string;
  from?: string;
  to?: string;
  className?: string;
}) {
  const kind = sceneFor(tripType, mode);
  const root = useRef<SVGSVGElement>(null);
  const mounted = useRef(false);
  const playKey = `${tripType}:${mode}`;

  useIsoLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const svg = root.current;
    if (!svg || typeof svg.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const running = play(kind, svg);
    return () => running.forEach((a) => a.cancel());
  }, [playKey]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-[color-mix(in_oklab,var(--trip)_7%,var(--card))] transition-[background-color] duration-500 select-none",
        className,
      )}
      style={{ "--trip": TRIP_COLOR[tripType] } as CSSProperties}
    >
      {caption && (
        <p key={playKey} className="px-4 pt-2 text-footnote text-muted-foreground">
          {caption}
        </p>
      )}
      <svg
        ref={root}
        viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
        className="travel-scene block h-auto w-full"
        aria-hidden
        focusable="false"
      >
        <Scene kind={kind} />
      </svg>
      {kind !== "home" && (from || to) && (
        <div className="pointer-events-none absolute inset-x-3.5 bottom-1.5 flex justify-between gap-4 text-micro text-muted-foreground">
          <span className="truncate">{from}</span>
          <span className="truncate text-right font-medium text-foreground">{to}</span>
        </div>
      )}
    </div>
  );
}

function Scene({ kind }: { kind: SceneKind }) {
  if (kind === "home") return <HomeScene />;
  const rest = restingPose(kind);
  const follow = MOTION[kind].follow;
  return (
    <>
      {kind === "flight" && <Clouds />}
      {kind === "car" || kind === "bus" ? <Hills /> : null}

      {/* Track */}
      {kind === "flight" ? (
        <>
          <line
            x1={0}
            y1={GROUND}
            x2={SCENE_W}
            y2={GROUND}
            className="stroke-border"
            strokeWidth={1.5}
          />
          <path
            d={FLIGHT_PATH}
            fill="none"
            className="stroke-border"
            strokeWidth={1.5}
            strokeDasharray="3 5"
          />
          <Route d={FLIGHT_PATH} width={2} />
        </>
      ) : kind === "cruise" ? (
        <Water />
      ) : kind === "train" ? (
        <>
          <line
            x1={0}
            y1={GROUND + 4}
            x2={SCENE_W}
            y2={GROUND + 4}
            className="stroke-border"
            strokeWidth={4}
            strokeDasharray="2 7"
          />
          <line
            x1={0}
            y1={GROUND}
            x2={SCENE_W}
            y2={GROUND}
            className="stroke-border"
            strokeWidth={1.5}
          />
          <Route d={`M ${ORIGIN_X} ${GROUND} H ${DEST_X}`} width={2} />
        </>
      ) : (
        <>
          <line
            x1={0}
            y1={GROUND}
            x2={SCENE_W}
            y2={GROUND}
            className="stroke-border"
            strokeWidth={1.5}
          />
          <Route d={`M ${ORIGIN_X} ${GROUND} H ${DEST_X}`} width={2.5} />
        </>
      )}

      <Endpoints y={kind === "cruise" ? WATER + 2 : GROUND} />

      <g data-part="vehicle" transform={svgTransform(poseTransform(rest, follow))}>
        {kind === "car" && <CarShape />}
        {kind === "bus" && <BusShape />}
        {kind === "train" && <TrainShape />}
        {kind === "flight" && <PlaneShape />}
        {kind === "cruise" && (
          <g className="scene-bob">
            <ShipShape />
          </g>
        )}
      </g>
    </>
  );
}

/** The route, drawn behind the vehicle (pathLength 1 so progress is a plain fraction). */
function Route({ d, width }: { d: string; width: number }) {
  return (
    <path
      data-part="route"
      d={d}
      fill="none"
      pathLength={1}
      strokeDasharray="1 1"
      strokeDashoffset={0}
      strokeLinecap="round"
      className="stroke-(--trip)"
      strokeWidth={width}
    />
  );
}

function Endpoints({ y }: { y: number }) {
  return (
    <>
      <circle cx={ORIGIN_X} cy={y} r={5} className="fill-card stroke-(--trip)" strokeWidth={2.5} />
      <circle
        data-part="ripple"
        cx={DEST_X}
        cy={y}
        r={6}
        className="scene-part fill-none stroke-brand-coral"
        strokeWidth={2}
        opacity={0}
      />
      <circle data-part="dest" cx={DEST_X} cy={y} r={6} className="scene-part fill-brand-coral" />
    </>
  );
}

function Hills() {
  return (
    <path
      d={`M 0 ${GROUND} C 50 56, 110 54, 160 68 S 260 50, 330 64 S 450 52, 560 66`}
      fill="none"
      className="stroke-border"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  );
}

function Clouds() {
  const cloud = "a 7 7 0 0 1 12 -5 a 9 9 0 0 1 16 2 a 6 6 0 0 1 3 11 h -28 a 6 6 0 0 1 -3 -8 z";
  return (
    <g data-part="clouds" className="fill-muted">
      <path d={`M 120 34 ${cloud}`} />
      <path d={`M 400 22 ${cloud}`} transform="translate(400 22) scale(0.8) translate(-400 -22)" />
    </g>
  );
}

function Water() {
  return (
    <g>
      <path
        d={wavePath(WATER + 6)}
        fill="none"
        className="scene-wave stroke-(--trip)/45"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d={wavePath(WATER + 13, 48, 2)}
        fill="none"
        className="scene-wave-slow stroke-border"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </g>
  );
}

// ---- Vehicles: drawn facing right, with (0, 0) where they meet the ground ----

function Wheel({ cx, cy = -4, r = WHEEL_R }: { cx: number; cy?: number; r?: number }) {
  return (
    <g data-part="wheel" className="scene-part">
      <circle cx={cx} cy={cy} r={r} className="fill-foreground" />
      <circle cx={cx} cy={cy} r={r * 0.42} className="fill-card" />
      <rect x={cx - 0.6} y={cy - r + 0.6} width={1.2} height={r * 0.5} className="fill-card" />
    </g>
  );
}

function CarShape() {
  return (
    <g>
      <path
        d="M -27 -7 L -27 -12 Q -27 -15 -24 -15.6 L -16 -16.6 L -9.5 -23 Q -8 -24.6 -5.5 -24.6 L 8 -24.6 Q 10.5 -24.6 12 -23 L 18 -16.6 L 25 -15.4 Q 28 -14.6 28 -11.5 L 28 -7 Q 28 -5 26 -5 L -25 -5 Q -27 -5 -27 -7 Z"
        className="fill-(--trip)"
      />
      <path d="M -12.5 -17.2 L -7 -22.6 L 0.5 -22.6 L 0.5 -17.2 Z" className="fill-card" />
      <path d="M 2.5 -17.2 L 2.5 -22.6 L 8.2 -22.6 L 13.6 -17.2 Z" className="fill-card" />
      <rect x={24.5} y={-12.5} width={3} height={2.2} rx={1} className="fill-card" />
      <Wheel cx={-15} />
      <Wheel cx={16} />
    </g>
  );
}

function BusShape() {
  return (
    <g>
      <rect x={-31} y={-28} width={62} height={23} rx={4} className="fill-(--trip)" />
      {[-27, -18, -9, 0, 9].map((x) => (
        <rect key={x} x={x} y={-24.5} width={7} height={7} rx={1.2} className="fill-card" />
      ))}
      <path d="M 19 -24.5 L 26 -24.5 Q 29 -24.5 29 -21 L 29 -15 L 19 -15 Z" className="fill-card" />
      <rect x={-31} y={-12} width={62} height={1.6} className="fill-card/60" />
      <Wheel cx={-19} />
      <Wheel cx={19} />
    </g>
  );
}

function TrainShape() {
  return (
    <g>
      <rect x={-40} y={-25} width={33} height={20} rx={3.5} className="fill-(--trip)" />
      {[-36, -26, -16].map((x) => (
        <rect key={x} x={x} y={-21.5} width={7} height={7} rx={1.2} className="fill-card" />
      ))}
      <rect x={-8} y={-11} width={4} height={2} className="fill-foreground" />
      <path d="M -4 -5 L -4 -25 L 16 -25 Q 30 -25 33 -10 L 34 -5 Z" className="fill-(--trip)" />
      <rect x={0} y={-21.5} width={8} height={7} rx={1.2} className="fill-card" />
      <path d="M 15 -21.5 L 21 -21.5 Q 26 -21 28.5 -14.5 L 15 -14.5 Z" className="fill-card" />
      {[-33, -14, 3, 23].map((x) => (
        <Wheel key={x} cx={x} cy={-3} r={3.2} />
      ))}
    </g>
  );
}

function PlaneShape() {
  return (
    <g transform="scale(0.85)">
      <path
        d="M -22 0 L -18 -2.6 L 17 -2.6 Q 26 -2.4 29 0 Q 26 2.4 17 2.6 L -18 2.6 Z"
        className="fill-(--trip)"
      />
      <path d="M 2 -2 L -8 -19 L -2.5 -19 L 12 -2 Z" className="fill-(--trip)" />
      <path d="M 2 2 L -8 19 L -2.5 19 L 12 2 Z" className="fill-(--trip)" />
      <path d="M -15 -2 L -21 -9 L -17.5 -9 L -9 -2 Z" className="fill-(--trip)" />
      <path d="M -15 2 L -21 9 L -17.5 9 L -9 2 Z" className="fill-(--trip)" />
      <circle cx={21} cy={0} r={1.3} className="fill-card" />
    </g>
  );
}

function ShipShape() {
  return (
    <g>
      <rect x={-6} y={-36} width={8} height={10} rx={1.5} className="fill-foreground" />
      <rect
        x={-17}
        y={-28}
        width={30}
        height={8}
        rx={2}
        className="fill-card stroke-foreground"
        strokeWidth={1.5}
      />
      <rect
        x={-25}
        y={-20.5}
        width={44}
        height={8.5}
        rx={2}
        className="fill-card stroke-foreground"
        strokeWidth={1.5}
      />
      {[-19, -12, -5, 2, 9].map((x) => (
        <rect key={x} x={x} y={-18} width={4} height={3} rx={0.8} className="fill-(--trip)/70" />
      ))}
      <path d="M -36 -12 L 37 -12 L 28 2 L -29 2 Z" className="fill-(--trip)" />
      {[-22, -12, -2, 8, 18].map((x) => (
        <circle key={x} cx={x} cy={-6} r={1.3} className="fill-card" />
      ))}
    </g>
  );
}

function HomeScene() {
  const sky = `scene-sky-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <>
      <clipPath id={sky}>
        <rect x={0} y={0} width={SCENE_W} height={GROUND} />
      </clipPath>
      {/* The sun rises from behind the horizon */}
      <g clipPath={`url(#${sky})`}>
        <g data-part="sun" className="scene-part">
          <circle cx={380} cy={40} r={11} className="fill-brand-coral/25" />
          <circle cx={380} cy={40} r={6.5} className="fill-brand-coral/70" />
        </g>
      </g>
      {/* A tree beside the house */}
      <path
        d="M 520 78 L 520 64"
        className="stroke-foreground"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle
        cx={520}
        cy={58}
        r={9}
        className="fill-(--trip)/20 stroke-(--trip)"
        strokeWidth={1.5}
      />
      <line
        x1={0}
        y1={GROUND}
        x2={SCENE_W}
        y2={GROUND}
        className="stroke-border"
        strokeWidth={1.5}
      />
      <Hills />
      {/* House */}
      <g>
        <path
          d="M 432 78 L 432 50 L 462 28 L 492 50 L 492 78 Z"
          className="fill-card stroke-foreground"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path
          d="M 426 54 L 462 27 L 498 54"
          fill="none"
          className="stroke-(--trip)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x={455} y={60} width={14} height={18} rx={1.5} className="fill-(--trip)" />
        <rect
          data-part="window"
          x={440}
          y={56}
          width={9}
          height={9}
          rx={1.5}
          className="scene-part fill-brand-coral"
        />
        <rect
          x={475}
          y={56}
          width={9}
          height={9}
          rx={1.5}
          className="fill-muted stroke-border"
          strokeWidth={1}
        />
      </g>
    </>
  );
}

/** SVG attribute syntax for the same transform the animation uses. */
function svgTransform(css: string): string {
  return css.replace(/px/g, "").replace(/deg/g, "").replace(/,/g, "");
}

/** Plays the journey for `kind` inside `svg`. Returns the running animations so they can be cancelled. */
function play(kind: SceneKind, svg: SVGSVGElement): Animation[] {
  const out: Animation[] = [];
  const part = (name: string) => svg.querySelector<SVGElement>(`[data-part="${name}"]`);
  const run = (el: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    if (el) out.push(el.animate(keyframes, options));
  };
  // Parts settle into place on the same smooth spring as the rest of the app.
  const settle = SETTLE_EASING();

  if (kind === "home") {
    run(
      part("sun"),
      [
        { transform: "translate(-24px, 46px)", opacity: 0.4 },
        { transform: "translate(0px, 0px)", opacity: 1 },
      ],
      { duration: 1100, easing: settle, fill: "backwards" },
    );
    run(part("window"), POP, {
      duration: DOT_MS,
      delay: 650,
      easing: "ease-out",
      fill: "backwards",
    });
    return out;
  }

  const m = MOTION[kind];
  const frames = sceneFrames(kind);
  const travel = m.durationMs;
  const total = travel + 260;
  const k = travel / total;
  const linear = { easing: "linear", fill: "backwards" } as const;

  run(
    part("vehicle"),
    frames.map((f) => ({ offset: f.offset, transform: poseTransform(f.pose, m.follow) })),
    { duration: travel, ...linear },
  );
  svg.querySelectorAll('[data-part="wheel"]').forEach((wheel) =>
    run(
      wheel,
      frames.map((f) => ({
        offset: f.offset,
        transform: `rotate(${Math.round(((f.distance / WHEEL_R) * 180) / Math.PI)}deg)`,
      })),
      { duration: travel, ...linear },
    ),
  );
  // The route keeps pace behind the vehicle, then finishes to the destination as the dot lands.
  run(
    part("route"),
    [
      ...frames.map((f) => ({ offset: f.offset * k, strokeDashoffset: String(1 - f.route) })),
      { offset: 1, strokeDashoffset: "0" },
    ],
    { duration: total, ...linear },
  );
  run(part("clouds"), [{ transform: "translateX(28px)" }, { transform: "translateX(0px)" }], {
    duration: travel,
    easing: settle,
    fill: "backwards",
  });
  run(part("dest"), POP, {
    duration: DOT_MS,
    delay: travel - 120,
    easing: "ease-out",
    fill: "backwards",
  });
  run(
    part("ripple"),
    [
      { transform: "scale(1)", opacity: 0.7 },
      { transform: "scale(3)", opacity: 0 },
    ],
    { duration: 700, delay: travel + 60, easing: settle },
  );
  return out;
}

/** Arrival: grows in, overshoots a little, settles. */
const POP: Keyframe[] = [
  { transform: "scale(0)", opacity: 0 },
  { transform: "scale(1.3)", opacity: 1, offset: 0.6 },
  { transform: "scale(1)", opacity: 1 },
];
