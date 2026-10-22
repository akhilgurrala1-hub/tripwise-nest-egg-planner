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
  getDestination,
  type Interest,
  type TransportMode,
  type TravelStyle,
  type TripType,
} from "./demo-data";
import { addDays, generateDemoItinerary, type Itinerary } from "./itinerary";
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
  version: 2;
  isSample: boolean;
  setup: TripSetup;
  inputs: BudgetInputs;
  overrides: Overrides;
  emergencyFund: number;
  appliedSavings: Partial<Record<SavingId, Partial<BudgetInputs>>>;
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
    version: 2,
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
function migrate(raw: unknown): TripState | null {
  const s = raw as Partial<TripState> & { version?: number };
  if (!s || !s.setup || !s.inputs) return null;
  if (s.version === 2) return s as TripState;
  if (s.version !== 1) return null;
  const setup: TripSetup = {
    ...(s.setup as TripSetup),
    transportMode: "car",
    emergencyFund: s.emergencyFund ?? defaultEmergencyFund(s.setup.totalBudget),
  };
  const dest = getDestination(setup.destinationId, setup.customDestination);
  const fresh = defaultInputs(dest, setup.style, setup.tripType, setup.travelers, "car");
  return {
    version: 2,
    isSample: !!s.isSample,
    setup,
    inputs: { ...fresh, ...s.inputs, transportMode: "car" },
    overrides: s.overrides ?? {},
    emergencyFund: setup.emergencyFund,
    appliedSavings: s.appliedSavings ?? {},
    itinerary: s.itinerary ?? null,
    roadTrip: defaultRoadTrip(setup, dest.name),
  };
}

const SAMPLE = buildTrip(sampleSetup(), true);

let state: TripState = SAMPLE;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const migrated = migrate(JSON.parse(raw));
      if (migrated) state = migrated;
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
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  load();
  return state;
}

function getServerSnapshot() {
  return SAMPLE;
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
      return { ...s, setup: { ...s.setup, totalBudget: t }, emergencyFund: Math.min(s.emergencyFund, t) };
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
      const overrides = { ...s.overrides };
      for (const c of ["transportation", "gas", "tolls", "parking"] as Category[]) delete overrides[c];
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
              days: s.itinerary.days.map((d) => ({ ...d, items: d.items.filter((i) => i.id !== itemId) })),
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
    const savings = savingsOpportunities(trip.inputs, shape, totals.categories, dest, applied);
    const potentialSavings = Math.round(savings.reduce((s, t) => s + t.amount, 0) * 100) / 100;
    const cuts = reductionPlan(trip.inputs, shape, trip.setup.totalBudget, trip.emergencyFund, trip.overrides, stopsTotal);
    return { trip, dest, shape, totals, savings, applied, potentialSavings, cuts, stopsTotal };
  }, [trip]);
}
