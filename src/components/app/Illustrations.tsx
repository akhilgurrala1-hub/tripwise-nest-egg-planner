/**
 * Spot illustrations: flat, colorful scenes that give pages some life. Purely
 * decorative (aria-hidden), inline SVG so they cost no requests and stay crisp.
 * Fixed colors are mid-tones that read on light and dark; the sky follows the theme.
 */
import { useId } from "react";

import { cn } from "@/lib/utils";

const C = {
  blue: "#2457E6",
  blueDeep: "#1A3FB0",
  coral: "#FF6B4A",
  sun: "#FFC145",
  hillFar: "#9AD1C2",
  hillMid: "#5DBB8A",
  hillNear: "#3E9E6E",
  tree: "#2F7D57",
  road: "#3B3F4A",
  cloud: "#FFFFFF",
};

/** A road winding through hills to a destination pin, with a plane overhead and a packed bag. */
export function TripScenery({ className }: { className?: string }) {
  const clip = useId();
  return (
    <svg
      viewBox="0 0 360 200"
      aria-hidden
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      <defs>
        <clipPath id={clip}>
          <rect x="0" y="0" width="360" height="200" rx="20" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="360" height="200" fill="var(--art-sky)" />
        <circle cx="292" cy="56" r="24" fill={C.sun} />
        <circle cx="292" cy="56" r="34" fill={C.sun} opacity="0.18" />
        <g fill={C.cloud} opacity="0.92">
          <rect x="58" y="40" width="58" height="14" rx="7" />
          <rect x="72" y="30" width="30" height="16" rx="8" />
          <rect x="196" y="70" width="44" height="11" rx="5.5" />
        </g>

        {/* Plane on a dotted path */}
        <path
          d="M24 118 C 90 64, 170 40, 238 30"
          fill="none"
          stroke={C.blue}
          strokeWidth="2"
          strokeDasharray="3 7"
          strokeLinecap="round"
          opacity="0.6"
        />
        <g transform="translate(246 28) rotate(-14)" fill={C.blue}>
          <path d="M-16 0 Q-16 -3 -12 -3 L12 -3 Q18 -2 19 0 Q18 2 12 3 L-12 3 Q-16 3 -16 0 Z" />
          <path d="M-2 -2 L-10 -14 L-5 -14 L6 -2 Z" />
          <path d="M-2 2 L-10 14 L-5 14 L6 2 Z" />
          <path d="M-13 -1 L-17 -8 L-13.5 -8 L-9 -1 Z" />
        </g>

        {/* Hills */}
        <path
          d="M0 150 L70 86 L118 126 L182 70 L250 136 L304 100 L360 140 V200 H0 Z"
          fill={C.hillFar}
        />
        <path d="M182 70 L200 87 L190 92 L182 84 L172 94 L163 88 Z" fill={C.cloud} opacity="0.85" />
        <path
          d="M0 170 C 70 140, 130 150, 200 160 C 260 168, 300 150, 360 156 V200 H0 Z"
          fill={C.hillMid}
        />
        <path d="M0 188 C 90 172, 200 182, 360 176 V200 H0 Z" fill={C.hillNear} />

        {/* Trees */}
        <g fill={C.tree}>
          <path d="M300 160 l8 -22 l8 22 z" />
          <path d="M314 162 l6 -16 l6 16 z" />
          <path d="M96 168 l7 -19 l7 19 z" />
        </g>

        {/* Road to the destination */}
        <path
          d="M128 204 C 150 180, 214 182, 232 166 C 248 152, 236 146, 252 138"
          fill="none"
          stroke={C.road}
          strokeWidth="13"
          strokeLinecap="round"
        />
        <path
          d="M128 204 C 150 180, 214 182, 232 166 C 248 152, 236 146, 252 138"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeDasharray="5 6"
          opacity="0.85"
        />

        {/* Car */}
        <g transform="translate(180 158)">
          <path d="M3 8 L9 1 H23 L29 8 Z" fill={C.coral} />
          <rect x="0" y="7" width="34" height="11" rx="4" fill={C.coral} />
          <path d="M11 3 H17 V8 H8 Z M19 3 H22 L26 8 H19 Z" fill="#fff" opacity="0.85" />
          <circle cx="8" cy="18.5" r="3.6" fill={C.road} />
          <circle cx="26" cy="18.5" r="3.6" fill={C.road} />
        </g>

        {/* Destination pin */}
        <g transform="translate(254 104)">
          <ellipse cx="0" cy="32" rx="9" ry="2.6" fill="#000" opacity="0.12" />
          <path
            d="M0 30 C -10 18, -13 12, -13 5 A 13 13 0 0 1 13 5 C 13 12, 10 18, 0 30 Z"
            fill={C.coral}
          />
          <circle cx="0" cy="5" r="4.8" fill="#fff" />
        </g>

        {/* Suitcase */}
        <g transform="translate(30 132)">
          <rect
            x="13"
            y="0"
            width="18"
            height="11"
            rx="4"
            fill="none"
            stroke={C.blueDeep}
            strokeWidth="3.5"
          />
          <rect x="0" y="8" width="44" height="36" rx="7" fill={C.blue} />
          <rect x="0" y="20" width="44" height="5" fill={C.sun} />
          <rect x="9" y="8" width="3" height="36" fill={C.blueDeep} opacity="0.5" />
          <rect x="32" y="8" width="3" height="36" fill={C.blueDeep} opacity="0.5" />
        </g>
      </g>
    </svg>
  );
}

/** A folded map with a dotted route from a ring to a pin, and a compass. */
export function MapArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 170 120"
      aria-hidden
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      <g transform="translate(8 14)">
        <path d="M0 8 L40 0 V84 L0 92 Z" fill="#CFE0FF" />
        <path d="M40 0 L80 8 V92 L40 84 Z" fill="#BFE6D3" />
        <path d="M80 8 L120 0 V84 L80 92 Z" fill="#CFE0FF" />
        <path d="M40 0 L80 8 V92 L40 84 Z" fill="#000" opacity="0.05" />
        <path
          d="M8 44 C 18 30, 30 38, 34 46"
          fill="none"
          stroke="#7FB3F0"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M86 64 C 96 56, 108 60, 114 54"
          fill="none"
          stroke="#7FB3F0"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M16 72 C 30 46, 58 74, 70 48 S 96 28, 102 20"
          fill="none"
          stroke={C.coral}
          strokeWidth="2.5"
          strokeDasharray="1 6"
          strokeLinecap="round"
        />
        <circle cx="16" cy="72" r="5" fill="#fff" stroke={C.blue} strokeWidth="3" />
        <g transform="translate(102 2)">
          <path
            d="M0 20 C -7 12, -9 8, -9 3.5 A 9 9 0 0 1 9 3.5 C 9 8, 7 12, 0 20 Z"
            fill={C.coral}
          />
          <circle cx="0" cy="3.5" r="3.2" fill="#fff" />
        </g>
      </g>
      <g transform="translate(146 92)">
        <circle r="17" fill={C.sun} />
        <circle r="12" fill="#fff" />
        <path d="M0 -10 L3.5 0 L0 10 L-3.5 0 Z" fill={C.coral} />
        <path d="M0 0 L3.5 0 L0 10 L-3.5 0 Z" fill={C.road} />
      </g>
    </svg>
  );
}
