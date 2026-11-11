import { cn } from "@/lib/utils";

/**
 * The Waypoint mark: a ring holding one route, from a hollow origin to a coral
 * destination dot. Geometry lives on a 32-unit grid and matches public/favicon.svg
 * (which sets it on a dark tile); keep the two in step. The ring and route follow the
 * text color, the dot is the brand coral, so it reads on dark and on cream paper.
 */
export const BRAND = { coral: "#E0602F", ink: "#F6F1E7", ground: "#0F1A33" } as const;
export const ROUTE_PATH = "M9.4 20.2 L14.1 12.9 L17.6 17.9 L22.6 10.7";

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
      <circle
        className="logo-tile"
        cx="16"
        cy="16"
        r="14.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        className="logo-route"
        d={ROUTE_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
      />
      <circle
        className="logo-origin"
        cx="9.4"
        cy="20.2"
        r="1.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle
        className="logo-ripple"
        cx="22.6"
        cy="10.7"
        r="2.4"
        fill="none"
        stroke={BRAND.coral}
        strokeWidth="1"
      />
      <circle className="logo-dest" cx="22.6" cy="10.7" r="2.4" fill={BRAND.coral} />
    </svg>
  );
}

/** Mark + wordmark lockup: the name in Fraunces. */
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
    <span className={cn("logo inline-flex items-center gap-4 text-foreground", className)}>
      <LogoMark className={cn("size-7", markClassName)} />
      <span className="flex flex-col leading-none">
        <span className={cn("logo-word font-display font-normal", wordClassName)}>Waypoint</span>
      </span>
    </span>
  );
}
