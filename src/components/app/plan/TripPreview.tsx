import { ArrowRight, CalendarDays, CloudSun, MapPin, Users } from "lucide-react";
import type { CSSProperties } from "react";

import { ApproxMoney, CATEGORY_COLOR_VAR } from "@/components/app/bits";
import { AnimatedMoney } from "@/components/app/motion";
import { DestinationPhoto } from "@/components/app/DestinationIntro";
import { TRIP_COLOR } from "@/components/app/trip-colors";
import { formatDateRange } from "@/components/app/TripHeader";
import { TRIP_ICONS } from "@/components/app/TripTypePicker";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  categoriesFor,
  formatMoney,
  type BudgetTotals,
  type TripShape,
} from "@/lib/budget";
import { tripTypeInfo, type DemoDestination } from "@/lib/demo-data";
import { useLocale } from "@/lib/live/use-locale";
import { useWeatherFor } from "@/lib/live/use-live";
import { summarize } from "@/lib/live/weather";
import type { TripSetup } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

/**
 * The trip as it's being set up: where, when, the weather there and what it's
 * likely to cost against the budget. Updates (and tweens) as the form changes.
 */
export function TripPreview({
  form,
  dest,
  destLabel,
  shape,
  totals,
  distance,
  formId,
  className,
}: {
  /** The form the Plan trip button submits */
  formId: string;
  form: TripSetup;
  dest: DemoDestination;
  destLabel: string;
  shape: TripShape;
  totals: BudgetTotals;
  distance: string | null;
  className?: string;
}) {
  const Icon = TRIP_ICONS[form.tripType];
  const color = TRIP_COLOR[form.tripType];
  const weather = useWeatherFor(dest, form.origin, form.startDate, form.endDate);
  const { units } = useLocale();
  const days = weather.weather?.days ?? [];
  const spendable = Math.max(0, form.totalBudget - form.emergencyFund);
  const left = spendable - totals.planned;
  const pct = spendable > 0 ? Math.min(100, (totals.planned / spendable) * 100) : 100;
  const cats = categoriesFor(form.tripType, form.transportMode)
    .map((c) => ({ c, v: totals.categories[c] }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  const top = cats.slice(0, 4);

  return (
    <section
      className={cn("surface-card overflow-hidden", className)}
      style={{ "--trip": color } as CSSProperties}
    >
      <div className="flex items-center gap-2 border-b border-border bg-[color-mix(in_oklab,var(--trip)_9%,var(--card))] px-5 py-3 text-[13px] font-medium transition-colors duration-500">
        <Icon className="size-4" style={{ color }} strokeWidth={2} />
        {tripTypeInfo(form.tripType).label}
        <span className="ml-auto text-xs font-normal text-muted-foreground">Preview</span>
      </div>
      <div className="p-5">
        <DestinationPhoto
          dest={dest}
          origin={form.origin}
          showText={false}
          className="-mx-1 mb-4"
        />
        <p key={destLabel} className="animate-pop text-[19px] leading-tight font-semibold">
          {destLabel}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{dest.region}</p>
        <ul className="mt-4 space-y-1.5 text-[13px] [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
          {form.origin && form.tripType !== "staycation" && (
            <li className="flex items-center gap-2">
              <MapPin />
              <span className="truncate">
                From {form.origin.split(",")[0]}
                {distance ? <span className="text-muted-foreground"> · {distance}</span> : null}
              </span>
            </li>
          )}
          <li className="flex items-center gap-2">
            <CalendarDays />
            <span className="tabular">
              {formatDateRange(form.startDate, form.endDate)}
              <span className="text-muted-foreground">
                {" "}
                · {shape.days === 1 ? "day trip" : `${shape.days} days`}
              </span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Users />
            {shape.travelers} traveler{shape.travelers > 1 ? "s" : ""}
          </li>
          {weather.status === "ready" && days.length > 0 && (
            <li className="animate-pop flex items-center gap-2">
              <CloudSun />
              <span className="truncate">{summarize(days, units)}</span>
            </li>
          )}
        </ul>

        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[13px] text-muted-foreground">Estimated cost</p>
            <AnimatedMoney value={totals.planned} className="text-[22px] font-semibold" />
          </div>
          <ApproxMoney usd={totals.planned} className="block text-right text-xs" />
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
            {cats.map(({ c, v }) => (
              <span
                key={c}
                className="h-full transition-[width] duration-500 ease-[var(--ease-out-quint)]"
                style={{
                  width: `${spendable > 0 ? (v / Math.max(spendable, totals.planned)) * 100 : 0}%`,
                  background: CATEGORY_COLOR_VAR[c],
                }}
              />
            ))}
          </div>
          <p
            className={cn(
              "tabular mt-1.5 text-xs",
              left < 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {spendable <= 0
              ? "Add a budget to compare"
              : left >= 0
                ? `${formatMoney(left)} to spare of ${formatMoney(spendable)} · ${Math.round(pct)}% planned`
                : `${formatMoney(-left)} over your ${formatMoney(spendable)}. Try Savvy or fewer nights`}
          </p>
          <ul className="mt-3 space-y-1.5 text-xs">
            {top.map(({ c, v }) => (
              <li key={c} className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ background: CATEGORY_COLOR_VAR[c] }}
                />
                <span className="flex-1 truncate">{CATEGORY_LABELS[c]}</span>
                <span className="tabular font-medium">{formatMoney(v)}</span>
              </li>
            ))}
          </ul>
        </div>
        <Button type="submit" form={formId} variant="go" size="lg" className="mt-5 w-full">
          Plan trip <ArrowRight />
        </Button>
      </div>
    </section>
  );
}
