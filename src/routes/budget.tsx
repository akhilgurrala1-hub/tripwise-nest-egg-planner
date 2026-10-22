import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { CATEGORY_COLOR_VAR, CATEGORY_ICONS, DemoBadge, NumberField } from "@/components/app/bits";
import { PageHeader } from "@/components/app/TripHeader";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CATEGORIES, CATEGORY_LABELS, formatMoney, type BudgetInputs, type Category } from "@/lib/budget";
import { itineraryActivityCost } from "@/lib/itinerary";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/budget")({
  head: () => ({
    meta: [
      { title: "Budget calculator — Waypoint" },
      { name: "description", content: "Edit gas, food, lodging, parking, tolls, taxes and activities with live trip budget calculations." },
      { property: "og:title", content: "Budget calculator — Waypoint" },
      { property: "og:description", content: "A smart, editable trip budget with a protected emergency fund." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BudgetPage,
});

function BudgetPage() {
  const { trip, totals, shape } = useTrip();
  const maxFund = Math.max(0, trip.setup.totalBudget);
  const hasOverrides = Object.keys(trip.overrides).length > 0;

  return (
    <div>
      <PageHeader eyebrow="Budget calculator" title="Every dollar, mapped">
        <DemoBadge label="Demo estimates" />
      </PageHeader>

      <div className="mx-auto mt-6 grid max-w-6xl gap-6 px-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6 lg:order-1">
          {/* Summary */}
          <section className="surface-card p-5">
            <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
              <div>
                <label htmlFor="total-budget" className="text-sm font-bold">
                  Total trip budget
                </label>
                <NumberField
                  id="total-budget"
                  prefix="$"
                  step={50}
                  value={trip.setup.totalBudget}
                  onChange={tripActions.setTotalBudget}
                  className="mt-2 h-14 rounded-2xl"
                  inputClassName="font-display text-2xl"
                />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Protected fund" value={formatMoney(totals.emergencyFund)} tone="shield" />
                <Stat label="Spendable" value={formatMoney(totals.spendable)} />
                <Stat label="Planned" value={formatMoney(totals.planned)} />
                <Stat
                  label={totals.overBudget ? "Over budget" : "Remaining"}
                  value={formatMoney(Math.abs(totals.remaining))}
                  tone={totals.overBudget ? "danger" : "success"}
                />
              </dl>
            </div>
            <div className="mt-5">
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", totals.overBudget ? "bg-destructive" : "bg-gradient-sunset")}
                  style={{ width: `${Math.min(100, totals.percentUsed)}%` }}
                />
              </div>
              <p className="tabular mt-1.5 text-xs text-muted-foreground">
                {Math.round(totals.percentUsed)}% of spendable money planned · {formatMoney(totals.perPersonPerDay)} per person per day
              </p>
            </div>
            {totals.overBudget && (
              <div className="mt-4 flex gap-2.5 rounded-xl bg-destructive-soft p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  You're {formatMoney(-totals.remaining)} over. Your emergency fund stays protected — trim a category or check
                  the savings ideas on your dashboard.
                </p>
              </div>
            )}
          </section>

          {/* Categories */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold">Expenses</h2>
              {hasOverrides && (
                <Button variant="ghost" size="sm" onClick={tripActions.resetToEstimates}>
                  <RotateCcw /> Reset all
                </Button>
              )}
            </div>
            <Accordion type="multiple" className="space-y-2.5">
              {CATEGORIES.map((cat) => (
                <CategoryRow key={cat} cat={cat} />
              ))}
            </Accordion>
            <p className="mt-3 text-xs text-muted-foreground">
              Estimates use demo prices for {shape.days} day{shape.days > 1 ? "s" : ""}, {shape.nights} night
              {shape.nights === 1 ? "" : "s"} and {shape.travelers} traveler{shape.travelers > 1 ? "s" : ""}. Open a
              category to tune the inputs or type your own amount.
            </p>
          </section>
        </div>

        {/* Emergency fund */}
        <aside className="lg:order-2">
          <section className="overflow-hidden rounded-3xl bg-gradient-ink p-5 text-primary-foreground shadow-lift lg:sticky lg:top-20">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-full bg-card/15">
                <ShieldCheck className="size-5" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-card/15 px-2.5 py-1 text-xs font-semibold">
                <Lock className="size-3" /> Protected
              </span>
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold">Emergency fund</h2>
            <p className="mt-1 text-sm text-primary-foreground/75">
              Set aside first and never counted as spending money — for flat tires, urgent care or a surprise night's stay.
            </p>
            <p className="tabular mt-4 font-display text-4xl font-semibold">{formatMoney(totals.emergencyFund)}</p>
            <p className="text-xs text-primary-foreground/70">
              {trip.setup.totalBudget > 0 ? Math.round((totals.emergencyFund / trip.setup.totalBudget) * 100) : 0}% of
              your total budget
            </p>
            <Slider
              className="mt-5"
              value={[Math.min(trip.emergencyFund, maxFund)]}
              max={maxFund || 1}
              step={25}
              onValueChange={([v]) => tripActions.setEmergencyFund(v)}
              aria-label="Emergency fund amount"
            />
            <NumberField
              aria-label="Emergency fund"
              prefix="$"
              step={25}
              value={trip.emergencyFund}
              onChange={tripActions.setEmergencyFund}
              className="mt-4 border-card/20 bg-card text-foreground"
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "shield" | "success" | "danger" }) {
  return (
    <div className="rounded-xl bg-muted/70 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular text-lg font-bold",
          tone === "shield" && "text-shield",
          tone === "success" && "text-success",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function CategoryRow({ cat }: { cat: Category }) {
  const { trip, totals, shape } = useTrip();
  const Icon = CATEGORY_ICONS[cat];
  const isCustom = trip.overrides[cat] !== undefined;
  const amount = totals.categories[cat];
  const share = totals.planned > 0 ? (amount / totals.planned) * 100 : 0;
  const i = trip.inputs;
  const set = <K extends keyof BudgetInputs>(k: K) => (v: number) => tripActions.setInput(k, v as BudgetInputs[K]);

  let fields: ReactNode = null;
  let formula = "";
  switch (cat) {
    case "gas":
      formula = `${i.roundTripMiles} mi ÷ ${i.mpg} mpg × ${formatMoney(i.gasPrice, { cents: true })}/gal`;
      fields = (
        <>
          <InputCell label="Round-trip miles" value={i.roundTripMiles} onChange={set("roundTripMiles")} suffix="mi" step={10} />
          <InputCell label="Fuel economy" value={i.mpg} onChange={set("mpg")} suffix="mpg" />
          <InputCell label="Gas price" value={i.gasPrice} onChange={set("gasPrice")} prefix="$" suffix="/gal" step={0.05} />
        </>
      );
      break;
    case "food":
      formula = `${formatMoney(i.foodPerPersonDay)} × ${shape.travelers} people × ${shape.days} days`;
      fields = <InputCell label="Per person, per day" value={i.foodPerPersonDay} onChange={set("foodPerPersonDay")} prefix="$" />;
      break;
    case "water":
      formula = `${formatMoney(i.waterPerPersonDay, { cents: true })} × ${shape.travelers} people × ${shape.days} days`;
      fields = <InputCell label="Per person, per day" value={i.waterPerPersonDay} onChange={set("waterPerPersonDay")} prefix="$" step={0.5} />;
      break;
    case "accommodations":
      formula = `${formatMoney(i.nightlyRate)} × ${i.rooms} room${i.rooms === 1 ? "" : "s"} × ${shape.nights} nights`;
      fields = (
        <>
          <InputCell label="Nightly rate" value={i.nightlyRate} onChange={set("nightlyRate")} prefix="$" step={5} />
          <InputCell label="Rooms" value={i.rooms} onChange={set("rooms")} />
        </>
      );
      break;
    case "parking":
      formula = `${formatMoney(i.parkingPerDay)} × ${shape.days} days`;
      fields = <InputCell label="Per day" value={i.parkingPerDay} onChange={set("parkingPerDay")} prefix="$" />;
      break;
    case "tolls":
      formula = "Total for the route";
      fields = <InputCell label="Total tolls" value={i.tolls} onChange={set("tolls")} prefix="$" />;
      break;
    case "taxes":
      formula = `${i.taxRatePct}% of lodging, food & activities`;
      fields = <InputCell label="Tax rate" value={i.taxRatePct} onChange={set("taxRatePct")} suffix="%" step={0.5} />;
      break;
    case "activities": {
      const fromItinerary = itineraryActivityCost(trip.itinerary, shape.travelers);
      formula = `${formatMoney(i.activitiesPerPerson)} × ${shape.travelers} people`;
      fields = (
        <>
          <InputCell label="Per person, whole trip" value={i.activitiesPerPerson} onChange={set("activitiesPerPerson")} prefix="$" step={5} />
          {trip.itinerary && (
            <div className="col-span-full flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-xs">
              <span>
                Your itinerary's sightseeing: <strong className="tabular">{formatMoney(fromItinerary)}</strong>
              </span>
              <Button size="sm" variant="outline" onClick={() => tripActions.setOverride("activities", fromItinerary)}>
                Use this
              </Button>
            </div>
          )}
        </>
      );
      break;
    }
    case "misc":
      formula = `${i.miscPct}% cushion on everything else`;
      fields = <InputCell label="Cushion" value={i.miscPct} onChange={set("miscPct")} suffix="%" />;
      break;
  }

  return (
    <AccordionItem value={cat} className="surface-card overflow-hidden border-b-0 px-0">
      <AccordionTrigger className="px-4 py-3.5 hover:no-underline">
        <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl text-primary-foreground"
            style={{ backgroundColor: CATEGORY_COLOR_VAR[cat] }}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-bold">{CATEGORY_LABELS[cat]}</span>
              {isCustom ? <Badge variant="gold">Custom</Badge> : <Badge variant="secondary">Estimate</Badge>}
            </div>
            <p className="truncate text-xs font-normal text-muted-foreground">{isCustom ? "Your amount" : formula}</p>
          </div>
          <div className="mr-1 text-right">
            <p className="tabular font-bold">{formatMoney(amount)}</p>
            <p className="tabular text-[11px] font-normal text-muted-foreground">{Math.round(share)}%</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="border-t border-border bg-muted/40 px-4 pt-4 pb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{fields}</div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-dashed border-border pt-4">
          <div className="min-w-40 flex-1">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Or set your own total</p>
            <NumberField
              aria-label={`${CATEGORY_LABELS[cat]} custom amount`}
              prefix="$"
              value={amount}
              onChange={(v) => tripActions.setOverride(cat, v)}
            />
          </div>
          {isCustom && (
            <Button variant="outline" onClick={() => tripActions.setOverride(cat, undefined)}>
              <RotateCcw /> Use estimate ({formatMoney(totals.estimates[cat])})
            </Button>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function InputCell(props: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{props.label}</p>
      <NumberField
        aria-label={props.label}
        value={props.value}
        onChange={props.onChange}
        prefix={props.prefix}
        suffix={props.suffix}
        step={props.step}
      />
    </div>
  );
}
