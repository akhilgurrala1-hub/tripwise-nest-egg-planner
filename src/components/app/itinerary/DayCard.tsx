import {
  BookOpen,
  CalendarHeart,
  Car,
  Clock,
  Coffee,
  ExternalLink,
  Landmark,
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
import { destinationQuery } from "@/lib/live/place";
import { isWetDay, type DayWeather } from "@/lib/live/weather";
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
  style,
}: {
  day: ItineraryDay;
  dayIndex: number;
  itinerary: Itinerary;
  weather: DayWeather | undefined;
  /** A public holiday on this day, if any */
  holiday?: string | undefined;
  style?: CSSProperties;
}) {
  return (
    <section
      className="surface-card animate-rise render-lazy overflow-hidden print:break-inside-avoid print:shadow-none"
      style={style}
    >
      <header className="flex items-center gap-4 border-b border-border px-6 py-4">
        <span className="tabular grid size-9 shrink-0 place-items-center rounded-lg bg-fill text-footnote font-semibold text-muted-foreground">
          {day.day}
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">
            {formatCalendarDate(day.date, { weekday: "long", month: "short", day: "numeric" })}
          </p>
          <h2 className="title-display line-clamp-2 text-title-2">{day.title}</h2>
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
      {weather && isWetDay(weather) && (
        <p className="border-b border-border bg-shield-soft px-6 py-2 text-xs">
          {weather.label}{" "}
          {weather.source === "forecast" ? "in the forecast" : "is common on this date"}. Have an
          indoor backup (a museum, market or long lunch) ready for outdoor stops.
        </p>
      )}
      <ol className="relative px-6 py-4">
        {day.items.map((item, idx) => (
          <ItemRow
            key={item.id}
            item={item}
            last={idx === day.items.length - 1}
            itinerary={itinerary}
            dayIndex={dayIndex}
          />
        ))}
        {day.items.length === 0 && (
          <li className="py-4 text-sm text-muted-foreground">Free day. Wander as you like.</li>
        )}
      </ol>
      <div className="px-6 pb-4 print:hidden">
        <AddItemButton dayIndex={dayIndex} itinerary={itinerary} />
      </div>
    </section>
  );
}

function ItemRow({
  item,
  last,
  itinerary,
  dayIndex,
}: {
  item: ItineraryItem;
  last: boolean;
  itinerary: Itinerary;
  dayIndex: number;
}) {
  const Icon = KIND_ICON[item.kind] ?? Landmark;
  const TimeIcon = TIME_ICONS[item.time] ?? Sun;
  return (
    <li className="group relative flex gap-4 py-4">
      {!last && (
        <span className="absolute top-11 bottom-0 left-[15px] w-px bg-border" aria-hidden />
      )}
      <span className="relative grid size-8 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground/80">
        <Icon className="size-3.5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow inline-flex items-center gap-1">
          <TimeIcon className="size-3" aria-hidden /> {item.time}
        </p>
        <p className="mt-1 text-sm leading-snug font-medium">
          {item.name}
          <SourceTag item={item} />
        </p>
        <p className="text-xs text-muted-foreground">
          {item.area}
          {item.note ? ` · ${item.note}` : ""}
        </p>
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
        <span className="pt-2">
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
          href={l.url}
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
