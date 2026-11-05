import { Link } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";

import { formatDateRange } from "@/components/app/TripHeader";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/budget";
import { JUST_PLANNED_KEY as KEY } from "@/lib/just-planned";
import { useTrip } from "@/lib/trip-store";

/**
 * The moment a trip is built: the route draws in, with what was made and where to go
 * next. Shown once per trip, until dismissed.
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
      className="surface-card animate-rise relative overflow-hidden p-5 sm:p-7"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5">
            <span aria-hidden className="size-[5px] rounded-full bg-brand-coral" /> Ready
          </p>
          <h2
            id="trip-ready-title"
            className="title-display mt-2 text-[34px] leading-tight sm:text-[40px]"
          >
            Your trip is <em className="text-primary">planned.</em>
          </h2>
          <p className="tabular mt-2 text-[15px] text-muted-foreground">
            {place} · {formatDateRange(s.startDate, s.endDate)} · {s.travelers}{" "}
            {s.travelers === 1 ? "traveler" : "travelers"}
          </p>
          <ul className="mt-4 grid grid-cols-3 gap-3 text-xs sm:gap-4 sm:text-sm">
            <li>
              <span className="money-display block text-[22px] sm:text-[26px]">
                {formatMoney(totals.spendable)}
              </span>
              <span className="text-muted-foreground">to spend</span>
            </li>
            <li>
              <span className="money-display block text-[22px] sm:text-[26px]">
                {formatMoney(totals.emergencyFund)}
              </span>
              <span className="text-muted-foreground">emergency fund</span>
            </li>
            <li>
              <span className="money-display block text-[22px] sm:text-[26px]">{days}</span>
              <span className="text-muted-foreground">{days === 1 ? "day" : "days"} planned</span>
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
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
        {/* The route draws in, origin ring to destination dot. */}
        <svg viewBox="0 0 200 120" className="hidden h-[120px] w-full sm:block" aria-hidden>
          <path
            d="M18 98 C 60 96, 62 52, 100 56 S 150 70, 182 20"
            fill="none"
            className="animate-draw stroke-primary"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray="1"
            pathLength={1}
          />
          <circle cx={18} cy={98} r={6} fill="none" className="stroke-primary" strokeWidth={2.5} />
          <circle
            cx={182}
            cy={20}
            r={7}
            className="animate-pop fill-brand-coral [animation-delay:900ms]"
          />
        </svg>
      </div>
    </section>
  );
}
