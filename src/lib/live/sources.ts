import type { BudgetInputs, Category, Overrides } from "../budget";
import type { LivePrices } from "../prices/live";

export type AmountSource = "custom" | "live" | "estimate";

/**
 * Where a budget category's amount comes from. A category counts as live only while
 * its input still equals the price that was fetched: editing it by hand makes it an estimate again.
 */
export function categorySource(
  cat: Category,
  inputs: BudgetInputs,
  overrides: Overrides,
  live: LivePrices | null,
): AmountSource {
  if (overrides[cat] !== undefined) return "custom";
  if (!live) return "estimate";
  if (cat === "gas" && live.gas && inputs.gasPrice === live.gas.price) return "live";
  if (cat === "accommodations" && live.hotels && inputs.nightlyRate === live.hotels.nightly)
    return "live";
  if (
    cat === "transportation" &&
    inputs.transportMode === "flight" &&
    live.flights &&
    inputs.farePerPerson === live.flights.perPerson
  )
    return "live";
  return "estimate";
}

/** Categories currently priced from live data. */
export function liveCategories(
  inputs: BudgetInputs,
  overrides: Overrides,
  live: LivePrices | null,
): Category[] {
  return (["gas", "accommodations", "transportation"] as Category[]).filter(
    (c) => categorySource(c, inputs, overrides, live) === "live",
  );
}
