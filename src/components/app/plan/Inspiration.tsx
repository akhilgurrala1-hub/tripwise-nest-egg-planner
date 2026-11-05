import { ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";

import { RouteMark } from "@/components/app/Illustrations";
import { stagger } from "@/components/app/motion";
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
  if (!ideas.length) return null;
  return (
    <section aria-labelledby="ideas-title" className="mt-12">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ideas-title" className="title-display text-[28px] sm:text-[32px]">
          Ideas from {fromLabel}
        </h2>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Estimated for {setup.travelers} {setup.travelers === 1 ? "traveler" : "travelers"},{" "}
          {nights} night{nights === 1 ? "" : "s"}
        </p>
      </div>
      <ul className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {ideas.map((idea, i) => (
          <li key={idea.s.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
            <IdeaCard idea={idea} origin={setup.origin} style={stagger(i + 1)} onPick={onPick} />
          </li>
        ))}
      </ul>
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
      className="group animate-rise surface-card block w-full overflow-hidden text-left transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-quint)] hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:outline-none"
    >
      <span className="relative block aspect-[4/3] overflow-hidden bg-[color-mix(in_oklab,var(--kind)_10%,var(--card))]">
        {photo?.image ? (
          <img
            src={photo.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-[var(--ease-out-quint)] group-hover:scale-[1.04]"
          />
        ) : (
          <RouteMark className="absolute inset-0 m-auto h-16 w-24 text-(--kind) opacity-60" />
        )}
        <span className="absolute top-2.5 left-2.5 rounded-md bg-card px-1.5 py-0.5 text-[11px] font-medium text-foreground">
          {tripTypeInfo(idea.tripType).label}
        </span>
      </span>
      <span className="block p-4">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{idea.s.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {idea.s.region}
              {idea.s.distanceLabel ? ` · ${idea.s.distanceLabel}` : ""}
            </span>
          </span>
          <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
        <span className="mt-3 block text-[13px]">
          <span className="money-display text-[22px]">about {formatMoney(idea.cost)}</span>
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{idea.s.tagline}</span>
      </span>
    </button>
  );
}
