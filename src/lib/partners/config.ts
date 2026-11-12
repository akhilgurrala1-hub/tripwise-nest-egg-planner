/**
 * Affiliate groundwork. Nothing here is active until the owner has a real, approved partner
 * agreement and sets its tracking value in the deployment: no IDs, parameters or partners are
 * baked into the code, and with no configuration every link stays a plain, untouched link.
 *
 * Configuration is one JSON value, VITE_AFFILIATE_PARTNERS (affiliate IDs are public in the
 * link, so a build-time value is fine), for example:
 *   {"booking": {"param": "<name from the partner's docs>", "value": "<your ID>"}}
 * Partner ids are the keys of PARTNERS below.
 */

export interface PartnerDef {
  id: string;
  name: string;
  /** Hostnames this partner's links use (subdomains count) */
  hosts: string[];
}

export const PARTNERS: PartnerDef[] = [
  { id: "booking", name: "Booking.com", hosts: ["booking.com"] },
  { id: "expedia", name: "Expedia", hosts: ["expedia.com"] },
  { id: "kayak", name: "KAYAK", hosts: ["kayak.com"] },
  { id: "skyscanner", name: "Skyscanner", hosts: ["skyscanner.com", "skyscanner.net"] },
  { id: "viator", name: "Viator", hosts: ["viator.com"] },
  { id: "getyourguide", name: "GetYourGuide", hosts: ["getyourguide.com"] },
  { id: "airbnb", name: "Airbnb", hosts: ["airbnb.com"] },
  { id: "opentable", name: "OpenTable", hosts: ["opentable.com"] },
  { id: "resy", name: "Resy", hosts: ["resy.com"] },
];

export interface PartnerSetting {
  /** The query parameter the partner's documentation names */
  param: string;
  /** The traveler-independent ID the partner issued to the owner */
  value: string;
}

export type PartnerConfig = Record<string, PartnerSetting>;

const PARAM = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const VALUE = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Reads the configuration, dropping anything that isn't a known partner with a safe parameter
 * name and value (so a typo can never put arbitrary text into a link).
 */
export function parsePartnerConfig(raw: unknown): PartnerConfig {
  if (typeof raw !== "string" || !raw.trim()) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: PartnerConfig = {};
  for (const p of PARTNERS) {
    const s = (data as Record<string, unknown>)[p.id];
    if (!s || typeof s !== "object") continue;
    const { param, value } = s as Record<string, unknown>;
    if (
      typeof param === "string" &&
      typeof value === "string" &&
      PARAM.test(param) &&
      VALUE.test(value)
    )
      out[p.id] = { param, value };
  }
  return out;
}

/** The configuration this build was made with. Empty unless the owner set it. */
export const PARTNER_CONFIG: PartnerConfig = parsePartnerConfig(
  import.meta.env["VITE_AFFILIATE_PARTNERS"],
);

export function partnerForUrl(url: string): PartnerDef | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return PARTNERS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}

export interface OutboundLink {
  href: string | undefined;
  rel: string;
  /** True only when this link carries a configured partner tracking value */
  affiliate: boolean;
}

/**
 * The link to open. Plain unless the destination is a configured partner and the link is
 * https, in which case the partner's tracking value is added (an existing value of the same
 * name is replaced, never duplicated).
 */
export function outboundLink(url: string, config: PartnerConfig = PARTNER_CONFIG): OutboundLink {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { href: undefined, rel: "noopener noreferrer", affiliate: false };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return { href: undefined, rel: "noopener noreferrer", affiliate: false };
  const partner = partnerForUrl(url);
  const setting = partner ? config[partner.id] : undefined;
  if (!setting || parsed.protocol !== "https:")
    return { href: parsed.toString(), rel: "noopener noreferrer", affiliate: false };
  parsed.searchParams.set(setting.param, setting.value);
  return { href: parsed.toString(), rel: "sponsored noopener noreferrer", affiliate: true };
}

/** What the page says about these links: only ever as much as is true. */
export function affiliateDisclosure(config: PartnerConfig = PARTNER_CONFIG): string {
  const names = PARTNERS.filter((p) => config[p.id]).map((p) => p.name);
  if (names.length === 0)
    return "These are plain search links. Waypoint earns nothing from them today.";
  return `Links to ${names.join(", ")} are affiliate links: if you book through one, Waypoint may earn a commission from that provider. It does not change the price you pay or the order of anything on this page. Every other link is a plain search link.`;
}
