import {
  Bus,
  Check,
  Cookie,
  FerrisWheel,
  Landmark,
  Moon,
  Mountain,
  Palette,
  ShoppingBag,
  Trees,
  Waves,
  MapPinned,
  Car,
  Droplets,
  Fuel,
  Hotel,
  Package,
  ParkingCircle,
  Receipt,
  Ticket,
  UtensilsCrossed,
  Ship,
  type LucideIcon,
  CircleAlert,
} from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { Category } from "@/lib/budget";
import { INTERESTS, type Interest } from "@/lib/demo-data";
import { formatApprox } from "@/lib/locale";
import { liveCategories } from "@/lib/live/sources";
import { useLocale, useUsdRate } from "@/lib/live/use-locale";
import { useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  cruise: Ship,
  transportation: Bus,
  snacks: Cookie,
  stops: MapPinned,
  gas: Fuel,
  food: UtensilsCrossed,
  water: Droplets,
  accommodations: Hotel,
  parking: ParkingCircle,
  tolls: Car,
  taxes: Receipt,
  activities: Ticket,
  misc: Package,
};

export const CATEGORY_COLOR_VAR: Record<Category, string> = {
  cruise: "var(--cat-cruise)",
  transportation: "var(--cat-transportation)",
  snacks: "var(--cat-snacks)",
  stops: "var(--cat-stops)",
  gas: "var(--cat-gas)",
  food: "var(--cat-food)",
  water: "var(--cat-water)",
  accommodations: "var(--cat-accommodations)",
  parking: "var(--cat-parking)",
  tolls: "var(--cat-tolls)",
  taxes: "var(--cat-taxes)",
  activities: "var(--cat-activities)",
  misc: "var(--cat-misc)",
};

/** "Estimated" until live prices feed the budget, then says which amounts are live. */
export function PriceSourceBadge({ className }: { className?: string }) {
  const { trip } = useTrip();
  const live = liveCategories(trip.inputs, trip.overrides, trip.live);
  if (live.length === 0)
    return <SourceNote label="Estimated" {...(className ? { className } : {})} />;
  const names = live.map((c) =>
    c === "accommodations" ? "hotel" : c === "transportation" ? "flights" : c,
  );
  return (
    <SourceNote label={`Live ${names.join(" & ")} prices`} {...(className ? { className } : {})} />
  );
}

/** A quiet line saying where numbers or places come from (examples, estimates, live). */
export function SourceNote({ label, className }: { label: string; className?: string }) {
  return <p className={cn("text-micro text-muted-foreground", className)}>{label}</p>;
}

/** Numeric input that lets people clear and retype freely, committing on change. */
export function NumberField({
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  min = 0,
  id,
  className,
  inputClassName,
  invalid,
  describedBy,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  prefix?: string | undefined;
  suffix?: string | undefined;
  step?: number | undefined;
  min?: number;
  id?: string;
  className?: string;
  inputClassName?: string;
  /** The value is wrong: red border and fill, announced as invalid */
  invalid?: boolean;
  /** The id of the message that explains the error */
  describedBy?: string | undefined;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2 rounded-lg border border-input bg-fill px-4 transition-[border-color,box-shadow] duration-150 hover:border-muted-foreground/40 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15",
        invalid &&
          "border-destructive bg-destructive-soft focus-within:border-destructive focus-within:ring-destructive/20",
        className,
      )}
    >
      {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
      <input
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        type="number"
        inputMode="decimal"
        // Any amount is valid (a step here would make the browser reject e.g. $4,321 and block
        // forms); the arrow keys still nudge to the next round step.
        step="any"
        min={min}
        value={text}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const current = Number(text) || 0;
          const next =
            e.key === "ArrowUp"
              ? Math.floor(current / step + 1e-9) * step + step
              : Math.ceil(current / step - 1e-9) * step - step;
          const n = Math.max(min, Math.round(next * 100) / 100);
          setText(String(n));
          onChange(n);
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(Math.max(min, n));
          if (e.target.value === "") onChange(0);
        }}
        className={cn(
          "tabular w-full min-w-0 bg-transparent text-body font-medium outline-none",
          inputClassName,
        )}
      />
      {suffix && <span className="whitespace-nowrap text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/** Interest toggles, the same on every page that asks. */
/** Each interest's icon. */
export const INTEREST_ICON: Record<Interest, LucideIcon> = {
  nature: Trees,
  food: UtensilsCrossed,
  history: Landmark,
  beaches: Waves,
  arts: Palette,
  adventure: Mountain,
  family: FerrisWheel,
  nightlife: Moon,
  shopping: ShoppingBag,
};

/** What the traveler enjoys: tokens sized to their words, wrapping like text; chosen ones fill with the brand color. */
export function InterestChips({
  value,
  onToggle,
  className,
}: {
  value: Interest[];
  onToggle: (id: Interest) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {INTERESTS.map((i) => {
        const active = value.includes(i.id);
        const Icon = INTEREST_ICON[i.id];
        return (
          <button
            key={i.id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(i.id)}
            className={cn(
              "pressable flex h-10 items-center gap-2 rounded-lg px-4 text-left text-footnote font-medium",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-fill text-foreground hover:bg-secondary",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors duration-150",
                active ? "text-primary-foreground" : "text-muted-foreground",
              )}
            />
            <span className="whitespace-nowrap">{i.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "≈ €1,840": a dollar amount in the traveler's own currency, when that isn't US dollars. */
export function ApproxMoney({
  usd,
  suffix,
  className,
}: {
  usd: number;
  suffix?: string;
  className?: string;
}) {
  const { currency } = useLocale();
  const rate = useUsdRate(currency);
  if (!rate) return null;
  return (
    <span
      className={cn("tabular text-muted-foreground", className)}
      title={`Converted from US dollars at today's rate (European Central Bank, via Frankfurter)`}
    >
      {formatApprox(usd, currency, rate)}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

/** The message under a field that's wrong: what to fix, with an icon so it doesn't rely on color. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 flex items-start gap-1 text-footnote text-destructive">
      <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
