import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  CalendarCheck,
  Coins,
  Compass,
  LayoutDashboard,
  LogOut,
  Map,
  Monitor,
  Moon,
  Route as RouteIcon,
  Ruler,
  Settings2,
  Sun,
  Ticket,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Logo } from "./Logo";
import { useActiveIndicator } from "./motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useTheme, type ThemePref } from "@/lib/theme";
import { usePersonalizedSample } from "@/lib/live/use-home";
import { setLocalePrefs, useLocale } from "@/lib/live/use-locale";
import { CURRENCIES } from "@/lib/locale";
import { useTrip } from "@/lib/trip-store";

const NAV: {
  to: "/" | "/budget" | "/road-trip" | "/itinerary" | "/dashboard" | "/book";
  label: string;
  icon: LucideIcon;
}[] = [
  // In the order a trip comes together: set it up, see where it stands, then fine-tune.
  { to: "/", label: "Plan", icon: Compass },
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/itinerary", label: "Itinerary", icon: Map },
  { to: "/road-trip", label: "Road trip", icon: RouteIcon },
  { to: "/book", label: "Book", icon: CalendarCheck },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { trip } = useTrip();
  usePersonalizedSample();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // Route stops only make sense on a road trip, so the tab appears only for one.
  const nav = NAV.filter((n) => n.to !== "/road-trip" || trip.setup.tripType === "road-trip");
  // Spending is the other half of Budget, so Budget stays the current tab there.
  const tabPath = pathname === "/spending" ? "/budget" : pathname;
  const active = nav.find((n) => n.to === tabPath)?.to;
  const desk = useActiveIndicator<HTMLDivElement>([active, nav.length]);
  const mobile = useActiveIndicator<HTMLDivElement>([active, nav.length], { onlyX: true });
  usePreloadTabs();

  return (
    <div className="min-h-screen bg-background">
      <header className="material-regular sticky top-0 z-40 border-b border-separator print:hidden">
        <div className="page-container flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center rounded-md" aria-label="Waypoint home">
            <Logo />
          </Link>
          <nav className="hidden md:block" aria-label="Main">
            <div ref={desk.ref} className="relative flex items-center gap-1">
              {/* "You are here": the brand's coral destination dot travels to the current tab. */}
              <span
                ref={desk.thumbRef}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-0 left-0 flex items-end justify-center transition-opacity duration-150",
                  desk.ready && active ? "opacity-100" : "opacity-0",
                )}
              >
                <span className="-mb-1 block size-[5px] rounded-full bg-brand-coral" />
              </span>
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  data-active={item.to === active}
                  className={cn(
                    "pressable relative rounded-md px-4 py-2 text-sm font-medium",
                    item.to === active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <AccountButton />
          </div>
        </div>
      </header>

      <main key={pathname} className="animate-page pb-28 md:pb-20">
        {children}
      </main>

      <nav
        className="material-regular pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-separator md:hidden print:hidden"
        aria-label="Main"
      >
        <div
          ref={mobile.ref}
          className={cn(
            "relative mx-auto grid max-w-lg px-2 pt-1",
            nav.length === 6 ? "grid-cols-6" : "grid-cols-5",
          )}
        >
          <span
            ref={mobile.thumbRef}
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 left-0 h-[5px] transition-opacity duration-150",
              mobile.ready && active ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="mx-auto mt-1 block size-[5px] rounded-full bg-brand-coral" />
          </span>
          {nav.map(({ to, label, icon: Icon }) => {
            const isActive = to === active;
            return (
              <Link
                key={to}
                to={to}
                data-active={isActive}
                className={cn(
                  "pressable flex flex-col items-center gap-1 pt-2 pb-2 text-micro font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={isActive ? 2 : 1.6} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/**
 * Once the first page has settled, fetch every tab's code in the background, so
 * switching tabs never waits on the network (phones don't hover, so "intent"
 * preloading alone only helps on tap).
 */
function usePreloadTabs() {
  const router = useRouter();
  useEffect(() => {
    const warm = () => {
      for (const { to } of NAV) void router.preloadRoute({ to }).catch(() => undefined);
      void router.preloadRoute({ to: "/spending" }).catch(() => undefined);
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(warm, 1200);
    return () => window.clearTimeout(t);
  }, [router]);
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
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" className="size-9" aria-label="Account">
          <UserRound />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/trips">
            <Bookmark className="size-4" /> Saved trips
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/bookings">
            <Ticket className="size-4" /> Bookings & live prices
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <Settings2 className="size-4" /> Profile & preferences
          </Link>
        </DropdownMenuItem>
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
  const { currency, prefs, autoUnits, autoCurrency } = useLocale();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-9" aria-label="Display settings">
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
          <DropdownMenuItem
            key={id}
            onClick={() => setPref(id)}
            className={cn(pref === id && "font-semibold text-primary")}
          >
            <Icon className="size-4" /> {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Units
        </DropdownMenuLabel>
        {(
          [
            ["auto", `Automatic (${autoUnits === "metric" ? "°C, km" : "°F, mi"})`],
            ["imperial", "°F and miles"],
            ["metric", "°C and kilometers"],
          ] as const
        ).map(([id, label]) => (
          <DropdownMenuItem
            key={id}
            onClick={() => setLocalePrefs({ units: id })}
            className={cn(prefs.units === id && "font-semibold text-primary")}
          >
            <Ruler className="size-4" /> {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Coins className="size-4" /> Show prices in {currency}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            <DropdownMenuItem
              onClick={() => setLocalePrefs({ currency: "auto" })}
              className={cn(prefs.currency === "auto" && "font-semibold text-primary")}
            >
              Automatic ({autoCurrency})
            </DropdownMenuItem>
            {CURRENCIES.map((c) => (
              <DropdownMenuItem
                key={c}
                onClick={() => setLocalePrefs({ currency: c })}
                className={cn(prefs.currency === c && "font-semibold text-primary")}
              >
                {c}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <p className="px-2 pt-1 pb-2 text-micro leading-snug text-muted-foreground">
          Budgets are worked out in US dollars; other currencies show an approximate conversion at
          today&apos;s rate.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
