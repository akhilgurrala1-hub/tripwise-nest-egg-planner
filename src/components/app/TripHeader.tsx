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

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  const { trip, dest, shape } = useTrip();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:pt-10">
      {trip.isSample && (
        <p className="mb-6 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          <span>
            You're looking at a sample trip.{" "}
            <Link
              to="/"
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Plan your own
            </Link>
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-1 text-[28px] leading-tight font-semibold sm:text-[32px]">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {dest.name} <span className="px-1 text-border">/</span>{" "}
            {formatDateRange(trip.setup.startDate, trip.setup.endDate)}{" "}
            <span className="px-1 text-border">/</span> {shape.travelers} traveler
            {shape.travelers > 1 ? "s" : ""}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
