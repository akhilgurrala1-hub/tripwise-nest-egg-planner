import { Link } from "@tanstack/react-router";
import { Compass, LayoutDashboard, Map, Wallet, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { DemoBadge } from "./bits";
import { cn } from "@/lib/utils";

const NAV: { to: "/" | "/budget" | "/itinerary" | "/dashboard"; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Plan", icon: Compass },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/itinerary", label: "Itinerary", icon: Map },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-40 border-b border-border/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-gradient-sunset text-sunset-foreground shadow-glow">
              <Compass className="size-4" />
            </span>
            <span className="font-display text-xl font-semibold tracking-tight text-foreground">Waypoint</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: true }}
                className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <DemoBadge label="Demo prices" />
        </div>
      </header>

      <main className="pb-28 md:pb-16">{children}</main>

      <nav className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border/70 md:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 pt-1.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: true }}
              className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "grid h-8 w-12 place-items-center rounded-full transition-colors",
                      isActive ? "bg-secondary text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className={isActive ? "text-primary" : "text-muted-foreground"}>{label}</span>
                </>
              )}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
