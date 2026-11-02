import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Car, ExternalLink, Hotel, Plane, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { LivePricesPanel, destinationQuery } from "@/components/app/LivePricesPanel";
import { PageHeader } from "@/components/app/TripHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addBooking,
  bookingsQuery,
  deleteBooking,
  updateBooking,
  type BookingRow,
  type NewBooking,
} from "@/lib/account";
import { formatMoney } from "@/lib/budget";
import { useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Waypoint" },
      {
        name: "description",
        content:
          "Compare live hotel and flight prices, reserve on the provider's site and keep every confirmation in one place.",
      },
      { property: "og:title", content: "Bookings — Waypoint" },
      {
        property: "og:description",
        content: "Hotels, flights and rental cars for your trip, with confirmations tracked.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(bookingsQuery),
  component: BookingsPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="mx-auto max-w-3xl p-6 text-sm text-destructive">
      {error instanceof Error ? error.message : "Couldn't load your bookings."}
    </div>
  ),
});

const KIND_ICON = { hotel: Hotel, flight: Plane, car: Car } as const;

function BookingsPage() {
  const { data: bookings } = useSuspenseQuery(bookingsQuery);
  const { trip, dest, shape } = useTrip();
  const queryClient = useQueryClient();
  const live = trip.live;
  const refresh = () => queryClient.invalidateQueries({ queryKey: bookingsQuery.queryKey });
  const place = destinationQuery(dest, trip.setup.origin);

  const track = async (b: NewBooking) => {
    try {
      await addBooking(b);
      toast.success("Added to your bookings. Mark it booked once you've reserved it.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add it.");
    } finally {
      refresh();
    }
  };

  const carDays = shape.days;
  const carEstimate = trip.inputs.rentalPerDay * carDays;
  const kayakCars = `https://www.kayak.com/cars/${encodeURIComponent(dest.name)}/${trip.setup.startDate}/${trip.setup.endDate}`;
  const googleCars = `https://www.google.com/search?q=${encodeURIComponent(`car rental ${place} ${trip.setup.startDate} to ${trip.setup.endDate}`)}`;

  return (
    <div>
      <PageHeader eyebrow="Bookings" title="Reserve your trip" />
      <div className="mx-auto mt-6 max-w-5xl space-y-6 px-4">
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm leading-snug">
          You reserve and pay on the hotel's, airline's or rental company's own site. Waypoint never
          takes payment. Add each reservation here and save its confirmation number so everything
          stays in one place.
        </p>

        <LivePricesPanel />

        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Hotel className="size-5" /> Hotels
          </h2>
          {live?.hotels ? (
            <>
              <p className="text-sm text-muted-foreground">
                {live.hotels.checkIn} → {live.hotels.checkOut} · prices per room per night before
                taxes, from Google Hotels
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {live.hotels.options.map((h) => (
                  <li
                    key={h.name}
                    className="flex gap-3 rounded-2xl border border-border bg-background/60 p-3"
                  >
                    {h.image && (
                      <img
                        src={h.image}
                        alt=""
                        loading="lazy"
                        className="size-16 shrink-0 rounded-xl object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{h.name}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {h.hotelClass ? <span>{h.hotelClass}-star</span> : null}
                        {h.rating ? (
                          <span className="inline-flex items-center gap-0.5">
                            <Star className="size-3 fill-current text-gold" aria-hidden />{" "}
                            {h.rating.toFixed(1)}
                            {h.reviews ? ` (${h.reviews.toLocaleString()})` : ""}
                          </span>
                        ) : null}
                      </p>
                      <p className="tabular mt-1 text-sm font-semibold">
                        {formatMoney(h.nightly)}/night
                        {h.totalWithTaxes ? (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {formatMoney(h.totalWithTaxes)} total with taxes
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {h.link && (
                          <Button asChild size="sm" variant="ink">
                            <a href={h.link} target="_blank" rel="noopener noreferrer">
                              Reserve <ExternalLink />
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            track({
                              kind: "hotel",
                              title: h.name,
                              provider: h.link
                                ? new URL(h.link).hostname.replace(/^www\./, "")
                                : "Hotel",
                              url: h.link ?? live.hotels!.searchUrl,
                              start_date: live.hotels!.checkIn,
                              end_date: live.hotels!.checkOut,
                              price:
                                h.totalWithTaxes ??
                                Math.round(h.nightly * shape.nights * 100) / 100,
                            })
                          }
                        >
                          <Plus /> Track
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {shape.nights === 0
                ? "This is a day trip, so there's no hotel to book."
                : "Tap Get live prices above to see real hotels and rates for your dates."}
            </p>
          )}
        </section>

        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Plane className="size-5" /> Flights
          </h2>
          {live?.flights ? (
            <>
              <p className="text-sm text-muted-foreground">
                {live.flights.originAirport} ⇄ {live.flights.destinationAirport} ·{" "}
                {live.flights.departDate} → {live.flights.returnDate} · round trip per person, from
                Google Flights
                {live.flights.typicalRange
                  ? ` · usually ${formatMoney(live.flights.typicalRange[0])}–${formatMoney(live.flights.typicalRange[1])}`
                  : ""}
              </p>
              <ul className="mt-4 space-y-2">
                {live.flights.options.map((f, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background/60 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{f.airlines.join(" + ")}</p>
                      <p className="text-xs text-muted-foreground">
                        Departs {f.departs} ·{" "}
                        {f.stops === 0 ? "nonstop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`} ·{" "}
                        {Math.floor(f.durationMinutes / 60)} h {f.durationMinutes % 60} min outbound
                      </p>
                    </div>
                    <span className="tabular font-semibold">{formatMoney(f.perPerson)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        track({
                          kind: "flight",
                          title: `${f.airlines.join(" + ")} ${live.flights!.originAirport}–${live.flights!.destinationAirport}`,
                          provider: "Google Flights",
                          url: live.flights!.bookingUrl ?? "",
                          start_date: live.flights!.departDate,
                          end_date: live.flights!.returnDate,
                          price: Math.round(f.perPerson * shape.travelers * 100) / 100,
                        })
                      }
                    >
                      <Plus /> Track
                    </Button>
                  </li>
                ))}
              </ul>
              {live.flights.bookingUrl && (
                <Button asChild variant="ink" className="mt-3">
                  <a href={live.flights.bookingUrl} target="_blank" rel="noopener noreferrer">
                    Book on Google Flights <ExternalLink />
                  </a>
                </Button>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {trip.inputs.transportMode === "flight"
                ? "Tap Get live prices above to see real flights for your dates."
                : "Your trip isn't set to fly. Switch to Flight on the budget page to compare fares."}
            </p>
          )}
        </section>

        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Car className="size-5" /> Rental cars
          </h2>
          <p className="text-sm text-muted-foreground">
            Live rental prices aren't connected yet. Your budget's estimate is{" "}
            <strong className="tabular text-foreground">{formatMoney(carEstimate)}</strong> (
            {formatMoney(trip.inputs.rentalPerDay)}/day × {carDays} days). Compare real prices here:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="ink">
              <a href={kayakCars} target="_blank" rel="noopener noreferrer">
                Search on KAYAK <ExternalLink />
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={googleCars} target="_blank" rel="noopener noreferrer">
                Search on Google <ExternalLink />
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                track({
                  kind: "car",
                  title: `Rental car in ${dest.name}`,
                  provider: "",
                  url: kayakCars,
                  start_date: trip.setup.startDate,
                  end_date: trip.setup.endDate,
                  price: null,
                })
              }
            >
              <Plus /> Track a rental
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold">My bookings ({bookings.length})</h2>
          {bookings.length === 0 && (
            <p className="surface-card p-5 text-sm text-muted-foreground">
              Nothing tracked yet. Tap Track on a hotel, flight or rental above.
            </p>
          )}
          {bookings.map((b) => (
            <BookingCard key={b.id} b={b} onChange={refresh} />
          ))}
        </section>
      </div>
    </div>
  );
}

function BookingCard({ b, onChange }: { b: BookingRow; onChange: () => void }) {
  const Icon = KIND_ICON[b.kind as keyof typeof KIND_ICON] ?? Hotel;
  const update = async (patch: Parameters<typeof updateBooking>[1], msg: string) => {
    try {
      await updateBooking(b.id, patch);
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update.");
    } finally {
      onChange();
    }
  };
  return (
    <div
      className={cn(
        "surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center",
        b.status === "cancelled" && "opacity-60",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {b.title}
          <Badge
            variant={
              b.status === "booked" ? "success" : b.status === "cancelled" ? "outline" : "gold"
            }
          >
            {b.status === "booked"
              ? "Booked"
              : b.status === "cancelled"
                ? "Cancelled"
                : "Not booked yet"}
          </Badge>
        </p>
        <p className="text-xs text-muted-foreground">
          {[
            b.provider,
            b.start_date && `${b.start_date}${b.end_date ? ` → ${b.end_date}` : ""}`,
            b.price !== null && `about ${formatMoney(Number(b.price))}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <form
          className="mt-2 flex max-w-sm gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const code = String(new FormData(e.currentTarget).get("code") ?? "")
              .trim()
              .slice(0, 80);
            update(
              { confirmation_code: code, status: code ? "booked" : b.status },
              code ? "Confirmation saved" : "Confirmation cleared",
            );
          }}
        >
          <Input
            name="code"
            defaultValue={b.confirmation_code}
            placeholder="Confirmation number"
            maxLength={80}
            className="h-9"
            aria-label={`Confirmation number for ${b.title}`}
          />
          <Button type="submit" size="sm" variant="outline">
            Save
          </Button>
        </form>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {safeExternalUrl(b.url) && (
          <Button asChild size="sm" variant="ink">
            <a href={safeExternalUrl(b.url)} target="_blank" rel="noopener noreferrer">
              Open site <ExternalLink />
            </a>
          </Button>
        )}
        {b.status !== "booked" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => update({ status: "booked" }, "Marked as booked")}
          >
            Mark booked
          </Button>
        )}
        {b.status !== "cancelled" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => update({ status: "cancelled" }, "Marked as cancelled")}
          >
            Cancelled
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="text-destructive"
          aria-label={`Remove ${b.title}`}
          onClick={async () => {
            try {
              await deleteBooking(b.id);
              toast.success("Removed");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Couldn't remove.");
            } finally {
              onChange();
            }
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

/** Stored links are only rendered when they are plain web links (never javascript: or data: URLs). */
function safeExternalUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
