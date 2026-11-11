import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Info } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";

import { TRIP_COLOR } from "./trip-colors";
import { TRIP_ICONS, TripTypePicker } from "./TripTypePicker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCalendarDate } from "@/lib/dates";
import { tripTypeInfo } from "@/lib/demo-data";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

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

/** Each page's next step for the trip, a button beside the title. */
const NEXT_STEP: Record<string, { label: string; to: "/book" | "/itinerary" | "/dashboard" }> = {
  "/dashboard": { label: "See the days", to: "/itinerary" },
  "/budget": { label: "Book", to: "/book" },
  "/spending": { label: "Book", to: "/book" },
  "/itinerary": { label: "Book", to: "/book" },
  "/road-trip": { label: "Book", to: "/book" },
  "/book": { label: "Overview", to: "/dashboard" },
};

/**
 * Page title plus the trip it's about. The trip bar is the same on every planning
 * page: trip type (switchable in place), destination, dates and travelers, with a
 * link back to the full setup.
 */
/** The last word of a title colored, the way the brand sets one word of every headline. */
function accentTitle(title: string): ReactNode {
  const i = title.lastIndexOf(" ");
  if (i < 0) return title;
  return (
    <>
      {title.slice(0, i + 1)}
      <em>{title.slice(i + 1)}</em>
    </>
  );
}

export function PageHeader({
  title,
  children,
  showTrip = true,
}: {
  title: string;
  children?: ReactNode;
  /** Account pages aren't about the current trip */
  showTrip?: boolean;
}) {
  const { trip } = useTrip();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const next = showTrip ? NEXT_STEP[pathname] : undefined;
  const sample = showTrip && trip.isSample;
  return (
    // An editorial page header: a mono label, the title, the trip it's about and the page's actions.
    <div className="border-b border-separator pb-8 sm:pb-12">
      <div className="page-container pt-8 sm:pt-14">
        {sample && (
          <p className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-muted-foreground print:hidden">
            <Info className="size-3.5 shrink-0" />
            You're looking at a sample trip.
            <Link to="/" className="link-chevron font-medium">
              Plan your own
            </Link>
          </p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <h1 className="title-display text-large-title">{accentTitle(title)}</h1>
            {showTrip && <TripBar title={title} />}
          </div>
          <div
            className={cn(
              "w-full flex-wrap items-center gap-2 sm:w-auto print:hidden",
              // Phones move between pages with the tab bar, so a header with only the next step hides it.
              children ? "flex" : "hidden sm:flex",
            )}
          >
            {children}
            {next && (
              <Button asChild variant="go" className="hidden sm:inline-flex">
                <Link to={next.to}>
                  {next.label} <ArrowRight />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TripBar({ title }: { title: string }) {
  const { trip, place, shape } = useTrip();
  // Plain facts separated by dots: the words say what they are, no icon needed.
  const facts = [
    formatDateRange(trip.setup.startDate, trip.setup.endDate),
    shape.days === 1 ? "day trip" : `${shape.days} days`,
    `${shape.travelers} traveler${shape.travelers > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-footnote sm:mt-4 sm:gap-y-2">
      <TripTypeChip />
      <p className="tabular min-w-0 text-muted-foreground">
        {/* The place is in the sidebar and the sample note on phones; not twice on the Overview. */}
        {title !== place && <span className="hidden sm:inline">{place} · </span>}
        {facts.join(" · ")}
        <span aria-hidden> · </span>
        <Link
          to="/"
          className="font-medium text-primary hover:underline hover:underline-offset-4 print:hidden"
        >
          Edit trip
        </Link>
      </p>
    </div>
  );
}

/** The trip type, switchable from any page: the budget is re-estimated and the change explained. */
function TripTypeChip() {
  const { trip } = useTrip();
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
