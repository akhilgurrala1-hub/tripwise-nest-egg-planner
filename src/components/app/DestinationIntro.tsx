import { useState } from "react";
import { CalendarHeart, ExternalLink, Footprints, ShieldCheck } from "lucide-react";

import { safeExternalUrl } from "@/lib/booking";
import { formatCalendarDate } from "@/lib/dates";
import type { DemoDestination } from "@/lib/demo-data";
import { destinationQuery } from "@/lib/live/place";
import type { GuideTip } from "@/lib/live/travel-guide";
import { useDestinationSummary, useTravelGuide, useTripHolidays } from "@/lib/live/use-open-data";
import { destinationReviewLinks } from "@/lib/reviews";
import { Photo, Skeleton } from "@/components/app/Photo";
import { cn } from "@/lib/utils";

/**
 * A destination's photo and short introduction from Wikipedia (free). The source
 * is credited by linking the photo and a "Read more" link to the article.
 */
export function DestinationPhoto({
  dest,
  origin,
  className,
  showText = true,
  showImage = true,
}: {
  dest: DemoDestination;
  origin: string;
  className?: string;
  showText?: boolean;
  showImage?: boolean;
}) {
  const q = useDestinationSummary(dest, origin);
  const s = q.data;
  if (!s)
    return q.isLoading ? (
      // Lines in the shape of the introduction while it loads.
      <div className={cn("space-y-2", className)} role="status" aria-label="Loading">
        {showImage && <Skeleton className="aspect-[16/9] w-full rounded-lg" />}
        {showText && (
          <>
            <Skeleton className="mt-4 h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-2/3" />
          </>
        )}
      </div>
    ) : null;
  return (
    <figure className={cn("animate-pop", className)}>
      {showImage && s.image && (
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Photo from Wikipedia"
          className="relative block overflow-hidden rounded-lg"
        >
          <Photo src={s.image} alt={s.title} className="aspect-[16/9] w-full" />
        </a>
      )}
      {showText && (
        <figcaption className="mt-4 text-footnote leading-relaxed text-muted-foreground">
          {s.extract}{" "}
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Wikipedia article"
            className="font-medium whitespace-nowrap text-primary underline-offset-2 hover:underline"
          >
            Read more
          </a>
        </figcaption>
      )}
    </figure>
  );
}

/**
 * The destination's photo, large: the Overview's hero. Credited by linking to the
 * source. Nothing at all when there's no photo (better none than somewhere else).
 */
export function DestinationHero({
  dest,
  origin,
  className,
}: {
  dest: DemoDestination;
  origin: string;
  className?: string;
}) {
  const s = useDestinationSummary(dest, origin).data;
  const [tries, setTries] = useState<{ src: string; step: number } | null>(null);
  // Better no hero than a broken one: try sharper copies, then the thumbnail, then nothing.
  if (!s?.image) return null;
  const step = tries?.src === s.image ? tries.step : 0;
  if (step >= HERO_SIZES.length) return null;
  const size = HERO_SIZES[step]!;
  const src = size ? sharper(s.image, size) : s.image;
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      title="Photo from Wikipedia"
      className={cn(
        "animate-pop group relative block overflow-hidden rounded-2xl shadow-[var(--shadow-soft-value)]",
        className,
      )}
    >
      <Photo
        key={src}
        src={src}
        alt={s.title}
        lazy={false}
        className="absolute inset-0"
        imgClassName="parallax"
        onFail={() => setTries({ src: s.image!, step: step + 1 })}
      />
    </a>
  );
}

/** About the destination: photo, introduction and any public holidays during the trip. */
export function DestinationCard({
  dest,
  origin,
  className,
  photo = true,
}: {
  dest: DemoDestination;
  origin: string;
  className?: string;
  /** Off when the page already shows the photo large */
  photo?: boolean;
}) {
  const holidays = useTripHolidays();
  const summary = useDestinationSummary(dest, origin);
  const guide = useTravelGuide();
  const reviews = destinationReviewLinks(destinationQuery(dest, origin));
  return (
    <section className={cn("surface-card p-6", className)}>
      <h2 className="title-display text-title-1">About {dest.name}</h2>
      {summary.data ? (
        <DestinationPhoto dest={dest} origin={origin} showImage={photo} className="mt-4" />
      ) : (
        // Until (or unless) the introduction loads, the place's own short description.
        <p className="mt-2 text-footnote leading-relaxed text-muted-foreground">
          {dest.region ? `${dest.region}. ` : ""}
          {dest.tagline}
        </p>
      )}
      <HolidayList holidays={holidays} className="mt-4" />
      {guide.data && guide.data.tips.length > 0 && (
        <TravelerTips tips={guide.data.tips} url={guide.data.url} className="mt-4" />
      )}
      {reviews.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-4 text-xs">
          <span className="text-muted-foreground">What travelers say:</span>
          {reviews.map((l) => (
            <a
              key={l.site}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
            >
              {l.label} <ExternalLink className="size-3" aria-hidden />
            </a>
          ))}
        </p>
      )}
    </section>
  );
}

const TIP_ICON = { "Stay safe": ShieldCheck, "Get around": Footprints } as const;

/** Practical advice from the travel guide, credited with a link to the full guide. */
function TravelerTips({
  tips,
  url,
  className,
}: {
  tips: GuideTip[];
  url: string;
  className?: string;
}) {
  return (
    <div className={cn("animate-pop space-y-2", className)}>
      {tips.map((t) => {
        const Icon = TIP_ICON[t.topic];
        return (
          <div key={t.topic} className="flex gap-2">
            <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-footnote leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">{t.topic}.</span> {t.text}
            </p>
          </div>
        );
      })}
      <a
        href={safeExternalUrl(url)}
        target="_blank"
        rel="noopener noreferrer"
        title="Wikivoyage travel guide"
        className="inline-block text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        Read the full travel guide
      </a>
    </div>
  );
}

export function HolidayList({
  holidays,
  className,
}: {
  holidays: ReturnType<typeof useTripHolidays>;
  className?: string;
}) {
  if (holidays.length === 0) return null;
  return (
    <div className={cn("animate-pop rounded-lg border border-border p-4", className)}>
      <p className="flex items-center gap-2 text-footnote font-medium">
        <CalendarHeart className="size-4 text-muted-foreground" /> Public holiday
        {holidays.length > 1 ? "s" : ""} during your trip
      </p>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {holidays.map((h) => (
          <li key={h.date + h.name}>
            <span className="font-medium text-foreground">
              {formatCalendarDate(h.date, { weekday: "short", month: "short", day: "numeric" })}
            </span>{" "}
            · {h.name}
            {h.localName && h.localName !== h.name ? ` (${h.localName})` : ""}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-micro text-muted-foreground">
        Expect closures and bigger crowds, so book popular spots ahead.
      </p>
    </div>
  );
}

/** Widths to try for a full-width photo, sharpest first; 0 is the original thumbnail. */
const HERO_SIZES = [1920, 1280, 0];

/** Asks Wikimedia for a sharper copy of a thumbnail (it makes standard sizes on demand). */
function sharper(url: string, width: number) {
  const size = /\/\d+px-(?=[^/]+$)/;
  return size.test(url) ? url.replace(size, `/${width}px-`) : url;
}

/**
 * The Plan page's backdrop: the trip's destination, full-bleed behind the hero,
 * under a scrim so white type reads on it. Tries a 1920px copy, then 1280px, then
 * the 960px thumbnail; with no photo the section's own deep color stays.
 */
export function HeroBackdrop({ dest, origin }: { dest: DemoDestination; origin: string }) {
  const q = useDestinationSummary(dest, origin);
  const s = q.data;
  const [tries, setTries] = useState<{ src: string; step: number } | null>(null);
  if (!s?.image) return null;
  const step = tries?.src === s.image ? tries.step : 0;
  if (step >= HERO_SIZES.length) return null;
  const size = HERO_SIZES[step]!;
  const src = size ? sharper(s.image, size) : s.image;
  return (
    <>
      <Photo
        key={src}
        src={src}
        alt=""
        lazy={false}
        className="absolute inset-0 -z-10"
        imgClassName="parallax"
        onFail={() => setTries({ src: s.image!, step: step + 1 })}
      />
      <div aria-hidden className="photo-scrim absolute inset-0 -z-10" />
    </>
  );
}

/** The backdrop's credit: the place's name and a link to the photo's source. */
export function HeroCredit({ dest, origin }: { dest: DemoDestination; origin: string }) {
  const s = useDestinationSummary(dest, origin).data;
  if (!s?.image) return null;
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-caption text-on-image/80 hover:text-on-image hover:underline"
    >
      {dest.name} · Photo from Wikipedia
    </a>
  );
}
