import { Gem, PiggyBank, Sofa, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { TRAVEL_STYLES, type TravelStyle } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

/** Each travel style's icon, color token and price level. */
export const STYLE_LOOK: Record<TravelStyle, { icon: LucideIcon; color: string; level: string }> = {
  budget: { icon: PiggyBank, color: "var(--style-budget)", level: "$" },
  comfort: { icon: Sofa, color: "var(--style-comfort)", level: "$$" },
  luxury: { icon: Gem, color: "var(--style-luxury)", level: "$$$" },
};

/** Savvy, Comfort or Luxe: three colored cards (a radio group). */
export function StylePicker({
  value,
  onChange,
  className,
}: {
  value: TravelStyle;
  onChange: (v: TravelStyle) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Travel style"
      className={cn("grid grid-cols-3 gap-2", className)}
    >
      {TRAVEL_STYLES.map((t) => {
        const active = t.id === value;
        const look = STYLE_LOOK[t.id];
        const Icon = look.icon;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(t.id)}
            style={{ "--tile": look.color } as CSSProperties}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.98]",
              active
                ? "border-[var(--tile)] bg-[color-mix(in_oklab,var(--tile)_5%,var(--card))] shadow-[0_0_0_1px_var(--tile)]"
                : "border-border bg-card hover:border-muted-foreground/40",
            )}
          >
            <span className="flex w-full items-center justify-between">
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-lg text-[var(--tile)] transition-colors duration-200",
                  active
                    ? "bg-[color-mix(in_oklab,var(--tile)_16%,transparent)]"
                    : "bg-[color-mix(in_oklab,var(--tile)_9%,transparent)]",
                )}
              >
                <Icon className="size-4" strokeWidth={1.8} />
              </span>
              <span
                className="tabular text-xs font-medium tracking-wide text-muted-foreground"
                aria-hidden
              >
                {look.level}
              </span>
            </span>
            <span>
              <span className="block text-sm leading-tight font-semibold">{t.label}</span>
              <span className="mt-1 block text-micro leading-tight text-muted-foreground">
                {t.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
