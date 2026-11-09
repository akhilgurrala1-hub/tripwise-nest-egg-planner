import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Link2Off, MapPin, Users, Wallet } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { CATEGORY_COLOR_VAR } from "@/components/app/bits";
import { RouteMark } from "@/components/app/Illustrations";
import { LogoMark } from "@/components/app/Logo";
import { formatDateRange } from "@/components/app/TripHeader";
import { TRIP_ICONS } from "@/components/app/TripTypePicker";
import { Button } from "@/components/ui/button";
import { CATEGORIES, CATEGORY_LABELS, formatMoney } from "@/lib/budget";
import { tripTypeInfo } from "@/lib/demo-data";
import { codeFromHash, decodeTrip, type SharedTrip } from "@/lib/share";
import { migrate, tripActions, useTrip, viewTrip } from "@/lib/trip-store";

export const Route = createFileRoute("/shared")({
  head: () => ({
    meta: [
      { title: "A trip shared with you | Waypoint" },
      {
        name: "description",
        content: "See a trip's plan and budget, then make it your own in Waypoint.",
      },
      { property: "og:title", content: "A trip shared with you | Waypoint" },
      {
        property: "og:description",
        content: "See a trip's plan and budget, then make it your own in Waypoint.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // A shared plan is someone's private trip: keep it out of search results.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedTripPage,
});

type Loaded = { state: "loading" } | { state: "bad" } | { state: "ok"; trip: SharedTrip };

function SharedTripPage() {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  // The trip lives in the #fragment, which only the browser can read.
  useEffect(() => {
    let live = true;
    const read = () => {
      void decodeTrip(codeFromHash(window.location.hash)).then((trip) => {
        if (live) setLoaded(trip ? { state: "ok", trip } : { state: "bad" });
      });
    };
    read();
    window.addEventListener("hashchange", read);
    return () => {
      live = false;
      window.removeEventListener("hashchange", read);
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-24 sm:pt-10">
      {loaded.state === "loading" && (
        <div className="flex justify-center py-24">
          <LogoMark loading className="size-10" />
        </div>
      )}
      {loaded.state === "bad" && <BadLink />}
      {loaded.state === "ok" && <Preview shared={loaded.trip} />}
    </div>
  );
}

function BadLink() {
  return (
    <section className="surface-card p-6 text-center sm:p-8">
      <Link2Off className="mx-auto size-8 text-muted-foreground" />
      <h1 className="title-display mt-4 text-3xl">This link doesn't open a trip</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Part of it may have been cut off when it was copied. Ask for the link again, or plan a trip
        of your own.
      </p>
      <Button asChild variant="go" className="mt-6">
        <Link to="/">
          Plan a trip <ArrowRight />
        </Link>
      </Button>
    </section>
  );
}

function Preview({ shared }: { shared: SharedTrip }) {
  const navigate = useNavigate();
  const { trip: mine } = useTrip();
  const [failed, setFailed] = useState(false);
  const view = useMemo(() => {
    const state = migrate({ ...shared, isSample: false, live: null, cloud: null, bookings: {} });
    return state ? viewTrip(state) : null;
  }, [shared]);
  if (!view) return <BadLink />;

  const { trip, dest, shape, totals } = view;
  const type = tripTypeInfo(trip.setup.tripType);
  const TypeIcon = TRIP_ICONS[trip.setup.tripType];
  const lines = CATEGORIES.filter((c) => totals.categories[c] > 0)
    .map((c) => ({ c, amount: totals.categories[c] }))
    .sort((a, b) => b.amount - a.amount);
  const days = trip.itinerary?.days ?? [];
  // Opening replaces the trip on this device; say so when that's the traveler's own unsaved plan.
  const replacesOwn = !mine.isSample && !mine.cloud;

  const open = () => {
    if (!tripActions.openSharedTrip(shared)) {
      setFailed(true);
      return;
    }
    void navigate({ to: "/dashboard" });
  };

  return (
    <div className="space-y-4">
      <section className="surface-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <RouteMark className="hidden w-16 shrink-0 sm:block" />
          <div className="min-w-0">
            <h1 className="title-display text-large-title">{dest.name}</h1>
            <p className="mt-2 text-footnote text-muted-foreground">A trip shared with you</p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-footnote">
              <Fact icon={<TypeIcon />}>{type.label}</Fact>
              <Fact icon={<CalendarDays />}>
                {formatDateRange(trip.setup.startDate, trip.setup.endDate)}
                <span className="text-muted-foreground">
                  {" "}
                  · {shape.days === 1 ? "day trip" : `${shape.days} days`}
                </span>
              </Fact>
              <Fact icon={<Users />}>
                {shape.travelers} traveler{shape.travelers > 1 ? "s" : ""}
              </Fact>
              {trip.setup.origin && <Fact icon={<MapPin />}>From {trip.setup.origin}</Fact>}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-6">
          <Stat label="Total budget" value={formatMoney(totals.totalBudget)} />
          <Stat label="Planned spending" value={formatMoney(totals.planned)} />
          <Stat
            label="Per person"
            value={formatMoney(totals.planned / Math.max(1, shape.travelers))}
          />
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button variant="go" size="lg" onClick={open}>
            Open this trip <ArrowRight />
          </Button>
          <p className="text-xs text-muted-foreground">
            {replacesOwn
              ? "It replaces the trip on this device. Save yours to your account first to keep it."
              : "You can change anything once it's open. Nothing changes for the person who sent it."}
          </p>
        </div>
        {failed && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            This trip couldn't be opened. Ask for the link again.
          </p>
        )}
      </section>

      {lines.length > 0 && (
        <section className="surface-card p-6 sm:p-6">
          <h2 className="title-display text-title-1">Where the money goes</h2>
          <ul className="mt-4 divide-y divide-border text-sm">
            {lines.map(({ c, amount }) => (
              <li key={c} className="flex items-center justify-between gap-4 py-2">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-sm"
                    style={{ background: CATEGORY_COLOR_VAR[c] }}
                  />
                  {CATEGORY_LABELS[c]}
                </span>
                <span className="tabular font-medium">{formatMoney(amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {days.length > 0 && (
        <section className="surface-card p-6 sm:p-6">
          <h2 className="title-display text-title-1">Day by day</h2>
          <ol className="mt-4 space-y-4">
            {days.map((d) => (
              <li key={d.day}>
                <p className="text-sm font-semibold">
                  <span className="tabular font-semibold text-muted-foreground">Day {d.day}</span> ·{" "}
                  {d.title}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {d.items.map((i) => (
                    <li key={i.id} className="grid grid-cols-[76px_1fr] gap-2">
                      <span className="text-muted-foreground">{i.time}</span>
                      <span className="min-w-0">
                        {i.name}
                        {i.costPerPerson > 0 && (
                          <span className="tabular text-muted-foreground">
                            {" "}
                            · {formatMoney(i.costPerPerson)} pp
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Amounts are estimates. Bookings and confirmation numbers aren't shared.
      </p>
    </div>
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="tabular inline-flex max-w-full items-center gap-2 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold sm:text-xl">{value}</p>
    </div>
  );
}
