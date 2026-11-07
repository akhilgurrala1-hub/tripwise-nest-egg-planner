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
import { useEffect, useState, type ReactNode } from "react";

import { Logo, LogoMark } from "./Logo";
import { useScrollReveal } from "./scroll-reveal";
import { formatDateRange } from "./TripHeader";
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
  const [menuOpen, setMenuOpen] = useState(false);
  usePreloadTabs();
  useScrollReveal(pathname);
  // A new page closes the menu.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Global nav, as on apple.com: a thin glass bar, small links in the middle. */}
      <header
        className={cn(
          "sticky top-0 z-50 print:hidden",
          menuOpen ? "bg-background" : "material-thick",
        )}
      >
        <div className="page-container flex h-11 items-center justify-between gap-4">
          <Link
            to="/"
            className="flex items-center rounded-md"
            aria-label="Waypoint home"
            onClick={() => setMenuOpen(false)}
          >
            <Logo markClassName="size-6" wordClassName="text-sm font-semibold" />
          </Link>
          <nav className="hidden md:block" aria-label="Main">
            <ul className="flex items-center gap-8">
              {nav.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={item.to === active ? "page" : undefined}
                    className={cn(
                      "text-caption transition-colors duration-200",
                      item.to === active
                        ? "text-foreground"
                        : "text-foreground/70 hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <AccountButton />
            <MenuButton open={menuOpen} onToggle={() => setMenuOpen((o) => !o)} />
          </div>
        </div>
      </header>
      <MobileMenu open={menuOpen} items={nav} active={active} onClose={() => setMenuOpen(false)} />
      <LocalNav pathname={pathname} />

      <main key={pathname} className="animate-page flex-1 pb-20">
        {children}
      </main>
      <Footer items={nav} active={active} />
    </div>
  );
}

/** apple.com's menu button: two lines that turn into an X. Phones only. */
function MenuButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="mobile-menu"
      aria-label={open ? "Close menu" : "Menu"}
      className="relative grid size-11 place-items-center md:hidden"
    >
      <span aria-hidden className="relative block h-3 w-4">
        <span
          className={cn(
            "absolute left-0 block h-[1.5px] w-4 rounded-full bg-foreground transition-[top,rotate] duration-300",
            open ? "top-[5px] rotate-45" : "top-0.5",
          )}
        />
        <span
          className={cn(
            "absolute left-0 block h-[1.5px] w-4 rounded-full bg-foreground transition-[top,rotate] duration-300",
            open ? "top-[5px] -rotate-45" : "top-[9px]",
          )}
        />
      </span>
    </button>
  );
}

/**
 * The phone menu, as on apple.com: the page gives way to a full-screen list of big
 * links that drop in one after another. Escape or a link closes it.
 */
function MobileMenu({
  open,
  items,
  active,
  onClose,
}: {
  open: boolean;
  items: typeof NAV;
  active: string | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  return (
    <div
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      hidden={!open}
      className="fixed inset-x-0 top-11 bottom-0 z-[45] overflow-y-auto bg-background px-8 pt-6 pb-10 md:hidden"
    >
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={item.to}
            className="menu-item"
            style={{ ["--i" as string]: i } as React.CSSProperties}
          >
            <Link
              to={item.to}
              aria-current={item.to === active ? "page" : undefined}
              onClick={onClose}
              className={cn(
                "block py-1 text-title-2",
                item.to === active ? "text-foreground" : "text-foreground/80",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <ul
        className="mt-8 space-y-2"
        style={{ ["--i" as string]: items.length } as React.CSSProperties}
      >
        {[
          { to: "/spending" as const, label: "Spending" },
          { to: "/trips" as const, label: "Saved trips" },
          { to: "/bookings" as const, label: "Bookings" },
          { to: "/profile" as const, label: "Profile" },
        ].map((l, i) => (
          <li
            key={l.to}
            className="menu-item"
            style={{ ["--i" as string]: items.length + i } as React.CSSProperties}
          >
            <Link
              to={l.to}
              onClick={onClose}
              className="block py-1 text-body text-muted-foreground"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the local nav's button does on each page: the next step for the trip. */
const LOCAL_CTA: Record<
  string,
  { label: string; to?: "/book" | "/itinerary" | "/dashboard"; form?: string }
> = {
  "/": { label: "Plan trip", form: "plan-form" },
  "/dashboard": { label: "See the days", to: "/itinerary" },
  "/budget": { label: "Book", to: "/book" },
  "/spending": { label: "Book", to: "/book" },
  "/itinerary": { label: "Book", to: "/book" },
  "/road-trip": { label: "Book", to: "/book" },
  "/book": { label: "Overview", to: "/dashboard" },
};

/**
 * apple.com's local nav: a second glass bar under the global one with the page's
 * subject on the left (the trip) and its one action on the right, a capsule.
 */
function LocalNav({ pathname }: { pathname: string }) {
  const { trip, place } = useTrip();
  const cta = LOCAL_CTA[pathname];
  if (!cta) return null;
  const s = trip.setup;
  return (
    <nav
      aria-label="This trip"
      className="material-thick sticky top-11 z-40 border-b border-separator print:hidden"
    >
      <div className="page-container flex h-13 items-center justify-between gap-4">
        <p className="min-w-0 truncate text-headline">{trip.isSample ? "Sample trip" : place}</p>
        <div className="flex shrink-0 items-center gap-4">
          <span className="tabular hidden text-caption text-muted-foreground sm:inline">
            {formatDateRange(s.startDate, s.endDate)} · {s.travelers}{" "}
            {s.travelers === 1 ? "traveler" : "travelers"}
          </span>
          {cta.form ? (
            <Button type="submit" form={cta.form} size="sm" variant="go">
              {cta.label}
            </Button>
          ) : (
            <Button asChild size="sm" variant="go">
              <Link to={cta.to!}>{cta.label}</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}

/**
 * apple.com's footer: small gray type, where the numbers and pictures come from,
 * the site's links in columns, and a last line with the copyright.
 */
function Footer({ items, active }: { items: typeof NAV; active: string | undefined }) {
  const { user } = useAuth();
  const current = items.find((i) => i.to === active);
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-separator bg-background text-caption text-muted-foreground print:hidden">
      <div className="page-container py-6">
        <div className="space-y-2 border-b border-separator pb-4">
          <p>
            Costs are estimates until live prices are connected, and every amount is worked out in
            US dollars. Waypoint never books or takes payment: you book on each provider&apos;s own
            site.
          </p>
          <p>
            Weather from Open-Meteo. Photos and introductions from Wikipedia, travel tips from
            Wikivoyage (CC BY-SA). Restaurants from OpenStreetMap contributors. Towns from GeoNames
            (CC BY). Airports from OurAirports.
          </p>
        </div>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 py-4">
          <Link to="/" aria-label="Waypoint home" className="text-foreground">
            <LogoMark className="size-4" />
          </Link>
          {current && (
            <>
              <span aria-hidden>›</span>
              <span className="text-foreground">{current.label}</span>
            </>
          )}
        </nav>
        <div className="grid grid-cols-2 gap-6 border-b border-separator pb-6 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-foreground">Plan</p>
            <ul className="mt-2 space-y-2">
              {items.map((i) => (
                <li key={i.to}>
                  <Link to={i.to} className="hover:text-foreground hover:underline">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-foreground">Your trip</p>
            <ul className="mt-2 space-y-2">
              <li>
                <Link to="/spending" className="hover:text-foreground hover:underline">
                  Spending
                </Link>
              </li>
              <li>
                <Link to="/book" className="hover:text-foreground hover:underline">
                  Before you go
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-foreground">Account</p>
            <ul className="mt-2 space-y-2">
              {user ? (
                <>
                  <li>
                    <Link to="/trips" className="hover:text-foreground hover:underline">
                      Saved trips
                    </Link>
                  </li>
                  <li>
                    <Link to="/bookings" className="hover:text-foreground hover:underline">
                      Bookings
                    </Link>
                  </li>
                  <li>
                    <Link to="/profile" className="hover:text-foreground hover:underline">
                      Profile
                    </Link>
                  </li>
                </>
              ) : (
                <li>
                  <Link
                    to="/auth"
                    search={{ redirect: undefined }}
                    className="hover:text-foreground hover:underline"
                  >
                    Sign in
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </div>
        <p className="pt-4">Copyright © {year} Waypoint. All rights reserved.</p>
      </div>
    </footer>
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
