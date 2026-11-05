/**
 * The shape of a trip as the app stores it (localStorage, accounts, share links).
 * Bump `TripState.version` and add a step to `migrate.ts` when it changes.
 */
import type { BookingRecord } from "../booking";
import type { BudgetInputs, Overrides, SavingId, TripCoverage } from "../budget";
import type { GeoPoint } from "../catalog";
import type {
  Cabin,
  FlightStops,
  Interest,
  TransportMode,
  TravelStyle,
  TripType,
} from "../demo-data";
import type { Itinerary } from "../itinerary";
import type { TripCity } from "../multi-city";
import type { LivePrices } from "../prices/live";
import type { RouteStop } from "../routing/types";

export interface TripSetup {
  destinationId: string;
  customDestination: string;
  origin: string;
  tripType: TripType;
  style: TravelStyle;
  transportMode: TransportMode;
  startDate: string;
  endDate: string;
  travelers: number;
  interests: Interest[];
  totalBudget: number;
  emergencyFund: number;
  /** Where the traveler starts, when known (from their location or a place they picked) */
  originPoint?: GeoPoint | null;
  /** A typed destination's real location, when it could be found */
  destinationPoint?: GeoPoint | null;
  /** What they don't pay for (staying with family...) and getting to the airport; see applyCoverage */
  coverage?: TripCoverage | null;
  /** Multi-city: the cities after the destination, in order, with nights in each */
  cities?: TripCity[] | null;
  /** Flight cabin (economy when unset); fares scale with it */
  cabin?: Cabin | null;
  /** Stops they'll take on flights (any when unset): live searches and booking links follow it */
  flightStops?: FlightStops | null;
  /** The traveler's passport (ISO country), for entry rules and layovers; home country when unset */
  passport?: string | null;
  /**
   * The budget was chosen by Waypoint, not typed by the traveler: it follows the
   * trip's costs (new cities, cabin, trip type) until the traveler sets their own.
   */
  budgetAuto?: boolean;
}

export interface RoadTripPlan {
  origin: string;
  destination: string;
  /** Money set aside for stops & detours */
  stopBudget: number;
  interests: Interest[];
  maxDetourMinutes: number;
  includedStops: RouteStop[];
}

/** Link between the local trip and its copy in the signed-in user's account. */
export interface CloudLink {
  id: string;
  revision: number;
  name: string;
  savedAt: string;
}

export interface TripState {
  version: 6;
  /** Stable for the life of one trip (kept through edits and trip-type switches, new for each trip started or opened). */
  id: string;
  isSample: boolean;
  setup: TripSetup;
  inputs: BudgetInputs;
  overrides: Overrides;
  emergencyFund: number;
  appliedSavings: Partial<Record<SavingId, Partial<BudgetInputs>>>;
  itinerary: Itinerary | null;
  roadTrip: RoadTripPlan;
  /** Last live price lookup applied to this trip */
  live: LivePrices | null;
  cloud: CloudLink | null;
  /** What's been booked (on providers' sites), by booking checklist item */
  bookings: Record<string, BookingRecord>;
}
