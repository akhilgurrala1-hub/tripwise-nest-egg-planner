/**
 * Turning the AI assistant's trip draft into a trip setup. Pure, so the rules
 * (which destination a name means, which dates are acceptable) are testable.
 */
import type { TripDraft } from "./ai/trip-chat.server";
import { CATALOG, CRUISES } from "./catalog";
import {
  CRUISE_PREFIX,
  CUSTOM_DESTINATION_ID,
  DESTINATIONS,
  PLACE_PREFIX,
  modeForTripType,
  type TripType,
} from "./demo-data";
import { addDays, isIsoDate, MAX_TRIP_DAYS } from "./dates";
import { defaultEmergencyFund, type TripCoverage } from "./budget";
import { suggestedBudget, type TripSetup } from "./trip-store";

export type { TripDraft };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const city = (s: string) => norm(s.split(",")[0] ?? s);

/** The destination id a typed name refers to, or null for "somewhere else". */
export function matchDestination(name: string, tripType: TripType | null): string | null {
  const n = norm(name);
  const c = city(name);
  if (!c) return null;
  if (tripType === "cruise") {
    const cruise = CRUISES.find((x) => city(x.port) === c || norm(x.name) === n);
    if (cruise) return CRUISE_PREFIX + cruise.id;
    const demo = DESTINATIONS.find((d) => d.port && city(d.port) === c);
    if (demo) return demo.id;
  }
  const demo = DESTINATIONS.find(
    (d) => d.anchor && d.id !== "hometown" && (city(d.anchor.name) === c || norm(d.name) === n),
  );
  if (demo && demo.bestFor.some((t) => t !== "cruise")) return demo.id;
  const place = CATALOG.find((p) => city(p.town) === c || norm(p.name) === n || city(p.name) === c);
  return place ? PLACE_PREFIX + place.id : null;
}

export type DraftField = "destination" | "dates" | "travelers";

/** What still has to be decided before the draft can become a trip. */
export function missingFields(draft: TripDraft | null, today: string): DraftField[] {
  const out: DraftField[] = [];
  if (!draft?.destination?.trim() && draft?.tripType !== "staycation") out.push("destination");
  if (!draftDates(draft, today)) out.push("dates");
  if (!draft?.travelers || draft.travelers < 1) out.push("travelers");
  return out;
}

/** Valid, future, at most two-week dates from the draft (end from nights when needed). */
export function draftDates(
  draft: TripDraft | null,
  today: string,
): { startDate: string; endDate: string } | null {
  const start = draft?.startDate ?? "";
  if (!isIsoDate(start) || start < today) return null;
  let end = draft?.endDate ?? "";
  if (!isIsoDate(end) && draft?.nights !== null && draft?.nights !== undefined)
    end = addDays(start, Math.max(0, Math.round(draft.nights)));
  if (!isIsoDate(end) || end < start) return null;
  const maxEnd = addDays(start, MAX_TRIP_DAYS - 1);
  return { startDate: start, endDate: end > maxEnd ? maxEnd : end };
}

/**
 * What the traveler said they don't pay for, and their trip to the airport or
 * station, as the trip's coverage (null when nothing is covered).
 */
export function coverageFromDraft(draft: TripDraft): TripCoverage | null {
  const c = draft.covered;
  const flying =
    draft.transportMode === "flight" ||
    draft.transportMode === "train" ||
    draft.transportMode === "bus" ||
    draft.tripType === "flight" ||
    draft.tripType === "rail";
  const transfer =
    flying &&
    draft.transferCost !== null &&
    draft.transferCost !== undefined &&
    draft.transferCost > 0
      ? Math.min(500, Math.round(draft.transferCost))
      : undefined;
  const coverage: TripCoverage = {
    ...(c?.lodging ? { lodging: true } : {}),
    ...(c?.meals ? { meals: true } : {}),
    ...(c?.activities ? { activities: true } : {}),
    ...(c?.localTransport ? { localTransport: true } : {}),
    ...(transfer !== undefined ? { transfer } : {}),
  };
  return Object.keys(coverage).length ? coverage : null;
}

/** A trip setup from the draft, starting from `base` for anything the draft doesn't say. */
export function setupFromDraft(draft: TripDraft, base: TripSetup, today: string): TripSetup {
  const dates = draftDates(draft, today);
  const named = draft.destination?.trim() ?? "";
  let tripType: TripType = draft.tripType ?? base.tripType;
  let destinationId = base.destinationId;
  let customDestination = base.customDestination;
  if (tripType === "staycation") {
    destinationId = "hometown";
  } else if (named) {
    const id = matchDestination(named, tripType);
    if (id) {
      destinationId = id;
      if (id.startsWith(CRUISE_PREFIX)) tripType = "cruise";
    } else {
      destinationId = CUSTOM_DESTINATION_ID;
      customDestination = named.slice(0, 120);
    }
  }
  const travelers = Math.min(12, Math.max(1, Math.round(draft.travelers ?? base.travelers)));
  const next: TripSetup = {
    ...base,
    tripType,
    destinationId,
    customDestination,
    destinationPoint:
      destinationId === CUSTOM_DESTINATION_ID ? null : (base.destinationPoint ?? null),
    origin: draft.origin?.trim() || base.origin,
    originPoint:
      draft.origin?.trim() && draft.origin.trim() !== base.origin
        ? null
        : (base.originPoint ?? null),
    transportMode: modeForTripType(tripType, draft.transportMode ?? base.transportMode),
    style: draft.style ?? base.style,
    travelers,
    interests: draft.interests.length ? draft.interests : base.interests,
    ...(dates ?? { startDate: base.startDate, endDate: base.endDate }),
    coverage: coverageFromDraft(draft),
  };
  const totalBudget =
    draft.totalBudget && draft.totalBudget > 0
      ? Math.round(draft.totalBudget)
      : suggestedBudget(next);
  return { ...next, totalBudget, emergencyFund: defaultEmergencyFund(totalBudget) };
}
