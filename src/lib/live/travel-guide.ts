/**
 * Wikivoyage: the free travel guide written by travelers (CC BY-SA). Its articles
 * list places to see, do, eat and drink with a short description, hours and often
 * a price, plus practical advice ("Stay safe", "Get around"). Called from the
 * browser (CORS-enabled, keyless); parsers are pure and tested.
 */
import type { Interest } from "../demo-data";
import type { RealPlace } from "../places/types";
import { classifySight } from "./open-data";

const API = "https://en.wikivoyage.org/w/api.php";

export type GuideType = "see" | "do" | "buy" | "eat" | "drink";

export interface GuideTip {
  topic: "Stay safe" | "Get around";
  text: string;
}

export interface TravelGuide {
  title: string;
  url: string;
  sights: RealPlace[];
  restaurants: RealPlace[];
  tips: GuideTip[];
}

// ---------- Wikitext helpers ----------

/** The template starting at `start` ("{{"), as its inner text, and where it ends. */
function readTemplate(text: string, start: number): { inner: string; end: number } | null {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === "{" && text[i + 1] === "{") {
      depth++;
      i++;
    } else if (text[i] === "}" && text[i + 1] === "}") {
      depth--;
      i++;
      if (depth === 0) return { inner: text.slice(start + 2, i - 1), end: i + 1 };
    }
  }
  return null;
}

/** Split a template's inner text on top-level "|" (not inside nested templates or links). */
function splitParams(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      cur += two;
      i++;
    } else if ((two === "}}" || two === "]]") && depth > 0) {
      depth--;
      cur += two;
      i++;
    } else if (inner[i] === "|" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += inner[i];
  }
  parts.push(cur);
  return parts;
}

/** Wikitext to plain text: links to their words, no templates, refs, markup or HTML. */
export function plainWikitext(s: string): string {
  let t = s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  // Templates that just wrap words keep the words; every other template goes.
  for (let guard = 0; guard < 10 && /\{\{/.test(t); guard++) {
    t = t.replace(/\{\{\s*(?:nowrap|small|smaller|big|lang\|[a-z-]+)\s*\|([^{}]*)\}\}/gi, "$1");
    t = t.replace(/\{\{\s*(?:usd|us\$)\s*\|\s*([\d.,]+)[^{}]*\}\}/gi, "US$$$1");
    t = t.replace(/\{\{[^{}]*\}\}/g, "");
  }
  return t
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1")
    .replace(/\[https?:\/\/[^\]]*\]/g, "")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// ---------- Prices ----------

/** Countries whose "$" means US dollars. Elsewhere "$" is a local dollar, so it isn't counted. */
const USD_COUNTRIES = new Set(["US", "PR", "EC", "SV", "PA", "VI", "GU"]);

/**
 * A listing's price as US dollars per person, when it can be read safely: "Free"
 * is 0, "$29.95 adults, $19.95 children" is 29.95 (the adult price comes first),
 * "$10-20" is 15. Other currencies and unclear text give null (shown as not listed).
 */
export function priceToUsd(text: string, country = "US"): number | null {
  const t = text.trim();
  if (!t) return null;
  const hasNumber = /\d/.test(t);
  if (!hasNumber && /\b(free|no charge|no fee|donations?)\b/i.test(t)) return 0;
  const usdOnly = USD_COUNTRIES.has(country);
  const money = usdOnly
    ? /(?:US\$|USD\s?|\$)\s?(\d+(?:[.,]\d{1,2})?)(?:\s*[-–]\s*(?:US\$|USD\s?|\$)?\s?(\d+(?:[.,]\d{1,2})?))?/i
    : /(?:US\$|USD\s?)\s?(\d+(?:[.,]\d{1,2})?)(?:\s*[-–]\s*(?:US\$|USD\s?)?\s?(\d+(?:[.,]\d{1,2})?))?/i;
  const m = t.match(money);
  if (!m) return /^\s*free\b/i.test(t) ? 0 : null;
  const a = Number(m[1]!.replace(",", "."));
  const b = m[2] ? Number(m[2].replace(",", ".")) : null;
  const v = b !== null && b > a ? (a + b) / 2 : a;
  return Number.isFinite(v) && v >= 0 && v < 2000 ? Math.round(v * 100) / 100 : null;
}

/** Wikivoyage's Eat sections group places by price: Budget, Mid-range, Splurge. */
const EAT_TIER: [RegExp, number][] = [
  [/budget|cheap/i, 12],
  [/mid-?range|moderate/i, 25],
  [/splurge|expensive|fine dining|high-?end/i, 60],
];

// ---------- Listings ----------

const TYPES = new Set(["see", "do", "buy", "eat", "drink", "sleep", "listing"]);
const SECTION_TYPE: Record<string, GuideType> = {
  see: "see",
  do: "do",
  buy: "buy",
  eat: "eat",
  drink: "drink",
};

const TYPE_LABEL: Record<GuideType, string> = {
  see: "Sight",
  do: "Activity",
  buy: "Shopping",
  eat: "Restaurant",
  drink: "Bar or café",
};

const TYPE_INTERESTS: Record<GuideType, Interest[]> = {
  see: ["history", "arts"],
  do: ["adventure", "family"],
  buy: ["shopping"],
  eat: ["food"],
  drink: ["nightlife", "food"],
};

export interface GuideListing {
  type: GuideType;
  name: string;
  /** The subsection it's listed under, e.g. "Museums" or "Budget" */
  group: string;
  description: string;
  address: string;
  hours: string;
  price: string;
  lat: number | null;
  lon: number | null;
}

/** Every See/Do/Buy/Eat/Drink listing in an article, with the subsection it sits in. */
export function parseListings(wikitext: string): GuideListing[] {
  const out: GuideListing[] = [];
  let section = "";
  let group = "";
  let i = 0;
  const headings = [...wikitext.matchAll(/^(={2,4})\s*([^=\n]+?)\s*\1\s*$/gm)].map((m) => ({
    at: m.index ?? 0,
    level: m[1]!.length,
    title: m[2]!.trim(),
  }));
  let h = 0;
  while (i < wikitext.length) {
    const at = wikitext.indexOf("{{", i);
    if (at < 0) break;
    while (h < headings.length && headings[h]!.at < at) {
      const head = headings[h]!;
      if (head.level === 2) {
        section = head.title.toLowerCase();
        group = "";
      } else group = head.title;
      h++;
    }
    const tpl = readTemplate(wikitext, at);
    if (!tpl) break;
    i = tpl.end;
    const [rawName = "", ...rest] = splitParams(tpl.inner);
    const name = rawName.trim().toLowerCase();
    if (!TYPES.has(name)) continue;
    const params: Record<string, string> = {};
    for (const p of rest) {
      const eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
    }
    const kind =
      name === "listing"
        ? (SECTION_TYPE[(params["type"] ?? "").toLowerCase()] ?? SECTION_TYPE[section])
        : SECTION_TYPE[name];
    const title = plainWikitext(params["name"] ?? "");
    if (!kind || !title || title.length > 90) continue;
    const lat = Number(params["lat"]);
    const lon = Number(params["long"] ?? params["lon"]);
    out.push({
      type: kind,
      name: title,
      group,
      description: clip(plainWikitext(params["content"] ?? params["description"] ?? ""), 240),
      address: clip(plainWikitext(params["address"] ?? ""), 100),
      hours: clip(plainWikitext(params["hours"] ?? ""), 80),
      price: clip(plainWikitext(params["price"] ?? ""), 80),
      lat: params["lat"] && Number.isFinite(lat) ? lat : null,
      lon: (params["long"] ?? params["lon"]) && Number.isFinite(lon) ? lon : null,
    });
  }
  return out;
}

/** A listing as a place the planner can use. */
export function listingToPlace(l: GuideListing, near: string, country = "US"): RealPlace {
  const listed = priceToUsd(l.price, country);
  const tier = l.type === "eat" ? EAT_TIER.find(([re]) => re.test(l.group))?.[1] : undefined;
  const cost =
    listed !== null
      ? { costPerPerson: listed, costSource: "listed" as const }
      : tier !== undefined
        ? { costPerPerson: tier, costSource: "price-level" as const }
        : { costPerPerson: 0, costSource: "unknown" as const };
  const groupLabel =
    l.group && !EAT_TIER.some(([re]) => re.test(l.group)) && l.group.length <= 40
      ? l.group.replace(/s$/, "")
      : "";
  const typeLabel = groupLabel || TYPE_LABEL[l.type];
  const fromText = classifySight(`${typeLabel} ${l.description}`);
  return {
    placeId: `wv:${l.type}:${l.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: l.name,
    kind: l.type === "eat" || l.type === "drink" ? "restaurant" : "sight",
    typeLabel,
    description: l.description,
    address: l.address || null,
    rating: null,
    ratingCount: null,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name}, ${near}`)}`,
    ...cost,
    interests: [...new Set([...(fromText ?? []), ...TYPE_INTERESTS[l.type]])],
    hours: l.hours || null,
    priceText: l.price || null,
    ...(l.type === "drink" ? { evening: true } : {}),
    source: "wikivoyage",
  };
}

/** The first couple of sentences of the "Stay safe" and "Get around" sections. */
export function parseTips(wikitext: string): GuideTip[] {
  const tips: GuideTip[] = [];
  for (const topic of ["Stay safe", "Get around"] as const) {
    const m = wikitext.match(
      new RegExp(`^==\\s*${topic}\\s*==\\s*$([\\s\\S]*?)(?=^==[^=]|(?![\\s\\S]))`, "mi"),
    );
    if (!m) continue;
    // Skip sub-headings, listings and bullet fragments; keep the prose.
    const prose = m[1]!
      .split("\n")
      .filter((line) => line.trim() && !/^[=*#:;{|]/.test(line.trim()))
      .join(" ");
    const text = plainWikitext(prose);
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
    const short = sentences
      .slice(0, 2)
      .map((x) => x.trim())
      .join(" ");
    if (short.length >= 30) tips.push({ topic, text: clip(short, 320) });
  }
  return tips;
}

export function parseGuide(body: unknown): { title: string; wikitext: string } | null {
  const pages = (
    body as {
      query?: {
        pages?: { title?: string; revisions?: { slots?: { main?: { content?: string } } }[] }[];
      };
    }
  )?.query?.pages;
  const page = Array.isArray(pages) ? pages[0] : undefined;
  const wikitext = page?.revisions?.[0]?.slots?.main?.content;
  if (!page?.title || typeof wikitext !== "string" || !wikitext.trim()) return null;
  // A redirect or disambiguation page has nothing to plan with.
  if (/^#redirect/i.test(wikitext) || /\{\{\s*disamb/i.test(wikitext)) return null;
  return { title: page.title, wikitext };
}

/** The best-matching Wikivoyage article for a place, read into listings and tips. */
export async function fetchTravelGuide(
  query: string,
  near: string,
  country = "US",
  signal?: AbortSignal,
): Promise<TravelGuide | null> {
  const u = new URL(API);
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "1",
    gsrnamespace: "0",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), signal ? { signal } : {});
  if (!res.ok) throw new Error(`Wikivoyage error (${res.status})`);
  const article = parseGuide(await res.json());
  if (!article) return null;
  const places = parseListings(article.wikitext).map((l) => listingToPlace(l, near, country));
  return {
    title: article.title,
    url: `https://en.wikivoyage.org/wiki/${encodeURIComponent(article.title.replace(/ /g, "_"))}`,
    sights: places.filter((p) => p.kind === "sight"),
    restaurants: places.filter((p) => p.kind === "restaurant"),
    tips: parseTips(article.wikitext),
  };
}
