/**
 * Following the money once the trip is under way: what was actually spent, by
 * budget category, against what was planned, plus who paid and who owes whom in
 * a group. Bookings recorded on the Book page with a price count as spent, so
 * nothing has to be typed twice. Pure, so every rule is testable; all amounts are
 * US dollars like the rest of the budget math (a cost typed in another currency
 * keeps its original amount next to the converted one).
 */
import {
  categoriesFor,
  CATEGORIES,
  CATEGORY_LABELS,
  TAXABLE,
  toCents,
  type BudgetTotals,
  type Category,
} from "./budget";
import type { BookingRecord } from "./booking";
import { addDays, inclusiveDays, isIsoDate } from "./dates";
import type { TransportMode, TripType } from "./demo-data";

/** Taxes are part of what's paid in each category, so they're never logged on their own. */
export type SpendCategory = Exclude<Category, "taxes">;

export interface Person {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  /** The day it was spent (YYYY-MM-DD) */
  date: string;
  /** US dollars */
  amount: number;
  /** What was typed, when it was another currency (converted at that day's rate) */
  local?: { amount: number; currency: string } | null;
  category: SpendCategory;
  note: string;
  /** Who paid (a person's id); unset when nobody's tracking who paid */
  paidBy?: string | null;
  /** Who shares it (people's ids); empty or unset means everyone */
  splitWith?: string[];
}

export interface Spending {
  people: Person[];
  expenses: Expense[];
}

export const EMPTY_SPENDING: Spending = { people: [], expenses: [] };

export const MAX_EXPENSES = 2000;
export const MAX_PEOPLE = 20;
export const MAX_EXPENSE = 1_000_000;
const NOTE_MAX = 80;
const NAME_MAX = 30;

/** In this view the price buffer is where everything without a category goes. */
export const SPEND_LABELS: Record<SpendCategory, string> = {
  ...(Object.fromEntries(
    CATEGORIES.filter((c) => c !== "taxes").map((c) => [c, CATEGORY_LABELS[c]]),
  ) as Record<SpendCategory, string>),
  misc: "Other",
};

/** The categories a cost can be logged under on this trip, "Other" last. */
export function spendCategoriesFor(tripType: TripType, mode: TransportMode): SpendCategory[] {
  return categoriesFor(tripType, mode).filter((c): c is SpendCategory => c !== "taxes");
}

const isSpendCategory = (c: unknown): c is SpendCategory =>
  typeof c === "string" && c !== "taxes" && (CATEGORIES as readonly string[]).includes(c);

/**
 * What the plan sets aside for each category with taxes folded into the
 * categories they're charged on (prices paid include tax), in whole cents, so
 * the categories add up to the plan exactly.
 */
export function plannedByCategory(
  totals: Pick<BudgetTotals, "categories">,
  cats: SpendCategory[],
): Record<SpendCategory, number> {
  const cents = Object.fromEntries(
    cats.map((c) => [c, Math.round((totals.categories[c] ?? 0) * 100)]),
  ) as Record<SpendCategory, number>;
  let tax = Math.round((totals.categories.taxes ?? 0) * 100);
  const taxed = cats.filter((c) => (TAXABLE as string[]).includes(c) && cents[c] > 0);
  const base = taxed.reduce((s, c) => s + cents[c], 0);
  if (tax > 0 && base > 0) {
    // Largest remainder, so the shares add up to the tax to the cent.
    const shares = taxed.map((c) => {
      const exact = (tax * cents[c]) / base;
      return { c, whole: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    let left = tax - shares.reduce((s, x) => s + x.whole, 0);
    for (const x of [...shares].sort((a, b) => b.frac - a.frac)) {
      cents[x.c] += x.whole + (left-- > 0 ? 1 : 0);
    }
    tax = 0;
  }
  if (tax > 0) {
    const home = cats.includes("misc") ? "misc" : cats[0];
    if (home) cents[home] += tax;
  }
  return Object.fromEntries(cats.map((c) => [c, cents[c] / 100])) as Record<SpendCategory, number>;
}

/** Which budget category a booking's price belongs to ("hotel-2" is a hotel). */
export function bookingCategory(key: string): SpendCategory | null {
  if (key.startsWith("prep-")) return null;
  if (key === "hotel" || key.startsWith("hotel-") || key === "pre-cruise-hotel")
    return "accommodations";
  if (["flight", "rail", "bus", "transfer", "car"].includes(key)) return "transportation";
  if (key === "cruise") return "cruise";
  if (key === "parking") return "parking";
  if (key === "tickets") return "activities";
  if (key === "dining") return "food";
  return null;
}

export interface BookedCost {
  key: string;
  category: SpendCategory;
  amount: number;
}

/** Bookings marked booked with the price they cost: already spent. */
export function bookedCosts(bookings: Record<string, BookingRecord>): BookedCost[] {
  const out: BookedCost[] = [];
  for (const [key, b] of Object.entries(bookings)) {
    const category = bookingCategory(key);
    const price = b?.price;
    if (!category || b?.status !== "booked" || typeof price !== "number") continue;
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push({ key, category, amount: toCents(Math.min(price, MAX_EXPENSE)) / 100 });
  }
  return out;
}

export interface CategorySpend {
  category: SpendCategory;
  label: string;
  planned: number;
  spent: number;
  /** Planned minus spent (negative when over) */
  left: number;
  over: boolean;
}

export type TripPhase = "before" | "during" | "after";

export interface SpendingSummary {
  phase: TripPhase;
  /** Logged costs plus booked prices */
  spent: number;
  logged: number;
  booked: number;
  /** The money the plan can spend (total budget minus the emergency fund) */
  spendable: number;
  planned: number;
  /** Spendable money not spent yet (negative when over) */
  left: number;
  over: boolean;
  /** The emergency fund, kept separate: spending never counts against it */
  emergencyFund: number;
  /** Days still to come, today included (all of them before the trip, none after) */
  daysLeft: number;
  /** What's left shared over the days still to come; null before the trip or after it */
  perDayLeft: number | null;
  /** Spent today (logged costs dated today) */
  today: number;
  categories: CategorySpend[];
}

export function tripPhase(startDate: string, endDate: string, today: string): TripPhase {
  if (today < startDate) return "before";
  if (today > endDate) return "after";
  return "during";
}

function daysLeftOf(startDate: string, endDate: string, today: string): number {
  const phase = tripPhase(startDate, endDate, today);
  if (phase === "after") return 0;
  return inclusiveDays(phase === "before" ? startDate : today, endDate) ?? 0;
}

export function spendingSummary(input: {
  totals: Pick<BudgetTotals, "categories" | "spendable" | "planned" | "emergencyFund">;
  cats: SpendCategory[];
  spending: Spending;
  bookings: Record<string, BookingRecord>;
  startDate: string;
  endDate: string;
  today: string;
}): SpendingSummary {
  const { totals, spending, startDate, endDate, today } = input;
  const booked = bookedCosts(input.bookings);
  // A cost logged under a category this trip doesn't use (after a trip-type switch) still counts, under Other.
  const known = new Set<SpendCategory>(input.cats);
  const cats = known.has("misc") ? input.cats : [...input.cats, "misc" as const];
  const where = (c: SpendCategory): SpendCategory => (known.has(c) ? c : "misc");

  const planned = plannedByCategory(totals, cats);
  const spentC = Object.fromEntries(cats.map((c) => [c, 0])) as Record<SpendCategory, number>;
  let loggedC = 0;
  let todayC = 0;
  for (const e of spending.expenses) {
    const c = toCents(e.amount);
    spentC[where(e.category)] += c;
    loggedC += c;
    if (e.date === today) todayC += c;
  }
  let bookedC = 0;
  for (const b of booked) {
    const c = toCents(b.amount);
    spentC[where(b.category)] += c;
    bookedC += c;
  }
  const spent = (loggedC + bookedC) / 100;
  const leftC = toCents(totals.spendable) - loggedC - bookedC;
  const phase = tripPhase(startDate, endDate, today);
  const daysLeft = daysLeftOf(startDate, endDate, today);

  return {
    phase,
    spent,
    logged: loggedC / 100,
    booked: bookedC / 100,
    spendable: totals.spendable,
    planned: totals.planned,
    left: leftC / 100,
    over: leftC < 0,
    emergencyFund: totals.emergencyFund,
    daysLeft,
    perDayLeft:
      phase === "during" && daysLeft > 0 ? Math.floor(Math.max(0, leftC) / daysLeft) / 100 : null,
    today: todayC / 100,
    categories: cats
      .map((category) => {
        const p = toCents(planned[category]);
        const s = spentC[category];
        return {
          category,
          label: SPEND_LABELS[category],
          planned: p / 100,
          spent: s / 100,
          left: (p - s) / 100,
          over: s > p,
        };
      })
      // Categories with nothing planned and nothing spent are noise.
      .filter((c) => c.planned > 0 || c.spent > 0),
  };
}

export interface SpendDay {
  date: string;
  total: number;
  expenses: Expense[];
}

/** Logged costs by day, newest day first, in the order they were added within a day. */
export function expensesByDay(expenses: Expense[]): SpendDay[] {
  const days = new Map<string, Expense[]>();
  for (const e of expenses) {
    const list = days.get(e.date);
    if (list) list.push(e);
    else days.set(e.date, [e]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, list]) => ({
      date,
      expenses: list,
      total: list.reduce((s, e) => s + toCents(e.amount), 0) / 100,
    }));
}

/** The day a new cost is logged on: today, unless the trip is already over. */
export function defaultExpenseDate(endDate: string, today: string): string {
  return today > endDate ? endDate : today;
}

// ---- Splitting costs in a group ----

export interface Balance {
  person: Person;
  paid: number;
  /** Their share of what's been paid */
  share: number;
  /** Paid minus share: positive means they're owed money */
  net: number;
}

export interface Transfer {
  from: Person;
  to: Person;
  amount: number;
}

/** Who shares a cost: the people it names that still exist, else everyone. */
function sharersOf(e: Expense, people: Person[]): Person[] {
  const named = (e.splitWith ?? []).filter((id) => people.some((p) => p.id === id));
  return named.length ? people.filter((p) => named.includes(p.id)) : people;
}

/**
 * Each person's paid amount and share, from costs with a payer. A cost splits
 * equally to the cent; leftover cents go to the first sharers in list order, so
 * the shares always add up to what was paid.
 */
export function balances(spending: Spending): Balance[] {
  const { people } = spending;
  const paid = new Map(people.map((p) => [p.id, 0]));
  const share = new Map(people.map((p) => [p.id, 0]));
  for (const e of spending.expenses) {
    if (!e.paidBy || !paid.has(e.paidBy)) continue;
    const sharers = sharersOf(e, people);
    if (!sharers.length) continue;
    const c = toCents(e.amount);
    paid.set(e.paidBy, paid.get(e.paidBy)! + c);
    const each = Math.floor(c / sharers.length);
    let extra = c - each * sharers.length;
    for (const p of sharers) share.set(p.id, share.get(p.id)! + each + (extra-- > 0 ? 1 : 0));
  }
  return people.map((person) => {
    const pc = paid.get(person.id)!;
    const sc = share.get(person.id)!;
    return { person, paid: pc / 100, share: sc / 100, net: (pc - sc) / 100 };
  });
}

/**
 * The fewest simple payments that settle everyone up: the one who owes most pays
 * the one owed most, until nobody owes anything. Exact to the cent.
 */
export function settleUp(spending: Spending): Transfer[] {
  const owes = balances(spending)
    .map((b) => ({ person: b.person, c: Math.round(b.net * 100) }))
    .filter((b) => b.c !== 0);
  const debtors = owes.filter((b) => b.c < 0).map((b) => ({ ...b, c: -b.c }));
  const creditors = owes.filter((b) => b.c > 0);
  const byMost = (a: { c: number }, b: { c: number }) => b.c - a.c;
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byMost);
    creditors.sort(byMost);
    const d = debtors[0]!;
    const k = creditors[0]!;
    const c = Math.min(d.c, k.c);
    out.push({ from: d.person, to: k.person, amount: c / 100 });
    d.c -= c;
    k.c -= c;
    if (!d.c) debtors.shift();
    if (!k.c) creditors.shift();
  }
  return out;
}

// ---- Edits (the store wraps these) ----

export function newSpendId(prefix: "e" | "p"): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  const r = c?.randomUUID
    ? c.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return `${prefix}-${Date.now().toString(36)}-${r}`;
}

export type ExpenseDraft = Omit<Expense, "id">;

/** A cost as it will be stored: rounded to the cent, bounded, with a known category. */
export function cleanExpense(e: ExpenseDraft & { id?: string }, people: Person[]): Expense | null {
  const amount = Number(e.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (typeof e.date !== "string" || !isIsoDate(e.date)) return null;
  const ids = new Set(people.map((p) => p.id));
  const local =
    e.local &&
    typeof e.local === "object" &&
    Number.isFinite(Number(e.local.amount)) &&
    Number(e.local.amount) > 0 &&
    typeof e.local.currency === "string" &&
    /^[A-Z]{3}$/.test(e.local.currency) &&
    e.local.currency !== "USD"
      ? { amount: Math.round(Number(e.local.amount) * 100) / 100, currency: e.local.currency }
      : null;
  const splitWith = Array.isArray(e.splitWith)
    ? [...new Set(e.splitWith.filter((id) => typeof id === "string" && ids.has(id)))]
    : [];
  return {
    id: typeof e.id === "string" && e.id ? e.id.slice(0, 40) : newSpendId("e"),
    date: e.date,
    amount: toCents(Math.min(amount, MAX_EXPENSE)) / 100,
    ...(local ? { local } : {}),
    category: isSpendCategory(e.category) ? e.category : "misc",
    note: typeof e.note === "string" ? e.note.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) : "",
    paidBy: typeof e.paidBy === "string" && ids.has(e.paidBy) ? e.paidBy : null,
    // Everyone is the same as nobody named, so store it the short way.
    splitWith: splitWith.length === people.length ? [] : splitWith,
  };
}

export function addExpense(s: Spending, draft: ExpenseDraft): Spending {
  if (s.expenses.length >= MAX_EXPENSES) return s;
  const e = cleanExpense(draft, s.people);
  return e ? { ...s, expenses: [...s.expenses, e] } : s;
}

export function updateExpense(s: Spending, id: string, patch: Partial<ExpenseDraft>): Spending {
  return {
    ...s,
    expenses: s.expenses.map((e) =>
      e.id === id ? (cleanExpense({ ...e, ...patch, id }, s.people) ?? e) : e,
    ),
  };
}

export interface RemovedExpense {
  expense: Expense;
  index: number;
}

export function removeExpense(
  s: Spending,
  id: string,
): { spending: Spending; removed: RemovedExpense | null } {
  const index = s.expenses.findIndex((e) => e.id === id);
  if (index < 0) return { spending: s, removed: null };
  return {
    spending: { ...s, expenses: s.expenses.filter((e) => e.id !== id) },
    removed: { expense: s.expenses[index]!, index },
  };
}

/** Undo: puts the cost back where it was. */
export function restoreExpense(s: Spending, r: RemovedExpense): Spending {
  if (s.expenses.some((e) => e.id === r.expense.id)) return s;
  const expenses = [...s.expenses];
  expenses.splice(Math.min(r.index, expenses.length), 0, r.expense);
  return { ...s, expenses };
}

const cleanName = (n: unknown) =>
  typeof n === "string" ? n.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";

export function addPerson(s: Spending, name: string): Spending {
  const n = cleanName(name);
  if (!n || s.people.length >= MAX_PEOPLE) return s;
  return { ...s, people: [...s.people, { id: newSpendId("p"), name: n }] };
}

export function renamePerson(s: Spending, id: string, name: string): Spending {
  const n = cleanName(name);
  if (!n) return s;
  return { ...s, people: s.people.map((p) => (p.id === id ? { ...p, name: n } : p)) };
}

/** Removing someone clears them as a payer and from splits (their costs stay in the totals). */
export function removePerson(s: Spending, id: string): Spending {
  const people = s.people.filter((p) => p.id !== id);
  return {
    people,
    expenses: s.expenses.map((e) => ({
      ...e,
      paidBy: e.paidBy === id ? null : (e.paidBy ?? null),
      splitWith: (e.splitWith ?? []).filter((x) => x !== id),
    })),
  };
}

/** Stored or synced spending, made safe: bounded counts and text, valid dates and amounts. */
export function cleanSpending(raw: unknown): Spending {
  if (!raw || typeof raw !== "object") return { people: [], expenses: [] };
  const r = raw as { people?: unknown; expenses?: unknown };
  const people: Person[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(r.people) ? r.people : []) {
    const id = typeof p?.id === "string" ? p.id.slice(0, 40) : "";
    const name = cleanName(p?.name);
    if (!id || !name || seen.has(id) || people.length >= MAX_PEOPLE) continue;
    seen.add(id);
    people.push({ id, name });
  }
  const expenses: Expense[] = [];
  const ids = new Set<string>();
  for (const e of Array.isArray(r.expenses) ? r.expenses : []) {
    if (expenses.length >= MAX_EXPENSES) break;
    const clean = e && typeof e === "object" ? cleanExpense(e as Expense, people) : null;
    if (!clean || ids.has(clean.id)) continue;
    ids.add(clean.id);
    expenses.push(clean);
  }
  return { people, expenses };
}

// ---- Export ----

const csvCell = (v: string) => {
  // Spreadsheets run cells that start with = + - @ as formulas; a leading quote keeps them text.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Every cost as a spreadsheet (CSV), oldest first, booked prices included. */
export function spendingCsv(spending: Spending, bookings: Record<string, BookingRecord>): string {
  const name = (id?: string | null) => spending.people.find((p) => p.id === id)?.name ?? "";
  const rows: string[][] = [
    ["Date", "Category", "Note", "Amount (USD)", "Original amount", "Paid by", "Split with"],
  ];
  const sorted = [...spending.expenses].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  for (const e of sorted) {
    const split = sharersOf(e, spending.people);
    rows.push([
      e.date,
      SPEND_LABELS[e.category],
      e.note,
      e.amount.toFixed(2),
      e.local ? `${e.local.amount.toFixed(2)} ${e.local.currency}` : "",
      name(e.paidBy),
      e.paidBy ? split.map((p) => p.name).join("; ") : "",
    ]);
  }
  for (const b of bookedCosts(bookings)) {
    rows.push(["", SPEND_LABELS[b.category], `Booked: ${b.key}`, b.amount.toFixed(2), "", "", ""]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** The trip's dates as a list, for the day picker (bounded to the trip). */
export function tripDates(startDate: string, endDate: string): string[] {
  const n = Math.min(400, inclusiveDays(startDate, endDate) ?? 1);
  return Array.from({ length: n }, (_, i) => addDays(startDate, i));
}
