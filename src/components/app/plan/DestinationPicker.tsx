import { useState } from "react";

import { PlaceInput } from "@/components/app/PlaceInput";
import { FieldError } from "@/components/app/bits";
import { CUSTOM_DESTINATION_ID, getDestination, type TripType } from "@/lib/demo-data";
import type { GeoPlace } from "@/lib/live/geocode";

/**
 * Where to go, as one field. A place picked from the trip ideas (or by the
 * assistant) shows as the chosen place with a Change link; otherwise it's a search
 * box for anywhere in the world. Suggestions live in the trip ideas above the form,
 * so they aren't listed twice.
 */
export function DestinationPicker({
  tripType,
  destinationId,
  customDestination,
  error,
  onPick,
  onCustom,
}: {
  tripType: TripType;
  destinationId: string;
  customDestination: string;
  error: string;
  onPick: (id: string) => void;
  onCustom: (text: string, place: GeoPlace | null) => void;
}) {
  // Focus the search box after "Change", never on page load.
  const [changing, setChanging] = useState(false);
  const label =
    tripType === "cruise" ? "Departure port" : tripType === "staycation" ? "Home base" : "Going to";

  if (destinationId !== CUSTOM_DESTINATION_ID) {
    const d = getDestination(destinationId);
    return (
      <div>
        <p className="mb-2 text-footnote text-muted-foreground">{label}</p>
        <div className="flex h-12 items-center gap-2 rounded-lg bg-fill px-4">
          <span
            className="min-w-0 flex-1 truncate text-body font-semibold"
            title={`${d.name}, ${d.region}`}
          >
            {d.name}
          </span>
          <button
            type="button"
            onClick={() => {
              setChanging(true);
              onPick(CUSTOM_DESTINATION_ID);
            }}
            className="inline-flex h-12 shrink-0 items-center px-2 font-medium text-primary underline-offset-2 hover:underline"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-footnote text-muted-foreground">{label}</p>
      <PlaceInput
        autoFocus={changing}
        aria-label="Destination"
        placeholder={
          tripType === "cruise"
            ? "e.g. Galveston, TX"
            : "A city, park or port, e.g. Chattanooga, TN"
        }
        value={customDestination}
        onChange={(v) => onCustom(v, null)}
        onPickPlace={(p) => onCustom(p.label, p)}
        className="h-12"
      />
      {error && <FieldError id="destination-error">{error}</FieldError>}
    </div>
  );
}
