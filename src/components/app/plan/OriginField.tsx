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
  found,
  onChange,
}: {
  id: string;
  value: string;
  label: string;
  /** The value came from the connection's approximate city */
  approximate: boolean;
  /** For a typed city: the place it was matched to, "none" if nothing matched, null while unknown */
  found: string | null;
  onChange: (text: string, point: GeoPoint | null) => void;
}) {
  const home = useHomePlace();
  const { locate, locating } = home;
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  return (
    <div>
      <label htmlFor={id} className="text-footnote text-muted-foreground">
        {label}
      </label>
      <div className="mt-2 flex gap-2">
        <div className="min-w-0 flex-1">
          <PlaceInput
            id={id}
            placeholder="City, e.g. Charlotte, NC"
            value={value}
            onChange={(v) => {
              setError("");
              setNote("");
              onChange(v, null);
            }}
            onPickPlace={(p) => {
              setError("");
              setNote("");
              onChange(p.label, { lat: p.lat, lon: p.lon });
            }}
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
            setNote("");
            try {
              const p = await locate();
              onChange(p.label, { lat: p.lat, lon: p.lon });
              setNote(`Using your location: ${p.label}.`);
            } catch (e) {
              const message = e instanceof Error ? e.message : "Couldn't get your location.";
              const approx = home.approximate;
              if (approx) {
                // Better than nothing: the city the connection comes from.
                onChange(approx.label, { lat: approx.lat, lon: approx.lon });
                setError(
                  `${message} For now we're using ${approx.label}, the approximate city of your connection.`,
                );
              } else setError(message);
            }
          }}
        >
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          <span className="hidden sm:inline">{locating ? "Locating…" : "Use my location"}</span>
          <span className="sr-only sm:hidden">Use my location</span>
        </Button>
      </div>
      <p className={error ? "mt-2 text-xs text-destructive" : "mt-2 text-xs text-muted-foreground"}>
        {error ||
          note ||
          (found === "none"
            ? "We couldn't find that city. Check the spelling, or pick one from the list as you type."
            : found
              ? `Starting from ${found}. Not right? Pick your city from the list as you type.`
              : approximate
                ? "Approximate, from your connection. Use your location or type your city to be exact."
                : "Suggestions, distances and drive costs are worked out from here.")}
      </p>
    </div>
  );
}
