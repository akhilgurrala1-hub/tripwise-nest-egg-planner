import { describe, expect, it } from "vitest";

import { cleanChatAnswer } from "@/lib/ai-quality";
import { missingFields, setupFromDraft, type TripDraft } from "@/lib/assistant";
import { calculateBudget, tripShape } from "@/lib/budget";
import { addDays, todayIso } from "@/lib/dates";
import { CUSTOM_DESTINATION_ID, destinationFor } from "@/lib/demo-data";
import { buildTrip, sampleSetup } from "@/lib/trip-store";

const today = todayIso();
const draft = (patch: Partial<TripDraft>): TripDraft => ({
  destination: null,
  origin: "Chicago, IL",
  startDate: null,
  endDate: null,
  nights: null,
  travelers: null,
  tripType: null,
  transportMode: null,
  style: null,
  totalBudget: null,
  interests: [],
  covered: { lodging: false, meals: false, activities: false, localTransport: false },
  transferCost: null,
  ...patch,
});

/** What the assistant's answer turns into, end to end. */
const plan = (d: TripDraft) => {
  const answer = cleanChatAnswer({ reply: "Ok", ready: true, questions: [], ideas: [], trip: d });
  const setup = setupFromDraft(answer.trip, sampleSetup(), today);
  const trip = buildTrip(setup);
  const shape = tripShape(setup.startDate, setup.endDate, setup.travelers);
  return {
    setup,
    trip,
    totals: calculateBudget(trip.inputs, shape, setup.totalBudget, setup.emergencyFund),
  };
};

describe("unusual trips the assistant should handle", () => {
  it("a family reunion of 15 is budgeted for 15, with enough rooms", () => {
    const { setup, trip } = plan(
      draft({
        destination: "Gatlinburg, TN",
        startDate: addDays(today, 40),
        nights: 3,
        travelers: 15,
      }),
    );
    expect(setup.travelers).toBe(15);
    expect(trip.inputs.rooms).toBe(4);
  });

  it("a last-minute trip starting today is accepted", () => {
    const d = draft({ destination: "Milwaukee, WI", startDate: today, nights: 1, travelers: 2 });
    expect(missingFields(d, today)).toEqual([]);
    expect(plan(d).setup.startDate).toBe(today);
  });

  it("dates in the past are never used; the assistant has to ask again", () => {
    const d = draft({
      destination: "Denver, CO",
      startDate: addDays(today, -3),
      nights: 2,
      travelers: 2,
    });
    expect(missingFields(d, today)).toContain("dates");
    expect(plan(d).setup.startDate >= today).toBe(true);
  });

  it("a trip abroad keeps the place the traveler named and flies there", () => {
    const { setup, totals } = plan(
      draft({
        destination: "Lisbon, Portugal",
        startDate: addDays(today, 60),
        nights: 6,
        travelers: 2,
        tripType: "flight",
        transportMode: "flight",
      }),
    );
    // Lisbon is in the catalog, so it matches the real place (with its country and photo).
    expect(setup.destinationId).toBe("place:lisbon");
    expect(destinationFor(setup).country).toBe("PT");
    expect(setup.transportMode).toBe("flight");
    expect(totals.categories.transportation).toBeGreaterThan(0);
  });

  it("a budget the traveler gave is kept, even a tight one", () => {
    const { setup } = plan(
      draft({
        destination: "Savannah, GA",
        startDate: addDays(today, 20),
        nights: 2,
        travelers: 2,
        totalBudget: 450,
      }),
    );
    expect(setup.totalBudget).toBe(450);
  });

  it("an absurd group size from the model is capped", () => {
    const { setup } = plan(
      draft({
        destination: "Orlando, FL",
        startDate: addDays(today, 30),
        nights: 3,
        travelers: 400,
      }),
    );
    expect(setup.travelers).toBe(20);
  });

  it("a town that isn't in the catalog is kept exactly as named", () => {
    const { setup } = plan(
      draft({
        destination: "Bisbee, AZ",
        startDate: addDays(today, 25),
        nights: 2,
        travelers: 2,
        tripType: "road-trip",
      }),
    );
    expect(setup.destinationId).toBe(CUSTOM_DESTINATION_ID);
    expect(setup.customDestination).toBe("Bisbee, AZ");
  });
});
