import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createAiItinerary } from "@/lib/ai-itinerary.functions";
import { usePreferences } from "@/lib/account";
import { INTERESTS, TRAVEL_STYLES, TRIP_TYPES } from "@/lib/demo-data";
import { cleanAiPlan, groundedCount, mergePlaces, placeLines, planLines } from "@/lib/ai-quality";
import { inclusiveDays } from "@/lib/dates";
import { addDays, buildRealItinerary } from "@/lib/itinerary";
import { destinationQuery } from "@/lib/live/place";
import { useTripWeather } from "@/lib/live/use-live";
import { getDestinationPlaces } from "@/lib/places/destination-places.functions";
import { fetchLandmarks, fetchRestaurants } from "@/lib/live/open-data";
import type { GuideTip } from "@/lib/live/travel-guide";
import {
  destinationPoint,
  travelGuideQuery,
  useTripCountry,
  useTripHolidays,
} from "@/lib/live/use-open-data";
import type { DestinationPlacesResult, RealPlace } from "@/lib/places/types";
import { currentTrip, planKey, tripActions, useTrip } from "@/lib/trip-store";

/** The AI planner usually answers in 15–40s; past this we stop waiting and keep the current plan. */
export const AI_TIMEOUT_MS = 90_000;
const PLACES_TIMEOUT_MS = 30_000;

/** Map lookups are billed, so identical searches in one session reuse the first answer. */
const placesCache = new Map<string, DestinationPlacesResult>();
/** Open-data lookups are free but shared services, so they're reused too. */
interface NearbyPlaces {
  sights: RealPlace[];
  restaurants: RealPlace[];
  /** How many of them came from the travel guide */
  guided: number;
  tips: GuideTip[];
}
const openCache = new Map<string, NearbyPlaces>();

export type PlannerJob = "ai" | "places" | "open" | null;

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
  const queryClient = useQueryClient();
  const prefs = usePreferences();
  const weather = useTripWeather();
  const holidays = useTripHolidays();
  const country = useTripCountry();
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

  /**
   * Real places at the destination (all free), shared by the open-data plan and AI
   * grounding: the travel guide's picks first (chosen and described by travelers,
   * often with prices and hours), then Wikipedia landmarks and OpenStreetMap
   * restaurants that the guide doesn't already list.
   */
  const nearbyPlaces = async (signal: AbortSignal): Promise<NearbyPlaces | null> => {
    const [whereRes, guideRes] = await Promise.allSettled([
      destinationPoint(queryClient, dest, trip.setup.origin, trip.setup.destinationPoint),
      queryClient.fetchQuery(travelGuideQuery(dest, trip.setup.origin, country)),
    ]);
    const where = whereRes.status === "fulfilled" ? whereRes.value : null;
    const guide = guideRes.status === "fulfilled" ? guideRes.value : null;
    if (!where && !guide) return null;
    const cacheKey = `open:${where ? `${where.point.lat.toFixed(3)},${where.point.lon.toFixed(3)}` : ""}:${guide?.title ?? ""}`;
    const cached = openCache.get(cacheKey);
    if (cached) return cached;
    const [sights, restaurants] = where
      ? await Promise.allSettled([
          fetchLandmarks(where.point, where.near, signal),
          fetchRestaurants(where.point, where.near, signal),
        ])
      : [];
    const found: NearbyPlaces = {
      sights: mergePlaces(guide?.sights ?? [], sights?.status === "fulfilled" ? sights.value : []),
      restaurants: mergePlaces(
        guide?.restaurants ?? [],
        restaurants?.status === "fulfilled" ? restaurants.value : [],
      ),
      guided: (guide?.sights.length ?? 0) + (guide?.restaurants.length ?? 0),
      tips: guide?.tips ?? [],
    };
    if (found.sights.length + found.restaurants.length > 0) openCache.set(cacheKey, found);
    return found;
  };

  /**
   * Ask the AI for a plan (or, with `instructions`, for changes to the current one).
   * It's grounded in real nearby places, the weather and public holidays, and its
   * answer is checked and cleaned before it's shown.
   */
  const planWithAi = async (instructions = "") => {
    const key = planKey(currentTrip());
    const { ctrl, done } = start("ai", AI_TIMEOUT_MS);
    const days = Math.min(14, shape.days);
    try {
      // Grounding is free and best-effort: a slow lookup never holds up the plan.
      const real = await Promise.race([
        nearbyPlaces(ctrl.signal).catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ]);
      const realPlaces = real ? [...real.sights, ...real.restaurants] : [];
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
          places: real ? placeLines(real.sights, real.restaurants) : [],
          guide: real ? real.tips.map((t) => `${t.topic}: ${t.text}`) : [],
          notes: holidays.map((h) => {
            const day = inclusiveDays(trip.setup.startDate, h.date) ?? 0;
            return `Day ${day} (${h.date}) is ${h.name}, a public holiday: expect closures and crowds.`;
          }),
          instructions: instructions.trim().slice(0, 300),
          current: instructions ? planLines(trip.itinerary).slice(0, 80) : [],
        },
      });
      if (ctrl.signal.aborted) return failed(ctrl, "", () => planWithAi(instructions));
      if (!res.ok) {
        toast.error(res.error, {
          ...(res.detail ? { description: `Details: ${res.detail}` } : {}),
          action: { label: "Try again", onClick: () => planWithAi(instructions) },
        });
        return;
      }
      const plan = cleanAiPlan(res.itinerary, {
        days,
        startDate: trip.setup.startDate,
        realPlaces,
      });
      if (plan.days.every((d) => d.items.length === 0)) {
        toast.error("The AI planner sent back an empty plan. Your current plan is unchanged.", {
          action: { label: "Try again", onClick: () => planWithAi(instructions) },
        });
        return;
      }
      const grounded = groundedCount(plan);
      land(
        () => tripActions.setItineraryFor(key, plan),
        instructions
          ? "Plan updated. Double-check details before you go"
          : grounded > 0
            ? `Plan ready: ${grounded} stop${grounded === 1 ? "" : "s"} matched real places on the map`
            : "Plan ready. Double-check details before you go",
      );
    } catch {
      failed(ctrl, "Couldn't reach the AI planner. Your current plan is unchanged.", () =>
        planWithAi(instructions),
      );
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
              mealBudgetPerPersonDay: totals.categories.food / shape.travelers / shape.days,
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

  /** Real landmarks (Wikipedia) and restaurants (OpenStreetMap): free, for everyone. */
  const planWithOpenData = async () => {
    const key = planKey(currentTrip());
    const { ctrl, done } = start("open", PLACES_TIMEOUT_MS);
    try {
      const found = await nearbyPlaces(ctrl.signal);
      if (ctrl.signal.aborted) return failed(ctrl, "", planWithOpenData);
      if (!found) {
        toast.error("We couldn't find that destination on the map. Check its spelling.");
        return;
      }
      if (found.sights.length + found.restaurants.length === 0) {
        toast.error(
          "No landmarks or restaurants came back for this place. Try again in a moment.",
          {
            action: { label: "Try again", onClick: planWithOpenData },
          },
        );
        return;
      }
      land(
        () =>
          tripActions.setItineraryFor(
            key,
            buildRealItinerary({
              sights: found.sights,
              restaurants: found.restaurants,
              destName: dest.name,
              days: Math.min(14, shape.days),
              startDate: trip.setup.startDate,
              interests: trip.setup.interests,
              tripType: trip.setup.tripType,
              source: "open",
              extraTips: found.tips.map((t) => `${t.topic}: ${t.text}`),
              mealBudgetPerPersonDay: totals.categories.food / shape.travelers / shape.days,
            }),
          ),
        found.guided > 0
          ? `Built from ${found.guided} travel-guide picks plus nearby landmarks and restaurants`
          : `Built from ${found.sights.length} real landmarks and ${found.restaurants.length} restaurants nearby`,
      );
    } catch {
      failed(
        ctrl,
        "Couldn't reach the travel guide or map data. Your current plan is unchanged.",
        planWithOpenData,
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

  return { job, busy: job !== null, planWithAi, planWithRealPlaces, planWithOpenData, cancel };
}
