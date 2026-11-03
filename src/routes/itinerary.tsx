import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Car,
  ChevronDown,
  Lightbulb,
  Loader2,
  MapPin,
  Printer,
  RotateCcw,
  Star,
  Wand2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SourceNote } from "@/components/app/bits";
import { DayCard } from "@/components/app/itinerary/DayCard";
import { PlanCosts } from "@/components/app/itinerary/PlanCosts";
import { usePlanner } from "@/components/app/itinerary/use-planner";
import { LogoMark } from "@/components/app/Logo";
import { stagger } from "@/components/app/motion";
import { ShareTripButton } from "@/components/app/ShareTrip";
import { PageHeader } from "@/components/app/TripHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { formatMoney, stopCost } from "@/lib/budget";
import { useTripWeather } from "@/lib/live/use-live";
import { useTripHolidays } from "@/lib/live/use-open-data";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/itinerary")({
  head: () => ({
    meta: [
      { title: "Your itinerary | Waypoint" },
      {
        name: "description",
        content:
          "A personalized day-by-day plan with sightseeing stops, restaurants and estimated costs.",
      },
      { property: "og:title", content: "Your itinerary | Waypoint" },
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
  const holidays = useTripHolidays();
  const itin = trip.itinerary;

  return (
    <div>
      <PageHeader eyebrow="Itinerary" title="Day by day">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {/* Real landmarks and restaurants from open data: free, so it's for everyone. */}
          <div className="flex flex-1 sm:flex-none">
            <Button
              variant="ink"
              onClick={planner.planWithOpenData}
              disabled={planner.busy}
              className={cn("flex-1", user && "rounded-r-none")}
            >
              {planner.job === "open" || planner.job === "places" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <MapPin />
              )}
              {planner.job === "open" || planner.job === "places"
                ? "Finding places…"
                : "Use real places"}
            </Button>
            {user && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ink"
                    size="icon"
                    disabled={planner.busy}
                    className="rounded-l-none border-l border-ink-foreground/20"
                    aria-label="More ways to find real places"
                  >
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={planner.planWithOpenData}>
                    <MapPin className="size-4" />
                    <span>
                      Travel guide picks
                      <span className="block text-xs text-muted-foreground">
                        Wikivoyage, Wikipedia and OpenStreetMap
                      </span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={planner.planWithRealPlaces}>
                    <Star className="size-4" />
                    <span>
                      Google Maps places
                      <span className="block text-xs text-muted-foreground">
                        With ratings and price levels
                      </span>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {user ? (
            /* AI planning spends credits, so it's for signed-in travelers. */
            <Button
              variant="outline"
              onClick={() => planner.planWithAi()}
              disabled={planner.busy}
              className="flex-1 sm:flex-none"
            >
              {planner.job === "ai" ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {planner.job === "ai" ? "Planning…" : "Plan around my interests"}
            </Button>
          ) : (
            <Button variant="outline" asChild className="flex-1 sm:flex-none">
              <Link to="/auth" search={{ redirect: "/itinerary" }}>
                <Wand2 /> Sign in for AI planning
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              tripActions.regenerateDemoItinerary();
              toast("Reset to the example plan", {
                description: "Stops you added or edited were kept.",
              });
            }}
            disabled={planner.busy}
            aria-label="Reset to the example plan"
            title="Reset to the example plan"
          >
            <RotateCcw />
          </Button>
          {!trip.isSample && <ShareTripButton compact />}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.print()}
            aria-label="Print or save as PDF"
            title="Print or save as PDF"
          >
            <Printer />
          </Button>
        </div>
      </PageHeader>

      <div className="mx-auto mt-8 grid max-w-6xl grid-cols-1 gap-4 px-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <PlanSourceBadge source={itin?.source ?? "demo"} />
          {user && itin && itin.days.length > 0 && (
            <RefinePlan busy={planner.busy} onRefine={(text) => planner.planWithAi(text)} />
          )}

          {planner.busy && (
            <div
              role="status"
              className="surface-card animate-pop flex items-center gap-3 p-4 text-sm text-muted-foreground"
            >
              <LogoMark loading className="size-7 shrink-0" />
              <p className="min-w-0 flex-1">
                {planner.job === "ai"
                  ? "Planning around your interests, budget and weather. This can take up to a minute."
                  : planner.job === "open"
                    ? "Reading the travel guide and looking up landmarks and restaurants…"
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
                Create example plan
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
                holiday={holidays.find((h) => h.date === day.date)?.name}
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

function PlanSourceBadge({ source }: { source: "demo" | "ai" | "google" | "open" }) {
  if (source === "open")
    return (
      <SourceNote label="Real places from the Wikivoyage travel guide, Wikipedia and OpenStreetMap. Some prices aren't listed." />
    );
  if (source === "google")
    return <SourceNote label="Real places from Google Maps. Costs are estimates." />;
  if (source === "ai")
    return <SourceNote label="Suggested plan. Double-check places and prices before you go." />;
  return <SourceNote label="Example plan. Tap Use real places for real spots near you." />;
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

const REFINE_IDEAS = [
  "Cheaper dinners",
  "More time outdoors",
  "Slower mornings",
  "Kid-friendly picks",
  "More local food",
];

/** Ask the AI for specific changes; everything else in the plan stays. */
function RefinePlan({ busy, onRefine }: { busy: boolean; onRefine: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    onRefine(v);
    setText("");
  };
  return (
    <section className="surface-card p-3 print:hidden">
      <div className="flex items-center gap-2 rounded-lg border border-input bg-card p-1 pl-3 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
        <Wand2 className="size-4 shrink-0 text-brand-coral" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(text);
          }}
          maxLength={300}
          placeholder="Refine this plan, e.g. no museums on day 2, cheaper lunches"
          aria-label="What should change in the plan?"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button
          size="sm"
          variant="ink"
          disabled={!text.trim() || busy}
          onClick={() => submit(text)}
        >
          Update
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REFINE_IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            disabled={busy}
            onClick={() => submit(idea)}
            className="h-8 rounded-lg bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {idea}
          </button>
        ))}
      </div>
    </section>
  );
}
