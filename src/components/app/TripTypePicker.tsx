import { Car, Home, Plane, Ship, TrainFront, type LucideIcon } from "lucide-react";

import { Segmented } from "./motion";
import { TravelScene } from "./TravelScene";
import {
  TRANSPORT_MODES,
  TRIP_TYPES,
  tripTypeInfo,
  type TransportMode,
  type TripType,
} from "@/lib/demo-data";

export const TRIP_ICONS: Record<TripType, LucideIcon> = {
  "road-trip": Car,
  flight: Plane,
  cruise: Ship,
  rail: TrainFront,
  staycation: Home,
};

/**
 * Choosing the kind of trip: the five types, a picture of the journey that plays
 * when the choice changes, and — when a type allows more than one — how you travel.
 * Used by the Plan page and the trip bar, so it looks and moves the same everywhere.
 */
export function TripTypePicker({
  tripType,
  mode,
  onTripType,
  onMode,
  from,
  to,
  compact,
  className,
}: {
  tripType: TripType;
  mode: TransportMode;
  onTripType: (t: TripType) => void;
  onMode: (m: TransportMode) => void;
  from?: string;
  to?: string;
  /** Tighter layout for popovers */
  compact?: boolean;
  className?: string;
}) {
  const info = tripTypeInfo(tripType);
  const modes = TRANSPORT_MODES.filter((m) => info.modes.includes(m.id));
  return (
    <div className={className}>
      <Segmented
        ariaLabel="Trip type"
        size="lg"
        columns={5}
        value={tripType}
        onChange={onTripType}
        className="grid-cols-5"
        options={TRIP_TYPES.map((t) => {
          const Icon = TRIP_ICONS[t.id];
          const short = SHORT_LABEL[t.id];
          return {
            value: t.id,
            // Five across a phone (or a popover) only fit one-word labels.
            label: compact ? (
              short
            ) : (
              <>
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </>
            ),
            icon: <Icon className="size-[18px]" strokeWidth={1.7} />,
          };
        })}
      />
      <TravelScene
        className="mt-3"
        tripType={tripType}
        mode={mode}
        caption={`${info.blurb}.`}
        from={tripType === "staycation" ? "" : (from ?? "")}
        to={to ?? ""}
      />
      {modes.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm text-muted-foreground">{info.modeQuestion}</p>
          <Segmented
            ariaLabel={info.modeQuestion}
            size="sm"
            value={mode}
            onChange={onMode}
            options={modes.map((m) => ({ value: m.id, label: m.label }))}
          />
        </div>
      )}
    </div>
  );
}

/** One-word labels for narrow rows. */
const SHORT_LABEL: Record<TripType, string> = {
  "road-trip": "Road",
  flight: "Fly",
  cruise: "Cruise",
  rail: "Rail",
  staycation: "Home",
};
