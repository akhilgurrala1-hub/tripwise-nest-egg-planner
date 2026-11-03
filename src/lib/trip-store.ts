import { useSyncExternalStore } from "react";

import {
  applySaving,
  applyCoverage,
  calculateBudget,
  defaultEmergencyFund,
  defaultInputs,
  modeDefaults,
  reductionPlan,
  SAVING_CATEGORY,
  savingsOpportunities,
  stopCost,
  tripShape,
  type BudgetInputs,
  type Category,
  type Overrides,
  type SavingId,
  type TripCoverage,
} from "./budget";
import type { GeoPoint } from "./catalog";
import {
  CUSTOM_DESTINATION_ID,
  DESTINATIONS,
  destinationFor,
  modeForTripType,
  tripTypeInfo,
  upgradeTripType,
  type Interest,
  type TransportMode,
  type TravelStyle,
  type TripType,
} from "./demo-data";
import { recommendDestinations } from "./recommend";
import {
  addDays,
  fitToCoverage,
  generateDemoItinerary,
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

const STORAGE_KEY = "waypoint.trip.v1";
export const SAMPLE_TRIP_ID = "sample";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function newTripId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultRoadTrip(setup: TripSetup, destName: string): RoadTripPlan {
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
    version: 6,
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
      generateDemoItinerary({
        dest,
        days: shape.days,
        startDate: setup.startDate,
        interests: setup.interests,
        style: setup.style,
        tripType: setup.tripType,
      }),
      setup.coverage,
    ),
    roadTrip: defaultRoadTrip(setup, dest.name),
    live: null,
    cloud: null,
    bookings: {},
  };
}

/**
 * A budget that covers the default estimate for this setup plus a 10% reserve,
 * rounded up to $50 (or the planned spend plus a reserve the traveler chose).
 */
export function suggestedBudget(setup: TripSetup, reserve?: number): number {
  const dest = destinationFor(setup);
  const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
  const planned = calculateBudget(
    applyCoverage(
      defaultInputs(dest, setup.style, setup.tripType, setup.travelers, setup.transportMode),
      setup.coverage,
    ),
    shape,
    0,
    0,
  ).planned;
  return reserve !== undefined
    ? Math.ceil((planned + reserve) / 50) * 50
    : Math.ceil(planned / 0.9 / 50) * 50;
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

/** Saved trips with missing or epoch-era dates (and sample trips whose dates have passed) get moved to valid future dates, keeping their length. */
function repairDates(trip: TripState): TripState {
  const { startDate, endDate } = trip.setup;
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number(d.slice(0, 4)) >= 2000;
  const staleSample = trip.isSample && startDate < todayIso();
  if (valid(startDate) && valid(endDate) && endDate >= startDate && !staleSample) return trip;
  const days = Math.min(14, Math.max(1, tripShape(startDate, endDate, 1).days));
  const start = addDays(todayIso(), 30);
  const setup = { ...trip.setup, startDate: start, endDate: addDays(start, days - 1) };
  const dest = destinationFor(setup);
  return {
    ...trip,
    setup,
    itinerary: generateDemoItinerary({
      dest,
      days,
      startDate: start,
      interests: setup.interests,
      style: setup.style,
      tripType: setup.tripType,
    }),
  };
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

/** The current trip, read outside React (e.g. right before saving). */
export function currentTrip(): TripState {
  return getSnapshot();
}

export const tripActions = {
  startTrip(setup: TripSetup) {
    setState(() => buildTrip(setup));
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
      return { ...s, inputs, overrides, appliedSavings, live: prices };
    });
  },
  /** Real driving distance from the map service, as a round trip. */
  setRouteMiles(roundTripMiles: number) {
    setState((s) => {
      if (s.inputs.roundTripMiles === roundTripMiles) return s;
      const overrides = { ...s.overrides };
      delete overrides.gas;
      return { ...s, inputs: { ...s.inputs, roundTripMiles }, overrides };
    });
  },
  setTotalBudget(totalBudget: number) {
    setState((s) => {
      const t = Math.max(0, totalBudget);
      return {
        ...s,
        setup: { ...s.setup, totalBudget: t },
        emergencyFund: Math.min(s.emergencyFund, t),
      };
    });
  },
  setEmergencyFund(amount: number) {
    setState((s) => ({ ...s, emergencyFund: Math.max(0, Math.min(amount, s.setup.totalBudget)) }));
  },
  setInput<K extends keyof BudgetInputs>(key: K, value: BudgetInputs[K]) {
    setState((s) => ({ ...s, inputs: { ...s.inputs, [key]: value } }));
  },
  setTransportMode(mode: TransportMode) {
    setState((s) => {
      const dest = destinationFor(s.setup);
      const allowed = modeForTripType(s.setup.tripType, mode);
      const overrides = { ...s.overrides };
      for (const c of ["transportation", "gas", "tolls", "parking"] as Category[])
        delete overrides[c];
      return {
        ...s,
        setup: { ...s.setup, transportMode: allowed },
        inputs: applyCoverage(
          { ...s.inputs, ...modeDefaults(dest, s.setup.style, allowed, s.setup.tripType) },
          s.setup.coverage,
        ),
        overrides,
      };
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
    const fresh = buildTrip(setup);
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
      return { ...s, overrides };
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
            generateDemoItinerary({
              dest,
              days: shape.days,
              startDate: s.setup.startDate,
              interests: s.setup.interests,
              style: s.setup.style,
              tripType: s.setup.tripType,
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
      return { ...s, roadTrip: { ...s.roadTrip, includedStops } };
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

/** Everything the pages show about a trip, computed from its state. */
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
  return { trip, dest, shape, totals, savings, applied, potentialSavings, cuts, stopsTotal };
}

export type TripView = ReturnType<typeof derive>;

/** The same view for a trip that isn't the current one (e.g. a shared link's preview). */
export const viewTrip = (trip: TripState): TripView => derive(trip);

// Many components read the trip at once; the budget, savings and cut plan are worked out once per change, not once per component.
const derived = new WeakMap<TripState, TripView>();

export function useTrip(): TripView {
  const trip = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  let view = derived.get(trip);
  if (!view) {
    view = derive(trip);
    derived.set(trip, view);
  }
  return view;
}
