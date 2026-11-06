import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Fuel, Hotel, Loader2, Plane, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriceKeyCheck } from "@/components/app/PriceKeyCheck";
import { usePreferences } from "@/lib/account";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/budget";
import { destinationQuery } from "@/lib/live/place";
import { useHydrated } from "@/lib/live/use-live";
import { getLivePriceStatus, getLivePrices } from "@/lib/prices/live-prices.functions";
import { reusedNote } from "@/lib/prices/live";
import { useTripAirports } from "@/lib/live/use-airports";
import { addDays } from "@/lib/dates";
import { tripActions, useTrip } from "@/lib/trip-store";
import { isDrivingMode } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

export { destinationQuery } from "@/lib/live/place";

export function LivePricesPanel({ className }: { className?: string }) {
  const { user } = useAuth();
  const prefs = usePreferences();
  const air = useTripAirports(prefs?.home_airport);
  const { trip, dest, shape, legs } = useTrip();
  const live = trip.live;
  const flying = trip.inputs.transportMode === "flight";
  const cruise = trip.setup.tripType === "cruise";
  // A cruise cabin replaces hotels; a staycation at home has no hotel unless the traveler set a nightly rate.
  // No hotel search when there's nowhere to pay for: a cruise cabin, home, or a place they already have.
  const noHotel =
    cruise ||
    !!trip.setup.coverage?.lodging ||
    (trip.setup.tripType === "staycation" && trip.inputs.nightlyRate === 0);
  const fetchPrices = useServerFn(getLivePrices);
  const fetchStatus = useServerFn(getLivePriceStatus);
  const hydrated = useHydrated();
  const status = useQuery({
    queryKey: ["live", "price-status"],
    queryFn: () => fetchStatus(),
    enabled: hydrated,
    staleTime: 10 * 60 * 1000,
  });
  const connected = status.data;
  const anyConnected =
    !!connected &&
    ((connected.gas && isDrivingMode(trip.inputs.transportMode)) ||
      (connected.hotels && !noHotel) ||
      (flying && connected.flights));
  const notConnected = connected
    ? [
        !connected.hotels && !noHotel && "hotels",
        flying && !connected.flights && "flights",
        !connected.gas && isDrivingMode(trip.inputs.transportMode) && "gas",
      ].filter((x): x is string => !!x)
    : [];
  const ageHours = live ? (Date.now() - new Date(live.fetchedAt).getTime()) / 3_600_000 : 0;
  const stale = ageHours > 24;
  const tripChanged =
    !!live &&
    ((live.hotels &&
      (live.hotels.checkIn !== trip.setup.startDate ||
        live.hotels.checkOut !== trip.setup.endDate)) ||
      (live.flights &&
        (live.flights.departDate !== trip.setup.startDate ||
          live.flights.returnDate !== trip.setup.endDate)));
  const [loading, setLoading] = useState(false);
  const [destAirport, setDestAirport] = useState("");

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetchPrices({
        data: {
          // Cruises fly or drive to the departure port; everything else searches the destination.
          destination: dest.port ?? destinationQuery(dest, trip.setup.origin, prefs?.home_city),
          origin: trip.setup.origin || prefs?.home_city || "",
          startDate: trip.setup.startDate,
          endDate: trip.setup.endDate,
          travelers: Math.min(9, shape.travelers),
          rooms: Math.max(1, trip.inputs.rooms),
          style: trip.setup.style,
          includeFlights: flying,
          includeHotels: !noHotel,
          // The airport table's codes (or the profile's home airport): no lookup that can miss.
          originAirport: air.codes[0] ?? "",
          destinationAirport: /^[A-Z]{3}$/.test(destAirport) ? destAirport : (air.codes[1] ?? ""),
          cabin: trip.setup.cabin ?? "economy",
          stops: trip.setup.flightStops ?? "any",
          // Multi-city: each city's own nights, so every leg and stay is priced.
          cities:
            legs.length > 1
              ? legs.map((l, i) => ({
                  airport: air.codes[i + 1] ?? "",
                  name: l.main
                    ? destinationQuery(dest, trip.setup.origin, prefs?.home_city)
                    : l.name,
                  checkIn: addDays(trip.setup.startDate, l.arriveDay),
                  checkOut: addDays(trip.setup.startDate, l.arriveDay + l.nights),
                }))
              : [],
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      tripActions.applyLivePrices(res.prices);
      toast.success("Live prices are now in your budget", {
        description: res.prices.reused ? reusedNote(res.prices.fetchedAt) : undefined,
      });
      for (const n of res.prices.notes) toast.message(n);
    } catch {
      toast.error("Couldn't reach the price services. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="live-prices" className={cn("surface-card scroll-mt-24 p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="title-display text-title-1">Live prices</h2>
          <p className="mt-1 text-footnote text-muted-foreground">
            Hotel and flight prices from Google, gas from the U.S. Energy Information
            Administration's weekly survey.
          </p>
        </div>
        {connected && !anyConnected ? null : user ? (
          <Button variant="outline" onClick={run} disabled={loading || status.isPending}>
            {loading ? <Loader2 className="animate-spin" /> : live ? <RefreshCw /> : <BadgeCheck />}
            {loading ? "Checking prices…" : live ? "Refresh prices" : "Get live prices"}
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to="/auth" search={{ redirect: "/budget" }}>
              Sign in for live prices
            </Link>
          </Button>
        )}
      </div>

      {connected && (
        <PriceKeyCheck
          connected={connected.gas || connected.flights || connected.hotels}
          signedIn={!!user}
          className="mt-4"
        />
      )}
      {user && anyConnected && notConnected.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Not connected yet: {notConnected.join(", ")}. Those amounts stay estimates.
        </p>
      )}
      {live && (stale || tripChanged) && (
        <p className="mt-4 rounded-lg border border-border px-4 py-2 text-xs">
          {tripChanged
            ? "Your dates changed since these prices were checked. Refresh to price the new dates."
            : `These prices were checked ${Math.round(ageHours / 24)} day${Math.round(ageHours / 24) === 1 ? "" : "s"} ago. Refresh for today's rates.`}
        </p>
      )}

      {user && flying && anyConnected && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Flying from{" "}
            <strong className="text-foreground" title={air.airports[0]?.name}>
              {air.codes[0] || prefs?.home_airport || "your start city"}
            </strong>
            {air.codes[1] && (
              <>
                {" "}
                to{" "}
                <strong className="text-foreground" title={air.airports[1]?.name}>
                  {destAirport || air.codes[1]}
                </strong>
              </>
            )}
            .
          </span>
          <label className="inline-flex items-center gap-2">
            {air.codes[1] ? "Use another airport" : "Destination airport (optional)"}
            <Input
              value={destAirport}
              onChange={(e) =>
                setDestAirport(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, "")
                    .slice(0, 3),
                )
              }
              placeholder={air.codes[1] ?? "e.g. AVL"}
              className="h-8 w-20"
              aria-label="Destination airport code"
            />
          </label>
          {!prefs?.home_airport && (
            <Link
              to="/profile"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Set your home airport
            </Link>
          )}
        </div>
      )}

      {live ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Quote
            icon={Fuel}
            label="Gas"
            value={
              live.gas ? `${formatMoney(live.gas.price, { cents: true })}/gal` : "Not available"
            }
            sub={
              live.gas ? `${live.gas.areaLabel} regular · week of ${live.gas.period}` : undefined
            }
          />
          <Quote
            icon={Hotel}
            label="Hotel, per night"
            value={
              cruise
                ? "Cabin in cruise fare"
                : live.hotels
                  ? formatMoney(live.hotels.nightly)
                  : shape.nights === 0
                    ? "No overnight stay"
                    : "Not available"
            }
            sub={live.hotels ? `${live.hotels.pickLabel} · before taxes` : undefined}
          />
          <Quote
            icon={Plane}
            label="Flight, per person"
            value={
              live.flights
                ? formatMoney(live.flights.perPerson)
                : flying
                  ? "Not available"
                  : "Not flying"
            }
            sub={
              live.flights
                ? `${live.flights.originAirport} ⇄ ${live.flights.destinationAirport} · cheapest round trip`
                : undefined
            }
          />
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Checked {new Date(live.fetchedAt).toLocaleString()}. Prices change often and are
            confirmed only when you book.
          </p>
        </div>
      ) : connected && !anyConnected ? null : (
        <p className="mt-4 text-xs text-muted-foreground">
          Until you check, gas, hotel and fare amounts are estimates.
        </p>
      )}
    </section>
  );
}

function Quote({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Fuel;
  label: string;
  value: string;
  sub?: string | undefined;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="tabular mt-1 text-base font-medium">{value}</p>
      {sub && <p className="text-xs leading-snug text-muted-foreground">{sub}</p>}
    </div>
  );
}
