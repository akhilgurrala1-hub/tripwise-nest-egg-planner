/** Everything the pages show about a trip, worked out from its state in one place. */
import {
  calculateBudget,
  reductionPlan,
  savingsOpportunities,
  tripShape,
  type SavingId,
} from "../budget";
import { destinationFor } from "../demo-data";
import { routeLabel } from "../multi-city";
import { stopsTotalFor, tripLegs } from "./build";
import type { TripState } from "./types";

function derive(trip: TripState) {
  const dest = destinationFor(trip.setup);
  const shape = tripShape(trip.setup.startDate, trip.setup.endDate, trip.setup.travelers);
  const stopsTotal = stopsTotalFor(trip);
  const totals = calculateBudget(
    trip.inputs,
    shape,
    trip.setup.totalBudget,
    trip.emergencyFund,
    trip.overrides,
    stopsTotal,
  );
  const applied = Object.keys(trip.appliedSavings) as SavingId[];
  const savings = savingsOpportunities(
    trip.inputs,
    shape,
    trip.overrides,
    stopsTotal,
    dest,
    applied,
  );
  const potentialSavings = Math.round(savings.reduce((s, t) => s + t.totalSavings * 100, 0)) / 100;
  const cuts = reductionPlan(
    trip.inputs,
    shape,
    trip.setup.totalBudget,
    trip.emergencyFund,
    trip.overrides,
    stopsTotal,
  );
  const legs = tripLegs(trip.setup);
  /** What to call the trip: the destination, or the route of a multi-city trip */
  const place = legs.length > 1 ? routeLabel(legs) : dest.name;
  return {
    trip,
    dest,
    shape,
    totals,
    savings,
    applied,
    potentialSavings,
    cuts,
    stopsTotal,
    legs,
    place,
  };
}

export type TripView = ReturnType<typeof derive>;

/** The same view for a trip that isn't the current one (e.g. a shared link's preview). */
export const viewTrip = (trip: TripState): TripView => derive(trip);
