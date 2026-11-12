import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import { LogoMark } from "@/components/app/Logo";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

function NotFoundComponent() {
  return (
    <div className="page-container flex min-h-[80vh] flex-col justify-center pb-24 md:pb-0">
      <p className="not-found-mark">404</p>
      {/* The route leaves the road and ends at a dot that is not on any map. */}
      <svg aria-hidden viewBox="0 0 600 60" className="-mt-2 h-auto w-full max-w-2xl">
        <path
          className="route-line"
          pathLength={1}
          d="M 8 40 C 120 40, 150 12, 260 20 S 400 52, 470 28 S 540 10, 580 30"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="0.012 0.02"
        />
        <circle
          cx="8"
          cy="40"
          r="6"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          className="route-origin"
        />
        <circle cx="580" cy="30" r="8" fill="#E0501A" className="route-dot" />
      </svg>
      <h1 className="title-display mt-8 text-large-title">This stop isn't on the map.</h1>
      <p className="mt-4 max-w-md text-body text-muted-foreground">
        The page you wanted doesn't exist or has moved. Head back to the start and plan from there.
      </p>
      <div className="mt-8">
        <Button asChild size="lg" variant="go">
          <Link to="/">Back to the start</Link>
        </Button>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="title-display text-3xl text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-ink-foreground transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

/** Social previews need absolute image URLs. Set VITE_SITE_URL to the production domain. */
const SITE_URL =
  (import.meta.env["VITE_SITE_URL"] as string | undefined) ?? "https://waypoint-travel.vercel.app";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      // theme-color is set by THEME_BOOT_SCRIPT (it follows the in-app theme, not just the OS).
      { name: "apple-mobile-web-app-title", content: "Waypoint" },
      { name: "application-name", content: "Waypoint" },
      { property: "og:site_name", content: "Waypoint" },
      { property: "og:image", content: `${SITE_URL}/og-image.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Waypoint: plan a trip around your budget." },
      { name: "twitter:image", content: `${SITE_URL}/og-image.png` },
      { title: "Waypoint | Trip planning around your budget" },
      {
        name: "description",
        content:
          "Describe a trip in a sentence. Waypoint estimates the cost, plans each day and lists what to book.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      // The one face, fetched early so the headline never swaps late.
      ...[inter].map((href) => ({
        rel: "preload",
        href,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous" as const,
      })),
      // Photos and their lookups come from Wikipedia and Wikimedia: open those connections early.
      { rel: "preconnect", href: "https://en.wikipedia.org", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://thumb.wikimedia.org" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppShell>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </AppShell>
      </AuthProvider>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
