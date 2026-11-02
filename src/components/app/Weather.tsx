import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  RefreshCw,
  Sun,
  Umbrella,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCalendarDate } from "@/lib/dates";
import { useTripWeather } from "@/lib/live/use-live";
import { isWetDay, summarize, type DayWeather, type WeatherKind } from "@/lib/live/weather";
import { cn } from "@/lib/utils";

export const WEATHER_ICON: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

/** Local clock time from an Open-Meteo "YYYY-MM-DDTHH:MM" string, without time-zone conversion. */
function clock(t: string | null): string {
  if (!t) return "";
  const [h = 0, m = 0] = t.slice(11, 16).split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${suffix}`;
}

/** Compact weather for one itinerary day. */
export function WeatherChip({ day, className }: { day: DayWeather; className?: string }) {
  const Icon = WEATHER_ICON[day.kind];
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs font-medium",
        className,
      )}
      title={
        day.source === "forecast" ? "Live forecast" : "Typical: what this date was like last year"
      }
    >
      <Icon className="size-3.5" strokeWidth={1.8} />
      <span className="tabular">
        {day.highF}° / {day.lowF}°
      </span>
      {day.precipChance !== null && day.precipChance >= 20 && (
        <span className="tabular inline-flex items-center gap-0.5 text-primary">
          <Umbrella className="size-3" />
          {day.precipChance}%
        </span>
      )}
      <span className="font-normal text-muted-foreground">
        {day.source === "forecast" ? "forecast" : "typical"}
      </span>
    </span>
  );
}

/** Trip-long weather card for the dashboard. */
export function WeatherCard({ className }: { className?: string }) {
  const w = useTripWeather();
  const days = w.weather?.days ?? [];
  const wet = days.filter(isWetDay);
  const anyForecast = days.some((d) => d.source === "forecast");

  return (
    <section className={cn("surface-card p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Weather</h2>
          <p className="text-sm text-muted-foreground">
            {w.status === "ready" && days.length > 0
              ? `${w.placeLabel} · ${summarize(days)}`
              : w.placeLabel || "Your destination"}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          Live
        </span>
      </div>

      {w.status === "loading" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking the forecast…
        </p>
      )}
      {w.status === "no-place" && (
        <p className="mt-4 text-sm text-muted-foreground">
          Add your starting city on the Plan page to see the weather for your staycation.
        </p>
      )}
      {w.status === "not-found" && (
        <p className="mt-4 text-sm text-muted-foreground">
          We couldn't find “{w.placeText}” on the map. Try a city and state, like “Chattanooga, TN”.
        </p>
      )}
      {w.status === "error" && (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>The weather service didn't respond.</p>
          <Button size="sm" variant="outline" onClick={() => void w.refetch()}>
            <RefreshCw /> Try again
          </Button>
        </div>
      )}
      {w.status === "ready" && days.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          This trip's dates have passed, so there's no forecast to show.
        </p>
      )}

      {w.status === "ready" && days.length > 0 && (
        <>
          <ol className="-mx-1 mt-4 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
            {days.map((d) => {
              const Icon = WEATHER_ICON[d.kind];
              return (
                <li
                  key={d.date}
                  className={cn(
                    "w-24 shrink-0 snap-start rounded-2xl border p-3 text-center",
                    isWetDay(d)
                      ? "border-shield/30 bg-shield-soft"
                      : "border-border bg-background/60",
                  )}
                >
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {formatCalendarDate(d.date, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <Icon
                    className="mx-auto my-2 size-5 text-foreground/80"
                    strokeWidth={1.6}
                    aria-hidden
                  />
                  <p className="text-[11px] leading-tight">{d.label}</p>
                  <p className="tabular mt-1 text-sm font-medium">
                    {d.highF}° <span className="font-normal text-muted-foreground">{d.lowF}°</span>
                  </p>
                  {d.precipChance !== null && (
                    <p className="tabular text-[11px] text-primary">
                      <Umbrella className="inline size-3" /> {d.precipChance}%
                    </p>
                  )}
                  {d.sunset && (
                    <p className="text-[10px] text-muted-foreground">Sunset {clock(d.sunset)}</p>
                  )}
                </li>
              );
            })}
          </ol>
          {wet.length > 0 && (
            <p className="mt-3 text-xs text-foreground">
              <Umbrella className="mr-1 inline size-3.5 -translate-y-px text-primary" />
              Wet weather is likely on{" "}
              {wet.map((d) => formatCalendarDate(d.date, { weekday: "long" })).join(", ")} — keep an
              indoor plan for those days.
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {anyForecast ? "Live forecast from Open-Meteo, updated hourly." : ""}
            {days.some((d) => d.source === "typical")
              ? `${anyForecast ? " " : ""}Days beyond the 16-day forecast show what those dates were like last year.`
              : ""}
          </p>
        </>
      )}
    </section>
  );
}
