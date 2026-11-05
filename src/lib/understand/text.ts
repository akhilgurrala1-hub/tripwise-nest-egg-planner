/**
 * Cleaning up what travelers type before it's read: lowercase, common typos and
 * texting shorthand spelled out, number words as digits. Pure.
 */

/** Typos and shorthand people really type, spelled out (whole words only). */
const SPELLING: Record<string, string> = {
  tmrw: "tomorrow",
  tmr: "tomorrow",
  tommorow: "tomorrow",
  tomorow: "tomorrow",
  tommorrow: "tomorrow",
  wknd: "weekend",
  wkend: "weekend",
  weeknd: "weekend",
  wekend: "weekend",
  weekened: "weekend",
  weekeend: "weekend",
  wk: "week",
  wks: "weeks",
  bugdet: "budget",
  budjet: "budget",
  buget: "budget",
  budgit: "budget",
  budge: "budget",
  febuary: "february",
  feburary: "february",
  wensday: "wednesday",
  wednesay: "wednesday",
  thurs: "thursday",
  vaca: "vacation",
  vacay: "vacation",
  vacaton: "vacation",
  vaction: "vacation",
  ppl: "people",
  peeps: "people",
  ppls: "people",
  pax: "people",
  bf: "boyfriend",
  gf: "girlfriend",
  hubby: "husband",
  wifey: "wife",
  fiancee: "fiance",
  fam: "family",
  kiddos: "kids",
  kiddies: "kids",
  mum: "mom",
  thru: "through",
  til: "until",
  till: "until",
  nite: "night",
  nites: "nights",
  nts: "nights",
  hols: "holiday",
  xmas: "christmas",
  bday: "birthday",
  b4: "before",
  "2day": "today",
  "2morrow": "tomorrow",
  abt: "about",
  approx: "about",
  roughly: "about",
  around: "around",
  w: "with",
  "w/": "with",
  "w/o": "without",
  plz: "please",
  pls: "please",
  u: "you",
  ur: "your",
  r: "are",
  wanna: "want to",
  gonna: "going to",
  gotta: "have to",
  lemme: "let me",
  kinda: "kind of",
  sorta: "sort of",
  dunno: "do not know",
  idk: "i do not know",
  idc: "i do not care",
  "don't": "do not",
  dont: "do not",
  "i'm": "i am",
  im: "i am",
  "we're": "we are",
  "it's": "it is",
  "let's": "let us",
  lets: "let us",
  "can't": "cannot",
  cant: "cannot",
  "won't": "will not",
  "i'd": "i would",
  "i've": "i have",
  "we'll": "we will",
  "we've": "we have",
  "they're": "they are",
  bucks: "dollars",
  dollar: "dollars",
  usd: "dollars",
  mins: "minutes",
  hrs: "hours",
  hr: "hour",
  biz: "business",
  airplane: "plane",
  aeroplane: "plane",
  carribean: "caribbean",
  carribbean: "caribbean",
  caribean: "caribbean",
  hawai: "hawaii",
  hawii: "hawaii",
  cancun: "cancun",
  europ: "europe",
  itlay: "italy",
  japn: "japan",
  pairs: "paris",
  londn: "london",
  lol: "",
  lmao: "",
  haha: "",
  tbh: "",
  ngl: "",
  rn: "now",
  omg: "",
  ok: "okay",
  k: "okay",
};

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  dozen: 12,
};

/** Accents off ("Cancún" → "Cancun") so names match however they're typed. */
export const plainLetters = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * The text as the readers see it: lowercase, plain letters, typos spelled out,
 * number words as digits ("twenty five" → "25", "a couple" → "2"), "&" as "and".
 * Punctuation that separates ideas (, . ; ! ? → - /) is kept as spaced tokens.
 */
export function normalize(input: string): string {
  let s = plainLetters(String(input ?? ""))
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, " - ")
    .replace(/\u2192|->|=>/g, " to ")
    .replace(/&|\+(?=\s*[a-z])/g, " and ")
    // Emoji and other symbols aren't words.
    .replace(/[^\p{L}\p{N}\s,.;:!?$\u20ac\u00a3\u00a5\u20b9%'/()\-+#~]/gu, " ");
  // Spell out shorthand (whole words; keep "w/" and "w/o" which include a slash).
  s = s.replace(/(^|\s)(w\/o|w\/)(?=\s|$)/g, (_, pre: string, w: string) => `${pre}${SPELLING[w]}`);
  s = s.replace(/[a-z0-9']+/g, (w) => (w in SPELLING ? SPELLING[w]! : w));
  // "a couple (of)" and "a few" are numbers; "couple" alone means two people.
  s = s
    .replace(/\ba couple of\b|\ba couple\b/g, "2")
    .replace(/\ba few\b/g, "3")
    .replace(/\bhalf a dozen\b/g, "6")
    .replace(/\ba dozen\b/g, "12");
  // Number words: "twenty five" → 25, "two" → 2.
  s = s.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/g,
    (_, tens: string, ones: string) => String(NUMBER_WORDS[tens]! + NUMBER_WORDS[ones]!),
  );
  s = s.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|dozen)\b/g,
    (w) => String(NUMBER_WORDS[w]),
  );
  // "1,500" → "1500"; "1.5k" stays for the money reader.
  s = s.replace(/(\d),(\d{3})\b/g, "$1$2").replace(/(\d),(\d{3})\b/g, "$1$2");
  // "st. petersburg", "mt. rainier", "ft. lauderdale": the dot isn't the end of a sentence.
  s = s.replace(/\b(st|mt|ft|pt)\.\s/g, "$1 ");
  // Separators as their own tokens, then single spaces.
  s = s
    .replace(/([,;!?()])/g, " $1 ")
    .replace(/:(\s|$)/g, " : ")
    .replace(/\.(\s|$)/g, " . ");
  return s.replace(/\s+/g, " ").trim();
}

/** Whole-word test on normalized text. */
export const hasWord = (text: string, pattern: RegExp) => pattern.test(` ${text} `);

/** Plain words for matching names: letters and digits only, single spaces. */
export const plainName = (s: string) =>
  plainLetters(s)
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
