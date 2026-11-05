/**
 * Reading places from a message: where they're going (every city, in order, with
 * the nights in each when given), where they leave from, and whether the place is
 * a whole country or region ("japan", "europe") that needs narrowing down.
 */
import type { GeoPoint } from "../catalog";
import {
  everydayWordAllowed,
  type Gazetteer,
  type PlaceCandidate,
  type PlaceKind,
} from "./gazetteer";
import { plainName } from "./text";

export interface PlaceRef {
  name: string;
  kind: PlaceKind;
  country: string;
  point: GeoPoint | null;
  /** Nights there, when the traveler said */
  nights?: number;
  /** They said days, not nights ("3 days in rome") */
  days?: boolean;
}

export interface WhereFacts {
  /** Places they're going, in order */
  cities: PlaceRef[];
  origin?: PlaceRef;
  /** They're going home (or to family): the destination is where they're from */
  goingHome?: boolean;
  /** "rome, florence and venice for 10 days": the length after a list is the whole trip's */
  totalNights?: number;
  /** "paris or rome": places to choose between, not a route */
  choices?: PlaceRef[];
  rest: string;
}

export interface WhereContext {
  gazetteer: Gazetteer;
  /** The traveler's home town ("Charlotte, NC"), to tell the start from the destination */
  homeCity?: string;
  /** Their country, to prefer places there when a name is shared */
  homeCountry?: string;
  /** Words typed with a capital in the original message (plain), e.g. "nice" for "Nice" */
  capitalized?: Set<string>;
  /** Codes typed in capitals ("JFK") */
  upperCodes?: Set<string>;
}

const ORIGIN_CUE =
  /(?:^|\s)(from|leaving|leave|out of|departing|depart|starting in|starting from|start in|start from|based in|live in|living in|i am in|we are in|we live in|i live in|home is|coming from|flying out of|fly out of|driving from|near|close to|around)\s*$/;
const DEST_CUE =
  /(?:^|\s)(to|visit|visiting|see|seeing|explore|exploring|in|at|tour|towards?|heading|head|go|going|trip|travel|traveling|travelling|fly|flying|drive|driving|then|and|plus|also|or|stop in|stopping in|stay in|staying in|via|through|land in|ending in|end in|back to)\s*$/;
const STOP = new Set([
  "visiting",
  "visit",
  "about",
  "thinking",
  "how",
  "headed",
  "heading",
  "lets",
  "let",
  "take",
  "dreaming",
  "planning",
  "looking",
  "need",
  "going",
  "wanna",
  "into",
  "love",
  "then",
  "nites",
  "nights",
  "plan",
  "can",
  "sometime",
  "around",
  "over",
  "fly",
  "flying",
  "driving",
  "leaving",
  "staying",
  "stay",
  "trip",
  "maybe",
  "also",
  "after",
  "before",
  "back",
  "up",
  "down",
  "out",
  "off",
  "via",
  "through",
  "until",
  "between",
  "during",
  "where",
  "what",
  "which",
  "who",
  "when",
  "why",
  "anywhere",
  "places",
  "spot",
  "spots",
  "cheap",
  "fancy",
  "luxury",
  "budget",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "summer",
  "winter",
  "spring",
  "fall",
  "autumn",
  "christmas",
  "thanksgiving",
  "easter",
  "weekend",
  "tomorrow",
  "today",
  "tonight",
  "early",
  "late",
  "mid",
  "end",
  "both",
  "just",
  "only",
  "all",
  "with",
  "wife",
  "husband",
  "kids",
  "son",
  "daughter",
  "mom",
  "dad",
  "parents",
  "friend",
  "partner",
  "girlfriend",
  "boyfriend",
  "a",
  "an",
  "the",
  "i",
  "me",
  "my",
  "we",
  "us",
  "our",
  "you",
  "it",
  "is",
  "to",
  "in",
  "on",
  "at",
  "for",
  "of",
  "and",
  "or",
  "with",
  "from",
  "go",
  "want",
  "trip",
  "travel",
  "somewhere",
  "anywhere",
  "there",
  "here",
  "home",
  "place",
  "city",
  "town",
  "visit",
  "see",
  "do",
  "be",
  "get",
  "take",
  "plan",
  "need",
  "like",
  "love",
  "would",
  "will",
  "can",
  "could",
  "should",
  "please",
  "help",
  "know",
  "not",
  "no",
  "yes",
  "okay",
  "next",
  "this",
  "that",
  "some",
  "any",
  "nights",
  "night",
  "days",
  "day",
  "weeks",
  "week",
  "month",
  "months",
  "weekend",
  "people",
  "family",
  "friends",
  "kids",
  "budget",
  "dollars",
  "cheap",
  "luxury",
  "flight",
  "flights",
  "car",
  "train",
  "bus",
  "cruise",
  "beach",
  "beaches",
  "mountains",
  "hotel",
  "hotels",
]);

const tokenize = (t: string) => t.split(" ").filter(Boolean);
const isSep = (tok: string) => /^[,;.!?:()]+$/.test(tok) || tok === "-";
const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** State codes that are never everyday words, safe in lowercase ("asheville nc"). */
const SAFE_CODES = new Set(
  "nc sc ny nj tx fl ca az nv ut wa va wv tn ky ga mi wi mn ia ks nd sd nm ct ri vt nh ak md dc mt wy ne".split(
    " ",
  ),
);

/** Short state codes that are also words ("in", "me", "on"): only a qualifier when it narrows a real city. */
const WORDY_CODES = new Set(
  "in or me hi oh ok la de pa ma al co id ms mo ne ar wa on pe ns nt act sa vic tas nl nb mb sk ab yt nu bc qc".split(
    " ",
  ),
);

interface Qualifier {
  end: number;
  country?: string;
  state?: [string, string, string];
  /** A short code that's also a word: only trusted when it narrows a known city */
  wordy: boolean;
}

function qualifierAt(
  tokens: string[],
  j: number,
  g: Gazetteer,
  ctx: WhereContext,
): Qualifier | null {
  let k = j;
  const comma = tokens[k] === ",";
  if (comma) k++;
  for (let n = 3; n >= 1; n--) {
    const words = tokens.slice(k, k + n);
    if (words.length < n || words.some(isSep)) continue;
    const phrase = plainName(words.join(" ")).replace(/^the /, "");
    const state = g.states.get(phrase);
    if (state) {
      const code = phrase.length <= 3 && state[1].toLowerCase() === phrase;
      const typedUpper = !!ctx.upperCodes?.has(phrase.toUpperCase());
      if (!code || typedUpper || SAFE_CODES.has(phrase)) return { end: k + n, state, wordy: false };
      if (comma) return { end: k + n, state, wordy: WORDY_CODES.has(phrase) };
    }
    const country = g.countries.get(phrase);
    if (country && (phrase.length > 2 || comma))
      return { end: k + n, country, wordy: phrase.length <= 2 };
  }
  return null;
}

function best(
  cands: PlaceCandidate[],
  ctx: WhereContext,
  contextCountries: Set<string>,
): PlaceCandidate {
  return [...cands].sort((a, b) => score(b) - score(a))[0]!;
  function score(c: PlaceCandidate) {
    return (
      c.weight +
      (c.country && c.country === ctx.homeCountry && c.kind === "city" ? 1 : 0) +
      (c.country && contextCountries.has(c.country) ? 2 : 0)
    );
  }
}

interface Mention {
  start: number;
  end: number;
  cands: PlaceCandidate[];
  qualified: boolean;
  /** Typed a capitalized unknown town after a travel word ("to Hendersonville") */
  guess?: string;
}

/** Every place mentioned, in the order typed. */
function findMentions(tokens: string[], ctx: WhereContext): Mention[] {
  const g = ctx.gazetteer;
  const out: Mention[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (
      isSep(tokens[i]!) ||
      (STOP.has(tokens[i]!) && !g.names.has(tokens[i]!) && !g.starts.has(tokens[i]!))
    ) {
      // Airport codes typed in capitals are places too ("jfk to lax").
      i++;
      continue;
    }
    let hit: Mention | null = null;
    for (let n = Math.min(g.maxWords, tokens.length - i); n >= 1 && !hit; n--) {
      const words = tokens.slice(i, i + n);
      if (words.some(isSep)) continue;
      const phrase = plainName(words.join(" "));
      const key = phrase.replace(/^the /, "");
      let cands = g.names.get(key);
      const q = qualifierAt(tokens, i + n, g, ctx);
      // "lyon and nice", "2 in nice": next to another place, an everyday word is a place.
      const prev = out.at(-1);
      const between = prev ? tokens.slice(prev.end, i) : [];
      const listed =
        !!prev &&
        between.length > 0 &&
        between.length <= 6 &&
        between.every((t) =>
          /^(,|and|then|or|&|\d+|nights?|nites|n|days?|in|to|\(|\)|plus|:)$/.test(t),
        );
      if (n === 1 && cands && !everydayWordAllowed(key, !!ctx.capitalized?.has(key) || listed, !!q))
        cands = undefined;
      if (!cands && n === 1 && ctx.upperCodes?.has(key.toUpperCase())) {
        const code = g.codes.get(key.toUpperCase());
        if (code) cands = [code];
      }
      if (cands) {
        let list = cands;
        let end = i + n;
        if (q) {
          const narrowed = cands.filter((c) =>
            q.state ? c.region === q.state[1] && c.country === q.state[0] : c.country === q.country,
          );
          if (q.wordy && !narrowed.length) {
            // "savannah, me and 3 friends": "me" isn't Maine here.
            hit = { start: i, end: i + n, cands, qualified: false };
            break;
          }
          // A known qualifier: keep the matches in that state or country, or make the place from both.
          if (narrowed.length) list = narrowed;
          else if (cands.every((c) => c.kind === "city" || c.kind === "region")) {
            const label = q.state
              ? q.state[0] === "US"
                ? `${titleCase(phrase)}, ${q.state[1]}`
                : `${titleCase(phrase)}, ${g.countryName.get(q.state[0])}`
              : `${titleCase(phrase)}, ${g.countryName.get(q.country!) ?? q.country}`;
            list = [
              {
                name: label,
                kind: "city",
                country: q.state?.[0] ?? q.country ?? "",
                region: q.state?.[1] ?? "",
                point: null,
                weight: 5,
              },
            ];
          }
          if (list !== cands || narrowed.length) end = q.end;
        }
        // A state or country name right after a city is its qualifier, not another place.
        hit = { start: i, end, cands: list, qualified: !!q };
      } else if (q && !q.wordy && n <= 3 && words.every((w) => !STOP.has(w) && /^[a-z]/.test(w))) {
        // An unknown town with its state or country: "blowing rock, nc", "hallstatt austria".
        const allCap = words.every((w) => ctx.capitalized?.has(w));
        const cue =
          DEST_CUE.test(` ${tokens.slice(Math.max(0, i - 3), i).join(" ")}`) ||
          ORIGIN_CUE.test(` ${tokens.slice(Math.max(0, i - 3), i).join(" ")}`);
        if (allCap || cue) {
          const label = q.state
            ? q.state[0] === "US"
              ? `${titleCase(phrase)}, ${q.state[1]}`
              : `${titleCase(phrase)}, ${g.countryName.get(q.state[0])}`
            : `${titleCase(phrase)}, ${g.countryName.get(q.country!) ?? q.country}`;
          hit = {
            start: i,
            end: q.end,
            cands: [
              {
                name: label,
                kind: "city",
                country: q.state?.[0] ?? q.country ?? "",
                region: q.state?.[1] ?? "",
                point: null,
                weight: 5,
              },
            ],
            qualified: true,
          };
        }
      }
    }
    if (!hit) {
      // A capitalized name after a travel word, even if Waypoint doesn't know it: "to Hendersonville".
      const before = ` ${tokens.slice(Math.max(0, i - 2), i).join(" ")}`;
      if (
        (DEST_CUE.test(before) || ORIGIN_CUE.test(before)) &&
        ctx.capitalized?.has(tokens[i]!) &&
        !STOP.has(tokens[i]!) &&
        /^[a-z]{3,}$/.test(tokens[i]!)
      ) {
        let n = 1;
        while (
          n < 3 &&
          tokens[i + n] &&
          ctx.capitalized?.has(tokens[i + n]!) &&
          !STOP.has(tokens[i + n]!)
        )
          n++;
        const name = titleCase(tokens.slice(i, i + n).join(" "));
        hit = {
          start: i,
          end: i + n,
          cands: [{ name, kind: "city", country: "", region: "", point: null, weight: 1 }],
          qualified: false,
          guess: name,
        };
      }
    }
    if (hit) {
      out.push(hit);
      i = hit.end;
    } else i++;
  }
  return out;
}

const NIGHT_UNIT = "(?:nights?|nts|n|days?|d)";

export function readWhere(text: string, ctx: WhereContext): WhereFacts {
  const tokens = tokenize(text);
  const mentions = findMentions(tokens, ctx);
  const out: WhereFacts = { cities: [], rest: "" };
  if (!mentions.length) {
    out.rest = text;
    return out;
  }
  const g = ctx.gazetteer;
  // Countries of the places that only have one reading, to settle shared names ("Florence" with Rome).
  const sure = new Set(
    mentions
      .filter((m) => m.cands.length === 1 && m.cands[0]!.country)
      .map((m) => m.cands[0]!.country),
  );
  const homePlain = ctx.homeCity ? plainName(ctx.homeCity.split(",")[0] ?? "") : "";
  const consumed = new Set<number>();
  const refs = mentions.map((m, idx) => {
    const c = best(m.cands, ctx, sure);
    const before = ` ${tokens.slice(Math.max(0, m.start - 4), m.start).join(" ")}`;
    const after = tokens.slice(m.end, m.end + 4).join(" ");
    let role: "origin" | "dest" | "unknown" = ORIGIN_CUE.test(before)
      ? "origin"
      : DEST_CUE.test(before)
        ? "dest"
        : "unknown";
    // "chicago to denver": a place right before "to <place>" is where they start.
    const next = mentions[idx + 1];
    if (
      role === "unknown" &&
      next &&
      /^(?:, )?(?:[a-z]{2,3} )?to$/.test(tokens.slice(m.end, next.start).join(" ").trim()) &&
      mentions.length === 2
    )
      role = "origin";
    if (
      role !== "dest" &&
      homePlain &&
      plainName(c.name.split(",")[0] ?? "") === homePlain &&
      mentions.length > 1
    )
      role = "origin";
    for (let k = m.start; k < m.end; k++) consumed.add(k);
    // Nights in this city: "3 nights in rome", "rome for 3 nights", "rome (3 nights)", "rome 3n".
    let nights: number | undefined;
    let viaFor = false;
    let inDays = false;
    const pre = tokens.slice(Math.max(0, m.start - 4), m.start).join(" ");
    // "3 nights in rome", "2 in florence", "3 nights lisbon"
    const preM = pre.match(
      new RegExp(`(\\d+)\\s*(?:${NIGHT_UNIT}\\s*(?:in|at)|(?:nights?|nts|n)|in|at)\\s*$`),
    );
    const post = tokens.slice(m.end, m.end + 5).join(" ");
    const postM =
      post.match(
        new RegExp(`^(?:,\\s*)?(?:for\\s+|\\(\\s*|:\\s*|-\\s*)?(\\d+)\\s*${NIGHT_UNIT}\\b\\s*\\)?`),
      ) ?? post.match(/^\(\s*(\d+)\s*\)/);
    if (role === "origin") {
      // Where they start has no nights; leave the length for the trip.
    } else if (preM && (new RegExp(NIGHT_UNIT).test(preM[0]) || idx > 0)) {
      nights = +preM[1]!;
      inDays = /\b(days?|d)\b/.test(preM[0]);
      const len = tokenize(preM[0]).length;
      for (let k = m.start - len; k < m.start; k++) consumed.add(k);
    } else if (postM) {
      nights = +postM[1]!;
      // "...venice for 10 days" or "...florence, 6 nights": after a list, maybe the trip's length.
      viaFor = /^(?:,\s*)?for\s|^,/.test(postM[0]);
      inDays = /\b(days?|d)\b/.test(postM[0]);
      const len = tokenize(postM[0]).length;
      for (let k = m.end; k < m.end + len; k++) consumed.add(k);
    }
    return {
      ref: {
        name: c.name,
        kind: c.kind,
        country: c.country,
        point: c.point,
        ...(nights !== undefined && nights > 0 && nights < 365 ? { nights } : {}),
        ...(inDays ? { days: true } : {}),
      } satisfies PlaceRef,
      role,
      after,
      viaFor,
    };
  });
  // "Italy: Rome, Florence" or "Europe: Paris and Rome": the country or region is
  // only the frame when its cities are named too.
  const cityCountries = new Set(
    refs.filter((r) => r.ref.kind === "city" && r.role !== "origin").map((r) => r.ref.country),
  );
  const hasCities = cityCountries.size > 0;
  const firstCity = refs.findIndex((r) => r.ref.kind === "city" && r.role !== "origin");
  for (let k = refs.length - 1; k >= 0; k--) {
    const r = refs[k]!;
    // Only a frame before the cities ("italy: rome, florence"); "then sicily" is a stop.
    if (r.role === "origin" || r.ref.kind === "city" || !hasCities || k > firstCity) continue;
    if (r.ref.kind === "region" || cityCountries.has(r.ref.country) || cityCountries.has("")) {
      // "a 10 day japan trip, tokyo and kyoto": the country's length is the trip's.
      if (r.ref.nights !== undefined && out.totalNights === undefined)
        out.totalNights = r.ref.days ? Math.max(0, r.ref.nights - 1) : r.ref.nights;
      refs.splice(k, 1);
    }
  }
  // "rome, florence and venice for 10 days": a length only after the last of several
  // cities is the whole trip's, not the last city's.
  const dests = refs.filter((r) => r.role !== "origin");
  if (
    dests.length >= 2 &&
    dests.at(-1)!.viaFor &&
    dests.slice(0, -1).every((r) => r.ref.nights === undefined)
  ) {
    const last = dests.at(-1)!.ref;
    const n = last.nights;
    if (n !== undefined) out.totalNights = last.days ? Math.max(0, n - 1) : n;
    delete dests.at(-1)!.ref.nights;
  }
  // "paris or maybe rome": a choice, not a route.
  const choiceIdx = mentions.map((m, k) =>
    k > 0
      ? tokens
          .slice(mentions[k - 1]!.end, m.start)
          .join(" ")
          .trim()
      : "",
  );
  const destIdx = refs.map((r, k) => (r.role !== "origin" ? k : -1)).filter((k) => k >= 0);
  if (
    destIdx.length >= 2 &&
    destIdx
      .slice(1)
      .every((k) =>
        /^(?:, )?(?:or|or maybe|or perhaps|or possibly|maybe|either|vs|versus)$/.test(
          choiceIdx[k] ?? "",
        ),
      )
  ) {
    out.choices = destIdx.map((k) => refs[k]!.ref);
    for (let k = destIdx.length - 1; k >= 0; k--) refs.splice(destIdx[k]!, 1);
  }
  const origins = refs.filter((r) => r.role === "origin");
  if (origins[0]) out.origin = origins[0].ref;
  const seen = new Set<string>();
  for (const r of refs) {
    if (r.role === "origin") continue;
    const key = plainName(r.ref.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.cities.push(r.ref);
  }
  // The same place as both start and destination ("from rome to rome") stays the destination.
  if (out.origin && out.cities.some((c) => plainName(c.name) === plainName(out.origin!.name)))
    delete out.origin;
  out.goingHome =
    /\b(going|go|fly|flying|head|heading|back) home\b|\bhome for\b|\bvisit(ing)? (my |our )?(family|parents|folks)\b/.test(
      text,
    );
  void g;
  out.rest = tokens.map((t, k) => (consumed.has(k) ? ";" : t)).join(" ");
  return out;
}

/** "Rome 3 nights, Florence 2" style label for a list of cities. */
export const citiesLabel = (cities: readonly PlaceRef[]) =>
  cities
    .map(
      (c) =>
        `${c.name.split(",")[0]}${c.nights ? ` ${c.nights} night${c.nights === 1 ? "" : "s"}` : ""}`,
    )
    .join(", ");
