import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
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
import { CursorLabel } from "./CursorLabel";
import { useActiveIndicator } from "./motion";
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
   * - phones: a slim top bar and a bottom tab bar within thumb reach;
   * - tablets (768px+): an icon rail on the left;
   * - laptops and desktops (1024px+): a sidebar with the trip and every section.
   * Content scrolls on its own; navigation never moves.
   */
  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[5rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Sidebar items={nav} pathname={pathname} />
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header
          data-scrolled={scrolled && !menuOpen}
          className={cn(
            "scroll-edge sticky top-0 z-50 md:hidden print:hidden",
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
              <Logo markClassName="size-6" wordClassName="text-sm font-semibold" />
            </Link>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <AccountButton />
            </div>
          </div>
        </header>
        <main key={pathname} className="pb-tabbar flex-1">
          {children}
        </main>
        <Footer />
      </div>
      <TabBar
        items={nav}
        active={active}
        moreActive={moreActive}
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen((o) => !o)}
      />
      <MobileMenu open={menuOpen} items={nav} pathname={pathname} onClose={closeMenu} />
      <CursorLabel />
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

/** Tablets get an icon rail; laptops and desktops the full sidebar. Phones use the tab bar. */
function Sidebar({ items, pathname }: { items: typeof NAV; pathname: string }) {
  const { user } = useAuth();
  // One highlight that springs to whichever link is current.
  const { ref, thumbRef, ready } = useActiveIndicator<HTMLElement>([pathname]);
  return (
    <header className="theme-deep sidebar-ink sticky top-0 hidden h-dvh flex-col md:flex print:hidden">
      <div className="flex h-16 shrink-0 items-center justify-center px-4 lg:justify-start lg:px-6">
        <Link to="/" className="flex items-center rounded-md" aria-label="Waypoint home">
          <LogoMark className="size-8 lg:hidden" />
          <Logo
            className="hidden lg:flex"
            markClassName="size-7"
            wordClassName="text-headline font-semibold"
          />
        </Link>
      </div>
      <div className="hidden px-4 lg:block">
        <TripSummary />
      </div>
      <nav
        ref={ref}
        aria-label="Main"
        data-ready={ready}
        className="group/nav relative mt-4 min-h-0 flex-1 overflow-y-auto px-2 lg:px-4"
      >
        <span
          ref={thumbRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 rounded-lg bg-fill before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-xs before:bg-primary"
          style={{ opacity: ready ? 1 : 0 }}
        />
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.to}>
              <SideLink
                to={item.to}
                icon={item.icon}
                label={item.label}
                on={item.to === pathname}
              />
            </li>
          ))}
        </ul>
        <p className="mt-6 hidden px-4 text-caption font-semibold text-muted-foreground lg:block">
          {user ? "Account" : "More"}
        </p>
        <ul className="mt-2 space-y-1 border-t border-separator pt-2 lg:border-0 lg:pt-0">
          <li>
            <SideLink to="/spending" icon={Coins} label="Spending" on={pathname === "/spending"} />
          </li>
          {user && (
            <>
              <li>
                <SideLink
                  to="/trips"
                  icon={Bookmark}
                  label="Saved trips"
                  on={pathname === "/trips"}
                />
              </li>
              <li>
                <SideLink
                  to="/bookings"
                  icon={Ticket}
                  label="Bookings"
                  on={pathname === "/bookings"}
                />
              </li>
              <li>
                <SideLink
                  to="/profile"
                  icon={Settings2}
                  label="Profile"
                  on={pathname === "/profile"}
                />
              </li>
            </>
          )}
        </ul>
      </nav>
      <div className="flex shrink-0 flex-col items-center gap-2 border-t border-separator p-4 lg:flex-row lg:justify-between">
        <AccountButton />
        <ThemeToggle />
      </div>
    </header>
  );
}

function SideLink({
  to,
  icon: Icon,
  label,
  on,
}: {
  to: (typeof NAV)[number]["to"] | "/spending" | "/trips" | "/bookings" | "/profile";
  icon: LucideIcon;
  label: string;
  on: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={on ? "page" : undefined}
      data-active={on}
      title={label}
      className={cn(
        "pressable relative flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-micro transition-colors duration-150 lg:h-10 lg:flex-row lg:gap-4 lg:px-4 lg:py-0 lg:text-footnote",
        on
          ? "font-semibold text-foreground group-data-[ready=false]/nav:bg-fill"
          : "text-foreground/75 hover:bg-fill hover:text-foreground",
      )}
    >
      <Icon className="size-5 shrink-0 lg:size-[18px]" strokeWidth={on ? 2.2 : 1.8} />
      <span className="max-w-full truncate">{label}</span>
    </Link>
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
      className="material-thick fixed inset-x-0 bottom-0 z-50 border-t border-separator pb-safe md:hidden print:hidden"
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
      className="mobile-menu fixed inset-x-0 top-12 bottom-[var(--tabbar)] z-[45] overflow-y-auto bg-background px-4 pt-4 pb-8 md:hidden"
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

/** One quiet line at the end of every page: what the numbers are and the legal links (photo sources are under Credits). */
function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="overflow-hidden text-caption text-muted-foreground print:hidden">
      <div aria-hidden className="page-container pt-16 sm:pt-24">
        {/* The brand set as large as the page allows; drawn as a graphic, not text. */}
        <svg viewBox="0 0 1000 164" className="footer-mark block h-auto w-full">
          <text x="-8" y="142">
            Waypoint
            <tspan fill="#e0501a">.</tspan>
          </text>
        </svg>
      </div>
      <div className="page-container border-t border-separator py-6">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>Estimates in US dollars. Waypoint never books or takes payment.</span>
          <span>
            © {year} {LEGAL.owner}
          </span>
          <Link to="/privacy" className="hover:text-foreground hover:underline">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-foreground hover:underline">
            Terms of Service
          </Link>
          <Link to="/terms" hash="credits" className="hover:text-foreground hover:underline">
            Credits and licenses
          </Link>
          <a
            href={`mailto:${LEGAL.contactEmail}`}
            className="hover:text-foreground hover:underline"
          >
            Contact
          </a>
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
