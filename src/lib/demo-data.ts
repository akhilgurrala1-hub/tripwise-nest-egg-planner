// DEMONSTRATION DATA ONLY.
// Every price, venue, and distance below is an illustrative example, not live data.
// Replace with real travel-data integrations before relying on any figure.

/** How the trip is taken. Each type has its own transport options, destinations and budget categories. */
export type TripType = "road-trip" | "flight" | "cruise" | "rail" | "staycation";
export type TravelStyle = "budget" | "comfort" | "luxury";
export type Interest =
  | "nature"
  | "food"
  | "history"
  | "beaches"
  | "arts"
  | "adventure"
  | "family"
  | "nightlife"
  | "shopping";

export const INTERESTS: { id: Interest; label: string }[] = [
  { id: "nature", label: "Nature & parks" },
  { id: "food", label: "Local food" },
  { id: "history", label: "History" },
  { id: "beaches", label: "Beaches & water" },
  { id: "arts", label: "Arts & music" },
  { id: "adventure", label: "Adventure" },
  { id: "family", label: "Family fun" },
  { id: "nightlife", label: "Nightlife" },
  { id: "shopping", label: "Markets & shops" },
];

export type TransportMode = "car" | "rental-car" | "flight" | "train" | "bus";

export const TRIP_TYPES: {
  id: TripType;
  label: string;
  blurb: string;
  /** Ways to travel for this trip type; the first is the default */
  modes: TransportMode[];
  /** Question shown above the transport choices */
  modeQuestion: string;
}[] = [
  {
    id: "road-trip",
    label: "Road trip",
    blurb: "Open road, flexible stops",
    modes: ["car", "rental-car"],
    modeQuestion: "Whose car?",
  },
  {
    id: "flight",
    label: "Fly-away",
    blurb: "Fly in, explore, fly home",
    modes: ["flight"],
    modeQuestion: "Getting there",
  },
  {
    id: "cruise",
    label: "Cruise",
    blurb: "Cabin, meals & ports included",
    modes: ["car", "flight"],
    modeQuestion: "How are you getting to the port?",
  },
  {
    id: "rail",
    label: "Train & bus",
    blurb: "Sit back and ride",
    modes: ["train", "bus"],
    modeQuestion: "Train or bus?",
  },
  {
    id: "staycation",
    label: "Staycation",
    blurb: "Explore close to home",
    modes: ["car"],
    modeQuestion: "Getting around",
  },
];

export function tripTypeInfo(t: TripType) {
  return TRIP_TYPES.find((x) => x.id === t) ?? TRIP_TYPES[0]!;
}

/** A transport mode that fits the trip type: the current one if allowed, else the type's default. */
export function modeForTripType(t: TripType, current: TransportMode): TransportMode {
  const modes = tripTypeInfo(t).modes;
  return modes.includes(current) ? current : modes[0]!;
}

/** Trip types from earlier versions ("budget-vacation" = Getaway) mapped onto today's types. */
export function upgradeTripType(t: string, mode: TransportMode): TripType {
  if (TRIP_TYPES.some((x) => x.id === t) && tripTypeInfo(t as TripType).modes.includes(mode))
    return t as TripType;
  if (t === "staycation") return "staycation";
  if (mode === "flight") return "flight";
  if (mode === "train" || mode === "bus") return "rail";
  return "road-trip";
}

export const TRANSPORT_MODES: { id: TransportMode; label: string }[] = [
  { id: "car", label: "My car" },
  { id: "rental-car", label: "Rental car" },
  { id: "flight", label: "Flight" },
  { id: "train", label: "Train" },
  { id: "bus", label: "Bus" },
];

export const isDrivingMode = (m: TransportMode) => m === "car" || m === "rental-car";

export const TRAVEL_STYLES: { id: TravelStyle; label: string; blurb: string }[] = [
  { id: "budget", label: "Savvy", blurb: "Stretch every dollar" },
  { id: "comfort", label: "Comfort", blurb: "Balanced & easy" },
  { id: "luxury", label: "Luxe", blurb: "Treat yourself" },
];

export type Tiered = Record<TravelStyle, number>;

export interface DemoSight {
  name: string;
  area: string;
  costPerPerson: number;
  interests: Interest[];
  note: string;
  /** Only makes sense after dark (music, stargazing, sunset tours) */
  evening?: boolean;
}

export interface DemoRestaurant {
  name: string;
  cuisine: string;
  /** 1 = budget, 2 = mid, 3 = upscale */
  tier: 1 | 2 | 3;
  costPerPerson: number;
}

export interface DemoDestination {
  id: string;
  name: string;
  region: string;
  tagline: string;
  bestFor: TripType[];
  roundTripMiles: number;
  gasPrice: number;
  parkingPerDay: number;
  tolls: number;
  taxRatePct: number;
  /** Example round-trip fare per person for non-driving travel */
  fares: { flight: number; train: number; bus: number };
  nightly: Tiered;
  foodPerPersonDay: Tiered;
  activitiesPerPerson: Tiered;
  sights: DemoSight[];
  restaurants: DemoRestaurant[];
  /** Cruise fare per person per night (cabin, main dining, onboard fun). Cruise destinations only. */
  cruisePerNight?: Tiered;
  /** Departure port for cruises: where travelers fly or drive to. */
  port?: string;
  /** A real town at the heart of the area, used for live weather. Prices above stay demo data. */
  anchor?: { name: string; lat: number; lon: number };
}

export const DESTINATIONS: DemoDestination[] = [
  {
    id: "blue-ridge",
    anchor: { name: "Asheville, NC", lat: 35.5951, lon: -82.5515 },
    name: "Blue Ridge Mountains",
    region: "North Carolina",
    tagline: "Scenic parkway drives & mountain towns",
    bestFor: ["road-trip", "flight", "rail"],
    roundTripMiles: 480,
    gasPrice: 3.29,
    parkingPerDay: 12,
    tolls: 0,
    taxRatePct: 13,
    fares: { flight: 320, train: 140, bus: 85 },
    nightly: { budget: 89, comfort: 165, luxury: 340 },
    foodPerPersonDay: { budget: 32, comfort: 58, luxury: 115 },
    activitiesPerPerson: { budget: 25, comfort: 70, luxury: 180 },
    sights: [
      {
        name: "Ridge Overlook Trail",
        area: "Parkway mile 382",
        costPerPerson: 0,
        interests: ["nature", "adventure"],
        note: "Easy 2-mile loop with big views",
      },
      {
        name: "Riverbend Arts District",
        area: "Downtown",
        costPerPerson: 0,
        interests: ["arts", "shopping"],
        note: "Open studios & galleries",
      },
      {
        name: "Hilltop Estate Gardens",
        area: "South side",
        costPerPerson: 28,
        interests: ["history", "nature"],
        note: "Historic house & formal gardens",
      },
      {
        name: "Cascade Falls Swim Hole",
        area: "National forest",
        costPerPerson: 5,
        interests: ["nature", "beaches", "family"],
        note: "Bring water shoes",
      },
      {
        name: "Mountain Music Night",
        area: "Old Town",
        costPerPerson: 15,
        interests: ["arts", "nightlife"],
        note: "Live bluegrass — check this week's lineup",
        evening: true,
      },
      {
        name: "Treetop Zipline Park",
        area: "Valley road",
        costPerPerson: 79,
        interests: ["adventure", "family"],
        note: "Book ahead in busy season",
      },
    ],
    restaurants: [
      { name: "Biscuit Barn", cuisine: "Southern breakfast", tier: 1, costPerPerson: 12 },
      { name: "Trailhead Tacos", cuisine: "Food truck", tier: 1, costPerPerson: 11 },
      { name: "Smoke & Pine BBQ", cuisine: "Barbecue", tier: 2, costPerPerson: 24 },
      { name: "Copper Kettle Bistro", cuisine: "Farm-to-table", tier: 2, costPerPerson: 34 },
      { name: "The Summit Room", cuisine: "Tasting menu", tier: 3, costPerPerson: 95 },
      { name: "Laurel Creek Lodge", cuisine: "Mountain fine dining", tier: 3, costPerPerson: 72 },
    ],
  },
  {
    id: "gulf-coast",
    anchor: { name: "Gulf Shores, AL", lat: 30.246, lon: -87.7008 },
    name: "Emerald Gulf Coast",
    region: "Alabama & Florida",
    tagline: "White sand beaches without the big price tag",
    bestFor: ["road-trip", "flight", "rail"],
    roundTripMiles: 620,
    gasPrice: 3.09,
    parkingPerDay: 15,
    tolls: 8,
    taxRatePct: 14,
    fares: { flight: 290, train: 150, bus: 95 },
    nightly: { budget: 109, comfort: 195, luxury: 420 },
    foodPerPersonDay: { budget: 35, comfort: 62, luxury: 125 },
    activitiesPerPerson: { budget: 20, comfort: 85, luxury: 220 },
    sights: [
      {
        name: "Public Beach Access #4",
        area: "West beach",
        costPerPerson: 0,
        interests: ["beaches", "family", "nature"],
        note: "Free — go early for easier parking",
      },
      {
        name: "Dune State Park Boardwalk",
        area: "State park",
        costPerPerson: 4,
        interests: ["nature", "family"],
        note: "Wildlife & quiet sand",
      },
      {
        name: "Harbor Kayak Tour",
        area: "Marina",
        costPerPerson: 45,
        interests: ["adventure", "beaches"],
        note: "Dolphin sightings common",
      },
      {
        name: "Old Fort Museum",
        area: "Point peninsula",
        costPerPerson: 10,
        interests: ["history", "family"],
        note: "Civil War-era fort",
      },
      {
        name: "Sunset Pier Market",
        area: "Pier district",
        costPerPerson: 0,
        interests: ["shopping", "food", "nightlife"],
        note: "Local crafts & music at dusk",
        evening: true,
      },
      {
        name: "Private Sailing Charter",
        area: "Marina",
        costPerPerson: 140,
        interests: ["beaches", "adventure"],
        note: "Sunset cruise",
        evening: true,
      },
    ],
    restaurants: [
      { name: "Dockside Shrimp Shack", cuisine: "Seafood baskets", tier: 1, costPerPerson: 15 },
      { name: "Sandy Toes Café", cuisine: "Breakfast & coffee", tier: 1, costPerPerson: 10 },
      { name: "Pelican Oyster Bar", cuisine: "Raw bar", tier: 2, costPerPerson: 32 },
      { name: "Gulfside Grill", cuisine: "Coastal American", tier: 2, costPerPerson: 38 },
      { name: "Azure", cuisine: "Chef's seafood", tier: 3, costPerPerson: 88 },
      {
        name: "The Lighthouse Terrace",
        cuisine: "Waterfront steakhouse",
        tier: 3,
        costPerPerson: 79,
      },
    ],
  },
  {
    id: "red-rock",
    anchor: { name: "Moab, UT", lat: 38.5733, lon: -109.5498 },
    name: "Red Rock Canyons",
    region: "Southern Utah",
    tagline: "Arches, canyons & star-filled skies",
    bestFor: ["road-trip", "flight"],
    roundTripMiles: 760,
    gasPrice: 3.59,
    parkingPerDay: 5,
    tolls: 0,
    taxRatePct: 12,
    fares: { flight: 360, train: 180, bus: 110 },
    nightly: { budget: 95, comfort: 180, luxury: 450 },
    foodPerPersonDay: { budget: 30, comfort: 55, luxury: 110 },
    activitiesPerPerson: { budget: 35, comfort: 95, luxury: 260 },
    sights: [
      {
        name: "Canyon Park Scenic Drive",
        area: "National park",
        costPerPerson: 15,
        interests: ["nature", "family"],
        note: "Weekly vehicle pass (demo price)",
      },
      {
        name: "Delicate Arch Hike",
        area: "National park",
        costPerPerson: 0,
        interests: ["nature", "adventure"],
        note: "3 mi round trip — bring water",
      },
      {
        name: "Dinosaur Track Site",
        area: "North mesa",
        costPerPerson: 0,
        interests: ["history", "family"],
        note: "Free self-guided walk",
      },
      {
        name: "Slickrock Bike Rental",
        area: "Main Street",
        costPerPerson: 55,
        interests: ["adventure"],
        note: "Half-day rental",
      },
      {
        name: "Dark Sky Stargazing",
        area: "Desert camp",
        costPerPerson: 35,
        interests: ["nature", "nightlife", "family"],
        note: "Telescope tour after dark",
        evening: true,
      },
      {
        name: "Helicopter Canyon Flight",
        area: "Airfield",
        costPerPerson: 199,
        interests: ["adventure"],
        note: "30-minute flight",
      },
    ],
    restaurants: [
      { name: "Desert Rose Diner", cuisine: "Classic diner", tier: 1, costPerPerson: 13 },
      { name: "Moab Brew Garden", cuisine: "Burgers & brews", tier: 1, costPerPerson: 16 },
      { name: "Sagebrush Kitchen", cuisine: "Southwestern", tier: 2, costPerPerson: 28 },
      { name: "Canyon Cantina", cuisine: "Mexican", tier: 2, costPerPerson: 24 },
      { name: "Mesa Ember", cuisine: "Wood-fired fine dining", tier: 3, costPerPerson: 85 },
      { name: "Starlight Ranch Table", cuisine: "Ranch tasting menu", tier: 3, costPerPerson: 110 },
    ],
  },
  {
    id: "historic-coast",
    anchor: { name: "Savannah, GA", lat: 32.0809, lon: -81.0912 },
    name: "Historic Lowcountry",
    region: "Georgia & South Carolina",
    tagline: "Oak-lined squares, porches & Southern kitchens",
    bestFor: ["road-trip", "flight", "rail"],
    roundTripMiles: 540,
    gasPrice: 3.15,
    parkingPerDay: 20,
    tolls: 4,
    taxRatePct: 15,
    fares: { flight: 270, train: 120, bus: 80 },
    nightly: { budget: 115, comfort: 210, luxury: 460 },
    foodPerPersonDay: { budget: 38, comfort: 68, luxury: 135 },
    activitiesPerPerson: { budget: 20, comfort: 65, luxury: 190 },
    sights: [
      {
        name: "Twenty-Two Squares Walk",
        area: "Historic district",
        costPerPerson: 0,
        interests: ["history", "arts"],
        note: "Self-guided, shaded route",
      },
      {
        name: "Riverfront Promenade",
        area: "River Street",
        costPerPerson: 0,
        interests: ["shopping", "nightlife"],
        note: "Cobblestones & shops",
      },
      {
        name: "Antebellum House Tour",
        area: "Madison Square",
        costPerPerson: 25,
        interests: ["history"],
        note: "Guided 45 minutes",
      },
      {
        name: "Tybee-style Beach Day",
        area: "Island",
        costPerPerson: 0,
        interests: ["beaches", "family"],
        note: "Pay parking at lot",
      },
      {
        name: "Ghost Lantern Tour",
        area: "Old Town",
        costPerPerson: 30,
        interests: ["history", "nightlife"],
        note: "After-dark walking tour",
        evening: true,
      },
      {
        name: "Private Carriage & Garden Tour",
        area: "Historic district",
        costPerPerson: 120,
        interests: ["history", "arts"],
        note: "Includes estate garden",
      },
    ],
    restaurants: [
      { name: "Benne Seed Bakery", cuisine: "Bakery & coffee", tier: 1, costPerPerson: 9 },
      { name: "Low Country Boil Shack", cuisine: "Seafood boil", tier: 1, costPerPerson: 17 },
      { name: "Porch & Pecan", cuisine: "Southern comfort", tier: 2, costPerPerson: 30 },
      { name: "Market Hall Kitchen", cuisine: "Modern Southern", tier: 2, costPerPerson: 36 },
      { name: "The Gilded Oak", cuisine: "Fine dining", tier: 3, costPerPerson: 98 },
      { name: "Magnolia House", cuisine: "Chef's table", tier: 3, costPerPerson: 82 },
    ],
  },
  {
    id: "pacific-coast",
    anchor: { name: "Big Sur, CA", lat: 36.2704, lon: -121.8081 },
    name: "Pacific Coast Highway",
    region: "Central California",
    tagline: "Cliffside curves, redwoods & ocean views",
    bestFor: ["road-trip", "flight", "rail"],
    roundTripMiles: 400,
    gasPrice: 4.79,
    parkingPerDay: 25,
    tolls: 9,
    taxRatePct: 14,
    fares: { flight: 240, train: 110, bus: 70 },
    nightly: { budget: 139, comfort: 260, luxury: 620 },
    foodPerPersonDay: { budget: 42, comfort: 78, luxury: 160 },
    activitiesPerPerson: { budget: 30, comfort: 90, luxury: 280 },
    sights: [
      {
        name: "Bixby Bridge Viewpoint",
        area: "Coast highway",
        costPerPerson: 0,
        interests: ["nature"],
        note: "Pull-out parking only",
      },
      {
        name: "Redwood Grove Loop",
        area: "State park",
        costPerPerson: 10,
        interests: ["nature", "family", "adventure"],
        note: "Day-use fee per car (demo)",
      },
      {
        name: "Cannery Row Aquarium",
        area: "Bay front",
        costPerPerson: 60,
        interests: ["family", "beaches"],
        note: "Reserve timed entry",
      },
      {
        name: "Sea Otter Kayak Paddle",
        area: "Harbor",
        costPerPerson: 55,
        interests: ["adventure", "beaches"],
        note: "Calmest early in the day",
      },
      {
        name: "Mission & Old Adobe",
        area: "Old town",
        costPerPerson: 12,
        interests: ["history", "arts"],
        note: "1700s mission grounds",
      },
      {
        name: "Cliffside Spa Afternoon",
        area: "Big Sur",
        costPerPerson: 210,
        interests: ["nature"],
        note: "Ocean-view hot tubs",
      },
    ],
    restaurants: [
      { name: "Fish Taco Window", cuisine: "Baja tacos", tier: 1, costPerPerson: 14 },
      { name: "Coastline Coffee Co.", cuisine: "Café", tier: 1, costPerPerson: 11 },
      { name: "Wharf Chowder House", cuisine: "Seafood", tier: 2, costPerPerson: 34 },
      { name: "Cypress Garden Café", cuisine: "Californian", tier: 2, costPerPerson: 40 },
      { name: "Cliff House Kitchen", cuisine: "Ocean-view tasting", tier: 3, costPerPerson: 135 },
      { name: "Redwood Hearth", cuisine: "Wood-fired fine dining", tier: 3, costPerPerson: 96 },
    ],
  },
  {
    id: "caribbean-cruise",
    anchor: { name: "Nassau, Bahamas", lat: 25.0443, lon: -77.3504 },
    port: "Miami, FL",
    name: "Bahamas & Caribbean",
    region: "Cruise from Miami, FL",
    tagline: "Island hops with your cabin & meals included",
    bestFor: ["cruise"],
    roundTripMiles: 600,
    gasPrice: 3.19,
    parkingPerDay: 22,
    tolls: 12,
    taxRatePct: 7,
    fares: { flight: 280, train: 160, bus: 110 },
    // Cabin is in the cruise fare, so no hotel nights.
    nightly: { budget: 0, comfort: 0, luxury: 0 },
    cruisePerNight: { budget: 80, comfort: 140, luxury: 380 },
    // Main dining is included: this covers specialty dining, drinks and lunches ashore.
    foodPerPersonDay: { budget: 10, comfort: 25, luxury: 60 },
    activitiesPerPerson: { budget: 60, comfort: 150, luxury: 350 },
    sights: [
      {
        name: "Public Beach Day in Port",
        area: "Port of call",
        costPerPerson: 0,
        interests: ["beaches", "nature", "family"],
        note: "Free — bring towels from the ship",
      },
      {
        name: "Old Town Walking Tour",
        area: "Historic downtown",
        costPerPerson: 0,
        interests: ["history", "arts", "shopping"],
        note: "Self-guided from the pier",
      },
      {
        name: "Snorkel Shore Excursion",
        area: "Reef near port",
        costPerPerson: 65,
        interests: ["adventure", "beaches"],
        note: "Book through the cruise line or a local operator",
      },
      {
        name: "Straw Market & Local Crafts",
        area: "Near the pier",
        costPerPerson: 0,
        interests: ["shopping", "arts"],
        note: "Haggling is expected",
      },
      {
        name: "Onboard Show & Live Music",
        area: "Ship theater",
        costPerPerson: 0,
        interests: ["arts", "nightlife", "family"],
        note: "Included in your fare",
        evening: true,
      },
      {
        name: "Private Island Cabana",
        area: "Cruise line's island",
        costPerPerson: 180,
        interests: ["beaches"],
        note: "Reserve early — sells out",
      },
    ],
    restaurants: [
      { name: "Main Dining Room", cuisine: "Included with your fare", tier: 1, costPerPerson: 0 },
      { name: "Lido Buffet", cuisine: "Included with your fare", tier: 1, costPerPerson: 0 },
      { name: "Conch Shack Ashore", cuisine: "Bahamian seafood", tier: 2, costPerPerson: 18 },
      { name: "Poolside Grill", cuisine: "Included burgers & tacos", tier: 2, costPerPerson: 0 },
      { name: "Onboard Steakhouse", cuisine: "Specialty dining", tier: 3, costPerPerson: 55 },
      { name: "Chef's Table", cuisine: "Specialty tasting menu", tier: 3, costPerPerson: 95 },
    ],
  },
  {
    id: "alaska-cruise",
    anchor: { name: "Juneau, AK", lat: 58.3019, lon: -134.4197 },
    port: "Seattle, WA",
    name: "Alaska Inside Passage",
    region: "Cruise from Seattle, WA",
    tagline: "Glaciers, whales & rainforest ports",
    bestFor: ["cruise"],
    roundTripMiles: 300,
    gasPrice: 4.29,
    parkingPerDay: 25,
    tolls: 0,
    taxRatePct: 10,
    fares: { flight: 320, train: 150, bus: 100 },
    nightly: { budget: 0, comfort: 0, luxury: 0 },
    cruisePerNight: { budget: 110, comfort: 180, luxury: 450 },
    foodPerPersonDay: { budget: 12, comfort: 28, luxury: 70 },
    activitiesPerPerson: { budget: 90, comfort: 220, luxury: 500 },
    sights: [
      {
        name: "Glacier Viewing from Deck",
        area: "Scenic cruising",
        costPerPerson: 0,
        interests: ["nature", "family"],
        note: "Dress warm — bring binoculars",
      },
      {
        name: "Rainforest Trail Walk",
        area: "Port town",
        costPerPerson: 0,
        interests: ["nature", "adventure"],
        note: "Easy trail a short walk from the pier",
      },
      {
        name: "Whale-Watching Excursion",
        area: "Inside Passage",
        costPerPerson: 140,
        interests: ["nature", "adventure", "family"],
        note: "Best on calm mornings",
      },
      {
        name: "Gold Rush History Museum",
        area: "Historic district",
        costPerPerson: 15,
        interests: ["history"],
        note: "About an hour",
      },
      {
        name: "Onboard Naturalist Talk",
        area: "Ship lounge",
        costPerPerson: 0,
        interests: ["nature", "history", "family"],
        note: "Included in your fare",
        evening: true,
      },
      {
        name: "Glacier Helicopter Landing",
        area: "Icefield",
        costPerPerson: 380,
        interests: ["adventure"],
        note: "Weather permitting",
      },
    ],
    restaurants: [
      { name: "Main Dining Room", cuisine: "Included with your fare", tier: 1, costPerPerson: 0 },
      { name: "Marketplace Buffet", cuisine: "Included with your fare", tier: 1, costPerPerson: 0 },
      { name: "Crab Shack Ashore", cuisine: "Alaskan king crab", tier: 2, costPerPerson: 35 },
      { name: "Pizzeria Deck", cuisine: "Included pizza", tier: 2, costPerPerson: 0 },
      { name: "Onboard Seafood Grill", cuisine: "Specialty dining", tier: 3, costPerPerson: 50 },
      {
        name: "Wine-Paired Dinner",
        cuisine: "Specialty tasting menu",
        tier: 3,
        costPerPerson: 110,
      },
    ],
  },
  {
    id: "hometown",
    name: "Your Hometown",
    region: "Staycation",
    tagline: "Rediscover the gems in your own backyard",
    bestFor: ["staycation"],
    roundTripMiles: 60,
    gasPrice: 3.35,
    parkingPerDay: 8,
    tolls: 0,
    taxRatePct: 8,
    fares: { flight: 0, train: 12, bus: 6 },
    nightly: { budget: 0, comfort: 0, luxury: 240 },
    foodPerPersonDay: { budget: 25, comfort: 45, luxury: 95 },
    activitiesPerPerson: { budget: 15, comfort: 50, luxury: 150 },
    sights: [
      {
        name: "Free Museum Day",
        area: "Downtown",
        costPerPerson: 0,
        interests: ["arts", "history", "family"],
        note: "Free days vary — check the schedule",
      },
      {
        name: "Riverside Trail & Picnic",
        area: "City park",
        costPerPerson: 0,
        interests: ["nature", "family"],
        note: "Pack lunch from home",
      },
      {
        name: "Farmers Market",
        area: "Market square",
        costPerPerson: 0,
        interests: ["food", "shopping"],
        note: "Usually weekend mornings — check dates",
      },
      {
        name: "Indoor Climbing Gym",
        area: "Warehouse district",
        costPerPerson: 22,
        interests: ["adventure", "family"],
        note: "Day pass with rentals",
      },
      {
        name: "Outdoor Movie Night",
        area: "Amphitheater",
        costPerPerson: 5,
        interests: ["arts", "family", "nightlife"],
        note: "Bring blankets",
        evening: true,
      },
      {
        name: "Day Spa & Rooftop Pool",
        area: "Boutique hotel",
        costPerPerson: 120,
        interests: ["nature"],
        note: "Day pass",
      },
    ],
    restaurants: [
      { name: "Neighborhood Taquería", cuisine: "Tacos", tier: 1, costPerPerson: 10 },
      { name: "Corner Bagel Co.", cuisine: "Breakfast", tier: 1, costPerPerson: 8 },
      { name: "Local Pizza Kitchen", cuisine: "Wood-fired pizza", tier: 2, costPerPerson: 20 },
      { name: "Main Street Bistro", cuisine: "New American", tier: 2, costPerPerson: 32 },
      { name: "The Rooftop", cuisine: "Chef's tasting", tier: 3, costPerPerson: 90 },
      { name: "Vine & Ember", cuisine: "Wine bar & small plates", tier: 3, costPerPerson: 65 },
    ],
  },
];

export const CUSTOM_DESTINATION_ID = "custom";

/** Generic template used when the traveler types a destination we don't have demo data for. */
export function buildCustomDestination(name: string): DemoDestination {
  // The template's anchor town is a real place elsewhere: never let a custom destination inherit it.
  const { anchor: _anchor, ...base } = DESTINATIONS[0]!;
  const label = name.trim() || "Your destination";
  // "Chattanooga, TN" → "Chattanooga" for example venue names.
  const short = label.split(",")[0]!.trim() || label;
  return {
    ...base,
    id: CUSTOM_DESTINATION_ID,
    name: label,
    region: "Custom destination",
    tagline: "Estimated with generic demo prices",
    bestFor: ["road-trip", "flight", "cruise", "rail", "staycation"],
    roundTripMiles: 350,
    gasPrice: 3.4,
    parkingPerDay: 15,
    tolls: 5,
    taxRatePct: 12,
    fares: { flight: 300, train: 140, bus: 90 },
    sights: [
      {
        name: `${short} Old Town Walk`,
        area: "City center",
        costPerPerson: 0,
        interests: ["history", "arts", "shopping"],
        note: "Self-guided stroll",
      },
      {
        name: `${short} Regional Park`,
        area: "Outskirts",
        costPerPerson: 5,
        interests: ["nature", "family", "adventure"],
        note: "Trails & picnic areas",
      },
      {
        name: `${short} History Museum`,
        area: "Museum row",
        costPerPerson: 15,
        interests: ["history", "family"],
        note: "Allow 2 hours",
      },
      {
        name: `${short} Waterfront`,
        area: "Harbor or riverfront",
        costPerPerson: 0,
        interests: ["beaches", "nightlife", "food"],
        note: "Great at sunset",
      },
      {
        name: "Local Live Music Venue",
        area: "Entertainment district",
        costPerPerson: 20,
        interests: ["arts", "nightlife"],
        note: "Check the weekly lineup",
        evening: true,
      },
      {
        name: "Guided Adventure Outing",
        area: "Nearby",
        costPerPerson: 65,
        interests: ["adventure"],
        note: "Half-day tour",
      },
    ],
    restaurants: [
      { name: "Popular Local Diner", cuisine: "Comfort food", tier: 1, costPerPerson: 13 },
      { name: "Street Food Hall", cuisine: "Mixed stalls", tier: 1, costPerPerson: 14 },
      { name: "Neighborhood Bistro", cuisine: "Regional", tier: 2, costPerPerson: 30 },
      { name: "Waterfront Grill", cuisine: "American", tier: 2, costPerPerson: 36 },
      { name: "Chef-Driven Tasting Room", cuisine: "Fine dining", tier: 3, costPerPerson: 95 },
      { name: "Rooftop Lounge", cuisine: "Small plates", tier: 3, costPerPerson: 60 },
    ],
  };
}

export function getDestination(id: string, customName = ""): DemoDestination {
  if (id === CUSTOM_DESTINATION_ID) return buildCustomDestination(customName);
  return DESTINATIONS.find((d) => d.id === id) ?? DESTINATIONS[0]!;
}
