import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createAiItinerary } from "@/lib/ai-itinerary.functions";
import { usePreferences } from "@/lib/account";
import {
  INTERESTS,
  TRAVEL_STYLES,
  TRIP_TYPES,
  buildCustomDestination,
  type DemoDestination,
} from "@/lib/demo-data";
import type { GeoPoint } from "@/lib/catalog";
import type { CityLeg } from "@/lib/multi-city";
import {
  SINGLE_REQUEST_DAYS,
  joinChunkPlans,
  planChunks,
  shareOf,
  type PlanChunk,
} from "@/lib/ai-chunks";
import { cleanAiPlan, groundedCount, mergePlaces, placeLines, planLines } from "@/lib/ai-quality";
import { coveredLabels } from "@/lib/budget";
import { inclusiveDays } from "@/lib/dates";
import { addDays, buildRealItinerary, stitchCityPlans, type Itinerary } from "@/lib/itinerary";
import { destinationQuery } from "@/lib/live/place";
import { useTripWeather } from "@/lib/live/use-live";
import { useTripAirports } from "@/lib/live/use-airports";
import { useUsdRate } from "@/lib/live/use-locale";
import { currencyForCountry } from "@/lib/locale";
import { cabinInfo } from "@/lib/demo-data";
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
/** Parts of a long trip planned at the same time. */
const PARALLEL_PARTS = 3;
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

/** "2026-12-03T16:52" → "4:52 PM" (Open-Meteo gives local time at the place). */
const clock = (iso: string) => {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};

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
  const { trip, dest, shape, totals, legs } = useTrip();
  const multi = legs.length > 1;
  /** Where each city's places are looked up: the destination itself, or a later city by name. */
  const cityTarget = (leg: CityLeg): { dest: DemoDestination; point: GeoPoint | null } =>
    leg.main
      ? { dest, point: trip.setup.destinationPoint ?? null }
      : { dest: buildCustomDestination(leg.name), point: leg.point };
  /** A real-places plan for each city, joined into the whole trip (multi-city trips). */
  const joinCities = (
    found: readonly ({ sights: RealPlace[]; restaurants: RealPlace[] } | null)[],
    source: "google" | "open",
    tips: string[] = [],
  ): Itinerary =>
    stitchCityPlans(
      legs,
      legs.map((leg, i) =>
        buildRealItinerary({
          sights: found[i]?.sights ?? [],
          restaurants: found[i]?.restaurants ?? [],
          destName: leg.name,
          days: leg.days,
          startDate: addDays(trip.setup.startDate, leg.arriveDay),
          interests: trip.setup.interests,
          tripType: trip.setup.tripType,
          source,
          mealBudgetPerPersonDay: totals.categories.food / shape.travelers / shape.days,
        }),
      ),
      shape.days,
      trip.setup.startDate,
      source,
      tips,
    );
  const queryClient = useQueryClient();
  const prefs = usePreferences();
  const weather = useTripWeather();
  const holidays = useTripHolidays();
  const country = useTripCountry();
  const air = useTripAirports(prefs?.home_airport);
  const localCurrency = currencyForCountry(country);
  const usdRate = useUsdRate(localCurrency);
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
  const nearbyPlaces = async (
    signal: AbortSignal,
    target: { dest: DemoDestination; point: GeoPoint | null } = {
      dest,
      point: trip.setup.destinationPoint ?? null,
    },
  ): Promise<NearbyPlaces | null> => {
    const [whereRes, guideRes] = await Promise.allSettled([
      destinationPoint(queryClient, target.dest, trip.setup.origin, target.point),
      queryClient.fetchQuery(travelGuideQuery(target.dest, trip.setup.origin, country)),
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

  /** Facts the AI can't know: how they travel, where they land, the money they'll use. */
  const tripFacts = (): string[] => {
    const facts: string[] = [];
    const mode = trip.setup.transportMode;
    if (mode === "flight") {
      const cabin = cabinInfo(trip.setup.cabin).label.toLowerCase();
      legs.forEach((leg, i) => {
        const a = air.airports[i + 1];
        if (a)
          facts.push(
            `Flights ${i === 0 ? "arrive" : "for " + leg.name.split(",")[0]} at ${a.code} (${a.name})${a.miles >= 5 ? `, ${a.miles} miles from ${leg.name.split(",")[0]}` : ""}; ${cabin} class. ${i === 0 ? "Day 1 starts with the arrival, so keep it light." : ""}`.trim(),
          );
      });
    } else if (mode === "car" || mode === "rental-car") {
      facts.push(
        `They drive (${mode === "car" ? "their own car" : "a rental car"}), so places outside town are fine; plan parking.`,
      );
    } else if (mode === "train" || mode === "bus") {
      facts.push(`They arrive by ${mode} and get around without a car: keep stops near transit.`);
    }
    if (localCurrency !== "USD")
      facts.push(
        `Local currency: ${localCurrency}${usdRate ? ` (about ${usdRate.toFixed(2)} ${localCurrency} per US dollar today)` : ""}. Give costs in US dollars.`,
      );
    if (shape.travelers >= 6)
      facts.push(`A group of ${shape.travelers}: prefer places that take groups or reservations.`);
    return facts;
  };

  /**
   * Ask the AI for a plan (or, with `instructions`, for changes to the current one).
   * It's grounded in real nearby places, the weather and public holidays, and its
   * answer is checked and cleaned before it's shown.
   */
  const planWithAi = async (instructions = "") => {
    const key = planKey(currentTrip());
    // Long trips are planned in parts (a few at a time), each part in one city.
    const long = shape.days > SINGLE_REQUEST_DAYS;
    const chunks: (PlanChunk | null)[] = long ? planChunks(legs, shape.days) : [null];
    const { ctrl, done } = start("ai", AI_TIMEOUT_MS * Math.ceil(chunks.length / PARALLEL_PARTS));
    if (long)
      toast.message(`Planning all ${shape.days} days in ${chunks.length} parts`, {
        description: "Long trips take a minute or two. Your current plan stays until it's done.",
      });
    try {
      // Grounding is free and best-effort: a slow lookup never holds up the plan.
      // Every city's places on a multi-city trip, each line marked with its city.
      const perCity = await Promise.race([
        Promise.all(
          legs.map((leg) => nearbyPlaces(ctrl.signal, cityTarget(leg)).catch(() => null)),
        ),
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ]);
      const real = perCity?.[0] ?? null;
      const realPlaces = (perCity ?? []).flatMap((p) => (p ? [...p.sights, ...p.restaurants] : []));
      const cityOf = (leg: CityLeg) => leg.name.split(",")[0]!.trim();
      const placeList = multi
        ? legs.flatMap((leg, i) => {
            const p = perCity?.[i];
            return p
              ? placeLines(p.sights, p.restaurants)
                  .slice(0, Math.floor(40 / legs.length))
                  .map((line) => `${cityOf(leg)}: ${line}`.slice(0, 260))
              : [];
          })
        : real
          ? placeLines(real.sights, real.restaurants)
          : [];
      const weatherLine = (dayIndex: number, n: number) => {
        const w = weather.byDate.get(addDays(trip.setup.startDate, dayIndex));
        if (!w) return "";
        const rain = w.precipChance !== null ? `, ${w.precipChance}% chance of rain` : "";
        const sunset = w.sunset ? `, sunset ${clock(w.sunset)}` : "";
        return `Day ${n}: ${w.label}, high ${w.highF}°F, low ${w.lowF}°F${rain}${sunset} (${w.source === "forecast" ? "forecast" : "typical for the date"})`.slice(
          0,
          120,
        );
      };
      const holidayLines = (from: number, days: number) =>
        holidays.flatMap((h) => {
          const day = (inclusiveDays(trip.setup.startDate, h.date) ?? 0) - from;
          return day >= 1 && day <= days
            ? [`Day ${day} (${h.date}) is ${h.name}, a public holiday: expect closures and crowds.`]
            : [];
        });
      const region = [dest.region, country && country !== "US" ? country : ""]
        .filter(Boolean)
        .join(", ")
        .slice(0, 120);
      const common = {
        origin: trip.setup.origin,
        tripType: label(TRIP_TYPES, trip.setup.tripType),
        style: label(TRAVEL_STYLES, trip.setup.style),
        travelers: shape.travelers,
        interests: trip.setup.interests.map((i) => label(INTERESTS, i)),
        foodBudgetPerPersonDay: totals.categories.food / shape.travelers / shape.days,
        covered: coveredLabels(trip.setup.coverage),
        instructions: instructions.trim().slice(0, 300),
      };

      /** The request for the whole trip (up to two weeks), or for one part of a long one. */
      const requestFor = (c: PlanChunk | null) => {
        if (!c) {
          const days = shape.days;
          return {
            ...common,
            destination: destinationQuery(dest, trip.setup.origin, prefs?.home_city),
            region,
            days,
            startDate: trip.setup.startDate,
            activityBudgetPerPerson: totals.categories.activities / shape.travelers,
            weather: Array.from({ length: days }, (_, i) => weatherLine(i, i + 1)).filter(Boolean),
            places: placeList,
            cities: multi
              ? legs.map((l) => {
                  const from = l.arriveDay + 1;
                  const to = Math.min(days, l.arriveDay + l.days);
                  const span = to > from ? `Days ${from}-${to}` : `Day ${from}`;
                  return `${span}: ${l.name}${l.arriveDay > 0 ? " (arrive on the first of these days)" : ""}`;
                })
              : [],
            // Travel-guide advice for every city (the first city's first), within the request's limits.
            guide: legs
              .flatMap((leg, i) =>
                (perCity?.[i]?.tips ?? []).map(
                  (t) => `${multi ? `${cityOf(leg)}, ` : ""}${t.topic}: ${t.text}`,
                ),
              )
              .slice(0, 4)
              .map((t) => t.slice(0, 360)),
            notes: [...holidayLines(0, days), ...tripFacts()]
              .slice(0, 10)
              .map((n) => n.slice(0, 160)),
            current: instructions ? planLines(trip.itinerary).slice(0, 80) : [],
          };
        }
        const leg = legs[c.city]!;
        const found = perCity?.[c.city];
        const k = chunks.indexOf(c);
        const part = trip.itinerary
          ? { ...trip.itinerary, days: trip.itinerary.days.slice(c.from, c.from + c.days) }
          : null;
        return {
          ...common,
          destination: leg.main
            ? destinationQuery(dest, trip.setup.origin, prefs?.home_city)
            : leg.name,
          region: leg.main ? region : "",
          days: c.days,
          startDate: addDays(trip.setup.startDate, c.from),
          activityBudgetPerPerson:
            ((totals.categories.activities / shape.travelers) * c.days) / shape.days,
          weather: Array.from({ length: c.days }, (_, i) => weatherLine(c.from + i, i + 1)).filter(
            Boolean,
          ),
          // Each part of a long stay gets its own share of the places, so parts don't repeat.
          places: found
            ? shareOf(placeLines(found.sights, found.restaurants), c.part, c.parts).slice(0, 40)
            : [],
          cities: [],
          guide: (found?.tips ?? [])
            .map((t) => `${t.topic}: ${t.text}`)
            .slice(0, 4)
            .map((t) => t.slice(0, 360)),
          notes: [
            `Part ${k + 1} of ${chunks.length} of a ${shape.days}-day trip: days ${c.from + 1}-${c.from + c.days}${multi ? ` in ${cityOf(leg)}` : ""}. Plan only these ${c.days} days (numbered from Day 1); other parts cover the rest, so use the places listed here.`,
            ...(c.travelDay
              ? [
                  `Day 1 here is the journey from ${cityOf(legs[c.city - 1]!)}: start it with a Morning "stop" item for the trip (costPerPerson 0).`,
                ]
              : []),
            ...holidayLines(c.from, c.days),
            ...(k === 0 ? tripFacts() : tripFacts().filter((f) => !/^Flights/.test(f))),
          ]
            .slice(0, 10)
            .map((n) => n.slice(0, 160)),
          current: instructions ? planLines(part).slice(0, 80) : [],
        };
      };

      // A few parts at a time: quick, without asking the AI service for too much at once.
      const results: Awaited<ReturnType<typeof createAiItinerary>>[] = [];
      for (let i = 0; i < chunks.length; i += PARALLEL_PARTS) {
        const batch = await Promise.all(
          chunks
            .slice(i, i + PARALLEL_PARTS)
            .map((c) => createAiItinerary({ signal: ctrl.signal, data: requestFor(c) })),
        );
        if (ctrl.signal.aborted) return failed(ctrl, "", () => planWithAi(instructions));
        const bad = batch.find((r) => !r.ok);
        if (bad && !bad.ok) {
          toast.error(bad.error, {
            ...(bad.detail ? { description: `Details: ${bad.detail}` } : {}),
            action: { label: "Try again", onClick: () => planWithAi(instructions) },
          });
          return;
        }
        results.push(...batch);
      }
      const plans = results.map((r, i) => {
        const c = chunks[i] ?? null;
        return cleanAiPlan(r.ok ? r.itinerary : { days: [], tips: [] }, {
          days: c ? c.days : shape.days,
          startDate: c ? addDays(trip.setup.startDate, c.from) : trip.setup.startDate,
          realPlaces,
        });
      });
      const plan = long
        ? joinChunkPlans(chunks as PlanChunk[], plans, trip.setup.startDate)
        : plans[0]!;
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
      if (multi) {
        const perCity = await Promise.all(
          legs.map(async (leg) => {
            const req = {
              ...request,
              destination: leg.main ? request.destination : leg.name,
            };
            const k = JSON.stringify(req);
            let r = placesCache.get(k);
            if (!r) {
              r = await getDestinationPlaces({ data: req, signal: ctrl.signal });
              if (r.ok) placesCache.set(k, r);
            }
            return r;
          }),
        );
        if (ctrl.signal.aborted) return failed(ctrl, "", planWithRealPlaces);
        const firstError = perCity.find((r) => !r.ok);
        if (perCity.every((r) => !r.ok)) {
          toast.error(firstError && !firstError.ok ? firstError.error : "No places came back.", {
            action: { label: "Try again", onClick: planWithRealPlaces },
          });
          return;
        }
        land(
          () =>
            tripActions.setItineraryFor(
              key,
              joinCities(
                perCity.map((r) => (r.ok ? r : null)),
                "google",
              ),
            ),
          `Itinerary built from real places in all ${legs.length} cities`,
        );
        return;
      }
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
              days: shape.days,
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
      if (multi) {
        const perCity = await Promise.all(
          legs.map((leg) => nearbyPlaces(ctrl.signal, cityTarget(leg)).catch(() => null)),
        );
        if (ctrl.signal.aborted) return failed(ctrl, "", planWithOpenData);
        const total = perCity.reduce(
          (t, p) => t + (p ? p.sights.length + p.restaurants.length : 0),
          0,
        );
        if (total === 0) {
          toast.error("No landmarks or restaurants came back for these cities. Try again soon.", {
            action: { label: "Try again", onClick: planWithOpenData },
          });
          return;
        }
        const tips = perCity.flatMap((p) => (p?.tips ?? []).map((t) => `${t.topic}: ${t.text}`));
        land(
          () => tripActions.setItineraryFor(key, joinCities(perCity, "open", tips)),
          `Built from real places in all ${legs.length} cities`,
        );
        return;
      }
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
              days: shape.days,
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
