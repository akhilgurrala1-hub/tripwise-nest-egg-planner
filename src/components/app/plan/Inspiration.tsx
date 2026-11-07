import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { RouteMark } from "@/components/app/Illustrations";
import { Photo } from "@/components/app/Photo";
import { stagger, useDragScroll } from "@/components/app/motion";
import { formatMoney } from "@/lib/budget";
import type { GeoPoint } from "@/lib/catalog";
import { getDestination, modeForTripType, tripTypeInfo, type TripType } from "@/lib/demo-data";
import { useDestinationSummary } from "@/lib/live/use-open-data";
import { recommendDestinations, type Suggestion } from "@/lib/recommend";
import { TRIP_COLOR } from "@/components/app/trip-colors";
import { estimatedSpend } from "@/lib/trip/budget-fit";
import type { TripSetup } from "@/lib/trip/types";

interface Idea {
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
  const ideas = inspirationIdeas(setup, from);
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
  const page = (dir: 1 | -1) =>
    rail.current?.scrollBy({ left: dir * rail.current.clientWidth * 0.8, behavior: "smooth" });
  if (!ideas.length) return null;
  return (
    <section aria-labelledby="ideas-title">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="ideas-title" className="title-display text-large-title">
          Ideas from {fromLabel}.
        </h2>
      </div>
      <p className="mt-2 text-body text-muted-foreground">
        Estimated for {setup.travelers} {setup.travelers === 1 ? "traveler" : "travelers"}, {nights}{" "}
        night{nights === 1 ? "" : "s"}, from your door.
      </p>
      <ul
        ref={rail}
        onScroll={onScroll}
        className="-mx-4 mt-6 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ideas.map((idea, i) => (
          <li key={idea.s.id} className="w-[78%] shrink-0 snap-start sm:w-64">
            <IdeaCard idea={idea} origin={setup.origin} style={stagger(i + 1)} onPick={onPick} />
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
  onPick,
}: {
  idea: Idea;
  origin: string;
  style?: CSSProperties;
  onPick: (destinationId: string, tripType: TripType) => void;
}) {
  const dest = getDestination(idea.s.id);
  const photo = useDestinationSummary(dest, origin).data;
  const color = TRIP_COLOR[idea.tripType];
  return (
    <button
      type="button"
      style={{ ...style, "--kind": color } as CSSProperties}
      onClick={() => onPick(idea.s.id, idea.tripType)}
      className="group animate-rise surface-card block w-full overflow-hidden text-left pressable focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:outline-none"
    >
      <span className="relative block aspect-[4/3] overflow-hidden bg-[color-mix(in_oklab,var(--kind)_10%,var(--card))]">
        {photo?.image ? (
          <Photo
            src={photo.image}
            alt=""
            className="absolute inset-0"
            fallback={
              <RouteMark className="absolute inset-0 m-auto h-16 w-24 text-(--kind) opacity-60" />
            }
          />
        ) : (
          <RouteMark className="absolute inset-0 m-auto h-16 w-24 text-(--kind) opacity-60" />
        )}
        <span className="absolute top-2.5 left-2.5 rounded-md bg-card px-2 py-1 text-micro font-medium text-foreground">
          {tripTypeInfo(idea.tripType).label}
        </span>
      </span>
      <span className="block p-4">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-body font-semibold">{idea.s.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {idea.s.region}
              {idea.s.distanceLabel ? ` · ${idea.s.distanceLabel}` : ""}
            </span>
          </span>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
        </span>
        <span className="mt-4 flex items-baseline gap-1 text-footnote whitespace-nowrap">
          <span className="text-muted-foreground">about</span>
          <span className="money-display text-title-2">{formatMoney(idea.cost)}</span>
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{idea.s.tagline}</span>
      </span>
    </button>
  );
}
