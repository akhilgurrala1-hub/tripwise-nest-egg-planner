import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BedDouble,
  Bus,
  CalendarPlus,
  Car,
  Check,
  Circle,
  CircleCheck,
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
import {
  bookingTimeline,
  prepChecklist,
  toICalendar,
  tripCalendar,
  type BookBy,
  type PrepItem,
} from "@/lib/booking-timeline";
import { formatMoney } from "@/lib/budget";
import { formatCalendarDate, todayIso } from "@/lib/dates";
import { tripActions, useTrip } from "@/lib/trip-store";
import { useAirports, useTripAirports } from "@/lib/live/use-airports";
import { useHomePlace } from "@/lib/live/use-home";
import { countryName, countryOfPlace } from "@/lib/understand/gazetteer";
import { LayoverHelper } from "@/components/app/LayoverHelper";
import { durationLabel } from "@/lib/layovers";
import { useVisas } from "@/lib/live/use-visas";
import { entryRule, entryText } from "@/lib/visas";
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
  const { trip, dest, shape, totals, place: tripPlace, legs } = useTrip();
  const prefs = usePreferences();
  const air = useTripAirports(prefs?.home_airport);
  const airports = useAirports();
  const { place: home } = useHomePlace();
  const items = bookingPlan(trip, dest, shape, totals, prefs?.home_city ?? "", air.codes);
  const progress = bookingProgress(items, trip.bookings);
  const pct = progress.total > 0 ? progress.booked / progress.total : 0;

  // Where they're going and whether that's abroad, for timing and the before-you-go list.
  const firstPlace = legs[0]?.name ?? dest.name;
  const destCountry = dest.country ?? countryOfPlace(firstPlace, airports);
  const homeCountry = home?.country ?? "US";
  const passport = trip.setup.passport ?? homeCountry;
  const visas = useVisas();
  const entry = visas && destCountry ? entryRule(visas, passport, destCountry) : null;
  const abroad = !!destCountry && destCountry !== homeCountry;
  const today = todayIso();
  const groups = bookingTimeline(items, trip.bookings, {
    today,
    startDate: trip.setup.startDate,
    abroad,
    country: destCountry,
  });
  const prep = prepChecklist({
    startDate: trip.setup.startDate,
    endDate: trip.setup.endDate,
    homeCountry,
    destCountry,
    destName: firstPlace,
    destCountryName: countryName(destCountry),
    entry:
      entry && visas
        ? { passportName: countryName(passport), text: entryText(entry), updated: visas.updated }
        : null,
    tripType: trip.setup.tripType,
    transportMode: trip.setup.transportMode,
    totalBudget: trip.setup.totalBudget,
  });
  const dueNow = groups.find((g) => g.key === "overdue")?.items.length ?? 0;

  const addToCalendar = () => {
    const ics = toICalendar(
      tripCalendar({
        tripId: trip.id,
        title: `Trip: ${tripPlace}`,
        startDate: trip.setup.startDate,
        endDate: trip.setup.endDate,
        groups,
      }),
      new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""),
    );
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "waypoint-trip.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Calendar file ready: open it to add the trip and booking reminders");
  };

  return (
    <div>
      <PageHeader eyebrow="Book" title="Book your trip" />
      <p className="page-container mt-4 text-footnote text-muted-foreground">
        Each search opens on the provider's own site with your dates and group filled in. You book
        and pay there; Waypoint never takes payment.
      </p>

      <div className="page-container mt-6 layout-main-aside">
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {dueNow > 0
                ? `${dueNow} thing${dueNow === 1 ? "" : "s"} to book now, then the rest in order.`
                : progress.next
                  ? "Nothing urgent. Here's what to book, in order."
                  : "Everything's booked."}
            </p>
            <Button variant="outline" size="sm" onClick={addToCalendar}>
              <CalendarPlus /> Add to calendar
            </Button>
          </div>
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`book-${g.key}`} className="space-y-4">
              <h2 id={`book-${g.key}`} className="eyebrow">
                {g.label}
              </h2>
              {g.items.map(({ item, when }, i) => (
                <BookingCard
                  key={item.key}
                  item={item}
                  when={when}
                  record={trip.bookings[item.key] ?? EMPTY}
                  isNext={progress.next?.key === item.key}
                  style={stagger(i)}
                />
              ))}
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            Book-by dates are rules of thumb for when prices and availability usually get worse, not
            promises.
          </p>
          {prep.length > 0 && <PrepList items={prep} />}
          {trip.setup.transportMode === "flight" && <LayoverHelper homeCountry={homeCountry} />}
          <LivePricesPanel className="animate-rise" />
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <section className="surface-card animate-rise p-6">
            <div className="flex items-center gap-4">
              <ProgressRing value={pct} />
              <div>
                <p className="text-headline font-semibold">
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
            <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
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

/** Passports, entry rules, insurance: the things to sort out that aren't bookings. */
function PrepList({ items }: { items: PrepItem[] }) {
  const { trip } = useTrip();
  return (
    <section aria-labelledby="book-prep" className="surface-card animate-rise p-6">
      <h2 id="book-prep" className="title-display text-title-1 leading-tight">
        Before you go
      </h2>
      <ul className="mt-4 divide-y divide-border">
        {items.map((p) => {
          const done = trip.bookings[p.key]?.status === "booked";
          return (
            <li key={p.key} className="flex gap-4 py-4">
              <button
                type="button"
                aria-pressed={done}
                aria-label={`${p.title}: ${done ? "done" : "not done yet"}`}
                onClick={() => tripActions.setBooking(p.key, { status: done ? "todo" : "booked" })}
                className={cn(
                  "mt-1 shrink-0 transition-colors",
                  done ? "text-success" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {done ? <CircleCheck className="size-5" /> : <Circle className="size-5" />}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    done && "text-muted-foreground line-through",
                  )}
                >
                  {p.title}
                  {p.optional && (
                    <span className="ml-2 text-micro font-normal text-muted-foreground">
                      Optional
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{p.detail}</p>
                {p.links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-4">
                    {p.links.map((l) => (
                      <a
                        key={l.label}
                        href={safeExternalUrl(l.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {l.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
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
        className="stroke-success transition-[stroke-dashoffset] spring-smooth"
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
  when,
  record,
  isNext,
  style,
}: {
  item: BookingItem;
  /** When to book it (none once it's booked or skipped) */
  when: BookBy | null;
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
            // "Turkish Airlines · via IST 9h 20m": where they'd connect, and for how long.
            name: `${f.airlines.join(" + ")}${
              f.stops === 0
                ? " · nonstop"
                : f.layovers?.length
                  ? ` · via ${f.layovers.map((l) => `${l.code} ${durationLabel(l.minutes)}`).join(", ")}`
                  : ` · ${f.stops} stop${f.stops === 1 ? "" : "s"}`
            }`,
            price: `${formatMoney(f.perPerson)} pp`,
            url: trip.live!.flights!.bookingUrl ?? "",
          }))
        : [];

  return (
    <article
      style={{ ...style, "--kind": color } as CSSProperties}
      className={cn(
        "surface-card animate-rise render-lazy relative overflow-hidden p-4 transition-[opacity,border-color] duration-300 [contain-intrinsic-size:auto_200px] sm:p-6",
        isNext && "border-[color-mix(in_oklab,var(--primary)_45%,var(--border))]",
        skipped && "opacity-60",
      )}
    >
      {isNext && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
      <div className="flex gap-4">
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
            <h2 className="text-headline leading-snug font-semibold">{item.title}</h2>
            {isNext && (
              <span className="rounded-md bg-[color-mix(in_oklab,var(--primary)_14%,var(--card))] px-2 py-1 text-micro font-semibold tracking-wide text-[color-mix(in_oklab,var(--primary)_55%,var(--foreground))] uppercase">
                Next
              </span>
            )}
            {item.optional && !booked && (
              <span className="rounded-md border border-border px-2 py-1 text-micro text-muted-foreground">
                Optional
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
          {when && (
            <p
              className={cn(
                "mt-1 text-xs",
                when.urgency === "overdue" || when.urgency === "now"
                  ? "font-medium text-primary"
                  : "text-muted-foreground",
              )}
            >
              {when.urgency === "overdue"
                ? "Book as soon as you can."
                : `Book by ${formatCalendarDate(when.by, { month: "short", day: "numeric" })}.`}{" "}
              <span className="font-normal text-muted-foreground">{when.why}</span>
            </p>
          )}
          {item.stops && item.stops.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {item.stops.map((s) => (
                <li key={s} className="rounded-md bg-muted px-2 py-1 text-micro">
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
                  <ul className="mt-4 space-y-2">
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
                <div className="mt-4 flex flex-wrap gap-2">
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
            <div className="animate-pop mt-4 grid gap-2 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-[1fr_150px_auto] sm:items-end">
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
              <div className="flex gap-2">
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
          <p className="text-micro text-muted-foreground">
            {item.budget > 0 ? "budgeted" : "not in budget"}
          </p>
        </div>
      </div>

      {!editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 sm:pl-14">
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
