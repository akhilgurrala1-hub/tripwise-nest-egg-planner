import { BedDouble, Car, Ticket, UtensilsCrossed, type LucideIcon } from "lucide-react";

import { NumberField } from "@/components/app/bits";
import { Switch } from "@/components/ui/switch";
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
      <p className="mb-2 text-footnote text-muted-foreground">Already taken care of</p>
      {/* A grouped list, like Settings: one row per cost, a switch on the right. */}
      <ul
        aria-label="Already taken care of"
        className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-soft-value)] dark:border dark:border-separator"
      >
        {FLAGS.map((f, i) => {
          const on = !!c[f.id];
          const Icon = f.icon;
          const id = `cover-${f.id}`;
          return (
            <li key={f.id} className="relative">
              <label
                htmlFor={id}
                className="flex min-h-14 cursor-pointer items-center gap-4 px-4 py-2"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg transition-colors duration-150",
                    on ? "bg-primary text-primary-foreground" : "bg-fill text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body leading-tight">{f.label}</span>
                  <span className="mt-1 block text-caption leading-tight text-muted-foreground">
                    {f.hint}
                  </span>
                </span>
                <Switch id={id} checked={on} onCheckedChange={(v) => set({ [f.id]: v })} />
              </label>
              {/* Separators start where the text does, as in an iOS list. */}
              {i < FLAGS.length - 1 && (
                <span aria-hidden className="absolute right-0 bottom-0 left-16 h-px bg-separator" />
              )}
            </li>
          );
        })}
      </ul>
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
