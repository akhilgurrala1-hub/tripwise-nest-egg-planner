import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { CATEGORY_COLOR_VAR, CATEGORY_ICONS, NumberField, PriceSourceBadge } from "@/components/app/bits";
import { LivePricesPanel } from "@/components/app/LivePricesPanel";
import { PageHeader } from "@/components/app/TripHeader";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  CATEGORY_LABELS,
  categoriesFor,
  OVERRIDABLE,
  formatMoney,
  percentLabel,
  stopCost,
  type BudgetInputs,
  type Category,
} from "@/lib/budget";
import { TRANSPORT_MODES, TRIP_TYPES, isDrivingMode, tripTypeInfo } from "@/lib/demo-data";
import { itineraryActivityCost } from "@/lib/itinerary";
import { categorySource } from "@/lib/live/sources";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/budget")({
  head: () => ({
    meta: [
      { title: "Budget calculator — Waypoint" },
      { name: "description", content: "Edit hotels, gas, tolls, parking, transportation, meals, snacks, water, taxes and activities with live budget math." },
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
      <PageHeader eyebrow="Budget" title="Let's make the most of your budget">
        <PriceSourceBadge />
      </PageHeader>

      <div className="mx-auto mt-6 grid max-w-6xl grid-cols-1 gap-6 px-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6 lg:order-1">
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
                <Stat label="Protected reserve" value={formatMoney(totals.emergencyFund)} tone="shield" />
                <Stat label="Spending money" value={formatMoney(totals.spendable)} />
                <Stat label="Planned so far" value={formatMoney(totals.planned)} />
                <Stat
                  label={totals.overBudget ? "Over by" : "Left to explore"}
                  value={formatMoney(Math.abs(totals.remaining))}
                  tone={totals.overBudget ? "danger" : "success"}
                />
              </dl>
            </div>
            <div className="mt-5">
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", totals.overBudget ? "bg-destructive" : "bg-gradient-sunset")}
                  style={{ width: `${totals.percentUsed === null ? (totals.planned > 0 ? 100 : 0) : Math.min(100, totals.percentUsed)}%` }}
                />
              </div>
              <p className="tabular mt-1.5 text-xs text-muted-foreground">
                {percentLabel(totals)} · {formatMoney(totals.perPersonPerDay)} per person per day
              </p>
            </div>
            {totals.overBudget && <CutPlan />}
          </section>

          <LivePricesPanel />

          {/* Categories */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold">Where your money goes</h2>
              {hasOverrides && (
                <Button variant="ghost" size="sm" onClick={tripActions.resetToEstimates}>
                  <RotateCcw /> Reset all
                </Button>
              )}
            </div>
            <TripTypeSwitcher />
            <Accordion type="multiple" className="space-y-2.5">
              {categoriesFor(trip.setup.tripType, trip.inputs.transportMode).map((cat) => (
                <CategoryRow key={cat} cat={cat} />
              ))}
            </Accordion>
            <p className="mt-3 text-xs text-muted-foreground">
              Amounts marked “Estimate” use demo prices for {shape.days} day{shape.days > 1 ? "s" : ""}, {shape.nights} night
              {shape.nights === 1 ? "" : "s"} and {shape.travelers} traveler{shape.travelers > 1 ? "s" : ""}. Open a
              category to tune the inputs or type your own amount.
            </p>
          </section>
        </div>

        {/* Emergency fund */}
        <aside className="lg:order-2">
          <section className="overflow-hidden rounded-3xl bg-gradient-ink p-5 text-ink-foreground shadow-lift lg:sticky lg:top-20">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-full bg-ink-foreground/10">
                <ShieldCheck className="size-5" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-ink-foreground/10 px-2.5 py-1 text-xs font-semibold">
                <Lock className="size-3" /> Protected
              </span>
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold">Emergency reserve</h2>
            <p className="mt-1 text-sm text-ink-foreground/75">
              A little extra set aside for peace of mind. It never counts as spending money — it's there for flat tires, urgent care or a surprise night's stay.
            </p>
            <p className="tabular mt-4 font-display text-4xl font-semibold">{formatMoney(totals.emergencyFund)}</p>
            <p className="text-xs text-ink-foreground/70">
              {trip.setup.totalBudget > 0 ? Math.round((totals.emergencyFund / trip.setup.totalBudget) * 100) : 0}% of
              your total budget
            </p>
            <Slider
              className="mt-5"
              value={[Math.min(trip.emergencyFund, maxFund)]}
              max={maxFund || 1}
              step={25}
              onValueChange={([v]) => tripActions.setEmergencyFund(v ?? 0)}
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
  const source = categorySource(cat, trip.inputs, trip.overrides, trip.live);
  const amount = totals.categories[cat];
  const share = totals.planned > 0 ? (amount / totals.planned) * 100 : 0;
  const i = trip.inputs;
  const set = <K extends keyof BudgetInputs>(k: K) => (v: number) => tripActions.setInput(k, v as BudgetInputs[K]);

  const driving = isDrivingMode(i.transportMode);
  const modeLabel = TRANSPORT_MODES.find((m) => m.id === i.transportMode)?.label ?? "";
  let fields: ReactNode = null;
  let formula = "";
  switch (cat) {
    case "cruise":
      formula = `(${formatMoney(i.cruisePerNight)} fare + ${formatMoney(i.gratuitiesPerNight)} tips) × ${shape.travelers} × ${shape.nights} nights + ${formatMoney(i.portFeesPerPerson)} port fees each`;
      fields = (
        <>
          <InputCell label="Cruise fare, per person per night" value={i.cruisePerNight} onChange={set("cruisePerNight")} prefix="$" step={10} />
          <InputCell label="Gratuities, per person per night" value={i.gratuitiesPerNight} onChange={set("gratuitiesPerNight")} prefix="$" />
          <InputCell label="Port fees & taxes, per person" value={i.portFeesPerPerson} onChange={set("portFeesPerPerson")} prefix="$" step={10} />
          <p className="col-span-full text-xs text-muted-foreground">
            Your cabin and main dining are in the fare, so hotel nights stay at $0 and Meals covers only specialty dining and food
            ashore.
          </p>
        </>
      );
      break;
    case "transportation": {
      const fareMode = i.transportMode === "flight" || i.transportMode === "train" || i.transportMode === "bus";
      const parts: string[] = [];
      if (fareMode) parts.push(`${formatMoney(i.farePerPerson)} fare × ${shape.travelers}`);
      if (i.transportMode === "rental-car") parts.push(`${formatMoney(i.rentalPerDay)} rental × ${shape.days} days`);
      if (i.localTransitPerDay > 0) parts.push(`${formatMoney(i.localTransitPerDay)} local rides × ${shape.days} days`);
      formula = parts.length ? parts.join(" + ") : `${modeLabel} · no fares or rentals`;
      fields = (
        <>
          {fareMode && (
            <InputCell label={`${modeLabel} fare, per person (round trip)`} value={i.farePerPerson} onChange={set("farePerPerson")} prefix="$" step={5} />
          )}
          {i.transportMode === "rental-car" && (
            <InputCell label="Rental, per day" value={i.rentalPerDay} onChange={set("rentalPerDay")} prefix="$" step={5} />
          )}
          <InputCell label="Rideshare & transit, per day (group)" value={i.localTransitPerDay} onChange={set("localTransitPerDay")} prefix="$" />
        </>
      );
      break;
    }
    case "gas":
      formula = driving
        ? `${i.roundTripMiles} mi ÷ ${i.mpg} mpg × ${formatMoney(i.gasPrice, { cents: true })}/gal`
        : `Not driving (${modeLabel.toLowerCase()})`;
      fields = driving ? (
        <>
          <InputCell label="Round-trip miles" value={i.roundTripMiles} onChange={set("roundTripMiles")} suffix="mi" step={10} />
          <InputCell label="Fuel economy" value={i.mpg} onChange={set("mpg")} suffix="mpg" />
          <InputCell label="Gas price" value={i.gasPrice} onChange={set("gasPrice")} prefix="$" suffix="/gal" step={0.05} />
        </>
      ) : (
        <NotDriving />
      );
      break;
    case "food":
      formula = `${formatMoney(i.foodPerPersonDay)} × ${shape.travelers} people × ${shape.days} days`;
      fields = <InputCell label="Per person, per day" value={i.foodPerPersonDay} onChange={set("foodPerPersonDay")} prefix="$" />;
      break;
    case "snacks":
      formula = `${formatMoney(i.snacksPerPersonDay, { cents: true })} × ${shape.travelers} people × ${shape.days} days`;
      fields = <InputCell label="Per person, per day" value={i.snacksPerPersonDay} onChange={set("snacksPerPersonDay")} prefix="$" step={0.5} />;
      break;
    case "water":
      formula = `${formatMoney(i.waterPerPersonDay, { cents: true })} × ${shape.travelers} people × ${shape.days} days`;
      fields = <InputCell label="Per person, per day" value={i.waterPerPersonDay} onChange={set("waterPerPersonDay")} prefix="$" step={0.5} />;
      break;
    case "accommodations":
      formula =
        trip.setup.tripType === "cruise" && i.nightlyRate === 0
          ? "Your cabin is in the cruise fare — add a pre-cruise hotel night here if you need one"
          : `${formatMoney(i.nightlyRate)} × ${i.rooms} room${i.rooms === 1 ? "" : "s"} × ${shape.nights} nights`;
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
      formula = driving ? "Total for the route" : `Not driving (${modeLabel.toLowerCase()})`;
      fields = driving ? <InputCell label="Total tolls" value={i.tolls} onChange={set("tolls")} prefix="$" /> : <NotDriving />;
      break;
    case "stops":
      formula = `${trip.roadTrip.includedStops.length} stop${trip.roadTrip.includedStops.length === 1 ? "" : "s"} · entry + detour fuel`;
      fields = (
        <div className="col-span-full space-y-2 text-sm">
          {trip.roadTrip.includedStops.length === 0 ? (
            <p className="text-muted-foreground">No road-trip stops added yet.</p>
          ) : (
            <ul className="space-y-1">
              {trip.roadTrip.includedStops.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span className="truncate">{s.name}</span>
                  <span className="tabular font-semibold">{formatMoney(stopCost(s, shape.travelers, i), { cents: true })}</span>
                </li>
              ))}
            </ul>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/road-trip">Choose stops</Link>
          </Button>
        </div>
      );
      break;
    case "taxes":
      formula = `${i.taxRatePct}% of hotels, meals, snacks & activities`;
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
      formula = `${i.miscPct}% cushion on everything except stops`;
      fields = <InputCell label="Cushion" value={i.miscPct} onChange={set("miscPct")} suffix="%" />;
      break;
  }

  const canOverride = OVERRIDABLE.includes(cat);

  return (
    <AccordionItem value={cat} className="surface-card overflow-hidden border-b-0 px-0">
      <AccordionTrigger className="px-4 py-3.5 hover:no-underline">
        <div className="flex min-w-0 flex-1 items-center gap-3 text-left font-sans">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl text-on-image"
            style={{ backgroundColor: CATEGORY_COLOR_VAR[cat] }}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-bold">{CATEGORY_LABELS[cat]}</span>
              {source === "custom" ? (
                <Badge variant="gold">Your amount</Badge>
              ) : source === "live" ? (
                <Badge variant="success">Live price</Badge>
              ) : (
                <Badge variant="secondary">Estimate</Badge>
              )}
            </div>
            <p className="truncate text-xs font-normal text-muted-foreground">{isCustom ? "Your amount" : formula}</p>
          </div>
          <div className="mr-1 text-right">
            <p className="tabular font-bold">{formatMoney(amount, { cents: amount % 1 !== 0 && amount < 100 })}</p>
            <p className="tabular text-[11px] font-normal text-muted-foreground">{Math.round(share)}%</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="border-t border-border bg-muted/40 px-4 pt-4 pb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{fields}</div>
        {canOverride && (
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
        )}
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

function NotDriving() {
  return (
    <p className="col-span-full text-sm text-muted-foreground">
      Not needed for this travel method. Switch to "My car" or "Rental car" above to estimate it, or set your own total
      below.
    </p>
  );
}

function CutPlan() {
  const { cuts } = useTrip();
  return (
    <div className="mt-4 rounded-2xl border border-destructive/25 bg-destructive-soft p-4">
      <div className="flex gap-2.5 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong>Your plan is {formatMoney(cuts.gap, { cents: true })} more than your spending money.</strong> No worries — your
          reserve stays untouched. Here's a smarter way to spend less:
        </p>
      </div>
      <ul className="mt-3 space-y-2">
        {cuts.suggestions.map((s) => {
          const Icon = CATEGORY_ICONS[s.category];
          return (
            <li key={s.category} className="flex items-center gap-3 rounded-xl bg-card p-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-lg text-on-image"
                style={{ backgroundColor: CATEGORY_COLOR_VAR[s.category] }}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-bold">
                  {CATEGORY_LABELS[s.category]}{" "}
                  <span className="tabular font-normal text-muted-foreground">
                    {formatMoney(s.current)} → {formatMoney(s.current - s.cut, { cents: true })}
                  </span>
                </p>
                <p className="tabular text-xs text-muted-foreground">
                  Saves {formatMoney(s.saves, { cents: true })} incl. taxes & cushion
                  {s.closesGap && (
                    <span className="ml-1 inline-flex items-center gap-0.5 font-semibold text-success">
                      <Check className="size-3" /> back on budget
                    </span>
                  )}
                </p>
              </div>
              {s.category === "stops" ? (
                <Button asChild size="sm" variant="outline">
                  <Link to="/road-trip">Review</Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    tripActions.setOverride(s.category, Math.round((s.current - s.cut) * 100) / 100);
                    toast.success(`${CATEGORY_LABELS[s.category]} trimmed by ${formatMoney(s.cut, { cents: true })}`);
                  }}
                >
                  Apply
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Separate trip categories: switching re-estimates the budget for that kind of trip and says what changed. */
function TripTypeSwitcher() {
  const { trip } = useTrip();
  const info = tripTypeInfo(trip.setup.tripType);
  const modes = TRANSPORT_MODES.filter((m) => info.modes.includes(m.id));
  return (
    <div className="mb-4 space-y-3">
      <div>
        <p className="mb-2 text-sm font-bold">Trip type</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Trip type">
          {TRIP_TYPES.map((t) => {
            const active = trip.setup.tripType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (active) return;
                  const [headline, ...details] = tripActions.setTripType(t.id);
                  if (headline) toast.success(headline, details.length ? { description: details.join(" ") } : undefined);
                }}
                className={cn(
                  "min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-all",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {modes.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-bold">{info.modeQuestion}</p>
          <div className="flex flex-wrap gap-2">
            {modes.map((m) => {
              const active = trip.inputs.transportMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => tripActions.setTransportMode(m.id)}
                  className={cn(
                    "min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-all",
                    active ? "border-secondary-foreground/20 bg-secondary text-foreground" : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
