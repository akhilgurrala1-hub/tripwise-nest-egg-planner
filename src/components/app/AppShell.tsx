import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Compass, LayoutDashboard, LogOut, Map, Monitor, Moon, Route as RouteIcon, Sun, UserRound, Wallet, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { PriceSourceBadge } from "./bits";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useTheme, type ThemePref } from "@/lib/theme";

const NAV: { to: "/" | "/budget" | "/road-trip" | "/itinerary" | "/dashboard"; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Plan", icon: Compass },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/road-trip", label: "Road trip", icon: RouteIcon },
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
          <div className="flex items-center gap-2">
            <PriceSourceBadge className="hidden lg:inline-flex" />
            <ThemeToggle />
            <AccountButton />
          </div>
        </div>
      </header>

      <main className="pb-28 md:pb-16">{children}</main>

      <nav className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border/70 md:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-lg grid-cols-5 px-1 pt-1.5">
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
                      "grid h-8 w-11 place-items-center rounded-full transition-colors",
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

function AccountButton() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (loading) return <span className="size-9" aria-hidden />;
  if (!user) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link to="/auth" search={{ redirect: undefined }}>
          Sign in
        </Link>
      </Button>
    );
  }

  const signOut = async () => {
    await queryClient.cancelQueries({ queryKey: ["real-stops"] });
    queryClient.removeQueries({ queryKey: ["real-stops"] });
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" className="size-9" aria-label="Account">
          <UserRound />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const THEME_OPTIONS: { id: ThemePref; label: string; icon: LucideIcon }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

function ThemeToggle() {
  const { pref, setPref } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-9" aria-label="Change theme">
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
          <DropdownMenuItem key={id} onClick={() => setPref(id)} className={cn(pref === id && "font-semibold text-primary")}>
            <Icon className="size-4" /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
