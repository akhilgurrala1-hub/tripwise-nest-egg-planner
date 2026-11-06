import { Link } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";

import { formatDateRange } from "@/components/app/TripHeader";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/budget";
import { JUST_PLANNED_KEY as KEY } from "@/lib/just-planned";
import { useTrip } from "@/lib/trip-store";

/**
 * The moment a trip is built: what was made, the route itself (from home, through
 * each city, back home) and where to go next. Shown once per trip, until dismissed.
 */
export function TripReady() {
  const { trip, place, totals } = useTrip();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(window.sessionStorage.getItem(KEY) === trip.id && !trip.isSample);
    } catch {
      setShow(false);
    }
  }, [trip.id, trip.isSample]);
  if (!show) return null;
  const dismiss = () => {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setShow(false);
  };
  const s = trip.setup;
  const days = trip.itinerary?.days.length ?? 0;
  return (
    <section
      aria-labelledby="trip-ready-title"
      className="surface-card animate-rise relative overflow-hidden p-6 sm:p-8"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2">Ready</p>
          <h2 id="trip-ready-title" className="title-display mt-2 text-large-title leading-tight">
            Your trip is planned.
          </h2>
          <p className="tabular mt-2 text-headline text-muted-foreground">
            {place} · {formatDateRange(s.startDate, s.endDate)} · {s.travelers}{" "}
            {s.travelers === 1 ? "traveler" : "travelers"}
          </p>
          <ul className="mt-4 grid grid-cols-3 gap-4 text-xs sm:gap-4 sm:text-sm">
            <li>
              <span className="money-display block text-title-2 sm:text-title-1">
                {formatMoney(totals.spendable)}
              </span>
              <span className="text-muted-foreground">to spend</span>
            </li>
            <li>
              <span className="money-display block text-title-2 sm:text-title-1">
                {formatMoney(totals.emergencyFund)}
              </span>
              <span className="text-muted-foreground">emergency fund</span>
            </li>
            <li>
              <span className="money-display block text-title-2 sm:text-title-1">{days}</span>
              <span className="text-muted-foreground">{days === 1 ? "day" : "days"} planned</span>
            </li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild variant="go">
              <Link to="/itinerary">
                See the days <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/book">What to book</Link>
            </Button>
          </div>
        </div>
        <RouteList />
      </div>
    </section>
  );
}

/** The trip's route as a list, like turn-by-turn stops: home, each city with its nights, home. */
function RouteList() {
  const { trip, legs } = useTrip();
  const home = trip.setup.origin.split(",")[0]?.trim() || "Home";
  const stops = [
    { name: home, note: "Start", kind: "home" as const },
    ...legs.map((l) => ({
      name: l.name.split(",")[0]!,
      note: `${l.nights} ${l.nights === 1 ? "night" : "nights"}`,
      kind: "city" as const,
    })),
    ...(trip.setup.tripType === "staycation"
      ? []
      : [{ name: home, note: "Home", kind: "home" as const }]),
  ];
  return (
    <ol aria-label="Route" className="hidden rounded-2xl bg-fill p-4 sm:block">
      {stops.map((st, i) => (
        <li key={`${st.name}-${i}`} className="relative flex items-center gap-2 py-1">
          {i < stops.length - 1 && (
            <span
              aria-hidden
              className="absolute top-6 bottom-[-12px] left-[5px] w-0.5 bg-primary/25"
            />
          )}
          <span
            aria-hidden
            className={
              st.kind === "home"
                ? "relative size-3 shrink-0 rounded-full border-2 border-primary bg-card"
                : "relative size-3 shrink-0 rounded-full bg-primary"
            }
          />
          <span className="min-w-0 flex-1 truncate text-body font-semibold">{st.name}</span>
          <span className="tabular text-footnote text-muted-foreground">{st.note}</span>
        </li>
      ))}
    </ol>
  );
}
