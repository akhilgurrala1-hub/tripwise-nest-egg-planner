import { cn } from "@/lib/utils";

/**
 * The Waypoint mark: one route, a hollow origin ring, a single zigzag up and an
 * orange destination dot, on a deep teal tile. Geometry lives on a 32-unit grid
 * and matches public/favicon.svg exactly; keep the two in step. Brand colors are
 * fixed (not theme tokens) so the mark looks the same everywhere.
 */
export const BRAND = { teal: "#0B5C5A", orange: "#E0501A", white: "#FFFFFF" } as const;
export const ROUTE_PATH = "M7.4 22.4 L15 12.4 L20 20 L25.6 10.2";

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
      <rect className="logo-tile" width="32" height="32" rx="7" fill={BRAND.teal} />
      <path
        className="logo-route"
        d={ROUTE_PATH}
        fill="none"
        stroke={BRAND.white}
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
      />
      <circle
        className="logo-origin"
        cx="7.4"
        cy="22.4"
        r="2.5"
        fill={BRAND.teal}
        stroke={BRAND.white}
        strokeWidth="1.8"
      />
      <circle
        className="logo-ripple"
        cx="25.6"
        cy="10.2"
        r="3.6"
        fill="none"
        stroke={BRAND.orange}
        strokeWidth="1.2"
      />
      <circle
        className="logo-dest"
        cx="25.6"
        cy="10.2"
        r="3.6"
        fill={BRAND.orange}
        stroke={BRAND.teal}
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
