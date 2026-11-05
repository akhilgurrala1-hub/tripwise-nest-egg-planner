import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { InterestChips, NumberField } from "@/components/app/bits";
import { stagger } from "@/components/app/motion";
import { DestinationPicker } from "@/components/app/plan/DestinationPicker";
import { CoveragePicker } from "@/components/app/plan/CoveragePicker";
import { OriginField } from "@/components/app/plan/OriginField";
import { StylePicker } from "@/components/app/plan/StylePicker";
import { Inspiration } from "@/components/app/plan/Inspiration";
import { formatDateRange } from "@/components/app/TripHeader";
import { TripAssistant } from "@/components/app/plan/TripAssistant";
import { TripPreview } from "@/components/app/plan/TripPreview";
import { TripTypePicker } from "@/components/app/TripTypePicker";
import { CabinPicker } from "@/components/app/plan/CabinPicker";
import { CitiesEditor } from "@/components/app/plan/CitiesEditor";
import { citySchedule, routeLabel } from "@/lib/multi-city";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setupFromDraft, type TripDraft } from "@/lib/assistant";
import {
  calculateBudget,
  defaultEmergencyFund,
  applyCoverage,
  defaultInputs,
  MAX_TRAVELERS,
  formatMoney,
  tripShape,
} from "@/lib/budget";
import { driveLabel, roadMiles, type GeoPoint } from "@/lib/catalog";
import { destinationForNewStart } from "@/lib/recommend";
import {
  CUSTOM_DESTINATION_ID,
  INTERESTS,
  destinationFor,
  getDestination,
  modeForTripType,
  travelPoint,
  tripTypeInfo,
  type TripType,
} from "@/lib/demo-data";
import { addDays, dateRangeError, inclusiveDays, isIsoDate, todayIso } from "@/lib/dates";
import { markJustPlanned } from "@/lib/just-planned";
import { useHomePlace } from "@/lib/live/use-home";
import { useLocale } from "@/lib/live/use-locale";
import { formatDistance } from "@/lib/locale";
import { geocodeQuery, useDebouncedValue, useHydrated } from "@/lib/live/use-live";
import {
  currentTrip,
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

function Welcome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const { trip, place: tripPlace } = useTrip();
  const home = useHomePlace();
  const { units } = useLocale();
  const [form, setForm] = useState<TripSetup>(trip.setup);
  const touched = useRef(false);
  const reserveTouched = useRef(false);
  // Waypoint picks the budget from the trip's costs until the traveler types their own.
  const [budgetOwn, setBudgetOwn] = useState(!trip.isSample && !trip.setup.budgetAuto);
  // Phones: the pinned "Plan trip" bar waits until the manual steps, so the first screen
  // has one thing to do (describe the trip) instead of two.
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const el = document.getElementById("plan-steps");
    if (!el || typeof IntersectionObserver === "undefined") {
      setShowBar(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => setShowBar(!!e && (e.isIntersecting || e.boundingClientRect.top < 0)),
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Pick up a saved (or personalized sample) trip until the traveler starts editing.
  useEffect(() => {
    if (touched.current) return;
    setForm(trip.setup);
    setBudgetOwn(!trip.isSample && !trip.setup.budgetAuto);
  }, [trip.setup, trip.isSample]);

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
  const located: TripSetup = { ...form, originPoint };
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
  const suggested = suggestedBudget(
    located,
    reserveTouched.current ? form.emergencyFund : undefined,
  );
  // The budget the trip starts with: the traveler's own, or the one that covers its costs.
  const totalBudget = budgetOwn ? form.totalBudget : suggested;
  const emergencyFund =
    budgetOwn || reserveTouched.current ? form.emergencyFund : defaultEmergencyFund(totalBudget);
  const effective: TripSetup = { ...located, totalBudget, emergencyFund, budgetAuto: !budgetOwn };
  const reserveError =
    emergencyFund > totalBudget ? "The emergency fund can't be more than your total budget" : "";
  const destError =
    form.destinationId === CUSTOM_DESTINATION_ID && !form.customDestination.trim()
      ? "Type a destination"
      : "";

  const dest = destinationFor(located);
  const estimateInputs = useMemo(
    () =>
      applyCoverage(
        defaultInputs(dest, form.style, form.tripType, form.travelers, form.transportMode),
        form.coverage,
      ),
    [dest, form.style, form.tripType, form.travelers, form.transportMode, form.coverage],
  );
  const estimate = useMemo(
    () => calculateBudget(estimateInputs, shape, totalBudget, Math.min(emergencyFund, totalBudget)),
    [estimateInputs, totalBudget, emergencyFund, shape],
  );

  const setBudget = (next: number) => {
    setBudgetOwn(true);
    update(
      reserveTouched.current
        ? { totalBudget: next }
        : { totalBudget: next, emergencyFund: defaultEmergencyFund(next) },
    );
  };

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

  /** Where a typed place is, for distances and fares (best effort, never blocks). */
  const locate = async (name: string): Promise<GeoPoint | null> => {
    try {
      const found = await Promise.race([
        queryClient.fetchQuery(geocodeQuery(name)),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("slow")), 2500)),
      ]);
      return found[0] ? { lat: found[0].lat, lon: found[0].lon } : null;
    } catch {
      return null;
    }
  };

  /** Look up a typed destination and every other city, so costs use real distances. */
  const locateAll = async (setup: TripSetup): Promise<TripSetup> => {
    const [destinationPoint, cities] = await Promise.all([
      setup.destinationId === CUSTOM_DESTINATION_ID && !setup.destinationPoint
        ? locate(setup.customDestination)
        : Promise.resolve(setup.destinationPoint ?? null),
      Promise.all(
        (setup.cities ?? []).map(async (c) => ({
          ...c,
          point: c.point ?? (c.name.trim() ? await locate(c.name) : null),
        })),
      ),
    ]);
    return { ...setup, destinationPoint, cities: cities.filter((c) => c.name.trim()) };
  };

  const start = async (setup: TripSetup) => {
    // The budget is fitted after the places are found, so real distances never push it negative.
    const note = tripActions.startTrip(await locateAll(setup));
    markJustPlanned(currentTrip().id);
    if (note) toast.message("Budget set to cover your trip", { description: note, duration: 9000 });
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
          : totalBudget <= 0
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
  // A multi-city trip is shown as its route ("Rome → Florence → Venice").
  const planLegs = citySchedule(shape.nights, { name: destLabel, point: null }, form.cities);
  const routeText = planLegs.length > 1 ? routeLabel(planLegs) : destLabel;
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
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="min-w-0">
          {/* A trip in progress: one tap back to it (unfinished things pull people back). */}
          {!trip.isSample && (
            <Link
              to="/dashboard"
              className="group animate-rise mb-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-primary"
            >
              <span className="min-w-0">
                <span className="eyebrow block">Pick up where you left off</span>
                <span className="mt-0.5 block truncate font-medium">
                  {tripPlace} · {formatDateRange(trip.setup.startDate, trip.setup.endDate)}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
          {/* One question first: everything else on the page is optional detail. */}
          <header className="animate-rise">
            <p className="eyebrow">New trip</p>
            <h1 className="title-display mt-3 text-[44px] sm:text-[64px] lg:text-[76px]">
              Where to <em className="text-primary">next?</em>
            </h1>
            <p className="mt-3 max-w-lg text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">
              Say it however you like. Waypoint works out the budget to the dollar, plans the days
              and lists what to book.
            </p>
          </header>
          <div className="animate-rise mt-6" style={stagger(1)}>
            <TripAssistant
              variant="hero"
              homeCity={form.origin}
              from={originPoint}
              onBuild={(draft) => void start(fromDraft(draft))}
              onFill={(draft) => {
                const next = fromDraft(draft);
                touched.current = true;
                destPicked.current = true;
                reserveTouched.current = false;
                setBudgetOwn(!next.budgetAuto);
                setForm(next);
                toast("Filled in below. Adjust anything, then plan the trip.");
                document.getElementById("plan-steps")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          </div>

          <Inspiration
            setup={effective}
            from={originPoint}
            fromLabel={fromLabel === "home" ? "home" : fromLabel}
            nights={shape.nights}
            onPick={(destinationId, tripType) => {
              destPicked.current = true;
              touched.current = true;
              update({
                tripType,
                destinationId,
                customDestination: "",
                destinationPoint: null,
                cities: [],
                transportMode: modeForTripType(tripType, form.transportMode),
              });
              toast(
                `${getDestination(destinationId).name} it is. Adjust anything below, then plan the trip.`,
                {
                  action: {
                    label: "See the plan",
                    onClick: () =>
                      document.getElementById("plan-steps")?.scrollIntoView({ behavior: "smooth" }),
                  },
                },
              );
            }}
          />

          <h2
            id="plan-steps"
            className="title-display mt-14 scroll-mt-24 text-[32px] sm:text-[36px]"
          >
            Or plan it yourself
          </h2>

          <form id="plan-form" onSubmit={submit} noValidate className="mt-2 divide-y divide-border">
            <Section step="01" title="Trip" style={stagger(2)}>
              <TripTypePicker
                tripType={form.tripType}
                mode={form.transportMode}
                onTripType={setTripType}
                onMode={(m) => update({ transportMode: m })}
                from={form.origin.split(",")[0]?.trim() || "Home"}
                to={destLabel}
              />
              {form.transportMode === "flight" && (
                <CabinPicker value={form.cabin} onChange={(cabin) => update({ cabin })} />
              )}
            </Section>

            <Section
              step="02"
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
              {form.tripType !== "cruise" && form.tripType !== "staycation" && (
                <CitiesEditor
                  mainName={destLabel}
                  totalNights={shape.nights}
                  cities={form.cities ?? []}
                  onChange={(cities) => update({ cities })}
                />
              )}
            </Section>

            <Section step="03" title="When & who" style={stagger(3)}>
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
                      disabled={form.travelers >= MAX_TRAVELERS}
                      onClick={() =>
                        update({ travelers: Math.min(MAX_TRAVELERS, form.travelers + 1) })
                      }
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>
              </div>
            </Section>

            <Section step="04" title="Style" style={stagger(4)}>
              <StylePicker value={form.style} onChange={(style) => update({ style })} />
              <p className="mt-5 mb-2.5 text-sm text-muted-foreground">Interests</p>
              <InterestChips value={form.interests} onToggle={toggleInterest} />
            </Section>

            <Section step="05" title="What you pay for" style={stagger(5)}>
              <CoveragePicker
                value={form.coverage}
                mode={form.transportMode}
                onChange={(coverage) => update({ coverage })}
              />
            </Section>

            <Section step="06" title="Budget" style={stagger(5)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-[13px] font-normal text-muted-foreground">
                    Total budget
                  </Label>
                  <NumberField
                    aria-label="Total budget"
                    prefix="$"
                    value={totalBudget}
                    onChange={setBudget}
                    step={50}
                    className="mt-1.5 h-12"
                    inputClassName="text-xl"
                  />
                  {!budgetOwn ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Set from this trip's costs, about {formatMoney(estimate.planned)}, plus an
                      emergency fund. It follows the trip as you change it. Type your own anytime.
                    </p>
                  ) : estimate.planned + emergencyFund > totalBudget ? (
                    <p className="mt-2 text-xs text-destructive">
                      Less than this trip is likely to cost (about {formatMoney(estimate.planned)}).
                      It'll be raised to cover the trip.{" "}
                      <button
                        type="button"
                        onClick={() => setBudgetOwn(false)}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Use {formatMoney(suggested)}
                      </button>
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Your budget. This trip is likely to cost about {formatMoney(estimate.planned)}
                      .{" "}
                      <button
                        type="button"
                        onClick={() => setBudgetOwn(false)}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Use the suggested {formatMoney(suggested)}
                      </button>
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-[13px] font-normal text-muted-foreground">
                    Emergency fund
                  </Label>
                  <NumberField
                    aria-label="Emergency fund"
                    prefix="$"
                    step={25}
                    value={emergencyFund}
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
              destLabel={routeText}
              shape={shape}
              totals={estimate}
              inputs={estimateInputs}
              distance={distance}
              formId="plan-form"
            />
          </div>
        </aside>
      </div>

      {/* Phones and tablets: summary + action pinned while scrolling */}
      <div
        inert={!showBar}
        className={cn(
          "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-6 transition-[opacity,translate] duration-300 ease-[var(--ease-out-quint)] md:bottom-4 lg:hidden",
          showBar ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-2 pl-4 shadow-lift">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{routeText}</p>
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
  step,
  title,
  aside,
  children,
  style,
}: {
  /** "01", "02"...: the order the trip comes together in */
  step: string;
  title: string;
  aside?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className="animate-rise grid gap-4 py-9 sm:grid-cols-[140px_1fr] sm:gap-8"
      style={style}
    >
      <div className="flex items-baseline gap-2.5 sm:block">
        <span aria-hidden className="font-mono text-[12px] text-coral-text">
          {step}
        </span>
        <h2 className="text-[17px] font-semibold sm:mt-1.5">{title}</h2>
        {aside && <p className="ml-auto text-xs text-muted-foreground sm:mt-1 sm:ml-0">{aside}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
