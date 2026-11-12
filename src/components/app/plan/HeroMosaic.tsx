import { useQueries } from "@tanstack/react-query";

import { Photo } from "@/components/app/Photo";
import { inspirationIdeas } from "@/components/app/plan/Inspiration";
import type { GeoPoint } from "@/lib/catalog";
import { getDestination, tripTypeInfo, type TripType } from "@/lib/demo-data";
import { thumbAt } from "@/lib/live/open-data";
import { useHydrated } from "@/lib/live/use-live";
import { destinationSummaryOptions } from "@/lib/live/use-open-data";
import type { TripSetup } from "@/lib/trip/types";

/**
 * Three real places from the traveler's start, as photographs, beside the planner: the first
 * thing on the page that is a place instead of a form. It uses the same lookups as the trip
 * ideas below (shared cache), shows nothing until real photos arrive, and credits Wikipedia.
 */
export function HeroMosaic({
  setup,
  from,
  onPick,
}: {
  setup: TripSetup;
  from: GeoPoint | null;
  onPick: (destinationId: string, tripType: TripType) => void;
}) {
  const hydrated = useHydrated();
  const candidates = inspirationIdeas(setup, from, 6);
  const photos = useQueries({
    queries: candidates.map((idea) =>
      destinationSummaryOptions(getDestination(idea.s.id), setup.origin, hydrated),
    ),
  });
  const tiles = candidates
    .map((idea, i) => ({ idea, image: photos[i]?.data?.image ?? null }))
    .filter((t): t is { idea: (typeof candidates)[number]; image: string } => !!t.image)
    .slice(0, 3);
  const settled = photos.every((p) => !p.isPending);
  // While the lookups run the space is held (same shape), so the headline never moves when the
  // photos arrive. If too few real photos exist (offline, Wikipedia down) the space is released.
  if (!settled)
    return (
      <div aria-hidden className="hidden xl:block">
        <div className="grid aspect-[6/5] grid-cols-2 grid-rows-2 gap-4">
          <span className="skeleton row-span-2 rounded-2xl" />
          <span className="skeleton rounded-2xl" />
          <span className="skeleton rounded-2xl" />
        </div>
      </div>
    );
  if (tiles.length < 3) return null;
  return (
    <div className="hidden xl:block">
      <div className="grid aspect-[6/5] grid-cols-2 grid-rows-2 gap-4">
        {tiles.map(({ idea, image }, i) => (
          <button
            key={idea.s.id}
            type="button"
            onClick={() => onPick(idea.s.id, idea.tripType)}
            className={`group pressable relative isolate overflow-hidden rounded-2xl text-left focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none ${i === 0 ? "row-span-2" : ""}`}
          >
            <Photo
              src={thumbAt(image, i === 0 ? 960 : 500)}
              alt=""
              priority={i === 0}
              className="absolute inset-0 -z-10"
              imgClassName="transition-[scale] duration-300 ease-out group-hover:scale-[1.03]"
            />
            <span className="absolute inset-x-0 bottom-0 bg-ink/75 px-4 py-2 text-ink-foreground">
              <span className="block text-footnote font-semibold">{idea.s.name}</span>
              <span className="block text-caption opacity-90">
                {tripTypeInfo(idea.tripType).label}
                {idea.s.distanceLabel ? ` · ${idea.s.distanceLabel}` : ""}
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-caption text-muted-foreground">Photos from Wikipedia.</p>
    </div>
  );
}
