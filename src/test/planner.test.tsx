import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ fn: vi.fn() }));
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), plain: vi.fn() }));

vi.mock("@/lib/ai-itinerary.functions", () => ({ createAiItinerary: ai.fn }));
vi.mock("@/lib/places/destination-places.functions", () => ({ getDestinationPlaces: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({
  toast: Object.assign(toasts.plain, { error: toasts.error, success: toasts.success }),
}));

import { usePlanner, AI_TIMEOUT_MS } from "@/components/app/itinerary/use-planner";
import { addDays, todayIso } from "@/lib/dates";
import { currentTrip, sampleSetup, tripActions } from "@/lib/trip-store";

const PLAN = {
  ok: true as const,
  itinerary: {
    tips: ["Bring layers"],
    days: [
      {
        day: 1,
        title: "AI day",
        items: [
          {
            time: "Morning",
            kind: "sight",
            name: "AI Museum",
            area: "",
            note: "",
            costPerPerson: 10,
          },
        ],
      },
    ],
  },
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** A request that only settles when the test says so (or rejects when aborted, like fetch). */
function pending() {
  let resolve!: (v: unknown) => void;
  ai.fn.mockImplementation(
    ({ signal }: { signal: AbortSignal }) =>
      new Promise((res, rej) => {
        resolve = res;
        signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
      }),
  );
  return (v: unknown) => resolve(v);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  tripActions.startTrip({
    ...sampleSetup(),
    startDate: addDays(todayIso(), 20),
    endDate: addDays(todayIso(), 22),
  });
});

describe("AI planner requests", () => {
  it("applies the plan when it arrives for the same trip", async () => {
    const answer = pending();
    const { result } = renderHook(() => usePlanner(), { wrapper });
    let run!: Promise<void>;
    act(() => void (run = result.current.planWithAi()));
    expect(result.current.job).toBe("ai");
    await act(async () => {
      answer(PLAN);
      await run;
    });
    expect(currentTrip().itinerary?.source).toBe("ai");
    expect(result.current.job).toBeNull();
    expect(toasts.success).toHaveBeenCalled();
  });

  it("cancel stops waiting and keeps the current plan", async () => {
    pending();
    const before = currentTrip().itinerary;
    const { result } = renderHook(() => usePlanner(), { wrapper });
    let run!: Promise<void>;
    act(() => void (run = result.current.planWithAi()));
    await act(async () => {
      result.current.cancel();
      await run;
    });
    expect(result.current.job).toBeNull();
    expect(currentTrip().itinerary).toEqual(before);
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("discards a plan when the trip changed while waiting", async () => {
    const answer = pending();
    const { result } = renderHook(() => usePlanner(), { wrapper });
    let run!: Promise<void>;
    act(() => void (run = result.current.planWithAi()));
    act(() => {
      tripActions.startTrip({
        ...sampleSetup(),
        startDate: addDays(todayIso(), 40),
        endDate: addDays(todayIso(), 41),
      });
    });
    await act(async () => {
      answer(PLAN);
      await run;
    });
    expect(currentTrip().itinerary?.source).toBe("demo");
    expect(toasts.plain).toHaveBeenCalledWith(
      "Your trip changed while we were planning",
      expect.anything(),
    );
  });

  it("times out, keeps the plan and offers a retry", async () => {
    vi.useFakeTimers();
    try {
      pending();
      const { result } = renderHook(() => usePlanner(), { wrapper });
      let run!: Promise<void>;
      act(() => void (run = result.current.planWithAi()));
      await act(async () => {
        vi.advanceTimersByTime(AI_TIMEOUT_MS + 10);
        await run;
      });
      expect(result.current.job).toBeNull();
      expect(currentTrip().itinerary?.source).toBe("demo");
      expect(toasts.error).toHaveBeenCalledWith(
        expect.stringContaining("took too long"),
        expect.objectContaining({ action: expect.objectContaining({ label: "Try again" }) }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the server's error with a retry", async () => {
    ai.fn.mockResolvedValue({ ok: false, status: 429, error: "The AI planner is busy." });
    const { result } = renderHook(() => usePlanner(), { wrapper });
    await act(async () => {
      await result.current.planWithAi();
    });
    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("The AI planner is busy.", expect.anything()),
    );
    expect(currentTrip().itinerary?.source).toBe("demo");
  });
});
