import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronDown, Lock, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApproxMoney, CATEGORY_COLOR_VAR } from "@/components/app/bits";
import { AnimatedMoney, stagger } from "@/components/app/motion";
import { ShareTripButton } from "@/components/app/ShareTrip";
import { PageHeader } from "@/components/app/TripHeader";
import { DestinationCard, DestinationHero } from "@/components/app/DestinationIntro";
import { TripReady } from "@/components/app/TripReady";
import { WeatherCard } from "@/components/app/Weather";
import { Button } from "@/components/ui/button";
import { CATEGORIES, CATEGORY_LABELS, SAVING_TITLES, formatMoney } from "@/lib/budget";
import { formatCalendarDate, todayIso } from "@/lib/dates";
import { spendCategoriesFor, spendingSummary } from "@/lib/spending";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Trip overview | Waypoint" },
      {
        name: "description",
        content:
          "See total planned expenses, remaining money, potential savings and your protected emergency fund.",
      },
      { property: "og:title", content: "Trip overview | Waypoint" },
      {
        property: "og:description",
        content: "Your trip's planned spend, money left and savings opportunities at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const SAVINGS_SHOWN = 5;

/** A small colored square with an icon, for card titles. */
function Dashboard() {
  const { trip, dest, place, totals, savings, applied, potentialSavings } = useTrip();
  const [showAllSavings, setShowAllSavings] = useState(false);

  const breakdown = CATEGORIES.map((c) => ({ cat: c, value: totals.categories[c] }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  // The bar is scaled to whichever is larger, so over-budget plans visibly overflow the spending line.
  const scale = Math.max(totals.spendable, totals.planned, 1);
  const spendLine = (totals.spendable / scale) * 100;

  return (
    <div>
      <PageHeader title={place}>{!trip.isSample && <ShareTripButton />}</PageHeader>

      {/* The place first, edge to edge like a magazine spread: then the money. */}
      <DestinationHero
        dest={dest}
        origin={trip.setup.origin}
        className="h-44 w-full rounded-none sm:h-[clamp(200px,30vh,300px)]"
      />
      <div className="page-container mt-6 space-y-4">
        <TripReady />
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Balance */}
          <section className="surface-card min-w-0 flex-1 p-6 sm:p-8">
            <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="text-sm text-muted-foreground">
                  {totals.overBudget ? "Over your spending money" : "Left to spend"}
                </p>
                <p
                  className={cn(
                    "money-display mt-2 text-display",
                    totals.overBudget && "text-destructive",
                  )}
                >
                  {totals.overBudget ? "−" : ""}
                  <AnimatedMoney value={Math.abs(totals.remaining)} intro />
                </p>
                <ApproxMoney
                  usd={Math.abs(totals.remaining)}
                  suffix={totals.overBudget ? "over" : "left"}
                  className="mt-1 block text-sm"
                />
                <p className="tabular mt-4 text-sm text-muted-foreground">
                  {formatMoney(totals.planned)} planned of {formatMoney(totals.spendable)}
                  <span className="px-2 text-border">/</span>
                  <Lock className="mr-1 inline size-3 -translate-y-px" />
                  {formatMoney(totals.emergencyFund)} emergency fund
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:text-right">
                <div>
                  <dt className="text-muted-foreground">Per person, per day</dt>
                  <dd className="tabular mt-1 text-base font-medium">
                    <AnimatedMoney value={totals.perPersonPerDay} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Could save</dt>
                  <dd className="tabular mt-1 text-base font-medium text-success">
                    <AnimatedMoney value={potentialSavings} />
                  </dd>
                </div>
              </dl>
            </div>

            {/* One stacked bar: every category in proportion, with the spending limit marked. */}
            <div className="relative mt-8">
              <div className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted">
                {breakdown.map((d, i) => (
                  <span
                    key={d.cat}
                    title={`${CATEGORY_LABELS[d.cat]} ${formatMoney(d.value)}`}
                    className="grow-x h-full transition-[width] spring-smooth first:rounded-l-full last:rounded-r-full"
                    style={{
                      ...stagger(i),
                      width: `${(d.value / scale) * 100}%`,
                      backgroundColor: CATEGORY_COLOR_VAR[d.cat],
                    }}
                  />
                ))}
              </div>
              {totals.overBudget && (
                <span
                  className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground transition-[left] duration-200"
                  style={{ left: `${spendLine}%` }}
                  aria-hidden
                />
              )}
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular">
                  {totals.percentUsed === null
                    ? "No spendable budget"
                    : `${Math.round(totals.percentUsed)}% of spending money planned`}
                </span>
                {totals.overBudget ? (
                  <Link
                    to="/budget"
                    className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                  >
                    See where to cut
                  </Link>
                ) : (
                  <Link to="/budget" className="link-chevron font-medium">
                    See the budget
                  </Link>
                )}
              </div>
            </div>
          </section>
          <SpendingGlance />
        </div>

        {/* Savings */}
        <section className="surface-card p-6">
          <h2 className="title-display text-title-1">Ways to spend less</h2>
          <ul className="mt-4 divide-y divide-border">
            {(showAllSavings ? savings : savings.slice(0, SAVINGS_SHOWN)).map((s) => (
              <li key={s.id} className="flex items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{s.detail}</p>
                </div>
                <span className="tabular shrink-0 text-sm font-medium text-success">
                  −{formatMoney(s.totalSavings)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    tripActions.applySaving(s.id);
                    toast.success(`${s.title} applied`, {
                      action: { label: "Undo", onClick: () => tripActions.undoSaving(s.id) },
                    });
                  }}
                >
                  Apply
                </Button>
              </li>
            ))}
            {savings.length === 0 && (
              <li className="py-4 text-sm text-muted-foreground">Every saving idea is applied.</li>
            )}
          </ul>
          {!showAllSavings && savings.length > SAVINGS_SHOWN && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full text-primary"
              onClick={() => setShowAllSavings(true)}
            >
              Show {savings.length - SAVINGS_SHOWN} more <ChevronDown />
            </Button>
          )}
          {applied.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <span className="mr-1 text-xs text-muted-foreground">Applied</span>
              {applied.map((id) => (
                <button
                  key={id}
                  onClick={() => tripActions.undoSaving(id)}
                  className="inline-flex h-7 items-center gap-2 rounded-md border border-border px-2 text-xs font-medium transition-colors hover:border-muted-foreground/40 active:scale-[0.97]"
                  aria-label={`Undo ${SAVING_TITLES[id]}`}
                >
                  <Check className="size-3 text-success" /> {SAVING_TITLES[id]}
                  <Undo2 className="size-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="layout-5-7">
          <DestinationCard dest={dest} origin={trip.setup.origin} photo={false} />
          <WeatherCard />
        </div>
      </div>
    </div>
  );
}

/** Once the trip is under way (or costs are logged): what's spent and what's left a day. */
function SpendingGlance() {
  const { trip, totals } = useTrip();
  const today = todayIso();
  const s = spendingSummary({
    totals,
    cats: spendCategoriesFor(trip.setup.tripType, trip.inputs.transportMode),
    spending: trip.spending,
    bookings: trip.bookings,
    startDate: trip.setup.startDate,
    endDate: trip.setup.endDate,
    today,
  });
  if (trip.isSample || (s.phase === "before" && s.logged === 0)) return null;
  return (
    <section
      aria-labelledby="glance-spent"
      className="surface-card flex flex-col p-6 lg:w-[300px]"
      style={stagger(1)}
    >
      <h2 id="glance-spent" className="eyebrow">
        {s.phase === "during"
          ? `Today, ${formatCalendarDate(today, { month: "short", day: "numeric" })}`
          : "Spent so far"}
      </h2>
      <p className="money-display mt-2 text-large-title">
        <AnimatedMoney value={s.phase === "during" ? s.today : s.spent} />
      </p>
      <p className="tabular mt-1 text-sm text-muted-foreground">
        {s.phase === "during" && s.perDayLeft !== null
          ? `${formatMoney(s.perDayLeft)} a day left for ${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"}`
          : `${formatMoney(Math.abs(s.left))} ${s.over ? "over" : "left"} of ${formatMoney(s.spendable)}`}
      </p>
      <Button asChild variant="go" className="mt-4 lg:mt-auto">
        <Link to="/spending">Log a cost</Link>
      </Button>
    </section>
  );
}
