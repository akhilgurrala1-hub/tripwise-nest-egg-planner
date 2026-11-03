/**
 * Decorative line art in the brand's language: a route drawn from a hollow origin
 * ring to the coral destination dot (the logo's motif) over quiet map contours.
 * Inline SVG (no requests, crisp at any size), theme-aware through tokens, and
 * aria-hidden because it carries no information.
 */
import { useId } from "react";

import { cn } from "@/lib/utils";

const CONTOURS = [
  "M-20 150 C 40 120, 90 160, 150 135 S 260 95, 380 120",
  "M-20 175 C 50 150, 100 185, 170 160 S 280 125, 380 148",
  "M-20 125 C 30 95, 80 130, 140 108 S 250 65, 380 92",
  "M-20 98 C 35 72, 85 100, 135 82 S 245 40, 380 64",
  "M-20 200 C 60 180, 120 210, 190 188 S 300 158, 380 176",
];

/** A wide map panel with the route, for page headers. */
export function RouteMap({ className }: { className?: string }) {
  const id = useId();
  const clip = `${id}-clip`;
  const grid = `${id}-grid`;
  const route = "M54 168 C 92 150, 104 108, 146 104 S 204 132, 236 106 S 270 58, 304 54";
  return (
    <svg
      viewBox="0 0 360 220"
      aria-hidden
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      <defs>
        <clipPath id={clip}>
          <rect width="360" height="220" rx="16" />
        </clipPath>
        <pattern id={grid} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="var(--border)" strokeWidth="1" />
        </pattern>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="360" height="220" fill="var(--card)" />
        <rect width="360" height="220" fill={`url(#${grid})`} opacity="0.55" />
        <g fill="none" stroke="var(--muted-foreground)" strokeWidth="1" opacity="0.18">
          {CONTOURS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {/* A river, as a map would show it */}
        <path
          d="M200 230 C 196 196, 222 182, 214 150 S 236 112, 262 104"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          opacity="0.12"
          strokeLinecap="round"
        />

        {/* The route */}
        <path
          d={route}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="6"
          opacity="0.1"
          strokeLinecap="round"
        />
        <path
          d={route}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeDasharray="1 7"
          strokeLinecap="round"
        />
        {/* Stops along the way */}
        {[
          [146, 104],
          [236, 106],
        ].map(([x, y]) => (
          <circle
            key={`${x}`}
            cx={x}
            cy={y}
            r="3.5"
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth="1.5"
          />
        ))}
        {/* Origin ring and destination dot, as in the logo */}
        <circle cx="54" cy="168" r="7" fill="var(--card)" stroke="var(--primary)" strokeWidth="3" />
        <circle cx="304" cy="54" r="16" fill="var(--brand-coral)" opacity="0.14" />
        <circle cx="304" cy="54" r="7.5" fill="var(--brand-coral)" />
      </g>
      <rect x="0.5" y="0.5" width="359" height="219" rx="15.5" fill="none" stroke="var(--border)" />
    </svg>
  );
}

/** A compact square version, for cards and banners. */
export function RouteMark({ className }: { className?: string }) {
  const route = "M18 62 C 30 50, 30 36, 44 34 S 60 24, 64 16";
  return (
    <svg
      viewBox="0 0 80 80"
      aria-hidden
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      <rect
        x="0.5"
        y="0.5"
        width="79"
        height="79"
        rx="14"
        fill="var(--card)"
        stroke="var(--border)"
      />
      <g fill="none" stroke="var(--muted-foreground)" strokeWidth="0.8" opacity="0.2">
        <path d="M-4 54 C 16 44, 30 58, 50 48 S 72 36, 84 40" />
        <path d="M-4 36 C 14 26, 30 40, 48 30 S 70 18, 84 22" />
      </g>
      <path
        d={route}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.8"
        strokeDasharray="1 5"
        strokeLinecap="round"
      />
      <circle
        cx="18"
        cy="62"
        r="4.5"
        fill="var(--card)"
        stroke="var(--primary)"
        strokeWidth="2.2"
      />
      <circle cx="64" cy="16" r="9" fill="var(--brand-coral)" opacity="0.15" />
      <circle cx="64" cy="16" r="4.5" fill="var(--brand-coral)" />
    </svg>
  );
}
