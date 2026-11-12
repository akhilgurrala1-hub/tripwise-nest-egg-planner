import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  ArrowRight,
  Bookmark,
  Menu,
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
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Logo, LogoMark } from "./Logo";
import { useScrolled } from "./use-scrolled";
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
import { LEGAL } from "@/lib/legal";
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
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // Every page that isn't one of the four tabs lives under More (Book, Road trip,
  // account and legal pages), so More is the current tab there.
  const moreActive = !(TABS as string[]).includes(tabPath);
  usePreloadTabs();
  useEffect(() => {
    const id = window.setTimeout(() => document.documentElement.classList.add("settled"), 4000);
    return () => window.clearTimeout(id);
  }, []);
  // A new page closes the menu.
  useEffect(() => setMenuOpen(false), [pathname]);
  // iOS Safari only shows :active (our press feedback) once a touchstart listener exists.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  const scrolled = useScrolled();

  /*
   * One app frame that adapts to the screen:
   * - phones and tablets: a slim top bar and a bottom tab bar within thumb reach;
   * - laptops and desktops (1024px+): a sticky translucent top nav with a scroll-progress line.
   */
  return (
    <div className="pb-tabbar min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[100] focus-visible:rounded-lg focus-visible:bg-card focus-visible:px-4 focus-visible:py-2 focus-visible:text-footnote focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to content
      </a>
      <TopNav items={nav} pathname={pathname} />
      <header
        data-scrolled={scrolled && !menuOpen}
        className={cn(
          "scroll-edge sticky top-0 z-50 lg:hidden print:hidden",
          menuOpen ? "bg-background" : "material-thick",
        )}
      >
        <div className="flex h-12 items-center justify-between gap-2 px-4">
          <Link
            to="/"
            className="flex items-center rounded-md"
            aria-label="Waypoint home"
            onClick={() => setMenuOpen(false)}
          >
            <Logo markClassName="size-6" wordClassName="text-title-2" />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <AccountButton />
          </div>
        </div>
      </header>
      <main id="main" key={pathname} className="min-h-[70dvh]">
        {children}
      </main>
      <Footer />
      <TabBar
        items={nav}
        active={active}
        moreActive={moreActive}
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen((o) => !o)}
      />
      <MobileMenu open={menuOpen} items={nav} pathname={pathname} onClose={closeMenu} />
    </div>
  );
}

/** The current trip in a sentence: where, when, who. */
function TripSummary({ onCard = false }: { onCard?: boolean }) {
  const { trip, place } = useTrip();
  const s = trip.setup;
  return (
    <div className={cn("rounded-xl p-4", onCard ? "bg-card" : "bg-background")}>
      <p className="text-caption text-muted-foreground">
        {trip.isSample ? "Sample trip" : "Your trip"}
      </p>
      <p className="mt-1 truncate text-body font-semibold" title={place}>
        {place}
      </p>
      <p className="tabular mt-1 text-caption text-muted-foreground">
        {formatDateRange(s.startDate, s.endDate)} · {s.travelers}{" "}
        {s.travelers === 1 ? "traveler" : "travelers"}
      </p>
      <Link to="/" className="mt-2 inline-block text-caption font-semibold text-primary">
        {trip.isSample ? "Plan your own" : "Edit trip"}
      </Link>
    </div>
  );
}

/** Laptops and desktops: logo, sections, account and one call to action, with a scroll-progress line. */
function TopNav({ items, pathname }: { items: typeof NAV; pathname: string }) {
  const links = [
    ...items.filter((i) => i.to !== "/"),
    { to: "/spending" as const, label: "Spending" },
  ];
  return (
    <header className="scroll-edge material-thick sticky top-0 z-50 hidden border-b border-separator lg:block print:hidden">
      <div aria-hidden className="nav-progress" />
      <div className="page-container flex h-16 items-center justify-between gap-6 xl:gap-8">
        <Link to="/" className="flex items-center rounded-md" aria-label="Waypoint home">
          <Logo markClassName="size-8" wordClassName="text-title-2" />
        </Link>
        <nav aria-label="Main">
          <ul className="flex items-center gap-4 xl:gap-8">
            {links.map((l) => {
              const on = l.to === pathname || (l.to === "/budget" && pathname === "/spending");
              return (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "nav-link text-footnote transition-colors duration-300",
                      on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AccountButton />
          <Button asChild size="sm" variant="outline">
            <Link to="/">
              Plan a trip <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Phones: the main sections within thumb reach, and More for everything else. */
const TABS: (typeof NAV)[number]["to"][] = ["/", "/dashboard", "/budget", "/itinerary"];

function TabBar({
  items,
  active,
  moreActive,
  menuOpen,
  onMenu,
}: {
  items: typeof NAV;
  active: string | undefined;
  moreActive: boolean;
  menuOpen: boolean;
  onMenu: () => void;
}) {
  const tabs = items.filter((i) => TABS.includes(i.to));
  return (
    <nav
      aria-label="Tabs"
      className="material-thick fixed inset-x-0 bottom-0 z-50 border-t border-separator pb-safe lg:hidden print:hidden"
    >
      <ul className="grid h-14 grid-cols-5">
        {tabs.map((item) => {
          const on = item.to === active && !menuOpen;
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "pressable flex h-full flex-col items-center justify-center gap-1 text-micro",
                  on ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={on ? 2.2 : 1.8} />
                {item.label === "Itinerary" ? "Days" : item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            id="more-button"
            onClick={onMenu}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className={cn(
              "pressable flex h-full w-full flex-col items-center justify-center gap-1 text-micro",
              menuOpen || moreActive ? "font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            <Menu className="size-5" strokeWidth={menuOpen || moreActive ? 2.2 : 1.8} />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

/**
 * The phone's More sheet: the trip, every section and the account pages, above the
 * tab bar. Escape, a link or the More tab closes it. It isn't modal (the tab bar
 * stays usable), but opening it moves keyboard focus into it and Escape hands
 * focus back to the More tab.
 */
function MobileMenu({
  open,
  items,
  pathname,
  onClose,
}: {
  open: boolean;
  items: typeof NAV;
  pathname: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const sheet = useRef<HTMLDivElement>(null);
  // Only when it opens, so re-renders while open never pull focus back to the top.
  useEffect(() => {
    if (open) sheet.current?.querySelector<HTMLElement>("a[href], button")?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      document.getElementById("more-button")?.focus();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  const extra = [
    { to: "/spending" as const, label: "Spending", icon: Coins },
    ...(user
      ? [
          { to: "/trips" as const, label: "Saved trips", icon: Bookmark },
          { to: "/bookings" as const, label: "Bookings", icon: Ticket },
          { to: "/profile" as const, label: "Profile", icon: Settings2 },
        ]
      : []),
  ];
  const rows = [...items, ...extra];
  return (
    <div
      id="mobile-menu"
      ref={sheet}
      role="dialog"
      aria-label="More"
      data-open={open}
      inert={!open}
      className="mobile-menu fixed inset-x-0 top-12 bottom-[var(--tabbar)] z-[45] overflow-y-auto bg-background px-4 pt-4 pb-8 lg:hidden"
    >
      <div className="menu-item" style={{ ["--i" as string]: 0 } as React.CSSProperties}>
        <TripSummary onCard />
      </div>
      <ul className="mt-4 divide-y divide-separator overflow-hidden rounded-xl bg-card">
        {rows.map((item, i) => {
          const Icon = item.icon;
          return (
            <li
              key={item.to}
              className="menu-item"
              style={{ ["--i" as string]: i + 1 } as React.CSSProperties}
            >
              <Link
                to={item.to}
                aria-current={item.to === pathname ? "page" : undefined}
                onClick={onClose}
                className={cn(
                  "flex h-12 items-center gap-4 px-4 text-body",
                  item.to === pathname ? "font-semibold text-primary" : "text-foreground",
                )}
              >
                <Icon className="size-5 text-muted-foreground" strokeWidth={1.8} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 flex flex-wrap gap-x-4 gap-y-2 px-4 text-caption text-muted-foreground">
        <Link to="/privacy" onClick={onClose}>
          Privacy Policy
        </Link>
        <Link to="/terms" onClick={onClose}>
          Terms of Service
        </Link>
      </p>
    </div>
  );
}

/** The end of every page: the brand set large, then what the numbers are and the legal links. */
function Footer() {
  const year = new Date().getFullYear();
  const link =
    "inline-flex min-h-11 items-center text-foreground/80 hover:text-foreground hover:underline underline-offset-4";
  return (
    <footer className="border-t border-separator bg-card print:hidden">
      <div className="page-container grid gap-8 py-10 sm:py-12 lg:grid-cols-[1.2fr_2fr]">
        <div>
          <Logo markClassName="size-8" wordClassName="text-title-2" />
          <p className="mt-4 max-w-xs text-footnote text-muted-foreground">
            Plan a trip around your budget and see what to book. Costs are estimates in US dollars.
            Waypoint never books or takes payment.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <nav aria-label="Trip tools">
            <p className="text-footnote font-semibold">Trip tools</p>
            <div className="mt-2 flex flex-wrap gap-x-6">
              {[
                ...NAV.filter((n) => n.to !== "/road-trip"),
                { to: "/spending" as const, label: "Spending" },
              ].map((n) => (
                <Link key={n.to} to={n.to} className={link}>
                  {n.label}
                </Link>
              ))}
            </div>
          </nav>
          <nav aria-label="About">
            <p className="text-footnote font-semibold">About</p>
            <div className="mt-2 flex flex-wrap gap-x-6">
              <Link to="/privacy" className={link}>
                Privacy
              </Link>
              <Link to="/terms" className={link}>
                Terms
              </Link>
              <Link to="/terms" hash="credits" className={link}>
                Credits
              </Link>
              <a href={`mailto:${LEGAL.contactEmail}`} className={link}>
                Contact
              </a>
            </div>
          </nav>
        </div>
      </div>
      <div className="border-t border-separator">
        <p className="page-container py-4 text-footnote text-muted-foreground">
          © {year} {LEGAL.owner}
        </p>
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
    // Pre-fetching every tab costs data and bandwidth: skip it on saver mode and slow networks.
    const c = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (c?.saveData || /^(slow-2g|2g|3g)$/.test(c?.effectiveType ?? "")) return;
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
