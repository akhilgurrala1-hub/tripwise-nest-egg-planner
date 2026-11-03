import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, MapPin, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { InterestChips, NumberField } from "@/components/app/bits";
import { Segmented, stagger } from "@/components/app/motion";
import { PlaceInput } from "@/components/app/PlaceInput";
import { TripTypePicker } from "@/components/app/TripTypePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calculateBudget,
  defaultEmergencyFund,
  defaultInputs,
  formatMoney,
  tripShape,
} from "@/lib/budget";
import {
  CUSTOM_DESTINATION_ID,
  DESTINATIONS,
  INTERESTS,
  TRAVEL_STYLES,
  getDestination,
  modeForTripType,
  tripTypeInfo,
  type TripType,
} from "@/lib/demo-data";
import { addDays, dateRangeError, inclusiveDays, isIsoDate, todayIso } from "@/lib/dates";
import { destinationForTripType, tripActions, useTrip, type TripSetup } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Waypoint — Plan your next trip on any budget" },
      {
        name: "description",
        content:
          "Pick a destination, dates, travelers and budget. Waypoint builds a smart budget and itinerary for road trips, getaways and staycations.",
      },
      { property: "og:title", content: "Waypoint — Plan your next trip on any budget" },
      {
        property: "og:description",
        content:
          "Smart budgets, a protected emergency fund and personalized itineraries for road trips, getaways and staycations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Welcome,
});

const BUDGET_PRESETS = [500, 1000, 2500, 5000];

function Welcome() {
  const navigate = useNavigate();
  const { trip } = useTrip();
  const [form, setForm] = useState<TripSetup>(trip.setup);
  const touched = useRef(false);
  const reserveTouched = useRef(false);

  // Pick up a saved trip once it loads from this device.
  useEffect(() => {
    if (!touched.current) setForm(trip.setup);
  }, [trip.setup]);

  const update = (patch: Partial<TripSetup>) => {
    touched.current = true;
    setForm((f) => ({ ...f, ...patch }));
  };

  const shape = tripShape(form.startDate, form.endDate, form.travelers);
  const dateError =
    dateRangeError(form.startDate, form.endDate) ||
    (form.startDate < todayIso() ? "That start date has already passed" : "");

  /** Moving the start date keeps the trip's length, so the end date never ends up before it. */
  const setStartDate = (startDate: string) => {
    const length = inclusiveDays(form.startDate, form.endDate);
    if (!isIsoDate(startDate) || length === null) return update({ startDate });
    update({ startDate, endDate: addDays(startDate, length - 1) });
  };
  const reserveError =
    form.emergencyFund > form.totalBudget ? "Reserve can't be more than your total budget" : "";
  const destError =
    form.destinationId === CUSTOM_DESTINATION_ID && !form.customDestination.trim()
      ? "Type a destination"
      : "";

  const suggested = useMemo(() => {
    const dest = getDestination(form.destinationId, form.customDestination);
    const totals = calculateBudget(
      defaultInputs(dest, form.style, form.tripType, form.travelers, form.transportMode),
      shape,
      0,
      0,
    );
    // Planned spend plus the protected reserve (10% of the budget unless the traveler set their own).
    return reserveTouched.current
      ? Math.ceil((totals.planned + form.emergencyFund) / 50) * 50
      : Math.ceil(totals.planned / 0.9 / 50) * 50;
  }, [
    form.destinationId,
    form.customDestination,
    form.style,
    form.tripType,
    form.travelers,
    form.transportMode,
    form.emergencyFund,
    shape,
  ]);

  const setBudget = (totalBudget: number) =>
    update(
      reserveTouched.current
        ? { totalBudget }
        : { totalBudget, emergencyFund: defaultEmergencyFund(totalBudget) },
    );

  // Only destinations that suit the chosen trip type ("Somewhere else" is always offered).
  const orderedDestinations = useMemo(
    () => DESTINATIONS.filter((d) => d.bestFor.includes(form.tripType)),
    [form.tripType],
  );

  const setTripType = (tripType: TripType) => {
    const { destinationId } = destinationForTripType(form, tripType);
    update({
      tripType,
      destinationId,
      transportMode: modeForTripType(tripType, form.transportMode),
    });
  };

  const toggleInterest = (id: (typeof INTERESTS)[number]["id"]) =>
    update({
      interests: form.interests.includes(id)
        ? form.interests.filter((i) => i !== id)
        : [...form.interests, id],
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dateError || destError || reserveError) {
      toast.error(dateError || destError || reserveError);
      return;
    }
    if (form.totalBudget <= 0) {
      toast.error("Add a total budget to continue");
      return;
    }
    tripActions.startTrip(form);
    toast.success("Your trip plan is ready");
    navigate({ to: "/dashboard" });
  };

  const dest = getDestination(form.destinationId, form.customDestination);
  const destLabel =
    form.destinationId === CUSTOM_DESTINATION_ID
      ? form.customDestination.trim() || "Somewhere else"
      : dest.name;

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-2xl px-4 pt-10 pb-10 sm:pt-16">
      <header className="animate-rise">
        <p className="eyebrow">New trip</p>
        <h1 className="mt-2 text-[34px] leading-[1.1] font-semibold sm:text-[44px]">
          Plan a trip, to the dollar.
        </h1>
        <p className="mt-3 max-w-md text-[15px] text-muted-foreground">
          Pick how you're traveling, where and when. Waypoint builds the budget, keeps a reserve
          aside and lays out each day.
        </p>
      </header>

      <div className="mt-12 divide-y divide-border">
        <Section n={1} title="Trip" style={stagger(1)}>
          <TripTypePicker
            tripType={form.tripType}
            mode={form.transportMode}
            onTripType={setTripType}
            onMode={(m) => update({ transportMode: m })}
            from={form.origin.split(",")[0]?.trim() || "Home"}
            to={destLabel}
          />
        </Section>

        <Section
          n={2}
          title={
            form.tripType === "cruise"
              ? "Cruise"
              : form.tripType === "staycation"
                ? "Home base"
                : "Destination"
          }
          aside="Example places, demo prices"
          style={stagger(2)}
        >
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Destination">
            {orderedDestinations.map((d) => (
              <OptionRow
                key={d.id}
                active={form.destinationId === d.id}
                onClick={() => update({ destinationId: d.id })}
                title={d.name}
                meta={d.region}
                detail={
                  d.cruisePerNight
                    ? `from ${formatMoney(d.cruisePerNight.budget)} / person / night`
                    : d.nightly.budget === 0
                      ? "No lodging needed"
                      : `from ${formatMoney(d.nightly.budget)} / night`
                }
              />
            ))}
            <OptionRow
              active={form.destinationId === CUSTOM_DESTINATION_ID}
              onClick={() => update({ destinationId: CUSTOM_DESTINATION_ID })}
              title="Somewhere else"
              meta="Any real place"
              detail="Live weather and places"
              icon={<MapPin className="size-4" />}
            />
          </div>
          {form.destinationId === CUSTOM_DESTINATION_ID && (
            <div className="animate-pop mt-3">
              <PlaceInput
                autoFocus
                aria-label="Destination"
                placeholder={
                  form.tripType === "cruise"
                    ? "Departure port, e.g. Galveston, TX"
                    : "e.g. Chattanooga, TN"
                }
                value={form.customDestination}
                onChange={(v) => update({ customDestination: v })}
                className="h-11"
              />
              {destError && <p className="mt-1.5 text-xs text-destructive">{destError}</p>}
            </div>
          )}
          <div className="mt-5">
            <Label htmlFor="origin" className="text-[13px] font-normal text-muted-foreground">
              {form.tripType === "staycation"
                ? "Your home city — for live weather and places"
                : "Starting from (optional)"}
            </Label>
            <div className="mt-1.5">
              <PlaceInput
                id="origin"
                placeholder="City, e.g. Charlotte, NC"
                value={form.origin}
                onChange={(v) => update({ origin: v })}
                className="h-11"
              />
            </div>
          </div>
        </Section>

        <Section n={3} title="When & who" style={stagger(3)}>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  aria-label="Start date"
                  value={form.startDate}
                  min={todayIso()}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11"
                />
                <Input
                  type="date"
                  aria-label="End date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(e) => update({ endDate: e.target.value })}
                  className="h-11"
                />
              </div>
              <p
                className={cn(
                  "mt-1.5 text-xs",
                  dateError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {dateError ||
                  (shape.days === 1
                    ? "Day trip, no overnight stay"
                    : `${shape.days} days, ${shape.nights} night${shape.nights === 1 ? "" : "s"}`)}
              </p>
            </div>
            <div>
              <div className="flex h-11 items-center gap-1 rounded-lg border border-input bg-card px-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="Fewer travelers"
                  disabled={form.travelers <= 1}
                  onClick={() => update({ travelers: Math.max(1, form.travelers - 1) })}
                >
                  <Minus />
                </Button>
                <span
                  key={form.travelers}
                  className="animate-pop tabular w-16 text-center text-[15px] font-medium"
                >
                  {form.travelers} {form.travelers === 1 ? "person" : "people"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="More travelers"
                  disabled={form.travelers >= 12}
                  onClick={() => update({ travelers: Math.min(12, form.travelers + 1) })}
                >
                  <Plus />
                </Button>
              </div>
            </div>
          </div>
        </Section>

        <Section n={4} title="Style" style={stagger(4)}>
          <Segmented
            ariaLabel="Travel style"
            columns={3}
            size="lg"
            value={form.style}
            onChange={(v) => update({ style: v })}
            options={TRAVEL_STYLES.map((t) => ({ value: t.id, label: t.label, hint: t.blurb }))}
          />
          <p className="mt-5 mb-2.5 text-sm text-muted-foreground">Interests</p>
          <InterestChips value={form.interests} onToggle={toggleInterest} />
        </Section>

        <Section n={5} title="Budget" style={stagger(5)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-[13px] font-normal text-muted-foreground">Total budget</Label>
              <NumberField
                aria-label="Total budget"
                prefix="$"
                value={form.totalBudget}
                onChange={setBudget}
                step={50}
                className="mt-1.5 h-12"
                inputClassName="text-xl"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BUDGET_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setBudget(p)}
                    className={cn(
                      "tabular h-7 rounded-md border px-2 text-xs font-medium transition-colors active:scale-[0.97]",
                      form.totalBudget === p
                        ? "border-foreground text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {formatMoney(p)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setBudget(suggested)}
                  className="tabular h-7 rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-accent active:scale-[0.97]"
                >
                  Suggested {formatMoney(suggested)}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-[13px] font-normal text-muted-foreground">
                Protected reserve
              </Label>
              <NumberField
                aria-label="Emergency reserve"
                prefix="$"
                step={25}
                value={form.emergencyFund}
                className="mt-1.5 h-12"
                inputClassName="text-xl"
                onChange={(n) => {
                  reserveTouched.current = true;
                  update({ emergencyFund: n });
                }}
              />
              <p
                className={cn(
                  "mt-2 text-xs",
                  reserveError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {reserveError || "Set aside for emergencies. Never counted as spending money."}
              </p>
            </div>
          </div>
        </Section>
      </div>

      {/* Summary + action, pinned while scrolling */}
      <div className="sticky bottom-20 z-20 mt-6 md:bottom-4">
        <div className="glass flex items-center justify-between gap-4 rounded-xl border border-border p-2 pl-4 shadow-lift">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{destLabel}</p>
            <p className="tabular truncate text-xs text-muted-foreground">
              {tripTypeInfo(form.tripType).label} · {shape.days} day{shape.days > 1 ? "s" : ""} ·{" "}
              {formatMoney(Math.max(0, form.totalBudget - form.emergencyFund))} to spend
            </p>
          </div>
          <Button type="submit" variant="hero" size="lg" className="shrink-0 px-5">
            Plan trip <ArrowRight />
          </Button>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Weather is live. Sign in for real places and routes. Prices are demo estimates until you
        check live prices.
      </p>
    </form>
  );
}

function Section({
  n,
  title,
  aside,
  children,
  style,
}: {
  n: number;
  title: string;
  aside?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className="animate-rise grid gap-4 py-8 first:pt-0 sm:grid-cols-[120px_1fr] sm:gap-8"
      style={style}
    >
      <div className="flex items-baseline gap-3 sm:block">
        <p className="tabular font-mono text-xs text-muted-foreground">
          {String(n).padStart(2, "0")}
        </p>
        <h2 className="text-[15px] font-semibold sm:mt-1">{title}</h2>
        {aside && <p className="ml-auto text-xs text-muted-foreground sm:mt-1 sm:ml-0">{aside}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function OptionRow({
  active,
  onClick,
  title,
  meta,
  detail,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  meta: string;
  detail: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border p-3.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 active:scale-[0.99]",
        active
          ? "border-primary bg-card ring-3 ring-primary/12"
          : "border-border bg-card hover:border-muted-foreground/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-200",
          active ? "border-primary bg-primary" : "border-input",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "size-1.5 rounded-full bg-primary-foreground transition-transform duration-200",
            active ? "scale-100" : "scale-0",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{meta}</span>
        <span className="tabular mt-2 block text-xs text-foreground/80">{detail}</span>
      </span>
    </button>
  );
}
