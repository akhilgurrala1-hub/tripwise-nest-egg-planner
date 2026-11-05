/**
 * The current trip: one client-side store persisted to localStorage, kept in sync
 * across tabs, with every change made through `tripActions`. The pure parts live in
 * `src/lib/trip/` (shape, building, budget fitting, migrations, the derived view)
 * and are re-exported here, so pages import everything trip-related from one place.
 */
import { useSyncExternalStore } from "react";

import {
  applyCoverage,
  applySaving,
  modeDefaults,
  SAVING_CATEGORY,
  tripShape,
  type BudgetInputs,
  type Category,
  type SavingId,
} from "./budget";
import { todayIso } from "./dates";
import {
  destinationFor,
  modeForTripType,
  tripTypeInfo,
  type Cabin,
  type FlightStops,
  type TransportMode,
  type TripType,
} from "./demo-data";
import { recommendDestinations } from "./recommend";
import {
  fitToCoverage,
  generateTripItinerary,
  type Itinerary,
  type ItineraryItem,
} from "./itinerary";
import {
  addItem,
  keepCustomItems,
  moveItem,
  moveItemToDay,
  removeItem,
  restoreItem,
  updateItem,
  type ItemPatch,
  type RemovedItem,
} from "./itinerary-edit";
import type { BookingRecord } from "./booking";
import type { LivePrices } from "./prices/live";
import type { RouteStop } from "./routing/types";
import {
  buildTrip,
  destinationForTripType,
  newTripId,
  planKey,
  sampleSetup,
  SAMPLE_TRIP_ID,
  tripLegs,
} from "./trip/build";
import { fitBudget, plannedNow, rebudget, tidy } from "./trip/budget-fit";
import { migrate, repairDates } from "./trip/migrate";
import type { CloudLink, RoadTripPlan, TripSetup, TripState } from "./trip/types";
import { viewTrip, type TripView } from "./trip/view";

export * from "./trip/types";
export * from "./trip/build";
export * from "./trip/budget-fit";
export * from "./trip/migrate";
export * from "./trip/view";

const STORAGE_KEY = "waypoint.trip.v1";

// Built lazily: edge runtimes freeze the clock at 1970 during module load,
// which is what produced "Jan 31 – Feb 3, 1970" sample dates.
let sampleCache: { day: string; trip: TripState } | null = null;
function getSample(): TripState {
  const day = todayIso();
  if (sampleCache?.day === day) return sampleCache.trip;
  const trip = buildTrip(sampleSetup(), true);
  if (!day.startsWith("1970")) sampleCache = { day, trip };
  return trip;
}

let state: TripState | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = readStored();
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable */
  }
}

function setState(updater: (s: TripState) => TripState) {
  load();
  state = updater(state ?? getSample());
  persist();
  listeners.forEach((l) => l());
}

/** Read the stored trip (another tab may have written it). */
function readStored(): TripState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const migrated = raw ? migrate(JSON.parse(raw)) : null;
    return migrated ? repairDates(migrated) : null;
  } catch {
    return null;
  }
}

/** Another tab changed the trip: show its version here too, so tabs never overwrite each other with stale copies. */
function onStorage(e: StorageEvent) {
  if (e.key !== null && e.key !== STORAGE_KEY) return;
  if (e.storageArea && e.storageArea !== window.localStorage) return;
  loaded = true;
  state = readStored();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  if (listeners.size === 0 && typeof window !== "undefined")
    window.addEventListener("storage", onStorage);
  listeners.add(l);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && typeof window !== "undefined")
      window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  load();
  if (!state) state = getSample();
  return state;
}

function getServerSnapshot() {
  return getSample();
}

/** The current trip, read outside React (e.g. right before saving). */
export function currentTrip(): TripState {
  return getSnapshot();
}

export const tripActions = {
  /**
   * Start a new trip. Its budget is fitted to the trip first (see fitBudget), so it
   * never starts over budget; returns a note when the traveler's budget was raised.
   */
  startTrip(setup: TripSetup): string | null {
    const fitted = fitBudget(setup);
    setState(() => buildTrip(fitted.setup));
    return fitted.note;
  },
  /** Fly in another cabin: fares follow, and so does a budget Waypoint chose. */
  /** Which passport they travel on: entry rules and layover advice follow it. */
  setPassport(passport: string) {
    setState((s) => ({
      ...s,
      setup: { ...s.setup, passport: passport.slice(0, 2).toUpperCase() },
    }));
  },
  /** Nonstop only, one stop at most, or any: live flight searches and booking links follow it. */
  setFlightStops(flightStops: FlightStops) {
    setState((s) => ({ ...s, setup: { ...s.setup, flightStops } }));
  },
  setCabin(cabin: Cabin) {
    setState((s) => {
      const setup = { ...s.setup, cabin };
      const dest = destinationFor(setup);
      const overrides = { ...s.overrides };
      if (s.inputs.transportMode === "flight") delete overrides.transportation;
      const inputs =
        s.inputs.transportMode === "flight"
          ? { ...s.inputs, farePerPerson: dest.fares.flight }
          : s.inputs;
      const appliedSavings = { ...s.appliedSavings };
      delete appliedSavings.fares;
      return rebudget({ ...s, setup, inputs, overrides, appliedSavings, live: s.live }, "set");
    });
  },
  /**
   * Start the untouched sample trip from where the traveler is, headed somewhere
   * that suits them nearby. Does nothing once they've changed the sample.
   */
  personalizeSample(home: { label: string; lat: number; lon: number }) {
    const s = getSnapshot();
    const pristine =
      s.isSample &&
      Object.keys(s.overrides).length === 0 &&
      Object.keys(s.appliedSavings).length === 0 &&
      s.roadTrip.includedStops.length === 0 &&
      !s.itinerary?.days.some((d) => d.items.some((i) => i.custom));
    const from = { lat: home.lat, lon: home.lon };
    const same =
      s.setup.origin === home.label &&
      s.setup.originPoint?.lat === from.lat &&
      s.setup.originPoint?.lon === from.lon;
    if (!pristine || same) return;
    const setup: TripSetup = { ...sampleSetup(), origin: home.label, originPoint: from };
    const pick = recommendDestinations({
      from,
      tripType: "road-trip",
      interests: setup.interests,
      limit: 1,
    })[0];
    if (pick) setup.destinationId = pick.id;
    setState(() => buildTrip(setup, true));
  },
  /** Replace the current trip with one opened from the account. */
  openSavedTrip(data: unknown, link: CloudLink): boolean {
    const migrated = migrate(data);
    if (!migrated) return false;
    setState(() => ({ ...repairDates(migrated), id: newTripId(), isSample: false, cloud: link }));
    return true;
  },
  /** Replace the current trip with one from a shared link (as a new trip of the traveler's own). */
  openSharedTrip(
    shared: Omit<TripState, "id" | "cloud" | "bookings" | "live" | "isSample">,
  ): boolean {
    const migrated = migrate({ ...shared, isSample: false, live: null, cloud: null, bookings: {} });
    if (!migrated) return false;
    setState(() => ({ ...repairDates(migrated), id: newTripId(), isSample: false, cloud: null }));
    return true;
  },
  setCloudLink(link: CloudLink | null) {
    setState((s) => ({ ...s, cloud: link, isSample: link ? false : s.isSample }));
  },
  /** Use live prices in the budget. Custom amounts and savings tied to those prices are cleared so the new numbers show. */
  applyLivePrices(prices: LivePrices) {
    setState((s) => {
      const inputs = { ...s.inputs };
      const overrides = { ...s.overrides };
      const appliedSavings = { ...s.appliedSavings };
      if (prices.gas) {
        inputs.gasPrice = prices.gas.price;
        delete overrides.gas;
        delete appliedSavings["fuel-rewards"];
      }
      if (
        prices.hotels &&
        prices.hotels.nightly > 0 &&
        s.setup.tripType !== "cruise" &&
        !s.setup.coverage?.lodging
      ) {
        inputs.nightlyRate = prices.hotels.nightly;
        delete overrides.accommodations;
        delete appliedSavings.lodging;
      }
      if (prices.flights && s.inputs.transportMode === "flight") {
        inputs.farePerPerson = prices.flights.perPerson;
        delete overrides.transportation;
        delete appliedSavings.fares;
      }
      return rebudget({ ...s, inputs, overrides, appliedSavings, live: prices }, "raise");
    });
  },
  /** Real driving distance from the map service, as a round trip. */
  setRouteMiles(roundTripMiles: number) {
    setState((s) => {
      if (s.inputs.roundTripMiles === roundTripMiles) return s;
      const overrides = { ...s.overrides };
      delete overrides.gas;
      return rebudget({ ...s, inputs: { ...s.inputs, roundTripMiles }, overrides }, "raise");
    });
  },
  setTotalBudget(totalBudget: number) {
    setState((s) => {
      const t = Math.max(0, totalBudget);
      return {
        ...s,
        // The traveler's own number from now on: Waypoint stops adjusting it.
        setup: { ...s.setup, totalBudget: t, budgetAuto: false },
        emergencyFund: Math.min(s.emergencyFund, t),
      };
    });
  },
  setEmergencyFund(amount: number) {
    setState((s) => {
      if (s.setup.budgetAuto) {
        // A Waypoint-chosen budget grows or shrinks with the reserve, so spending money stays covered.
        const fund = Math.max(0, amount);
        const totalBudget = tidy(plannedNow(s) + fund);
        return { ...s, emergencyFund: fund, setup: { ...s.setup, totalBudget } };
      }
      return { ...s, emergencyFund: Math.max(0, Math.min(amount, s.setup.totalBudget)) };
    });
  },
  setInput<K extends keyof BudgetInputs>(key: K, value: BudgetInputs[K]) {
    setState((s) => rebudget({ ...s, inputs: { ...s.inputs, [key]: value } }, "raise"));
  },
  setTransportMode(mode: TransportMode) {
    setState((s) => {
      const dest = destinationFor(s.setup);
      const allowed = modeForTripType(s.setup.tripType, mode);
      const overrides = { ...s.overrides };
      for (const c of ["transportation", "gas", "tolls", "parking"] as Category[])
        delete overrides[c];
      return rebudget(
        {
          ...s,
          setup: { ...s.setup, transportMode: allowed },
          inputs: applyCoverage(
            { ...s.inputs, ...modeDefaults(dest, s.setup.style, allowed, s.setup.tripType) },
            s.setup.coverage,
          ),
          overrides,
        },
        "set",
      );
    });
  },
  /**
   * Switch to another trip type. The budget is re-estimated for that kind of trip
   * (dates, travelers, budget, reserve and interests are kept). Returns what changed, in plain words.
   */
  setTripType(tripType: TripType): string[] {
    const s = getSnapshot();
    if (s.setup.tripType === tripType) return [];
    const info = tripTypeInfo(tripType);
    const { destinationId, reason } = destinationForTripType(s.setup, tripType);
    const transportMode = modeForTripType(tripType, s.setup.transportMode);
    const setup: TripSetup = {
      ...s.setup,
      tripType,
      destinationId,
      transportMode,
      emergencyFund: s.emergencyFund,
    };
    const fresh = buildTrip(s.setup.budgetAuto ? fitBudget(setup).setup : setup);
    const changes = [
      ...(reason ? [reason] : []),
      transportMode !== s.setup.transportMode
        ? `Travel switched to ${transportMode === "rental-car" ? "a rental car" : transportMode === "car" ? "your car" : `${transportMode}`}.`
        : "",
      tripType === "cruise"
        ? "Your cabin and main meals are now part of the cruise fare, so hotel nights are $0."
        : "",
      s.setup.tripType === "road-trip" && s.roadTrip.includedStops.length > 0
        ? "Road-trip stops were removed."
        : "",
      Object.keys(s.overrides).length > 0 || Object.keys(s.appliedSavings).length > 0
        ? "Custom amounts and applied savings were reset for the new trip type."
        : "",
      s.live ? "Check live prices again for this trip type." : "",
    ].filter(Boolean);
    setState(() => ({
      ...fresh,
      id: s.id === SAMPLE_TRIP_ID ? fresh.id : s.id,
      isSample: false,
      cloud: s.cloud,
    }));
    return [`Now planning a ${info.label.toLowerCase()}.`, ...changes];
  },
  setOverride(cat: Category, value: number | undefined) {
    setState((s) => {
      const overrides = { ...s.overrides };
      if (value === undefined) delete overrides[cat];
      else overrides[cat] = Math.max(0, value);
      return rebudget({ ...s, overrides }, "raise");
    });
  },
  applySaving(id: SavingId) {
    setState((s) => {
      const dest = destinationFor(s.setup);
      const changes = applySaving(id, s.inputs, dest);
      const previous = Object.fromEntries(
        Object.keys(changes).map((k) => [k, s.inputs[k as keyof BudgetInputs]]),
      ) as Partial<BudgetInputs>;
      const overrides = { ...s.overrides };
      delete overrides[SAVING_CATEGORY[id]];
      return {
        ...s,
        inputs: { ...s.inputs, ...changes },
        overrides,
        appliedSavings: { ...s.appliedSavings, [id]: previous },
      };
    });
  },
  undoSaving(id: SavingId) {
    setState((s) => {
      const prev = s.appliedSavings[id];
      if (!prev) return s;
      const appliedSavings = { ...s.appliedSavings };
      delete appliedSavings[id];
      return { ...s, inputs: { ...s.inputs, ...prev }, appliedSavings };
    });
  },
  /** Replace the plan. The traveler's own stops are carried over; returns how many were kept. */
  setItinerary(itinerary: Itinerary | null): number {
    if (!itinerary) {
      setState((s) => ({ ...s, itinerary: null }));
      return 0;
    }
    const { itinerary: merged, kept } = keepCustomItems(getSnapshot().itinerary, itinerary);
    setState((s) => ({ ...s, itinerary: merged }));
    return kept;
  },
  /**
   * Apply a plan that was requested for `key` (see `planKey`), only if the trip
   * still matches. Returns how many of the traveler's own stops were kept, or
   * null when the trip changed and the plan was discarded.
   */
  setItineraryFor(key: string, itinerary: Itinerary): number | null {
    if (planKey(getSnapshot()) !== key) return null;
    return tripActions.setItinerary(itinerary);
  },
  regenerateDemoItinerary() {
    setState((s) => {
      const dest = destinationFor(s.setup);
      const shape = tripShape(s.setup.startDate, s.setup.endDate, s.setup.travelers);
      return {
        ...s,
        itinerary: keepCustomItems(
          s.itinerary,
          fitToCoverage(
            generateTripItinerary({
              dest,
              days: shape.days,
              startDate: s.setup.startDate,
              interests: s.setup.interests,
              style: s.setup.style,
              tripType: s.setup.tripType,
              legs: tripLegs(s.setup),
            }),
            s.setup.coverage,
          ),
        ).itinerary,
      };
    });
  },
  /** Remove an item; returns what was removed so the caller can offer Undo. */
  removeItineraryItem(itemId: string): RemovedItem | null {
    const s0 = getSnapshot();
    if (!s0.itinerary) return null;
    const { itinerary, removed } = removeItem(s0.itinerary, itemId);
    if (removed) setState((s) => ({ ...s, itinerary }));
    return removed;
  },
  restoreItineraryItem(removed: RemovedItem) {
    setState((s) => (s.itinerary ? { ...s, itinerary: restoreItem(s.itinerary, removed) } : s));
  },
  addItineraryItem(dayIndex: number, item: Omit<ItineraryItem, "id">) {
    setState((s) => (s.itinerary ? { ...s, itinerary: addItem(s.itinerary, dayIndex, item) } : s));
  },
  updateItineraryItem(itemId: string, patch: ItemPatch) {
    setState((s) =>
      s.itinerary ? { ...s, itinerary: updateItem(s.itinerary, itemId, patch) } : s,
    );
  },
  moveItineraryItem(itemId: string, direction: -1 | 1) {
    setState((s) =>
      s.itinerary ? { ...s, itinerary: moveItem(s.itinerary, itemId, direction) } : s,
    );
  },
  moveItineraryItemToDay(itemId: string, toDay: number) {
    setState((s) =>
      s.itinerary ? { ...s, itinerary: moveItemToDay(s.itinerary, itemId, toDay) } : s,
    );
  },
  resetToEstimates() {
    setState((s) => ({ ...s, overrides: {} }));
  },
  updateRoadTrip(patch: Partial<Omit<RoadTripPlan, "includedStops">>) {
    setState((s) => ({ ...s, roadTrip: { ...s.roadTrip, ...patch } }));
  },
  toggleStop(stop: RouteStop) {
    setState((s) => {
      const exists = s.roadTrip.includedStops.some((x) => x.id === stop.id);
      const includedStops = exists
        ? s.roadTrip.includedStops.filter((x) => x.id !== stop.id)
        : [...s.roadTrip.includedStops, stop].sort((a, b) => a.position - b.position);
      return rebudget({ ...s, roadTrip: { ...s.roadTrip, includedStops } }, "raise");
    });
  },
  /** Record progress on one booking checklist item. */
  setBooking(key: string, patch: Partial<BookingRecord>) {
    setState((s) => {
      const prev = s.bookings[key] ?? { status: "todo", confirmation: "", price: null };
      const next: BookingRecord = {
        ...prev,
        ...patch,
        confirmation: (patch.confirmation ?? prev.confirmation).slice(0, 80),
      };
      return { ...s, bookings: { ...s.bookings, [key]: next } };
    });
  },
  clearStops() {
    setState((s) => ({ ...s, roadTrip: { ...s.roadTrip, includedStops: [] } }));
  },
};

// Many components read the trip at once; the budget, savings and cut plan are worked out once per change, not once per component.
const derived = new WeakMap<TripState, TripView>();

export function useTrip(): TripView {
  const trip = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  let view = derived.get(trip);
  if (!view) {
    view = viewTrip(trip);
    derived.set(trip, view);
  }
  return view;
}
