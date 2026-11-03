import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, Info, MapPin, Pencil, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { TRIP_COLOR } from "./trip-colors";
import { TRIP_ICONS, TripTypePicker } from "./TripTypePicker";
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
  eyebrow,
  title,
  children,
  showTrip = true,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  /** Account pages aren't about the current trip */
  showTrip?: boolean;
}) {
  const { trip } = useTrip();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:pt-10">
      {showTrip && trip.isSample && (
        <p className="mb-6 flex items-center gap-2 text-[13px] text-muted-foreground print:hidden">
          <Info className="size-3.5 shrink-0" />
          <span>
            You're looking at a sample trip.{" "}
            <Link
              to="/"
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Plan your own
            </Link>
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-1 text-[28px] leading-tight font-semibold sm:text-[32px]">{title}</h1>
          {showTrip && <TripBar />}
        </div>
        <div className="contents print:hidden">{children}</div>
      </div>
    </div>
  );
}

function TripBar() {
  const { trip, dest, shape } = useTrip();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]">
      <TripTypeChip />
      <Chip icon={<MapPin />}>{dest.name}</Chip>
      <Chip icon={<CalendarDays />}>
        {formatDateRange(trip.setup.startDate, trip.setup.endDate)}
        <span className="text-muted-foreground">
          {" "}
          · {shape.days === 1 ? "day trip" : `${shape.days} days`}
        </span>
      </Chip>
      <Chip icon={<Users />}>
        {shape.travelers} traveler{shape.travelers > 1 ? "s" : ""}
      </Chip>
      <Link
        to="/"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground print:hidden"
      >
        <Pencil className="size-3.5" /> Edit trip
      </Link>
    </div>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="tabular inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** The trip type, switchable from any page: the budget is re-estimated and the change explained. */
function TripTypeChip() {
  const { trip, dest } = useTrip();
  const [open, setOpen] = useState(false);
  const Icon = TRIP_ICONS[trip.setup.tripType];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 font-medium transition-colors hover:border-muted-foreground/40 data-[state=open]:border-primary data-[state=open]:ring-3 data-[state=open]:ring-primary/12">
        <Icon
          className="size-3.5"
          style={{ color: TRIP_COLOR[trip.setup.tripType] }}
          strokeWidth={2}
        />
        {tripTypeInfo(trip.setup.tripType).label}
        <ChevronDown className="size-3.5 text-muted-foreground print:hidden" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(420px,calc(100vw-2rem))] rounded-xl p-3">
        <p className="px-1 pb-2.5 text-[13px] text-muted-foreground">
          Switch trip type — the budget is re-estimated for it.
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
