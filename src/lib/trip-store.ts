import { useMemo, useSyncExternalStore } from "react";

import {
  applySaving,
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
} from "./budget";
import {
  CUSTOM_DESTINATION_ID,
  DESTINATIONS,
  getDestination,
  modeForTripType,
  tripTypeInfo,
  upgradeTripType,
  type Interest,
  type TransportMode,
  type TravelStyle,
  type TripType,
} from "./demo-data";
import { addDays, generateDemoItinerary, type Itinerary } from "./itinerary";
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
  version: 4;
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
}

const STORAGE_KEY = "waypoint.trip.v1";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

export function buildTrip(input: TripSetup, isSample = false): TripState {
  const setup = { ...input, transportMode: modeForTripType(input.tripType, input.transportMode) };
  const dest = getDestination(setup.destinationId, setup.customDestination);
  const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
  return {
    version: 4,
    isSample,
    setup,
    inputs: defaultInputs(dest, setup.style, setup.tripType, setup.travelers, setup.transportMode),
    overrides: {},
    emergencyFund: Math.min(Math.max(0, setup.emergencyFund), setup.totalBudget),
    appliedSavings: {},
    itinerary: generateDemoItinerary({
      dest,
      days: shape.days,
      startDate: setup.startDate,
      interests: setup.interests,
      style: setup.style,
      tripType: setup.tripType,
    }),
    roadTrip: defaultRoadTrip(setup, dest.name),
    live: null,
    cloud: null,
  };
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
 * by how they travel.
 */
export function migrate(raw: unknown): TripState | null {
  const s = raw as Partial<TripState> & { version?: number };
  if (!s || !s.setup || !s.inputs) return null;
  if (s.version === 4) return { ...(s as TripState), live: s.live ?? null, cloud: s.cloud ?? null };
  if (s.version === 2 || s.version === 3) {
    const old = s as unknown as TripState;
    const mode = old.inputs.transportMode ?? old.setup.transportMode ?? "car";
    const tripType = upgradeTripType(old.setup.tripType, mode);
    return {
      ...old,
      version: 4,
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
  const dest = getDestination(setup.destinationId, setup.customDestination);
  const fresh = defaultInputs(dest, setup.style, setup.tripType, setup.travelers, "car");
  return {
    version: 4,
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
  const current = DESTINATIONS.find((d) => d.id === destinationId);
  if (current?.bestFor.includes(tripType)) return { destinationId, reason: "" };
  const next = DESTINATIONS.find((d) => d.bestFor.includes(tripType)) ?? DESTINATIONS[0]!;
  const label = tripTypeInfo(tripType).label.toLowerCase();
  return {
    destinationId: next.id,
    reason: `${current?.name ?? "That destination"} isn't a ${label} destination, so we picked ${next.name}.`,
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
  const dest = getDestination(setup.destinationId, setup.customDestination);
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
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const migrated = migrate(JSON.parse(raw));
      if (migrated) state = repairDates(migrated);
    }
  } catch {
    /* ignore corrupt storage */
  }
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

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
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

/** The trip as stored in an account: everything except the account link itself. */
export function tripForSaving(trip: TripState): Omit<TripState, "cloud"> {
  const { cloud: _cloud, ...rest } = trip;
  return { ...rest, isSample: false };
}

/** The current trip, read outside React (e.g. right before saving). */
export function currentTrip(): TripState {
  return getSnapshot();
}

export const tripActions = {
  startTrip(setup: TripSetup) {
    setState(() => buildTrip(setup));
  },
  /** Replace the current trip with one opened from the account. */
  openSavedTrip(data: unknown, link: CloudLink): boolean {
    const migrated = migrate(data);
    if (!migrated) return false;
    setState(() => ({ ...repairDates(migrated), isSample: false, cloud: link }));
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
      if (prices.hotels && prices.hotels.nightly > 0 && s.setup.tripType !== "cruise") {
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
      const dest = getDestination(s.setup.destinationId, s.setup.customDestination);
      const allowed = modeForTripType(s.setup.tripType, mode);
      const overrides = { ...s.overrides };
      for (const c of ["transportation", "gas", "tolls", "parking"] as Category[])
        delete overrides[c];
      return {
        ...s,
        setup: { ...s.setup, transportMode: allowed },
        inputs: { ...s.inputs, ...modeDefaults(dest, s.setup.style, allowed, s.setup.tripType) },
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
      const dest = getDestination(s.setup.destinationId, s.setup.customDestination);
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
  setItinerary(itinerary: Itinerary | null) {
    setState((s) => ({ ...s, itinerary }));
  },
  regenerateDemoItinerary() {
    setState((s) => {
      const dest = getDestination(s.setup.destinationId, s.setup.customDestination);
      const shape = tripShape(s.setup.startDate, s.setup.endDate, s.setup.travelers);
      return {
        ...s,
        itinerary: generateDemoItinerary({
          dest,
          days: shape.days,
          startDate: s.setup.startDate,
          interests: s.setup.interests,
          style: s.setup.style,
          tripType: s.setup.tripType,
        }),
      };
    });
  },
  removeItineraryItem(itemId: string) {
    setState((s) =>
      s.itinerary
        ? {
            ...s,
            itinerary: {
              ...s.itinerary,
              days: s.itinerary.days.map((d) => ({
                ...d,
                items: d.items.filter((i) => i.id !== itemId),
              })),
            },
          }
        : s,
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
  clearStops() {
    setState((s) => ({ ...s, roadTrip: { ...s.roadTrip, includedStops: [] } }));
  },
};

export function useTrip() {
  const trip = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    const dest = getDestination(trip.setup.destinationId, trip.setup.customDestination);
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
    const potentialSavings =
      Math.round(savings.reduce((s, t) => s + t.totalSavings * 100, 0)) / 100;
    const cuts = reductionPlan(
      trip.inputs,
      shape,
      trip.setup.totalBudget,
      trip.emergencyFund,
      trip.overrides,
      stopsTotal,
    );
    return { trip, dest, shape, totals, savings, applied, potentialSavings, cuts, stopsTotal };
  }, [trip]);
}
