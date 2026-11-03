import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Minus,
  Plus,
  Route as RouteIcon,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { InterestChips, NumberField } from "@/components/app/bits";
import { stagger } from "@/components/app/motion";
import { RouteMap } from "@/components/app/Illustrations";
import { DestinationPicker } from "@/components/app/plan/DestinationPicker";
import { OriginField } from "@/components/app/plan/OriginField";
import { StylePicker } from "@/components/app/plan/StylePicker";
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
import { destinationForNewStart } from "@/lib/recommend";
import {
  CUSTOM_DESTINATION_ID,
  INTERESTS,
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
import { geocodeQuery, useDebouncedValue, useHydrated } from "@/lib/live/use-live";
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
      { title: "Waypoint | Plan your next trip on any budget" },
      {
        name: "description",
        content:
          "Pick a destination, dates, travelers and budget. Waypoint builds a smart budget and itinerary for road trips, getaways and staycations.",
      },
      { property: "og:title", content: "Waypoint | Plan your next trip on any budget" },
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
  // Looked up once typing pauses, so the destination doesn't jump around mid-word.
  const typedOrigin = useDebouncedValue(form.origin);
  const originGeo = useQuery({
    ...geocodeQuery(typedOrigin),
    enabled: hydrated && !form.originPoint && typedOrigin.trim().length >= 2,
  });
  const originPoint: GeoPoint | null =
    form.originPoint ??
    (originGeo.data?.[0] ? { lat: originGeo.data[0].lat, lon: originGeo.data[0].lon } : null);
  const effective: TripSetup = { ...form, originPoint };
  const typedMatch = form.originPoint
    ? null
    : originGeo.data
      ? (originGeo.data[0]?.label ?? "none")
      : null;

  // A new start point moves the destination to one that suits it, until the traveler picks one.
  const destPicked = useRef(false);
  const originKey = originPoint
    ? `${originPoint.lat.toFixed(2)},${originPoint.lon.toFixed(2)}`
    : "";
  const lastOrigin = useRef(originKey);
  useEffect(() => {
    if (originKey === lastOrigin.current) return;
    lastOrigin.current = originKey;
    if (!originPoint || !touched.current || destPicked.current) return;
    const next = destinationForNewStart({
      destinationId: form.destinationId,
      tripType: form.tripType,
      interests: form.interests,
      from: originPoint,
    });
    if (next) setForm((f) => ({ ...f, destinationId: next }));
    // Only the start point should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originKey]);

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
    form.emergencyFund > form.totalBudget
      ? "The emergency fund can't be more than your total budget"
      : "";
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
          ? [reserveError, "Emergency fund"]
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
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-10 sm:pt-10">
      <header className="animate-rise grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_260px] lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div>
          <p className="eyebrow text-primary">New trip</p>
          <h1 className="mt-2 text-[30px] leading-[1.1] font-semibold sm:text-[44px]">
            Plan a trip, to the dollar.
          </h1>
          <p className="mt-3 max-w-md text-[15px] text-muted-foreground">
            Describe your trip or fill in the steps below. Waypoint builds the budget, keeps an
            emergency fund aside and plans each day.
          </p>
        </div>
        <RouteMap className="hidden sm:block" />
      </header>

      <div className="mt-6 grid gap-8 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="min-w-0">
          <div className="animate-rise" style={stagger(1)}>
            <TripAssistant
              homeCity={form.origin}
              from={originPoint}
              onBuild={(draft) => void start(fromDraft(draft))}
              onFill={(draft) => {
                const next = fromDraft(draft);
                touched.current = true;
                destPicked.current = true;
                reserveTouched.current = false;
                setForm(next);
                toast("Filled in below. Adjust anything, then plan the trip.");
                document.getElementById("plan-steps")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          </div>

          <h2 id="plan-steps" className="mt-10 scroll-mt-24 text-lg font-semibold">
            Plan it yourself
          </h2>

          <form id="plan-form" onSubmit={submit} noValidate className="mt-2 divide-y divide-border">
            <Section icon={RouteIcon} title="Trip" style={stagger(2)}>
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
              icon={MapPin}
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
                found={typedMatch}
                label={form.tripType === "staycation" ? "Your home city" : "Starting from"}
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
                  onPick={(destinationId) => {
                    destPicked.current = true;
                    update({ destinationId });
                  }}
                  onCustom={(customDestination, place) => {
                    destPicked.current = true;
                    update({
                      customDestination,
                      destinationPoint: place ? { lat: place.lat, lon: place.lon } : null,
                    });
                  }}
                />
              </div>
            </Section>

            <Section icon={CalendarDays} title="When & who" style={stagger(3)}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-4">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="mb-1.5 text-[13px] text-muted-foreground">Dates</p>
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
                <div className="flex w-full items-center justify-between gap-3 sm:block sm:w-auto">
                  <p className="text-[13px] text-muted-foreground sm:mb-1.5">Travelers</p>
                  <div className="flex h-11 items-center rounded-lg border border-input bg-card">
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
                      aria-live="polite"
                      aria-label={`${form.travelers} ${form.travelers === 1 ? "traveler" : "travelers"}`}
                      className="animate-pop tabular w-7 text-center text-[15px] font-semibold"
                    >
                      {form.travelers}
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

            <Section icon={Sparkles} title="Style" style={stagger(4)}>
              <StylePicker value={form.style} onChange={(style) => update({ style })} />
              <p className="mt-5 mb-2.5 text-sm text-muted-foreground">Interests</p>
              <InterestChips value={form.interests} onToggle={toggleInterest} />
            </Section>

            <Section icon={Wallet} title="Budget" style={stagger(5)}>
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
                    Emergency fund
                  </Label>
                  <NumberField
                    aria-label="Emergency fund"
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
                  {reserveError && <p className="mt-2 text-xs text-destructive">{reserveError}</p>}
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
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-6 md:bottom-4 lg:hidden">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-2 pl-4 shadow-lift">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{destLabel}</p>
            <p className="tabular truncate text-xs text-muted-foreground">
              {tripTypeInfo(form.tripType).label} ·{" "}
              {shape.days === 1 ? "day trip" : `${shape.days} days`}
              {distance ? ` · ${distance}` : ""} · about {formatMoney(estimate.planned)}
            </p>
          </div>
          <Button type="submit" form="plan-form" variant="go" size="lg" className="shrink-0 px-5">
            Plan trip <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  aside,
  children,
  style,
}: {
  icon: LucideIcon;
  title: string;
  aside?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className="animate-rise grid gap-4 py-7 sm:grid-cols-[132px_1fr] sm:gap-8"
      style={style}
    >
      <div className="flex items-center gap-2.5 sm:block">
        <span className="grid size-8 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--primary)_9%,transparent)] text-primary">
          <Icon className="size-4" />
        </span>
        <h2 className="text-[15px] font-semibold sm:mt-2">{title}</h2>
        {aside && <p className="ml-auto text-xs text-muted-foreground sm:mt-1 sm:ml-0">{aside}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
