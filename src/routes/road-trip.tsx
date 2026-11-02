import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
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
  Sparkles,
  Ticket,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { DemoBadge, NumberField } from "@/components/app/bits";
import { RealRouteMap } from "@/components/app/RealRouteMap";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/TripHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { formatMoney, roundMoney, stopCost } from "@/lib/budget";
import { INTERESTS, TRIP_TYPES, isDrivingMode, type Interest } from "@/lib/demo-data";
import {
  STOP_FILTERS,
  getRouteProvider,
  matchesFilter,
  rankStops,
  whyItMatches,
  type RealStopsResult,
  type RouteStop,
  type StopFilter,
  type StopKind,
} from "@/lib/routing";
import { useAuth } from "@/lib/auth-context";
import { getRealStops } from "@/lib/places/real-stops.functions";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/road-trip")({
  head: () => ({
    meta: [
      { title: "Road-trip discovery — Waypoint" },
      {
        name: "description",
        content:
          "Find scenic viewpoints, food, parks and free stops along your route, with cost, detour time and budget impact.",
      },
      { property: "og:title", content: "Road-trip discovery — Waypoint" },
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

function segmentLabel(pos: number, origin: string, destination: string) {
  if (pos < 0.34) return `Early in the drive${origin ? ` from ${origin}` : ""}`;
  if (pos < 0.67) return "Midway";
  return `Approaching ${destination || "your destination"}`;
}

function RoadTripPage() {
  const { trip, totals, shape, stopsTotal } = useTrip();
  const rt = trip.roadTrip;
  const [filter, setFilter] = useState<StopFilter>("all");
  const provider = getRouteProvider();
  const driving = isDrivingMode(trip.inputs.transportMode);

  const { user, loading: authLoading } = useAuth();
  const realMode = !!user;
  const fetchRealStops = useServerFn(getRealStops);
  const [search, setSearch] = useState<{
    origin: string;
    destination: string;
    interests: Interest[];
  } | null>(null);

  const demo = useQuery({
    queryKey: ["route-stops", provider.id, rt.origin, rt.destination],
    queryFn: () =>
      provider.findStopsAlongRoute({
        origin: rt.origin,
        destination: rt.destination,
        interests: rt.interests,
        maxDetourMinutes: rt.maxDetourMinutes,
      }),
    enabled: !realMode,
  });

  const real = useQuery({
    queryKey: ["real-stops", search],
    queryFn: () => fetchRealStops({ data: search! }),
    enabled: realMode && !!search,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const realResult = real.data;
  const realOk =
    realResult?.ok === true ? (realResult as Extract<RealStopsResult, { ok: true }>) : null;
  const realError =
    realResult && realResult.ok === false ? (realResult as { error: string }).error : null;
  const stops: RouteStop[] = realMode ? (realOk?.stops ?? []) : (demo.data ?? []);
  // Exactly one of these states renders at a time.
  const view:
    "auth-loading" | "demo" | "needs-search" | "loading" | "unavailable" | "empty" | "results" =
    authLoading
      ? "auth-loading"
      : !realMode
        ? demo.isLoading
          ? "loading"
          : "demo"
        : !search
          ? "needs-search"
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
  const runSearch = () =>
    setSearch({
      origin: rt.origin.trim(),
      destination: rt.destination.trim(),
      interests: [...rt.interests].sort(),
    });
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
      <PageHeader eyebrow="Road trip" title="Find the stops worth the detour">
        {realMode ? (
          <Badge variant="success" className="px-3 py-1">
            Real places & drive times · prices are estimates
          </Badge>
        ) : (
          <DemoBadge label="Demo stops · sample times & prices" />
        )}
      </PageHeader>

      <div className="mx-auto mt-6 grid max-w-6xl grid-cols-1 gap-6 px-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* Route setup */}
          <section className="surface-card space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="rt-origin" className="text-sm font-bold">
                  Starting location
                </label>
                <Input
                  id="rt-origin"
                  value={rt.origin}
                  placeholder="e.g. your city"
                  maxLength={80}
                  onChange={(e) => tripActions.updateRoadTrip({ origin: e.target.value })}
                  className="mt-1.5 h-11 rounded-xl bg-card"
                />
              </div>
              <div>
                <label htmlFor="rt-dest" className="text-sm font-bold">
                  Destination
                </label>
                <Input
                  id="rt-dest"
                  value={rt.destination}
                  placeholder="Where you're headed"
                  maxLength={80}
                  onChange={(e) => tripActions.updateRoadTrip({ destination: e.target.value })}
                  className="mt-1.5 h-11 rounded-xl bg-card"
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="rt-budget" className="text-sm font-bold">
                  Budget for stops & detours
                </label>
                <NumberField
                  id="rt-budget"
                  prefix="$"
                  step={25}
                  value={rt.stopBudget}
                  onChange={(v) => tripActions.updateRoadTrip({ stopBudget: v })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold">Max detour per stop</span>
                  <span className="tabular text-sm font-semibold text-primary">
                    {rt.maxDetourMinutes} min
                  </span>
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
              <p className="mb-2 text-sm font-bold">Interests</p>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((i) => {
                  const active = rt.interests.includes(i.id);
                  return (
                    <button
                      key={i.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleInterest(i.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                    >
                      {i.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {authLoading ? null : realMode ? (
              <Button
                variant="hero"
                className="w-full"
                disabled={!canSearch || real.isFetching}
                onClick={runSearch}
              >
                {real.isFetching ? <Loader2 className="animate-spin" /> : <Search />}
                {real.isFetching ? "Looking along your route…" : "Find real stops"}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sunset-soft px-4 py-3 text-sm">
                <p>
                  <strong>You're seeing sample stops.</strong> Sign in to explore real places,
                  routes and drive times.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/auth" search={{ redirect: "/road-trip" }}>
                    Sign in
                  </Link>
                </Button>
              </div>
            )}
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

          <section className="space-y-3" aria-live="polite">
            {view === "auth-loading" || view === "loading" ? (
              <StateCard
                icon={<Loader2 className="size-5 animate-spin text-sunset" />}
                title="Looking along your route…"
              >
                Finding viewpoints, food and places worth the detour.
              </StateCard>
            ) : view === "needs-search" ? (
              <StateCard
                icon={<Search className="size-5 text-primary" />}
                title="Where does the road take you?"
              >
                Add your start and destination above, then tap <strong>Find real stops</strong>.
              </StateCard>
            ) : view === "unavailable" ? (
              <StateCard
                icon={<Flag className="size-5 text-destructive" />}
                title="We couldn't reach the map service"
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
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
                  {STOP_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={filter === f.id}
                      onClick={() => setFilter(f.id)}
                      className={cn(
                        "min-h-10 shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-all",
                        filter === f.id
                          ? "border-sunset bg-sunset-soft text-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {visible.length} stop{visible.length === 1 ? "" : "s"} within{" "}
                  {rt.maxDetourMinutes} min
                  {hiddenByDetour > 0
                    ? ` · ${hiddenByDetour} longer detour${hiddenByDetour === 1 ? "" : "s"} hidden`
                    : ""}
                  .{" "}
                  {view === "demo"
                    ? "Demonstration mode: stop types, times and prices are samples, not real businesses."
                    : "Places and drive times come from Google Maps. Costs are estimates — check before you go."}
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
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="overflow-hidden rounded-3xl bg-gradient-ink p-5 text-ink-foreground shadow-lift">
            <h2 className="font-display text-xl font-semibold">Your route plan</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-ink-foreground/10 p-3">
                <dt className="text-xs text-ink-foreground/70">Stops added</dt>
                <dd className="tabular text-lg font-bold">{rt.includedStops.length}</dd>
              </div>
              <div className="rounded-xl bg-ink-foreground/10 p-3">
                <dt className="text-xs text-ink-foreground/70">Extra drive (sample)</dt>
                <dd className="tabular text-lg font-bold">+{extraMinutes} min</dd>
              </div>
              <div className="rounded-xl bg-ink-foreground/10 p-3">
                <dt className="text-xs text-ink-foreground/70">Stop spend</dt>
                <dd className="tabular text-lg font-bold">
                  {formatMoney(stopsTotal, { cents: true })}
                </dd>
              </div>
              <div className="rounded-xl bg-ink-foreground/10 p-3">
                <dt className="text-xs text-ink-foreground/70">Stop budget left</dt>
                <dd
                  className={cn("tabular text-lg font-bold", stopBudgetLeft < 0 && "text-sunset")}
                >
                  {formatMoney(stopBudgetLeft, { cents: true })}
                </dd>
              </div>
            </dl>
            <div className="mt-3 rounded-xl bg-ink-foreground/10 p-3 text-sm">
              <p className="text-xs text-ink-foreground/70">Whole-trip money remaining</p>
              <p
                className={cn(
                  "tabular font-display text-2xl font-semibold",
                  totals.overBudget && "text-sunset",
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
              <h2 className="mb-3 font-display text-lg font-semibold">Route map</h2>
              <RealRouteMap
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

  return (
    <article
      id={`stop-${stop.id}`}
      className={cn(
        "surface-card animate-rise overflow-hidden transition-all",
        included && "ring-2 ring-success/40",
      )}
    >
      <div className="flex gap-3 p-4">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-2xl",
            stop.kind === "restaurant"
              ? "bg-sunset-soft text-sunset"
              : stop.costPerPerson === 0
                ? "bg-success-soft text-success"
                : "bg-secondary text-primary",
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            {label} · {segment}
          </p>
          <h3 className="font-display text-lg leading-snug font-semibold">{stop.name}</h3>
          {stop.description && <p className="text-xs text-muted-foreground">{stop.description}</p>}
          {(stop.rating !== null || stop.address) && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {stop.rating !== null && (
                <span className="inline-flex items-center gap-0.5 font-semibold text-foreground">
                  <Star className="size-3 fill-gold text-gold" /> {stop.rating.toFixed(1)}
                  {stop.ratingCount !== null && (
                    <span className="font-normal text-muted-foreground">
                      ({stop.ratingCount.toLocaleString()})
                    </span>
                  )}
                </span>
              )}
              {stop.address && <span className="truncate">{stop.address}</span>}
            </p>
          )}
          <p className="mt-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Worth the detour?
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <li
                key={r}
                className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-semibold"
              >
                <Sparkles className="size-3 text-sunset" /> {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-border bg-muted/40 text-center text-xs">
        <div className="p-3">
          <p className="text-muted-foreground">Est. cost</p>
          <p className="tabular text-sm font-bold">
            {stop.costSource === "unknown" && cost === 0
              ? "Not listed"
              : cost === 0
                ? "Free"
                : formatMoney(cost, { cents: true })}
          </p>
          <p className="tabular text-[10px] text-muted-foreground">
            {stop.costSource === "unknown"
              ? "price not published"
              : stop.costPerPerson === 0
                ? "no entry fee"
                : `${formatMoney(stop.costPerPerson)}/pp × ${travelers}`}
            {driving && stop.extraMinutes > 0 ? " + fuel" : ""}
          </p>
          {stop.costSource === "price-level" && (
            <p className="text-[10px] text-muted-foreground">est. from $ level</p>
          )}
          {stop.costSource === "listed" && (
            <p className="text-[10px] text-muted-foreground">listed price range</p>
          )}
        </div>
        <div className="border-x border-border p-3">
          <p className="text-muted-foreground">Extra drive</p>
          <p className="tabular inline-flex items-center gap-1 text-sm font-bold">
            <Clock className="size-3" /> +{stop.extraMinutes} min
          </p>
          <p className="text-[10px] text-muted-foreground">
            {stop.isDemo ? "sample time" : "Google drive time"}
          </p>
        </div>
        <div className="p-3">
          <p className="text-muted-foreground">{included ? "Trip remaining" : "Remaining after"}</p>
          <p
            className={cn(
              "tabular text-sm font-bold",
              remainingAfter < 0 ? "text-destructive" : "text-success",
            )}
          >
            {formatMoney(remainingAfter)}
          </p>
          <p
            className={cn(
              "tabular text-[10px]",
              stopLeftAfter < 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            stop budget {formatMoney(stopLeftAfter)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        {stop.isDemo ? (
          <DemoBadge label="Demo" />
        ) : stop.mapsUrl ? (
          <a
            href={stop.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            View on Google Maps <ExternalLink className="size-3" />
          </a>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          variant={included ? "outline" : "default"}
          onClick={() => tripActions.toggleStop(stop)}
          aria-pressed={included}
        >
          {included ? (
            <>
              <Minus /> Remove from trip
            </>
          ) : (
            <>
              <Plus /> Add to trip
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
    <section className="surface-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Route sketch</h2>
        <DemoBadge label="Schematic" />
      </div>
      <div className="relative mt-4 ml-3 h-80">
        <span
          className="absolute top-2 bottom-2 left-[7px] w-0.5 rounded-full bg-gradient-sunset"
          aria-hidden
        />
        <div className="absolute top-0 left-0 flex items-center gap-2">
          <span className="grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
            <MapPin className="size-2.5" />
          </span>
          <span className="text-xs font-bold">{origin || "Start"}</span>
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
                  "ml-[2px] size-3 rounded-full border-2 transition-all",
                  on
                    ? "border-success bg-success"
                    : "border-border bg-card group-hover:border-primary",
                )}
              />
              {on && (
                <span className="max-w-48 truncate text-[11px] font-semibold text-success">
                  {s.name}
                </span>
              )}
            </button>
          );
        })}
        <div className="absolute bottom-0 left-0 flex items-center gap-2">
          <span className="grid size-4 place-items-center rounded-full bg-sunset text-sunset-foreground">
            <Flag className="size-2.5" />
          </span>
          <span className="text-xs font-bold">{destination || "Destination"}</span>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Not a map — a simple sketch of where sample stops fall along the drive. Sign in for a live
        map.
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
      <p className="font-display text-lg font-semibold">{title}</p>
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
      <PageHeader eyebrow="Road trip" title="Stops along the drive" />
      <div className="mx-auto mt-6 max-w-2xl px-4">
        <section className="surface-card p-6 text-center">
          <p className="font-display text-xl font-semibold">
            Your trip is a {label.toLowerCase()}, not a road trip
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Route stops and detours are for road trips. Switch the trip type to plan stops, or head
            to your itinerary.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
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
