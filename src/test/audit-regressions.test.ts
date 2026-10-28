import { describe, expect, it } from "vitest";
import { calculateBudget, defaultInputs, percentLabel, tripShape } from "@/lib/budget";
import { DESTINATIONS } from "@/lib/demo-data";
import { addDays, dateRangeError, isIsoDate } from "@/lib/dates";
import { itineraryActivityCost, itineraryMealCost, type Itinerary } from "@/lib/itinerary";
import { safeRedirect } from "@/lib/auth-context";
import { matchesFilter, whyItMatches } from "@/lib/routing";
import type { RouteStop } from "@/lib/routing/types";

it("uses a clear label when all money is reserved or the total budget is zero", () => {
  const inputs = defaultInputs(DESTINATIONS[0]!, "comfort", "road-trip", 2);
  for (const total of [0, 200]) {
    const budget = calculateBudget(inputs, tripShape("2026-11-01", "2026-11-03", 2), total, 200);
    expect(percentLabel(budget)).toBe("No spendable budget");
    expect(budget.percentUsed).toBeNull();
    expect(budget.emergencyFund).toBe(total);
    expect(budget.remaining).toBe(-budget.planned);
  }
});

describe("calendar dates", () => {
  it("rejects dates that the JavaScript Date constructor silently rolls forward", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(dateRangeError("2026-02-30", "2026-03-02")).toContain("real date");
    expect(dateRangeError("2026-11-01", "2026-11-01")).toBe("");
    expect(dateRangeError("2026-11-01", "2026-11-15")).toContain("14 days");
  });
  it("advances dates through leap days and year boundaries without time-zone drift", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

it("rejects cross-origin redirects including browser-normalized backslashes and control characters", () => {
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\tevil.example",
    null,
  ])
    expect(safeRedirect(value)).toBeUndefined();
  expect(safeRedirect("/itinerary")).toBe("/itinerary");
});

it("does not describe an unlisted price as free", () => {
  const stop: RouteStop = {
    id: "unknown",
    name: "Museum",
    kind: "attraction",
    description: "",
    position: 0.5,
    costPerPerson: 0,
    extraMinutes: 10,
    interests: [],
    tags: [],
    location: null,
    placeId: null,
    isDemo: false,
    costSource: "unknown",
    rating: null,
    ratingCount: null,
    address: null,
    mapsUrl: null,
  };
  expect(matchesFilter(stop, "free")).toBe(false);
  expect(whyItMatches(stop, [], 2).join(" ")).toContain("price unknown");
  expect(matchesFilter({ ...stop, costSource: "listed" }, "free")).toBe(true);
});

it("totals itinerary estimates in cents and excludes negative or invalid prices", () => {
  const itin: Itinerary = {
    source: "ai",
    tips: [],
    days: [
      {
        day: 1,
        date: "2026-11-01",
        title: "Day",
        items: [
          {
            id: "a",
            kind: "sight",
            time: "Morning",
            name: "A",
            area: "",
            note: "",
            costPerPerson: 10.005,
          },
          {
            id: "b",
            kind: "sight",
            time: "Afternoon",
            name: "B",
            area: "",
            note: "",
            costPerPerson: -200,
          },
          {
            id: "c",
            kind: "restaurant",
            time: "Lunch",
            name: "C",
            area: "",
            note: "",
            costPerPerson: 0.105,
          },
        ],
      },
    ],
  };
  expect(itineraryActivityCost(itin, 2)).toBe(20.02);
  expect(itineraryMealCost(itin, 2)).toBe(0.22);
});
