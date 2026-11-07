import { cn } from "@/lib/utils";

/**
 * The Waypoint mark: a route drawn as a "W", leaving a hollow origin ring and
 * arriving at a coral destination dot, on a brand-blue tile. Geometry lives on a
 * 32-unit grid and matches public/favicon.svg exactly; keep the two in step.
 * Brand colors are fixed (not theme tokens) so the mark looks the same everywhere.
 */
export const BRAND = { blue: "#2457E6", coral: "#FF6B4A", white: "#FFFFFF" } as const;
export const ROUTE_PATH =
  "M7.2 11.6 C9.1 17.4 10.1 22 11.8 22 C13.5 22 14.4 14.3 16 14.3 C17.6 14.3 18.5 22 20.2 22 C21.9 22 22.9 17.4 24.8 11.6";

export function LogoMark({
  className,
  title,
  loading,
}: {
  className?: string;
  title?: string;
  /** Loops the route drawing, as a branded progress indicator */
  loading?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("logo-mark shrink-0", loading && "is-loading", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect className="logo-tile" width="32" height="32" rx="8" fill={BRAND.blue} />
      <path
        className="logo-route"
        d={ROUTE_PATH}
        fill="none"
        stroke={BRAND.white}
        strokeWidth="2.7"
        strokeLinecap="round"
        pathLength={100}
      />
      <circle
        className="logo-origin"
        cx="7.2"
        cy="11.2"
        r="2.25"
        fill={BRAND.blue}
        stroke={BRAND.white}
        strokeWidth="1.7"
      />
      <circle
        className="logo-ripple"
        cx="24.8"
        cy="11.2"
        r="3.1"
        fill="none"
        stroke={BRAND.coral}
        strokeWidth="1.2"
      />
      <circle
        className="logo-dest"
        cx="24.8"
        cy="11.2"
        r="3.1"
        fill={BRAND.coral}
        stroke={BRAND.blue}
        strokeWidth="1.2"
      />
    </svg>
  );
}

/** Mark + wordmark lockup. The wordmark is set in the app face, semibold. */
export function Logo({
  className,
  markClassName,
  wordClassName,
}: {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
}) {
  return (
    <span className={cn("logo inline-flex items-center gap-2", className)}>
      <LogoMark className={cn("size-7", markClassName)} />
      <span className={cn("logo-word text-headline font-semibold text-foreground", wordClassName)}>
        Waypoint
      </span>
    </span>
  );
}
