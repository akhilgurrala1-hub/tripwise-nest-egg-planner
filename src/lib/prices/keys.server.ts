/**
 * The price services' API keys, read from environment variables (Vercel). The documented
 * names are SERPAPI_API_KEY and EIA_API_KEY; common variants are accepted too, so
 * a key saved as "SERPAPI_KEY" or with a stray space still works.
 */
export type PriceService = "serpapi" | "eia";

const NAMES: Record<PriceService, string[]> = {
  serpapi: [
    "SERPAPI_API_KEY",
    "SERPAPI_KEY",
    "SERP_API_KEY",
    "SERPAPI",
    "SERP_API",
    "SERPAPI_TOKEN",
  ],
  eia: ["EIA_API_KEY", "EIA_KEY", "EIA_API", "EIA_TOKEN"],
};

/** Loose match for anything else that's clearly meant as this key (e.g. "serpApiKey"). */
const LOOSE: Record<PriceService, RegExp> = {
  serpapi: /^serp.?api.*(key|token)?$|^serp.*key$/i,
  eia: /^eia.*(key|token)$/i,
};

/** Strip whitespace and surrounding quotes that sneak in when pasting a key. */
const clean = (v: string | undefined) =>
  (v ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();

export function priceKey(
  service: PriceService,
  env: Record<string, string | undefined> = process.env,
): { key: string; name: string } | null {
  for (const name of NAMES[service]) {
    const key = clean(env[name]);
    if (key) return { key, name };
  }
  for (const [name, value] of Object.entries(env)) {
    if (!LOOSE[service].test(name)) continue;
    const key = clean(value);
    if (key) return { key, name };
  }
  return null;
}

export interface KeyCheck {
  service: PriceService;
  /** The secret name it was found under, or null when there's none */
  name: string | null;
  status: "missing" | "ok" | "rejected" | "unreachable";
  /** e.g. "Free plan · 243 searches left this month" */
  detail: string;
}

const enc = encodeURIComponent;

/**
 * Ask each service whether its key works. SerpApi's account endpoint doesn't use a
 * search; EIA's metadata route is a free lookup. Keys never leave the server.
 */
export async function checkPriceKeys(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<KeyCheck[]> {
  const serp = priceKey("serpapi", env);
  const eia = priceKey("eia", env);
  const one = async (
    service: PriceService,
    found: { key: string; name: string } | null,
    url: (key: string) => string,
    describe: (body: Record<string, unknown>) => string,
  ): Promise<KeyCheck> => {
    if (!found) return { service, name: null, status: "missing", detail: "No key found" };
    try {
      const res = await fetcher(url(found.key));
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 401 || res.status === 403 || typeof body["error"] === "string")
        return {
          service,
          name: found.name,
          status: "rejected",
          detail: "The service didn't accept this key. Copy it again from your account.",
        };
      if (!res.ok)
        return {
          service,
          name: found.name,
          status: "unreachable",
          detail: `The service answered ${res.status}.`,
        };
      return { service, name: found.name, status: "ok", detail: describe(body) };
    } catch {
      return {
        service,
        name: found.name,
        status: "unreachable",
        detail: "The service didn't respond.",
      };
    }
  };
  return Promise.all([
    one(
      "serpapi",
      serp,
      (k) => `https://serpapi.com/account.json?api_key=${enc(k)}`,
      (b) => {
        const plan = typeof b["plan_name"] === "string" ? b["plan_name"] : "Connected";
        const left = Number(b["total_searches_left"] ?? b["plan_searches_left"]);
        return Number.isFinite(left) ? `${plan} · ${left} searches left this month` : String(plan);
      },
    ),
    one(
      "eia",
      eia,
      (k) => `https://api.eia.gov/v2/petroleum/pri/gnd/?api_key=${enc(k)}`,
      () => "Connected",
    ),
  ]);
}
