import { Loader2, LocateFixed } from "lucide-react";
import { useState } from "react";

import { PlaceInput } from "@/components/app/PlaceInput";
import { Button } from "@/components/ui/button";
import type { GeoPoint } from "@/lib/catalog";
import { useHomePlace } from "@/lib/live/use-home";

/** Where the trip starts: typed, picked from suggestions, or the device's location on request. */
export function OriginField({
  id,
  value,
  label,
  approximate,
  onChange,
}: {
  id: string;
  value: string;
  label: string;
  /** The value came from the connection's approximate city */
  approximate: boolean;
  onChange: (text: string, point: GeoPoint | null) => void;
}) {
  const { locate, locating } = useHomePlace();
  const [error, setError] = useState("");
  return (
    <div>
      <label htmlFor={id} className="text-[13px] text-muted-foreground">
        {label}
      </label>
      <div className="mt-1.5 flex gap-2">
        <div className="min-w-0 flex-1">
          <PlaceInput
            id={id}
            placeholder="City, e.g. Charlotte, NC"
            value={value}
            onChange={(v) => {
              setError("");
              onChange(v, null);
            }}
            onPickPlace={(p) => onChange(p.label, { lat: p.lat, lon: p.lon })}
            className="h-11"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0"
          disabled={locating}
          onClick={async () => {
            setError("");
            try {
              const p = await locate();
              onChange(p.label, { lat: p.lat, lon: p.lon });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't get your location.");
            }
          }}
        >
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          <span className="hidden sm:inline">{locating ? "Locating…" : "Use my location"}</span>
          <span className="sr-only sm:hidden">Use my location</span>
        </Button>
      </div>
      <p
        className={
          error ? "mt-1.5 text-xs text-destructive" : "mt-1.5 text-xs text-muted-foreground"
        }
      >
        {error ||
          (approximate
            ? "Approximate, from your connection. Use your location or type your city to be exact."
            : "Suggestions, distances and drive costs are worked out from here.")}
      </p>
    </div>
  );
}
