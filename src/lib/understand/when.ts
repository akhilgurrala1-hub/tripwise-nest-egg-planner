/**
 * Reading when and how long from what travelers type: exact dates ("march 3-7",
 * "3/14", "2027-01-05"), relative ones ("this weekend", "in 2 weeks", "next month"),
 * months and seasons ("in march", "this summer"), holidays ("thanksgiving",
 * "spring break") and lengths ("5 nights", "a week and a half", "long weekend").
 * Works on normalized text (see text.ts); every date it gives is today or later.
 */
import { addDays, isIsoDate } from "../dates";

export interface WhenFacts {
  startDate?: string;
  endDate?: string;
  /** Length of the trip in nights */
  nights?: number;
  /** How the start was worked out: an exact date, or a guess from a month, season or holiday */
  startKind?: "exact" | "relative" | "month" | "season" | "holiday";
  /** A trip with no overnight stay ("day trip") */
  dayTrip?: boolean;
  /** Text with the date phrases taken out, for the other readers */
  rest: string;
}

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
const MONTH =
  "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)";
/** A day of the month, never a count ("september 9 people", "july 3 grand"). */
const DAYNUM =
  "(\\d{1,2})(?:st|nd|rd|th)?(?!\\d|\\s*-?\\s*(?:people|persons?|ppl|adults?|kids?|children|nights?|nites|days?|weeks?|months?|of us|friends|buddies|couples|guests|travell?ers|stars?|grand|thousand|k\\b|dollars|bucks|euros?|pounds?|%))";
const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const iso = (y: number, m: number, d: number) => {
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(s) ? s : null;
};
const year = (d: string) => Number(d.slice(0, 4));
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
/** The first `day` (0 = Sunday) on or after a date. */
const onOrAfter = (d: string, day: number) => addDays(d, (day - weekday(d) + 7) % 7);
/** The n-th weekday of a month (n = -1 for the last). */
function nthWeekday(y: number, m: number, day: number, n: number): string {
  if (n > 0) return addDays(onOrAfter(iso(y, m, 1)!, day), 7 * (n - 1));
  const last = addDays(iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1)!, -1);
  return addDays(last, -((weekday(last) - day + 7) % 7));
}
/** Easter Sunday (Anonymous Gregorian algorithm). */
function easter(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day)!;
}

/** This year's date, or next year's when it's already past. */
function upcoming(today: string, make: (y: number) => string | null): string | null {
  const y = year(today);
  const now = make(y);
  if (now && now >= today) return now;
  return make(y + 1);
}

/** A month with no day: the first Friday at least a few days out ("in march"). */
function monthStart(today: string, month: number, explicitYear?: number): string {
  const pick = (y: number) => onOrAfter(iso(y, month, 1)!, 5);
  if (explicitYear) {
    const d = pick(explicitYear);
    return d >= today ? d : onOrAfter(addDays(today, 7), 5);
  }
  const y = year(today);
  const first = pick(y);
  if (first >= today) return first;
  // Already in that month: a Friday a week out, if it's still this month.
  const soon = onOrAfter(addDays(today, 7), 5);
  if (Number(soon.slice(5, 7)) === month && year(soon) === y) return soon;
  return pick(y + 1);
}

interface Holiday {
  pattern: RegExp;
  start: (y: number) => string;
  nights: number;
}

const HOLIDAYS: Holiday[] = [
  { pattern: /\bchristmas eve\b/, start: (y) => iso(y, 12, 23)!, nights: 3 },
  {
    pattern: /\b(christmas|xmas)( break| holidays?| vacation)?\b/,
    start: (y) => iso(y, 12, 23)!,
    nights: 4,
  },
  { pattern: /\bnew years? eve\b|\bnye\b/, start: (y) => iso(y, 12, 30)!, nights: 3 },
  { pattern: /\bnew years?( day)?\b/, start: (y) => iso(y, 12, 30)!, nights: 3 },
  {
    pattern: /\bthanksgiving( break| weekend)?\b/,
    start: (y) => addDays(nthWeekday(y, 11, 4, 4), -1),
    nights: 4,
  },
  {
    pattern: /\b(4th|fourth) of july\b|\bindependence day\b/,
    start: (y) => iso(y, 7, 3)!,
    nights: 3,
  },
  {
    pattern: /\bmemorial day( weekend)?\b/,
    start: (y) => addDays(nthWeekday(y, 5, 1, -1), -3),
    nights: 3,
  },
  {
    pattern: /\blabor day( weekend)?\b/,
    start: (y) => addDays(nthWeekday(y, 9, 1, 1), -3),
    nights: 3,
  },
  {
    pattern: /\b(mlk|martin luther king)( day| jr day)?( weekend)?\b/,
    start: (y) => addDays(nthWeekday(y, 1, 1, 3), -3),
    nights: 3,
  },
  {
    pattern: /\bpresidents? day( weekend)?\b/,
    start: (y) => addDays(nthWeekday(y, 2, 1, 3), -3),
    nights: 3,
  },
  { pattern: /\bvalentines?( day)?\b/, start: (y) => iso(y, 2, 13)!, nights: 2 },
  { pattern: /\beaster( break| weekend)?\b/, start: (y) => addDays(easter(y), -2), nights: 3 },
  { pattern: /\bspring break\b/, start: (y) => addDays(nthWeekday(y, 3, 6, 2), 0), nights: 7 },
  { pattern: /\bhalloween\b/, start: (y) => addDays(iso(y, 10, 31)!, -1), nights: 2 },
  { pattern: /\b(winter break|holiday break)\b/, start: (y) => iso(y, 12, 20)!, nights: 7 },
];

const SEASONS: { pattern: RegExp; month: number }[] = [
  { pattern: /\b(this |next |in the |in |during )?spring\b(?! break)/, month: 4 },
  {
    pattern: /\b(this |next |in the |in |during )?summer( break| vacation| holidays?)?\b/,
    month: 7,
  },
  { pattern: /\b(this |next |in the |in |during )?(fall|autumn)( break)?\b/, month: 10 },
  { pattern: /\b(this |next |in the |in |during )?winter\b(?! break)/, month: 1 },
];

/** Lengths, longest phrases first. Each gives nights. */
const LENGTHS: { pattern: RegExp; nights: (m: RegExpMatchArray) => number }[] = [
  { pattern: /\bweek long\b|\bweeklong\b|\ba week long\b/, nights: () => 7 },
  { pattern: /\b(\d+)\s*d\s*\/?\s*(\d+)\s*n\b/, nights: (m) => Number(m[2]) },
  { pattern: /\ba week and a half\b|\b10 or 11 days\b/, nights: () => 10 },
  { pattern: /\b(\d+) and a half weeks?\b/, nights: (m) => Math.round(Number(m[1]) * 7 + 3) },
  { pattern: /\bhalf a week\b/, nights: () => 3 },
  { pattern: /\b(a|1) fortnight\b|\bfortnight\b/, nights: () => 14 },
  { pattern: /\b(\d+)\s*-?\s*(months?|mos?)\b/, nights: (m) => Math.min(364, Number(m[1]) * 30) },
  { pattern: /\b(a|one) months?\b|\bfor (a|the) month\b|\bmonth long\b/, nights: () => 30 },
  { pattern: /\b(a|one|1) year\b|\byear long\b|\bgap year\b/, nights: () => 364 },
  { pattern: /\b(\d+)\s*-?\s*(weeks?|wks?)\b/, nights: (m) => Number(m[1]) * 7 },
  { pattern: /\b(a|one) week\b|\bweek long\b|\bweeklong\b|\bfor (a|the) week\b/, nights: () => 7 },
  { pattern: /\b(\d+)\s*-?\s*(nights?)\b/, nights: (m) => Number(m[1]) },
  { pattern: /\b(a|one) night\b|\bovernight\b/, nights: () => 1 },
  { pattern: /\b(\d+)\s*-?\s*(days?)\b/, nights: (m) => Math.max(0, Number(m[1]) - 1) },
  { pattern: /\blong weekend\b|\b3 day weekend\b/, nights: () => 3 },
  { pattern: /\bday trip\b|\bfor the day\b|\bsame day\b/, nights: () => 0 },
];

/**
 * What a message says about when and how long. `today` is YYYY-MM-DD.
 * Lengths per city ("3 nights in rome") should be taken out before (see places).
 */
export function readWhen(text: string, today: string): WhenFacts {
  let rest = ` ${text} `;
  const out: WhenFacts = { rest: "" };
  const take = (m: RegExpMatchArray | null) => {
    if (m?.index !== undefined)
      rest = rest.slice(0, m.index) + " ; " + rest.slice(m.index + m[0].length);
  };
  const y0 = year(today);
  const yearOf = (y?: string) => (y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : undefined);
  /** A month/day with no year: this year's, or next year's when it's past. */
  const md = (m: number, d: number, y?: number) =>
    y ? iso(y, m, d) : upcoming(today, (yy) => iso(yy, m, d));

  // 1. Holidays first: "the 4th of july" is the holiday weekend, not just a date.
  if (!out.startDate)
    for (const h of HOLIDAYS) {
      const m = rest.match(h.pattern);
      if (!m) continue;
      const nextYear = /\bnext (year'?s? )?$/.test(rest.slice(0, m.index));
      const start = nextYear ? h.start(y0 + 1) : upcoming(today, (y) => h.start(y));
      if (start) {
        out.startDate = start;
        out.nights = h.nights;
        out.startKind = "holiday";
      }
      take(m);
      break;
    }

  // 2. Exact dates and ranges.
  const exact: { start: string; end?: string; m: RegExpMatchArray }[] = [];
  const isoRange = rest.match(
    /\b(\d{4})-(\d{2})-(\d{2})\b(?:\s*(?:-|to|through|until|and)\s*(\d{4})-(\d{2})-(\d{2})\b)?/,
  );
  if (isoRange) {
    const s = iso(+isoRange[1]!, +isoRange[2]!, +isoRange[3]!);
    const e = isoRange[4] ? iso(+isoRange[4], +isoRange[5]!, +isoRange[6]!) : null;
    if (s) exact.push({ start: s, ...(e ? { end: e } : {}), m: isoRange });
  }
  if (!exact.length) {
    // "march 3 - 7", "march 3 to april 2", "march 3rd, 2027", "from june 1 until june 8"
    const re = new RegExp(
      `\\b${MONTH}\\.? ${DAYNUM}(?:,? (20\\d\\d))?(?:\\s*(?:-|to|through|thru|until|and|till)\\s*(?:${MONTH}\\.? )?${DAYNUM}(?:,? (20\\d\\d))?)?\\b`,
    );
    const m = rest.match(re);
    if (m && !(m[1] === "may" && !m[2])) {
      const sm = MONTHS[m[1]!]!;
      const s = md(sm, +m[2]!, yearOf(m[3]));
      if (s) {
        let e: string | null = null;
        if (m[5]) {
          const em = m[4] ? MONTHS[m[4]]! : sm;
          e = iso(m[6] ? yearOf(m[6])! : year(s) + (em < sm ? 1 : 0), em, +m[5]);
          if (e && e < s) e = iso(year(e) + 1, em, +m[5]);
        }
        exact.push({ start: s, ...(e ? { end: e } : {}), m });
      }
    }
  }
  if (!exact.length) {
    // "3rd of march", "3-7 march", "14 feb to 20 feb"
    const re = new RegExp(
      `(?<!(?:group|party|family|team|crew|squad) of )\\b${DAYNUM}(?:\\s*(?:-|to|through|until)\\s*${DAYNUM})? (?:of )?${MONTH}\\b(?:,? (20\\d\\d))?(?:\\s*(?:-|to|through|until)\\s*${DAYNUM} (?:of )?${MONTH}\\b)?`,
    );
    const m = rest.match(re);
    if (m) {
      const sm = MONTHS[m[3]!]!;
      const s = md(sm, +m[1]!, yearOf(m[4]));
      if (s) {
        let e: string | null = null;
        if (m[2]) e = iso(year(s), sm, +m[2]);
        else if (m[5] && m[6]) {
          const em = MONTHS[m[6]]!;
          e = iso(year(s) + (em < sm ? 1 : 0), em, +m[5]);
        }
        exact.push({ start: s, ...(e ? { end: e } : {}), m });
      }
    }
  }
  if (!exact.length) {
    // US numeric: 3/14, 3/14/27, 3/14 - 3/20
    const m = rest.match(
      /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s*(?:-|to|through|until)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?)?\b/,
    );
    if (m && +m[1]! <= 12) {
      const s = md(+m[1]!, +m[2]!, yearOf(m[3]));
      if (s) {
        const e = m[4]
          ? iso(m[6] ? yearOf(m[6])! : year(s) + (+m[4] < +m[1]! ? 1 : 0), +m[4], +m[5]!)
          : null;
        exact.push({ start: s, ...(e && e >= s ? { end: e } : {}), m });
      }
    }
  }
  if (exact[0] && !out.startDate) {
    out.startDate = exact[0].start;
    if (exact[0].end) out.endDate = exact[0].end;
    out.startKind = "exact";
    take(exact[0].m);
  }

  // 3. Relative days and weeks.
  if (!out.startDate) {
    const rel: [RegExp, () => { start: string; nights?: number }][] = [
      [/\bday after tomorrow\b/, () => ({ start: addDays(today, 2) })],
      [/\btomorrow\b/, () => ({ start: addDays(today, 1) })],
      [/\btoday\b|\btonight\b|\bright now\b|\bnow\b(?= |$)/, () => ({ start: today })],
      [
        /\bthis (coming )?(long )?weekend\b|\bthis wknd\b|(?<!for )\bthe weekend\b(?! after)/,
        () => {
          const wd = weekday(today);
          return {
            start: wd === 6 || wd === 0 ? today : onOrAfter(today, 5),
            nights: wd === 0 ? 0 : 2,
          };
        },
      ],
      [
        /\bnext (long )?weekend\b|\bweekend after next\b/,
        () => ({ start: addDays(onOrAfter(addDays(today, 1), 5), 7), nights: 2 }),
      ],
      [/\bnext week\b/, () => ({ start: onOrAfter(addDays(today, 1), 1) })],
      [/\bthis week\b/, () => ({ start: addDays(today, 1) })],
      [
        /\bnext month\b/,
        () => {
          const m = Number(today.slice(5, 7));
          return { start: monthStart(today, m === 12 ? 1 : m + 1, m === 12 ? y0 + 1 : y0) };
        },
      ],
      [/\bnext year\b/, () => ({ start: monthStart(today, Number(today.slice(5, 7)), y0 + 1) })],
    ];
    for (const [re, make] of rel) {
      const m = rest.match(re);
      if (!m) continue;
      const r = make();
      out.startDate = r.start;
      if (r.nights !== undefined && out.nights === undefined && !/long/.test(m[0]))
        out.nights = r.nights;
      if (/long/.test(m[0])) out.nights = 3;
      out.startKind = "relative";
      take(m);
      break;
    }
  }
  if (!out.startDate) {
    // "in 3 weeks", "in 2 months", "in a month", "10 days from now"
    const m = rest.match(
      /\b(?:in|within) (\d+|a|an) (days?|weeks?|wks?|months?|mos?)\b|\b(\d+) (days?|weeks?|wks?|months?) from (?:now|today)\b/,
    );
    if (m) {
      const n = m[1] ? (/^\d+$/.test(m[1]) ? +m[1] : 1) : +m[3]!;
      const unit = (m[2] ?? m[4])!;
      const days = unit.startsWith("day") ? n : unit.startsWith("week") ? n * 7 : n * 30;
      out.startDate = addDays(today, days);
      out.startKind = "relative";
      take(m);
    }
  }
  if (!out.startDate) {
    // "this friday", "next saturday", "on friday"
    const m = rest.match(
      /\b(this|next|on|coming) (sunday|monday|tuesday|wednesday|thursday|friday|saturday|fri|sat|sun)\b/,
    );
    if (m) {
      const day = WEEKDAYS[m[2]!]!;
      let s = onOrAfter(addDays(today, 1), day);
      if (
        m[1] === "next" &&
        Number(new Date(`${s}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) /
          86_400_000 <
          7 &&
        weekday(today) !== 0
      )
        s = addDays(s, 7);
      out.startDate = s;
      out.startKind = "relative";
      take(m);
    }
  }
  if (!out.startDate) {
    // A bare weekday ("saturday"): the next one.
    const m = rest.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/);
    if (m) {
      out.startDate = onOrAfter(addDays(today, 1), WEEKDAYS[m[1]!]!);
      out.startKind = "relative";
      take(m);
    }
  }

  // 4. Months: "in march", "early june", "march 2027", "next april".
  if (!out.startDate) {
    const re = new RegExp(
      `\\b(?:(early|mid|late|end of|beginning of|start of|the end of) )?(?:(next|this) )?${MONTH}\\b(?:,? (20\\d\\d))?`,
      "g",
    );
    for (const m of rest.matchAll(re)) {
      // "may" and "mar" are also words: only months with a cue ("in may", "may 2027").
      const before = rest.slice(0, m.index);
      const cued =
        /\b(in|early|mid|late|of|during|next|this|until|through|from|by)\s+$/.test(before) ||
        !!m[1] ||
        !!m[2] ||
        !!m[4];
      if ((m[3] === "may" || m[3] === "mar") && !cued) continue;
      const month = MONTHS[m[3]!]!;
      let y = m[4] ? +m[4] : undefined;
      if (m[2] === "next" && !y) y = Number(today.slice(5, 7)) >= month ? y0 + 1 : y0;
      let start = monthStart(today, month, y);
      const when = m[1];
      if (when) {
        const yy = year(start);
        const day = when === "early" || /beginning|start/.test(when) ? 1 : when === "mid" ? 14 : 22;
        const s = onOrAfter(iso(yy, month, day)!, 5);
        start = s >= today ? s : start;
      }
      out.startDate = start;
      out.startKind = "month";
      take(m);
      break;
    }
  }

  // 5. Seasons.
  if (!out.startDate)
    for (const s of SEASONS) {
      const m = rest.match(s.pattern);
      if (!m) continue;
      const next = /next/.test(m[0]);
      let start = monthStart(today, s.month);
      if (next && year(start) === y0 && Number(today.slice(5, 7)) >= s.month - 1)
        start = monthStart(today, s.month, y0 + 1);
      out.startDate = start;
      out.startKind = "season";
      if (/break|vacation|holiday/.test(m[0]) && out.nights === undefined) out.nights = 7;
      take(m);
      break;
    }

  // A year by itself: "in 2027" moves a guess into that year.
  const yearOnly = rest.match(/\b(?:in|for) (20[2-9]\d)\b/);
  if (
    yearOnly &&
    out.startDate &&
    year(out.startDate) < +yearOnly[1]! &&
    out.startKind !== "exact"
  ) {
    out.startDate = out.startDate.replace(/^\d{4}/, yearOnly[1]!);
    take(yearOnly);
  }

  // 6. Length.
  for (const l of LENGTHS) {
    const m = rest.match(l.pattern);
    if (!m) continue;
    const n = l.nights(m);
    // "1800 week long" isn't 1,800 weeks: a length that can't be leaves the text alone.
    if (!Number.isFinite(n) || n < 0 || n > 364) continue;
    out.nights = n;
    if (n === 0) out.dayTrip = true;
    take(m);
    break;
  }
  if (out.nights === undefined && /\bweekend\b/.test(rest)) {
    out.nights = 2;
    take(rest.match(/\b(a |the )?weekend( trip| getaway| away)?\b/));
  }
  // A weekend with no date: the coming one.
  if (!out.startDate && /\bweekend\b/.test(text) && /\b(this|coming)\b/.test(text)) {
    out.startDate = onOrAfter(today, 5);
    out.startKind = "relative";
  }

  // "nov 12-14 then stay the weekend": the trip runs on to that Sunday.
  if (
    out.endDate &&
    /\b(stay|staying|stick around|extend|through|over) (for )?the weekend\b/.test(text)
  ) {
    const sunday = onOrAfter(out.endDate, 0);
    if (sunday > out.endDate) out.endDate = sunday;
  }
  if (out.startDate && out.endDate) {
    const n = Math.round(
      (Date.parse(`${out.endDate}T12:00:00Z`) - Date.parse(`${out.startDate}T12:00:00Z`)) /
        86_400_000,
    );
    if (n >= 0 && n <= 364) out.nights = n;
    else delete out.endDate;
  }
  if (out.startDate && out.startDate < today) delete out.startDate;
  out.rest = rest.replace(/\s+/g, " ").trim();
  return out;
}
