import { Segmented } from "@/components/app/motion";
import { FLIGHT_STOPS, type FlightStops } from "@/lib/demo-data";

/** Nonstop only, one stop at most, or any: live fare searches and booking links follow it. */
export function StopsPicker({
  value,
  onChange,
  className,
}: {
  value: FlightStops | null | undefined;
  onChange: (s: FlightStops) => void;
  className?: string;
}) {
  return (
    <div className={className ?? "mt-4 flex flex-wrap items-center gap-x-4 gap-y-2"}>
      <p className="text-sm text-muted-foreground">Stops</p>
      <Segmented
        ariaLabel="Flight stops"
        size="sm"
        value={value ?? "any"}
        onChange={onChange}
        options={FLIGHT_STOPS.map((s) => ({
          value: s.id,
          label: s.short,
          ...(s.short !== s.label ? { ariaLabel: s.label } : {}),
        }))}
      />
    </div>
  );
}
