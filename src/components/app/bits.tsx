import {
  Bus,
  Cookie,
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
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { Category } from "@/lib/budget";
import { cn } from "@/lib/utils";

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
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

export function DemoBadge({ label = "Demo data", className }: { label?: string; className?: string }) {
  return (
    <Badge variant="demo" className={className}>
      <FlaskConical />
      {label}
    </Badge>
  );
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
        "flex h-11 items-center gap-1 rounded-xl border border-input bg-card px-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30",
        className,
      )}
    >
      {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
      <input
        id={id}
        aria-label={ariaLabel}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(Math.max(min, n));
          if (e.target.value === "") onChange(0);
        }}
        className={cn("tabular w-full min-w-0 bg-transparent text-base font-semibold outline-none", inputClassName)}
      />
      {suffix && <span className="whitespace-nowrap text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>}
        <h2 className="font-display text-2xl font-semibold text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}
