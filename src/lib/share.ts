/**
 * Share a trip as a link. The whole plan (setup, budget, itinerary, road-trip stops)
 * is packed into the link's #fragment, compressed, so it needs no account, no
 * database and never reaches the server. Private details stay out: bookings and
 * confirmation numbers, the exact start location, the account link and fetched
 * price listings.
 */
import { MAX_TRAVELERS } from "./budget";
import type { TripState } from "./trip-store";

export const SHARE_PATH = "/shared";

/** What goes in a link: a trip without anything private or device-specific. */
export type SharedTrip = Omit<TripState, "id" | "cloud" | "bookings" | "live" | "isSample">;

export function sharedTripPayload(trip: TripState): SharedTrip {
  const {
    id: _id,
    cloud: _cloud,
    bookings: _bookings,
    live: _live,
    isSample: _isSample,
    ...rest
  } = trip;
  // The start city's name is enough; exact coordinates can be someone's home or dorm.
  const { originPoint: _originPoint, ...setup } = rest.setup;
  return { ...rest, setup };
}

// ---- encoding -------------------------------------------------------------

const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string) => {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const canCompress = () =>
  typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(bytes as BodyInit).body!.pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Longest link fragment we'll read (a real trip is a few KB). */
const MAX_ENCODED = 120_000;
/** Largest unpacked trip we'll accept. */
const MAX_JSON = 1_000_000;

/** "z" + compressed JSON, or "j" + plain JSON where the browser can't compress. */
export async function encodeTrip(trip: SharedTrip): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(trip));
  if (!canCompress()) return "j" + toBase64Url(bytes);
  return "z" + toBase64Url(await pipe(bytes, new CompressionStream("deflate-raw")));
}

/** The trip in a link fragment, or null when it's missing, cut off or not a trip. */
export async function decodeTrip(code: string): Promise<SharedTrip | null> {
  try {
    if (!code || code.length > MAX_ENCODED) return null;
    const kind = code[0];
    const bytes = fromBase64Url(code.slice(1));
    let raw: Uint8Array;
    if (kind === "j") raw = bytes;
    else if (kind === "z" && canCompress())
      raw = await pipe(bytes, new DecompressionStream("deflate-raw"));
    else return null;
    if (raw.length > MAX_JSON) return null;
    return cleanSharedTrip(JSON.parse(new TextDecoder().decode(raw)));
  } catch {
    return null;
  }
}

// ---- untrusted input ------------------------------------------------------

const URL_KEY = /(url|link|href|image|photo)$/i;

/** Drop any link that isn't a plain web address (no javascript:, data: and the like). */
function safeLinks(value: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.slice(0, 400).map((v) => safeLinks(v, depth + 1));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (URL_KEY.test(k) && typeof v === "string") {
      out[k] = /^https?:\/\//i.test(v.trim()) ? v : null;
      continue;
    }
    out[k] = safeLinks(v, depth + 1);
  }
  return out;
}

/**
 * A link can be edited by anyone, so treat it as untrusted: keep only the trip's
 * own fields, plain web links and a sane group size. The store's migrate() checks
 * the rest when it's opened.
 */
export function cleanSharedTrip(raw: unknown): SharedTrip | null {
  const t = safeLinks(raw) as Partial<SharedTrip> | null;
  if (!t || typeof t !== "object" || !t.setup || !t.inputs || typeof t.setup !== "object")
    return null;
  const s = t.setup;
  if (typeof s.startDate !== "string" || typeof s.endDate !== "string") return null;
  if (!t.roadTrip || typeof t.roadTrip !== "object") return null;
  const travelers = Math.min(MAX_TRAVELERS, Math.max(1, Math.round(Number(s.travelers) || 1)));
  const { originPoint: _originPoint, ...setup } = s;
  return {
    version: t.version ?? 6,
    setup: { ...setup, travelers },
    inputs: t.inputs,
    overrides: t.overrides ?? {},
    emergencyFund: Number(t.emergencyFund) || 0,
    appliedSavings: t.appliedSavings ?? {},
    itinerary: t.itinerary ?? null,
    roadTrip: t.roadTrip,
  } as SharedTrip;
}

/** The full link for a trip on this site. */
export async function shareUrl(trip: TripState, origin: string): Promise<string> {
  return `${origin}${SHARE_PATH}#trip=${await encodeTrip(sharedTripPayload(trip))}`;
}

/** The trip code from a link's fragment ("#trip=..."). */
export function codeFromHash(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, "")).get("trip") ?? "";
}
