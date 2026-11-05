/**
 * Reading how they want to travel: the kind of trip and transport, cabin, travel
 * style, interests, what's already taken care of, and whether they don't know
 * where to go yet ("idk", "surprise me", "somewhere warm").
 */
import type {
  Cabin,
  FlightStops,
  Interest,
  TransportMode,
  TravelStyle,
  TripType,
} from "../demo-data";

export interface Covered {
  lodging: boolean;
  meals: boolean;
  activities: boolean;
  localTransport: boolean;
}

export interface PrefFacts {
  tripType?: TripType;
  transportMode?: TransportMode;
  cabin?: Cabin;
  /** Stops they'll take on flights */
  stops?: FlightStops;
  style?: TravelStyle;
  interests: Interest[];
  covered: Partial<Covered>;
  /** They want ideas instead of naming a place */
  unsure?: boolean;
  /** Weather or setting they want, for ideas: "warm", "snow", "city"... */
  vibes: string[];
  /** Yes / let's go: they're happy with the trip as it stands */
  confirm?: boolean;
  /** No / not that: they turned down the last suggestion */
  decline?: boolean;
}

const has = (t: string, re: RegExp) => re.test(t);

const INTEREST_WORDS: [Interest, RegExp][] = [
  [
    "nature",
    /\b(nature|hik(e|es|ing)|trails?|mountains?|national parks?|outdoors?|outdoorsy|lakes?|forests?|waterfalls?|scenery|scenic|wildlife|camping|camp|canyons?|views?|glaciers?|fall colou?rs|leaf peeping|parks|stargazing|northern lights)\b/,
  ],
  [
    "food",
    /\b(food|foodie|eat|eating|restaurants?|cuisine|culinary|street food|bbq|barbecue|tacos?|pizza|pasta|sushi|ramen|wine|wineries|winery|vineyards?|brewer(y|ies)|beer|cooking class|michelin|brunch|coffee|tapas|dining)\b/,
  ],
  [
    "history",
    /\b(history|historic(al)?|museums?|castles?|ruins|ancient|monuments?|cathedrals?|churches|temples?|palaces?|heritage|civil war|war memorials?|archaeolog\w*|old town|pyramids)\b/,
  ],
  [
    "beaches",
    /\b(beach(es|y)?|ocean|sea|seaside|island|islands|tropical|surf(ing)?|snorkel(ing)?|swim(ming)?|sand|coast(al)?|lagoon|pool|resort|all inclusive|sun|sunny|tan|tanning)\b/,
  ],
  [
    "arts",
    /\b(arts?|galler(y|ies)|music|concerts?|live music|theat(er|re)|broadway|shows|jazz|opera|festival|festivals|architecture|design|culture|cultural)\b/,
  ],
  [
    "adventure",
    /\b(adventure|adventurous|ski(ing)?|snowboard(ing)?|raft(ing)?|zip ?lin(e|ing)|scuba|div(e|ing)|climb(ing)?|bungee|kayak(ing)?|paraglid(e|ing)|skydiv(e|ing)|atv|safari|trek(king)?|mountain bik(e|ing)|thrill|extreme)\b/,
  ],
  [
    "family",
    /\b(kids?|children|family|families|theme parks?|disney|disneyland|disney world|universal|legoland|zoo|aquarium|kid friendly|family friendly|toddlers?|baby)\b/,
  ],
  [
    "nightlife",
    /\b(nightlife|night life|bars?|clubs?|clubbing|party(?! of)|partying|parties|drinks|drinking|pub crawl|bachelorette|bachelor|casinos?|cocktails?|rooftop|nightclubs?|dancing)\b/,
  ],
  [
    "shopping",
    /\b(shopping|shop|shops|markets?|outlets?|malls?|boutiques?|souvenirs|vintage|flea market|thrift(ing)?)\b/,
  ],
];

export function readPrefs(text: string): PrefFacts {
  const t = ` ${text} `;
  const out: PrefFacts = { interests: [], covered: {}, vibes: [] };

  // Kind of trip and how they get there.
  if (
    has(
      t,
      /\bstaycation\b|\bstay (at )?home\b|\bin my (own )?(city|town)\b|\blocal (trip|getaway)\b|\bnear home\b|\baround (my|our) (city|town)\b/,
    )
  )
    out.tripType = "staycation";
  else if (
    has(
      t,
      /\bcruis(e|es|ing)\b|\bsail(ing)?\b(?! boat)|\bon a ship\b|\bcarnival\b|\broyal caribbean\b|\bnorwegian cruise\b|\bprincess cruises?\b/,
    )
  )
    out.tripType = "cruise";
  else if (
    has(
      t,
      /\broad ?trip\b|\bdriv(e|ing)\b|\bby car\b|\bin (my|our|the) car\b|\btake (my|our|the) car\b|\brv\b|\bcampervan\b|\bvan life\b/,
    )
  ) {
    out.tripType = "road-trip";
    out.transportMode = has(t, /\brent(al|ing)? (a )?car\b|\brent a car\b/) ? "rental-car" : "car";
  } else if (
    has(
      t,
      /\btrains?\b|\brail\b|\bamtrak\b|\beurail\b|\binterrail\b|\bshinkansen\b|\bbullet train\b|\bby rail\b/,
    )
  ) {
    out.tripType = "rail";
    out.transportMode = "train";
  } else if (has(t, /\bbus(es)?\b|\bgreyhound\b|\bflixbus\b|\bmegabus\b|\bcoach\b(?! class)/)) {
    out.tripType = "rail";
    out.transportMode = "bus";
  } else if (
    has(
      t,
      /\bfly(ing)?\b|\bflights?\b|\bplane\b|\bairport\b|\bairline\b|\bnonstop\b|\blayovers?\b|\bfly away\b|\bfly-away\b/,
    )
  ) {
    out.tripType = "flight";
    out.transportMode = "flight";
  }
  if (
    !out.transportMode &&
    out.tripType !== "road-trip" &&
    has(t, /\brent(al|ing)? (a )?car\b|\brent a car\b/)
  )
    out.transportMode = "rental-car";

  // Cabin.
  if (has(t, /\bfirst class\b/)) out.cabin = "first";
  else if (
    has(t, /\bbusiness class\b|\bbusiness seats?\b|\bfly business\b|\blie flat\b|\bpolaris\b/)
  )
    out.cabin = "business";
  else if (
    has(
      t,
      /\bpremium economy\b|\bpremium seats?\b|\bextra legroom\b|\beconomy plus\b|\bcomfort plus\b/,
    )
  )
    out.cabin = "premium";
  else if (
    has(
      t,
      /\beconomy\b|\bcoach (class|seats?|tickets?)\b|\bbasic economy\b|\bcheapest (flight|seat)s?\b/,
    )
  )
    out.cabin = "economy";

  // Stops on flights.
  if (
    has(
      t,
      /\b(non ?stop|direct)( flights?| only| please| if possible)?\b|\bno (layovers?|stops|connections|stopovers?)\b|\bwithout (a |any )?(layovers?|stops?|connections?|stopovers?)\b|\bhate (layovers|connections)\b/,
    ) &&
    !has(t, /\b(non ?stop|direct) (is not|isnt|not) (needed|necessary|required)\b/)
  )
    out.stops = "nonstop";
  else if (
    has(
      t,
      /\b(1|one) (stop|layover|connection|stopover)s? (max|at most|is fine|is ok|is okay|okay|ok|fine)\b|\b(max(imum)?|at most|no more than|up to) (1|one) (stop|layover|connection|stopover)s?\b|\b(1|one) stop max\b/,
    )
  )
    out.stops = "one";
  else if (
    has(
      t,
      /\b(stops|layovers?|connections?|stopovers?) (are |is )?(fine|ok|okay|no problem|not a problem)\b|\bdo not mind (stops|layovers?|connections?|a layover|a stopover)\b|\b(any|any number of) stops\b|\b(long )?layovers? (are |is )?(fine|ok|okay)\b|\bcheapest (flight|option|one)?\s*(even )?(with|if it has) (stops|layovers?)\b/,
    )
  )
    out.stops = "any";

  // Style.
  if (
    has(
      t,
      /\b(luxury|luxurious|5 star|five star|fancy|high end|upscale|splurge|treat (ourselves|myself|yourself)|lavish|bougie|boujee|all out|money is no (object|issue)|no budget|best of everything|top tier|vip|private villa|overwater)\b/,
    )
  )
    out.style = "luxury";
  else if (
    has(
      t,
      /\b(cheap|cheapest|on a budget|budget (trip|travel|friendly|hotels?|options?|style|vacation|getaway)|low budget|small budget|limited budget|broke|tight budget|frugal|affordable|inexpensive|backpack(ing|er)?|hostels?|low cost|save money|saving money|student|as little as possible|bare bones|economical|thrifty)\b/,
    )
  )
    out.style = "budget";
  else if (
    has(
      t,
      /\b(comfortable|comfort|mid ?range|moderate|not too fancy|nice but not|reasonable|decent|middle of the road|standard|normal budget|mid level)\b/,
    )
  )
    out.style = "comfort";

  // Interests.
  for (const [interest, re] of INTEREST_WORDS) if (re.test(t)) out.interests.push(interest);

  // What's taken care of.
  const family =
    /\b(stay(ing)? (with|at)|crash(ing)? (with|at|on)|at) (a |my |our |some )?(parents|mom|dad|family|grand(ma|pa|parents)|aunt|uncle|cousins?|friends?|brother|sister|in laws|folks|relatives?|boyfriend|girlfriend|partner)s?('s)?( place| house| apartment| condo| couch)?\b/;
  // "no hotel needed", "we don't need a hotel", "the hotel is paid by work",
  // "we already have an airbnb": nothing to pay for a place to stay.
  const STAY =
    "(hotels?|accommodations?|lodging|a place to stay|place to stay|rooms?|airbnbs?|stays?|housing)";
  const noStay = [
    new RegExp(
      `\\b(do not|did not|will not|wont|no|never) (need|want|require|book|pay for)( a| an| any)? ${STAY}\\b`,
    ),
    new RegExp(`\\bno ${STAY}( needed| required| necessary| please)?\\b`),
    new RegExp(`\\bwithout( a| any)? ${STAY}\\b`),
    new RegExp(
      `\\b${STAY} (is |are |will be )?(already )?(covered|paid( for)?|booked|taken care of|sorted|included|comped|free|on (my|our|the) (company|work|job|employer))\\b`,
    ),
    new RegExp(
      `\\b(work|my company|the company|my job|my employer|the conference|the university|school) (is )?(pays?|paying|covers?|covering|gives?|provides?|providing|booked|books)( for)?( the| my| our)? ${STAY}\\b`,
    ),
    /\b(already|we|i) (have|got|booked|paid for|reserved) (a |an |the |our |my )?(place|hotel|airbnb|room|accommodation|rental|condo|cabin|villa|apartment)\b.*\b(already|paid|booked)\b|\balready (have|booked|got|paid for|reserved) (a |an |the |our |my )?(place|hotel|airbnb|room|accommodation|rental|condo|cabin|villa|apartment|lodging|stay)\b/,
    /\b(couch ?surf(ing)?|sleep(ing)? (in|at) (my|our|the) (car|van|rv|camper)|living in (my|our) (van|rv))\b/,
  ];
  // A question ("is the hotel booked?") isn't saying it's taken care of.
  const asking =
    /\b(is|are|was|were) (the |my |our )?(hotels?|rooms?|airbnb|stay|accommodations?) (already )?(booked|paid|covered)\b/.test(
      t,
    );
  if (!asking && noStay.some((re) => re.test(t))) out.covered.lodging = true;
  if (
    has(t, family) ||
    has(
      t,
      /\b(i|we) live there\b|\bgoing home\b|\bvisit(ing)? (my |our )?(family|parents|folks|mom|dad|grandparents)\b|\bhome for (the )?(holidays|christmas|thanksgiving|break|summer)\b|\bfree place to stay\b|\bhave a place\b|\btimeshare\b|\bour (own )?(cabin|condo|beach house|lake house)\b/,
    )
  ) {
    out.covered.lodging = true;
    if (
      has(
        t,
        /\bstay(ing)? with (my |our )?(parents|mom|dad|family|folks|grand)|\bgoing home\b|\bhome for\b|\bi live there\b|\bvisit(ing)? (my |our )?(family|parents|folks|mom|dad|grandparents)\b/,
      )
    )
      out.covered.meals = true;
  }
  if (
    has(
      t,
      /\b(just|only) (need |want )?(the )?(flights?|tickets?|plane tickets?|train tickets?|bus tickets?|getting there)\b|\bjust getting there\b/,
    )
  )
    out.covered.activities = true;
  if (
    has(
      t,
      /\b(picking (me|us) up|pick (me|us) up|have a car there|borrow (a|their|his|her) car|ride from the airport|they have a car)\b/,
    )
  )
    out.covered.localTransport = true;
  if (has(t, /\b(going home|home for)\b/)) out.covered.activities = true;

  // Not sure where, and what kind of place.
  if (
    has(
      t,
      /\b(i do not know|not sure|no idea|anywhere|somewhere|surprise me|you (pick|choose|decide)|any ideas|ideas|suggest(ions)?|recommend(ations)?|where should (i|we)|help me (pick|choose|decide)|open to anything|wherever|undecided|i do not care where|dont care where|any place|someplace)\b/,
    )
  )
    out.unsure = true;
  const VIBES: [string, RegExp][] = [
    [
      "warm",
      /\b(warm|hot|sunny|sunshine|tropical|tropics|heat|escape the cold|get out of the cold)\b/,
    ],
    ["snow", /\b(snow|snowy|ski(ing)?|winter wonderland|cold|chilly)\b/],
    ["city", /\b(big city|city break|city trip|urban|cities)\b/],
    [
      "quiet",
      /\b(quiet|relax(ing|ed)?|chill|peaceful|unwind|slow|laid back|rest|spa|wellness|detox|recharge)\b/,
    ],
    ["romantic", /\b(romantic|romance|honeymoon|anniversary|couples)\b/],
    ["abroad", /\b(abroad|international|overseas|out of the country|another country)\b/],
    [
      "close",
      /\b(close|nearby|near( by)?|not far|short drive|driving distance|within \d+ hours?)\b/,
    ],
  ];
  for (const [v, re] of VIBES) if (re.test(t)) out.vibes.push(v);
  if (
    out.vibes.includes("warm") &&
    !out.interests.includes("beaches") &&
    !out.vibes.includes("city")
  )
    out.interests.push("beaches");
  if (out.vibes.includes("snow") && !out.interests.includes("adventure") && /ski|snowboard/.test(t))
    out.interests.push("adventure");

  const words = t.trim().split(/\s+/);
  if (
    words.length <= 8 &&
    has(
      t,
      /^\s*(yes|yeah|yep|yup|sure|ok|okay|sounds (good|great|perfect)|perfect|great|let us (do|go)|do it|build it|go ahead|book it|looks good|that works|works for me|love it|deal|correct|right|exactly|confirmed?)\b/,
    )
  )
    out.confirm = true;
  if (
    words.length <= 8 &&
    has(t, /^\s*(no|nope|nah|not really|neither|none|something else|other|different)\b/)
  )
    out.decline = true;
  return out;
}
