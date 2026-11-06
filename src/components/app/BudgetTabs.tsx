import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/** Budget has two sides: the plan, and what's actually been spent against it. */
export function BudgetTabs({ current }: { current: "plan" | "spent" }) {
  const tab = (to: "/budget" | "/spending", id: "plan" | "spent", label: string) => (
    <Link
      to={to}
      aria-current={current === id ? "page" : undefined}
      className={cn(
        "flex min-h-9 items-center rounded-lg px-4 text-footnote font-medium transition-colors",
        current === id
          ? "border border-border bg-card text-foreground shadow-[0_1px_2px_oklch(0.2_0.01_260/0.08)]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Budget" className="page-container mt-6 print:hidden">
      <div className="inline-flex gap-1 rounded-xl border border-border bg-muted/60 p-1">
        {tab("/budget", "plan", "Plan")}
        {tab("/spending", "spent", "Spent")}
      </div>
    </nav>
  );
}
