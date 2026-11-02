import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Minus, Plus, Sparkles, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import heroImg from "@/assets/hero-roadtrip.jpg";
import { DemoBadge, NumberField } from "@/components/app/bits";
import { PlaceInput } from "@/components/app/PlaceInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateBudget, defaultEmergencyFund, defaultInputs, formatMoney, tripShape } from "@/lib/budget";
import {
  CUSTOM_DESTINATION_ID,
  DESTINATIONS,
  INTERESTS,
  TRANSPORT_MODES,
  TRAVEL_STYLES,
  TRIP_TYPES,
  getDestination,
  type TripType,
} from "@/lib/demo-data";
import { tripActions, useTrip, type TripSetup } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Waypoint — Plan your next trip on any budget" },
      {
        name: "description",
        content: "Pick a destination, dates, travelers and budget. Waypoint builds a smart budget and itinerary for road trips, getaways and staycations.",
      },
      { property: "og:title", content: "Waypoint — Plan your next trip on any budget" },
      {
        property: "og:description",
        content: "Smart budgets, a protected emergency fund and personalized itineraries for road trips, getaways and staycations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Welcome,
});

const MAX_DAYS = 14;
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
    !form.startDate || !form.endDate
      ? "Choose your dates"
      : form.endDate < form.startDate
        ? "End date must be after the start date"
        : shape.days > MAX_DAYS
          ? `Trips up to ${MAX_DAYS} days for now`
          : "";
  const reserveError = form.emergencyFund > form.totalBudget ? "Reserve can't be more than your total budget" : "";
  const destError =
    form.destinationId === CUSTOM_DESTINATION_ID && !form.customDestination.trim() ? "Type a destination" : "";

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
  }, [form.destinationId, form.customDestination, form.style, form.tripType, form.travelers, form.transportMode, form.emergencyFund, shape]);

  const setBudget = (totalBudget: number) =>
    update(reserveTouched.current ? { totalBudget } : { totalBudget, emergencyFund: defaultEmergencyFund(totalBudget) });

  const orderedDestinations = useMemo(
    () =>
      [...DESTINATIONS].sort(
        (a, b) => Number(b.bestFor.includes(form.tripType)) - Number(a.bestFor.includes(form.tripType)),
      ),
    [form.tripType],
  );

  const setTripType = (tripType: TripType) => {
    const current = DESTINATIONS.find((d) => d.id === form.destinationId);
    let destinationId = form.destinationId;
    if (tripType === "staycation" && form.destinationId !== CUSTOM_DESTINATION_ID) destinationId = "hometown";
    else if (current && !current.bestFor.includes(tripType)) {
      destinationId = DESTINATIONS.find((d) => d.bestFor.includes(tripType))?.id ?? destinationId;
    }
    update({ tripType, destinationId });
  };

  const toggleInterest = (id: (typeof INTERESTS)[number]["id"]) =>
    update({
      interests: form.interests.includes(id) ? form.interests.filter((i) => i !== id) : [...form.interests, id],
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

  return (
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[1fr_1.15fr] lg:gap-10 lg:px-4 lg:pt-8">
      {/* Hero */}
      <section className="relative lg:sticky lg:top-22 lg:h-[calc(100vh-7rem)]">
        <div className="relative h-[46vh] min-h-[320px] overflow-hidden lg:h-full lg:rounded-4xl lg:shadow-lift">
          <img
            src={heroImg}
            alt="Vintage convertible driving a coastal highway at sunset"
            width={1280}
            height={1600}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-hero-fade" />
          <div className="absolute inset-x-0 bottom-0 p-6 pb-14 lg:p-10">
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-on-image/20 px-3 py-1 text-xs font-semibold text-on-image backdrop-blur">
              <Sparkles className="size-3.5" /> AI-powered trip planning
            </p>
            <h1 className="font-display text-4xl leading-[1.05] font-semibold text-on-image sm:text-5xl lg:text-6xl">
              Big adventures,
              <br />
              <em className="font-medium">smart budgets.</em>
            </h1>
            <p className="mt-3 max-w-sm text-sm text-on-image/85 sm:text-base">
              Road trips, getaways and staycations — planned to the dollar, with a safety net built in.
            </p>
          </div>
        </div>
      </section>

      {/* Form */}
      <form
        onSubmit={submit}
        className="animate-rise relative -mt-8 space-y-8 rounded-t-4xl bg-background px-4 pt-7 pb-6 sm:px-6 lg:mt-0 lg:rounded-none lg:px-0 lg:pt-0"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Plan a trip</p>
            <h2 className="font-display text-3xl font-semibold">Your adventure starts here.</h2>
          </div>
          <DemoBadge />
        </div>

        {/* Destination */}
        <Field label="Where are you going?" hint="Example places with demo prices">
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
            {orderedDestinations.map((d) => {
              const active = form.destinationId === d.id;
              return (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => update({ destinationId: d.id })}
                  className={cn(
                    "relative w-56 shrink-0 snap-start rounded-2xl border p-4 text-left transition-all sm:w-auto",
                    active ? "border-primary bg-card shadow-lift ring-2 ring-primary/20" : "border-border bg-card/60 hover:bg-card",
                  )}
                >
                  {active && (
                    <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                  )}
                  <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{d.region}</p>
                  <p className="mt-0.5 font-display text-lg leading-tight font-semibold">{d.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{d.tagline}</p>
                  <p className="tabular mt-2 text-xs font-semibold text-primary">
                    {d.nightly.budget === 0 ? "No lodging needed" : `from ${formatMoney(d.nightly.budget)}/night`}
                  </p>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => update({ destinationId: CUSTOM_DESTINATION_ID })}
              className={cn(
                "w-56 shrink-0 snap-start rounded-2xl border border-dashed p-4 text-left transition-all sm:w-auto",
                form.destinationId === CUSTOM_DESTINATION_ID ? "border-primary bg-card ring-2 ring-primary/20" : "border-input bg-transparent hover:bg-card/60",
              )}
            >
              <MapPin className="size-5 text-sunset" />
              <p className="mt-1 font-display text-lg font-semibold">Somewhere else</p>
              <p className="text-xs text-muted-foreground">Search any real place — live weather & places, demo prices.</p>
            </button>
          </div>
          {form.destinationId === CUSTOM_DESTINATION_ID && (
            <div className="mt-3">
              <PlaceInput
                autoFocus
                aria-label="Destination"
                placeholder="e.g. Chattanooga, TN"
                value={form.customDestination}
                onChange={(v) => update({ customDestination: v })}
                className="h-11 rounded-xl bg-card"
              />
            </div>
          )}
          <div className="mt-3">
            <Label htmlFor="origin" className="text-xs text-muted-foreground">
              Starting from (optional)
            </Label>
            <div className="mt-1">
              <PlaceInput
                id="origin"
                placeholder={form.tripType === "staycation" ? "Your city — we'll plan around it" : "Your city"}
                value={form.origin}
                onChange={(v) => update({ origin: v })}
                className="h-11 rounded-xl bg-card"
              />
            </div>
          </div>
        </Field>

        {/* Dates + travelers */}
        <div className="grid gap-6 sm:grid-cols-[1.4fr_1fr]">
          <Field label="When?" error={dateError}>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                aria-label="Start date"
                value={form.startDate}
                onChange={(e) => update({ startDate: e.target.value })}
                className="h-11 rounded-xl bg-card"
              />
              <Input
                type="date"
                aria-label="End date"
                value={form.endDate}
                min={form.startDate}
                onChange={(e) => update({ endDate: e.target.value })}
                className="h-11 rounded-xl bg-card"
              />
            </div>
            {!dateError && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {shape.days} day{shape.days > 1 ? "s" : ""} · {shape.nights} night{shape.nights === 1 ? "" : "s"}
              </p>
            )}
          </Field>
          <Field label="Who's coming?">
            <div className="flex h-11 items-center justify-between rounded-xl border border-input bg-card px-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Fewer travelers"
                onClick={() => update({ travelers: Math.max(1, form.travelers - 1) })}
              >
                <Minus />
              </Button>
              <span className="tabular text-base font-bold">{form.travelers}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="More travelers"
                onClick={() => update({ travelers: Math.min(12, form.travelers + 1) })}
              >
                <Plus />
              </Button>
            </div>
          </Field>
        </div>

        {/* Trip type */}
        <Field label="What kind of trip?">
          <div className="grid grid-cols-3 gap-2">
            {TRIP_TYPES.map((t) => (
              <ChoiceCard key={t.id} active={form.tripType === t.id} onClick={() => setTripType(t.id)}>
                <span className="text-sm font-bold">{t.label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">{t.blurb}</span>
              </ChoiceCard>
            ))}
          </div>
        </Field>

        {/* Transportation */}
        <Field label="How are you getting there?">
          <div className="flex flex-wrap gap-2">
            {TRANSPORT_MODES.map((m) => {
              const active = form.transportMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ transportMode: m.id })}
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-sm font-semibold transition-all",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Style */}
        <Field label="Travel style">
          <div className="grid grid-cols-3 gap-2">
            {TRAVEL_STYLES.map((s) => (
              <ChoiceCard key={s.id} active={form.style === s.id} onClick={() => update({ style: s.id })} tone={s.id === "luxury" ? "gold" : "default"}>
                <span className="text-sm font-bold">{s.label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">{s.blurb}</span>
              </ChoiceCard>
            ))}
          </div>
        </Field>

        {/* Interests */}
        <Field label="What do you love?" hint="Pick a few">
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => {
              const active = form.interests.includes(i.id);
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleInterest(i.id)}
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-sm font-semibold transition-all",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40",
                  )}
                >
                  {i.label}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Budget */}
        <Field label="What's your budget?" hint="Your reserve comes out of this">
          <NumberField
            aria-label="Total budget"
            prefix="$"
            value={form.totalBudget}
            onChange={setBudget}
            step={50}
            className="h-14 rounded-2xl"
            inputClassName="text-2xl font-display"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {BUDGET_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setBudget(p)}
                className={cn(
                  "tabular rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  form.totalBudget === p ? "border-primary bg-secondary" : "border-border bg-card hover:bg-secondary",
                )}
              >
                {formatMoney(p)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-sunset-soft px-4 py-3">
            <p className="text-sm">
              <span className="text-muted-foreground">Suggested for this trip</span>{" "}
              <span className="tabular font-bold">{formatMoney(suggested)}</span>
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setBudget(suggested)}>
              Use
            </Button>
          </div>
        </Field>

        <Field label="How much should stay protected?" hint="A little extra set aside for peace of mind" error={reserveError}>
          <NumberField
            aria-label="Emergency reserve"
            prefix="$"
            step={25}
            value={form.emergencyFund}
            onChange={(n) => {
              reserveTouched.current = true;
              update({ emergencyFund: n });
            }}
          />
          <p className="tabular mt-1.5 text-xs text-muted-foreground">
            That leaves {formatMoney(Math.max(0, form.totalBudget - form.emergencyFund))} to spend on the trip itself.
          </p>
        </Field>

        <Button type="submit" variant="hero" size="lg" className="w-full">
          Plan my trip <ArrowRight />
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Weather is live. Sign in for real places and routes. Prices are demo estimates until you check live prices. No
          bookings or payments.
        </p>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <legend className="text-sm font-bold text-foreground">{label}</legend>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && <p className="mt-1.5 text-xs font-semibold text-destructive">{error}</p>}
    </fieldset>
  );
}

function ChoiceCard({
  active,
  onClick,
  children,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "gold";
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-2xl border p-3 text-left transition-all",
        active
          ? tone === "gold"
            ? "border-gold bg-gold-soft shadow-soft ring-2 ring-gold/30"
            : "border-primary bg-card shadow-soft ring-2 ring-primary/20"
          : "border-border bg-card/60 hover:bg-card",
      )}
    >
      {children}
    </button>
  );
}
