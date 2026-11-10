import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import { Photo } from "@/components/app/Photo";
import { stagger, useDragScroll } from "@/components/app/motion";
import { formatMoney } from "@/lib/budget";
import type { GeoPoint } from "@/lib/catalog";
import { getDestination, modeForTripType, tripTypeInfo, type TripType } from "@/lib/demo-data";
import { useDestinationSummary } from "@/lib/live/use-open-data";
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
export function inspirationIdeas(setup: TripSetup, from: GeoPoint | null, limit = 4): Idea[] {
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
  if (!ideas.length) return null;
  return (
    <section aria-labelledby="ideas-title">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="ideas-title" className="title-display text-title-1">
          Trip ideas from {fromLabel}
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
          <li key={idea.s.id} className="w-[70%] shrink-0 snap-start sm:w-72">
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
  const Icon = TRIP_ICONS[idea.tripType];
  return (
    <button
      type="button"
      style={{ ...style, "--kind": color } as CSSProperties}
      onClick={() => onPick(idea.s.id, idea.tripType)}
      className="group block w-full rounded-2xl text-left pressable focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
    >
      {/* The place on top, the facts under it: a travel app's listing card. */}
      <span className="relative isolate block aspect-[4/3] overflow-hidden rounded-2xl bg-fill">
        {photo?.image ? (
          <Photo
            src={photo.image}
            alt=""
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
        <span className="absolute top-3 left-3 rounded-sm bg-card px-2 py-1 text-micro font-semibold text-foreground">
          {tripTypeInfo(idea.tripType).label}
        </span>
      </span>
      <span className="mt-4 block px-1">
        <span className="block truncate text-headline font-semibold">{idea.s.name}</span>
        <span className="mt-1 block truncate text-footnote text-muted-foreground">
          {idea.s.region}
          {idea.s.distanceLabel ? ` · ${idea.s.distanceLabel}` : ""}
        </span>
        <span className="mt-2 flex items-baseline gap-1 text-footnote whitespace-nowrap">
          <span className="money-display text-body">{formatMoney(idea.cost)}</span>
          <span className="text-muted-foreground">estimated</span>
        </span>
      </span>
    </button>
  );
}

/**
 * The hero's picture: three real places from the traveler's start, one tall and two
 * short, each a tap away from becoming the destination. Large screens only; phones
 * go straight to the ideas row.
 */
export function HeroPhotos({
  ideas,
  origin,
  onPick,
}: {
  ideas: Idea[];
  origin: string;
  onPick: (destinationId: string, tripType: TripType) => void;
}) {
  const shown = ideas.slice(0, 3);
  if (shown.length < 3) return null;
  return (
    <ul className="hidden h-[26rem] grid-cols-2 grid-rows-2 gap-4 xl:grid">
      {shown.map((idea, i) => (
        <li key={idea.s.id} className={i === 0 ? "row-span-2" : undefined}>
          <HeroTile idea={idea} origin={origin} onPick={onPick} />
        </li>
      ))}
    </ul>
  );
}

function HeroTile({
  idea,
  origin,
  onPick,
}: {
  idea: Idea;
  origin: string;
  onPick: (destinationId: string, tripType: TripType) => void;
}) {
  const dest = getDestination(idea.s.id);
  const photo = useDestinationSummary(dest, origin).data;
  const Icon = TRIP_ICONS[idea.tripType];
  return (
    <button
      type="button"
      onClick={() => onPick(idea.s.id, idea.tripType)}
      className="group relative isolate block size-full overflow-hidden rounded-2xl bg-fill text-left pressable focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
    >
      {photo?.image ? (
        <Photo
          src={photo.image}
          alt=""
          lazy={false}
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
      <span className="absolute bottom-4 left-4 max-w-[calc(100%-2rem)] rounded-md bg-card px-4 py-2">
        <span className="block truncate text-footnote font-semibold text-foreground">
          {idea.s.name}
        </span>
        <span className="block truncate text-caption text-muted-foreground">
          {formatMoney(idea.cost)} estimated
        </span>
      </span>
    </button>
  );
}
