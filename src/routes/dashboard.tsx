import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  CircleDashed,
  Lock,
  PiggyBank,
  ShieldCheck,
  TrendingDown,
  Undo2,
  Wallet,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

import { CATEGORY_COLOR_VAR, CATEGORY_ICONS, PriceSourceBadge } from "@/components/app/bits";
import { WeatherCard } from "@/components/app/Weather";
import { PageHeader } from "@/components/app/TripHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORIES, CATEGORY_LABELS, SAVING_TITLES, formatMoney } from "@/lib/budget";
import { useAuth } from "@/lib/auth-context";
import { TRAVEL_STYLES, TRIP_TYPES } from "@/lib/demo-data";
import { liveCategories } from "@/lib/live/sources";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Trip dashboard — Waypoint" },
      {
        name: "description",
        content:
          "See total planned expenses, remaining money, potential savings and your protected emergency fund.",
      },
      { property: "og:title", content: "Trip dashboard — Waypoint" },
      {
        property: "og:description",
        content: "Your trip's planned spend, money left and savings opportunities at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { trip, totals, savings, applied, potentialSavings, shape } = useTrip();
  const style = TRAVEL_STYLES.find((s) => s.id === trip.setup.style);
  const type = TRIP_TYPES.find((t) => t.id === trip.setup.tripType);

  const breakdown = CATEGORIES.map((c) => ({ cat: c, value: totals.categories[c] }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <PageHeader eyebrow="Your trip" title="Everything at a glance">
        <div className="flex gap-2">
          {type && <Badge variant="secondary">{type.label}</Badge>}
          {style && (
            <Badge variant={style.id === "luxury" ? "gold" : "secondary"}>{style.label}</Badge>
          )}
        </div>
      </PageHeader>

      <div className="mx-auto mt-6 max-w-6xl space-y-6 px-4">
        {/* Hero balance */}
        <section className="relative overflow-hidden rounded-4xl bg-gradient-ink p-6 text-ink-foreground shadow-lift sm:p-8">
          <div
            className="absolute -top-24 -right-24 size-72 rounded-full bg-gradient-sunset opacity-30 blur-3xl"
            aria-hidden
          />
          <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-sm text-ink-foreground/70">
                {totals.overBudget
                  ? "Your plan is over your spending money by"
                  : "You've got this much left to explore"}
              </p>
              <p
                className={cn(
                  "tabular font-display text-5xl font-semibold sm:text-6xl",
                  totals.overBudget && "text-sunset",
                )}
              >
                {totals.overBudget ? "−" : ""}
                {formatMoney(Math.abs(totals.remaining))}
              </p>
              <p className="mt-1 text-sm text-ink-foreground/70">
                of {formatMoney(totals.spendable)} spendable · {formatMoney(totals.totalBudget)}{" "}
                total budget
              </p>
              {totals.overBudget && (
                <Link
                  to="/budget"
                  className="mt-2 inline-block text-sm font-semibold text-sunset underline underline-offset-2"
                >
                  See where to cut
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2 self-start rounded-2xl bg-ink-foreground/10 px-4 py-3 sm:self-end">
              <Lock className="size-4" />
              <div>
                <p className="text-[11px] text-ink-foreground/70">Emergency reserve</p>
                <p className="tabular font-bold">{formatMoney(totals.emergencyFund)} protected</p>
              </div>
            </div>
          </div>
          <div className="relative mt-6">
            <div className="flex h-3 overflow-hidden rounded-full bg-ink-foreground/10">
              <div
                className={cn(
                  "h-full transition-all",
                  totals.overBudget ? "bg-destructive" : "bg-gradient-sunset",
                )}
                style={{
                  width: `${totals.percentUsed === null ? (totals.planned > 0 ? 100 : 0) : Math.min(100, totals.percentUsed)}%`,
                }}
              />
            </div>
            <div className="tabular mt-2 flex justify-between text-xs text-ink-foreground/70">
              <span>
                {totals.percentUsed === null
                  ? "No spendable budget"
                  : `${Math.round(totals.percentUsed)}% planned`}
              </span>
              <span>{formatMoney(totals.perPersonPerDay)} / person / day</span>
            </div>
          </div>
        </section>

        <NextSteps />

        {/* Stats */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={Wallet}
            label="Total planned"
            value={formatMoney(totals.planned)}
            sub={`${shape.days} days · ${shape.travelers} travelers`}
          />
          <StatCard
            icon={TrendingDown}
            label={totals.overBudget ? "Over budget" : "Remaining"}
            value={formatMoney(Math.abs(totals.remaining))}
            sub={totals.overBudget ? "Trim or apply savings" : "Free to spend"}
            tone={totals.overBudget ? "danger" : "success"}
          />
          <StatCard
            icon={PiggyBank}
            label="Potential savings"
            value={formatMoney(potentialSavings)}
            sub={`${savings.length} ideas below`}
            tone="sunset"
          />
          <StatCard
            icon={ShieldCheck}
            label="Emergency reserve"
            value={formatMoney(totals.emergencyFund)}
            sub="Kept safe, never spent"
            tone="shield"
          />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Breakdown */}
          <section className="surface-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold">Where it goes</h2>
              <PriceSourceBadge />
            </div>
            <div className="mt-2 grid items-center gap-4 sm:grid-cols-[180px_1fr]">
              <div className="relative mx-auto size-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="value"
                      nameKey="cat"
                      startAngle={90}
                      endAngle={-270}
                      innerRadius="68%"
                      outerRadius="100%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {breakdown.map((d) => (
                        <Cell key={d.cat} fill={CATEGORY_COLOR_VAR[d.cat]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Planned</p>
                    <p className="tabular font-display text-xl font-semibold">
                      {formatMoney(totals.planned)}
                    </p>
                  </div>
                </div>
              </div>
              <ul className="space-y-1.5">
                {breakdown.map(({ cat, value }) => {
                  const Icon = CATEGORY_ICONS[cat];
                  return (
                    <li key={cat} className="flex items-center gap-2.5 text-sm">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLOR_VAR[cat] }}
                      />
                      <Icon className="size-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate">{CATEGORY_LABELS[cat]}</span>
                      <span className="tabular font-semibold">{formatMoney(value)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <Button asChild variant="outline" className="mt-5 w-full">
              <Link to="/budget">
                Edit budget <ArrowRight />
              </Link>
            </Button>
          </section>

          {/* Savings */}
          <section className="surface-card p-5">
            <h2 className="font-display text-2xl font-semibold">Ways to spend less</h2>
            <p className="text-sm text-muted-foreground">
              Each idea updates your budget the moment you apply it. You can undo it anytime.
            </p>
            <ul className="mt-4 space-y-2.5">
              {savings.map((s) => {
                const Icon = CATEGORY_ICONS[s.category];
                return (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-background/60 p-3"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{s.title}</p>
                      <p className="text-xs leading-snug text-muted-foreground">{s.detail}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tabular text-sm font-bold text-success">
                        −{formatMoney(s.totalSavings)}
                      </span>
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => {
                          tripActions.applySaving(s.id);
                          toast.success(`${s.title} applied`);
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                  </li>
                );
              })}
              {savings.length === 0 && (
                <li className="rounded-2xl bg-success-soft p-4 text-sm text-success">
                  You've applied every saving idea — nicely done.
                </li>
              )}
            </ul>
            {applied.length > 0 && (
              <div className="mt-4 border-t border-dashed border-border pt-4">
                <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Applied
                </p>
                <div className="flex flex-wrap gap-2">
                  {applied.map((id) => (
                    <button
                      key={id}
                      onClick={() => tripActions.undoSaving(id)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success transition hover:bg-muted hover:text-foreground"
                      aria-label={`Undo ${SAVING_TITLES[id]}`}
                    >
                      <Check className="size-3" /> {SAVING_TITLES[id]}{" "}
                      <Undo2 className="size-3 opacity-60" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <WeatherCard />

        <section className="grid gap-3 sm:grid-cols-2">
          <QuickLink to="/itinerary" title="View itinerary" sub="Day-by-day stops & restaurants" />
          <QuickLink
            to="/"
            title="Plan a different trip"
            sub="Change destination, dates or budget"
          />
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub: string;
  tone?: "success" | "danger" | "sunset" | "shield";
}) {
  return (
    <div className="surface-card p-4">
      <span
        className={cn(
          "grid size-9 place-items-center rounded-xl",
          tone === "success" && "bg-success-soft text-success",
          tone === "danger" && "bg-destructive-soft text-destructive",
          tone === "sunset" && "bg-sunset-soft text-sunset",
          tone === "shield" && "bg-shield-soft text-shield",
          !tone && "bg-secondary text-primary",
        )}
      >
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular font-display text-2xl font-semibold",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function QuickLink({ to, title, sub }: { to: "/itinerary" | "/"; title: string; sub: string }) {
  return (
    <Link
      to={to}
      className="surface-card group flex items-center justify-between p-5 transition hover:shadow-lift"
    >
      <div>
        <p className="font-display text-lg font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      <ArrowRight className="size-5 text-primary transition group-hover:translate-x-1" />
    </Link>
  );
}

type StepTo = "/" | "/budget" | "/road-trip" | "/itinerary" | "/trips" | "/auth";

/** The planning flow in order, with what's done and the one thing to do next. */
function NextSteps() {
  const { trip } = useTrip();
  const { user } = useAuth();
  const roadTrip = trip.setup.tripType === "road-trip";
  const live = liveCategories(trip.inputs, trip.overrides, trip.live).length > 0;
  const realPlan = trip.itinerary?.source === "google" || trip.itinerary?.source === "ai";
  const steps: { title: string; done: boolean; to: StepTo; cta: string }[] = [
    { title: "Plan your trip", done: !trip.isSample, to: "/", cta: "Start planning" },
    { title: "Check live prices", done: live, to: "/budget", cta: "Open budget" },
    ...(roadTrip
      ? [
          {
            title: "Pick stops on the drive",
            done: trip.roadTrip.includedStops.length > 0,
            to: "/road-trip" as const,
            cta: "Plan route",
          },
        ]
      : []),
    {
      title: user ? "Build your itinerary from real places" : "Build your itinerary",
      done: realPlan,
      to: "/itinerary",
      cta: "Open itinerary",
    },
    {
      title: "Save it to your account",
      done: !!trip.cloud,
      to: user ? "/trips" : "/auth",
      cta: user ? "Save trip" : "Sign in to save",
    },
  ];
  const next = steps.find((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Your planning checklist</h2>
          <p className="text-sm text-muted-foreground">
            {next
              ? `${doneCount} of ${steps.length} done · next: ${next.title.toLowerCase()}`
              : "All set — have a great trip!"}
          </p>
        </div>
        {next && (
          <Button asChild variant="hero" size="sm">
            {next.to === "/auth" ? (
              <Link to="/auth" search={{ redirect: "/trips" }}>
                {next.cta} <ArrowRight />
              </Link>
            ) : (
              <Link to={next.to}>
                {next.cta} <ArrowRight />
              </Link>
            )}
          </Button>
        )}
      </div>
      <ol
        className={cn(
          "mt-4 grid gap-2 sm:grid-cols-2",
          steps.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4",
        )}
      >
        {steps.map((s, i) => (
          <li key={s.title}>
            {s.to === "/auth" ? (
              <Link
                to="/auth"
                search={{ redirect: "/trips" }}
                className={stepClass(s.done, s === next)}
              >
                <StepMark done={s.done} n={i + 1} /> <span className="min-w-0">{s.title}</span>
              </Link>
            ) : (
              <Link to={s.to} className={stepClass(s.done, s === next)}>
                <StepMark done={s.done} n={i + 1} /> <span className="min-w-0">{s.title}</span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function stepClass(done: boolean, current: boolean) {
  return cn(
    "flex min-h-11 items-center gap-2.5 rounded-2xl border px-3 py-2 text-sm font-semibold transition hover:shadow-soft",
    done
      ? "border-success/25 bg-success-soft text-success"
      : current
        ? "border-primary bg-card ring-2 ring-primary/20"
        : "border-border bg-background/60",
  );
}

function StepMark({ done, n }: { done: boolean; n: number }) {
  return done ? (
    <Check className="size-4 shrink-0" aria-label="Done" />
  ) : (
    <span className="relative grid size-5 shrink-0 place-items-center">
      <CircleDashed className="absolute size-5 text-muted-foreground" aria-hidden />
      <span className="text-[10px] font-bold">{n}</span>
    </span>
  );
}
