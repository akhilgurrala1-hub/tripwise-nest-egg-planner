/**
 * Reading who's going: "just me", "my wife and I", "family of 5", "2 adults and 3
 * kids", "me and 4 friends", "honeymoon". When the number is a guess ("with the
 * kids"), `sure` is false so the assistant can check.
 */
export interface PeopleFacts {
  travelers?: number;
  sure?: boolean;
  kids?: boolean;
  /** What kind of group, for questions and ideas */
  group?: "solo" | "couple" | "family" | "friends" | "group";
  rest: string;
}

const ONE = [
  "wife",
  "husband",
  "partner",
  "spouse",
  "girlfriend",
  "boyfriend",
  "fiance",
  "fiancee",
  "mom",
  "mother",
  "dad",
  "father",
  "sister",
  "brother",
  "son",
  "daughter",
  "friend",
  "roommate",
  "bestie",
  "best friend",
  "bff",
  "grandma",
  "grandpa",
  "grandmother",
  "grandfather",
  "cousin",
  "aunt",
  "uncle",
  "niece",
  "nephew",
  "colleague",
  "coworker",
  "boss",
  "mother in law",
  "father in law",
  "sister in law",
  "brother in law",
  "baby",
  "toddler",
  "kid",
  "child",
  "teen",
  "teenager",
  "stepson",
  "stepdaughter",
  "buddy",
  "pal",
  "mate",
  "plus one",
  "other half",
  "significant other",
];
const PAIR = ["parents", "grandparents", "in laws", "folks", "twins"];
const SOME = [
  "kids",
  "children",
  "friends",
  "sons",
  "daughters",
  "cousins",
  "siblings",
  "buddies",
  "mates",
  "girls",
  "guys",
  "boys",
  "family",
  "teens",
  "grandkids",
  "grandchildren",
];
const KID =
  /\b(kids?|children|child|son|daughter|baby|toddler|teens?|teenagers?|twins|family|grandkids|stepson|stepdaughter|niece|nephew)\b/;
const PEOPLE =
  "(people|persons|person|travell?ers|adults|guests|of us|pax|folks|friends|buddies|girls|guys|ladies|couples|family members)";

export function readPeople(text: string): PeopleFacts {
  let rest = ` ${text} `;
  const out: PeopleFacts = { rest: "" };
  const take = (m: RegExpMatchArray) => {
    rest = rest.slice(0, m.index) + " ; " + rest.slice(m.index! + m[0].length);
  };
  const set = (n: number, sure: boolean, group?: PeopleFacts["group"]) => {
    if (n >= 1 && n <= 50) {
      out.travelers = Math.min(20, n);
      out.sure = sure;
      if (group) out.group = group;
    }
  };
  out.kids =
    KID.test(rest) &&
    !/\bno kids\b|\bwithout (the )?kids\b|\bkid free\b|\badults only\b/.test(rest);

  // Hosts aren't travelers: "staying with my parents", "visiting my sister".
  rest = rest.replace(
    /\b(staying with|stay with|visit(?:ing)?|see(?:ing)?|crash(?:ing)? (?:with|at)|at|meet(?:ing)?|meet up with) (my|our) (parents|mom|dad|mother|father|family|folks|grandparents|grandma|grandpa|sister|brother|aunt|uncle|cousins?|friends?|in laws|son|daughter)('s)?( place| house)?\b/g,
    " ; ",
  );
  let m: RegExpMatchArray | null;
  if (
    (m = rest.match(
      /\b(\d+) adults?\s*(?:and|,|with|plus|\+|&)?\s*(\d+) (kids?|children|teens?|babies|toddlers|infants)\b/,
    ))
  ) {
    set(+m[1]! + +m[2]!, true, "family");
    take(m);
  } else if ((m = rest.match(/\b(\d+) couples\b/))) {
    set(+m[1]! * 2, true, "group");
    take(m);
  } else if ((m = rest.match(/\b(?:family|group|party|team|crew|squad|gang) of (\d+)\b/))) {
    set(+m[1]!, true, /family/.test(m[0]) ? "family" : "group");
    take(m);
  } else if (
    (m = rest.match(
      /\b(?:the )?(\d+) of us\b|\bwe are (\d+)\b|\bthere (?:are|will be) (\d+)(?: of us)?\b|\bwe(?:'re| are)? a (?:group|party) of (\d+)\b/,
    ))
  ) {
    set(+(m[1] ?? m[2] ?? m[3] ?? m[4])!, true, "group");
    take(m);
  } else if (
    (m = rest.match(
      /\b(?:me|i|myself) (?:and|plus|with|\+) (\d+) (?:other |[a-z]+ )?(friends?|others?|people|buddies|kids|children|coworkers|colleagues|family members|cousins|girls|guys|mates)\b/,
    ))
  ) {
    set(+m[1]! + 1, true, /kids|children/.test(m[2]!) ? "family" : "friends");
    take(m);
  } else if ((m = rest.match(new RegExp(`\\b(\\d+)\\s*${PEOPLE}\\b`)))) {
    set(+m[1]!, true, /friends|buddies|girls|guys|ladies/.test(m[2]!) ? "friends" : undefined);
    take(m);
  } else if (
    (m = rest.match(
      /\bfor (\d{1,2})\b(?!\s*(?:dollars|k|nights?|days?|weeks?|months?|years?|hours?|minutes?|%|am|pm|th|st|nd|rd|\.\d))/,
    ))
  ) {
    set(+m[1]!, true);
    take(m);
  }
  if (out.travelers) {
    out.rest = rest.replace(/\s+/g, " ").trim();
    return out;
  }

  if (
    (m = rest.match(
      /\b(solo|alone|by myself|on my own|just me|only me|just myself|single traveller|single traveler|me myself and i|1 person|just 1)\b/,
    ))
  ) {
    set(1, true, "solo");
    take(m);
  } else if (
    (m = rest.match(
      /\b(honeymoon|anniversary|babymoon|romantic|the 2 of us|both of us|me and my (?:wife|husband|partner|girlfriend|boyfriend|fiance|fiancee|spouse|other half|significant other)|my (?:wife|husband|partner|girlfriend|boyfriend|fiance|fiancee|spouse) and (?:i|me)|couples? (?:trip|getaway)|a couple|us 2|we 2)\b/,
    )) &&
    !/\b(and|with) (our|my|the) (kids?|children|son|daughter|baby|family|parents|friends)\b/.test(
      rest,
    )
  ) {
    set(2, true, "couple");
    take(m);
  } else {
    // Count the people named: me, my wife, our 3 kids, my parents...
    let count = 0;
    let sure = true;
    let named = false;
    const counted = rest.replace(
      /\b(\d+) (?:(?:little|young|teenage|teen|small|grown|adult|college|older|younger|best|close|good) )?(kids?|children|friends|sons|daughters|cousins|siblings|buddies|grandkids|grandchildren|teens|teenagers|coworkers|colleagues|nieces|nephews|dogs?)\b/g,
      (_, n: string, who: string) => {
        if (!/dogs?/.test(who)) count += +n;
        named = true;
        return " ; ";
      },
    );
    let t = ` ${counted} `;
    for (const w of [...PAIR].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`\\b(?:my|our|the|with|and)\\s+${w}\\b`, "g");
      t = t.replace(re, () => {
        count += 2;
        named = true;
        return " ; ";
      });
    }
    for (const w of [...SOME].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`\\b(?:my|our|the|with|and)\\s+${w}\\b`, "g");
      t = t.replace(re, () => {
        count += 2;
        sure = false;
        named = true;
        return " ; ";
      });
    }
    for (const w of [...ONE].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`\\b(?:my|our|the|a|with|and)\\s+${w}\\b`, "g");
      t = t.replace(re, () => {
        count += 1;
        named = true;
        return " ; ";
      });
    }
    if (named) {
      // The traveler too, unless they said they're sending someone ("for my parents").
      const sending =
        /\b(for|send|sending|surprise) (my|our) (parents|mom|dad|grandparents|kids)\b/.test(rest) &&
        !/\b(i|me|we|us)\b/.test(t.replace(/\bmy\b|\bour\b/g, ""));
      if (!sending) count += 1;
      if (/\bfamily\b/.test(rest) && count < 3) sure = false;
      set(count, sure, out.kids ? "family" : count === 2 ? "couple" : "group");
      rest = t;
    } else if (
      /\b(bachelorette|bachelor|girls trip|guys trip|boys trip|girls weekend|lads trip|hen do|stag do|friends trip|group trip|reunion)\b/.test(
        rest,
      )
    ) {
      out.group = "friends";
    } else if (/\bfamily\b/.test(rest)) {
      out.group = "family";
    }
  }
  out.rest = rest.replace(/\s+/g, " ").trim();
  return out;
}
