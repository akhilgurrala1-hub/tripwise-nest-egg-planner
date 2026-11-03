import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import {
  countryFromLocale,
  currencyForCountry,
  fetchUsdRate,
  unitsForCountry,
  type Units,
} from "../locale";
import { useHomePlace } from "./use-home";
import { useHydrated } from "./use-live";

export interface LocalePrefs {
  units: Units | "auto";
  currency: string;
}

const KEY = "waypoint.locale";
const DEFAULTS: LocalePrefs = { units: "auto", currency: "auto" };
let prefs: LocalePrefs | null = null;
const listeners = new Set<() => void>();

function read(): LocalePrefs {
  if (prefs) return prefs;
  try {
    const raw = window.localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<LocalePrefs>) : {};
    prefs = {
      units: p.units === "metric" || p.units === "imperial" ? p.units : "auto",
      currency:
        typeof p.currency === "string" && /^[A-Z]{3}$|^auto$/.test(p.currency)
          ? p.currency
          : "auto",
    };
  } catch {
    prefs = DEFAULTS;
  }
  return prefs;
}

export function setLocalePrefs(patch: Partial<LocalePrefs>) {
  prefs = { ...read(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Units and display currency for this traveler: their choice, or worked out from
 * where they are (home place, else the browser's locale). The server render and
 * first client render use °F, miles and US dollars so hydration matches.
 */
export function useLocale() {
  const hydrated = useHydrated();
  const p = useSyncExternalStore(subscribe, read, () => DEFAULTS);
  const { place } = useHomePlace();
  const country = hydrated
    ? (place?.country ??
      countryFromLocale(typeof navigator !== "undefined" ? navigator.language : ""))
    : null;
  const autoUnits = unitsForCountry(country);
  const autoCurrency = currencyForCountry(country);
  return {
    units: hydrated ? (p.units === "auto" ? autoUnits : p.units) : ("imperial" as Units),
    currency: hydrated ? (p.currency === "auto" ? autoCurrency : p.currency) : "USD",
    prefs: p,
    autoUnits,
    autoCurrency,
  };
}

/** Today's rate from US dollars to the display currency (null while loading, unavailable or USD). */
export function useUsdRate(currency: string) {
  const hydrated = useHydrated();
  const q = useQuery({
    queryKey: ["live", "fx", currency],
    queryFn: ({ signal }) => fetchUsdRate(currency, signal),
    enabled: hydrated && currency !== "USD",
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });
  return currency === "USD" ? null : (q.data ?? null);
}
