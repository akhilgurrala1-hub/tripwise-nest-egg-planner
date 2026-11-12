import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Photo } from "@/components/app/Photo";
import { cn } from "@/lib/utils";
import { useDragScroll } from "@/components/app/motion";
import { formatMoney } from "@/lib/budget";
import type { GeoPoint } from "@/lib/catalog";
import {
  getDestination,
  modeForTripType,
  tripTypeInfo,
  type Interest,
  type TripType,
} from "@/lib/demo-data";
import { thumbAt } from "@/lib/live/open-data";
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

/** Rows of ideas: the first is the traveler's own interests, the others one theme each. */
const THEMES: { id: string; title: string; interests: Interest[] | null }[] = [
  { id: "top", title: "Top picks for you", interests: null },
  { id: "nature", title: "Nature and parks", interests: ["nature"] },
  { id: "food", title: "Food, history and art", interests: ["food", "history", "arts"] },
  { id: "water", title: "Beaches and water", interests: ["beaches"] },
];

const CATEGORY_TYPES: TripType[] = ["road-trip", "flight", "cruise", "rail"];

const ROW_SIZE = 10;

function ideasFor(
  setup: TripSetup,
  from: GeoPoint | null,
  tripType: TripType,
  interests: Interest[],
  themed: boolean,
  seen: Set<string>,
): Idea[] {
  const list = recommendDestinations({ from, tripType, interests, limit: 40 })
    .filter((s) => !seen.has(s.id) && (!themed || s.matches.length > 0))
    .slice(0, ROW_SIZE);
  return list.map((s) => ({
    s,
    tripType,
    // What this trip would cost with their dates and group (the same estimate the plan uses).
    cost: estimatedSpend({
      ...setup,
      originPoint: from ?? setup.originPoint ?? null,
      destinationId: s.id,
      customDestination: "",
      destinationPoint: null,
      cities: [],
      tripType,
      transportMode: modeForTripType(tripType, setup.transportMode),
    }),
  }));
}

/**
 * Places to go from where they start, after airbnb.com: a bar of trip kinds, then rows of
 * photo cards (top picks, nature, food and history, beaches), each with how far it is and what
 * it would cost: the real estimate for their dates and group, labeled as one. Rows below the
 * first load their photos only when they come into view.
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
  const [type, setType] = useState<TripType>(
    CATEGORY_TYPES.includes(setup.tripType) ? setup.tripType : "road-trip",
  );
  const rows = (() => {
    const seen = new Set<string>();
    return THEMES.map((t) => {
      const ideas = ideasFor(
        setup,
        from,
        type,
        t.interests ?? setup.interests,
        t.interests !== null,
        seen,
      );
      ideas.forEach((i) => seen.add(i.s.id));
      return { ...t, ideas };
    }).filter((r) => r.ideas.length >= 3);
  })();
  const CategoryIcon = (t: TripType) => TRIP_ICONS[t];
  return (
    <section aria-labelledby="ideas-title">
      <div className="text-center">
        <h2 id="ideas-title" className="title-display text-large-title">
          Trips from {fromLabel}
        </h2>
        <p className="mt-2 text-body text-muted-foreground">
          Estimated for {setup.travelers} {setup.travelers === 1 ? "traveler" : "travelers"},{" "}
          {nights} night{nights === 1 ? "" : "s"}, starting from you.
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Kind of trip"
        className="mt-8 flex gap-2 overflow-x-auto pb-2 sm:justify-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {CATEGORY_TYPES.map((t) => {
          const Icon = CategoryIcon(t);
          const on = t === type;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setType(t)}
              className={cn(
                "pressable flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-footnote font-semibold",
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:border-foreground/40",
              )}
            >
              <Icon className="size-4" aria-hidden /> {tripTypeInfo(t).label}
            </button>
          );
        })}
      </div>
      {rows.length === 0 && (
        <p className="mt-8 text-center text-muted-foreground">
          No ideas for this kind of trip from here yet.
        </p>
      )}
      <div className="mt-8 space-y-12">
        {rows.map((r, i) => (
          <IdeaRow
            key={`${type}-${r.id}`}
            title={r.title}
            ideas={r.ideas}
            origin={setup.origin}
            eager={i === 0}
            onPick={onPick}
          />
        ))}
      </div>
    </section>
  );
}

/** One scrolling row of cards; its photo lookups start when it nears the screen (the first at once). */
function IdeaRow({
  title,
  ideas,
  origin,
  eager,
  onPick,
}: {
  title: string;
  ideas: Idea[];
  origin: string;
  eager: boolean;
  onPick: (destinationId: string, tripType: TripType) => void;
}) {
  const rail = useDragScroll<HTMLUListElement>();
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(eager);
  useEffect(() => {
    if (near || !holder.current || typeof IntersectionObserver === "undefined") {
      if (!near) setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(holder.current);
    return () => io.disconnect();
  }, [near]);
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
  return (
    <div ref={holder}>
      <div className="flex items-end justify-between gap-4">
        <h3 className="title-display text-title-1">{title}</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => page(-1)}
            disabled={edge.start}
            aria-label={`Previous: ${title}`}
            className="pressable grid size-9 place-items-center rounded-full bg-card text-foreground shadow-sm disabled:opacity-35"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => page(1)}
            disabled={edge.end}
            aria-label={`More: ${title}`}
            className="pressable grid size-9 place-items-center rounded-full bg-card text-foreground shadow-sm disabled:opacity-35"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
      <ul
        ref={rail}
        onScroll={onScroll}
        className="-mx-6 mt-4 flex snap-x scroll-px-6 gap-4 overflow-x-auto px-6 pb-2 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:-mx-12 lg:scroll-px-12 lg:px-12 [&::-webkit-scrollbar]:hidden"
      >
        {ideas.map((idea, i) => (
          <li key={idea.s.id} className="w-[58%] shrink-0 snap-start sm:w-56">
            {near ? (
              <IdeaCard idea={idea} origin={origin} first={eager && i < 4} onPick={onPick} />
            ) : (
              <span aria-hidden className="skeleton block aspect-[4/5] rounded-2xl" />
            )}
          </li>
        ))}
      </ul>
    </div>
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
      <span className="relative isolate block aspect-[4/5] overflow-hidden rounded-2xl bg-fill">
        {photo?.image ? (
          <Photo
            src={thumbAt(photo.image, 500)}
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
        <span className="title-display block text-title-2">{idea.s.name}</span>
        <span className="mt-1 line-clamp-2 min-h-8 label-mono">
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
