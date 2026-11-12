import { useEffect, useRef, useState } from "react";

import { loadMapLibre, STYLE } from "@/components/app/OpenRouteMap";
import type { ItineraryItem } from "@/lib/itinerary";

/**
 * One day's stops as numbered pins (visit order), on OpenFreeMap's free tiles. Only stops with
 * published coordinates are drawn, and no road is drawn between them: the order is the
 * numbers, and travel times in the list are labeled estimates. Pins and list rows select
 * each other.
 */
export function DayMap({
  stops,
  selectedId,
  onSelect,
}: {
  /** The day's stops that have coordinates, in visit order */
  stops: ItineraryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const pins = useRef(new Map<string, HTMLButtonElement>());
  const map = useRef<import("maplibre-gl").Map | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const key = stops.map((s) => `${s.id}:${s.lat},${s.lon}`).join("|");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    pins.current.clear();
    loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !el.current || stops.length === 0) return;
        const dark = document.documentElement.classList.contains("dark");
        const bounds = new maplibre.LngLatBounds();
        for (const s of stops) bounds.extend([s.lon!, s.lat!]);
        const m = new maplibre.Map({
          container: el.current,
          style: dark ? STYLE.dark : STYLE.light,
          bounds,
          fitBoundsOptions: { padding: 48, maxZoom: 15 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
        });
        map.current = m;
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        m.on("error", () => !cancelled && !m.loaded() && setStatus("error"));
        stops.forEach((s, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = String(i + 1);
          b.setAttribute("aria-label", `Stop ${i + 1}: ${s.name}`);
          b.className =
            "grid size-8 place-items-center rounded-full border-2 border-white bg-primary text-footnote font-semibold text-primary-foreground shadow";
          b.addEventListener("click", () => select.current(s.id));
          pins.current.set(s.id, b);
          new maplibre.Marker({ element: b }).setLngLat([s.lon!, s.lat!]).addTo(m);
        });
        m.on("load", () => !cancelled && setStatus("ready"));
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // The stops are compared by their ids and places, not by array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The selected pin grows and the map moves to it.
  useEffect(() => {
    for (const [id, b] of pins.current) {
      const on = id === selectedId;
      b.style.scale = on ? "1.25" : "";
      b.style.zIndex = on ? "2" : "";
      b.style.outline = on ? "3px solid var(--ring)" : "";
    }
    const s = stops.find((x) => x.id === selectedId);
    if (s && map.current) map.current.easeTo({ center: [s.lon!, s.lat!], duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, status]);

  return (
    <div className="relative h-72 overflow-hidden rounded-lg bg-fill">
      <div ref={el} className="h-full w-full" role="region" aria-label="Map of this day's stops" />
      {status !== "ready" && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-footnote text-muted-foreground">
          {status === "loading"
            ? "Loading map…"
            : "The map couldn't load here. The list still works."}
        </div>
      )}
    </div>
  );
}
