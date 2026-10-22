import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { useTrip } from "@/lib/trip-store";

export function formatDateRange(start: string, end: string) {
  try {
    const s = new Date(`${start}T12:00:00`);
    const e = new Date(`${end}T12:00:00`);
    return `${format(s, "MMM d")} – ${format(e, s.getFullYear() === e.getFullYear() ? "MMM d, yyyy" : "MMM d, yyyy")}`;
  } catch {
    return `${start} – ${end}`;
  }
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  const { trip, dest, shape } = useTrip();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:pt-8">
      {trip.isSample && (
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-demo/20 bg-demo-soft px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-demo" />
          <p>
            You're viewing a <strong>sample trip</strong>.{" "}
            <Link to="/" className="font-semibold text-primary underline underline-offset-2">
              Plan your own
            </Link>{" "}
            to personalize everything.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{eyebrow}</p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dest.name} · {formatDateRange(trip.setup.startDate, trip.setup.endDate)} · {shape.travelers} traveler
            {shape.travelers > 1 ? "s" : ""}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
