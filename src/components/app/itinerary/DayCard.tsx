import {
  AlertTriangle,
  BookOpen,
  CalendarHeart,
  Car,
  Clock,
  Footprints,
  GripVertical,
  Coffee,
  ExternalLink,
  Landmark,
  MapPin,
  Moon,
  Star,
  Sun,
  Sunrise,
  UtensilsCrossed,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { useState, type CSSProperties, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { locateItem } from "@/lib/itinerary-edit";
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
import { tripActions, useTrip } from "@/lib/trip-store";

/** The drag carries only an item id, under this type, so nothing else can be dropped on a day. */
const DRAG_TYPE = "application/x-waypoint-item";

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
  onEditDay,
  busy,
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
  /** Ask the AI to change just this day (signed-in travelers); absent when it can't */
  onEditDay?: ((text: string) => void) | undefined;
  busy?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section
      className="surface-card render-lazy overflow-hidden print:break-inside-avoid print:shadow-none"
      style={style}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
      }}
      onDrop={(e) => {
        // Dropped on the card itself (not on a stop): the stop moves to this day, keeping its time slot.
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (!id) return;
        e.preventDefault();
        const from = locateItem(itinerary, id);
        if (from && from.dayIndex !== dayIndex) tripActions.moveItineraryItemToDay(id, dayIndex);
      }}
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
      {onEditDay && <EditDay day={day.day} busy={busy ?? false} onEdit={onEditDay} />}
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
  const [over, setOver] = useState(false);
  const Icon = KIND_ICON[item.kind] ?? Landmark;
  const TimeIcon = TIME_ICONS[item.time] ?? Sun;
  return (
    <li
      id={`stop-${item.id}`}
      className={`group relative flex gap-4 py-4 ${selected ? "rounded-lg bg-fill" : ""} ${over ? "outline-2 -outline-offset-2 outline-primary rounded-lg" : ""}`}
      onDragOver={(e: DragEvent) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        const from = id ? locateItem(itinerary, id) : null;
        if (!from) return;
        // Same day: take this stop's place. Another day: the card's drop handler moves it.
        if (from.dayIndex === dayIndex) {
          e.preventDefault();
          e.stopPropagation();
          const to = itinerary.days[dayIndex]!.items.findIndex((i) => i.id === item.id);
          tripActions.reorderItineraryItem(id, to);
        }
      }}
    >
      {!last && (
        <span className="absolute top-11 bottom-0 left-[15px] w-px bg-border" aria-hidden />
      )}
      <span
        draggable
        onDragStart={(e: DragEvent) => {
          e.dataTransfer.setData(DRAG_TYPE, item.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        title="Drag to move this stop (or use the arrows)"
        aria-hidden
        className="absolute top-5 -left-4 hidden cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 sm:block print:hidden"
      >
        <GripVertical className="size-4" />
      </span>
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

const DAY_IDEAS = ["Make it cheaper", "More outdoor time", "A slower morning", "Closer together"];

/** Change just this day in plain words. The AI sees the whole plan but only this day is replaced. */
function EditDay({
  day,
  busy,
  onEdit,
}: {
  day: number;
  busy: boolean;
  onEdit: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const submit = (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    onEdit(v);
    setText("");
    setOpen(false);
  };
  return (
    <div className="px-6 pb-2 print:hidden">
      {!open ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} disabled={busy}>
          <Pencil /> Change day {day} in plain words
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-fill p-1 pl-4 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit(text);
                if (e.key === "Escape") setOpen(false);
              }}
              maxLength={220}
              placeholder={`What should change on day ${day}?`}
              aria-label={`What should change on day ${day}?`}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button
              size="sm"
              variant="ink"
              disabled={!text.trim() || busy}
              onClick={() => submit(text)}
            >
              Change
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {DAY_IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                disabled={busy}
                onClick={() => submit(idea)}
                className="h-8 rounded-lg bg-muted px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {idea}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <p className="text-caption text-muted-foreground">
            Only day {day} changes, and the stops you added stay. New suggestions are not verified:
            check hours and prices before you go.
          </p>
        </div>
      )}
    </div>
  );
}
