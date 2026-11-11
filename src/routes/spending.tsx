import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Lock, Pencil, Trash2, UserPlus, X, Receipt } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  ApproxMoney,
  CATEGORY_COLOR_VAR,
  CATEGORY_ICONS,
  NumberField,
} from "@/components/app/bits";
import { BudgetTabs } from "@/components/app/BudgetTabs";
import { EmptyState } from "@/components/app/Photo";
import { AnimatedMoney, stagger } from "@/components/app/motion";
import { PageHeader } from "@/components/app/TripHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/budget";
import { formatCalendarDate, todayIso } from "@/lib/dates";
import { currencyForCountry } from "@/lib/locale";
import { useLocale, useUsdRate } from "@/lib/live/use-locale";
import {
  balances,
  defaultExpenseDate,
  expensesByDay,
  settleUp,
  SPEND_LABELS,
  spendCategoriesFor,
  spendingCsv,
  spendingSummary,
  type Expense,
  type SpendCategory,
} from "@/lib/spending";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/spending")({
  head: () => ({
    meta: [
      { title: "What you've spent | Waypoint" },
      {
        name: "description",
        content:
          "Log what the trip actually costs, see what's left by category and per day, and split costs with your group.",
      },
      { property: "og:title", content: "What you've spent | Waypoint" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpendingPage,
});

const localFormats = new Map<string, Intl.NumberFormat>();
/** "€20.00": an amount in the currency it was paid in. */
function formatLocal(amount: number, currency: string): string {
  let f = localFormats.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-US", { style: "currency", currency });
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
    localFormats.set(currency, f);
  }
  return f.format(amount);
}

/** Everything this page shows, from the trip and today's date. */
function useSpending() {
  const view = useTrip();
  const { trip, totals } = view;
  const cats = spendCategoriesFor(trip.setup.tripType, trip.inputs.transportMode);
  const today = todayIso();
  const summary = spendingSummary({
    totals,
    cats,
    spending: trip.spending,
    bookings: trip.bookings,
    startDate: trip.setup.startDate,
    endDate: trip.setup.endDate,
    today,
  });
  return { ...view, cats, today, summary };
}

function SpendingPage() {
  const { trip, summary } = useSpending();
  const [editing, setEditing] = useState<Expense | null>(null);
  const days = expensesByDay(trip.spending.expenses);
  const hasAny = summary.spent > 0;

  const download = () => {
    const csv = spendingCsv(trip.spending, trip.bookings);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "waypoint-spending.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div>
      <PageHeader title="What you've spent" />
      <BudgetTabs current="spent" />

      <div className="page-container mt-6 layout-main-aside">
        <div className="min-w-0 space-y-4">
          <SummaryCard />
          <ExpenseForm
            key={editing?.id ?? "new"}
            editing={editing}
            onDone={() => setEditing(null)}
          />
          {hasAny && <CategoryCard />}

          {days.length === 0 && summary.booked === 0 && (
            <EmptyState icon={<Receipt />} title="No costs logged yet">
              Log what you spend as you go and it appears here day by day, against your plan.
            </EmptyState>
          )}
          {days.length > 0 && (
            <section aria-labelledby="spend-log" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="spend-log" className="title-display text-title-1">
                  Day by day
                </h2>
                <Button variant="outline" size="sm" onClick={download}>
                  <Download /> Download spreadsheet
                </Button>
              </div>
              {days.map((d, i) => (
                <section
                  key={d.date}
                  aria-label={formatCalendarDate(d.date, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                  className="surface-card render-lazy p-4 sm:p-6"
                  style={stagger(i)}
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-headline font-semibold">
                      {formatCalendarDate(d.date, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </h3>
                    <span className="tabular text-sm font-medium">
                      {formatMoney(d.total, { cents: true })}
                    </span>
                  </div>
                  <ul className="mt-2 divide-y divide-border">
                    {d.expenses.map((e) => (
                      <ExpenseRow
                        key={e.id}
                        expense={e}
                        editing={editing?.id === e.id}
                        onEdit={() => setEditing(e)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          )}
          {summary.booked > 0 && (
            <p className="text-xs text-muted-foreground">
              Prices you noted for bookings ({formatMoney(summary.booked, { cents: true })}) count
              as spent. Change them on the{" "}
              <Link to="/book" className="underline underline-offset-4 hover:text-foreground">
                Book page
              </Link>
              .
            </p>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <SplitCard />
        </aside>
      </div>
    </div>
  );
}

function SummaryCard() {
  const { summary, trip } = useSpending();
  const s = summary;
  return (
    <section className="surface-card p-6 sm:p-8" aria-labelledby="spend-summary">
      <h2 id="spend-summary" className="sr-only">
        Summary
      </h2>
      <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-sm text-muted-foreground">
            {s.over ? "Over your spending money" : "Left to spend"}
          </p>
          <p className={cn("money-display mt-2 text-display", s.over && "text-destructive")}>
            {s.over ? "−" : ""}
            <AnimatedMoney value={Math.abs(s.left)} />
          </p>
          <ApproxMoney
            usd={Math.abs(s.left)}
            suffix={s.over ? "over" : "left"}
            className="mt-1 block text-sm"
          />
          <p className="tabular mt-4 text-sm text-muted-foreground">
            {formatMoney(s.spent)} spent of {formatMoney(s.spendable)}
            <span className="px-2 text-border">/</span>
            <Lock className="mr-1 inline size-3 -translate-y-px" />
            {formatMoney(s.emergencyFund)} emergency fund kept separate
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:text-right">
          {s.phase === "during" ? (
            <>
              <div>
                <dt className="text-muted-foreground">Spent today</dt>
                <dd className="tabular mt-1 text-base font-medium">
                  <AnimatedMoney value={s.today} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  A day, for {s.daysLeft} day{s.daysLeft === 1 ? "" : "s"}
                </dt>
                <dd className="tabular mt-1 text-base font-medium">
                  <AnimatedMoney value={s.perDayLeft ?? 0} />
                </dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt className="text-muted-foreground">Planned</dt>
                <dd className="tabular mt-1 text-base font-medium">{formatMoney(s.planned)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{s.phase === "after" ? "Trip" : "Starts"}</dt>
                <dd className="mt-1 text-base font-medium">
                  {s.phase === "after"
                    ? "Over"
                    : formatCalendarDate(trip.setup.startDate, { month: "short", day: "numeric" })}
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        {s.phase === "during"
          ? "The daily figure is what's left shared over the days still to come, today included."
          : s.phase === "before"
            ? "Log costs you pay ahead too, like deposits or gear. Booked prices on the Book page count automatically."
            : "The trip is over. Settle up with your group and download the spreadsheet to keep."}
        {s.over &&
          " Going over never touches the emergency fund in your plan; it's still there if you need it."}
      </p>
    </section>
  );
}

function CategoryCard() {
  const { summary } = useSpending();
  return (
    <section className="surface-card p-6" aria-labelledby="spend-cats" style={stagger(1)}>
      <h2 id="spend-cats" className="title-display text-title-1">
        By category
      </h2>
      <ul className="mt-4 space-y-4">
        {summary.categories.map((c) => {
          const pct =
            c.planned > 0 ? Math.min(100, (c.spent / c.planned) * 100) : c.spent > 0 ? 100 : 0;
          const Icon = CATEGORY_ICONS[c.category];
          return (
            <li key={c.category}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Icon
                    className="size-4"
                    style={{ color: CATEGORY_COLOR_VAR[c.category] }}
                    aria-hidden
                  />
                  {c.label}
                </span>
                <span className="tabular text-muted-foreground">
                  <span className="font-medium text-foreground">{formatMoney(c.spent)}</span> of{" "}
                  {formatMoney(c.planned)}
                </span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${c.label}: ${formatMoney(c.spent)} of ${formatMoney(c.planned)} spent`}
              >
                <span
                  className="block h-full rounded-full transition-[width] spring-smooth"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: c.over ? "var(--destructive)" : CATEGORY_COLOR_VAR[c.category],
                  }}
                />
              </div>
              <p
                className={cn(
                  "mt-1 text-xs",
                  c.over ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {c.over ? `${formatMoney(-c.left)} over` : `${formatMoney(c.left)} left`}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Log a cost (or change one): amount, category, and in a group who paid and who shares it. */
function ExpenseForm({ editing, onDone }: { editing: Expense | null; onDone: () => void }) {
  const { trip, dest, cats, today } = useSpending();
  const { currency: displayCurrency } = useLocale();
  const destCurrency = currencyForCountry(dest.country);
  // Abroad, people pay in the local money; at home, in their own.
  const destRate = useUsdRate(destCurrency);
  const displayRate = useUsdRate(displayCurrency);
  // A cost being changed keeps the rate it was logged at if today's can't be fetched.
  const savedRate =
    editing?.local && editing.amount > 0 ? editing.local.amount / editing.amount : null;
  const rateOf = (c: string): number | null =>
    c === "USD"
      ? 1
      : ((c === destCurrency ? destRate : c === displayCurrency ? displayRate : null) ??
        (c === editing?.local?.currency ? savedRate : null));
  // Only currencies that can be converted right now are offered.
  const currencies = [
    ...new Set(["USD", destCurrency, displayCurrency, editing?.local?.currency ?? "USD"]),
  ].filter((c) => rateOf(c) !== null);

  const people = trip.spending.people;
  // New costs follow the destination's money once its rate is in; a changed cost keeps its own.
  const [pick, setCurrency] = useState<string | null>(
    editing ? (editing.local?.currency ?? "USD") : null,
  );
  const currency = pick ?? (destRate ? destCurrency : "USD");
  const [amount, setAmount] = useState(editing ? (editing.local?.amount ?? editing.amount) : 0);
  const [category, setCategory] = useState<SpendCategory>(editing?.category ?? "food");
  const [note, setNote] = useState(editing?.note ?? "");
  const [date, setDate] = useState(editing?.date ?? defaultExpenseDate(trip.setup.endDate, today));
  const [paidBy, setPaidBy] = useState(editing?.paidBy ?? "");
  // Everyone shares a cost until some are unticked (so people added later are in too).
  const [splitPick, setSplitPick] = useState<string[] | null>(
    editing?.splitWith?.length ? editing.splitWith : null,
  );
  const splitWith = splitPick ?? people.map((p) => p.id);

  const rate = rateOf(currency);
  const usd = rate ? Math.round((amount / rate) * 100) / 100 : null;
  const shownCats = cats.includes(category) ? cats : [...cats, category];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!usd || usd <= 0) {
      toast.error("Enter what it cost first");
      return;
    }
    if (paidBy && splitWith.length === 0) {
      toast.error("Pick at least one person to split it with");
      return;
    }
    const draft = {
      date,
      amount: usd,
      local: currency === "USD" ? null : { amount, currency },
      category,
      note,
      paidBy: paidBy || null,
      splitWith: people.length > 1 ? splitWith : [],
    };
    if (editing) {
      tripActions.updateExpense(editing.id, draft);
      toast.success("Cost updated");
      onDone();
    } else {
      tripActions.addExpense(draft);
      toast.success(
        `Logged ${formatMoney(usd, { cents: true })} for ${SPEND_LABELS[category].toLowerCase()}`,
      );
      setAmount(0);
      setNote("");
    }
  };

  return (
    <section className="surface-card p-6" aria-labelledby="spend-add" style={stagger(1)}>
      <div className="flex items-center justify-between gap-4">
        <h2 id="spend-add" className="text-headline font-semibold">
          {editing ? "Change this cost" : "Log a cost"}
        </h2>
        {editing && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            <X /> Cancel
          </Button>
        )}
      </div>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs text-muted-foreground">
            Amount
            <NumberField
              value={amount}
              onChange={setAmount}
              step={1}
              prefix={currency === "USD" ? "$" : undefined}
              suffix={currency === "USD" ? undefined : currency}
              className="mt-1 w-40"
              aria-label={`Amount in ${currency}`}
            />
          </label>
          {currencies.length > 1 && (
            <label className="text-xs text-muted-foreground">
              Paid in
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 block h-11 rounded-lg border border-input bg-fill px-4 text-sm text-foreground"
              >
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs text-muted-foreground">
            Day
            <Input
              type="date"
              value={date}
              max="2100-12-31"
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="mt-1 h-11 w-[11rem]"
            />
          </label>
        </div>
        {currency !== "USD" && amount > 0 && (
          <p className="text-xs text-muted-foreground">
            {usd !== null
              ? `${formatLocal(amount, currency)} is about ${formatMoney(usd, { cents: true })} at today's rate (European Central Bank).`
              : "Getting today's exchange rate..."}
          </p>
        )}

        <fieldset>
          <legend className="text-xs text-muted-foreground">Category</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {shownCats.map((c) => {
              const Icon = CATEGORY_ICONS[c];
              const on = c === category;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-lg border px-4 text-left text-footnote font-medium transition-colors",
                    on
                      ? "border-primary bg-[color-mix(in_oklch,var(--primary)_8%,transparent)] text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 leading-tight">{SPEND_LABELS[c]}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block text-xs text-muted-foreground">
          What for (optional)
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={80}
            placeholder="Dinner at the market"
            className="mt-1 h-11"
          />
        </label>

        {people.length > 1 && (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <label className="text-xs text-muted-foreground">
              Paid by
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="mt-1 block h-11 rounded-lg border border-input bg-fill px-4 text-sm text-foreground"
              >
                <option value="">Not splitting this</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {paidBy && (
              <fieldset>
                <legend className="text-xs text-muted-foreground">Split between</legend>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {people.map((p) => (
                    <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={splitWith.includes(p.id)}
                        onChange={(e) =>
                          setSplitPick(
                            e.target.checked
                              ? [...splitWith, p.id]
                              : splitWith.filter((x) => x !== p.id),
                          )
                        }
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )}

        <Button type="submit" variant="go" disabled={!usd || usd <= 0}>
          {editing ? "Save changes" : "Log it"}
        </Button>
      </form>
    </section>
  );
}

function ExpenseRow({
  expense: e,
  editing,
  onEdit,
}: {
  expense: Expense;
  editing: boolean;
  onEdit: () => void;
}) {
  const { trip } = useSpending();
  const payer = trip.spending.people.find((p) => p.id === e.paidBy);
  const Icon = CATEGORY_ICONS[e.category];
  const remove = () => {
    const removed = tripActions.removeExpense(e.id);
    if (!removed) return;
    toast(`Removed ${formatMoney(e.amount, { cents: true })}`, {
      action: { label: "Undo", onClick: () => tripActions.restoreExpense(removed) },
    });
  };
  return (
    <li className={cn("flex items-center gap-4 py-2", editing && "opacity-60")}>
      <Icon
        className="size-4 shrink-0"
        style={{ color: CATEGORY_COLOR_VAR[e.category] }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{e.note || SPEND_LABELS[e.category]}</p>
        <p className="text-xs text-muted-foreground">
          {e.note ? SPEND_LABELS[e.category] : null}
          {e.note && payer ? " · " : null}
          {payer ? `${payer.name} paid` : null}
        </p>
      </div>
      <div className="text-right">
        <p className="tabular text-sm font-medium">{formatMoney(e.amount, { cents: true })}</p>
        {e.local && (
          <p className="tabular text-xs text-muted-foreground">
            {formatLocal(e.local.amount, e.local.currency)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label={`Change ${e.note || SPEND_LABELS[e.category]}`}
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={remove}
          aria-label={`Remove ${e.note || SPEND_LABELS[e.category]}`}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

/** Who's in the group, and who owes whom. */
function SplitCard() {
  const { trip } = useSpending();
  const [name, setName] = useState("");
  const people = trip.spending.people;
  const paidCosts = trip.spending.expenses.some((e) => e.paidBy);
  const owed = balances(trip.spending);
  const payments = settleUp(trip.spending);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    tripActions.addPerson(name);
    setName("");
  };

  return (
    <section className="surface-card p-6" aria-labelledby="spend-split">
      <h2 id="spend-split" className="title-display text-title-1 leading-tight">
        Split costs
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {people.length < 2
          ? trip.setup.travelers > 1
            ? `Add who's going, then pick who paid when you log a cost. Waypoint works out who owes whom.`
            : "Traveling with others? Add them to split costs and see who owes whom."
          : "Pick who paid when you log a cost. Names stay on this trip."}
      </p>
      {people.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {people.map((p) => {
            const b = owed.find((x) => x.person.id === p.id);
            return (
              <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                {b && paidCosts && (
                  <span className="tabular text-xs text-muted-foreground">
                    paid {formatMoney(b.paid)}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => tripActions.removePerson(p.id)}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {people.length < 20 && (
        <form onSubmit={add} className="mt-4 flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="Name"
            aria-label="Name of someone on the trip"
            className="h-10"
          />
          <Button type="submit" variant="outline" disabled={!name.trim()}>
            <UserPlus /> Add
          </Button>
        </form>
      )}

      {people.length > 1 && paidCosts && (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="label-mono">To settle up</h3>
          {payments.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Everyone's even.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {payments.map((t) => (
                <li
                  key={`${t.from.id}-${t.to.id}`}
                  className="flex items-baseline justify-between gap-4 text-sm"
                >
                  <span>
                    <span className="font-medium">{t.from.name}</span> pays{" "}
                    <span className="font-medium">{t.to.name}</span>
                  </span>
                  <span className="tabular font-medium">
                    {formatMoney(t.amount, { cents: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            The fewest payments that even everyone out. Costs nobody paid for in the group (and
            booked prices) aren't split.
          </p>
        </div>
      )}
    </section>
  );
}
