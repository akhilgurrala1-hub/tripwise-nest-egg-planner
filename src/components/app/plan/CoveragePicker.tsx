import { BedDouble, Car, Check, Ticket, UtensilsCrossed, type LucideIcon } from "lucide-react";

import { NumberField } from "@/components/app/bits";
import type { TripCoverage } from "@/lib/budget";
import type { TransportMode } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

type Flag = "lodging" | "meals" | "activities" | "localTransport";

const FLAGS: { id: Flag; label: string; hint: string; icon: LucideIcon }[] = [
  {
    id: "lodging",
    label: "I have a place to stay",
    hint: "Home, family or friends",
    icon: BedDouble,
  },
  {
    id: "meals",
    label: "Meals are covered",
    hint: "Eating at home or with family",
    icon: UtensilsCrossed,
  },
  { id: "activities", label: "No paid activities", hint: "Just getting there", icon: Ticket },
  {
    id: "localTransport",
    label: "I have a ride there",
    hint: "A car or someone picking me up",
    icon: Car,
  },
];

/**
 * What the traveler doesn't need to pay for, and the trip from their door to the
 * airport or station. Covered costs drop out of the budget entirely.
 */
export function CoveragePicker({
  value,
  mode,
  onChange,
}: {
  value: TripCoverage | null | undefined;
  mode: TransportMode;
  onChange: (next: TripCoverage | null) => void;
}) {
  const c = value ?? {};
  /** Turning a cost back on (false / undefined) removes it, so coverage stays minimal. */
  const set = (patch: { [K in keyof TripCoverage]?: TripCoverage[K] | undefined }) => {
    const merged: Record<string, unknown> = { ...c, ...patch };
    for (const k of Object.keys(merged))
      if (merged[k] === false || merged[k] === undefined) delete merged[k];
    const next = merged as TripCoverage;
    onChange(Object.keys(next).length ? next : null);
  };
  const station =
    mode === "flight" ? "airport" : mode === "train" || mode === "bus" ? "station" : null;
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">Already taken care of</p>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Already taken care of">
        {FLAGS.map((f) => {
          const on = !!c[f.id];
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => set({ [f.id]: !on })}
              className={cn(
                "flex items-center gap-4 rounded-lg border px-4 py-2 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.98]",
                on
                  ? "border-primary bg-[color-mix(in_oklab,var(--primary)_6%,var(--card))]"
                  : "border-border bg-card hover:border-muted-foreground/40",
              )}
            >
              <Icon
                className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")}
                strokeWidth={1.8}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-footnote leading-tight font-medium">{f.label}</span>
                <span className="mt-1 block text-micro leading-tight text-muted-foreground">
                  {f.hint}
                </span>
              </span>
              <Check
                className={cn("size-3.5 shrink-0 text-primary", on ? "opacity-100" : "opacity-0")}
                strokeWidth={2.5}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      {station && (
        <div className="mt-4 max-w-xs">
          <label htmlFor="transfer" className="text-footnote text-muted-foreground">
            Getting to the {station} and back
          </label>
          <NumberField
            id="transfer"
            aria-label={`Getting to the ${station} and back`}
            prefix="$"
            step={5}
            value={c.transfer ?? 0}
            onChange={(n) => set({ transfer: n > 0 ? n : undefined })}
            className="mt-2 h-11"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            From your dorm or home, e.g. a rideshare each way. Leave at $0 if you have a ride.
          </p>
        </div>
      )}
    </div>
  );
}
