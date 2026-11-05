/**
 * Reading a budget from what travelers type: "$1,500", "2k", "under 3000",
 * "about 800 bucks each", "between 1500 and 2000", "€900". Only a number with a
 * money cue counts, so "4 people" or "5 nights" never become a budget.
 */
export interface MoneyFacts {
  /** The amount they gave (the top of a range), in its own currency */
  amount?: number;
  /** ISO currency of the amount (USD unless a symbol or word said otherwise) */
  currency?: string;
  /** "each", "per person": multiply by the group */
  perPerson?: boolean;
  /** "$150 a night": a lodging hint, not the total */
  perNight?: number;
  /** "$100 a day" per person or for the group: a daily spend */
  perDay?: number;
  rest: string;
}

const SYMBOL: Record<string, string> = {
  $: "USD",
  "\u20ac": "EUR",
  "\u00a3": "GBP",
  "\u00a5": "JPY",
  "\u20b9": "INR",
};
const WORD: Record<string, string> = {
  dollars: "USD",
  euro: "EUR",
  euros: "EUR",
  eur: "EUR",
  pounds: "GBP",
  pound: "GBP",
  gbp: "GBP",
  quid: "GBP",
  cad: "CAD",
  aud: "AUD",
  yen: "JPY",
  rupees: "INR",
  rupee: "INR",
  pesos: "MXN",
  mxn: "MXN",
};
const NUM = "(\\d+(?:\\.\\d+)?)\\s*(k|thousand|grand)?";
const CUE =
  "(?:budget(?: is| of)?|spend(?:ing)?|under|below|less than|max(?:imum)?|up to|no more than|cap(?:ped at)?|afford|around|about|roughly|have|got|total(?: of)?|for like|like|~)";
/** Words that make a number a count, not money ("4 people", "5 nights"). */
const UNIT_AFTER =
  /^\s*(people|persons?|travell?ers|adults|kids|children|guests|of us|nights?|hours?|minutes?|miles?|km|stars?|am|pm|bedrooms?|rooms?)\b/;
/** Time words after a small number ("3 weeks"); a big one is still money ("max 7500 week long"). */
const TIME_AFTER = /^\s*(days?|weeks?|months?|years?)\b/;

const value = (n: string, k?: string) => Math.round(Number(n) * (k ? 1000 : 1));

export function readMoney(text: string): MoneyFacts {
  let rest = ` ${text} `;
  const out: MoneyFacts = { rest: "" };
  const take = (start: number, length: number) => {
    rest = rest.slice(0, start) + " ; " + rest.slice(start + length);
  };
  const found: { amount: number; currency: string; index: number; length: number }[] = [];

  // "$1500 - 2000", "1500 to 2000 dollars", "between 1500 and 2000 dollars"
  const range = new RegExp(
    `(?:between\\s+)?([$\u20ac\u00a3\u00a5\u20b9])?\\s*${NUM}\\s*(?:-|to|and)\\s*([$\u20ac\u00a3\u00a5\u20b9])?\\s*${NUM}\\s*(dollars|euros?|pounds?|eur|gbp|cad|aud|yen)?`,
  );
  const r = rest.match(range);
  if (
    r &&
    (r[1] || r[4] || r[7] || /between|budget|spend/.test(rest)) &&
    !UNIT_AFTER.test(rest.slice(r.index! + r[0].length))
  ) {
    const hi = Math.max(value(r[2]!, r[3]), value(r[5]!, r[6] ?? r[3]));
    const currency = SYMBOL[r[1] ?? r[4] ?? ""] ?? WORD[r[7] ?? ""] ?? "USD";
    if (hi >= 20) found.push({ amount: hi, currency, index: r.index!, length: r[0].length });
  }
  if (!found.length) {
    const patterns: RegExp[] = [
      new RegExp(`([$\u20ac\u00a3\u00a5\u20b9])\\s*${NUM}`),
      new RegExp(
        `${NUM}\\s*(dollars|euros?|pounds?|eur|gbp|quid|cad|aud|yen|rupees?|pesos|mxn)\\b`,
      ),
      new RegExp(`\\b${CUE}\\s*(?:is\\s*|of\\s*|at\\s*)?${NUM}\\b`),
      /\b(\d+(?:\.\d+)?)\s*(k|grand|thousand)\b/,
    ];
    // Every match of each pattern: "max 1 stop ... budget 400" skips the first and reads the second.
    outer: for (const [i, re] of patterns.entries()) {
      for (const m of rest.matchAll(new RegExp(re.source, "g"))) {
        const after = rest.slice(m.index! + m[0].length);
        if (UNIT_AFTER.test(after)) continue;
        if (TIME_AFTER.test(after) && i >= 2 && Number(m[1]) < 50) continue;
        let amount: number;
        let currency = "USD";
        if (i === 0) {
          amount = value(m[2]!, m[3]);
          currency = SYMBOL[m[1]!] ?? "USD";
        } else if (i === 1) {
          amount = value(m[1]!, m[2]);
          currency = WORD[m[3]!] ?? "USD";
        } else if (i === 2) {
          amount = value(m[1]!, m[2]);
          // "about 3" or "around 10" alone are rarely money.
          if (amount < 50) continue;
        } else amount = value(m[1]!, "k");
        if (amount < 20 && !m[0].includes("k")) continue;
        found.push({ amount, currency, index: m.index!, length: m[0].length });
        break outer;
      }
    }
  }
  const hit = found[0];
  if (hit) {
    const after = rest.slice(hit.index + hit.length, hit.index + hit.length + 30);
    const night = /^\s*(?:a|per|\/|each)?\s*(?:night|nightly)\b/.test(after);
    const day = /^\s*(?:a|per|\/)\s*day\b/.test(after);
    const each =
      /^\s*(?:per person|pp|each|a head|per head|a person|per traveler|apiece|per adult)\b/.test(
        after,
      ) || /\b(each|per person)\b/.test(rest.slice(Math.max(0, hit.index - 12), hit.index));
    if (night) out.perNight = hit.amount;
    else if (day) out.perDay = hit.amount;
    else {
      out.amount = hit.amount;
      if (each) out.perPerson = true;
    }
    out.currency = hit.currency;
    take(hit.index, hit.length);
  }
  out.rest = rest.replace(/\s+/g, " ").trim();
  return out;
}
