import { Car, Home, MapPin, Plane, Ship, TrainFront, Check } from "lucide-react";
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
import { FieldError } from "@/components/app/bits";
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
        {tripType === "staycation"
          ? "Planned around your home city"
          : from
            ? `Picked for you, starting from ${fromLabel}`
            : "Add where you're starting from for ideas near you"}
      </p>
      <div
        key={`${tripType}:${fromLabel}`}
        // A grouped list: one row per place, a checkmark on the chosen one.
        className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-soft-value)] dark:border dark:border-separator"
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
                    <span className="inline-flex items-center gap-1 text-foreground">
                      <DistanceIcon className="size-3.5" /> {d.distanceLabel}
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
          detail={<span>Costs worked out</span>}
          note="Type a city, park or port"
          icon={<MapPin className="size-4" />}
        />
      </div>
      {destinationId === CUSTOM_DESTINATION_ID && (
        <div className="mt-4">
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
          {error && <FieldError id="destination-error">{error}</FieldError>}
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
      className="group relative flex min-h-16 w-full items-center gap-4 px-4 py-2 text-left transition-colors duration-150 hover:bg-fill active:bg-fill"
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "flex items-center gap-2 text-body",
            active ? "font-semibold" : "font-medium",
          )}
        >
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <span className="mt-1 block truncate text-footnote text-muted-foreground">
          {meta}
          {note ? ` · ${note}` : ""}
        </span>
      </span>
      <span className="tabular hidden shrink-0 flex-col items-end gap-1 text-right text-footnote text-muted-foreground sm:flex">
        {detail}
      </span>
      <Check
        aria-hidden
        className={cn(
          "size-5 shrink-0 text-primary transition-[opacity,scale] duration-150",
          active ? "scale-100 opacity-100" : "scale-75 opacity-0",
        )}
      />
      {/* Separator, inset to where the text starts. */}
      <span
        aria-hidden
        className="absolute right-0 bottom-0 left-4 h-px bg-separator group-last:hidden"
      />
    </button>
  );
}
