/**
 * Units and a local currency for travelers outside the US. Budget math always runs
 * in US dollars (all estimates are in USD); other currencies are shown alongside as
 * an approximate conversion at the day's European Central Bank rate (Frankfurter,
 * free and keyless).
 */
export type Units = "imperial" | "metric";

/** Countries that use miles and °F. */
const IMPERIAL = new Set(["US", "LR", "MM", "PR"]);

export function unitsForCountry(country: string | null | undefined): Units {
  return !country || IMPERIAL.has(country.toUpperCase()) ? "imperial" : "metric";
}

const EURO = [
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
];

/** Currencies the free rate service covers, by country. */
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  US: "USD",
  PR: "USD",
  CA: "CAD",
  MX: "MXN",
  BR: "BRL",
  GB: "GBP",
  CH: "CHF",
  DK: "DKK",
  SE: "SEK",
  NO: "NOK",
  IS: "ISK",
  CZ: "CZK",
  PL: "PLN",
  HU: "HUF",
  RO: "RON",
  BG: "BGN",
  TR: "TRY",
  IL: "ILS",
  ZA: "ZAR",
  IN: "INR",
  JP: "JPY",
  KR: "KRW",
  CN: "CNY",
  HK: "HKD",
  SG: "SGD",
  MY: "MYR",
  TH: "THB",
  ID: "IDR",
  PH: "PHP",
  AU: "AUD",
  NZ: "NZD",
  ...Object.fromEntries(EURO.map((c) => [c, "EUR"])),
};

export const CURRENCIES = [...new Set(Object.values(CURRENCY_BY_COUNTRY))].sort();

export function currencyForCountry(country: string | null | undefined): string {
  return (country && CURRENCY_BY_COUNTRY[country.toUpperCase()]) || "USD";
}

/** The country in a browser locale such as "en-GB" or "pt-BR", if any. */
export function countryFromLocale(locale: string | undefined): string | null {
  const m = /[-_]([A-Za-z]{2})(?:$|[-_])/.exec(locale ?? "");
  return m ? m[1]!.toUpperCase() : null;
}

export function formatTemp(f: number, units: Units): string {
  return units === "metric" ? `${Math.round(((f - 32) * 5) / 9)}°C` : `${Math.round(f)}°F`;
}

/** Just the number and degree sign, for compact high/low pairs. */
export function tempValue(f: number, units: Units): number {
  return units === "metric" ? Math.round(((f - 32) * 5) / 9) : Math.round(f);
}

export function formatDistance(miles: number, units: Units): string {
  const v = units === "metric" ? miles * 1.609344 : miles;
  return `${Math.round(v).toLocaleString("en-US")} ${units === "metric" ? "km" : "mi"}`;
}

/** "≈ €1,840" — rounded, since it's a conversion of an estimate. */
export function formatApprox(usd: number, currency: string, rate: number): string {
  const v = usd * rate;
  const digits = Math.abs(v) >= 100 ? 0 : 2;
  try {
    return `≈ ${new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v)}`;
  } catch {
    return `≈ ${Math.round(v).toLocaleString("en-US")} ${currency}`;
  }
}

/** Parse Frankfurter's `{ rates: { EUR: 0.92 } }`. */
export function parseRate(body: unknown, currency: string): number | null {
  const rate = (body as { rates?: Record<string, unknown> } | null)?.rates?.[currency];
  return typeof rate === "number" && rate > 0 && Number.isFinite(rate) ? rate : null;
}

/** Today's USD → currency rate (two public mirrors of the same free service). */
export async function fetchUsdRate(currency: string, signal?: AbortSignal): Promise<number> {
  if (currency === "USD") return 1;
  const urls = [
    `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${currency}`,
    `https://api.frankfurter.app/latest?from=USD&to=${currency}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, signal ? { signal } : {});
      if (!res.ok) continue;
      const rate = parseRate(await res.json(), currency);
      if (rate) return rate;
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  throw new Error("Exchange rates are unavailable right now.");
}
