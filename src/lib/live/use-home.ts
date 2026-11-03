import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { usePreferences } from "../account";
import { currentTrip, tripActions } from "../trip-store";
import {
  devicePosition,
  readDevicePlace,
  reverseGeocode,
  saveDevicePlace,
  type HomePlace,
} from "./location";
import { getVisitorLocation } from "./location.functions";
import { geocodeQuery, useHydrated } from "./use-live";

/**
 * Where this traveler starts from: their profile's home city, else the place
 * their device reported (after they asked), else the approximate city of their
 * connection. `locate()` asks the device and remembers the answer.
 */
export function useHomePlace() {
  const hydrated = useHydrated();
  const prefs = usePreferences();
  const homeCity = prefs?.home_city?.trim() ?? "";
  const [device, setDevice] = useState<HomePlace | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (hydrated) setDevice(readDevicePlace());
  }, [hydrated]);

  const profile = useQuery({
    ...geocodeQuery(homeCity),
    enabled: hydrated && homeCity.length >= 2,
  });
  const approx = useQuery({
    queryKey: ["live", "visitor-location"],
    queryFn: () => getVisitorLocation(),
    enabled: hydrated && !device && !homeCity,
    staleTime: Infinity,
    retry: false,
  });

  const fromProfile: HomePlace | null = profile.data?.[0]
    ? { label: homeCity, lat: profile.data[0].lat, lon: profile.data[0].lon, source: "profile" }
    : null;
  const place = fromProfile ?? device ?? approx.data ?? null;

  const locate = async (): Promise<HomePlace> => {
    setLocating(true);
    try {
      const point = await devicePosition();
      const label =
        (await reverseGeocode(point).catch(() => null)) ??
        `${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}`;
      const p: HomePlace = { ...point, label, source: "device" };
      saveDevicePlace(p);
      setDevice(p);
      return p;
    } finally {
      setLocating(false);
    }
  };

  return { place, locate, locating };
}

/** Once we know where the traveler is, the untouched sample trip starts from there, to a place nearby. */
export function usePersonalizedSample() {
  const { place } = useHomePlace();
  useEffect(() => {
    if (place && currentTrip().isSample) tripActions.personalizeSample(place);
  }, [place]);
}
