import { describe, expect, it } from "vitest";

import { cleanAiPlan, mergePlaces, placeLines } from "@/lib/ai-quality";
import { buildRealItinerary } from "@/lib/itinerary";
import {
  listingToPlace,
  parseGuide,
  parseListings,
  parseTips,
  plainWikitext,
  priceToUsd,
} from "@/lib/live/travel-guide";
import type { RealPlace } from "@/lib/places/types";
import { destinationReviewLinks, placeReviewLinks } from "@/lib/reviews";

// Trimmed from the shape of a real Wikivoyage city article.
const ARTICLE = `{{pagebanner|Nashville banner.jpg}}
'''Nashville''' is the capital of [[Tennessee]].

==Get around==
Downtown is compact and easy to walk. The '''WeGo''' buses cover most of the city, but a car helps for outlying sights.
* Bike share stations are all over downtown.

==See==
===Museums===
* {{see
| name=Country Music Hall of Fame and Museum | alt= | url=https://countrymusichalloffame.org/
| address=222 Rep. John Lewis Way S | lat=36.1582 | long=-86.7760
| hours=Daily 9AM-5PM | price=Adults $29.95, children $19.95
| content=Over two million artifacts, including [[Elvis Presley|Elvis's]] gold Cadillac. Allow 2-3 hours.<ref>source</ref>
}}
* {{see | name=The Parthenon | address=2500 West End Ave | price=Free for children, adults $10 | content=A full-scale replica of the Athens original — with a 42-foot statue of Athena.}}

==Do==
* {{do | name=Grand Ole Opry | url= | price=$40-90 | hours=Shows Tu-Sa | content=The show that made country music famous. {{nowrap|Book ahead}}.}}
* {{listing | type=do | name=Centennial Park | price=Free | content=Big park with a lake and walking paths.}}

==Eat==
===Budget===
* {{eat | name=Hattie B's Hot Chicken | address=112 19th Ave S | content=Nashville hot chicken, lines move fast.}}
===Splurge===
* {{eat | name=The Catbird Seat | price=$325 tasting menu | content=Counter seating around the open kitchen.}}

==Drink==
* {{drink | name=Robert's Western World | content=Honky-tonk with live music from 11AM.}}

==Sleep==
* {{sleep | name=Union Station Hotel | price=$250+}}

==Stay safe==
Nashville is generally safe for visitors. Watch your belongings on crowded Broadway at night, and use licensed rideshares after the bars close. Summer heat can be intense.
`;

const wrap = (title: string, content: string) => ({
  query: { pages: [{ title, revisions: [{ slots: { main: { content } } }] }] },
});

describe("reading a Wikivoyage article", () => {
  it("finds the article in the API answer", () => {
    expect(parseGuide(wrap("Nashville", ARTICLE))?.title).toBe("Nashville");
    expect(parseGuide(wrap("Nash", "#REDIRECT [[Nashville]]"))).toBeNull();
    expect(parseGuide({ query: { pages: [] } })).toBeNull();
  });

  it("reads every See, Do, Eat and Drink listing with its details", () => {
    const list = parseListings(ARTICLE);
    expect(list.map((l) => `${l.type}:${l.name}`)).toEqual([
      "see:Country Music Hall of Fame and Museum",
      "see:The Parthenon",
      "do:Grand Ole Opry",
      "do:Centennial Park",
      "eat:Hattie B's Hot Chicken",
      "eat:The Catbird Seat",
      "drink:Robert's Western World",
    ]);
    const hall = list[0]!;
    expect(hall.group).toBe("Museums");
    expect(hall.hours).toBe("Daily 9AM-5PM");
    expect(hall.lat).toBeCloseTo(36.1582);
    expect(hall.description).toBe(
      "Over two million artifacts, including Elvis's gold Cadillac. Allow 2-3 hours.",
    );
    expect(list[1]!.description).not.toContain("—");
    expect(list[2]!.description).toBe("The show that made country music famous. Book ahead.");
    expect(list[4]!.group).toBe("Budget");
  });

  it("turns listings into plannable places with honest prices", () => {
    const [hall, parthenon, opry, park, hattie, catbird, roberts] = parseListings(ARTICLE).map(
      (l) => listingToPlace(l, "Nashville, TN"),
    );
    expect(hall).toMatchObject({
      kind: "sight",
      typeLabel: "Museum",
      costPerPerson: 29.95,
      costSource: "listed",
      hours: "Daily 9AM-5PM",
      source: "wikivoyage",
    });
    expect(hall!.interests).toContain("arts");
    expect(parthenon).toMatchObject({ costPerPerson: 10, costSource: "listed" });
    expect(opry).toMatchObject({ costPerPerson: 65, costSource: "listed", typeLabel: "Activity" });
    expect(park).toMatchObject({ costPerPerson: 0, costSource: "listed" });
    // No price, but listed under "Budget": a typical budget meal, marked as an estimate.
    expect(hattie).toMatchObject({
      kind: "restaurant",
      costPerPerson: 12,
      costSource: "price-level",
    });
    expect(catbird).toMatchObject({ costPerPerson: 325, costSource: "listed" });
    expect(roberts).toMatchObject({
      kind: "restaurant",
      costSource: "unknown",
      typeLabel: "Bar or café",
    });
    expect(roberts!.interests).toContain("nightlife");
    expect(hall!.mapsUrl).toContain(
      encodeURIComponent("Country Music Hall of Fame and Museum, Nashville, TN"),
    );
  });

  it("keeps the first sentences of Stay safe and Get around", () => {
    const tips = parseTips(ARTICLE);
    expect(tips.map((t) => t.topic)).toEqual(["Stay safe", "Get around"]);
    expect(tips[0]!.text).toBe(
      "Nashville is generally safe for visitors. Watch your belongings on crowded Broadway at night, and use licensed rideshares after the bars close.",
    );
    expect(tips[1]!.text).toContain("WeGo buses cover most of the city");
    expect(tips[1]!.text).not.toContain("Bike share");
  });

  it("cleans wikitext down to plain words", () => {
    expect(
      plainWikitext(
        "See [[Louvre|the Louvre]] and [[Paris]] — '''free''' on [https://x.org Sundays]{{citation needed}}",
      ),
    ).toBe("See the Louvre and Paris, free on Sundays");
  });
});

describe("prices only count when they're clearly US dollars", () => {
  it("reads US prices", () => {
    expect(priceToUsd("Free")).toBe(0);
    expect(priceToUsd("$12")).toBe(12);
    expect(priceToUsd("US$8.50 per person")).toBe(8.5);
    expect(priceToUsd("$10–20")).toBe(15);
    expect(priceToUsd("Donations welcome")).toBe(0);
  });

  it("doesn't guess at other currencies or vague text", () => {
    expect(priceToUsd("€15")).toBeNull();
    expect(priceToUsd("£8 adults")).toBeNull();
    expect(priceToUsd("$20", "CA")).toBeNull(); // Canadian dollars
    expect(priceToUsd("USD 20", "CA")).toBe(20);
    expect(priceToUsd("Varies")).toBeNull();
    expect(priceToUsd("")).toBeNull();
  });
});

const real = (name: string, extra: Partial<RealPlace> = {}): RealPlace => ({
  placeId: `x:${name}`,
  name,
  kind: "sight",
  typeLabel: "Museum",
  description: "",
  address: null,
  rating: null,
  ratingCount: null,
  mapsUrl: null,
  costPerPerson: 0,
  costSource: "unknown",
  interests: [],
  ...extra,
});

describe("combining sources", () => {
  it("lists guide picks first and drops the same place from other sources", () => {
    const guide = [real("Country Music Hall of Fame and Museum", { source: "wikivoyage" })];
    const wiki = [
      real("Country Music Hall of Fame and Museum", { address: "222 Rep. John Lewis Way S" }),
      real("Tennessee State Capitol"),
    ];
    const merged = mergePlaces(guide, wiki);
    expect(merged.map((p) => p.name)).toEqual([
      "Country Music Hall of Fame and Museum",
      "Tennessee State Capitol",
    ]);
    expect(merged[0]!.source).toBe("wikivoyage");
    expect(merged[0]!.address).toBe("222 Rep. John Lewis Way S");
    expect(guide[0]!.address).toBeNull(); // inputs aren't changed
  });

  it("gives the AI each place's description, price and hours", () => {
    const [line] = placeLines(
      [
        real("Grand Ole Opry", {
          typeLabel: "Activity",
          description: "The show that made country music famous.",
          priceText: "$40-90",
          hours: "Shows Tu-Sa",
          source: "wikivoyage",
        }),
      ],
      [],
    );
    expect(line).toBe(
      "Grand Ole Opry (Activity): The show that made country music famous.; price: $40-90; hours: Shows Tu-Sa; recommended by travelers",
    );
  });

  it("uses a published price instead of the AI's guess", () => {
    const plan = cleanAiPlan(
      {
        days: [
          {
            title: "Music",
            items: [{ time: "Evening", kind: "sight", name: "Grand Ole Opry", costPerPerson: 120 }],
          },
        ],
      },
      {
        days: 1,
        startDate: "2026-12-03",
        realPlaces: [
          real("Grand Ole Opry", {
            costPerPerson: 65,
            costSource: "listed",
            hours: "Shows Tu-Sa",
            source: "wikivoyage",
          }),
        ],
      },
    );
    expect(plan.days[0]!.items[0]).toMatchObject({
      costPerPerson: 65,
      costSource: "listed",
      hours: "Shows Tu-Sa",
      source: "wikivoyage",
    });
  });
});

describe("review links", () => {
  it("opens Google reviews, Reddit and Tripadvisor searches for a place", () => {
    const links = placeReviewLinks("Hattie B's Hot Chicken", "Nashville, TN");
    expect(links.map((l) => l.site)).toEqual(["google", "reddit", "tripadvisor"]);
    expect(links[1]!.url).toBe(
      `https://www.reddit.com/search/?q=${encodeURIComponent(`"Hattie B's Hot Chicken" Nashville`)}`,
    );
    // A Google Maps place link already opens on the reviews.
    expect(placeReviewLinks("X", "Y", "https://maps.google.com/?cid=1")[0]!.url).toBe(
      "https://maps.google.com/?cid=1",
    );
    expect(placeReviewLinks("  ", "Nashville")).toEqual([]);
  });

  it("links to what travelers say about the destination", () => {
    const links = destinationReviewLinks("Lisbon, Portugal");
    expect(links[0]!.url).toContain(encodeURIComponent("Lisbon travel tips"));
    expect(destinationReviewLinks("")).toEqual([]);
  });
});

describe("plans from the travel guide", () => {
  const places = parseListings(ARTICLE).map((l) => listingToPlace(l, "Nashville, TN"));
  const plan = buildRealItinerary({
    sights: places.filter((p) => p.kind === "sight"),
    restaurants: places.filter((p) => p.kind === "restaurant"),
    destName: "Nashville",
    days: 3,
    startDate: "2026-12-03",
    interests: ["arts"],
    tripType: "flight",
    source: "open",
    mealBudgetPerPersonDay: 58,
  });
  const items = plan.days.flatMap((d) => d.items);

  it("puts bars in the evening, never at a meal", () => {
    const roberts = items.find((i) => i.name === "Robert's Western World");
    expect(roberts?.time).toBe("Evening");
    expect(
      items.filter((i) => i.time === "Lunch" || i.time === "Dinner").map((i) => i.name),
    ).not.toContain("Robert's Western World");
  });

  it("skips meals the food budget can't cover", () => {
    expect(items.map((i) => i.name)).not.toContain("The Catbird Seat");
    expect(items.map((i) => i.name)).toContain("Hattie B's Hot Chicken");
  });

  it("leads with the travel guide's picks and keeps their details", () => {
    const first = plan.days[0]!.items[0]!;
    expect(first.source).toBe("wikivoyage");
    expect(items.find((i) => i.name.startsWith("Country Music"))).toMatchObject({
      hours: "Daily 9AM-5PM",
      priceText: "Adults $29.95, children $19.95",
      costPerPerson: 29.95,
    });
  });
});
