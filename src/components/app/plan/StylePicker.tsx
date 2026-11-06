import { Gem, PiggyBank, Sofa, type LucideIcon } from "lucide-react";

import { TRAVEL_STYLES, type TravelStyle } from "@/lib/demo-data";
import { Segmented } from "@/components/app/motion";

/** Each travel style's icon, color token and price level. */
export const STYLE_LOOK: Record<TravelStyle, { icon: LucideIcon; color: string; level: string }> = {
  budget: { icon: PiggyBank, color: "var(--style-budget)", level: "$" },
  comfort: { icon: Sofa, color: "var(--style-comfort)", level: "$$" },
  luxury: { icon: Gem, color: "var(--style-luxury)", level: "$$$" },
};

/**
 * Savvy, Comfort or Luxe: a segmented control (one choice of three), with the
 * chosen style's one-line description under it.
 */
export function StylePicker({
  value,
  onChange,
  className,
}: {
  value: TravelStyle;
  onChange: (v: TravelStyle) => void;
  className?: string;
}) {
  const chosen = TRAVEL_STYLES.find((t) => t.id === value);
  return (
    <div className={className}>
      <Segmented
        ariaLabel="Travel style"
        value={value}
        onChange={onChange}
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
        options={TRAVEL_STYLES.map((t) => {
          const look = STYLE_LOOK[t.id];
          const Icon = look.icon;
          return {
            value: t.id,
            label: t.label,
            icon: <Icon className="size-4" />,
            ariaLabel: `${t.label}, ${t.blurb}`,
          };
        })}
      />
      {chosen && (
        <p className="mt-2 text-footnote text-muted-foreground" aria-live="polite">
          {chosen.blurb} · {STYLE_LOOK[chosen.id].level}
        </p>
      )}
    </div>
  );
}
