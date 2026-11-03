import { CalendarHeart } from "lucide-react";

import { formatCalendarDate } from "@/lib/dates";
import type { DemoDestination } from "@/lib/demo-data";
import { useDestinationSummary, useTripHolidays } from "@/lib/live/use-open-data";
import { cn } from "@/lib/utils";

/**
 * A destination's photo and short introduction from Wikipedia (free). The source
 * is credited by linking the photo and a "Read more" link to the article.
 */
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
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Photo from Wikipedia"
          className="relative block overflow-hidden rounded-lg bg-muted"
        >
          <img
            src={s.image}
            alt={s.title}
            loading="lazy"
            decoding="async"
            className="aspect-[16/9] w-full object-cover"
          />
        </a>
      )}
      {showText && (
        <figcaption className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          {s.extract}{" "}
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Wikipedia article"
            className="font-medium whitespace-nowrap text-primary underline-offset-2 hover:underline"
          >
            Read more
          </a>
        </figcaption>
      )}
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
  const summary = useDestinationSummary(dest, origin);
  return (
    <section className={cn("surface-card p-5", className)}>
      <h2 className="text-[15px] font-semibold">About {dest.name}</h2>
      {summary.data ? (
        <DestinationPhoto dest={dest} origin={origin} className="mt-3" />
      ) : (
        // Until (or unless) the introduction loads, the place's own short description.
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {dest.region ? `${dest.region}. ` : ""}
          {dest.tagline}
        </p>
      )}
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
        Expect closures and bigger crowds, so book popular spots ahead.
      </p>
    </div>
  );
}
