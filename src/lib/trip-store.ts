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
  roundMoney,
  tripShape,
  withSaving,
  type BudgetInputs,
  type Category,
  type Overrides,
  type SavingId,
} from "./budget";
import {
  getDestination,
  type Interest,
  type TransportMode,
  type TravelStyle,
  type TripType,
} from "./demo-data";
import { generateDemoItinerary, itineraryActivityCost, type Itinerary } from "./itinerary";
import { addDays, isIsoDate } from "./dates";
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

export interface TripState {
  version: 3;
  isSample: boolean;
  setup: TripSetup;
  inputs: BudgetInputs;
  overrides: Overrides;
  emergencyFund: number;
  appliedSavings: Partial<Record<SavingId, Partial<BudgetInputs>>>;
  savingOverrides: Partial<Record<SavingId, number>>;
  syncActivities: boolean;
  itinerary: Itinerary | null;
  roadTrip: RoadTripPlan;
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

export function buildTrip(setup: TripSetup, isSample = false): TripState {
  const dest = getDestination(setup.destinationId, setup.customDestination);
  const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
  return {
    version: 3,
    isSample,
    setup,
    inputs: defaultInputs(dest, setup.style, setup.tripType, setup.travelers, setup.transportMode),
    overrides: {},
    emergencyFund: Math.min(Math.max(0, setup.emergencyFund), setup.totalBudget),
    appliedSavings: {},
    savingOverrides: {},
    syncActivities: false,
    itinerary: generateDemoItinerary({
      dest,
      days: shape.days,
      startDate: setup.startDate,
      interests: setup.interests,
      style: setup.style,
      tripType: setup.tripType,
    }),
    roadTrip: defaultRoadTrip(setup, dest.name),
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

/** Upgrade trips saved by the first version of the app. */
export function migrate(raw: unknown): TripState | null {
  const s = raw as Omit<Partial<TripState>, "version"> & { version?: number };
  if (!s || !s.setup || !s.inputs) return null;
  if (s.version === 3) return s as TripState;
  if (s.version === 2)
    return { ...s, version: 3, savingOverrides: {}, syncActivities: false } as TripState;
  if (s.version !== 1) return null;
  const setup: TripSetup = {
    ...(s.setup as TripSetup),
    transportMode: "car",
    emergencyFund: s.emergencyFund ?? defaultEmergencyFund(s.setup.totalBudget),
  };
  const dest = getDestination(setup.destinationId, setup.customDestination);
  const fresh = defaultInputs(dest, setup.style, setup.tripType, setup.travelers, "car");
  return {
    version: 3,
    isSample: !!s.isSample,
    setup,
    inputs: { ...fresh, ...s.inputs, transportMode: "car" },
    overrides: s.overrides ?? {},
    emergencyFund: setup.emergencyFund,
    appliedSavings: s.appliedSavings ?? {},
    savingOverrides: {},
    syncActivities: false,
    itinerary: s.itinerary ?? null,
    roadTrip: defaultRoadTrip(setup, dest.name),
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
  const staleSample = trip.isSample && startDate < todayIso();
  if (isIsoDate(startDate) && isIsoDate(endDate) && endDate >= startDate && !staleSample)
    return trip;
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
  const previous = state ?? getSample();
  const next = updater(previous);
  if (next === previous) return;
  state = next;
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

export const tripActions = {
  startTrip(setup: TripSetup) {
    setState(() => buildTrip(setup));
  },
  setTotalBudget(totalBudget: number) {
    setState((s) => {
      const t = Math.max(0, totalBudget);
      const emergencyFund = Math.min(s.emergencyFund, t);
      return { ...s, setup: { ...s.setup, totalBudget: t, emergencyFund }, emergencyFund };
    });
  },
  setEmergencyFund(amount: number) {
    setState((s) => {
      const emergencyFund = Math.max(0, Math.min(amount, s.setup.totalBudget));
      return { ...s, setup: { ...s.setup, emergencyFund }, emergencyFund };
    });
  },
  setInput<K extends keyof BudgetInputs>(key: K, value: BudgetInputs[K]) {
    setState((s) => ({
      ...s,
      inputs: { ...s.inputs, [key]: value },
      syncActivities: key === "activitiesPerPerson" ? false : s.syncActivities,
    }));
  },
  setTransportMode(mode: TransportMode) {
    setState((s) => {
      const dest = getDestination(s.setup.destinationId, s.setup.customDestination);
      const overrides = { ...s.overrides };
      for (const c of ["transportation", "gas", "tolls", "parking"] as Category[])
        delete overrides[c];
      return {
        ...s,
        setup: { ...s.setup, transportMode: mode },
        inputs: { ...s.inputs, ...modeDefaults(dest, s.setup.style, mode) },
        overrides,
      };
    });
  },
  setOverride(cat: Category, value: number | undefined) {
    setState((s) => {
      const overrides = { ...s.overrides };
      if (value === undefined) delete overrides[cat];
      else overrides[cat] = Math.max(0, value);
      const savingOverrides = { ...s.savingOverrides };
      for (const id of Object.keys(s.appliedSavings) as SavingId[]) {
        if (SAVING_CATEGORY[id] === cat) delete savingOverrides[id];
      }
      return {
        ...s,
        overrides,
        savingOverrides,
        syncActivities: cat === "activities" ? false : s.syncActivities,
      };
    });
  },
  applySaving(id: SavingId) {
    setState((s) => {
      if (s.appliedSavings[id] || (s.syncActivities && SAVING_CATEGORY[id] === "activities"))
        return s;
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
        savingOverrides: {
          ...s.savingOverrides,
          ...(s.overrides[SAVING_CATEGORY[id]] !== undefined
            ? { [id]: s.overrides[SAVING_CATEGORY[id]] }
            : {}),
        },
      };
    });
  },
  undoSaving(id: SavingId) {
    setState((s) => {
      const prev = s.appliedSavings[id];
      if (!prev) return s;
      const appliedSavings = { ...s.appliedSavings };
      const savingOverrides = { ...s.savingOverrides };
      const overrides = { ...s.overrides };
      const dest = getDestination(s.setup.destinationId, s.setup.customDestination);
      const appliedValues = applySaving(id, { ...s.inputs, ...prev }, dest);
      const restore = Object.fromEntries(
        Object.entries(prev).filter(
          ([key]) =>
            s.inputs[key as keyof BudgetInputs] === appliedValues[key as keyof BudgetInputs],
        ),
      );
      // Keep a newer manual amount; otherwise restore the amount replaced by Apply.
      if (
        Object.keys(restore).length === Object.keys(prev).length &&
        overrides[SAVING_CATEGORY[id]] === undefined &&
        savingOverrides[id] !== undefined
      )
        overrides[SAVING_CATEGORY[id]] = savingOverrides[id];
      delete appliedSavings[id];
      delete savingOverrides[id];
      return {
        ...s,
        inputs: { ...s.inputs, ...restore },
        overrides,
        appliedSavings,
        savingOverrides,
      };
    });
  },
  setItinerary(itinerary: Itinerary | null, expectedTrip?: TripState) {
    let applied = false;
    setState((s) => {
      if (expectedTrip && s !== expectedTrip) return s;
      applied = true;
      return { ...s, itinerary };
    });
    return applied;
  },
  setActivitySync(syncActivities: boolean) {
    setState((s) => (syncActivities && !s.itinerary ? s : { ...s, syncActivities }));
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
    setState((s) => ({ ...s, overrides: {}, syncActivities: false }));
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

export function summarizeTrip(trip: TripState) {
  const dest = getDestination(trip.setup.destinationId, trip.setup.customDestination);
  const shape = tripShape(trip.setup.startDate, trip.setup.endDate, trip.setup.travelers);
  const stopsTotal = stopsTotalFor(trip);
  const overrides = trip.syncActivities
    ? { ...trip.overrides, activities: itineraryActivityCost(trip.itinerary, shape.travelers) }
    : trip.overrides;
  const totals = calculateBudget(
    trip.inputs,
    shape,
    trip.setup.totalBudget,
    trip.emergencyFund,
    overrides,
    stopsTotal,
  );
  const applied = Object.keys(trip.appliedSavings) as SavingId[];
  const savings = savingsOpportunities(
    trip.inputs,
    shape,
    overrides,
    stopsTotal,
    dest,
    applied,
    trip.syncActivities ? ["activities"] : [],
  );
  const combined = savings.reduce(
    (current, tip) => withSaving(tip.id, current.inputs, current.overrides, dest),
    { inputs: trip.inputs, overrides },
  );
  const afterSavings = calculateBudget(
    combined.inputs,
    shape,
    trip.setup.totalBudget,
    trip.emergencyFund,
    combined.overrides,
    stopsTotal,
  );
  const potentialSavings = roundMoney(totals.planned - afterSavings.planned);
  const cuts = reductionPlan(
    trip.inputs,
    shape,
    trip.setup.totalBudget,
    trip.emergencyFund,
    overrides,
    stopsTotal,
  );
  return { trip, dest, shape, totals, savings, applied, potentialSavings, cuts, stopsTotal };
}

export function useTrip() {
  const trip = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => summarizeTrip(trip), [trip]);
}
