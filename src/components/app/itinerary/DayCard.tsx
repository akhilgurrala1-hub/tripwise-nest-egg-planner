import {
  AlertTriangle,
  BookOpen,
  CalendarHeart,
  Car,
  Clock,
  Footprints,
  Coffee,
  ExternalLink,
  Landmark,
  MapPin,
  Moon,
  Star,
  Sun,
  Sunrise,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

import { AddItemButton, ItemActions } from "@/components/app/ItineraryEditor";
import { WeatherChip } from "@/components/app/Weather";
import { safeExternalUrl } from "@/lib/booking";
import { formatMoney } from "@/lib/budget";
import { formatCalendarDate } from "@/lib/dates";
import type { Itinerary, ItineraryDay, ItineraryItem, ItemKind, SlotTime } from "@/lib/itinerary";
import { clock, scheduleDay, type TimedStop } from "@/lib/itinerary-schedule";
import { destinationQuery } from "@/lib/live/place";
import type { DayWeather } from "@/lib/live/weather";
import { placeReviewLinks } from "@/lib/reviews";
import { useTrip } from "@/lib/trip-store";

const KIND_ICON: Record<ItemKind, LucideIcon> = {
  sight: Landmark,
  restaurant: UtensilsCrossed,
  stop: Car,
};

const TIME_ICONS: Record<SlotTime, LucideIcon> = {
  Morning: Sunrise,
  Lunch: Coffee,
  Afternoon: Sun,
  Dinner: UtensilsCrossed,
  Evening: Moon,
};

/** One day of the itinerary: its weather, a timeline of stops and the editing controls. */
export function DayCard({
  day,
  dayIndex,
  itinerary,
  weather,
  holiday,
  selectedId,
  onSelect,
  style,
}: {
  day: ItineraryDay;
  dayIndex: number;
  itinerary: Itinerary;
  weather: DayWeather | undefined;
  /** A public holiday on this day, if any */
  holiday?: string | undefined;
  /** The stop highlighted on the map, if any */
  selectedId: string | null;
  onSelect: (id: string) => void;
  style?: CSSProperties;
}) {
  return (
    <section
      className="surface-card render-lazy overflow-hidden print:break-inside-avoid print:shadow-none"
      style={style}
    >
      <header className="flex items-center gap-4 border-b border-border px-6 py-4">
        <span className="tabular grid size-9 shrink-0 place-items-center rounded-lg bg-fill text-footnote font-semibold text-muted-foreground">
          {day.day}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="title-display line-clamp-2 text-title-2">{day.title}</h2>
          <p className="mt-1 text-footnote text-muted-foreground">
            {formatCalendarDate(day.date, { weekday: "long", month: "short", day: "numeric" })}
          </p>
          {holiday && (
            <p className="mt-1 inline-flex items-center gap-1 text-micro font-medium text-[color-mix(in_oklab,var(--primary)_55%,var(--foreground))]">
              <CalendarHeart className="size-3" /> {holiday}: expect closures and crowds
            </p>
          )}
        </div>
        {weather && <WeatherChip day={weather} className="hidden shrink-0 sm:inline-flex" />}
      </header>
      {weather && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2 sm:hidden">
          <WeatherChip day={weather} />
        </div>
      )}
      <ol className="relative px-6 py-4">
        {scheduleDay(day.items).map((stop, idx) => (
          <ItemRow
            key={stop.item.id}
            stop={stop}
            selected={stop.item.id === selectedId}
            onSelect={onSelect}
            last={idx === day.items.length - 1}
            itinerary={itinerary}
            dayIndex={dayIndex}
          />
        ))}
        {day.items.length === 0 && (
          <li className="py-4 text-sm text-muted-foreground">Free day. Wander as you like.</li>
        )}
      </ol>
      <p className="px-6 pb-2 text-caption text-muted-foreground">
        Times are a suggested pace. Travel is estimated from the straight-line distance between
        places that have a published location.
      </p>
      <div className="px-6 pb-4 print:hidden">
        <AddItemButton dayIndex={dayIndex} itinerary={itinerary} />
      </div>
    </section>
  );
}

function ItemRow({
  stop,
  selected,
  onSelect,
  last,
  itinerary,
  dayIndex,
}: {
  stop: TimedStop;
  selected: boolean;
  onSelect: (id: string) => void;
  last: boolean;
  itinerary: Itinerary;
  dayIndex: number;
}) {
  const { item } = stop;
  const Icon = KIND_ICON[item.kind] ?? Landmark;
  const TimeIcon = TIME_ICONS[item.time] ?? Sun;
  return (
    <li
      id={`stop-${item.id}`}
      className={`group relative flex gap-4 py-4 ${selected ? "rounded-lg bg-fill" : ""}`}
    >
      {!last && (
        <span className="absolute top-11 bottom-0 left-[15px] w-px bg-border" aria-hidden />
      )}
      <span className="relative grid size-8 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground/80">
        <Icon className="size-3.5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="tabular inline-flex items-center gap-1 text-caption font-medium text-muted-foreground">
          <TimeIcon className="size-3" aria-hidden /> {item.time} · {clock(stop.start)} to{" "}
          {clock(stop.end)}
        </p>
        {stop.travel && (
          <p className="mt-1 inline-flex items-center gap-1 text-caption text-muted-foreground">
            {stop.travel.mode === "walk" ? (
              <Footprints className="size-3" aria-hidden />
            ) : (
              <Car className="size-3" aria-hidden />
            )}
            About {stop.travel.minutes} min {stop.travel.mode === "walk" ? "walk" : "drive"} from
            the stop before (estimate)
          </p>
        )}
        <p className="mt-1 text-sm leading-snug font-medium">
          {item.name}
          <SourceTag item={item} />
          {item.lat !== undefined && item.lon !== undefined && (
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-pressed={selected}
              aria-label={`Show ${item.name} on the map`}
              className="ml-2 inline-flex min-h-6 items-center gap-1 rounded-md px-1 text-caption font-normal text-primary print:hidden"
            >
              <MapPin className="size-3" aria-hidden /> Map
            </button>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.area}
          {item.note ? ` · ${item.note}` : ""}
        </p>
        {stop.warnings.map((w) => (
          <p key={w} className="mt-1 flex items-start gap-1 text-caption text-foreground">
            <AlertTriangle className="size-3 shrink-0" aria-hidden />
            <span>{w}</span>
          </p>
        ))}
        {(item.hours || item.source === "wikivoyage") && (
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {item.source === "wikivoyage" && (
              <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                <BookOpen className="size-3" aria-hidden /> Travel guide pick
              </span>
            )}
            {item.hours && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden /> {item.hours}
              </span>
            )}
          </p>
        )}
        {item.placeId && !item.custom ? (
          <PlaceLinks item={item} />
        ) : (
          (item.rating || item.mapsUrl) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {item.rating ? (
                <span className="tabular inline-flex items-center gap-1 font-semibold">
                  <Star className="size-3 fill-current text-gold" aria-hidden />{" "}
                  {item.rating.toFixed(1)}
                  {item.ratingCount ? (
                    <span className="font-normal text-muted-foreground">
                      ({item.ratingCount.toLocaleString()} reviews)
                    </span>
                  ) : null}
                </span>
              ) : null}
              {item.mapsUrl && (
                <a
                  href={safeExternalUrl(item.mapsUrl ?? "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Open in Google Maps <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </p>
          )
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        <span className="tabular min-w-16 pt-2 text-right">
          <CostChip item={item} />
        </span>
        <span className="print:hidden">
          <ItemActions item={item} itinerary={itinerary} dayIndex={dayIndex} />
        </span>
      </div>
    </li>
  );
}

/** A real place's rating, its map, and where to read what people say about it. */
function PlaceLinks({ item }: { item: ItineraryItem }) {
  const { trip, dest } = useTrip();
  const near = destinationQuery(dest, trip.setup.origin);
  const links = placeReviewLinks(item.name, near, item.mapsUrl);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs print:hidden">
      {item.rating ? (
        <span className="tabular inline-flex items-center gap-1 font-semibold">
          <Star className="size-3 fill-current text-gold" aria-hidden /> {item.rating.toFixed(1)}
          {item.ratingCount ? (
            <span className="font-normal text-muted-foreground">
              ({item.ratingCount.toLocaleString()} reviews)
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="text-muted-foreground">Reviews:</span>
      {links.map((l) => (
        <a
          key={l.site}
          href={safeExternalUrl(l.url)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${l.label} for ${item.name}`}
          className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
        >
          {l.label} <ExternalLink className="size-3" aria-hidden />
        </a>
      ))}
    </p>
  );
}

/** The plan's label says where suggestions came from; the traveler's own stops are marked here. */
function SourceTag({ item }: { item: ItineraryItem }) {
  if (!item.custom) return null;
  return (
    <span className="ml-2 inline-flex -translate-y-px items-center rounded-xs border border-border px-2 text-micro font-medium text-muted-foreground">
      Yours
    </span>
  );
}

function CostChip({ item }: { item: ItineraryItem }) {
  if (item.costSource === "unknown") {
    return <span className="text-xs text-muted-foreground">Price not listed</span>;
  }
  if (item.costPerPerson === 0) {
    return <span className="text-xs font-medium text-success">Free</span>;
  }
  const approx = item.costSource === "price-level" ? "~" : "";
  return (
    <span
      className="tabular text-xs font-medium text-foreground"
      title={
        item.priceText
          ? `Listed price: ${item.priceText}`
          : item.costSource === "price-level"
            ? "Estimated from the listing's price level"
            : undefined
      }
    >
      {approx}
      {formatMoney(item.costPerPerson)}/pp
    </span>
  );
}
