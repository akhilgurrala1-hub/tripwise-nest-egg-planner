import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { CATEGORY_COLOR_VAR } from "@/components/app/bits";
import { RouteMap } from "@/components/app/Illustrations";
import { bookingPlan } from "@/lib/booking";
import { CATEGORY_LABELS, categoriesFor, formatMoney } from "@/lib/budget";
import { clock, scheduleDay } from "@/lib/itinerary-schedule";
import { useTrip } from "@/lib/trip-store";

/**
 * Three tiles that show the product itself: the budget, a day of the plan and the booking
 * checklist, drawn from the trip on screen (the sample until the traveler plans their own).
 * Nothing here is invented: every number and name is what the app computed for this trip.
 */
export function ProductTiles() {
  const { trip, dest, shape, totals } = useTrip();
  const cats = categoriesFor(trip.setup.tripType, trip.inputs.transportMode)
    .map((c) => ({ c, v: totals.categories[c] }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  const sum = cats.reduce((s, x) => s + x.v, 0) || 1;
  const day = trip.itinerary?.days[0];
  const stops = useMemo(() => (day ? scheduleDay(day.items).slice(0, 3) : []), [day]);
  const items = useMemo(
    () => bookingPlan(trip, dest, shape, totals, "", []).slice(0, 3),
    [trip, dest, shape, totals],
  );
  const label = trip.isSample ? "Sample trip" : "Your trip";

  return (
    <section className="py-16 sm:py-24" aria-labelledby="tiles-title">
      <div className="page-container">
        <h2 id="tiles-title" className="title-display text-center text-large-title">
          {label}: {dest.name}
        </h2>
        <div className="mt-12 grid gap-4 md:grid-cols-5">
          {/* The budget: the dark tile. */}
          <Link
            to="/budget"
            className="group pressable rounded-3xl bg-ink p-8 text-ink-foreground md:col-span-3"
          >
            <p className="text-footnote opacity-80">Budget</p>
            <p className="title-display mt-6 text-display">
              {totals.overBudget ? "−" : ""}
              {formatMoney(Math.abs(totals.remaining))}
            </p>
            <p className="mt-2 text-headline font-normal opacity-90">
              {totals.overBudget ? "over your spending money" : "left to spend"}
            </p>
            <p className="mt-1 text-footnote opacity-70">
              {formatMoney(totals.planned)} planned of {formatMoney(totals.spendable)} · emergency
              fund of {formatMoney(totals.emergencyFund)} kept aside
            </p>
            <div className="mt-8 flex h-3 overflow-hidden rounded-full bg-white/15">
              {cats.map((x) => (
                <span
                  key={x.c}
                  title={`${CATEGORY_LABELS[x.c]} ${formatMoney(x.v)}`}
                  style={{ width: `${(x.v / sum) * 100}%`, background: CATEGORY_COLOR_VAR[x.c] }}
                />
              ))}
            </div>
            <ul className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {cats.slice(0, 4).map((x) => (
                <li key={x.c} className="flex items-center gap-2 text-footnote">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: CATEGORY_COLOR_VAR[x.c] }}
                  />
                  <span className="flex-1 opacity-90">{CATEGORY_LABELS[x.c]}</span>
                  <span className="tabular">{formatMoney(x.v)}</span>
                </li>
              ))}
            </ul>
            <span className="link-chevron mt-8 inline-block text-footnote !text-ink-foreground">
              Open the budget
            </span>
          </Link>

          {/* A day of the plan, with the route drawn behind it. */}
          <Link
            to="/itinerary"
            className="group pressable relative overflow-hidden rounded-3xl bg-card p-8 md:col-span-2"
          >
            <RouteMap className="pointer-events-none absolute top-0 right-0 w-72 opacity-80" />
            <div className="relative mt-44">
              <p className="text-footnote text-muted-foreground">Itinerary</p>
              <p className="title-display mt-2 text-title-1">
                {day ? `Day 1: ${day.title}` : "Day by day"}
              </p>
              <ol className="mt-4 divide-y divide-separator">
                {stops.map((s) => (
                  <li key={s.item.id} className="py-2">
                    <p className="tabular text-caption text-muted-foreground">
                      {clock(s.start)} to {clock(s.end)}
                    </p>
                    <p className="text-footnote font-semibold">{s.item.name}</p>
                  </li>
                ))}
              </ol>
              <span className="link-chevron mt-4 inline-block text-footnote">
                Open the itinerary
              </span>
            </div>
          </Link>

          {/* What to book. */}
          <Link to="/book" className="group pressable rounded-3xl bg-secondary p-8 md:col-span-5">
            <p className="text-footnote text-muted-foreground">Booking checklist</p>
            <p className="title-display mt-2 text-title-1">What to book, in order</p>
            <ul className="mt-6 grid gap-6 sm:grid-cols-3">
              {items.map((i) => (
                <li key={i.key} className="border-t border-separator pt-4">
                  <p className="text-headline font-semibold">{i.title}</p>
                  <p className="mt-1 text-footnote text-muted-foreground">
                    {i.budget > 0 ? `${formatMoney(i.budget)} budgeted` : "Not in the budget"}
                  </p>
                </li>
              ))}
            </ul>
            <span className="link-chevron mt-6 inline-block text-footnote">Open the checklist</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
