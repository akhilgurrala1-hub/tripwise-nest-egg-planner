import { inclusiveDays } from "./dates";
import {
  isDrivingMode,
  type DemoDestination,
  type TransportMode,
  type TravelStyle,
  type TripType,
} from "./demo-data";

export const CATEGORIES = [
  "transportation",
  "gas",
  "tolls",
  "parking",
  "accommodations",
  "food",
  "snacks",
  "water",
  "activities",
  "stops",
  "taxes",
  "misc",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  transportation: "Transportation",
  gas: "Gas",
  tolls: "Tolls",
  parking: "Parking",
  accommodations: "Hotels & lodging",
  food: "Meals",
  snacks: "Snacks",
  water: "Water & drinks",
  activities: "Activities",
  stops: "Road-trip stops",
  taxes: "Taxes & fees",
  misc: "Miscellaneous",
};

/** Categories the traveler can type a custom total for. Road-trip stops are driven by the stops they pick. */
export const OVERRIDABLE: Category[] = CATEGORIES.filter((c) => c !== "stops");

/** Taxes are applied to these categories. */
export const TAXABLE: Category[] = ["accommodations", "food", "snacks", "activities"];

/** Sample assumption until a mapping service supplies real detour distances. */
export const DETOUR_SAMPLE_MPH = 35;

export interface BudgetInputs {
  transportMode: TransportMode;
  roundTripMiles: number;
  mpg: number;
  gasPrice: number;
  /** Round-trip fare per person (flight, train or bus) */
  farePerPerson: number;
  rentalPerDay: number;
  /** Rideshare / transit at the destination, whole group, per day */
  localTransitPerDay: number;
  foodPerPersonDay: number;
  snacksPerPersonDay: number;
  waterPerPersonDay: number;
  nightlyRate: number;
  rooms: number;
  parkingPerDay: number;
  tolls: number;
  activitiesPerPerson: number;
  /** Applied to hotels + meals + snacks + activities */
  taxRatePct: number;
  /** Cushion applied to every planned category except road-trip stops and itself */
  miscPct: number;
}

export type Overrides = Partial<Record<Category, number>>;

export interface TripShape {
  travelers: number;
  days: number;
  nights: number;
}

export interface BudgetTotals {
  categories: Record<Category, number>;
  estimates: Record<Category, number>;
  totalBudget: number;
  emergencyFund: number;
  spendable: number;
  planned: number;
  remaining: number;
  overBudget: boolean;
  /** Share of spendable money already planned; null when there is no spendable money. */
  percentUsed: number | null;
  perPersonPerDay: number;
}

const clampNum = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
/** Whole cents, immune to binary float noise like 1.005 * 100 = 100.49999… */
export const toCents = (n: number) => Math.round(Number((clampNum(n) * 100).toPrecision(12)));
const signedCents = (n: number) => (Number.isFinite(n) ? Math.round(Number((n * 100).toPrecision(12))) : 0);
export const roundMoney = (n: number) => signedCents(n) / 100;

export function tripShape(startDate: string, endDate: string, travelers: number): TripShape {
  const days = inclusiveDays(startDate, endDate) ?? 1;
  return { travelers: Math.max(1, Math.round(travelers) || 1), days, nights: Math.max(0, days - 1) };
}

/**
 * Estimate for every category from the editable inputs, with custom totals applied.
 * All sums run in whole cents; every category is rounded to the cent exactly once.
 */
export function estimateCategories(
  inputs: BudgetInputs,
  trip: TripShape,
  overrides: Overrides = {},
  stopsTotal = 0,
): { estimates: Record<Category, number>; categories: Record<Category, number> } {
  const est: Partial<Record<Category, number>> = {};
  const eff: Partial<Record<Category, number>> = {};
  const set = (cat: Category, cents: number) => {
    est[cat] = cents;
    const o = overrides[cat];
    eff[cat] = o !== undefined && OVERRIDABLE.includes(cat) ? toCents(o) : cents;
  };

  const driving = isDrivingMode(inputs.transportMode);
  const fareModes: TransportMode[] = ["flight", "train", "bus"];
  const gallons = driving && inputs.mpg > 0 ? clampNum(inputs.roundTripMiles) / inputs.mpg : 0;

  const fares = fareModes.includes(inputs.transportMode) ? toCents(inputs.farePerPerson) * trip.travelers : 0;
  const rental = inputs.transportMode === "rental-car" ? toCents(inputs.rentalPerDay) * trip.days : 0;
  set("transportation", fares + rental + toCents(inputs.localTransitPerDay) * trip.days);
  set("gas", toCents(gallons * clampNum(inputs.gasPrice)));
  set("tolls", driving ? toCents(inputs.tolls) : 0);
  set("parking", toCents(inputs.parkingPerDay) * trip.days);
  set("accommodations", toCents(inputs.nightlyRate) * Math.max(0, Math.round(inputs.rooms)) * trip.nights);
  set("food", toCents(inputs.foodPerPersonDay) * trip.travelers * trip.days);
  set("snacks", toCents(inputs.snacksPerPersonDay) * trip.travelers * trip.days);
  set("water", toCents(inputs.waterPerPersonDay) * trip.travelers * trip.days);
  set("activities", toCents(inputs.activitiesPerPerson) * trip.travelers);
  set("stops", toCents(stopsTotal));

  const taxBase = TAXABLE.reduce((s, c) => s + (eff[c] ?? 0), 0);
  set("taxes", Math.round((clampNum(inputs.taxRatePct) / 100) * taxBase));

  const cushionBase = CATEGORIES.filter((c) => c !== "misc" && c !== "stops").reduce((s, c) => s + (eff[c] ?? 0), 0);
  set("misc", Math.round((clampNum(inputs.miscPct) / 100) * cushionBase));

  const dollars = (m: Partial<Record<Category, number>>) =>
    Object.fromEntries(CATEGORIES.map((c) => [c, (m[c] ?? 0) / 100])) as Record<Category, number>;
  return { estimates: dollars(est), categories: dollars(eff) };
}

/**
 * The emergency reserve is protected: it is carved out of the total budget first
 * and never counts as money available for planned spending.
 */
export function calculateBudget(
  inputs: BudgetInputs,
  trip: TripShape,
  totalBudget: number,
  emergencyFund: number,
  overrides: Overrides = {},
  stopsTotal = 0,
): BudgetTotals {
  const { estimates, categories } = estimateCategories(inputs, trip, overrides, stopsTotal);
  const totalC = toCents(totalBudget);
  const reserveC = Math.min(toCents(emergencyFund), totalC);
  const spendableC = totalC - reserveC;
  const plannedC = CATEGORIES.reduce((s, c) => s + Math.round(categories[c] * 100), 0);
  const remainingC = spendableC - plannedC;
  return {
    categories,
    estimates,
    totalBudget: totalC / 100,
    emergencyFund: reserveC / 100,
    spendable: spendableC / 100,
    planned: plannedC / 100,
    remaining: remainingC / 100,
    overBudget: remainingC < 0,
    percentUsed: spendableC > 0 ? (plannedC / spendableC) * 100 : null,
    perPersonPerDay: Math.round(plannedC / trip.travelers / trip.days) / 100,
  };
}

/** Plain-language progress label shared by every page. */
export function percentLabel(t: Pick<BudgetTotals, "percentUsed">): string {
  return t.percentUsed === null ? "No spendable budget" : `${Math.round(t.percentUsed)}% of spendable money planned`;
}

// ---------- Defaults (example prices) ----------

const RENTAL_PER_DAY: Record<TravelStyle, number> = { budget: 55, comfort: 75, luxury: 140 };
const LOCAL_TRANSIT_PER_DAY: Record<TravelStyle, number> = { budget: 20, comfort: 35, luxury: 80 };
const SNACKS_PER_PERSON_DAY: Record<TravelStyle, number> = { budget: 6, comfort: 10, luxury: 18 };

/** Inputs that depend on how the traveler gets there. */
export function modeDefaults(
  dest: DemoDestination,
  style: TravelStyle,
  mode: TransportMode,
): Pick<BudgetInputs, "transportMode" | "farePerPerson" | "rentalPerDay" | "localTransitPerDay" | "parkingPerDay"> {
  const driving = isDrivingMode(mode);
  return {
    transportMode: mode,
    farePerPerson: mode === "flight" || mode === "train" || mode === "bus" ? dest.fares[mode] : 0,
    rentalPerDay: RENTAL_PER_DAY[style],
    localTransitPerDay: driving ? 0 : LOCAL_TRANSIT_PER_DAY[style],
    parkingPerDay: driving ? dest.parkingPerDay : 0,
  };
}

export function defaultInputs(
  dest: DemoDestination,
  style: TravelStyle,
  tripType: TripType,
  travelers: number,
  mode: TransportMode = "car",
): BudgetInputs {
  const isStay = tripType === "staycation";
  return {
    roundTripMiles: dest.roundTripMiles,
    mpg: 28,
    gasPrice: dest.gasPrice,
    foodPerPersonDay: dest.foodPerPersonDay[style],
    snacksPerPersonDay: SNACKS_PER_PERSON_DAY[style],
    waterPerPersonDay: style === "luxury" ? 8 : style === "comfort" ? 5 : 3,
    nightlyRate: isStay && style !== "luxury" ? 0 : dest.nightly[style],
    rooms: Math.max(1, Math.ceil(travelers / 4)),
    tolls: dest.tolls,
    activitiesPerPerson: dest.activitiesPerPerson[style],
    taxRatePct: dest.taxRatePct,
    miscPct: 5,
    ...modeDefaults(dest, style, mode),
  };
}

/** Default protected emergency reserve: 10% of the budget, rounded to the nearest $25. */
export function defaultEmergencyFund(totalBudget: number): number {
  return Math.round((clampNum(totalBudget) * 0.1) / 25) * 25;
}

// ---------- Road-trip stops ----------

export interface StopCostInput {
  costPerPerson: number;
  extraMinutes: number;
}

/** Entry cost for the whole group plus fuel for the detour (sample speed assumption). */
export function stopCost(stop: StopCostInput, travelers: number, inputs: BudgetInputs): number {
  const entry = clampNum(stop.costPerPerson) * Math.max(1, travelers);
  const driving = isDrivingMode(inputs.transportMode);
  const detourMiles = (clampNum(stop.extraMinutes) / 60) * DETOUR_SAMPLE_MPH;
  const fuel = driving && inputs.mpg > 0 ? (detourMiles / inputs.mpg) * clampNum(inputs.gasPrice) : 0;
  return roundMoney(entry + fuel);
}

// ---------- Over-budget: where to cut ----------

/** Largest realistic share of each category a traveler could trim. */
export const MAX_CUT_SHARE: Partial<Record<Category, number>> = {
  accommodations: 0.4,
  food: 0.35,
  snacks: 0.6,
  water: 0.75,
  activities: 0.5,
  transportation: 0.25,
  parking: 0.5,
  gas: 0.15,
  tolls: 1,
  stops: 1,
};

export interface CutSuggestion {
  category: Category;
  current: number;
  /** Amount to lower this category's own total by */
  cut: number;
  /** Total planned savings including the taxes and cushion that shrink with it */
  saves: number;
  closesGap: boolean;
}

export interface ReductionPlan {
  gap: number;
  suggestions: CutSuggestion[];
}

export function reductionPlan(
  inputs: BudgetInputs,
  trip: TripShape,
  totalBudget: number,
  emergencyFund: number,
  overrides: Overrides = {},
  stopsTotal = 0,
): ReductionPlan {
  const base = calculateBudget(inputs, trip, totalBudget, emergencyFund, overrides, stopsTotal);
  const gap = base.remaining < 0 ? roundMoney(-base.remaining) : 0;
  if (gap === 0) return { gap: 0, suggestions: [] };

  const taxRate = overrides.taxes === undefined ? clampNum(inputs.taxRatePct) / 100 : 0;
  const cushion = overrides.misc === undefined ? clampNum(inputs.miscPct) / 100 : 0;

  const suggestions: CutSuggestion[] = [];
  for (const cat of CATEGORIES) {
    const share = MAX_CUT_SHARE[cat];
    const current = base.categories[cat];
    if (!share || current <= 0) continue;

    // Lowering a category also lowers the tax and cushion computed from it.
    const multiplier = (1 + (TAXABLE.includes(cat) ? taxRate : 0)) * (cat === "stops" ? 1 : 1 + cushion);
    const maxCut = roundMoney(current * share);
    const needed = Math.ceil((gap / multiplier) * 100) / 100;
    let cut = Math.min(maxCut, needed);

    const savesFor = (c: number) => {
      if (cat === "stops") return roundMoney(c);
      const after = calculateBudget(inputs, trip, totalBudget, emergencyFund, { ...overrides, [cat]: current - c }, stopsTotal);
      return roundMoney(base.planned - after.planned);
    };
    let saves = savesFor(cut);
    // Cent rounding inside the calculator can leave a 1–2¢ shortfall; nudge up if room allows.
    for (let i = 0; i < 3 && saves < gap && cut + 0.01 <= maxCut; i++) {
      cut = roundMoney(cut + 0.01);
      saves = savesFor(cut);
    }
    suggestions.push({ category: cat, current, cut: roundMoney(cut), saves, closesGap: saves >= gap });
  }

  suggestions.sort((a, b) => Number(b.closesGap) - Number(a.closesGap) || b.saves - a.saves);
  return { gap, suggestions: suggestions.slice(0, 4) };
}

// ---------- Savings opportunities ----------

export type SavingId =
  | "picnic"
  | "refill"
  | "snacks"
  | "lodging"
  | "parking"
  | "tolls"
  | "free-days"
  | "fuel-rewards"
  | "fares";

export interface SavingTip {
  id: SavingId;
  title: string;
  detail: string;
  category: Category;
  /** Direct drop in this category's own total */
  amount: number;
  /** Drop in the whole trip's planned total, incl. the taxes & cushion that shrink with it */
  totalSavings: number;
  /** What this idea assumes or changes about the trip, shown before applying */
  assumption: string;
  /** Applying replaces an amount the traveler typed for this category */
  replacesCustom: boolean;
}

const SAVING_COPY: Record<SavingId, { title: string; detail: (dest: DemoDestination) => string; assumption: string }> = {
  picnic: {
    title: "Pack picnic lunches",
    detail: () => "Swap one restaurant meal a day for groceries — meals budget drops 30%.",
    assumption: "Lowers your daily meal budget. Restaurant picks in your itinerary stay as they are.",
  },
  snacks: {
    title: "Stock up at a grocery store",
    detail: () => "Buy snacks in bulk before you leave instead of at gas stations — about half off.",
    assumption: "Halves your daily snack budget.",
  },
  refill: {
    title: "Bring refillable bottles",
    detail: () => "Fill up at your stay instead of buying bottled drinks — about 75% off.",
    assumption: "Cuts your daily drinks budget to a quarter.",
  },
  lodging: {
    title: "Choose a value stay",
    detail: (dest) =>
      dest.nightly.budget === 0
        ? "Skip the hotel and sleep at home — the classic staycation move."
        : `Switch to the demo budget-tier rate of ${formatMoney(dest.nightly.budget)}/night for the same nights.`,
    assumption: "Changes your lodging assumption to a lower nightly rate. Dates stay the same.",
  },
  fares: {
    title: "Travel midweek",
    detail: () => "Tuesday–Wednesday departures are often cheaper — about 15% off fares (example).",
    assumption: "Assumes you can move your travel days to midweek. Your dates in Waypoint aren't changed.",
  },
  parking: {
    title: "Park once & walk",
    detail: () => "Use free or off-peak lots and explore on foot — about half off parking.",
    assumption: "Halves your daily parking budget.",
  },
  tolls: {
    title: "Take the toll-free route",
    detail: () => "Adds some drive time but skips every toll.",
    assumption: "Sets tolls to $0 and assumes a longer, toll-free route.",
  },
  "free-days": {
    title: "Mix in free attractions",
    detail: () => "Trade a paid activity for parks, free museum days and markets — about 25% off.",
    assumption: "Lowers your activities budget. Swap paid stops in your itinerary yourself to match.",
  },
  "fuel-rewards": {
    title: "Use a fuel rewards app",
    detail: () => "Save about $0.10 per gallon at partner stations.",
    assumption: "Lowers your gas price by $0.10/gal.",
  },
};

const SAVING_ORDER: SavingId[] = ["picnic", "snacks", "refill", "lodging", "fares", "parking", "tolls", "free-days", "fuel-rewards"];

/** Inputs and overrides after applying a saving: the input changes plus clearing that category's custom total. */
export function withSaving(id: SavingId, inputs: BudgetInputs, overrides: Overrides, dest: DemoDestination) {
  const cat = SAVING_CATEGORY[id];
  const nextOverrides = { ...overrides };
  delete nextOverrides[cat];
  return { inputs: { ...inputs, ...applySaving(id, inputs, dest) }, overrides: nextOverrides };
}

/**
 * Saving ideas priced by the same engine as the budget: each one is applied in
 * a copy of the trip and the before/after totals are compared.
 */
export function savingsOpportunities(
  inputs: BudgetInputs,
  trip: TripShape,
  overrides: Overrides,
  stopsTotal: number,
  dest: DemoDestination,
  applied: SavingId[] = [],
  /** Categories whose amount is controlled elsewhere (e.g. synced to the itinerary) */
  locked: Category[] = [],
): SavingTip[] {
  const before = calculateBudget(inputs, trip, 0, 0, overrides, stopsTotal);
  const tips: SavingTip[] = [];
  for (const id of SAVING_ORDER) {
    const category = SAVING_CATEGORY[id];
    if (applied.includes(id) || locked.includes(category)) continue;
    const next = withSaving(id, inputs, overrides, dest);
    const after = calculateBudget(next.inputs, trip, 0, 0, next.overrides, stopsTotal);
    const amount = roundMoney(before.categories[category] - after.categories[category]);
    const totalSavings = roundMoney(before.planned - after.planned);
    if (amount < 1 || totalSavings <= 0) continue;
    const copy = SAVING_COPY[id];
    tips.push({
      id,
      title: copy.title,
      detail: copy.detail(dest),
      category,
      amount,
      totalSavings,
      assumption: copy.assumption,
      replacesCustom: overrides[category] !== undefined,
    });
  }
  return tips.sort((a, b) => b.totalSavings - a.totalSavings);
}

/** Input changes for applying a saving. The matching category override is cleared. */
export function applySaving(id: SavingId, inputs: BudgetInputs, dest: DemoDestination): Partial<BudgetInputs> {
  switch (id) {
    case "picnic":
      return { foodPerPersonDay: roundMoney(inputs.foodPerPersonDay * 0.7) };
    case "snacks":
      return { snacksPerPersonDay: roundMoney(inputs.snacksPerPersonDay * 0.5) };
    case "refill":
      return { waterPerPersonDay: roundMoney(inputs.waterPerPersonDay * 0.25) };
    case "lodging":
      return { nightlyRate: dest.nightly.budget };
    case "fares":
      return { farePerPerson: roundMoney(inputs.farePerPerson * 0.85) };
    case "parking":
      return { parkingPerDay: roundMoney(inputs.parkingPerDay * 0.5) };
    case "tolls":
      return { tolls: 0 };
    case "free-days":
      return { activitiesPerPerson: roundMoney(inputs.activitiesPerPerson * 0.75) };
    case "fuel-rewards":
      return { gasPrice: roundMoney(Math.max(0, inputs.gasPrice - 0.1)) };
  }
}

export const SAVING_CATEGORY: Record<SavingId, Category> = {
  picnic: "food",
  snacks: "snacks",
  refill: "water",
  lodging: "accommodations",
  fares: "transportation",
  parking: "parking",
  tolls: "tolls",
  "free-days": "activities",
  "fuel-rewards": "gas",
};

export const SAVING_TITLES: Record<SavingId, string> = {
  picnic: "Picnic lunches",
  snacks: "Grocery snacks",
  refill: "Refillable bottles",
  lodging: "Value stay",
  fares: "Midweek travel",
  parking: "Park once & walk",
  tolls: "Toll-free route",
  "free-days": "Free attractions",
  "fuel-rewards": "Fuel rewards",
};

export function formatMoney(n: number, opts: { cents?: boolean } = {}): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  }).format(Number.isFinite(n) ? n : 0);
}
