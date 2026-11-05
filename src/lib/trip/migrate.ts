/**
 * Upgrading stored trips: older saved shapes become today's `TripState`, and
 * trips with broken or past dates are moved to valid future ones.
 */
import { defaultEmergencyFund, defaultInputs, tripShape } from "../budget";
import type { BookingRecord } from "../booking";
import { addDays, MAX_TRIP_DAYS, todayIso } from "../dates";
import { destinationFor, upgradeTripType } from "../demo-data";
import { generateTripItinerary } from "../itinerary";
import { defaultRoadTrip, newTripId, SAMPLE_TRIP_ID, tripLegs } from "./build";
import type { TripSetup, TripState } from "./types";

/** Inputs added after a trip was saved get their "not used" values. */
const NEW_INPUT_DEFAULTS = { cruisePerNight: 0, portFeesPerPerson: 0, gratuitiesPerNight: 0 };

/**
 * Upgrade trips saved by earlier versions of the app (also used for trips loaded from an account).
 * v4 split trips into separate types: old "Getaway" trips become fly-away, train & bus or road trips
 * by how they travel. v5 gave every trip a stable id; v6 added the booking checklist.
 */
export function migrate(raw: unknown): TripState | null {
  const v4 = migrateToV4(raw);
  if (!v4) return null;
  const id =
    typeof v4.id === "string" && v4.id ? v4.id : v4.isSample ? SAMPLE_TRIP_ID : newTripId();
  const bookings =
    v4.bookings && typeof v4.bookings === "object" && !Array.isArray(v4.bookings)
      ? v4.bookings
      : {};
  return { ...v4, version: 6, id, bookings };
}

type V4Trip = Omit<TripState, "version" | "id" | "bookings"> & {
  version: 4 | 5 | 6;
  id?: string;
  bookings?: Record<string, BookingRecord>;
};

function migrateToV4(raw: unknown): V4Trip | null {
  const s = raw as Partial<Omit<TripState, "version">> & { version?: number };
  if (!s || typeof s !== "object" || !s.setup || !s.inputs) return null;
  if (s.version === 4 || s.version === 5 || s.version === 6)
    return { ...(s as V4Trip), live: s.live ?? null, cloud: s.cloud ?? null };
  if (s.version === 2 || s.version === 3) {
    const old = s as unknown as V4Trip;
    const mode = old.inputs.transportMode ?? old.setup.transportMode ?? "car";
    const tripType = upgradeTripType(old.setup.tripType, mode);
    return {
      ...old,
      version: 4 as const,
      setup: { ...old.setup, tripType, transportMode: mode },
      inputs: { ...NEW_INPUT_DEFAULTS, ...old.inputs },
      live: (s.version === 3 ? old.live : null) ?? null,
      cloud: (s.version === 3 ? old.cloud : null) ?? null,
    };
  }
  if (s.version !== 1) return null;
  const setup: TripSetup = {
    ...(s.setup as TripSetup),
    tripType: upgradeTripType(s.setup.tripType, "car"),
    transportMode: "car",
    emergencyFund: s.emergencyFund ?? defaultEmergencyFund(s.setup.totalBudget),
  };
  const dest = destinationFor(setup);
  const fresh = defaultInputs(dest, setup.style, setup.tripType, setup.travelers, "car");
  return {
    version: 4 as const,
    isSample: !!s.isSample,
    setup,
    inputs: { ...fresh, ...s.inputs, transportMode: "car" },
    overrides: s.overrides ?? {},
    emergencyFund: setup.emergencyFund,
    appliedSavings: s.appliedSavings ?? {},
    itinerary: s.itinerary ?? null,
    roadTrip: defaultRoadTrip(setup, dest.name),
    live: null,
    cloud: null,
  };
}

/** Saved trips with missing or epoch-era dates (and sample trips whose dates have passed) get moved to valid future dates, keeping their length. */
export function repairDates(trip: TripState): TripState {
  const { startDate, endDate } = trip.setup;
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number(d.slice(0, 4)) >= 2000;
  const staleSample = trip.isSample && startDate < todayIso();
  if (valid(startDate) && valid(endDate) && endDate >= startDate && !staleSample) return trip;
  const days = Math.min(MAX_TRIP_DAYS, Math.max(1, tripShape(startDate, endDate, 1).days));
  const start = addDays(todayIso(), 30);
  const setup = { ...trip.setup, startDate: start, endDate: addDays(start, days - 1) };
  const dest = destinationFor(setup);
  return {
    ...trip,
    setup,
    itinerary: generateTripItinerary({
      dest,
      days,
      startDate: start,
      interests: setup.interests,
      style: setup.style,
      tripType: setup.tripType,
      legs: tripLegs(setup),
    }),
  };
}
