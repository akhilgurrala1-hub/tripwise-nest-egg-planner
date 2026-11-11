import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** The type scale's levels (styles.css). */
export const TYPE_LEVELS = [
  "display",
  "large-title",
  "title-1",
  "title-2",
  "stat",
  "headline",
  "body",
  "footnote",
  "caption",
  "micro",
] as const;

// tailwind-merge must know the type levels are font sizes: otherwise it reads
// `text-headline` as a color and drops the real color (`text-go-foreground`).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TYPE_LEVELS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
