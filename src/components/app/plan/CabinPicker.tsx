import { Segmented } from "@/components/app/motion";
import { CABINS, type Cabin } from "@/lib/demo-data";

/** Which cabin they fly in: fares (and a budget Waypoint picked) follow it. */
export function CabinPicker({
  value,
  onChange,
  className,
}: {
  value: Cabin | null | undefined;
  onChange: (c: Cabin) => void;
  className?: string;
}) {
  return (
    <div className={className ?? "mt-3 flex flex-wrap items-center gap-x-4 gap-y-2"}>
      <p className="text-sm text-muted-foreground">Cabin</p>
      <Segmented
        ariaLabel="Cabin"
        size="sm"
        value={value ?? "economy"}
        onChange={onChange}
        options={CABINS.map((c) => ({
          value: c.id,
          label: c.short,
          ...(c.short !== c.label ? { ariaLabel: c.label } : {}),
        }))}
      />
    </div>
  );
}
