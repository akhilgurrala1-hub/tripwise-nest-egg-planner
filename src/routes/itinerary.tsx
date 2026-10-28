import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Car, Coffee, Landmark, Lightbulb, Loader2, Moon, RotateCcw, Sparkles, Sun, Sunrise, UtensilsCrossed, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DemoBadge } from "@/components/app/bits";
import { PageHeader } from "@/components/app/TripHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createAiItinerary } from "@/lib/ai-itinerary.functions";
import { formatMoney, stopCost } from "@/lib/budget";
import { INTERESTS, TRAVEL_STYLES, TRIP_TYPES } from "@/lib/demo-data";
import { addDays, itineraryActivityCost, type ItemKind, type Itinerary } from "@/lib/itinerary";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/itinerary")({
  head: () => ({
    meta: [
      { title: "Your itinerary — Waypoint" },
      { name: "description", content: "A personalized day-by-day plan with sightseeing stops, restaurants and estimated costs." },
      { property: "og:title", content: "Your itinerary — Waypoint" },
      { property: "og:description", content: "Day-by-day sightseeing, restaurants and stops matched to your interests and budget." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ItineraryPage,
});

const KIND_ICON: Record<ItemKind, typeof Landmark> = { sight: Landmark, restaurant: UtensilsCrossed, stop: Car };

function ItineraryPage() {
  const { trip, dest, shape, totals } = useTrip();
  const [loading, setLoading] = useState(false);
  const itin = trip.itinerary;
  const activityCost = itineraryActivityCost(itin, shape.travelers);
  const mealCost = itin
    ? itin.days.flatMap((d) => d.items).filter((i) => i.kind === "restaurant").reduce((s, i) => s + i.costPerPerson, 0) *
      shape.travelers
    : 0;

  const generateWithAi = async () => {
    setLoading(true);
    try {
      const label = (list: { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;
      const res = await createAiItinerary({
        data: {
          destination: dest.name,
          region: dest.region,
          origin: trip.setup.origin,
          tripType: label(TRIP_TYPES, trip.setup.tripType),
          style: label(TRAVEL_STYLES, trip.setup.style),
          days: Math.min(14, shape.days),
          startDate: trip.setup.startDate,
          travelers: shape.travelers,
          interests: trip.setup.interests.map((i) => label(INTERESTS, i)),
          activityBudgetPerPerson: totals.categories.activities / shape.travelers,
          foodBudgetPerPersonDay: totals.categories.food / shape.travelers / shape.days,
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
      tripActions.setItinerary(next);
      toast.success("AI itinerary ready — double-check details before you go");
    } catch {
      toast.error("Couldn't reach the AI planner. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Itinerary" title="Your trip, day by day">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button variant="hero" onClick={generateWithAi} disabled={loading} className="flex-1 sm:flex-none">
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {loading ? "Planning…" : "Personalize with AI"}
          </Button>
          <Button variant="outline" onClick={tripActions.regenerateDemoItinerary} disabled={loading}>
            <RotateCcw /> Demo plan
          </Button>
        </div>
      </PageHeader>

      <div className="mx-auto mt-6 grid max-w-6xl grid-cols-1 gap-6 px-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {itin?.source === "ai" ? (
            <Badge variant="ai" className="px-3 py-1 whitespace-normal">
              <Sparkles /> AI suggestion · places and prices are unverified estimates
            </Badge>
          ) : (
            <DemoBadge label="Demo itinerary · example places & prices" className="px-3 py-1" />
          )}

          {loading && (
            <div className="surface-card flex items-center gap-3 p-5 text-sm">
              <Loader2 className="size-5 animate-spin text-sunset" />
              Crafting a plan around your interests and budget — this can take up to a minute.
            </div>
          )}

          {trip.roadTrip.includedStops.length > 0 && (
            <section className="surface-card overflow-hidden">
              <header className="flex items-center justify-between gap-3 border-b border-border bg-gradient-sand px-5 py-4">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">On the drive</p>
                  <h2 className="font-display text-xl font-semibold">Road-trip stops</h2>
                </div>
                <Link to="/road-trip" className="text-xs font-semibold text-primary underline-offset-2 hover:underline">
                  Find more
                </Link>
              </header>
              <ol className="px-5 py-2">
                {trip.roadTrip.includedStops.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-success/25 bg-success-soft text-success">
                      <Car className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{s.name}</p>
                      <p className="text-xs text-muted-foreground">+{s.extraMinutes} min detour (sample)</p>
                    </div>
                    <span className="tabular rounded-full bg-muted px-2 py-0.5 text-xs font-bold">
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
              <p className="font-display text-xl font-semibold">No itinerary yet</p>
              <Button className="mt-4" onClick={tripActions.regenerateDemoItinerary}>
                Create demo plan
              </Button>
            </div>
          ) : (
            itin.days.map((day) => (
              <section key={day.day} className="surface-card animate-rise overflow-hidden">
                <header className="flex items-center gap-3 border-b border-border bg-gradient-sand px-5 py-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-ink font-display text-lg font-semibold text-ink-foreground">
                    {day.day}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      {safeFormat(day.date)}
                    </p>
                    <h2 className="line-clamp-2 font-display text-xl leading-tight font-semibold">{day.title}</h2>
                  </div>
                </header>
                <ol className="relative px-5 py-3">
                  {day.items.map((item, idx) => {
                    const Icon = KIND_ICON[item.kind] ?? Landmark;
                    return (
                      <li key={item.id} className="group relative flex gap-3 py-3">
                        {idx < day.items.length - 1 && (
                          <span className="absolute top-12 bottom-0 left-[19px] w-px bg-border" aria-hidden />
                        )}
                        <span
                          className={cn(
                            "relative grid size-10 shrink-0 place-items-center rounded-full border",
                            item.kind === "restaurant"
                              ? "border-sunset/30 bg-sunset-soft text-sunset"
                              : item.kind === "stop"
                                ? "border-shield/20 bg-shield-soft text-shield"
                                : "border-success/25 bg-success-soft text-success",
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                            <TimeIcon time={item.time} /> {item.time}
                          </p>
                          <p className="font-bold leading-snug">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.area}
                            {item.note ? ` · ${item.note}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-start gap-1">
                          <span
                            className={cn(
                              "tabular rounded-full px-2 py-0.5 text-xs font-bold",
                              item.costPerPerson === 0 ? "bg-success-soft text-success" : "bg-muted text-foreground",
                            )}
                          >
                            {item.costPerPerson === 0 ? "Free" : `${formatMoney(item.costPerPerson)}/pp`}
                          </span>
                          <button
                            onClick={() => tripActions.removeItineraryItem(item.id)}
                            className="grid size-6 place-items-center rounded-full text-muted-foreground opacity-60 transition hover:bg-muted hover:opacity-100"
                            aria-label={`Remove ${item.name}`}
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {day.items.length === 0 && <li className="py-3 text-sm text-muted-foreground">Free day — wander as you like.</li>}
                </ol>
              </section>
            ))
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="surface-card p-5">
            <h2 className="font-display text-xl font-semibold">Plan costs</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label={`Sightseeing (${shape.travelers} people)`} value={formatMoney(activityCost)} />
              <Row label="Activities budget" value={formatMoney(totals.categories.activities)} muted />
              <Row label="Restaurant picks" value={formatMoney(mealCost)} />
              <Row label="Food budget" value={formatMoney(totals.categories.food)} muted />
            </dl>
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
            <Link to="/budget" className="mt-2 block text-center text-xs font-semibold text-primary underline-offset-2 hover:underline">
              Open budget calculator
            </Link>
          </section>

          {itin && itin.tips.length > 0 && (
            <section className="rounded-3xl bg-gold-soft p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Lightbulb className="size-4 text-sunset" /> Trip tips
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

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-2", muted && "text-muted-foreground")}>
      <dt>{label}</dt>
      <dd className="tabular font-bold">{value}</dd>
    </div>
  );
}

function safeFormat(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : format(d, "EEEE, MMM d");
}

const TIME_ICONS = { Morning: Sunrise, Lunch: Coffee, Afternoon: Sun, Dinner: UtensilsCrossed, Evening: Moon } as const;

function TimeIcon({ time }: { time: keyof typeof TIME_ICONS }) {
  const Icon = TIME_ICONS[time] ?? Sun;
  return <Icon className="size-3" aria-hidden />;
}
