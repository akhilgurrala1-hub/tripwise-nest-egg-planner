import type { DemoDestination, TravelStyle, TripType } from "./demo-data";

export const CATEGORIES = [
  "gas",
  "food",
  "water",
  "accommodations",
  "parking",
  "tolls",
  "taxes",
  "activities",
  "misc",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  gas: "Gas",
  food: "Food",
  water: "Water & drinks",
  accommodations: "Accommodations",
  parking: "Parking",
  tolls: "Tolls",
  taxes: "Taxes & fees",
  activities: "Activities",
  misc: "Miscellaneous",
};

export interface BudgetInputs {
  roundTripMiles: number;
  mpg: number;
  gasPrice: number;
  foodPerPersonDay: number;
  waterPerPersonDay: number;
  nightlyRate: number;
  rooms: number;
  parkingPerDay: number;
  tolls: number;
  activitiesPerPerson: number;
  /** Applied to accommodations + food + activities */
  taxRatePct: number;
  /** Buffer applied to the subtotal of every other category */
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
  percentUsed: number;
  perPersonPerDay: number;
}

const clampNum = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
export const roundMoney = (n: number) => Math.round(n * 100) / 100;

export function tripShape(startDate: string, endDate: string, travelers: number): TripShape {
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  let days = 1;
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    days = Math.round((end - start) / 86_400_000) + 1;
  }
  return { travelers: Math.max(1, Math.round(travelers) || 1), days, nights: Math.max(0, days - 1) };
}

/** Raw estimate for every category from the editable inputs. */
export function estimateCategories(
  inputs: BudgetInputs,
  trip: TripShape,
  overrides: Overrides = {},
): { estimates: Record<Category, number>; categories: Record<Category, number> } {
  const pick = (cat: Category, estimate: number) =>
    overrides[cat] !== undefined ? clampNum(overrides[cat] as number) : clampNum(estimate);

  const est: Partial<Record<Category, number>> = {};
  const eff: Partial<Record<Category, number>> = {};
  const set = (cat: Category, value: number) => {
    est[cat] = roundMoney(clampNum(value));
    eff[cat] = roundMoney(pick(cat, value));
  };

  const gallons = inputs.mpg > 0 ? clampNum(inputs.roundTripMiles) / inputs.mpg : 0;
  set("gas", gallons * clampNum(inputs.gasPrice));
  set("food", clampNum(inputs.foodPerPersonDay) * trip.travelers * trip.days);
  set("water", clampNum(inputs.waterPerPersonDay) * trip.travelers * trip.days);
  set("accommodations", clampNum(inputs.nightlyRate) * Math.max(0, inputs.rooms) * trip.nights);
  set("parking", clampNum(inputs.parkingPerDay) * trip.days);
  set("tolls", clampNum(inputs.tolls));
  set("activities", clampNum(inputs.activitiesPerPerson) * trip.travelers);

  const taxBase = (eff.accommodations ?? 0) + (eff.food ?? 0) + (eff.activities ?? 0);
  set("taxes", (clampNum(inputs.taxRatePct) / 100) * taxBase);

  const subtotal = CATEGORIES.filter((c) => c !== "misc").reduce((s, c) => s + (eff[c] ?? 0), 0);
  set("misc", (clampNum(inputs.miscPct) / 100) * subtotal);

  return {
    estimates: est as Record<Category, number>,
    categories: eff as Record<Category, number>,
  };
}

/**
 * The emergency fund is protected: it is carved out of the total budget first
 * and never counts as money available for planned spending.
 */
export function calculateBudget(
  inputs: BudgetInputs,
  trip: TripShape,
  totalBudget: number,
  emergencyFund: number,
  overrides: Overrides = {},
): BudgetTotals {
  const { estimates, categories } = estimateCategories(inputs, trip, overrides);
  const total = clampNum(totalBudget);
  const emergency = Math.min(clampNum(emergencyFund), total);
  const spendable = roundMoney(total - emergency);
  const planned = roundMoney(CATEGORIES.reduce((s, c) => s + categories[c], 0));
  const remaining = roundMoney(spendable - planned);
  return {
    categories,
    estimates,
    totalBudget: total,
    emergencyFund: emergency,
    spendable,
    planned,
    remaining,
    overBudget: remaining < 0,
    percentUsed: spendable > 0 ? Math.min(999, (planned / spendable) * 100) : planned > 0 ? 999 : 0,
    perPersonPerDay: roundMoney(planned / trip.travelers / trip.days),
  };
}

export function defaultInputs(
  dest: DemoDestination,
  style: TravelStyle,
  tripType: TripType,
  travelers: number,
): BudgetInputs {
  const isStay = tripType === "staycation";
  return {
    roundTripMiles: dest.roundTripMiles,
    mpg: 28,
    gasPrice: dest.gasPrice,
    foodPerPersonDay: dest.foodPerPersonDay[style],
    waterPerPersonDay: style === "luxury" ? 8 : style === "comfort" ? 5 : 3,
    nightlyRate: isStay && style !== "luxury" ? 0 : dest.nightly[style],
    rooms: Math.max(1, Math.ceil(travelers / 4)),
    parkingPerDay: dest.parkingPerDay,
    tolls: dest.tolls,
    activitiesPerPerson: dest.activitiesPerPerson[style],
    taxRatePct: dest.taxRatePct,
    miscPct: 5,
  };
}

/** Default protected emergency fund: 10% of the budget, rounded to the nearest $25. */
export function defaultEmergencyFund(totalBudget: number): number {
  return Math.round((clampNum(totalBudget) * 0.1) / 25) * 25;
}

// ---------- Savings opportunities ----------

export type SavingId = "picnic" | "refill" | "lodging" | "parking" | "tolls" | "free-days" | "fuel-rewards";

export interface SavingTip {
  id: SavingId;
  title: string;
  detail: string;
  category: Category;
  amount: number;
}

export function savingsOpportunities(
  inputs: BudgetInputs,
  trip: TripShape,
  categories: Record<Category, number>,
  dest: DemoDestination,
  applied: SavingId[] = [],
): SavingTip[] {
  const tips: SavingTip[] = [];
  const gallons = inputs.mpg > 0 ? clampNum(inputs.roundTripMiles) / inputs.mpg : 0;
  const budgetLodging = dest.nightly.budget * Math.max(0, inputs.rooms) * trip.nights;

  tips.push({
    id: "picnic",
    title: "Pack picnic lunches",
    detail: "Swap one restaurant meal a day for groceries — about 30% off food.",
    category: "food",
    amount: categories.food * 0.3,
  });
  tips.push({
    id: "refill",
    title: "Bring refillable bottles",
    detail: "Fill up at your stay instead of buying bottled drinks — about 75% off.",
    category: "water",
    amount: categories.water * 0.75,
  });
  tips.push({
    id: "lodging",
    title: "Choose a value stay",
    detail: "Demo budget-tier lodging nearby for the same nights.",
    category: "accommodations",
    amount: categories.accommodations - budgetLodging,
  });
  tips.push({
    id: "parking",
    title: "Park once & walk",
    detail: "Use free or off-peak lots and explore on foot — about half off parking.",
    category: "parking",
    amount: categories.parking * 0.5,
  });
  tips.push({
    id: "tolls",
    title: "Take the toll-free route",
    detail: "Adds a little drive time but skips every toll.",
    category: "tolls",
    amount: categories.tolls,
  });
  tips.push({
    id: "free-days",
    title: "Mix in free attractions",
    detail: "Trade a paid activity for parks, free museum days and markets — about 25% off.",
    category: "activities",
    amount: categories.activities * 0.25,
  });
  tips.push({
    id: "fuel-rewards",
    title: "Use a fuel rewards app",
    detail: "Save about $0.10 per gallon at partner stations.",
    category: "gas",
    amount: gallons * 0.1,
  });

  return tips
    .map((t) => ({ ...t, amount: roundMoney(t.amount) }))
    .filter((t) => t.amount >= 1 && !applied.includes(t.id))
    .sort((a, b) => b.amount - a.amount);
}

/** Input changes for applying a saving. The matching category override is cleared. */
export function applySaving(
  id: SavingId,
  inputs: BudgetInputs,
  dest: DemoDestination,
): Partial<BudgetInputs> {
  switch (id) {
    case "picnic":
      return { foodPerPersonDay: roundMoney(inputs.foodPerPersonDay * 0.7) };
    case "refill":
      return { waterPerPersonDay: roundMoney(inputs.waterPerPersonDay * 0.25) };
    case "lodging":
      return { nightlyRate: dest.nightly.budget };
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
  refill: "water",
  lodging: "accommodations",
  parking: "parking",
  tolls: "tolls",
  "free-days": "activities",
  "fuel-rewards": "gas",
};

export function formatMoney(n: number, opts: { cents?: boolean } = {}): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  }).format(Number.isFinite(n) ? n : 0);
}
