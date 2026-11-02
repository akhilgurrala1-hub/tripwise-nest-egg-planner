import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Car,
  Coffee,
  ExternalLink,
  Landmark,
  Lightbulb,
  Loader2,
  MapPin,
  Moon,
  RotateCcw,
  Wand2,
  Star,
  Sun,
  Sunrise,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DemoBadge } from "@/components/app/bits";
import { AddItemButton, ItemActions } from "@/components/app/ItineraryEditor";
import { LogoMark } from "@/components/app/Logo";
import { stagger } from "@/components/app/motion";
import { WeatherChip } from "@/components/app/Weather";
import { PageHeader } from "@/components/app/TripHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createAiItinerary } from "@/lib/ai-itinerary.functions";
import { usePreferences } from "@/lib/account";
import { useAuth } from "@/lib/auth-context";
import { formatMoney, stopCost } from "@/lib/budget";
import { INTERESTS, TRAVEL_STYLES, TRIP_TYPES } from "@/lib/demo-data";
import {
  addDays,
  buildRealItinerary,
  itineraryActivityCost,
  unpricedItems,
  type ItemKind,
  type ItineraryItem,
  type Itinerary,
} from "@/lib/itinerary";
import { destinationQuery } from "@/lib/live/place";
import { useTripWeather } from "@/lib/live/use-live";
import { isWetDay } from "@/lib/live/weather";
import { getDestinationPlaces } from "@/lib/places/destination-places.functions";
import type { DestinationPlacesResult } from "@/lib/places/types";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/itinerary")({
  head: () => ({
    meta: [
      { title: "Your itinerary — Waypoint" },
      {
        name: "description",
        content:
          "A personalized day-by-day plan with sightseeing stops, restaurants and estimated costs.",
      },
      { property: "og:title", content: "Your itinerary — Waypoint" },
      {
        property: "og:description",
        content:
          "Day-by-day sightseeing, restaurants and stops matched to your interests and budget.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ItineraryPage,
});

const KIND_ICON: Record<ItemKind, typeof Landmark> = {
  sight: Landmark,
  restaurant: UtensilsCrossed,
  stop: Car,
};

/** Map lookups are billed, so identical searches in one session reuse the first answer. */
const placesCache = new Map<string, DestinationPlacesResult>();

function ItineraryPage() {
  const { trip, dest, shape, totals } = useTrip();
  const { user } = useAuth();
  const prefs = usePreferences();
  const weather = useTripWeather();
  const place = destinationQuery(dest, trip.setup.origin, prefs?.home_city);
  const [loading, setLoading] = useState(false);
  const [loadingReal, setLoadingReal] = useState(false);
  const busy = loading || loadingReal;
  const itin = trip.itinerary;
  const activityCost = itineraryActivityCost(itin, shape.travelers);
  const mealCost = itin
    ? itin.days
        .flatMap((d) => d.items)
        .filter((i) => i.kind === "restaurant")
        .reduce((s, i) => s + i.costPerPerson, 0) * shape.travelers
    : 0;

  const generateWithAi = async () => {
    setLoading(true);
    try {
      const label = (list: { id: string; label: string }[], id: string) =>
        list.find((x) => x.id === id)?.label ?? id;
      const res = await createAiItinerary({
        data: {
          destination: place,
          region: "",
          origin: trip.setup.origin,
          tripType: label(TRIP_TYPES, trip.setup.tripType),
          style: label(TRAVEL_STYLES, trip.setup.style),
          days: Math.min(14, shape.days),
          startDate: trip.setup.startDate,
          travelers: shape.travelers,
          interests: trip.setup.interests.map((i) => label(INTERESTS, i)),
          activityBudgetPerPerson: totals.categories.activities / shape.travelers,
          foodBudgetPerPersonDay: totals.categories.food / shape.travelers / shape.days,
          weather: Array.from({ length: Math.min(14, shape.days) }, (_, i) => {
            const w = weather.byDate.get(addDays(trip.setup.startDate, i));
            if (!w) return "";
            const rain = w.precipChance !== null ? `, ${w.precipChance}% chance of rain` : "";
            return `Day ${i + 1}: ${w.label}, high ${w.highF}°F, low ${w.lowF}°F${rain} (${w.source === "forecast" ? "forecast" : "typical for the date"})`;
          }).filter(Boolean),
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const next: Itinerary = {
        source: "ai",
        tips: res.itinerary.tips.slice(0, 4),
        days: res.itinerary.days.slice(0, shape.days).map((d, di) => ({
          day: di + 1,
          date: addDays(trip.setup.startDate, di),
          title: d.title,
          items: d.items.map((it, ii) => ({
            ...it,
            id: `ai-${di}-${ii}`,
            costPerPerson: Math.max(0, Number(it.costPerPerson) || 0),
          })),
        })),
      };
      const kept = tripActions.setItinerary(next);
      toast.success("Plan ready — double-check details before you go", keptNote(kept));
    } catch {
      toast.error("Couldn't reach the AI planner. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const useRealPlaces = async () => {
    const request = {
      destination: place,
      interests: trip.setup.interests,
      style: trip.setup.style,
    };
    const key = JSON.stringify(request);
    setLoadingReal(true);
    try {
      let res = placesCache.get(key);
      if (!res) {
        res = await getDestinationPlaces({ data: request });
        if (res.ok) placesCache.set(key, res);
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const kept = tripActions.setItinerary(
        buildRealItinerary({
          sights: res.sights,
          restaurants: res.restaurants,
          destName: dest.name,
          days: Math.min(14, shape.days),
          startDate: trip.setup.startDate,
          interests: trip.setup.interests,
          tripType: trip.setup.tripType,
        }),
      );
      toast.success("Itinerary built from real places on Google Maps", keptNote(kept));
    } catch {
      toast.error("Couldn't reach the map service. Please try again in a moment.");
    } finally {
      setLoadingReal(false);
    }
  };
  const unpriced = unpricedItems(itin);

  return (
    <div>
      <PageHeader eyebrow="Itinerary" title="Day by day">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {user ? (
            <Button
              variant="ink"
              onClick={useRealPlaces}
              disabled={busy}
              className="flex-1 sm:flex-none"
            >
              {loadingReal ? <Loader2 className="animate-spin" /> : <MapPin />}
              {loadingReal ? "Finding places…" : "Use real places"}
            </Button>
          ) : (
            <Button variant="ink" asChild className="flex-1 sm:flex-none">
              <Link to="/auth" search={{ redirect: "/itinerary" }}>
                <MapPin /> Sign in for real places & planning
              </Link>
            </Button>
          )}
          {/* AI planning spends credits, so like the map lookups it's for signed-in travelers. */}
          {user && (
            <Button
              variant="outline"
              onClick={generateWithAi}
              disabled={busy}
              className="flex-1 sm:flex-none"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {loading ? "Planning…" : "Plan around my interests"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              tripActions.regenerateDemoItinerary();
              toast("Reset to the demo plan", {
                description: "Stops you added or edited were kept.",
              });
            }}
            disabled={busy}
            aria-label="Reset to the demo plan"
            title="Reset to the demo plan"
          >
            <RotateCcw />
          </Button>
        </div>
      </PageHeader>

      <div className="mx-auto mt-8 grid max-w-6xl grid-cols-1 gap-4 px-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {itin?.source === "google" ? (
            <Badge variant="secondary" className="whitespace-normal">
              <span className="size-1.5 rounded-full bg-success" /> Real places from Google Maps ·
              costs are estimates
            </Badge>
          ) : itin?.source === "ai" ? (
            <Badge variant="secondary" className="whitespace-normal">
              <span className="size-1.5 rounded-full bg-primary" /> Suggested plan · places and
              prices are unverified estimates
            </Badge>
          ) : (
            <DemoBadge label="Demo itinerary · example places & prices" />
          )}

          {loading && (
            <div className="surface-card animate-pop flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <LogoMark loading className="size-7" />
              Crafting a plan around your interests and budget — this can take up to a minute.
            </div>
          )}

          {trip.roadTrip.includedStops.length > 0 && (
            <section className="surface-card overflow-hidden">
              <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    On the drive
                  </p>
                  <h2 className="text-[15px] font-semibold">Road-trip stops</h2>
                </div>
                <Link
                  to="/road-trip"
                  className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Find more
                </Link>
              </header>
              <ol className="px-5 py-2">
                {trip.roadTrip.includedStops.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-foreground/80">
                      <Car className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        +{s.extraMinutes} min detour (sample)
                      </p>
                    </div>
                    <span className="tabular text-xs font-medium">
                      {formatMoney(stopCost(s, shape.travelers, trip.inputs), { cents: true })}
                    </span>
                    <button
                      onClick={() => tripActions.toggleStop(s)}
                      className="grid size-6 place-items-center rounded-full text-muted-foreground opacity-60 transition hover:bg-muted hover:opacity-100"
                      aria-label={`Remove ${s.name}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {!itin || itin.days.length === 0 ? (
            <div className="surface-card p-8 text-center">
              <p className="text-[15px] font-semibold">No itinerary yet</p>
              <Button className="mt-4" onClick={tripActions.regenerateDemoItinerary}>
                Create demo plan
              </Button>
            </div>
          ) : (
            itin.days.map((day, di) => (
              <section
                key={day.day}
                className="surface-card animate-rise overflow-hidden"
                style={stagger(di)}
              >
                <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
                  <span className="tabular grid size-9 shrink-0 place-items-center rounded-lg border border-border font-mono text-[13px] text-muted-foreground">
                    {day.day}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      {safeFormat(day.date)}
                    </p>
                    <h2 className="line-clamp-2 text-[15px] leading-tight font-semibold">
                      {day.title}
                    </h2>
                  </div>
                  {weather.byDate.get(day.date) && (
                    <WeatherChip
                      day={weather.byDate.get(day.date)!}
                      className="hidden shrink-0 sm:inline-flex"
                    />
                  )}
                </header>
                {weather.byDate.get(day.date) && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2 sm:hidden">
                    <WeatherChip day={weather.byDate.get(day.date)!} />
                  </div>
                )}
                {(() => {
                  const w = weather.byDate.get(day.date);
                  if (!w || !isWetDay(w)) return null;
                  return (
                    <p className="border-b border-border bg-shield-soft px-5 py-2 text-xs">
                      {w.label}{" "}
                      {w.source === "forecast" ? "in the forecast" : "is common on this date"} —
                      have an indoor backup (a museum, market or long lunch) ready for outdoor
                      stops.
                    </p>
                  );
                })()}
                <ol className="relative px-5 py-3">
                  {day.items.map((item, idx) => {
                    const Icon = KIND_ICON[item.kind] ?? Landmark;
                    return (
                      <li key={item.id} className="group relative flex gap-3 py-3">
                        {idx < day.items.length - 1 && (
                          <span
                            className="absolute top-11 bottom-0 left-[15px] w-px bg-border"
                            aria-hidden
                          />
                        )}
                        <span
                          className={cn(
                            "relative grid size-8 shrink-0 place-items-center rounded-full border bg-card",
                            item.kind === "restaurant"
                              ? "border-border text-foreground/80"
                              : item.kind === "stop"
                                ? "border-border text-muted-foreground"
                                : "border-border text-foreground/80",
                          )}
                        >
                          <Icon className="size-3.5" strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="eyebrow inline-flex items-center gap-1">
                            <TimeIcon time={item.time} /> {item.time}
                          </p>
                          <p className="mt-0.5 text-sm leading-snug font-medium">
                            {item.name}
                            {item.custom && (
                              <span className="ml-2 inline-flex -translate-y-px items-center rounded-[5px] border border-border px-1.5 text-[10px] font-medium text-muted-foreground">
                                Yours
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.area}
                            {item.note ? ` · ${item.note}` : ""}
                          </p>
                          {(item.rating || item.mapsUrl) && (
                            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              {item.rating ? (
                                <span className="tabular inline-flex items-center gap-1 font-semibold">
                                  <Star className="size-3 fill-current text-gold" aria-hidden />{" "}
                                  {item.rating.toFixed(1)}
                                  {item.ratingCount ? (
                                    <span className="font-normal text-muted-foreground">
                                      ({item.ratingCount.toLocaleString()} reviews)
                                    </span>
                                  ) : null}
                                </span>
                              ) : null}
                              {item.mapsUrl && (
                                <a
                                  href={item.mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
                                >
                                  Open in Google Maps{" "}
                                  <ExternalLink className="size-3" aria-hidden />
                                </a>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-start gap-1">
                          <span className="pt-1.5">
                            <CostChip item={item} />
                          </span>
                          <ItemActions item={item} itinerary={itin} dayIndex={di} />
                        </div>
                      </li>
                    );
                  })}
                  {day.items.length === 0 && (
                    <li className="py-3 text-sm text-muted-foreground">
                      Free day — wander as you like.
                    </li>
                  )}
                </ol>
                <div className="px-5 pb-4">
                  <AddItemButton dayIndex={di} itinerary={itin} />
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="surface-card p-5">
            <h2 className="text-[15px] font-semibold">Plan costs</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row
                label={`Sightseeing (${shape.travelers} people)`}
                value={formatMoney(activityCost)}
              />
              <Row
                label="Activities budget"
                value={formatMoney(totals.categories.activities)}
                muted
              />
              <Row label="Restaurant picks" value={formatMoney(mealCost)} />
              <Row label="Food budget" value={formatMoney(totals.categories.food)} muted />
            </dl>
            {unpriced > 0 && (
              <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs leading-snug text-muted-foreground">
                {unpriced} {unpriced === 1 ? "place doesn't" : "places don't"} publish prices, so{" "}
                {unpriced === 1 ? "it isn't" : "they aren't"} counted above. Check before you go.
              </p>
            )}
            <Button
              className="mt-4 w-full"
              variant="ink"
              onClick={() => {
                tripActions.setOverride("activities", activityCost);
                toast.success(`Activities budget set to ${formatMoney(activityCost)}`);
              }}
            >
              Use sightseeing total in budget
            </Button>
            <Link
              to="/budget"
              className="mt-2 block text-center text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              Open budget calculator
            </Link>
          </section>

          {itin && itin.tips.length > 0 && (
            <section className="surface-card p-5">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Lightbulb className="size-4" strokeWidth={1.8} /> Tips
              </h2>
              <ul className="mt-2 space-y-2 text-sm">
                {itin.tips.map((t, i) => (
                  <li key={i} className="leading-snug">
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function CostChip({ item }: { item: ItineraryItem }) {
  if (item.costSource === "unknown") {
    return <span className="text-xs text-muted-foreground">Price not listed</span>;
  }
  if (item.costPerPerson === 0) {
    return <span className="text-xs font-medium text-success">Free</span>;
  }
  const approx = item.costSource === "price-level" ? "~" : "";
  return (
    <span
      className="tabular text-xs font-medium text-foreground"
      title={item.costSource === "price-level" ? "Estimated from the listing's $ level" : undefined}
    >
      {approx}
      {formatMoney(item.costPerPerson)}/pp
    </span>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div
      className={cn("flex items-center justify-between gap-2", muted && "text-muted-foreground")}
    >
      <dt>{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}

function safeFormat(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : format(d, "EEEE, MMM d");
}

const TIME_ICONS = {
  Morning: Sunrise,
  Lunch: Coffee,
  Afternoon: Sun,
  Dinner: UtensilsCrossed,
  Evening: Moon,
} as const;

function TimeIcon({ time }: { time: keyof typeof TIME_ICONS }) {
  const Icon = TIME_ICONS[time] ?? Sun;
  return <Icon className="size-3" aria-hidden />;
}

/** Toast detail when rebuilding a plan kept the traveler's own stops. */
function keptNote(kept: number) {
  return kept > 0
    ? { description: `Kept ${kept} stop${kept === 1 ? "" : "s"} you added or edited.` }
    : undefined;
}
