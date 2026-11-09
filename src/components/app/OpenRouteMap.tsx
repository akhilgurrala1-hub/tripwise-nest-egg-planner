import { useEffect, useRef, useState } from "react";

import type { LatLng, RealRoute, RouteStop } from "@/lib/routing/types";

/*
 * The road-trip map: MapLibre drawing OpenFreeMap's free vector tiles (no key,
 * no usage limits; OpenStreetMap data). The library and tiles load only on this
 * page, after a route is found.
 */

const BLUE = "#2457E6";
const CORAL = "#FF6B4A";
const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

type MapLib = typeof import("maplibre-gl");
type MapInstance = import("maplibre-gl").Map;

let lib: Promise<MapLib> | null = null;
function loadMapLibre(): Promise<MapLib> {
  lib ??= Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")])
    .then(([m]) => (m as unknown as { default?: MapLib }).default ?? m)
    .catch((e) => {
      lib = null;
      throw e;
    });
  return lib;
}

const lngLat = (p: LatLng): [number, number] => [p.lng, p.lat];

function stopsGeoJson(stops: RouteStop[], included: Set<string>) {
  return {
    type: "FeatureCollection" as const,
    features: stops
      .filter((s) => s.location)
      .map((s) => ({
        type: "Feature" as const,
        properties: { id: s.id, name: s.name, included: included.has(s.id) },
        geometry: { type: "Point" as const, coordinates: lngLat(s.location!) },
      })),
  };
}

export function OpenRouteMap({
  route,
  stops,
  includedIds,
  onSelect,
}: {
  route: RealRoute;
  stops: RouteStop[];
  includedIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // The map and the road, rebuilt when the route changes.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !el.current) return;
        const dark = document.documentElement.classList.contains("dark");
        const m = new maplibre.Map({
          container: el.current,
          style: dark ? STYLE.dark : STYLE.light,
          bounds: route.path.reduce(
            (b, p) => b.extend(lngLat(p)),
            new maplibre.LngLatBounds(lngLat(route.start), lngLat(route.start)),
          ),
          fitBoundsOptions: { padding: 40 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
        });
        map.current = m;
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        m.on("error", () => !cancelled && m.loaded() === false && setStatus("error"));
        m.on("load", () => {
          if (cancelled) return;
          m.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: route.path.map(lngLat) },
            },
          });
          m.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": BLUE, "line-width": 4 },
          });
          m.addSource("stops", { type: "geojson", data: stopsGeoJson([], new Set()) });
          m.addLayer({
            id: "stops",
            type: "circle",
            source: "stops",
            paint: {
              "circle-radius": ["case", ["get", "included"], 7, 5],
              "circle-color": ["case", ["get", "included"], BLUE, "#ffffff"],
              "circle-stroke-color": BLUE,
              "circle-stroke-width": 2,
            },
          });
          // The brand's route motif: a hollow ring at the start, a coral dot at the end.
          m.addSource("ends", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: { end: false },
                  geometry: { type: "Point", coordinates: lngLat(route.start) },
                },
                {
                  type: "Feature",
                  properties: { end: true },
                  geometry: { type: "Point", coordinates: lngLat(route.end) },
                },
              ],
            },
          });
          m.addLayer({
            id: "ends",
            type: "circle",
            source: "ends",
            paint: {
              "circle-radius": 8,
              "circle-color": ["case", ["get", "end"], CORAL, "#ffffff"],
              "circle-stroke-color": ["case", ["get", "end"], "#ffffff", BLUE],
              "circle-stroke-width": 3,
            },
          });
          m.on("click", "stops", (e) => {
            const id = e.features?.[0]?.properties?.["id"];
            if (typeof id === "string") select.current(id);
          });
          m.on("mouseenter", "stops", () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", "stops", () => (m.getCanvas().style.cursor = ""));
          setStatus("ready");
        });
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [route]);

  // Stops, refreshed as they're added or filtered.
  useEffect(() => {
    if (status !== "ready") return;
    const src = map.current?.getSource("stops") as
      { setData: (d: ReturnType<typeof stopsGeoJson>) => void } | undefined;
    src?.setData(stopsGeoJson(stops, includedIds));
  }, [status, stops, includedIds]);

  return (
    <div className="relative h-80 overflow-hidden rounded-2xl bg-fill">
      <div
        ref={el}
        className="absolute inset-0"
        role="region"
        aria-label="Map of your route. Each stop is also in the list."
      />
      {status !== "ready" && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-footnote text-muted-foreground">
          {status === "loading"
            ? "Loading map…"
            : "The map couldn't load here. Stops and drive times still work."}
        </div>
      )}
    </div>
  );
}
