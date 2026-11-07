import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { AnimatedMoney } from "@/components/app/motion";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/budget";
import {
  compareToBudget,
  itineraryActivityCost,
  itineraryMealCost,
  unpricedItems,
  type BudgetFit,
} from "@/lib/itinerary";
import { tripActions, useTrip } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

/**
 * The plan's costs next to the budget set aside for them. When sightseeing drifts
 * from the Activities budget, the traveler can sync the budget to the plan in one tap.
 */
export function PlanCosts() {
  const { trip, shape, totals } = useTrip();
  const itin = trip.itinerary;
  const sightseeing = itineraryActivityCost(itin, shape.travelers);
  const meals = itineraryMealCost(itin, shape.travelers);
  const activities = compareToBudget(sightseeing, totals.categories.activities);
  const unpriced = unpricedItems(itin);

  return (
    <section className="surface-card p-6">
      <h2 className="title-display text-title-1">Plan vs. budget</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        For {shape.travelers} traveler{shape.travelers > 1 ? "s" : ""}
      </p>

      <CostLine
        label="Sightseeing"
        planned={sightseeing}
        budget={totals.categories.activities}
        budgetLabel="Activities budget"
        fit={activities.fit}
      />
      <CostLine
        label="Restaurant picks"
        planned={meals}
        budget={totals.categories.food}
        budgetLabel="Meals budget"
        fit={meals > totals.categories.food ? "over" : "matches"}
        note="Breakfasts and extras come out of the rest."
      />

      {unpriced > 0 && (
        <p className="mt-4 rounded-lg bg-muted px-4 py-2 text-xs leading-snug text-muted-foreground">
          {unpriced} {unpriced === 1 ? "place doesn't" : "places don't"} publish prices, so{" "}
          {unpriced === 1 ? "it isn't" : "they aren't"} counted. Check before you go.
        </p>
      )}

      {unpriced > 0 && sightseeing === 0 ? null : activities.fit === "matches" ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="size-3.5 text-success" /> Activities budget matches your plan
        </p>
      ) : (
        <Button
          className="mt-4 w-full print:hidden"
          variant="ink"
          onClick={() => {
            tripActions.setOverride("activities", sightseeing);
            toast.success(`Activities budget set to ${formatMoney(sightseeing)}`, {
              action: {
                label: "Undo",
                onClick: () => tripActions.setOverride("activities", undefined),
              },
            });
          }}
        >
          Set Activities budget to {formatMoney(sightseeing)}
        </Button>
      )}
      <Link
        to="/budget"
        className="mt-4 block text-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Open the full budget
      </Link>
    </section>
  );
}

function CostLine({
  label,
  planned,
  budget,
  budgetLabel,
  fit,
  note,
}: {
  label: string;
  planned: number;
  budget: number;
  budgetLabel: string;
  fit: BudgetFit;
  note?: string;
}) {
  const pct = budget > 0 ? Math.min(100, (planned / budget) * 100) : planned > 0 ? 100 : 0;
  const diff = Math.abs(planned - budget);
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <AnimatedMoney value={planned} className="font-medium" />
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] spring-smooth",
            fit === "over" ? "bg-destructive" : "bg-foreground",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="tabular mt-2 flex justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {budgetLabel} {formatMoney(budget)}
        </span>
        {fit === "over" ? (
          <span className="font-medium text-destructive">{formatMoney(diff)} over</span>
        ) : fit === "under" ? (
          <span>{formatMoney(diff)} unplanned</span>
        ) : null}
      </p>
      {note && <p className="mt-1 text-micro text-muted-foreground">{note}</p>}
    </div>
  );
}
