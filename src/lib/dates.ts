/**
 * Calendar dates are stored as plain "YYYY-MM-DD" strings and all arithmetic
 * runs in UTC, so a trip's dates never shift with the traveler's time zone.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = ISO.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && y >= 2000
  );
}

function toUtc(iso: string): number {
  const m = ISO.exec(iso)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(iso: string, n: number): string {
  if (!ISO.test(iso)) return iso;
  const dt = new Date(toUtc(iso) + n * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

/** Inclusive number of calendar days from start to end (same day = 1), or null when invalid. */
export function inclusiveDays(start: string, end: string): number | null {
  if (!isIsoDate(start) || !isIsoDate(end)) return null;
  const diff = Math.round((toUtc(end) - toUtc(start)) / 86_400_000);
  return diff < 0 ? null : diff + 1;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A trip can last up to a year (long stays, gap years, slow travel). */
export const MAX_TRIP_DAYS = 365;

/** Human-readable problem with a date range, or "" when it's fine. */
export function dateRangeError(start: string, end: string, maxDays = MAX_TRIP_DAYS): string {
  if (!start || !end) return "Choose both dates";
  if (!isIsoDate(start)) return "The start date isn't a real date";
  if (!isIsoDate(end)) return "The end date isn't a real date";
  if (end < start) return "The end date is before the start date";
  const days = inclusiveDays(start, end)!;
  if (days > maxDays) return `Trips can be up to ${maxDays} days`;
  return "";
}

// Building a date formatter is slow (toLocaleDateString builds one on every call), and
// pages format dozens of dates per render, so each set of options gets one, reused.
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** Weekday + month/day label for a calendar date, independent of the viewer's time zone. */
export function formatCalendarDate(iso: string, opts: Intl.DateTimeFormatOptions): string {
  if (!isIsoDate(iso)) return iso;
  const key = JSON.stringify(opts);
  let f = FORMATTERS.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" });
    FORMATTERS.set(key, f);
  }
  return f.format(new Date(toUtc(iso)));
}
