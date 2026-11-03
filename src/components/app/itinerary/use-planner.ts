import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createAiItinerary } from "@/lib/ai-itinerary.functions";
import { usePreferences } from "@/lib/account";
import { INTERESTS, TRAVEL_STYLES, TRIP_TYPES } from "@/lib/demo-data";
import { addDays, buildRealItinerary, fromAiPlan } from "@/lib/itinerary";
import { destinationQuery } from "@/lib/live/place";
import { useTripWeather } from "@/lib/live/use-live";
import { getDestinationPlaces } from "@/lib/places/destination-places.functions";
import type { DestinationPlacesResult } from "@/lib/places/types";
import { currentTrip, planKey, tripActions, useTrip } from "@/lib/trip-store";

/** The AI planner usually answers in 15–40s; past this we stop waiting and keep the current plan. */
export const AI_TIMEOUT_MS = 90_000;
const PLACES_TIMEOUT_MS = 30_000;

/** Map lookups are billed, so identical searches in one session reuse the first answer. */
const placesCache = new Map<string, DestinationPlacesResult>();

export type PlannerJob = "ai" | "places" | null;

const label = (list: readonly { id: string; label: string }[], id: string) =>
  list.find((x) => x.id === id)?.label ?? id;

/** Toast detail when rebuilding a plan kept the traveler's own stops. */
export function keptNote(kept: number) {
  return kept > 0
    ? { description: `Kept ${kept} stop${kept === 1 ? "" : "s"} you added or edited.` }
    : undefined;
}

/**
 * Builds plans from the AI planner or real places. One job at a time; each can be
 * cancelled, times out, offers a retry, and never replaces the current plan unless
 * it succeeds for the same trip it was asked about (see `planKey`).
 */
export function usePlanner() {
  const { trip, dest, shape, totals } = useTrip();
  const prefs = usePreferences();
  const weather = useTripWeather();
  const [job, setJob] = useState<PlannerJob>(null);
  const controller = useRef<AbortController | null>(null);

  // Leaving the page cancels whatever is still running.
  useEffect(() => () => controller.current?.abort(), []);

  const start = (kind: Exclude<PlannerJob, null>, timeoutMs: number) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
    setJob(kind);
    return {
      ctrl,
      done: () => {
        clearTimeout(timer);
        if (controller.current === ctrl) {
          controller.current = null;
          setJob(null);
        }
      },
    };
  };

  /** Apply a finished plan only if the trip is still the one it was made for. */
  const land = (apply: () => number | null, success: string) => {
    const kept = apply();
    if (kept === null) {
      toast("Your trip changed while we were planning", {
        description: "That plan was for different dates or a different place, so we didn't use it.",
      });
      return;
    }
    toast.success(success, keptNote(kept));
  };

  const failed = (ctrl: AbortController, message: string, retry: () => void) => {
    if (ctrl.signal.aborted && ctrl.signal.reason !== "timeout") return; // cancelled on purpose
    toast.error(
      ctrl.signal.reason === "timeout"
        ? "That took too long, so we stopped. Your current plan is unchanged."
        : message,
      { action: { label: "Try again", onClick: retry } },
    );
  };

  const planWithAi = async () => {
    const key = planKey(currentTrip());
    const { ctrl, done } = start("ai", AI_TIMEOUT_MS);
    const days = Math.min(14, shape.days);
    try {
      const res = await createAiItinerary({
        signal: ctrl.signal,
        data: {
          destination: destinationQuery(dest, trip.setup.origin, prefs?.home_city),
          region: "",
          origin: trip.setup.origin,
          tripType: label(TRIP_TYPES, trip.setup.tripType),
          style: label(TRAVEL_STYLES, trip.setup.style),
          days,
          startDate: trip.setup.startDate,
          travelers: shape.travelers,
          interests: trip.setup.interests.map((i) => label(INTERESTS, i)),
          activityBudgetPerPerson: totals.categories.activities / shape.travelers,
          foodBudgetPerPersonDay: totals.categories.food / shape.travelers / shape.days,
          weather: Array.from({ length: days }, (_, i) => {
            const w = weather.byDate.get(addDays(trip.setup.startDate, i));
            if (!w) return "";
            const rain = w.precipChance !== null ? `, ${w.precipChance}% chance of rain` : "";
            return `Day ${i + 1}: ${w.label}, high ${w.highF}°F, low ${w.lowF}°F${rain} (${w.source === "forecast" ? "forecast" : "typical for the date"})`;
          }).filter(Boolean),
        },
      });
      if (ctrl.signal.aborted) return failed(ctrl, "", planWithAi);
      if (!res.ok) {
        toast.error(res.error, { action: { label: "Try again", onClick: planWithAi } });
        return;
      }
      land(
        () =>
          tripActions.setItineraryFor(key, fromAiPlan(res.itinerary, trip.setup.startDate, days)),
        "Plan ready — double-check details before you go",
      );
    } catch {
      failed(ctrl, "Couldn't reach the AI planner. Your current plan is unchanged.", planWithAi);
    } finally {
      done();
    }
  };

  const planWithRealPlaces = async () => {
    const key = planKey(currentTrip());
    const request = {
      destination: destinationQuery(dest, trip.setup.origin, prefs?.home_city),
      interests: trip.setup.interests,
      style: trip.setup.style,
    };
    const cacheKey = JSON.stringify(request);
    const { ctrl, done } = start("places", PLACES_TIMEOUT_MS);
    try {
      let res = placesCache.get(cacheKey);
      if (!res) {
        res = await getDestinationPlaces({ data: request, signal: ctrl.signal });
        if (res.ok) placesCache.set(cacheKey, res);
      }
      if (ctrl.signal.aborted) return failed(ctrl, "", planWithRealPlaces);
      if (!res.ok) {
        toast.error(res.error, { action: { label: "Try again", onClick: planWithRealPlaces } });
        return;
      }
      const places = res;
      land(
        () =>
          tripActions.setItineraryFor(
            key,
            buildRealItinerary({
              sights: places.sights,
              restaurants: places.restaurants,
              destName: dest.name,
              days: Math.min(14, shape.days),
              startDate: trip.setup.startDate,
              interests: trip.setup.interests,
              tripType: trip.setup.tripType,
            }),
          ),
        "Itinerary built from real places on Google Maps",
      );
    } catch {
      failed(
        ctrl,
        "Couldn't reach the map service. Your current plan is unchanged.",
        planWithRealPlaces,
      );
    } finally {
      done();
    }
  };

  const cancel = () => {
    controller.current?.abort("cancelled");
    controller.current = null;
    setJob(null);
    toast("Stopped. Your current plan is unchanged.");
  };

  return { job, busy: job !== null, planWithAi, planWithRealPlaces, cancel };
}
