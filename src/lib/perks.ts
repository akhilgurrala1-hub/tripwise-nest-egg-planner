/**
 * Reminders about perks a traveler's saved memberships and cards might offer, shown on the
 * Booking checklist. They are general facts worded as possibilities: Waypoint does not know a
 * plan's current terms, rates or eligibility, never computes a saving from them and never stores
 * card numbers. Every tip says to check and compare.
 */
import type { BookingKind } from "./booking";

interface PerkRule {
  kinds: BookingKind[];
  tip: string;
}

const CARD: PerkRule = {
  kinds: ["flight", "hotel", "car", "cruise"],
  tip: "Your card may include travel perks such as lounge access, travel insurance, rental car coverage or points. Check your card's own benefits guide: Waypoint doesn't know its current terms.",
};

/** Keyed by the membership names the Profile page offers. */
export const PERKS: Record<string, PerkRule> = {
  Costco: {
    kinds: ["hotel", "car", "cruise", "tickets"],
    tip: "Costco Travel sells hotels, rental cars, cruises and packages to members. It's worth comparing its price with the provider's.",
  },
  AAA: {
    kinds: ["hotel", "car", "tickets"],
    tip: "AAA members can get discounts at some hotels, car rentals and attractions. Ask for the member rate and compare.",
  },
  AARP: {
    kinds: ["hotel", "car", "cruise"],
    tip: "AARP members can get member rates at some partners. Ask for the member rate and compare.",
  },
  "Priority Pass": {
    kinds: ["flight"],
    tip: "Priority Pass can include airport lounge access. Check which lounges your airports have and what your plan covers.",
  },
  "Chase Sapphire Reserve": CARD,
  "Chase Sapphire Preferred": CARD,
  "Amex Platinum": CARD,
  "Capital One Venture X": CARD,
};

export interface PerkHint {
  membership: string;
  tip: string;
}

/** The reminders that fit one kind of booking, for the memberships the traveler saved (in their order). */
export function perksFor(kind: BookingKind, memberships: readonly string[]): PerkHint[] {
  return memberships.flatMap((m) => {
    const rule = Object.hasOwn(PERKS, m) ? PERKS[m] : undefined;
    return rule && rule.kinds.includes(kind) ? [{ membership: m, tip: rule.tip }] : [];
  });
}
