import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { InterestChips, NumberField } from "@/components/app/bits";
import { Segmented, stagger } from "@/components/app/motion";
import { DestinationPicker } from "@/components/app/plan/DestinationPicker";
import { OriginField } from "@/components/app/plan/OriginField";
import { TripAssistant } from "@/components/app/plan/TripAssistant";
import { TripPreview } from "@/components/app/plan/TripPreview";
import { TripTypePicker } from "@/components/app/TripTypePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setupFromDraft, type TripDraft } from "@/lib/assistant";
import {
  calculateBudget,
  defaultEmergencyFund,
  defaultInputs,
  formatMoney,
  tripShape,
} from "@/lib/budget";
import { driveLabel, roadMiles, type GeoPoint } from "@/lib/catalog";
import {
  CUSTOM_DESTINATION_ID,
  INTERESTS,
  TRAVEL_STYLES,
  destinationFor,
  modeForTripType,
  travelPoint,
  tripTypeInfo,
  type TripType,
} from "@/lib/demo-data";
import { addDays, dateRangeError, inclusiveDays, isIsoDate, todayIso } from "@/lib/dates";
import { useHomePlace } from "@/lib/live/use-home";
import { useLocale } from "@/lib/live/use-locale";
import { formatDistance } from "@/lib/locale";
import { geocodeQuery, useHydrated } from "@/lib/live/use-live";
import {
  destinationForTripType,
  suggestedBudget,
  tripActions,
  useTrip,
  type TripSetup,
} from "@/lib/trip-store";
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
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const { trip } = useTrip();
  const home = useHomePlace();
  const { units } = useLocale();
  const [form, setForm] = useState<TripSetup>(trip.setup);
  const touched = useRef(false);
  const reserveTouched = useRef(false);

  // Pick up a saved (or personalized sample) trip until the traveler starts editing.
  useEffect(() => {
    if (!touched.current) setForm(trip.setup);
  }, [trip.setup]);

  const update = (patch: Partial<TripSetup>) => {
    touched.current = true;
    setForm((f) => ({ ...f, ...patch }));
  };

  // Where the trip starts, as a point: picked/located, else the typed city looked up.
  const originGeo = useQuery({
    ...geocodeQuery(form.origin),
    enabled: hydrated && !form.originPoint && form.origin.trim().length >= 2,
  });
  const originPoint: GeoPoint | null =
    form.originPoint ??
    (originGeo.data?.[0] ? { lat: originGeo.data[0].lat, lon: originGeo.data[0].lon } : null);
  const effective: TripSetup = { ...form, originPoint };

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

  const dest = destinationFor(effective);
  const estimate = useMemo(
    () =>
      calculateBudget(
        defaultInputs(dest, form.style, form.tripType, form.travelers, form.transportMode),
        shape,
        form.totalBudget,
        Math.min(form.emergencyFund, form.totalBudget),
      ),
    [
      dest,
      form.style,
      form.tripType,
      form.travelers,
      form.transportMode,
      form.totalBudget,
      form.emergencyFund,
      shape,
    ],
  );
  const suggested = suggestedBudget(
    effective,
    reserveTouched.current ? form.emergencyFund : undefined,
  );

  const setBudget = (totalBudget: number) =>
    update(
      reserveTouched.current
        ? { totalBudget }
        : { totalBudget, emergencyFund: defaultEmergencyFund(totalBudget) },
    );

  const setTripType = (tripType: TripType) => {
    const { destinationId } = destinationForTripType(effective, tripType);
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

  /** A typed destination's real location, for distances (best effort, never blocks). */
  const locateCustom = async (setup: TripSetup): Promise<TripSetup> => {
    if (setup.destinationId !== CUSTOM_DESTINATION_ID || setup.destinationPoint) return setup;
    try {
      const found = await Promise.race([
        queryClient.fetchQuery(geocodeQuery(setup.customDestination)),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("slow")), 2500)),
      ]);
      const p = found[0];
      return p ? { ...setup, destinationPoint: { lat: p.lat, lon: p.lon } } : setup;
    } catch {
      return setup;
    }
  };

  const start = async (setup: TripSetup) => {
    tripActions.startTrip(await locateCustom(setup));
    toast.success("Your trip plan is ready");
    navigate({ to: "/dashboard" });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Point at the field that needs fixing, not just a message.
    const problem: [string, string] | null = dateError
      ? [dateError, "Start date"]
      : destError
        ? [destError, "Destination"]
        : reserveError
          ? [reserveError, "Emergency reserve"]
          : form.totalBudget <= 0
            ? ["Add a total budget to continue", "Total budget"]
            : null;
    if (problem) {
      toast.error(problem[0]);
      const field = document.querySelector<HTMLElement>(`[aria-label="${problem[1]}"]`);
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.focus({ preventScroll: true });
      return;
    }
    void start(effective);
  };

  const fromDraft = (draft: TripDraft) => setupFromDraft(draft, effective, todayIso());

  const destLabel =
    form.destinationId === CUSTOM_DESTINATION_ID
      ? form.customDestination.trim() || "Somewhere else"
      : dest.name;
  const to = travelPoint(dest, form.destinationPoint);
  const miles = originPoint && to ? roadMiles(originPoint, to) : null;
  const distance =
    miles === null || miles < 10
      ? null
      : form.tripType === "flight"
        ? formatDistance(miles / 1.25, units)
        : form.tripType === "cruise"
          ? `${driveLabel(miles)} to the port`
          : form.tripType === "rail"
            ? `about ${formatDistance(miles, units)} by ${form.transportMode === "bus" ? "bus" : "rail"}`
            : driveLabel(miles);
  const fromLabel = form.origin.split(",")[0]?.trim() || "home";
  const approximate =
    !touched.current && home.place?.source === "approximate" && form.origin === home.place.label;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-10 sm:pt-14">
      <header className="animate-rise max-w-2xl">
        <p className="eyebrow">New trip</p>
        <h1 className="mt-2 text-[34px] leading-[1.1] font-semibold sm:text-[44px]">
          Plan a trip, to the dollar.
        </h1>
        <p className="mt-3 max-w-md text-[15px] text-muted-foreground">
          Tell Waypoint what you have in mind, or set it up step by step. It builds the budget,
          keeps a reserve aside and lays out each day.
        </p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="min-w-0">
          <div className="animate-rise" style={stagger(1)}>
            <TripAssistant
              homeCity={form.origin}
              from={originPoint}
              onBuild={(draft) => void start(fromDraft(draft))}
              onFill={(draft) => {
                const next = fromDraft(draft);
                touched.current = true;
                reserveTouched.current = false;
                setForm(next);
                toast("Filled in below — adjust anything, then plan the trip.");
                document.getElementById("plan-steps")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          </div>

          <div
            id="plan-steps"
            className="mt-10 flex items-center gap-3 text-xs text-muted-foreground"
          >
            <span className="h-px flex-1 bg-border" />
            or set it up step by step
            <span className="h-px flex-1 bg-border" />
          </div>

          <form id="plan-form" onSubmit={submit} noValidate className="mt-8 divide-y divide-border">
            <Section n={1} title="Trip" style={stagger(2)}>
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
              style={stagger(3)}
            >
              <OriginField
                id="origin"
                value={form.origin}
                approximate={approximate}
                label={
                  form.tripType === "staycation"
                    ? "Your home city — for live weather and places"
                    : "Starting from"
                }
                onChange={(origin, point) => update({ origin, originPoint: point })}
              />
              <div className="mt-6">
                <DestinationPicker
                  tripType={form.tripType}
                  interests={form.interests}
                  destinationId={form.destinationId}
                  customDestination={form.customDestination}
                  from={originPoint}
                  fromLabel={fromLabel}
                  error={destError}
                  onPick={(destinationId) => update({ destinationId })}
                  onCustom={(customDestination, place) =>
                    update({
                      customDestination,
                      destinationPoint: place ? { lat: place.lat, lon: place.lon } : null,
                    })
                  }
                />
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
                  <Label className="text-[13px] font-normal text-muted-foreground">
                    Total budget
                  </Label>
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
          </form>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20 animate-rise" style={stagger(2)}>
            <TripPreview
              form={effective}
              dest={dest}
              destLabel={destLabel}
              shape={shape}
              totals={estimate}
              distance={distance}
              formId="plan-form"
            />
          </div>
        </aside>
      </div>

      {/* Phones and tablets: summary + action pinned while scrolling */}
      <div className="sticky bottom-20 z-20 mt-6 md:bottom-4 lg:hidden">
        <div className="glass flex items-center justify-between gap-4 rounded-xl border border-border p-2 pl-4 shadow-lift">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{destLabel}</p>
            <p className="tabular truncate text-xs text-muted-foreground">
              {tripTypeInfo(form.tripType).label} ·{" "}
              {shape.days === 1 ? "day trip" : `${shape.days} days`}
              {distance ? ` · ${distance}` : ""} · about {formatMoney(estimate.planned)}
            </p>
          </div>
          <Button type="submit" form="plan-form" variant="hero" size="lg" className="shrink-0 px-5">
            Plan trip <ArrowRight />
          </Button>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Weather and places are live. Prices are demo estimates until you check live prices.
      </p>
    </div>
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
