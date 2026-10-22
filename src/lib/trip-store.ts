import { useMemo, useSyncExternalStore } from "react";

import {
  applySaving,
  calculateBudget,
  defaultEmergencyFund,
  defaultInputs,
  SAVING_CATEGORY,
  savingsOpportunities,
  tripShape,
  type BudgetInputs,
  type Category,
  type Overrides,
  type SavingId,
} from "./budget";
import { getDestination, type Interest, type TravelStyle, type TripType } from "./demo-data";
import { addDays, generateDemoItinerary, type Itinerary } from "./itinerary";

export interface TripSetup {
  destinationId: string;
  customDestination: string;
  origin: string;
  tripType: TripType;
  style: TravelStyle;
  startDate: string;
  endDate: string;
  travelers: number;
  interests: Interest[];
  totalBudget: number;
}

export interface TripState {
  version: 1;
  isSample: boolean;
  setup: TripSetup;
  inputs: BudgetInputs;
  overrides: Overrides;
  emergencyFund: number;
  appliedSavings: Partial<Record<SavingId, Partial<BudgetInputs>>>;
  itinerary: Itinerary | null;
}

const STORAGE_KEY = "waypoint.trip.v1";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function buildTrip(setup: TripSetup, isSample = false): TripState {
  const dest = getDestination(setup.destinationId, setup.customDestination);
  const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
  return {
    version: 1,
    isSample,
    setup,
    inputs: defaultInputs(dest, setup.style, setup.tripType, setup.travelers),
    overrides: {},
    emergencyFund: defaultEmergencyFund(setup.totalBudget),
    appliedSavings: {},
    itinerary: generateDemoItinerary({
      dest,
      days: shape.days,
      startDate: setup.startDate,
      interests: setup.interests,
      style: setup.style,
      tripType: setup.tripType,
    }),
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
    startDate: start,
    endDate: addDays(start, 3),
    travelers: 2,
    interests: ["nature", "food"],
    totalBudget: 2000,
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
      const parsed = JSON.parse(raw) as TripState;
      if (parsed?.version === 1 && parsed.setup && parsed.inputs) state = parsed;
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

export const tripActions = {
  startTrip(setup: TripSetup) {
    setState(() => buildTrip(setup));
  },
  setTotalBudget(totalBudget: number) {
    setState((s) => ({ ...s, setup: { ...s.setup, totalBudget: Math.max(0, totalBudget) } }));
  },
  setEmergencyFund(amount: number) {
    setState((s) => ({ ...s, emergencyFund: Math.max(0, Math.min(amount, s.setup.totalBudget)) }));
  },
  setInput<K extends keyof BudgetInputs>(key: K, value: BudgetInputs[K]) {
    setState((s) => ({ ...s, inputs: { ...s.inputs, [key]: value } }));
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
};

export function useTrip() {
  const trip = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    const dest = getDestination(trip.setup.destinationId, trip.setup.customDestination);
    const shape = tripShape(trip.setup.startDate, trip.setup.endDate, trip.setup.travelers);
    const totals = calculateBudget(trip.inputs, shape, trip.setup.totalBudget, trip.emergencyFund, trip.overrides);
    const applied = Object.keys(trip.appliedSavings) as SavingId[];
    const savings = savingsOpportunities(trip.inputs, shape, totals.categories, dest, applied);
    const potentialSavings = Math.round(savings.reduce((s, t) => s + t.amount, 0) * 100) / 100;
    return { trip, dest, shape, totals, savings, applied, potentialSavings };
  }, [trip]);
}
