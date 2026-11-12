/**
 * Commission bookkeeping, kept apart from anything a traveler sees. The one rule: money counts
 * as earned only when a partner has reported a qualifying transaction (it has the partner's own
 * reference) and approved or paid the commission. An estimate is never earned, and the value of
 * a booking is never a commission.
 */

export type CommissionStatus = "estimated" | "pending" | "approved" | "paid" | "reversed";

export interface CommissionRecord {
  id: string;
  partnerId: string;
  /** The partner's own reference for the transaction. Empty for an estimate. */
  partnerRef: string;
  /** What the traveler paid the provider (context only; never added to any commission total) */
  bookingValue: number;
  /** The commission: an estimate, or the amount the partner reported */
  commission: number;
  currency: string;
  status: CommissionStatus;
  /** Why it was reversed (refund, cancellation, no-show) */
  reversalReason?: string;
  /** When the partner expects to pay (commissions are paid weeks or months later) */
  payoutDue?: string;
}

/** An estimate from a published commission rate. Always an estimate, never earned. */
export function estimateCommission(bookingValue: number, ratePercent: number): number {
  if (!(bookingValue > 0) || !(ratePercent > 0) || ratePercent > 100) return 0;
  return Math.round(bookingValue * ratePercent) / 100;
}

/** Earned means the partner reported it and has approved or paid it, and it isn't reversed. */
export function isEarned(r: CommissionRecord): boolean {
  return (
    (r.status === "approved" || r.status === "paid") &&
    r.partnerRef.trim() !== "" &&
    r.commission >= 0
  );
}

export interface CommissionSummary {
  /** Approved or paid, with a partner reference */
  earned: number;
  /** Of the earned, what has actually been paid out */
  paid: number;
  /** Reported by the partner but not yet approved */
  pending: number;
  /** Estimates only: not money */
  estimated: number;
  /** Taken back after a refund or cancellation */
  reversed: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function summarizeCommissions(records: CommissionRecord[]): CommissionSummary {
  const s: CommissionSummary = { earned: 0, paid: 0, pending: 0, estimated: 0, reversed: 0 };
  for (const r of records) {
    if (r.status === "reversed") s.reversed += r.commission;
    else if (r.status === "estimated") s.estimated += r.commission;
    else if (r.status === "pending" && r.partnerRef.trim() !== "") s.pending += r.commission;
    else if (isEarned(r)) {
      s.earned += r.commission;
      if (r.status === "paid") s.paid += r.commission;
    }
  }
  return {
    earned: cents(s.earned),
    paid: cents(s.paid),
    pending: cents(s.pending),
    estimated: cents(s.estimated),
    reversed: cents(s.reversed),
  };
}

/** A refund or cancellation: the commission is taken back and says why. */
export function reverseCommission(r: CommissionRecord, reason: string): CommissionRecord {
  return { ...r, status: "reversed", reversalReason: reason.slice(0, 200) };
}
