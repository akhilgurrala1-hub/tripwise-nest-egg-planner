import { Car, Home, MapPin, Plane, Ship, Sparkles, TrainFront } from "lucide-react";
import type { ReactNode } from "react";

import { stagger } from "@/components/app/motion";
import { PlaceInput } from "@/components/app/PlaceInput";
import { formatMoney } from "@/lib/budget";
import type { GeoPoint } from "@/lib/catalog";
import {
  CUSTOM_DESTINATION_ID,
  DESTINATIONS,
  getDestination,
  type Interest,
  type TripType,
} from "@/lib/demo-data";
import type { GeoPlace } from "@/lib/live/geocode";
import { useLocale } from "@/lib/live/use-locale";
import { interestLabel, recommendDestinations, type Suggestion } from "@/lib/recommend";
import { cn } from "@/lib/utils";

const DISTANCE_ICON: Record<TripType, typeof Car> = {
  "road-trip": Car,
  flight: Plane,
  cruise: Ship,
  rail: TrainFront,
  staycation: Home,
};

/**
 * Where to go: suggestions ranked for this traveler (nearby for road trips, a
 * flight away for fly-aways, the closest ports for cruises, matching their
 * interests), the current pick if it isn't among them, and "Somewhere else".
 */
export function DestinationPicker({
  tripType,
  interests,
  destinationId,
  customDestination,
  from,
  fromLabel,
  error,
  onPick,
  onCustom,
}: {
  tripType: TripType;
  interests: Interest[];
  destinationId: string;
  customDestination: string;
  from: GeoPoint | null;
  fromLabel: string;
  error: string;
  onPick: (id: string) => void;
  onCustom: (text: string, place: GeoPlace | null) => void;
}) {
  const { units } = useLocale();
  const list: Suggestion[] =
    tripType === "staycation"
      ? DESTINATIONS.filter((d) => d.bestFor.includes("staycation")).map(toSuggestion)
      : recommendDestinations({ from, tripType, interests, limit: 5, units });
  // Keep the current pick visible even when it's no longer a top suggestion.
  if (
    destinationId !== CUSTOM_DESTINATION_ID &&
    !list.some((s) => s.id === destinationId) &&
    getDestination(destinationId).bestFor.includes(tripType)
  ) {
    list.unshift(toSuggestion(getDestination(destinationId)));
  }
  const DistanceIcon = DISTANCE_ICON[tripType];

  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-footnote text-muted-foreground">
        <Sparkles className="size-3.5 text-brand-coral" />
        {tripType === "staycation"
          ? "Planned around your home city"
          : from
            ? `Picked for you, starting from ${fromLabel}`
            : "Add where you're starting from for ideas near you"}
      </p>
      <div
        key={`${tripType}:${fromLabel}`}
        className="grid gap-2 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Destination"
      >
        {list.map((d, i) => {
          const dest = getDestination(d.id);
          return (
            <OptionRow
              key={d.id}
              index={i}
              active={destinationId === d.id}
              onClick={() => onPick(d.id)}
              title={d.name}
              meta={d.region}
              detail={
                <>
                  {d.distanceLabel && (
                    <span className="inline-flex items-center gap-1 text-foreground/80">
                      <DistanceIcon className="size-3" /> {d.distanceLabel}
                    </span>
                  )}
                  <span>
                    {dest.cruisePerNight
                      ? `from ${formatMoney(dest.cruisePerNight.budget)} / person / night`
                      : dest.nightly.budget === 0
                        ? "No lodging needed"
                        : `from ${formatMoney(dest.nightly.budget)} / night`}
                  </span>
                </>
              }
              note={
                d.matches.length > 0
                  ? d.matches.slice(0, 2).map(interestLabel).join(" · ")
                  : d.tagline
              }
            />
          );
        })}
        <OptionRow
          index={list.length}
          active={destinationId === CUSTOM_DESTINATION_ID}
          onClick={() => onPick(CUSTOM_DESTINATION_ID)}
          title="Somewhere else"
          meta="Anywhere in the world"
          detail={<span>Distance and costs worked out for you</span>}
          note="Type a city, park or port"
          icon={<MapPin className="size-4" />}
        />
      </div>
      {destinationId === CUSTOM_DESTINATION_ID && (
        <div className="animate-pop mt-4">
          <PlaceInput
            autoFocus
            aria-label="Destination"
            placeholder={
              tripType === "cruise" ? "Departure port, e.g. Galveston, TX" : "e.g. Chattanooga, TN"
            }
            value={customDestination}
            onChange={(v) => onCustom(v, null)}
            onPickPlace={(p) => onCustom(p.label, p)}
            className="h-11"
          />
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

function toSuggestion(d: ReturnType<typeof getDestination>): Suggestion {
  return {
    id: d.id,
    name: d.name,
    region: d.region,
    tagline: d.tagline,
    miles: null,
    distanceLabel: null,
    matches: [],
    featured: true,
  };
}

function OptionRow({
  active,
  onClick,
  title,
  meta,
  detail,
  note,
  icon,
  index,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  meta: string;
  detail: ReactNode;
  note: string;
  icon?: ReactNode;
  index: number;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      style={stagger(index)}
      className={cn(
        "group animate-rise relative flex items-start gap-4 rounded-xl border p-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 pressable active:scale-[0.99]",
        active
          ? "border-primary bg-card ring-3 ring-primary/12"
          : "border-border bg-card hover:border-muted-foreground/40 hover:shadow-[0_2px_8px_oklch(0.2_0.01_260/0.06)]",
      )}
    >
      <span
        className={cn(
          "mt-1 grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-200",
          active ? "border-primary bg-primary" : "border-input",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "size-1.5 rounded-full bg-primary-foreground transition-transform duration-200",
            active ? "scale-100" : "scale-0",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{meta}</span>
        <span className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {detail}
        </span>
        <span className="mt-1 block truncate text-micro text-muted-foreground">{note}</span>
      </span>
    </button>
  );
}
