/**
 * What a passport needs to enter a country, from the Passport Index dataset (MIT,
 * passportindex.org via github.com/imorte/passport-index-data; built into
 * src/data/visas.json by `python -m waypoint_data visas`). Guidance with a date on
 * it, never a ruling: wherever it's shown, an official check is one tap away.
 *
 * The table (~14 KB gzipped) loads on demand, so pages that don't need it never pay.
 */

export type EntryKind = "free" | "arrival" | "eta" | "evisa" | "visa" | "none" | "home";

export interface EntryRule {
  kind: EntryKind;
  /** Visa-free days, when the source says */
  days?: number;
}

export interface VisaTable {
  updated: string;
  index: Map<string, number>;
  rows: Map<string, string[]>;
}

/** Build the lookup from the file's rows. */
export function visaTable(rows: readonly (readonly string[])[]): VisaTable {
  const meta = rows[0]!;
  const dests = (meta[2] ?? "").split(",");
  return {
    updated: meta[1] ?? "",
    index: new Map(dests.map((d, i) => [d, i])),
    rows: new Map(rows.slice(1).map((r) => [r[0]!, r[1]!.split(",")])),
  };
}

let table: Promise<VisaTable> | null = null;
/** The table, loaded once. */
export function loadVisas(): Promise<VisaTable> {
  table ??= import("../data/visas.json").then((m) => visaTable(m.default as string[][]));
  return table;
}

/** What a passport (ISO code) needs for a country, or null when the source doesn't say. */
export function entryRule(t: VisaTable, passport: string, country: string): EntryRule | null {
  if (!passport || !country) return null;
  if (passport === country) return { kind: "home" };
  const i = t.index.get(country);
  const row = t.rows.get(passport);
  if (i === undefined || !row) return null;
  const c = row[i]!;
  if (/^\d+$/.test(c)) return { kind: "free", days: Number(c) };
  return (
    ({
      F: { kind: "free" },
      A: { kind: "arrival" },
      T: { kind: "eta" },
      E: { kind: "evisa" },
      V: { kind: "visa" },
      N: { kind: "none" },
      "-": { kind: "home" },
    }[c] as EntryRule | undefined) ?? null
  );
}

/** "visa-free for up to 90 days", "an e-visa before you go"... */
export function entryText(r: EntryRule): string {
  switch (r.kind) {
    case "home":
      return "no visa needed: it's your own country";
    case "free":
      return r.days ? `visa-free for up to ${r.days} days` : "visa-free";
    case "arrival":
      return "a visa on arrival (usually a form and a fee at the border)";
    case "eta":
      return "an electronic travel authorization before you fly (like the US ESTA, Canada's eTA or the UK ETA)";
    case "evisa":
      return "an e-visa, applied for online before you go";
    case "visa":
      return "a visa, applied for before you go";
    case "none":
      return "no entry right now, according to the source";
  }
}

/** Can they walk out of the airport without arranging anything first? */
export const entersFreely = (r: EntryRule | null) =>
  !!r && (r.kind === "free" || r.kind === "arrival" || r.kind === "home");

/** The cross-check every traveler should do: IATA's own travel document rules. */
export const OFFICIAL_CHECK = {
  label: "Check with IATA Travel Centre",
  url: "https://www.iatatravelcentre.com/",
};
