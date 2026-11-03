import { CalendarHeart, ExternalLink } from "lucide-react";

import { formatCalendarDate } from "@/lib/dates";
import type { DemoDestination } from "@/lib/demo-data";
import { useDestinationSummary, useTripHolidays } from "@/lib/live/use-open-data";
import { cn } from "@/lib/utils";

/** A destination's photo and two-line introduction from Wikipedia (free, credited). */
export function DestinationPhoto({
  dest,
  origin,
  className,
  showText = true,
}: {
  dest: DemoDestination;
  origin: string;
  className?: string;
  showText?: boolean;
}) {
  const q = useDestinationSummary(dest, origin);
  const s = q.data;
  if (!s) return null;
  return (
    <figure className={cn("animate-pop", className)}>
      {s.image && (
        <div className="relative overflow-hidden rounded-lg bg-muted">
          <img
            src={s.image}
            alt={s.title}
            loading="lazy"
            decoding="async"
            className="aspect-[16/9] w-full object-cover"
          />
        </div>
      )}
      {showText && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{s.extract}</p>
      )}
      <figcaption className="mt-1.5 text-[11px] text-muted-foreground">
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
        >
          {s.image ? "Photo and text" : "Text"} from Wikipedia <ExternalLink className="size-3" />
        </a>
      </figcaption>
    </figure>
  );
}

/** About the destination: photo, introduction and any public holidays during the trip. */
export function DestinationCard({
  dest,
  origin,
  className,
}: {
  dest: DemoDestination;
  origin: string;
  className?: string;
}) {
  const holidays = useTripHolidays();
  return (
    <section className={cn("surface-card p-5", className)}>
      <h2 className="text-[15px] font-semibold">About {dest.name}</h2>
      <DestinationPhoto dest={dest} origin={origin} className="mt-3" />
      <HolidayList holidays={holidays} className="mt-4" />
    </section>
  );
}

export function HolidayList({
  holidays,
  className,
}: {
  holidays: ReturnType<typeof useTripHolidays>;
  className?: string;
}) {
  if (holidays.length === 0) return null;
  return (
    <div className={cn("animate-pop rounded-lg border border-border p-3", className)}>
      <p className="flex items-center gap-1.5 text-[13px] font-medium">
        <CalendarHeart className="size-4 text-brand-coral" /> Public holiday
        {holidays.length > 1 ? "s" : ""} during your trip
      </p>
      <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
        {holidays.map((h) => (
          <li key={h.date + h.name}>
            <span className="font-medium text-foreground">
              {formatCalendarDate(h.date, { weekday: "short", month: "short", day: "numeric" })}
            </span>{" "}
            · {h.name}
            {h.localName && h.localName !== h.name ? ` (${h.localName})` : ""}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Expect closures and bigger crowds — book popular spots ahead.
      </p>
    </div>
  );
}
