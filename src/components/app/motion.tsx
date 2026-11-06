import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { formatMoney } from "@/lib/budget";
import {
  isSettled,
  rubberBand,
  rubberClamp,
  snapIndex,
  springAt,
  SPRINGS,
  type SpringConfig,
} from "@/lib/spring";
import { cn } from "@/lib/utils";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type Box = { left: number; top: number; width: number; height: number };
const BOX_KEYS = ["left", "top", "width", "height"] as const;

/**
 * A box (position and size) that moves on springs: retargeting mid-flight keeps
 * each edge's current velocity, so an interrupted move never stalls or snaps.
 * Frames write straight to the element's style (no React render per frame).
 */
export function createBoxSpring(el: HTMLElement, opts: { onlyX?: boolean } = {}) {
  const state = {} as Record<(typeof BOX_KEYS)[number], { from: number; v0: number; to: number }>;
  let t0 = 0;
  let config: SpringConfig = SPRINGS.snappy;
  let frame = 0;
  let placed = false;
  const at = (now: number) => {
    const t = (now - t0) / 1000;
    const out = {} as Record<(typeof BOX_KEYS)[number], { x: number; v: number }>;
    for (const k of BOX_KEYS) {
      const c = state[k];
      out[k] = c ? springAt(c.from, c.to, c.v0, t, config) : { x: 0, v: 0 };
    }
    return out;
  };
  const paint = (b: Record<string, { x: number }>) => {
    el.style.transform = opts.onlyX
      ? `translate3d(${b["left"]!.x}px, 0, 0)`
      : `translate3d(${b["left"]!.x}px, ${b["top"]!.x}px, 0)`;
    el.style.width = `${Math.max(0, b["width"]!.x)}px`;
    if (!opts.onlyX) el.style.height = `${Math.max(0, b["height"]!.x)}px`;
  };
  const tick = (now: number) => {
    const b = at(now);
    paint(b);
    const done = BOX_KEYS.every((k) => isSettled(b[k], state[k]!.to, 0.05));
    frame = done ? 0 : requestAnimationFrame(tick);
  };
  return {
    /** Where the box is right now (for drags that start mid-animation). */
    current(): Box {
      const b = at(performance.now());
      return { left: b.left.x, top: b.top.x, width: b.width.x, height: b.height.x };
    },
    /** Spring to a box; `velocityX` hands over a flick's speed (px/s). */
    to(box: Box, cfg: SpringConfig = SPRINGS.snappy, velocityX?: number) {
      const now = performance.now();
      if (!placed || prefersReducedMotion()) return this.jump(box);
      const b = at(now);
      for (const k of BOX_KEYS)
        state[k] = {
          from: b[k].x,
          v0: k === "left" && velocityX !== undefined ? velocityX : b[k].v,
          to: box[k],
        };
      t0 = now;
      config = cfg;
      if (!frame) frame = requestAnimationFrame(tick);
    },
    /** Put the box somewhere at once (first paint, the pointer during a drag). */
    jump(box: Box) {
      for (const k of BOX_KEYS) state[k] = { from: box[k], v0: 0, to: box[k] };
      t0 = performance.now();
      placed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      paint({
        left: { x: box.left },
        top: { x: box.top },
        width: { x: box.width },
        height: { x: box.height },
      });
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

type BoxSpring = ReturnType<typeof createBoxSpring>;

function boxOf(el: HTMLElement): Box {
  return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
}

/**
 * A highlight that springs to the element marked `data-active="true"` inside a
 * container. Put `thumbRef` on the highlight. `onlyX` moves it sideways only
 * (a dot under a tab), keeping its own height.
 */
export function useActiveIndicator<T extends HTMLElement>(
  deps: unknown[],
  opts: { onlyX?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const spring = useRef<BoxSpring | null>(null);
  const [ready, setReady] = useState(false);
  const measure = useCallback((animate: boolean) => {
    const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
    const thumb = thumbRef.current;
    if (!el || !ref.current || !thumb) return setReady(false);
    spring.current ??= createBoxSpring(thumb, opts);
    if (animate) spring.current.to(boxOf(el));
    else spring.current.jump(boxOf(el));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useIsoLayoutEffect(() => measure(ready), deps);
  useEffect(() => {
    // Layout changes (resize, fonts) place it without animating.
    const ro = new ResizeObserver(() => measure(false));
    if (ref.current) ro.observe(ref.current);
    return () => {
      ro.disconnect();
      spring.current?.stop();
    };
  }, [measure]);
  return { ref, thumbRef, ready, spring };
}

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Color for the icon while selected (defaults to the primary accent) */
  accent?: string;
  /** Full name for assistive tech when the visible label is shortened */
  ariaLabel?: string;
}

/**
 * One choice out of a few (a segmented control). The selection highlight is a
 * physical object: it responds the instant the pointer goes down, can be dragged
 * to another option (rubber-banding past the ends), and on release snaps to the
 * option the flick was heading for, keeping its velocity. Arrow keys move it too.
 * `columns` lays options out as a grid of equal cells (for 4–5 options with hints).
 */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  columns,
  className,
}: {
  options: SegmentOption<V>[];
  value: V;
  onChange: (v: V) => void;
  ariaLabel: string;
  size?: "sm" | "md" | "lg";
  /** Grid columns on wide screens; omit for a single inline row */
  columns?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  const { ref, thumbRef, ready, spring } = useActiveIndicator<HTMLDivElement>([
    value,
    options.length,
  ]);
  const [pressed, setPressed] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<{
    id: number;
    x0: number;
    left0: number;
    box: Box;
    moved: boolean;
    samples: { t: number; x: number }[];
  } | null>(null);
  const swallowClick = useRef(false);
  const draggable = !columns && options.length > 1;

  const buttons = () =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-segment]") ?? []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setPressed(true);
    if (!draggable || !spring.current) return;
    const box = spring.current.current();
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      left0: box.left,
      box,
      moved: false,
      samples: [{ t: e.timeStamp, x: box.left }],
    };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !spring.current || !ref.current) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 4) return;
    if (!d.moved) {
      d.moved = true;
      ref.current.setPointerCapture(e.pointerId);
    }
    const bs = buttons();
    const min = bs[0]?.offsetLeft ?? 0;
    const last = bs[bs.length - 1];
    const max = last ? last.offsetLeft + last.offsetWidth - d.box.width : min;
    // Follows the finger 1:1 inside the track, rubber-bands past the ends.
    const left = rubberClamp(d.left0 + dx, min, max, ref.current.offsetWidth / 2);
    spring.current.jump({ ...d.box, left });
    d.samples.push({ t: e.timeStamp, x: left });
    if (d.samples.length > 6) d.samples.shift();
    const center = left + d.box.width / 2;
    setHover(bs.findIndex((b) => center >= b.offsetLeft && center < b.offsetLeft + b.offsetWidth));
  };
  const release = (e: ReactPointerEvent<HTMLDivElement>) => {
    setPressed(false);
    const d = drag.current;
    drag.current = null;
    setHover(null);
    if (!d || d.id !== e.pointerId || !d.moved || !spring.current) return;
    swallowClick.current = true;
    const a = d.samples[0]!;
    const b = d.samples[d.samples.length - 1]!;
    const velocity = b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0;
    const bs = buttons();
    const i = snapIndex(
      b.x,
      velocity,
      bs.map((el) => el.offsetLeft + el.offsetWidth / 2 - d.box.width / 2),
    );
    const target = bs[i];
    const option = options[i];
    if (!target || !option) return;
    // Thrown: carry the momentum into a small bounce. Placed: settle without one.
    spring.current.to(
      boxOf(target),
      Math.abs(velocity) > 400 ? SPRINGS.bouncy : SPRINGS.snappy,
      velocity,
    );
    if (option.value !== value) onChange(option.value);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value);
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? (i + 1) % options.length
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? (i - 1 + options.length) % options.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? options.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next]!.value);
    buttons()[next]?.focus();
  };

  const grid = columns
    ? cn(
        "grid grid-cols-2",
        { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" }[
          columns
        ],
      )
    : "inline-flex max-w-full flex-wrap";
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={onKeyDown}
      onClickCapture={(e) => {
        // A drag already chose; the click the browser sends after it would choose again.
        if (swallowClick.current) {
          swallowClick.current = false;
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      className={cn(
        "relative gap-1 rounded-xl bg-fill p-1",
        draggable && "touch-pan-y",
        grid,
        className,
      )}
    >
      <span
        ref={thumbRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 rounded-lg bg-card shadow-[0_1px_3px_oklch(0_0_0/0.12),0_0_0_0.5px_oklch(0_0_0/0.06)] [transition:opacity_160ms_ease-out,scale_360ms_var(--ease-spring-press)] dark:bg-secondary",
          ready ? "opacity-100" : "opacity-0",
          // Pressing anywhere on the control squeezes the highlight at once, like a real switch.
          pressed && "scale-[0.96] [transition-duration:160ms,0ms]",
        )}
      />
      {options.map((o, i) => {
        const active = o.value === value;
        const lit = hover === null ? active : hover === i;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-segment
            {...(o.ariaLabel ? { "aria-label": o.ariaLabel } : {})}
            data-active={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 flex min-h-11 items-center gap-2 rounded-lg px-4 text-left text-sm font-medium transition-colors duration-150 select-none",
              size === "sm" && "min-h-9 px-2 text-footnote",
              size === "lg" && "min-h-16 flex-col items-start justify-center gap-1 px-4 py-2",
              lit ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              // Before measuring (server render), show the selection without the moving highlight.
              active && !ready && "bg-card",
            )}
          >
            {o.icon && (
              <span
                className={cn(
                  "shrink-0 transition-[color,scale] duration-150",
                  lit ? "text-primary" : "",
                )}
                style={lit && o.accent ? { color: o.accent } : undefined}
              >
                {o.icon}
              </span>
            )}
            <span className="min-w-0">
              <span className="block leading-tight">{o.label}</span>
              {o.hint && (
                <span className="mt-1 block text-micro leading-tight font-normal text-muted-foreground">
                  {o.hint}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A number that springs to its new value, so budget changes read as movement.
 * A change mid-flight keeps the current velocity (no stall, no jump).
 */
export function useTweened(target: number, config: SpringConfig = SPRINGS.smooth): number {
  const [shown, setShown] = useState(target);
  const st = useRef({ from: target, v0: 0, to: target, t0: 0, x: target, v: 0 });
  const frame = useRef<number | null>(null);
  useEffect(() => {
    const s = st.current;
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      Object.assign(s, { from: target, to: target, x: target, v: 0 });
      setShown(target);
      return;
    }
    if (target === s.to) return;
    Object.assign(s, { from: s.x, v0: s.v, to: target, t0: performance.now() });
    const tick = (now: number) => {
      const r = springAt(s.from, s.to, s.v0, (now - s.t0) / 1000, config);
      s.x = r.x;
      s.v = r.v;
      const done = isSettled(r, s.to, 0.004);
      setShown(done ? s.to : r.x);
      if (done) {
        s.x = s.to;
        s.v = 0;
        frame.current = null;
      } else frame.current = requestAnimationFrame(tick);
    };
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [target, config]);
  return shown;
}

export function AnimatedMoney({
  value,
  cents,
  className,
}: {
  value: number;
  cents?: boolean;
  className?: string;
}) {
  const v = useTweened(value);
  // Settle on the exact value so the last frame never shows a rounding artifact.
  const display = Math.abs(v - value) < 0.005 ? value : v;
  return (
    <span className={cn("tabular", className)}>
      {formatMoney(display, cents ? { cents: true } : {})}
    </span>
  );
}

/** Staggered entrance for a list: pass the item index. */
export const stagger = (i: number): CSSProperties =>
  ({ ["--i" as string]: Math.min(i, 10) }) as CSSProperties;

/**
 * Direct manipulation for a horizontal rail with a mouse or pen (touch already
 * scrolls natively): the content follows the pointer, rubber-bands past either
 * end, and a flick keeps gliding with the momentum it was thrown with. Put the
 * ref on the scrolling element.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let drag: {
      x0: number;
      s0: number;
      samples: { t: number; x: number }[];
      moved: boolean;
    } | null = null;
    let frame = 0;
    let suppressClick = false;
    const band = (px: number) => {
      el.style.transform = px ? `translate3d(${px}px,0,0)` : "";
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const max = () => el.scrollWidth - el.clientWidth;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0 || max() <= 0) return;
      stop();
      drag = {
        x0: e.clientX,
        s0: el.scrollLeft,
        samples: [{ t: e.timeStamp, x: e.clientX }],
        moved: false,
      };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x0;
      if (!drag.moved && Math.abs(dx) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
        el.style.scrollSnapType = "none";
      }
      const want = drag.s0 - dx;
      el.scrollLeft = Math.min(max(), Math.max(0, want));
      // Past an end: the content keeps following, with growing resistance.
      band(
        want < 0
          ? rubberBand(-want, el.clientWidth)
          : want > max()
            ? -rubberBand(want - max(), el.clientWidth)
            : 0,
      );
      drag.samples.push({ t: e.timeStamp, x: e.clientX });
      if (drag.samples.length > 6) drag.samples.shift();
    };
    const up = () => {
      const d = drag;
      drag = null;
      el.style.cursor = "";
      if (!d?.moved) return;
      suppressClick = true;
      const a = d.samples[0]!;
      const b = d.samples[d.samples.length - 1]!;
      let v = b.t > a.t ? (-(b.x - a.x) / (b.t - a.t)) * 1000 : 0; // px/s of scroll
      const offset = parseFloat(el.style.transform.replace(/[^-\d.]/g, "") || "0") || 0;
      let last = performance.now();
      const reduce = prefersReducedMotion();
      const springStart = { from: offset, t0: last };
      const tick = (now: number) => {
        const dt = now - last;
        last = now;
        if (!reduce && Math.abs(v) > 20) {
          el.scrollLeft += (v * dt) / 1000;
          v *= Math.pow(0.998, dt);
        } else v = 0;
        // The rubber band returns on a critically damped spring.
        const s = springAt(springStart.from, 0, 0, (now - springStart.t0) / 1000, SPRINGS.smooth);
        band(Math.abs(s.x) < 0.5 ? 0 : s.x);
        frame = v !== 0 || Math.abs(s.x) >= 0.5 ? requestAnimationFrame(tick) : 0;
        if (!frame) el.style.scrollSnapType = "";
      };
      frame = requestAnimationFrame(tick);
    };
    const click = (e: MouseEvent) => {
      if (suppressClick) {
        suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    return () => {
      stop();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("click", click, true);
    };
  }, []);
  return ref;
}
