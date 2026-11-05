/**
 * Building trips: a new trip from a setup, its cities, the sample trip's setup,
 * and the small facts every page asks of a trip (its key, its stops' cost).
 * Pure: no store, no storage.
 */
import { applyCoverage, defaultEmergencyFund, defaultInputs, stopCost, tripShape } from "../budget";
import { addDays, todayIso } from "../dates";
import {
  CUSTOM_DESTINATION_ID,
  DESTINATIONS,
  destinationFor,
  modeForTripType,
  travelPoint,
  tripTypeInfo,
  type TripType,
} from "../demo-data";
import { fitToCoverage, generateTripItinerary } from "../itinerary";
import { citySchedule, cleanCities, type CityLeg } from "../multi-city";
import { recommendDestinations } from "../recommend";
import type { RoadTripPlan, TripSetup, TripState } from "./types";

export const SAMPLE_TRIP_ID = "sample";

export function newTripId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultRoadTrip(setup: TripSetup, destName: string): RoadTripPlan {
  return {
    origin: setup.origin,
    destination: destName,
    stopBudget: Math.max(50, Math.round((setup.totalBudget * 0.1) / 25) * 25),
    interests: setup.interests,
    maxDetourMinutes: 20,
    includedStops: [],
  };
}

export function buildTrip(input: TripSetup, isSample = false, id?: string): TripState {
  const setup = { ...input, transportMode: modeForTripType(input.tripType, input.transportMode) };
  const dest = destinationFor(setup);
  const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
  return {
    version: 7,
    id: id ?? (isSample ? SAMPLE_TRIP_ID : newTripId()),
    isSample,
    setup,
    inputs: applyCoverage(
      defaultInputs(dest, setup.style, setup.tripType, setup.travelers, setup.transportMode),
      setup.coverage,
    ),
    overrides: {},
    emergencyFund: Math.min(Math.max(0, setup.emergencyFund), setup.totalBudget),
    appliedSavings: {},
    itinerary: fitToCoverage(
      generateTripItinerary({
        dest,
        days: shape.days,
        startDate: setup.startDate,
        interests: setup.interests,
        style: setup.style,
        tripType: setup.tripType,
        legs: tripLegs(setup),
      }),
      setup.coverage,
    ),
    roadTrip: defaultRoadTrip(setup, dest.name),
    live: null,
    cloud: null,
    bookings: {},
    spending: { people: [], expenses: [] },
  };
}

/**
 * The cities of a trip in order with their nights and travel days (one entry for
 * a single-destination trip). Cruises and staycations are always one place.
 */
export function tripLegs(setup: TripSetup): CityLeg[] {
  const dest = destinationFor(setup);
  const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
  const single = setup.tripType === "cruise" || setup.tripType === "staycation";
  return citySchedule(
    shape.nights,
    { name: dest.name, point: travelPoint(dest, setup.destinationPoint) },
    single ? [] : cleanCities(setup.cities),
  );
}

export function sampleSetup(): TripSetup {
  const start = addDays(todayIso(), 30);
  return {
    destinationId: "blue-ridge",
    customDestination: "",
    origin: "Charlotte, NC",
    tripType: "road-trip",
    style: "comfort",
    transportMode: "car",
    startDate: start,
    endDate: addDays(start, 3),
    travelers: 2,
    interests: ["nature", "food"],
    totalBudget: 2000,
    emergencyFund: defaultEmergencyFund(2000),
  };
}

/** Destination to use after switching trip type, and why it changed (empty when it didn't). */
export function destinationForTripType(
  setup: TripSetup,
  tripType: TripType,
): { destinationId: string; reason: string } {
  const { destinationId } = setup;
  if (destinationId === CUSTOM_DESTINATION_ID) return { destinationId, reason: "" };
  if (tripType === "staycation") {
    return destinationId === "hometown"
      ? { destinationId, reason: "" }
      : { destinationId: "hometown", reason: "A staycation is planned around your home city." };
  }
  const current = destinationFor(setup);
  if (current.bestFor.includes(tripType)) return { destinationId, reason: "" };
  // The best fit for the new kind of trip from where the traveler starts.
  const next =
    recommendDestinations({
      from: setup.originPoint ?? null,
      tripType,
      interests: setup.interests,
      limit: 1,
    })[0]?.id ??
    DESTINATIONS.find((d) => d.bestFor.includes(tripType))?.id ??
    DESTINATIONS[0]!.id;
  const nextName = destinationFor({ ...setup, destinationId: next }).name;
  const label = tripTypeInfo(tripType).label.toLowerCase();
  return {
    destinationId: next,
    reason:
      destinationId === "hometown"
        ? `We picked ${nextName} for your ${label}.`
        : `${current.name} isn't a ${label} destination, so we picked ${nextName}.`,
  };
}

export function stopsTotalFor(trip: TripState): number {
  const total = trip.roadTrip.includedStops.reduce(
    (s, stop) => s + stopCost(stop, trip.setup.travelers, trip.inputs),
    0,
  );
  return Math.round(total * 100) / 100;
}

/** The trip as stored in an account: everything except the account link and this device's trip id. */
export function tripForSaving(trip: TripState): Omit<TripState, "cloud" | "id"> {
  const { cloud: _cloud, id: _id, ...rest } = trip;
  return { ...rest, isSample: false };
}

/**
 * What a generated plan depends on. A plan requested for one key is only applied
 * while the trip still has that key — switching trips, trip type, destination or
 * dates mid-request discards the stale answer instead of landing it on the wrong trip.
 */
export function planKey(trip: TripState): string {
  const s = trip.setup;
  return [
    trip.id,
    s.tripType,
    s.destinationId,
    s.customDestination.trim().toLowerCase(),
    s.startDate,
    s.endDate,
  ].join("|");
}
