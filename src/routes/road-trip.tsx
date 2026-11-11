import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  Clock,
  ExternalLink,
  Flag,
  Loader2,
  Search,
  Star,
  Footprints,
  MapPin,
  Minus,
  Mountain,
  Plus,
  Ticket,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { InterestChips, NumberField, SourceNote } from "@/components/app/bits";
import { Segmented } from "@/components/app/motion";
import { OpenRouteMap } from "@/components/app/OpenRouteMap";
import { PageHeader } from "@/components/app/TripHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { safeExternalUrl } from "@/lib/booking";
import { formatMoney, roundMoney, stopCost } from "@/lib/budget";
import { TRIP_TYPES, isDrivingMode, type Interest } from "@/lib/demo-data";
import {
  STOP_FILTERS,
  getRouteProvider,
  matchesFilter,
  rankStops,
  whyItMatches,
  type RouteStop,
  type StopFilter,
  type StopKind,
} from "@/lib/routing";
import { findOpenRoute, type OpenRouteResult } from "@/lib/routing/open-route";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/road-trip")({
  head: () => ({
    meta: [
      { title: "Road-trip discovery | Waypoint" },
      {
        name: "description",
        content:
          "Find scenic viewpoints, food, parks and free stops along your route, with cost, detour time and budget impact.",
      },
      { property: "og:title", content: "Road-trip discovery | Waypoint" },
      {
        property: "og:description",
        content: "Pick stops along your drive and watch your trip budget update instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoadTripPage,
});

const KIND: Record<StopKind, { icon: LucideIcon; label: string }> = {
  viewpoint: { icon: Mountain, label: "Scenic viewpoint" },
  restaurant: { icon: UtensilsCrossed, label: "Food" },
  park: { icon: Trees, label: "Park" },
  attraction: { icon: Ticket, label: "Attraction" },
  "free-activity": { icon: Footprints, label: "Free activity" },
};

interface RouteSearch {
  origin: string;
  destination: string;
  from: { lat: number; lng: number } | null;
  to: { lat: number; lng: number } | null;
}

/** The last route looked up, so coming back to the page shows it again. */
let lastSearch: RouteSearch | null = null;

function segmentLabel(pos: number, origin: string, destination: string) {
  if (pos < 0.34) return `Early in the drive${origin ? ` from ${origin}` : ""}`;
  if (pos < 0.67) return "Midway";
  return `Approaching ${destination || "your destination"}`;
}

function RoadTripPage() {
  const { trip, dest, totals, shape, stopsTotal } = useTrip();
  const rt = trip.roadTrip;
  const [filter, setFilter] = useState<StopFilter>("all");
  const provider = getRouteProvider();
  const driving = isDrivingMode(trip.inputs.transportMode);

  const [search, setSearchState] = useState<RouteSearch | null>(() =>
    lastSearch &&
    lastSearch.origin === rt.origin.trim() &&
    lastSearch.destination === rt.destination.trim()
      ? lastSearch
      : null,
  );
  const setSearch = (s: RouteSearch) => {
    lastSearch = s;
    setSearchState(s);
  };

  // Sample stops until the traveler looks up their real road.
  const demo = useQuery({
    queryKey: ["route-stops", provider.id, rt.origin, rt.destination],
    queryFn: () =>
      provider.findStopsAlongRoute({
        origin: rt.origin,
        destination: rt.destination,
        interests: rt.interests,
        maxDetourMinutes: rt.maxDetourMinutes,
      }),
    enabled: !search,
  });

  // Free open data from the browser, only after a tap, cached for the session.
  const real = useQuery({
    queryKey: ["open-route", search],
    queryFn: ({ signal }) => findOpenRoute(search!, signal),
    enabled: !!search,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });

  const realResult = real.data;
  const realOk =
    realResult?.ok === true ? (realResult as Extract<OpenRouteResult, { ok: true }>) : null;
  const realError =
    realResult && realResult.ok === false ? (realResult as { error: string }).error : null;
  const stops: RouteStop[] = search ? (realOk?.stops ?? []) : (demo.data ?? []);
  // Exactly one of these states renders at a time.
  const view: "demo" | "loading" | "unavailable" | "empty" | "results" = !search
    ? demo.isLoading
      ? "loading"
      : "demo"
    : real.isFetching
      ? "loading"
      : real.isError || realError
        ? "unavailable"
        : realOk && realOk.stops.length === 0
          ? "empty"
          : realOk
            ? "results"
            : "loading";
  const canSearch = rt.origin.trim().length >= 2 && rt.destination.trim().length >= 2;
  const runSearch = () => {
    const origin = rt.origin.trim();
    const destination = rt.destination.trim();
    const p = trip.setup.originPoint;
    const d = trip.setup.destinationPoint;
    setSearch({
      origin,
      destination,
      // The trip's own points are exact; a typed place is looked up by name.
      from: p && origin === trip.setup.origin.trim() ? { lat: p.lat, lng: p.lon } : null,
      to: d && destination === dest.name.trim() ? { lat: d.lat, lng: d.lon } : null,
    });
  };
  const scrollToStop = useCallback(
    (id: string) =>
      document
        .getElementById(`stop-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    [],
  );

  const includedIds = new Set(rt.includedStops.map((s) => s.id));
  const withinDetour = stops.filter((s) => s.extraMinutes <= rt.maxDetourMinutes);
  const visible = rankStops(withinDetour, rt.interests).filter((s) => matchesFilter(s, filter));
  const hiddenByDetour = stops.length - withinDetour.length;
  const stopBudgetLeft = roundMoney(rt.stopBudget - stopsTotal);
  const extraMinutes = rt.includedStops.reduce((s, x) => s + x.extraMinutes, 0);

  const toggleInterest = (id: Interest) =>
    tripActions.updateRoadTrip({
      interests: rt.interests.includes(id)
        ? rt.interests.filter((i) => i !== id)
        : [...rt.interests, id],
    });

  if (trip.setup.tripType !== "road-trip") return <NotARoadTrip />;

  return (
    <div>
      <PageHeader title="Find the stops worth the detour" />

      <div className="page-container mt-6 layout-main-aside">
        <div className="min-w-0 space-y-6">
          {/* Route setup */}
          <section className="surface-card space-y-6 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="rt-origin" className="text-footnote text-muted-foreground">
                  Starting location
                </label>
                <Input
                  id="rt-origin"
                  value={rt.origin}
                  placeholder="e.g. your city"
                  maxLength={80}
                  onChange={(e) => tripActions.updateRoadTrip({ origin: e.target.value })}
                  className="mt-2 h-11"
                />
              </div>
              <div>
                <label htmlFor="rt-dest" className="text-footnote text-muted-foreground">
                  Destination
                </label>
                <Input
                  id="rt-dest"
                  value={rt.destination}
                  placeholder="Where you're headed"
                  maxLength={80}
                  onChange={(e) => tripActions.updateRoadTrip({ destination: e.target.value })}
                  className="mt-2 h-11"
                />
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="rt-budget" className="text-footnote text-muted-foreground">
                  Budget for stops & detours
                </label>
                <NumberField
                  id="rt-budget"
                  prefix="$"
                  step={25}
                  value={rt.stopBudget}
                  onChange={(v) => tripActions.updateRoadTrip({ stopBudget: v })}
                  className="mt-2"
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-footnote text-muted-foreground">Max detour per stop</span>
                  <span className="tabular text-sm font-medium">{rt.maxDetourMinutes} min</span>
                </div>
                <Slider
                  className="mt-4"
                  min={5}
                  max={60}
                  step={5}
                  value={[rt.maxDetourMinutes]}
                  onValueChange={([v]) => tripActions.updateRoadTrip({ maxDetourMinutes: v ?? 20 })}
                  aria-label="Maximum detour time"
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-footnote text-muted-foreground">Interests</p>
              <InterestChips value={rt.interests} onToggle={toggleInterest} />
            </div>
            <Button
              variant="hero"
              className="w-full"
              disabled={!canSearch || real.isFetching}
              loading={real.isFetching}
              onClick={runSearch}
            >
              <Search />
              {real.isFetching ? "Looking along your route…" : "Find real stops"}
            </Button>
          </section>

          {view === "results" && realOk && (
            <p className="tabular text-sm text-muted-foreground">
              Your route:{" "}
              <strong className="text-foreground">{realOk.route.distanceMiles} mi</strong>, about{" "}
              <strong className="text-foreground">
                {Math.floor(realOk.route.durationMinutes / 60)} h{" "}
                {realOk.route.durationMinutes % 60} min
              </strong>{" "}
              of driving without stops.
            </p>
          )}

          <section className="space-y-4" aria-live="polite">
            {view === "loading" ? (
              <StateCard
                icon={<Loader2 className="size-5 animate-spin" />}
                title="Looking along your route…"
              >
                Finding viewpoints, food and places worth the detour.
              </StateCard>
            ) : view === "unavailable" ? (
              <StateCard
                icon={<Flag className="size-5 text-destructive" />}
                title="We couldn't look up this route"
              >
                {realError ?? "Please try again in a moment."} Your budget and saved stops are safe.
              </StateCard>
            ) : view === "empty" ? (
              <StateCard
                icon={<MapPin className="size-5 text-muted-foreground" />}
                title="No stops found on this route"
              >
                Try nearby cities, or add a few interests for more ideas.
              </StateCard>
            ) : (
              <>
                <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                  <Segmented
                    ariaLabel="Filter stops"
                    size="sm"
                    value={filter}
                    onChange={setFilter}
                    options={STOP_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
                    className="max-w-none flex-nowrap"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {visible.length} stop{visible.length === 1 ? "" : "s"} within{" "}
                  {rt.maxDetourMinutes} min
                  {hiddenByDetour > 0
                    ? ` · ${hiddenByDetour} longer detour${hiddenByDetour === 1 ? "" : "s"} hidden`
                    : ""}
                  .{" "}
                  {view === "demo"
                    ? "These are example stops, not real places. Tap Find real stops to see what's along your road."
                    : `Route from OpenStreetMap, sights from Wikipedia${realOk?.food ? ", food from OpenStreetMap" : ""}. Detour times and costs are estimates, so check before you go.${realOk && !realOk.food ? " Food stops couldn't load right now; try again later for places to eat." : ""}`}
                </p>
                {visible.length === 0 ? (
                  <StateCard
                    icon={<MapPin className="size-5 text-muted-foreground" />}
                    title="Nothing matches yet"
                  >
                    Try another filter or allow a slightly longer detour.
                  </StateCard>
                ) : (
                  visible.map((stop) => (
                    <StopCard
                      key={stop.id}
                      stop={stop}
                      included={includedIds.has(stop.id)}
                      cost={stopCost(stop, shape.travelers, trip.inputs)}
                      tripRemaining={totals.remaining}
                      stopBudgetLeft={stopBudgetLeft}
                      reasons={whyItMatches(stop, rt.interests, shape.travelers)}
                      segment={segmentLabel(stop.position, rt.origin, rt.destination)}
                      travelers={shape.travelers}
                      driving={driving}
                    />
                  ))
                )}
              </>
            )}
          </section>
        </div>

        {/* Route plan */}
        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <section className="surface-card p-6">
            <h2 className="title-display text-title-1">Your route plan</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div className="border-t border-separator pt-4">
                <dt className="text-xs text-muted-foreground">Stops added</dt>
                <dd className="tabular text-lg font-semibold">{rt.includedStops.length}</dd>
              </div>
              <div className="border-t border-separator pt-4">
                <dt className="text-xs text-muted-foreground">Extra drive (est.)</dt>
                <dd className="tabular text-lg font-semibold">+{extraMinutes} min</dd>
              </div>
              <div className="border-t border-separator pt-4">
                <dt className="text-xs text-muted-foreground">Stop spend</dt>
                <dd className="tabular text-lg font-semibold">
                  {formatMoney(stopsTotal, { cents: true })}
                </dd>
              </div>
              <div className="border-t border-separator pt-4">
                <dt className="text-xs text-muted-foreground">Stop budget left</dt>
                <dd
                  className={cn(
                    "tabular text-lg font-semibold",
                    stopBudgetLeft < 0 && "text-destructive",
                  )}
                >
                  {formatMoney(stopBudgetLeft, { cents: true })}
                </dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-separator pt-4 text-sm">
              <p className="text-xs text-muted-foreground">Whole-trip money remaining</p>
              <p
                className={cn(
                  "tabular text-headline font-semibold",
                  totals.overBudget && "text-destructive",
                )}
              >
                {formatMoney(totals.remaining, { cents: true })}
              </p>
              <Link to="/budget" className="text-xs font-semibold underline underline-offset-2">
                Open budget
              </Link>
            </div>
          </section>

          {realOk ? (
            <section className="surface-card p-4">
              <h2 className="title-display mb-4 text-title-1">Route map</h2>
              <OpenRouteMap
                route={realOk.route}
                stops={withinDetour}
                includedIds={includedIds}
                onSelect={scrollToStop}
              />
            </section>
          ) : (
            <RouteMap
              origin={rt.origin}
              destination={rt.destination}
              stops={withinDetour}
              includedIds={includedIds}
            />
          )}

          {rt.includedStops.length > 0 && (
            <Button variant="outline" className="w-full" onClick={tripActions.clearStops}>
              Remove all stops
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}

function StopCard({
  stop,
  included,
  cost,
  tripRemaining,
  stopBudgetLeft,
  reasons,
  segment,
  travelers,
  driving,
}: {
  stop: RouteStop;
  included: boolean;
  cost: number;
  tripRemaining: number;
  stopBudgetLeft: number;
  reasons: string[];
  segment: string;
  travelers: number;
  driving: boolean;
}) {
  const { icon: Icon, label } = KIND[stop.kind];
  // Stops are excluded from taxes and the cushion, so their effect on the budget is exactly their cost.
  const remainingAfter = included ? tripRemaining : roundMoney(tripRemaining - cost);
  const stopLeftAfter = included ? stopBudgetLeft : roundMoney(stopBudgetLeft - cost);
  const costText =
    stop.costSource === "unknown" && cost === 0
      ? "Not listed"
      : cost === 0
        ? "Free"
        : // A few cents of detour gas reads as noise; whole dollars are what people plan with.
          cost < 1
          ? "Under $1"
          : formatMoney(cost);
  const costDetail =
    (stop.costSource === "unknown"
      ? "price not published"
      : stop.costPerPerson === 0
        ? "no entry fee"
        : `${formatMoney(stop.costPerPerson)}/pp × ${travelers}${stop.costSource === "price-level" ? " (est.)" : ""}`) +
    (driving && stop.extraMinutes > 0 ? " + fuel" : "");

  return (
    <article
      id={`stop-${stop.id}`}
      className={cn(
        "surface-card render-lazy flex gap-4 p-4 transition-[border-color,box-shadow] duration-200 [contain-intrinsic-size:auto_160px]",
        included && "border-primary ring-3 ring-primary/12",
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-foreground/80">
        <Icon className="size-4" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="label-mono truncate">
          {label} · {segment}
        </p>
        <h2 className="mt-1 text-sm leading-snug font-medium">{stop.name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {stop.rating !== null && (
            <span className="tabular mr-2 inline-flex items-center gap-1 font-medium text-foreground">
              <Star className="size-3 fill-gold text-gold" /> {stop.rating.toFixed(1)}
              {stop.ratingCount !== null && (
                <span className="font-normal text-muted-foreground">
                  ({stop.ratingCount.toLocaleString()})
                </span>
              )}
            </span>
          )}
          {stop.description || stop.address}
        </p>
        {reasons.length > 0 && (
          <ul
            className="mt-2 flex flex-wrap gap-x-4 gap-y-1"
            aria-label="Why it's worth the detour"
          >
            {reasons.map((r) => (
              <li
                key={r}
                className="inline-flex items-center gap-1 text-micro text-muted-foreground"
              >
                <Check className="size-3 text-success" /> {r}
              </li>
            ))}
          </ul>
        )}
        {stop.mapsUrl && !stop.isDemo && (
          <a
            href={safeExternalUrl(stop.mapsUrl ?? "")}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {stop.mapsUrl.includes("wikipedia.org") ? "Read on Wikipedia" : "View on OpenStreetMap"}{" "}
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 text-right">
        <div>
          <p className="tabular text-sm font-semibold" title={costDetail}>
            {costText}
          </p>
          <p className="tabular inline-flex items-center gap-1 text-micro text-muted-foreground">
            <Clock className="size-3" /> +{stop.extraMinutes} min
          </p>
          {/* Only worth a line when it would push the trip or the stop budget over. */}
          {(remainingAfter < 0 || stopLeftAfter < 0) && (
            <p className="tabular text-micro text-destructive">
              {remainingAfter < 0
                ? `${formatMoney(-remainingAfter)} over budget`
                : `${formatMoney(-stopLeftAfter)} over stop budget`}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant={included ? "outline" : "ink"}
          onClick={() => tripActions.toggleStop(stop)}
          aria-pressed={included}
          aria-label={`${included ? "Remove" : "Add"} ${stop.name}`}
          className="min-w-[84px]"
        >
          {included ? (
            <>
              <Minus /> Remove
            </>
          ) : (
            <>
              <Plus /> Add
            </>
          )}
        </Button>
      </div>
    </article>
  );
}

/** Schematic route until a mapping service is connected; positions are samples. */
function RouteMap({
  origin,
  destination,
  stops,
  includedIds,
}: {
  origin: string;
  destination: string;
  stops: RouteStop[];
  includedIds: Set<string>;
}) {
  return (
    <section className="surface-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="title-display text-title-1">Route sketch</h2>
        <SourceNote label="Not to scale" />
      </div>
      <div className="relative mt-4 ml-4 h-80">
        <span
          className="absolute top-2 bottom-2 left-[7px] w-0.5 rounded-full bg-primary"
          aria-hidden
        />
        <div className="absolute top-0 left-0 flex items-center gap-2">
          <span className="grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
            <MapPin className="size-2.5" />
          </span>
          <span className="text-xs font-semibold">{origin || "Start"}</span>
        </div>
        {stops.map((s) => {
          const on = includedIds.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() =>
                document
                  .getElementById(`stop-${s.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
              className="group absolute left-0 flex items-center gap-2"
              style={{ top: `calc(${s.position * 100}% - 6px)` }}
              title={s.name}
            >
              <span
                className={cn(
                  "ml-1 size-3 rounded-full border-2 transition-colors",
                  on
                    ? "border-success bg-success"
                    : "border-border bg-card group-hover:border-primary",
                )}
              />
              {on && (
                <span className="max-w-48 truncate text-micro font-semibold text-success">
                  {s.name}
                </span>
              )}
            </button>
          );
        })}
        <div className="absolute bottom-0 left-0 flex items-center gap-2">
          <span className="grid size-4 place-items-center rounded-full bg-sunset text-primary-foreground">
            <Flag className="size-2.5" />
          </span>
          <span className="text-xs font-semibold">{destination || "Destination"}</span>
        </div>
      </div>
      <p className="mt-4 text-micro text-muted-foreground">
        Not a map, just a sketch of where sample stops fall along the drive. Find real stops for a
        live map.
      </p>
    </section>
  );
}

function StateCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted">{icon}</span>
      <p className="text-headline font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/** Shown when the current trip isn't a road trip: stops along a drive don't apply. */
function NotARoadTrip() {
  const { trip } = useTrip();
  const label = TRIP_TYPES.find((t) => t.id === trip.setup.tripType)?.label ?? "This trip";
  return (
    <div>
      <PageHeader title="Stops along the drive" />
      <div className="mx-auto mt-6 max-w-2xl px-4">
        <section className="surface-card p-6 text-center">
          <p className="text-headline font-semibold">
            Your trip is a {label.toLowerCase()}, not a road trip
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Route stops and detours are for road trips. Switch the trip type to plan stops, or head
            to your itinerary.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button
              variant="hero"
              onClick={() => {
                const [headline, ...details] = tripActions.setTripType("road-trip");
                if (headline)
                  toast.success(
                    headline,
                    details.length ? { description: details.join(" ") } : undefined,
                  );
              }}
            >
              Make it a road trip
            </Button>
            <Button asChild variant="outline">
              <Link to="/itinerary">Open itinerary</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
