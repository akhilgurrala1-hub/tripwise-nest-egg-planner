import { createFileRoute, Link } from "@tanstack/react-router";
import { Car, Lightbulb, Loader2, MapPin, RotateCcw, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { DemoBadge } from "@/components/app/bits";
import { DayCard } from "@/components/app/itinerary/DayCard";
import { PlanCosts } from "@/components/app/itinerary/PlanCosts";
import { usePlanner } from "@/components/app/itinerary/use-planner";
import { LogoMark } from "@/components/app/Logo";
import { stagger } from "@/components/app/motion";
import { PageHeader } from "@/components/app/TripHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { formatMoney, stopCost } from "@/lib/budget";
import { useTripWeather } from "@/lib/live/use-live";
import { tripActions, useTrip } from "@/lib/trip-store";

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

function ItineraryPage() {
  const { trip, shape } = useTrip();
  const { user } = useAuth();
  const weather = useTripWeather();
  const planner = usePlanner();
  const itin = trip.itinerary;

  return (
    <div>
      <PageHeader eyebrow="Itinerary" title="Day by day">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {user ? (
            <>
              <Button
                variant="ink"
                onClick={planner.planWithRealPlaces}
                disabled={planner.busy}
                className="flex-1 sm:flex-none"
              >
                {planner.job === "places" ? <Loader2 className="animate-spin" /> : <MapPin />}
                {planner.job === "places" ? "Finding places…" : "Use real places"}
              </Button>
              {/* AI planning spends credits, so like the map lookups it's for signed-in travelers. */}
              <Button
                variant="outline"
                onClick={planner.planWithAi}
                disabled={planner.busy}
                className="flex-1 sm:flex-none"
              >
                {planner.job === "ai" ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {planner.job === "ai" ? "Planning…" : "Plan around my interests"}
              </Button>
            </>
          ) : (
            <Button variant="ink" asChild className="flex-1 sm:flex-none">
              <Link to="/auth" search={{ redirect: "/itinerary" }}>
                <MapPin /> Sign in for real places & planning
              </Link>
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
            disabled={planner.busy}
            aria-label="Reset to the demo plan"
            title="Reset to the demo plan"
          >
            <RotateCcw />
          </Button>
        </div>
      </PageHeader>

      <div className="mx-auto mt-8 grid max-w-6xl grid-cols-1 gap-4 px-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <PlanSourceBadge source={itin?.source ?? "demo"} />

          {planner.busy && (
            <div
              role="status"
              className="surface-card animate-pop flex items-center gap-3 p-4 text-sm text-muted-foreground"
            >
              <LogoMark loading className="size-7 shrink-0" />
              <p className="min-w-0 flex-1">
                {planner.job === "ai"
                  ? "Planning around your interests, budget and weather — this can take up to a minute."
                  : "Finding well-reviewed places near your destination…"}{" "}
                Your current plan stays until the new one is ready.
              </p>
              <Button variant="ghost" size="sm" onClick={planner.cancel}>
                Cancel
              </Button>
            </div>
          )}

          {trip.roadTrip.includedStops.length > 0 && <DriveStops />}

          {!itin || itin.days.length === 0 ? (
            <div className="surface-card p-8 text-center">
              <p className="text-[15px] font-semibold">No itinerary yet</p>
              <Button className="mt-4" onClick={tripActions.regenerateDemoItinerary}>
                Create demo plan
              </Button>
            </div>
          ) : (
            itin.days.map((day, di) => (
              <DayCard
                key={day.day}
                day={day}
                dayIndex={di}
                itinerary={itin}
                weather={weather.byDate.get(day.date)}
                style={stagger(di)}
              />
            ))
          )}
          {shape.days > 14 && (
            <p className="text-xs text-muted-foreground">Plans cover the first 14 days.</p>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <PlanCosts />
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

function PlanSourceBadge({ source }: { source: "demo" | "ai" | "google" }) {
  if (source === "google")
    return (
      <Badge variant="secondary" className="whitespace-normal">
        <span className="size-1.5 rounded-full bg-success" /> Real places from Google Maps · costs
        are estimates
      </Badge>
    );
  if (source === "ai")
    return (
      <Badge variant="secondary" className="whitespace-normal">
        <span className="size-1.5 rounded-full bg-primary" /> Suggested plan · places and prices are
        unverified estimates
      </Badge>
    );
  return <DemoBadge label="Demo itinerary · example places & prices" />;
}

/** Stops picked on the Road trip page, shown above day one. */
function DriveStops() {
  const { trip, shape } = useTrip();
  return (
    <section className="surface-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <p className="eyebrow">On the drive</p>
          <h2 className="text-[15px] font-semibold">Road-trip stops</h2>
        </div>
        <Link
          to="/road-trip"
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
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
                +{s.extraMinutes} min detour{s.isDemo ? " (sample)" : ""}
              </p>
            </div>
            <span className="tabular text-xs font-medium">
              {formatMoney(stopCost(s, shape.travelers, trip.inputs), { cents: true })}
            </span>
            <button
              onClick={() => tripActions.toggleStop(s)}
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={`Remove ${s.name}`}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
