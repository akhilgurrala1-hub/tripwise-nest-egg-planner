import { useEffect, useRef, useState } from "react";

import type { RealRoute, RouteStop } from "@/lib/routing/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    __waypointMapsReady?: () => void;
    google?: any;
  }
}

let loader: Promise<void> | null = null;

function loadMaps(): Promise<void> {
  if (window.google?.maps?.geometry) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    window.__waypointMapsReady = () => resolve();
    const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
    const channel = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"];
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&libraries=geometry&callback=__waypointMapsReady&channel=${channel}`;
    s.async = true;
    s.onerror = () => {
      loader = null;
      reject(new Error("Map failed to load"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function RealRouteMap({
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
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const markers = useRef<any[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Map + route line
  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !el.current) return;
        const g = window.google;
        if (!map.current) {
          map.current = new g.maps.Map(el.current, {
            clickableIcons: false,
            disableDefaultUI: true,
            zoomControl: true,
            styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
          });
        }
        overlays.current.forEach((o) => o.setMap(null));
        const path = g.maps.geometry.encoding.decodePath(route.encodedPolyline);
        const line = new g.maps.Polyline({
          path,
          map: map.current,
          strokeColor: cssColor("--sunset", "#e07a3a"),
          strokeWeight: 5,
          strokeOpacity: 0.9,
        });
        const start = new g.maps.Marker({ position: route.start, map: map.current, label: "A", title: "Start" });
        const end = new g.maps.Marker({ position: route.end, map: map.current, label: "B", title: "Destination" });
        overlays.current = [line, start, end];
        const bounds = new g.maps.LatLngBounds();
        path.forEach((p: unknown) => bounds.extend(p));
        map.current.fitBounds(bounds, 32);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [route]);

  // Stop markers
  useEffect(() => {
    if (status !== "ready" || !map.current) return;
    const g = window.google;
    markers.current.forEach((m) => m.setMap(null));
    const on = cssColor("--success", "#2f9e6e");
    const off = cssColor("--card", "#ffffff");
    const stroke = cssColor("--primary", "#245d66");
    markers.current = stops
      .filter((s) => s.location)
      .map((s) => {
        const included = includedIds.has(s.id);
        const m = new g.maps.Marker({
          position: s.location,
          map: map.current,
          title: s.name,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: included ? 8 : 6,
            fillColor: included ? on : off,
            fillOpacity: 1,
            strokeColor: included ? on : stroke,
            strokeWeight: 2,
          },
        });
        m.addListener("click", () => onSelect(s.id));
        return m;
      });
  }, [status, stops, includedIds, onSelect]);

  return (
    <div className="relative h-80 overflow-hidden rounded-2xl border border-border bg-muted">
      <div ref={el} className="absolute inset-0" />
      {status !== "ready" && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-muted-foreground">
          {status === "loading" ? "Loading map…" : "The map couldn't load here. Stops and drive times below still work."}
        </div>
      )}
    </div>
  );
}
