import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BedDouble,
  Bus,
  Car,
  Check,
  ExternalLink,
  ParkingCircle,
  Plane,
  Ship,
  Ticket,
  TrainFront,
  Undo2,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";

import { ApproxMoney, NumberField } from "@/components/app/bits";
import { LivePricesPanel } from "@/components/app/LivePricesPanel";
import { AnimatedMoney, stagger } from "@/components/app/motion";
import { PageHeader } from "@/components/app/TripHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferences } from "@/lib/account";
import {
  bookingPlan,
  bookingProgress,
  safeExternalUrl,
  type BookingItem,
  type BookingKind,
  type BookingRecord,
} from "@/lib/booking";
import { formatMoney } from "@/lib/budget";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book your trip | Waypoint" },
      {
        name: "description",
        content:
          "Everything your trip needs booked, in order, with searches pre-filled for your dates and group.",
      },
      { property: "og:title", content: "Book your trip | Waypoint" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookPage,
});

const KIND: Record<BookingKind, { icon: LucideIcon; color: string }> = {
  flight: { icon: Plane, color: "var(--trip-flight)" },
  hotel: { icon: BedDouble, color: "var(--cat-accommodations)" },
  cruise: { icon: Ship, color: "var(--trip-cruise)" },
  car: { icon: Car, color: "var(--trip-road)" },
  rail: { icon: TrainFront, color: "var(--trip-rail)" },
  bus: { icon: Bus, color: "var(--trip-rail)" },
  parking: { icon: ParkingCircle, color: "var(--cat-parking)" },
  tickets: { icon: Ticket, color: "var(--cat-activities)" },
  dining: { icon: UtensilsCrossed, color: "var(--cat-food)" },
};

const EMPTY: BookingRecord = { status: "todo", confirmation: "", price: null };

function BookPage() {
  const { trip, dest, shape, totals } = useTrip();
  const prefs = usePreferences();
  const items = bookingPlan(trip, dest, shape, totals, prefs?.home_city ?? "");
  const progress = bookingProgress(items, trip.bookings);
  const pct = progress.total > 0 ? progress.booked / progress.total : 0;

  return (
    <div>
      <PageHeader eyebrow="Book" title="Book your trip">
        <p className="max-w-xs text-xs text-muted-foreground">
          You book and pay on each provider's own site. Waypoint never takes payment. Searches open
          pre-filled with your dates and group.
        </p>
      </PageHeader>

      <div className="mx-auto mt-8 grid max-w-6xl grid-cols-1 gap-4 px-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          {items.map((item, i) => (
            <BookingCard
              key={item.key}
              item={item}
              record={trip.bookings[item.key] ?? EMPTY}
              isNext={progress.next?.key === item.key}
              style={stagger(i)}
            />
          ))}
          <LivePricesPanel className="animate-rise mt-6" />
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <section className="surface-card animate-rise p-5">
            <div className="flex items-center gap-4">
              <ProgressRing value={pct} />
              <div>
                <p className="text-[15px] font-semibold">
                  {progress.booked} of {progress.total} booked
                </p>
                <p className="text-xs text-muted-foreground">
                  {progress.requiredDone
                    ? "The essentials are booked."
                    : progress.next
                      ? `Next: ${progress.next.title}`
                      : "Nothing left to book."}
                </p>
              </div>
            </div>
            <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Booked so far</dt>
                <dd>
                  <AnimatedMoney value={progress.spent} className="font-medium" />
                  <ApproxMoney usd={progress.spent} className="block text-right text-xs" />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Budgeted for those</dt>
                <dd className="tabular">{formatMoney(progress.budgeted)}</dd>
              </div>
              {progress.booked > 0 && (
                <p
                  className={cn(
                    "animate-pop pt-1 text-xs",
                    progress.spent > progress.budgeted ? "text-destructive" : "text-success",
                  )}
                >
                  {progress.spent > progress.budgeted
                    ? `${formatMoney(progress.spent - progress.budgeted)} over what you budgeted`
                    : `${formatMoney(progress.budgeted - progress.spent)} under what you budgeted`}
                </p>
              )}
            </dl>
            <Link
              to="/budget"
              className="mt-4 block text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Open the full budget
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 56 56" className="size-14 shrink-0 -rotate-90" aria-hidden>
      <circle cx={28} cy={28} r={r} fill="none" className="stroke-muted" strokeWidth={6} />
      <circle
        cx={28}
        cy={28}
        r={r}
        fill="none"
        className="stroke-success transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out-quint)]"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
      />
    </svg>
  );
}

function BookingCard({
  item,
  record,
  isNext,
  style,
}: {
  item: BookingItem;
  record: BookingRecord;
  isNext: boolean;
  style?: CSSProperties;
}) {
  const { trip } = useTrip();
  const { icon: Icon, color } = KIND[item.kind];
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(record.confirmation);
  const [price, setPrice] = useState<number>(record.price ?? item.budget);
  const booked = record.status === "booked";
  const skipped = record.status === "skipped";

  const save = () => {
    tripActions.setBooking(item.key, {
      status: "booked",
      confirmation: code.trim(),
      price: price > 0 ? price : null,
    });
    setEditing(false);
    toast.success(`${item.title} marked as booked`);
  };

  const live =
    item.key === "hotel" && trip.live?.hotels
      ? trip.live.hotels.options.slice(0, 2).map((h) => ({
          name: h.name,
          price: `${formatMoney(h.nightly)}/night`,
          url: h.link ?? trip.live!.hotels!.searchUrl,
        }))
      : item.key === "flight" && trip.live?.flights
        ? trip.live.flights.options.slice(0, 2).map((f) => ({
            name: f.airlines.join(" + "),
            price: `${formatMoney(f.perPerson)} pp`,
            url: trip.live!.flights!.bookingUrl ?? "",
          }))
        : [];

  return (
    <article
      style={{ ...style, "--kind": color } as CSSProperties}
      className={cn(
        "surface-card animate-rise relative overflow-hidden p-4 transition-[opacity,border-color] duration-300 sm:p-5",
        isNext && "border-[color-mix(in_oklab,var(--brand-coral)_45%,var(--border))]",
        skipped && "opacity-60",
      )}
    >
      {isNext && <span className="absolute inset-y-0 left-0 w-0.5 bg-brand-coral" aria-hidden />}
      <div className="flex gap-3.5">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-300",
            booked
              ? "bg-success text-white"
              : "bg-[color-mix(in_oklab,var(--kind)_14%,var(--card))] text-(--kind)",
          )}
        >
          {booked ? (
            <Check key="done" className="animate-pop size-5" />
          ) : (
            <Icon className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] leading-snug font-semibold">{item.title}</h2>
            {isNext && (
              <span className="rounded-md bg-[color-mix(in_oklab,var(--brand-coral)_14%,var(--card))] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[color-mix(in_oklab,var(--brand-coral)_55%,var(--foreground))] uppercase">
                Next
              </span>
            )}
            {item.optional && !booked && (
              <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                Optional
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
          {item.stops && item.stops.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {item.stops.map((s) => (
                <li key={s} className="rounded-md bg-muted px-2 py-0.5 text-[11px]">
                  {s}
                </li>
              ))}
            </ul>
          )}

          {booked && !editing ? (
            <p className="animate-pop mt-2 text-sm">
              <span className="font-medium text-success">Booked</span>
              {record.confirmation && (
                <span className="text-muted-foreground">
                  {" "}
                  · Confirmation{" "}
                  <span className="font-mono text-foreground">{record.confirmation}</span>
                </span>
              )}
              {record.price !== null && (
                <span className="tabular text-muted-foreground">
                  {" "}
                  · {formatMoney(record.price)}
                  {item.budget > 0 &&
                    ` (${record.price <= item.budget ? `${formatMoney(item.budget - record.price)} under` : `${formatMoney(record.price - item.budget)} over`} budget)`}
                </span>
              )}
            </p>
          ) : (
            !skipped && (
              <>
                {live.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {live.map((o) => (
                      <li key={o.name} className="flex items-center gap-2 text-xs">
                        <span className="size-1.5 rounded-full bg-success" />
                        <span className="min-w-0 flex-1 truncate">{o.name}</span>
                        <span className="tabular font-medium">{o.price}</span>
                        {safeExternalUrl(o.url) && (
                          <a
                            href={safeExternalUrl(o.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline"
                          >
                            Reserve
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.links.map((l, li) => (
                    <Button key={l.label} asChild size="sm" variant={li === 0 ? "ink" : "outline"}>
                      <a href={l.url} target="_blank" rel="noopener noreferrer">
                        {l.label} <ExternalLink />
                      </a>
                    </Button>
                  ))}
                </div>
              </>
            )
          )}

          {editing && (
            <div className="animate-pop mt-3 grid gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:grid-cols-[1fr_150px_auto] sm:items-end">
              <label className="text-xs text-muted-foreground">
                Confirmation number
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. ABC123"
                  className="mt-1 h-9 bg-card"
                  autoFocus
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Total paid
                <NumberField
                  aria-label="Total paid"
                  prefix="$"
                  value={price}
                  onChange={setPrice}
                  className="mt-1 h-9"
                />
              </label>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ink" onClick={save}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="hidden shrink-0 text-right sm:block">
          <p className="tabular text-sm font-semibold">
            {item.budget > 0 ? formatMoney(item.budget) : "Not set"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {item.budget > 0 ? "budgeted" : "not in budget"}
          </p>
        </div>
      </div>

      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3 sm:pl-[54px]">
          {booked ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Edit details
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => tripActions.setBooking(item.key, { status: "todo" })}
              >
                <Undo2 /> Not booked
              </Button>
            </>
          ) : skipped ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => tripActions.setBooking(item.key, { status: "todo" })}
            >
              <Undo2 /> Add back
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Check /> I booked this
              </Button>
              {item.optional && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => tripActions.setBooking(item.key, { status: "skipped" })}
                >
                  Skip
                </Button>
              )}
              <span className="tabular ml-auto text-xs text-muted-foreground sm:hidden">
                {item.budget > 0 ? `${formatMoney(item.budget)} budgeted` : ""}
              </span>
            </>
          )}
        </div>
      )}
    </article>
  );
}
