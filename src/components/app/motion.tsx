import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { formatMoney } from "@/lib/budget";
import { cn } from "@/lib/utils";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Position of the element marked `data-active="true"` inside a container, so a
 * highlight can slide between options instead of jumping.
 */
export function useActiveIndicator<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const measure = useCallback(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (!el || !ref.current) return setBox(null);
    setBox({
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
  }, []);
  useIsoLayoutEffect(measure, deps);
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measure]);
  const style: CSSProperties | undefined = box
    ? { transform: `translate(${box.left}px, ${box.top}px)`, width: box.width, height: box.height }
    : undefined;
  return { ref, style, ready: !!box };
}

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}

/**
 * One choice out of a few, with a highlight that slides to the selection.
 * `wrap` lays options out as a grid of equal cells (for 4–5 options with hints).
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
  const { ref, style, ready } = useActiveIndicator<HTMLDivElement>([value, options.length]);
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
      className={cn(
        "relative gap-1 rounded-xl border border-border bg-muted/60 p-1",
        grid,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 rounded-lg border border-border bg-card shadow-[0_1px_2px_oklch(0.2_0.01_260/0.08)] transition-[transform,width,height,opacity] duration-300 ease-[var(--ease-out-quint)]",
          ready ? "opacity-100" : "opacity-0",
        )}
        style={style}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm font-medium transition-colors duration-200 select-none active:scale-[0.98]",
              size === "sm" && "min-h-9 px-2.5 text-[13px]",
              size === "lg" &&
                "min-h-[60px] flex-col items-start justify-center gap-1.5 px-3 py-2.5",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              // Before measuring (server render), show the selection without the sliding pill.
              active && !ready && "bg-card",
            )}
          >
            {o.icon && (
              <span className={cn("shrink-0", active ? "text-primary" : "")}>{o.icon}</span>
            )}
            <span className="min-w-0">
              <span className="block leading-tight">{o.label}</span>
              {o.hint && (
                <span className="mt-0.5 block text-[11px] leading-tight font-normal text-muted-foreground">
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

/** A number that eases to its new value, so changes in the budget read as movement, not a swap. */
export function useTweened(target: number, duration = 450): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const v = a + (target - a) * eased;
      setShown(v);
      from.current = v;
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);
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
