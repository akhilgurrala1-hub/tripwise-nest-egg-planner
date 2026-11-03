import { Minus, Plus, X } from "lucide-react";

import { PlaceInput } from "@/components/app/PlaceInput";
import { Button } from "@/components/ui/button";
import { MAX_CITIES, citySchedule, type TripCity } from "@/lib/multi-city";

/**
 * The cities after the destination on a multi-city trip, in order, with nights in
 * each. The destination keeps whatever nights are left, shown as a route.
 */
export function CitiesEditor({
  mainName,
  totalNights,
  cities,
  onChange,
}: {
  mainName: string;
  totalNights: number;
  cities: TripCity[];
  onChange: (cities: TripCity[]) => void;
}) {
  const legs = citySchedule(totalNights, { name: mainName, point: null }, cities);
  const used = cities.reduce((t, c) => t + c.nights, 0);
  const tooMany = cities.length > 0 && used > totalNights - 1;
  const set = (i: number, patch: Partial<TripCity>) =>
    onChange(cities.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const canAdd = cities.length < MAX_CITIES - 1 && totalNights >= cities.length + 2;

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <p className="text-[13px] text-muted-foreground">More cities on this trip</p>
        {cities.length > 0 && (
          <p className="tabular text-xs text-muted-foreground">
            {legs
              .map((l) => `${l.name.split(",")[0]}, ${l.nights} night${l.nights === 1 ? "" : "s"}`)
              .join(" → ")}
          </p>
        )}
      </div>
      {cities.length > 0 && (
        <ol className="mt-2 space-y-2">
          {cities.map((c, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <span
                aria-hidden
                className="font-mono w-6 shrink-0 text-center text-[12px] text-coral-text"
              >
                {String(i + 2).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-auto">
                <PlaceInput
                  aria-label={`City ${i + 2}`}
                  placeholder="e.g. Florence, Italy"
                  value={c.name}
                  onChange={(name) => set(i, { name, point: null })}
                  onPickPlace={(p) => set(i, { name: p.label, point: { lat: p.lat, lon: p.lon } })}
                  className="h-11 w-full"
                />
              </div>
              <div className="ml-8 flex h-11 items-center rounded-lg border border-input bg-card sm:ml-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={`Fewer nights in city ${i + 2}`}
                  disabled={c.nights <= 1}
                  onClick={() => set(i, { nights: Math.max(1, c.nights - 1) })}
                >
                  <Minus />
                </Button>
                <span className="tabular w-16 text-center text-[13px]">
                  {c.nights} night{c.nights === 1 ? "" : "s"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={`More nights in city ${i + 2}`}
                  disabled={used >= totalNights - 1}
                  onClick={() => set(i, { nights: c.nights + 1 })}
                >
                  <Plus />
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 text-muted-foreground"
                aria-label={`Remove city ${i + 2}`}
                onClick={() => onChange(cities.filter((_, k) => k !== i))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}
      {tooMany && (
        <p className="mt-2 text-xs text-destructive">
          That's more nights than the trip has. Add days, or take a night from another city.
        </p>
      )}
      {canAdd ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => onChange([...cities, { name: "", nights: 1, point: null }])}
        >
          <Plus /> Add another city
        </Button>
      ) : (
        cities.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            A longer trip can visit more than one city.
          </p>
        )
      )}
    </div>
  );
}
