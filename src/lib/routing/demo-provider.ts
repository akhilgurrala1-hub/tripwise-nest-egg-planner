// DEMONSTRATION DATA ONLY.
// Generic stop *types* — not real businesses. Costs and detour times are
// illustrative samples until a mapping/places service is connected.

import type { Interest } from "../demo-data";
import type { RouteProvider, RouteRequest, RouteStop, StopKind, StopTag } from "./types";

interface Template {
  key: string;
  name: (o: string, d: string) => string;
  kind: StopKind;
  description: string;
  position: number;
  costPerPerson: number;
  extraMinutes: number;
  interests: Interest[];
  tags: StopTag[];
}

const near = (place: string, fallback: string) => (place.trim() ? place.trim() : fallback);

const TEMPLATES: Template[] = [
  { key: "overlook", name: (o) => `Scenic overlook outside ${near(o, "your start")}`, kind: "viewpoint", description: "Roadside pull-off with wide views — a quick photo stop.", position: 0.15, costPerPerson: 0, extraMinutes: 5, interests: ["nature"], tags: ["free", "sightseeing"] },
  { key: "farm-stand", name: () => "Roadside farm stand", kind: "restaurant", description: "Seasonal fruit, baked goods and local snacks.", position: 0.22, costPerPerson: 8, extraMinutes: 10, interests: ["food", "shopping"], tags: ["food", "hidden-gem", "family"] },
  { key: "main-street", name: () => "Small-town main street stroll", kind: "free-activity", description: "Walk a historic downtown, window-shop and stretch your legs.", position: 0.3, costPerPerson: 0, extraMinutes: 12, interests: ["history", "shopping", "arts"], tags: ["free", "sightseeing", "hidden-gem"] },
  { key: "diner", name: () => "Independent local diner", kind: "restaurant", description: "Classic comfort food — a sit-down break from the road.", position: 0.38, costPerPerson: 15, extraMinutes: 8, interests: ["food"], tags: ["food", "family"] },
  { key: "picnic-park", name: () => "State or county park picnic area", kind: "park", description: "Shaded tables and restrooms. Some parks charge a vehicle fee.", position: 0.45, costPerPerson: 0, extraMinutes: 15, interests: ["nature", "family"], tags: ["free", "family", "sightseeing"] },
  { key: "waterfall", name: () => "Short waterfall trail", kind: "park", description: "An easy out-and-back hike to a waterfall.", position: 0.5, costPerPerson: 0, extraMinutes: 25, interests: ["nature", "adventure"], tags: ["free", "sightseeing", "hidden-gem"] },
  { key: "museum", name: () => "Regional history museum", kind: "attraction", description: "Local stories and artifacts — about an hour inside.", position: 0.55, costPerPerson: 12, extraMinutes: 18, interests: ["history", "family"], tags: ["sightseeing", "family"] },
  { key: "landmark", name: () => "Historic bridge or landmark photo stop", kind: "viewpoint", description: "A quick look at a local landmark off the main road.", position: 0.6, costPerPerson: 0, extraMinutes: 9, interests: ["history", "nature"], tags: ["free", "sightseeing", "hidden-gem"] },
  { key: "food-trucks", name: () => "Food truck lot", kind: "restaurant", description: "Several trucks in one spot — everyone picks their own.", position: 0.65, costPerPerson: 13, extraMinutes: 10, interests: ["food", "nightlife"], tags: ["food", "family"] },
  { key: "science", name: () => "Hands-on science center", kind: "attraction", description: "Interactive exhibits that keep kids busy.", position: 0.68, costPerPerson: 18, extraMinutes: 20, interests: ["family"], tags: ["family", "sightseeing"] },
  { key: "lake", name: () => "Lakeside swimming beach", kind: "park", description: "Swim area and sandy shore. Small day-use fee common.", position: 0.72, costPerPerson: 5, extraMinutes: 22, interests: ["beaches", "family", "nature"], tags: ["family", "sightseeing"] },
  { key: "murals", name: () => "Public art & murals walk", kind: "free-activity", description: "Self-guided loop past local murals and sculptures.", position: 0.76, costPerPerson: 0, extraMinutes: 14, interests: ["arts"], tags: ["free", "sightseeing", "hidden-gem"] },
  { key: "market", name: () => "Seasonal farmers market", kind: "free-activity", description: "Free to browse; budget a few dollars for treats.", position: 0.8, costPerPerson: 0, extraMinutes: 16, interests: ["food", "shopping"], tags: ["free", "food", "family"] },
  { key: "tasting", name: () => "Brewery or winery tasting room", kind: "restaurant", description: "Tasting flights for the adults (designate a driver).", position: 0.84, costPerPerson: 20, extraMinutes: 18, interests: ["nightlife", "food"], tags: ["food"] },
  { key: "adventure", name: () => "Adventure park or zipline", kind: "attraction", description: "A splurge-worthy thrill — book ahead in peak season.", position: 0.88, costPerPerson: 65, extraMinutes: 30, interests: ["adventure", "family"], tags: ["family", "sightseeing"] },
  { key: "sunset", name: (_o, d) => `Sunset viewpoint near ${near(d, "your destination")}`, kind: "viewpoint", description: "End the drive with golden-hour views.", position: 0.94, costPerPerson: 0, extraMinutes: 6, interests: ["nature"], tags: ["free", "sightseeing"] },
];

export const demoRouteProvider: RouteProvider = {
  id: "demo",
  label: "Demo route data",
  isDemo: true,
  async getRoute() {
    return { distanceMiles: null, durationMinutes: null, polyline: null };
  },
  async findStopsAlongRoute(req: RouteRequest) {
    return buildDemoStops(req);
  },
};

export function buildDemoStops(req: Pick<RouteRequest, "origin" | "destination">): RouteStop[] {
  return TEMPLATES.map((t) => ({
    id: `demo-${t.key}`,
    name: t.name(req.origin, req.destination),
    kind: t.kind,
    description: t.description,
    position: t.position,
    costPerPerson: t.costPerPerson,
    extraMinutes: t.extraMinutes,
    interests: t.interests,
    tags: t.tags,
    location: null,
    placeId: null,
    isDemo: true,
    costSource: "demo" as const,
    rating: null,
    ratingCount: null,
    address: null,
    mapsUrl: null,
  }));
}
