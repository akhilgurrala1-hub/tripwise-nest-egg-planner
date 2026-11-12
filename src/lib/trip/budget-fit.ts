/**
 * Two budget modes, told apart by `setup.budgetAuto`:
 * - Flexible (`budgetAuto: true`): Waypoint picks a budget that covers the trip and keeps it
 *   covering the trip as costs change.
 * - Strict (`budgetAuto` false: the traveler typed a number): the number is a hard ceiling.
 *   Waypoint never raises it on its own; a trip that costs more starts over budget and the
 *   app shows where to save. Only the traveler can raise it (see tripActions.setTotalBudget).
 */
import {
  applyCoverage,
  calculateBudget,
  defaultEmergencyFund,
  defaultInputs,
  formatMoney,
  tripShape,
} from "../budget";
import { destinationFor } from "../demo-data";
import { stopsTotalFor } from "./build";
import type { TripSetup, TripState } from "./types";

/** Round a needed amount up to a tidy budget. */
export const tidy = (n: number) => Math.ceil(n / 50) * 50;

/** What a setup's default estimate costs (covered costs left out), before any budget. */
export function estimatedSpend(setup: TripSetup): number {
  const dest = destinationFor(setup);
  const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
  const inputs = applyCoverage(
    defaultInputs(dest, setup.style, setup.tripType, setup.travelers, setup.transportMode),
    setup.coverage,
  );
  return calculateBudget(inputs, shape, 0, 0).planned;
}

/** Planned spending for a trip's current inputs (custom amounts and stops included). */
export function plannedNow(s: TripState): number {
  const shape = tripShape(s.setup.startDate, s.setup.endDate, s.setup.travelers);
  return calculateBudget(s.inputs, shape, 0, 0, s.overrides, stopsTotalFor(s)).planned;
}

/**
 * Keep a Waypoint-chosen budget covering the trip. "set" re-fits it (the trip's
 * shape changed: cities, cabin, trip type, travel); "raise" only ever raises it
 * (a real price or a custom amount came in), so savings still show as money left.
 * A budget the traveler typed is never touched.
 */
export function rebudget(s: TripState, mode: "set" | "raise"): TripState {
  if (!s.setup.budgetAuto) return s;
  const planned = plannedNow(s);
  const reserveFollows = s.emergencyFund === defaultEmergencyFund(s.setup.totalBudget);
  let total = reserveFollows ? tidy(planned / 0.9) : tidy(planned + s.emergencyFund);
  if (mode === "raise" && s.setup.totalBudget >= planned + s.emergencyFund) return s;
  if (mode === "raise") total = Math.max(total, s.setup.totalBudget);
  const emergencyFund = reserveFollows ? defaultEmergencyFund(total) : s.emergencyFund;
  return { ...s, setup: { ...s.setup, totalBudget: total, emergencyFund }, emergencyFund };
}

/**
 * The budget a new trip starts with. Waypoint picks it from the trip's estimated
 * costs plus an emergency fund when the traveler gave none. A budget the traveler gave
 * is never changed: if the trip is likely to cost more, `note` says by how much and
 * where to go from there, and the trip starts over budget on purpose.
 */
export function fitBudget(setup: TripSetup): { setup: TripSetup; note: string | null } {
  const chosenReserve =
    setup.emergencyFund > 0 && setup.emergencyFund !== defaultEmergencyFund(setup.totalBudget)
      ? setup.emergencyFund
      : undefined;
  const need = suggestedBudget(setup, chosenReserve);
  const auto = (totalBudget: number): TripSetup => ({
    ...setup,
    totalBudget,
    emergencyFund: chosenReserve ?? defaultEmergencyFund(totalBudget),
    budgetAuto: true,
  });
  if (setup.budgetAuto || !(setup.totalBudget > 0)) return { setup: auto(need), note: null };
  const planned = estimatedSpend(setup);
  if (planned + setup.emergencyFund <= setup.totalBudget) return { setup, note: null };
  const over = Math.ceil(planned + setup.emergencyFund - setup.totalBudget);
  return {
    setup,
    note: `This trip is likely to cost about ${formatMoney(planned)}, which is ${formatMoney(over)} more than your ${formatMoney(setup.totalBudget)} budget (with your emergency fund set aside). Your budget was not changed. Ways to spend less shows where to save, or you can raise it yourself on the Budget page.`,
  };
}

/**
 * A budget that covers the default estimate for this setup plus a 10% reserve,
 * rounded up to $50 (or the planned spend plus a reserve the traveler chose).
 */
export function suggestedBudget(setup: TripSetup, reserve?: number): number {
  const planned = estimatedSpend(setup);
  return reserve !== undefined ? tidy(planned + reserve) : tidy(planned / 0.9);
}
