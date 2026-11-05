/**
 * What to do with a layover: whether there's time to leave the airport, whether the
 * traveler's passport lets them (from the visa table), and what to do inside if not.
 * Pure, so the rules (buffers, special cases) are tested.
 */
import type { BookingLink } from "./booking";
import { entersFreely, entryText, OFFICIAL_CHECK, type EntryRule } from "./visas";

export interface LayoverInput {
  minutes: number;
  overnight?: boolean;
  /** The airport: its code, name, town and country */
  code: string;
  name: string;
  city: string;
  country: string;
  /** What their passport needs to enter that country (null when unknown) */
  entry: EntryRule | null;
  /** The passport's country, to tell a home connection from a foreign one */
  passport: string;
}

export type LeaveAnswer = "yes" | "eta" | "visa" | "no" | "unknown";

export interface LayoverAdvice {
  duration: string;
  /** Can they leave the airport on their passport? */
  canLeave: LeaveAnswer;
  leaveText: string;
  /** Minutes free outside once getting out and back through security are counted */
  outsideMinutes: number;
  /** Is there time to go out? */
  verdict: "stay" | "nearby" | "go";
  verdictText: string;
  /** Things to do without leaving */
  inside: string[];
  /** Special rules for this airport or country */
  notes: string[];
  links: BookingLink[];
}

/** Countries where every connecting passenger clears immigration, even just to change planes. */
const ENTRY_TO_CONNECT = new Set(["US", "CA"]);

/** Time to get out (immigration, transport) and back in (check-in cut-off, security) before boarding. */
export const BUFFER_MINUTES = { home: 90, abroad: 180 } as const;

export const durationLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h ? `${h}h` : ""}${h && m ? " " : ""}${m ? `${m}m` : h ? "" : "0m"}`;
};

const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

export function layoverAdvice(l: LayoverInput): LayoverAdvice {
  const home = l.passport === l.country;
  const buffer = home ? BUFFER_MINUTES.home : BUFFER_MINUTES.abroad;
  const outsideMinutes = Math.max(0, l.minutes - buffer);
  const where = l.city || l.name;

  let canLeave: LeaveAnswer = "unknown";
  let leaveText = `Waypoint doesn't know the entry rules for your passport in ${where}. Check before you plan to leave.`;
  if (l.entry) {
    if (entersFreely(l.entry)) {
      canLeave = "yes";
      leaveText = home
        ? "It's your own country, so you can leave the airport."
        : `On your passport it's ${entryText(l.entry)}, so you can usually leave the airport.`;
    } else if (l.entry.kind === "eta") {
      canLeave = "eta";
      leaveText = `To leave the airport you'd need ${entryText(l.entry)}.`;
    } else if (l.entry.kind === "none") {
      canLeave = "no";
      leaveText = `Entry isn't possible on your passport right now, according to the source. Stay airside.`;
    } else {
      canLeave = "visa";
      leaveText = `To leave the airport you'd need ${entryText(l.entry)}. Without one, stay airside (if your passport may transit there).`;
    }
  }

  const verdict: LayoverAdvice["verdict"] =
    outsideMinutes < 90 ? "stay" : outsideMinutes < 240 ? "nearby" : "go";
  // Only promise time outside to someone who can go out: otherwise say what a visa would buy.
  const free = canLeave === "yes";
  const verdictText =
    verdict === "stay"
      ? "Not enough time to leave: getting out and back through security takes most of it."
      : !free && canLeave !== "unknown"
        ? `With ${canLeave === "eta" ? "that authorization" : canLeave === "no" ? "entry" : "a visa"}, there'd be about ${durationLabel(outsideMinutes)} outside. Without it, plan to stay in the airport.`
        : verdict === "nearby"
          ? `About ${durationLabel(outsideMinutes)} outside: enough for a meal or a sight near the airport, not much more.`
          : `About ${durationLabel(outsideMinutes)} outside: time to see a bit of ${where}.`;

  const inside = ["Find your next gate first, then eat or walk the terminal."];
  if (l.minutes >= 120)
    inside.push("A lounge day pass (often $30 to $60) for food, Wi-Fi and showers.");
  if (l.minutes >= 240) inside.push("Showers, a spa or a nap pod, if the airport has them.");
  if (l.minutes >= 360 || l.overnight)
    inside.push(
      "A day room or a transit hotel inside the airport, so you can sleep without going through immigration.",
    );

  const notes: string[] = [];
  if (ENTRY_TO_CONNECT.has(l.country) && !home)
    notes.push(
      `Everyone changing planes in ${l.country === "US" ? "the US" : "Canada"} goes through immigration, even without leaving: you need ${l.entry ? entryText(l.entry) : "the right entry documents"} for this connection itself.`,
    );
  if (l.country === "CN" && l.entry && !entersFreely(l.entry) && l.minutes >= 360)
    notes.push(
      "China offers visa-free transit (up to 240 hours) to many passports flying on to a third country. Check whether yours qualifies before you count on it.",
    );
  if (l.code === "IST" && l.minutes >= 360 && l.minutes <= 24 * 60 && (free || canLeave === "eta"))
    notes.push(
      "Turkish Airlines has offered free city tours (Touristanbul) for long connections at Istanbul. Check whether it's running for your dates.",
    );
  if (l.overnight)
    notes.push("This layover runs overnight: book a bed before you go, airport hotels fill up.");
  if (!home && canLeave !== "yes")
    notes.push(
      "Some passports need an airport transit visa even to stay airside in parts of Europe and the UK. The official check below covers it.",
    );

  const links: BookingLink[] = [
    { label: "Lounges", url: google(`${l.name} lounges day pass`) },
    ...(l.minutes >= 360 || l.overnight
      ? [{ label: "Transit hotels", url: google(`${l.name} transit hotel day room`) }]
      : []),
    ...(verdict !== "stay" && canLeave === "yes"
      ? [
          {
            label: `Near ${where}`,
            url: google(`things to do on a layover in ${where} near ${l.code} airport`),
          },
        ]
      : []),
    OFFICIAL_CHECK,
  ];

  return {
    duration: durationLabel(l.minutes),
    canLeave,
    leaveText,
    outsideMinutes,
    verdict,
    verdictText,
    inside,
    notes,
    links,
  };
}
