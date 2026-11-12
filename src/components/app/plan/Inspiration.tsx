import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { useEffect, useState, type CSSProperties } from "react";

import { Photo } from "@/components/app/Photo";
import { cn } from "@/lib/utils";
import { stagger, useDragScroll } from "@/components/app/motion";
import { formatMoney } from "@/lib/budget";
import type { GeoPoint } from "@/lib/catalog";
import { getDestination, modeForTripType, tripTypeInfo, type TripType } from "@/lib/demo-data";
import { useHydrated } from "@/lib/live/use-live";
import { thumbAt } from "@/lib/live/open-data";
import { destinationSummaryOptions, useDestinationSummary } from "@/lib/live/use-open-data";
import { recommendDestinations, type Suggestion } from "@/lib/recommend";
import { TRIP_COLOR } from "@/components/app/trip-colors";
import { TRIP_ICONS } from "@/components/app/TripTypePicker";
import { estimatedSpend } from "@/lib/trip/budget-fit";
import type { TripSetup } from "@/lib/trip/types";

export interface Idea {
  s: Suggestion;
  tripType: TripType;
  cost: number;
}

/** A drive and a flight, alternating, so the row shows both kinds of trip from home. */
function inspirationIdeas(setup: TripSetup, from: GeoPoint | null, limit = 4): Idea[] {
  const kinds: TripType[] =
    setup.tripType === "cruise" || setup.tripType === "staycation"
      ? ["road-trip", "flight"]
      : setup.tripType === "flight"
        ? ["flight", "road-trip"]
        : ["road-trip", "flight"];
  const lists = kinds.map((tripType) =>
    recommendDestinations({ from, tripType, interests: setup.interests, limit }).map((s) => ({
      s,
      tripType,
    })),
  );
  const out: Idea[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < limit && i < limit * 2; i++) {
    const pick = lists[i % lists.length]![Math.floor(i / lists.length)];
    if (!pick || seen.has(pick.s.id)) continue;
    seen.add(pick.s.id);
    // What this trip would cost with their dates and group (the same estimate the plan uses).
    const cost = estimatedSpend({
      ...setup,
      destinationId: pick.s.id,
      customDestination: "",
      destinationPoint: null,
      cities: [],
      tripType: pick.tripType,
      transportMode: modeForTripType(pick.tripType, setup.transportMode),
    });
    out.push({ ...pick, cost });
  }
  return out;
}

/**
 * Places to go from where they start, with a photo, how far it is and what it would
 * cost: the real estimate for their dates and group, labeled as one.
 */
export function Inspiration({
  setup,
  from,
  fromLabel,
  nights,
  onPick,
}: {
  setup: TripSetup;
  from: GeoPoint | null;
  fromLabel: string;
  nights: number;
  onPick: (destinationId: string, tripType: TripType) => void;
}) {
  const hydrated = useHydrated();
  const candidates = inspirationIdeas(setup, from, 6);
  const photos = useQueries({
    queries: candidates.map((idea) =>
      destinationSummaryOptions(getDestination(idea.s.id), setup.origin, hydrated),
    ),
  });
  // Once every lookup is in, a place without a real photo is left out (never a blank tile),
  // unless too few have one (offline, or Wikipedia is down): then they all show with an icon.
  // Until then the row holds same-size placeholders, so nothing jumps when the cards arrive.
  const settled = photos.every((p) => !p.isPending);
  const withPhotos = candidates.filter((_, i) => photos[i]?.data?.image);
  const ideas = settled ? (withPhotos.length >= 2 ? withPhotos : candidates).slice(0, 5) : [];
  // A gallery, as on apple.com: one row you can drag, fling and page with the arrows.
  const rail = useDragScroll<HTMLUListElement>();
  const [edge, setEdge] = useState({ start: true, end: false });
  const onScroll = () => {
    const el = rail.current;
    if (!el) return;
    setEdge({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
  };
  // When the ideas change (the start city is found after load), begin at the first one again:
  // scroll snapping would otherwise follow the card it was on to its new place.
  const order = ideas.map((idea) => idea.s.id).join();
  useEffect(() => {
    const el = rail.current;
    if (el) el.scrollLeft = 0;
    setEdge({ start: true, end: false });
  }, [order, rail]);
  const page = (dir: 1 | -1) =>
    rail.current?.scrollBy({ left: dir * rail.current.clientWidth * 0.8, behavior: "smooth" });
  if (settled && !ideas.length) return null;
  return (
    <section aria-labelledby="ideas-title">
      <div>
        <h2 id="ideas-title" className="title-display text-title-1">
          Trips from {fromLabel}
        </h2>
        <p className="mt-2 text-body text-muted-foreground">
          Estimated for {setup.travelers} {setup.travelers === 1 ? "traveler" : "travelers"},{" "}
          {nights} night{nights === 1 ? "" : "s"}, starting from you.
        </p>
      </div>
      <ul
        ref={rail}
        onScroll={onScroll}
        className="-mx-6 mt-8 flex snap-x snap-mandatory scroll-px-6 gap-6 overflow-x-auto px-6 pb-2 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:-mx-12 lg:scroll-px-12 lg:px-12 [&::-webkit-scrollbar]:hidden"
      >
        {!settled &&
          [0, 1, 2].map((i) => (
            <li key={i} aria-hidden className="w-[70%] shrink-0 snap-start sm:w-64">
              <span className="skeleton block aspect-[16/9] rounded-2xl" />
              <span className="mt-4 block h-[6.25rem]" />
            </li>
          ))}
        {ideas.map((idea, i) => (
          <li key={idea.s.id} className="w-[70%] shrink-0 snap-start sm:w-64">
            <IdeaCard
              idea={idea}
              origin={setup.origin}
              style={stagger(i + 1)}
              first={i < 2}
              onPick={onPick}
            />
          </li>
        ))}
      </ul>
      {/* apple.com's gallery paddles. */}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => page(-1)}
          disabled={edge.start}
          aria-label="Previous ideas"
          className="pressable grid size-9 place-items-center rounded-full bg-fill text-foreground disabled:opacity-35"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => page(1)}
          disabled={edge.end}
          aria-label="More ideas"
          className="pressable grid size-9 place-items-center rounded-full bg-fill text-foreground disabled:opacity-35"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </section>
  );
}

function IdeaCard({
  idea,
  origin,
  style,
  first,
  onPick,
}: {
  idea: Idea;
  origin: string;
  style?: CSSProperties;
  /** One of the first cards on screen: fetched at once, not when scrolled to */
  first?: boolean;
  onPick: (destinationId: string, tripType: TripType) => void;
}) {
  const dest = getDestination(idea.s.id);
  const photo = useDestinationSummary(dest, origin).data;
  const color = TRIP_COLOR[idea.tripType];
  const Icon = TRIP_ICONS[idea.tripType];
  return (
    <button
      type="button"
      style={{ ...style, "--kind": color } as CSSProperties}
      onClick={() => onPick(idea.s.id, idea.tripType)}
      className="group lift block w-full rounded-2xl text-left pressable focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
    >
      {/* The place on top, the facts under it: a travel app's listing card. */}
      <span className="relative isolate block aspect-[16/9] overflow-hidden rounded-2xl bg-fill">
        {photo?.image ? (
          <Photo
            src={thumbAt(photo.image, 400)}
            alt=""
            priority={first ?? false}
            className="absolute inset-0 -z-10"
            imgClassName="transition-[opacity,scale] duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <Icon
            aria-hidden
            className="absolute inset-0 m-auto size-10 text-muted-foreground"
            strokeWidth={1.5}
          />
        )}
        <span className="absolute top-3 left-3 rounded-sm bg-background/85 px-2 py-1 label-mono text-foreground backdrop-blur">
          {tripTypeInfo(idea.tripType).label}
        </span>
      </span>
      <span className="mt-4 block px-1">
        <span className="title-display block text-title-2 font-normal">{idea.s.name}</span>
        <span className="mt-1 block label-mono">
          {idea.s.region}
          {idea.s.distanceLabel ? ` · ${idea.s.distanceLabel}` : ""}
        </span>
        <span className="mt-4 flex items-baseline gap-2 whitespace-nowrap">
          <span className="money-display text-title-2">{formatMoney(idea.cost)}</span>
          <span className="label-mono">est.</span>
        </span>
      </span>
    </button>
  );
}
