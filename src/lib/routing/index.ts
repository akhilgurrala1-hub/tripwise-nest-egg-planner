import type { Interest } from "../demo-data";
import { INTERESTS } from "../demo-data";
import { demoRouteProvider } from "./demo-provider";
import type { RouteProvider, RouteStop, StopTag } from "./types";

export * from "./types";

/** Swap this for a real mapping provider once one is connected. */
export function getRouteProvider(): RouteProvider {
  return demoRouteProvider;
}

export type StopFilter = "all" | StopTag;

export const STOP_FILTERS: { id: StopFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "free", label: "Free" },
  { id: "food", label: "Food" },
  { id: "sightseeing", label: "Sightseeing" },
  { id: "family", label: "Family-friendly" },
  { id: "hidden-gem", label: "Hidden gems" },
];

export function matchesFilter(stop: RouteStop, filter: StopFilter): boolean {
  if (filter === "all") return true;
  if (filter === "free") return isKnownFree(stop);
  return stop.tags.includes(filter);
}

/** Plain-language reasons a stop fits this traveler. */
export function whyItMatches(stop: RouteStop, interests: Interest[], travelers: number): string[] {
  const reasons: string[] = [];
  const matched = stop.interests.filter((i) => interests.includes(i));
  if (matched.length) {
    const labels = matched.map((m) => INTERESTS.find((x) => x.id === m)?.label.toLowerCase() ?? m);
    reasons.push(`Matches your interest in ${labels.join(" & ")}`);
  }
  if (isKnownFree(stop)) reasons.push("No entry fee — detour fuel may still apply");
  if (stop.costSource === "unknown") reasons.push("Entry price unknown — check before budgeting");
  if (stop.tags.includes("hidden-gem")) reasons.push("Off the beaten path");
  if (stop.extraMinutes <= 10) reasons.push("Quick detour");
  if (travelers >= 3 && stop.tags.includes("family"))
    reasons.push("Works well for groups & families");
  if (reasons.length === 0) reasons.push("A good break to stretch your legs");
  return reasons.slice(0, 3);
}

export function isKnownFree(stop: RouteStop): boolean {
  return stop.costSource !== "unknown" && stop.costPerPerson === 0;
}

export function rankStops(stops: RouteStop[], interests: Interest[]): RouteStop[] {
  return [...stops].sort((a, b) => {
    const score = (s: RouteStop) => s.interests.filter((i) => interests.includes(i)).length;
    return score(b) - score(a) || a.position - b.position;
  });
}
