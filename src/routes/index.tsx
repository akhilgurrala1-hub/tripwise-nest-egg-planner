import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";

import { InterestChips, NumberField, FieldError } from "@/components/app/bits";
import { stagger } from "@/components/app/motion";
import { DestinationPicker } from "@/components/app/plan/DestinationPicker";
import { CoveragePicker } from "@/components/app/plan/CoveragePicker";
import { OriginField } from "@/components/app/plan/OriginField";
import { StylePicker } from "@/components/app/plan/StylePicker";
import { Inspiration } from "@/components/app/plan/Inspiration";
import { Faq, HowItWorks } from "@/components/app/landing";
import { StopsPicker } from "@/components/app/plan/StopsPicker";
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
import { setPlanning, usePlanning } from "@/lib/planning-state";
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
          "Describe a trip in a sentence. Waypoint estimates the cost, plans each day and lists what to book, for road trips, flights, cruises, trains and staycations.",
      },
      { property: "og:title", content: "Waypoint | Plan your next trip on any budget" },
      {
        property: "og:description",
        content:
          "A budget worked out line by line, with an emergency fund set aside, a day-by-day plan and a list of what to book.",
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
  const { trip, place: tripPlace, totals } = useTrip();
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
  // Style, interests, coverage and the emergency fund wait under "More options".
  const [moreOptions, setMoreOptions] = useState(false);
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

  const planning = usePlanning();
  const start = async (setup: TripSetup) => {
    if (planning) return;
    setPlanning(true);
    try {
      // The budget is fitted after the places are found, so real distances never push it negative.
      const note = tripActions.startTrip(await locateAll(setup));
      markJustPlanned(currentTrip().id);
      if (note)
        toast.message("This trip is over your budget", { description: note, duration: 12000 });
      navigate({ to: "/dashboard" });
    } finally {
      setPlanning(false);
    }
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

  const pickIdea = (destinationId: string, tripType: TripType) => {
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
  };

  return (
    <div>
      {/* A trip in progress: apple.com's ribbon, one tap back to it. */}
      {!trip.isSample && (
        <div className="bg-background py-4 text-center text-footnote print:hidden">
          <Link to="/dashboard" className="link-chevron">
            Pick up where you left off: {tripPlace} ·{" "}
            {formatDateRange(trip.setup.startDate, trip.setup.endDate)}
          </Link>
        </div>
      )}
      {/* The hero: the planner comes first. Say the trip in plain words, or fill it in below. */}
      <section>
        <div className="page-container pt-10 pb-12 sm:pt-16 sm:pb-16">
          <div className="max-w-3xl">
            <h1 className="title-display text-display">Plan a trip around your budget</h1>
            <p className="mt-6 max-w-xl text-body text-foreground/80">
              Say where and when in your own words. Waypoint estimates the cost, plans each day and
              lists what to book.
            </p>
            <div className="mt-8 max-w-2xl">
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
          </div>
        </div>
      </section>
      <section className="border-t border-separator py-16 sm:py-20">
        <div className="page-container">
          {/* Ideas get the full width, like a travel app's rail; the form and its live preview follow. */}
          <Inspiration
            setup={effective}
            from={originPoint}
            fromLabel={fromLabel === "home" ? "home" : fromLabel}
            nights={shape.nights}
            onPick={pickIdea}
          />
        </div>
      </section>

      <div className="page-container border-t border-separator py-16 sm:py-20">
        <div className="layout-main-aside lg:gap-y-8">
          <div className="min-w-0">
            <h2 id="plan-steps" className="title-display scroll-mt-32 text-title-1">
              Plan your trip
            </h2>

            <form
              id="plan-form"
              onSubmit={submit}
              noValidate
              className="mt-2 divide-y divide-border"
            >
              <Section title="Trip" style={stagger(2)}>
                <TripTypePicker
                  tripType={form.tripType}
                  mode={form.transportMode}
                  onTripType={setTripType}
                  onMode={(m) => update({ transportMode: m })}
                />
                {form.transportMode === "flight" && (
                  <>
                    <CabinPicker value={form.cabin} onChange={(cabin) => update({ cabin })} />
                    <StopsPicker
                      value={form.flightStops}
                      onChange={(flightStops) => update({ flightStops })}
                    />
                  </>
                )}
              </Section>

              <Section
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
                    destinationId={form.destinationId}
                    customDestination={form.customDestination}
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

              <Section title="When & who" style={stagger(3)}>
                <div className="flex flex-wrap items-start gap-x-4 gap-y-4">
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-2">
                        <Label
                          htmlFor="start-date"
                          className="text-footnote font-normal text-muted-foreground"
                        >
                          Start date
                        </Label>
                        <Input
                          id="start-date"
                          type="date"
                          aria-label="Start date"
                          aria-invalid={!!dateError || undefined}
                          aria-describedby={dateError ? "date-error" : undefined}
                          value={form.startDate}
                          min={todayIso()}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="h-11"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label
                          htmlFor="end-date"
                          className="text-footnote font-normal text-muted-foreground"
                        >
                          End date
                        </Label>
                        <Input
                          id="end-date"
                          type="date"
                          aria-label="End date"
                          aria-invalid={!!dateError || undefined}
                          aria-describedby={dateError ? "date-error" : undefined}
                          value={form.endDate}
                          min={form.startDate}
                          onChange={(e) => update({ endDate: e.target.value })}
                          className="h-11"
                        />
                      </div>
                    </div>
                    {dateError ? (
                      <FieldError id="date-error">{dateError}</FieldError>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {shape.days === 1
                          ? "Day trip, no overnight stay"
                          : `${shape.days} days, ${shape.nights} night${shape.nights === 1 ? "" : "s"}`}
                      </p>
                    )}
                  </div>
                  <div className="flex w-full items-center justify-between gap-4 sm:block sm:w-auto">
                    <p className="text-footnote text-muted-foreground sm:mb-2">Travelers</p>
                    <div className="flex h-11 items-center rounded-lg border border-input bg-fill">
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
                        className="tabular w-7 text-center text-body font-semibold"
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

              <Section title="Budget" style={stagger(5)}>
                <div className="sm:max-w-xs">
                  <div>
                    <Label
                      htmlFor="total-budget"
                      className="text-footnote font-normal text-muted-foreground"
                    >
                      Total budget
                    </Label>
                    <NumberField
                      id="total-budget"
                      aria-label="Total budget"
                      prefix="$"
                      value={totalBudget}
                      onChange={setBudget}
                      step={50}
                      className="mt-2 h-12"
                      inputClassName="text-xl"
                    />
                    {!budgetOwn ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Set from this trip's costs, about {formatMoney(estimate.planned)}, plus an
                        emergency fund. It follows the trip as you change it. Type your own anytime.
                      </p>
                    ) : estimate.planned + emergencyFund > totalBudget ? (
                      <p className="mt-2 text-xs text-destructive">
                        Less than this trip is likely to cost (about {formatMoney(estimate.planned)}
                        ). Your budget stays as you set it, and Waypoint will show where to save.{" "}
                        <button
                          type="button"
                          onClick={() => setBudgetOwn(false)}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Let Waypoint suggest {formatMoney(suggested)}
                        </button>
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Your budget. This trip is likely to cost about{" "}
                        {formatMoney(estimate.planned)}.{" "}
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
                </div>
              </Section>

              <MoreOptions
                open={moreOptions || !!reserveError}
                onToggle={() => setMoreOptions((o) => !o)}
              >
                <Section title="Style">
                  <StylePicker value={form.style} onChange={(style) => update({ style })} />
                  <p className="mt-6 mb-2 text-sm text-muted-foreground">Interests</p>
                  <InterestChips value={form.interests} onToggle={toggleInterest} />
                </Section>

                <Section title="What you pay for">
                  <CoveragePicker
                    value={form.coverage}
                    mode={form.transportMode}
                    onChange={(coverage) => update({ coverage })}
                  />
                </Section>

                <Section title="Emergency fund">
                  <div className="sm:max-w-xs">
                    <NumberField
                      id="emergency-fund"
                      aria-label="Emergency fund"
                      invalid={!!reserveError}
                      describedBy={reserveError ? "reserve-error" : undefined}
                      prefix="$"
                      step={25}
                      value={emergencyFund}
                      className="h-12"
                      inputClassName="text-xl"
                      onChange={(n) => {
                        reserveTouched.current = true;
                        update({ emergencyFund: n });
                      }}
                    />
                    {reserveError && <FieldError id="reserve-error">{reserveError}</FieldError>}
                  </div>
                </Section>
              </MoreOptions>
            </form>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-8" style={stagger(2)}>
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
            "sticky bottom-[calc(var(--tabbar)+1rem)] z-20 mt-6 transition-[opacity,translate] spring-smooth md:bottom-4 lg:hidden",
            showBar ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0",
          )}
        >
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-2 pl-4 shadow-lift">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{routeText}</p>
              <p className="tabular truncate text-xs text-muted-foreground">
                {tripTypeInfo(form.tripType).label} ·{" "}
                {shape.days === 1 ? "day trip" : `${shape.days} days`}
                {distance ? ` · ${distance}` : ""} · about {formatMoney(estimate.planned)}
              </p>
            </div>
            <Button
              type="submit"
              form="plan-form"
              variant="go"
              size="lg"
              loading={planning}
              className="shrink-0 px-6"
            >
              {planning ? "Planning…" : "Plan trip"} <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
      <HowItWorks />
      <Faq />
    </div>
  );
}

/** The optional parts of the form, folded away until asked for. */
function MoreOptions({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="more-options"
        onClick={onToggle}
        className="flex h-14 w-full items-center justify-between text-left text-headline font-semibold"
      >
        More options
        <span className="flex items-center gap-2 text-footnote font-normal text-muted-foreground">
          <span className="hidden sm:inline">
            Style, interests, what you pay for, emergency fund
          </span>
          <ChevronDown
            aria-hidden
            className={cn("size-5 transition-transform duration-150", open && "rotate-180")}
          />
        </span>
      </button>
      <div id="more-options" hidden={!open} className="divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function Section({
  title,
  aside,
  children,
  style,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    // Heading above its controls, full width: an app's form, not a two-column document.
    <section className="py-8" style={style}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-headline font-semibold">{title}</h3>
        {aside && <p className="ml-auto text-xs text-muted-foreground">{aside}</p>}
      </div>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}
