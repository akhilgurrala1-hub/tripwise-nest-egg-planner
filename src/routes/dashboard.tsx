import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronDown, Lock, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApproxMoney, CATEGORY_COLOR_VAR, PriceSourceBadge } from "@/components/app/bits";
import { AnimatedMoney, stagger } from "@/components/app/motion";
import { ShareTripButton } from "@/components/app/ShareTrip";
import { PageHeader } from "@/components/app/TripHeader";
import { DestinationCard, DestinationHero } from "@/components/app/DestinationIntro";
import { TripReady } from "@/components/app/TripReady";
import { WeatherCard } from "@/components/app/Weather";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SAVING_TITLES,
  formatMoney,
  transportParts,
} from "@/lib/budget";
import { bookingPlan, bookingProgress } from "@/lib/booking";
import { TRAVEL_STYLES } from "@/lib/demo-data";
import { liveCategories } from "@/lib/live/sources";
import { getLivePriceStatus } from "@/lib/prices/live-prices.functions";
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
  const { trip, dest, place, legs, totals, savings, applied, potentialSavings, shape } = useTrip();
  const [showAllSavings, setShowAllSavings] = useState(false);
  const style = TRAVEL_STYLES.find((s) => s.id === trip.setup.style);

  const live = liveCategories(trip.inputs, trip.overrides, trip.live);
  const fareLive = live.includes("transportation");
  const fetchStatus = useServerFn(getLivePriceStatus);
  const priceStatus = useQuery({
    queryKey: ["live", "price-status"],
    queryFn: () => fetchStatus(),
    staleTime: 10 * 60 * 1000,
  });
  const flightsConnected = !!priceStatus.data?.flights;
  // Transportation's parts only add up while it isn't a custom total.
  const parts =
    trip.overrides.transportation === undefined
      ? transportParts(trip.inputs, shape, legs.length)
      : [];
  const breakdown = CATEGORIES.map((c) => ({ cat: c, value: totals.categories[c] }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  // The bar is scaled to whichever is larger, so over-budget plans visibly overflow the spending line.
  const scale = Math.max(totals.spendable, totals.planned, 1);
  const spendLine = (totals.spendable / scale) * 100;

  return (
    <div>
      <PageHeader
        eyebrow={`Overview · ${style?.label ?? ""} style`}
        title={place}
        sampleBanner="card"
      >
        {!trip.isSample && <ShareTripButton />}
      </PageHeader>

      <div className="page-container mt-8 space-y-4">
        <TripReady />
        {/* The place first, large, like a travel magazine: then the money. */}
        <DestinationHero
          dest={dest}
          origin={trip.setup.origin}
          className="aspect-[4/3] w-full sm:aspect-[21/9] sm:max-h-[400px]"
        />
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Balance */}
          <section className="surface-card animate-rise min-w-0 flex-1 p-6 sm:p-8">
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
                  <AnimatedMoney value={Math.abs(totals.remaining)} countUp />
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
                    <AnimatedMoney value={totals.perPersonPerDay} countUp />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Could save</dt>
                  <dd className="tabular mt-1 text-base font-medium text-success">
                    <AnimatedMoney value={potentialSavings} countUp />
                  </dd>
                </div>
              </dl>
            </div>

            {/* One stacked bar: every category in proportion, with the spending limit marked. */}
            <div className="relative mt-8">
              <div className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted">
                {breakdown.map((d) => (
                  <span
                    key={d.cat}
                    title={`${CATEGORY_LABELS[d.cat]} ${formatMoney(d.value)}`}
                    className="h-full transition-[width] spring-smooth first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${(d.value / scale) * 100}%`,
                      backgroundColor: CATEGORY_COLOR_VAR[d.cat],
                    }}
                  />
                ))}
              </div>
              {totals.overBudget && (
                <span
                  className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground transition-[left] duration-500"
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
                  <span>
                    {shape.days} days · {shape.travelers} traveler{shape.travelers > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </section>
          <SpendingGlance />
        </div>

        <NextSteps />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Breakdown */}
          <section className="surface-card p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="title-display text-title-1">Where it goes</h2>
              <PriceSourceBadge />
            </div>
            <ul className="mt-4 divide-y divide-border">
              {breakdown.map(({ cat, value }) => (
                <li key={cat} className="flex flex-wrap items-center gap-x-4 py-2 text-sm">
                  <span
                    className="size-2 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: CATEGORY_COLOR_VAR[cat] }}
                  />
                  <span className="min-w-0 flex-1 truncate">{CATEGORY_LABELS[cat]}</span>
                  <span className="tabular w-10 text-right text-xs text-muted-foreground">
                    {totals.planned > 0 ? Math.round((value / totals.planned) * 100) : 0}%
                  </span>
                  <span className="tabular w-20 text-right font-medium">
                    <AnimatedMoney value={value} />
                  </span>
                  {cat === "transportation" && parts.length > 0 && (
                    <ul className="basis-full space-y-1 pt-2 pl-6">
                      {parts.map((p) => (
                        <li key={p.key} className="flex items-baseline gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate text-foreground/85">
                            {p.label}
                            <span className="text-muted-foreground"> · {p.detail}</span>
                          </span>
                          {p.key === "fares" && fareLive ? (
                            <span className="text-micro font-medium text-success">Live</span>
                          ) : p.key === "fares" && flightsConnected ? (
                            <Link
                              to="/budget"
                              hash="live-prices"
                              className="text-micro font-medium text-primary hover:underline"
                            >
                              Check the real fare
                            </Link>
                          ) : null}
                          <span className="tabular text-muted-foreground">
                            {formatMoney(p.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {cat === "misc" && (
                    <span className="basis-full pl-6 text-xs text-muted-foreground">
                      {trip.inputs.miscPct}% set aside for prices that change before you book
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link to="/budget">
                Edit budget <ArrowRight />
              </Link>
            </Button>
          </section>

          {/* Savings */}
          <section className="surface-card p-6">
            <h2 className="title-display text-title-1">Ways to spend less</h2>
            <p className="mt-1 text-footnote text-muted-foreground">
              Applies to your budget instantly. Undo anytime.
            </p>
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
                <li className="py-4 text-sm text-muted-foreground">
                  Every saving idea is applied.
                </li>
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
                    className="animate-pop inline-flex h-7 items-center gap-2 rounded-md border border-border px-2 text-xs font-medium transition-colors hover:border-muted-foreground/40 active:scale-[0.97]"
                    aria-label={`Undo ${SAVING_TITLES[id]}`}
                  >
                    <Check className="size-3 text-success" /> {SAVING_TITLES[id]}
                    <Undo2 className="size-3 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

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
      className="surface-card animate-rise flex flex-col p-6 lg:w-[300px]"
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

type StepTo = "/" | "/budget" | "/road-trip" | "/itinerary" | "/book" | "/trips" | "/auth";

/** The planning flow in order, with what's done and the one thing to do next. */
function NextSteps() {
  const { trip, dest, shape, totals } = useTrip();
  const { user } = useAuth();
  const roadTrip = trip.setup.tripType === "road-trip";
  const live = liveCategories(trip.inputs, trip.overrides, trip.live).length > 0;
  const realPlan = !!trip.itinerary && trip.itinerary.source !== "demo";
  // Only ask for live prices once a price source is connected; otherwise the step could never be done.
  const fetchStatus = useServerFn(getLivePriceStatus);
  const status = useQuery({
    queryKey: ["live", "price-status"],
    queryFn: () => fetchStatus(),
    staleTime: 10 * 60 * 1000,
  });
  const pricesAvailable =
    live || (!!status.data && (status.data.gas || status.data.hotels || status.data.flights));
  const steps: { title: string; done: boolean; to: StepTo; cta: string }[] = [
    { title: "Plan the trip", done: !trip.isSample, to: "/", cta: "Start planning" },
    ...(pricesAvailable
      ? [{ title: "Check live prices", done: live, to: "/budget" as const, cta: "Open budget" }]
      : []),
    ...(roadTrip
      ? [
          {
            title: "Pick stops",
            done: trip.roadTrip.includedStops.length > 0,
            to: "/road-trip" as const,
            cta: "Plan route",
          },
        ]
      : []),
    { title: "Build itinerary", done: realPlan, to: "/itinerary", cta: "Open itinerary" },
    {
      title: "Book",
      done: bookingProgress(bookingPlan(trip, dest, shape, totals), trip.bookings).requiredDone,
      to: "/book",
      cta: "Start booking",
    },
    {
      title: "Save trip",
      done: !!trip.cloud,
      to: user ? "/trips" : "/auth",
      cta: user ? "Save trip" : "Sign in to save",
    },
  ];
  const next = steps.find((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  const link = (to: StepTo, children: React.ReactNode, className: string) =>
    to === "/auth" ? (
      <Link to="/auth" search={{ redirect: "/trips" }} className={className}>
        {children}
      </Link>
    ) : (
      <Link to={to} className={className}>
        {children}
      </Link>
    );

  return (
    <section className="surface-card animate-rise p-6" style={stagger(1)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="title-display text-title-1">Checklist</h2>
          <p className="tabular mt-1 text-footnote text-muted-foreground">
            {next
              ? `${doneCount} of ${steps.length} done${next ? `. Next: ${next.title.toLowerCase()}` : ""}`
              : "All set. Have a great trip."}
          </p>
        </div>
        {next && (
          <Button asChild variant="go" size="sm">
            {link(
              next.to,
              <>
                {next.cta} <ArrowRight />
              </>,
              "",
            )}
          </Button>
        )}
      </div>
      {/* How far along: progress people can see makes the next step easier to take. */}
      <div
        role="progressbar"
        aria-label="Trip checklist"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        className="mt-4 h-1.5 overflow-hidden rounded-[3px] bg-muted"
      >
        <div
          className="h-full rounded-[3px] bg-success transition-[width] spring-smooth"
          style={{ width: `${(100 * doneCount) / steps.length}%` }}
        />
      </div>
      <ol className="mt-4 flex items-center">
        {steps.map((s, i) => (
          <li key={s.title} className="flex min-w-0 flex-1 items-center last:flex-none">
            {link(
              s.to,
              <>
                <span
                  className={cn(
                    "tabular grid size-6 shrink-0 place-items-center rounded-full border text-micro font-medium transition-colors duration-300",
                    s.done
                      ? "border-foreground bg-foreground text-background"
                      : s === next
                        ? "border-primary text-foreground ring-3 ring-primary/20"
                        : "border-input text-muted-foreground",
                  )}
                >
                  {s.done ? <Check className="size-3.5" aria-label="Done" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden truncate text-footnote lg:inline",
                    s.done || s === next ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.title}
                </span>
              </>,
              "group flex min-w-0 items-center gap-2 rounded-md py-1 pr-2",
            )}
            {i < steps.length - 1 && (
              <span className="mx-1 h-px min-w-3 flex-1 overflow-hidden bg-border">
                <span
                  className={cn(
                    "block h-full bg-foreground transition-[width] duration-500",
                    s.done ? "w-full" : "w-0",
                  )}
                />
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
