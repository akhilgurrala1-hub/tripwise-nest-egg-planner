// Real weather for the trip via Open-Meteo (free, no key, CORS-enabled).
// Days within the 16-day forecast window get a live forecast; later days get
// what actually happened on the same dates last year, labeled as "typical".
import { addDays, isIsoDate } from "../dates";

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
/** Open-Meteo forecasts 16 days including today. */
export const FORECAST_DAYS = 16;

export type WeatherKind =
  "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export interface DayWeather {
  date: string;
  /** "forecast" = live forecast; "typical" = same date last year */
  source: "forecast" | "typical";
  kind: WeatherKind;
  label: string;
  highF: number;
  lowF: number;
  /** Chance of rain or snow in %, forecast days only */
  precipChance: number | null;
  precipInches: number;
  sunrise: string | null;
  sunset: string | null;
}

export interface TripWeather {
  fetchedAt: string;
  placeLabel: string;
  days: DayWeather[];
}

/** WMO weather interpretation codes, as used by Open-Meteo. */
export function describeCode(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: "clear", label: "Clear" };
  if (code === 1) return { kind: "clear", label: "Mostly clear" };
  if (code === 2) return { kind: "partly", label: "Partly cloudy" };
  if (code === 3) return { kind: "cloudy", label: "Overcast" };
  if (code === 45 || code === 48) return { kind: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { kind: "drizzle", label: "Drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { kind: "rain", label: code >= 80 ? "Showers" : "Rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { kind: "snow", label: "Snow" };
  if (code >= 95) return { kind: "storm", label: "Thunderstorms" };
  return { kind: "cloudy", label: "Mixed" };
}

/** Rain, snow or storms likely enough to plan an indoor backup. */
export function isWetDay(d: DayWeather): boolean {
  if (d.kind === "storm" || d.kind === "snow") return true;
  if (d.precipChance !== null) return d.precipChance >= 60;
  return d.precipInches >= 0.2;
}

/** Same calendar date one year earlier (Feb 29 → Feb 28). */
export function lastYear(iso: string): string {
  const y = Number(iso.slice(0, 4)) - 1;
  const md = iso.slice(5);
  const candidate = `${y}-${md}`;
  return isIsoDate(candidate) ? candidate : `${y}-02-28`;
}

/** The same date `n` years earlier (Feb 29 becomes Feb 28 in other years). */
export function yearsEarlier(iso: string, n: number): string {
  const y = Number(iso.slice(0, 4)) - n;
  const candidate = `${y}-${iso.slice(5)}`;
  return isIsoDate(candidate) ? candidate : `${y}-02-28`;
}

/**
 * How many years back the record for a stretch of dates is: last year, or more
 * for a trip planned well ahead, so the record has already happened (the archive
 * runs about a week behind).
 */
export function recordYearsBack(endDate: string, today: string): number {
  const latest = addDays(today, -7);
  let n = 1;
  while (yearsEarlier(endDate, n) > latest && n < 10) n++;
  return n;
}

export interface WeatherPlan {
  forecast: { start: string; end: string } | null;
  typical: { start: string; end: string } | null;
}

/** Which trip days can get a live forecast and which need last year's weather. Past days get neither. */
export function planWeather(startDate: string, endDate: string, today: string): WeatherPlan {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate)
    return { forecast: null, typical: null };
  const lastForecastDay = addDays(today, FORECAST_DAYS - 1);
  const from = startDate < today ? today : startDate;
  if (from > endDate) return { forecast: null, typical: null };
  const forecastEnd = endDate < lastForecastDay ? endDate : lastForecastDay;
  const forecast = from <= forecastEnd ? { start: from, end: forecastEnd } : null;
  const typicalStart = forecast ? addDays(forecastEnd, 1) : from;
  const typical = typicalStart <= endDate ? { start: typicalStart, end: endDate } : null;
  return { forecast, typical };
}

interface RawDaily {
  time?: string[];
  weather_code?: (number | null)[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  precipitation_probability_max?: (number | null)[];
  precipitation_sum?: (number | null)[];
  sunrise?: (string | null)[];
  sunset?: (string | null)[];
}

/** Turn an Open-Meteo daily block into trip days. `shiftYears` maps last year's dates onto the trip's. */
export function parseDaily(
  body: unknown,
  source: DayWeather["source"],
  shiftYears = 0,
): DayWeather[] {
  const d = (body as { daily?: RawDaily } | null)?.daily;
  if (!d?.time) return [];
  const out: DayWeather[] = [];
  d.time.forEach((date, i) => {
    const hi = d.temperature_2m_max?.[i];
    const lo = d.temperature_2m_min?.[i];
    const code = d.weather_code?.[i];
    if (typeof hi !== "number" || typeof lo !== "number" || typeof code !== "number") return;
    const tripDate = shiftYears ? `${Number(date.slice(0, 4)) + shiftYears}${date.slice(4)}` : date;
    const sunrise = d.sunrise?.[i] ?? null;
    const sunset = d.sunset?.[i] ?? null;
    out.push({
      date: tripDate,
      source,
      ...describeCode(code),
      highF: Math.round(hi),
      lowF: Math.round(lo),
      precipChance: source === "forecast" ? (d.precipitation_probability_max?.[i] ?? null) : null,
      precipInches: Math.round((d.precipitation_sum?.[i] ?? 0) * 100) / 100,
      sunrise: source === "forecast" ? sunrise : null,
      sunset: source === "forecast" ? sunset : null,
    });
  });
  return out;
}

async function getDaily(
  base: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), signal ? { signal } : {});
  if (!res.ok) throw new Error(`Weather service error (${res.status})`);
  return res.json();
}

export async function fetchTripWeather(opts: {
  lat: number;
  lon: number;
  placeLabel: string;
  startDate: string;
  endDate: string;
  today: string;
  signal?: AbortSignal;
}): Promise<TripWeather> {
  const plan = planWeather(opts.startDate, opts.endDate, opts.today);
  // Planned a year or more ahead: use the latest year whose record exists.
  const back = plan.typical ? recordYearsBack(plan.typical.end, opts.today) : 1;
  const common = {
    latitude: String(opts.lat),
    longitude: String(opts.lon),
    timezone: "auto",
    temperature_unit: "fahrenheit",
    precipitation_unit: "inch",
  };
  const [forecast, typical] = await Promise.all([
    plan.forecast
      ? getDaily(
          FORECAST,
          {
            ...common,
            daily:
              "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset",
            start_date: plan.forecast.start,
            end_date: plan.forecast.end,
          },
          opts.signal,
        ).then((b) => parseDaily(b, "forecast"))
      : Promise.resolve([]),
    plan.typical
      ? getDaily(
          ARCHIVE,
          {
            ...common,
            daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
            start_date: yearsEarlier(plan.typical.start, back),
            end_date: yearsEarlier(plan.typical.end, back),
          },
          opts.signal,
        )
          .then((b) => parseDaily(b, "typical", back))
          // Last year's record is a nice-to-have next to a live forecast: a failure there must not
          // hide the forecast. When it's all there is, the failure is reported so it can be retried.
          .catch((err: unknown) => {
            if (!plan.forecast) throw err;
            return [] as DayWeather[];
          })
      : Promise.resolve([]),
  ]);
  const days = [...forecast, ...typical].filter(
    (d) => d.date >= opts.startDate && d.date <= opts.endDate,
  );
  return { fetchedAt: new Date().toISOString(), placeLabel: opts.placeLabel, days };
}

/** Short summary for a whole trip: "Highs 58–66°F · rain likely on 2 of 4 days". */
export function summarize(days: DayWeather[], units: "imperial" | "metric" = "imperial"): string {
  if (days.length === 0) return "";
  const conv = (f: number) => (units === "metric" ? Math.round(((f - 32) * 5) / 9) : f);
  const highs = days.map((d) => conv(d.highF));
  const lo = Math.min(...highs);
  const hi = Math.max(...highs);
  const wet = days.filter(isWetDay).length;
  const unit = units === "metric" ? "°C" : "°F";
  const temp = lo === hi ? `Highs near ${hi}${unit}` : `Highs ${lo}–${hi}${unit}`;
  const of = days.length;
  return wet === 0
    ? `${temp} · mostly dry`
    : `${temp} · wet weather on ${wet} of ${of} day${of === 1 ? "" : "s"}`;
}
