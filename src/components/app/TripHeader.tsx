import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Info } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";

import { RouteMark } from "./Illustrations";
import { TRIP_COLOR } from "./trip-colors";
import { TRIP_ICONS, TripTypePicker } from "./TripTypePicker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCalendarDate } from "@/lib/dates";
import { tripTypeInfo } from "@/lib/demo-data";
import { tripActions, useTrip } from "@/lib/trip-store";

/** "Dec 3 – 6, 2026", "Dec 30, 2026 – Jan 2, 2027" or "Dec 3, 2026" — never shifted by the viewer's time zone. */
export function formatDateRange(start: string, end: string) {
  const full = { month: "short", day: "numeric", year: "numeric" } as const;
  const monthDay = { month: "short", day: "numeric" } as const;
  if (start === end) return formatCalendarDate(start, full);
  if (start.slice(0, 4) !== end.slice(0, 4))
    return `${formatCalendarDate(start, full)} – ${formatCalendarDate(end, full)}`;
  // Same month: "Dec 3 – 6, 2026" (built by hand: Intl has no clean day-and-year-only format).
  if (start.slice(0, 7) === end.slice(0, 7))
    return `${formatCalendarDate(start, monthDay)} – ${Number(end.slice(8, 10))}, ${end.slice(0, 4)}`;
  return `${formatCalendarDate(start, monthDay)} – ${formatCalendarDate(end, full)}`;
}

/**
 * Page title plus the trip it's about. The trip bar is the same on every planning
 * page: trip type (switchable in place), destination, dates and travelers, with a
 * link back to the full setup.
 */
export function PageHeader({
  title,
  children,
  showTrip = true,
  sampleBanner = "line",
}: {
  title: string;
  children?: ReactNode;
  /** Account pages aren't about the current trip */
  showTrip?: boolean;
  /** How loudly to say this is the sample trip: a full card (Overview) or one line */
  sampleBanner?: "card" | "line";
}) {
  const { trip } = useTrip();
  const sample = showTrip && trip.isSample;
  return (
    // The top of every page is a white band, as on apple.com; the content below sits on gray.
    <div className="band pb-10 sm:pb-12">
      <div className="page-container pt-8 sm:pt-16">
        {sample && sampleBanner === "card" && (
          <section className="mb-8 grid rounded-2xl bg-background grid-cols-[56px_1fr] items-center gap-4 p-6 sm:grid-cols-[72px_1fr_auto] sm:gap-6 sm:p-6 print:hidden">
            <RouteMark className="w-14 sm:w-[72px]" />
            <div className="min-w-0">
              <h2 className="text-headline font-semibold">This is a sample trip. Make it yours.</h2>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                Pick where you're going, your dates and your budget. Everything on these pages
                updates to match.
              </p>
            </div>
            <Button
              asChild
              variant="go"
              size="lg"
              className="col-span-2 w-full sm:col-span-1 sm:w-auto"
            >
              <Link to="/">
                Plan your own trip <ArrowRight />
              </Link>
            </Button>
          </section>
        )}
        {sample && sampleBanner === "line" && (
          <p className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-muted-foreground print:hidden">
            <Info className="size-3.5 shrink-0" />
            You're looking at a sample trip.
            <Link to="/" className="link-chevron font-semibold">
              Plan your own
            </Link>
          </p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="title-display text-large-title sm:text-display">{title}</h1>
            {showTrip && <TripBar title={title} />}
          </div>
          <div className="contents print:hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}

function TripBar({ title }: { title: string }) {
  const { trip, place, shape } = useTrip();
  // Plain facts separated by dots: the words say what they are, no icon needed.
  const facts = [
    title !== place ? place : null, // not twice: the Overview's title already is the place
    formatDateRange(trip.setup.startDate, trip.setup.endDate),
    shape.days === 1 ? "day trip" : `${shape.days} days`,
    `${shape.travelers} traveler${shape.travelers > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-footnote">
      <TripTypeChip />
      <p className="tabular min-w-0 truncate text-muted-foreground">{facts.join(" · ")}</p>
      <Link
        to="/"
        className="inline-flex h-8 items-center rounded-md px-1 font-medium text-primary hover:underline hover:underline-offset-4 print:hidden"
      >
        Edit trip
      </Link>
    </div>
  );
}

/** The trip type, switchable from any page: the budget is re-estimated and the change explained. */
function TripTypeChip() {
  const { trip, dest } = useTrip();
  const [open, setOpen] = useState(false);
  const Icon = TRIP_ICONS[trip.setup.tripType];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        style={{ "--tile": TRIP_COLOR[trip.setup.tripType] } as CSSProperties}
        className="inline-flex h-8 items-center gap-2 rounded-md bg-[color-mix(in_oklab,var(--tile)_12%,transparent)] px-2 font-semibold transition-colors hover:bg-[color-mix(in_oklab,var(--tile)_20%,transparent)] data-[state=open]:ring-2 data-[state=open]:ring-[var(--tile)]"
      >
        <Icon
          className="size-3.5"
          style={{ color: TRIP_COLOR[trip.setup.tripType] }}
          strokeWidth={2}
        />
        {tripTypeInfo(trip.setup.tripType).label}
        <ChevronDown className="size-3.5 text-muted-foreground print:hidden" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Switch trip type"
        className="w-[min(420px,calc(100vw-2rem))] rounded-xl p-4"
      >
        <p className="px-1 pb-2 text-footnote text-muted-foreground">
          Switch trip type. The budget updates to match.
        </p>
        <TripTypePicker
          compact
          tripType={trip.setup.tripType}
          mode={trip.setup.transportMode}
          from={trip.setup.origin.split(",")[0]?.trim() || "Home"}
          to={dest.name}
          onTripType={(t) => {
            const [headline, ...details] = tripActions.setTripType(t);
            if (headline)
              toast.success(
                headline,
                details.length ? { description: details.join(" ") } : undefined,
              );
          }}
          onMode={(m) => tripActions.setTransportMode(m)}
        />
      </PopoverContent>
    </Popover>
  );
}
