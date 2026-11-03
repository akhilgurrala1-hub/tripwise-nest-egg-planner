import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chat = vi.hoisted(() => ({ fn: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));

vi.mock("@/lib/ai-trip-chat.functions", () => ({ tripChat: chat.fn }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/live/location.functions", () => ({ getVisitorLocation: async () => null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: auth.user, loading: false }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/auth">{children}</a>,
}));

import { TripAssistant } from "@/components/app/plan/TripAssistant";
import { addDays, todayIso } from "@/lib/dates";

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const empty = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  auth.user = { id: "u1" };
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

describe("trip assistant", () => {
  it("asks follow-ups with tap answers, then offers to build the trip", async () => {
    const start = addDays(todayIso(), 25);
    chat.fn
      .mockResolvedValueOnce({
        ok: true,
        answer: {
          reply: "Nice — a mountain weekend. A couple of quick questions.",
          ready: false,
          questions: [{ question: "How many people?", options: ["Just me", "2 people"] }],
          ideas: [],
          trip: { ...empty, destination: "Gatlinburg, TN", startDate: start, nights: 2 },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        answer: {
          reply: "Two nights in Gatlinburg for 2. Ready when you are.",
          ready: true,
          questions: [],
          ideas: [],
          trip: {
            ...empty,
            destination: "Gatlinburg, TN",
            startDate: start,
            nights: 2,
            travelers: 2,
          },
        },
      });
    const onBuild = vi.fn();
    render(<TripAssistant homeCity="Chicago, IL" onBuild={onBuild} onFill={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Describe your trip"), {
      target: { value: "Mountain weekend next month" },
    });
    fireEvent.click(screen.getByLabelText("Send"));
    await screen.findByText("How many people?");
    expect(screen.getByText("Gatlinburg, TN")).toBeInTheDocument();
    expect(screen.queryByText("Build this trip")).toBeNull();

    fireEvent.click(screen.getByText("2 people"));
    const build = await screen.findByText("Build this trip");
    // The answer and the draft so far went to the server.
    expect(chat.fn.mock.calls[1]![0].data.messages.at(-1)).toEqual({
      role: "user",
      content: "2 people",
    });
    expect(chat.fn.mock.calls[1]![0].data.draft.destination).toBe("Gatlinburg, TN");
    fireEvent.click(build);
    expect(onBuild).toHaveBeenCalledWith(expect.objectContaining({ travelers: 2 }));
  });

  it("shows the error with a retry and keeps nothing half-sent", async () => {
    chat.fn.mockResolvedValueOnce({
      ok: false,
      status: 429,
      error: "The assistant is busy right now.",
    });
    render(<TripAssistant homeCity="" onBuild={vi.fn()} onFill={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Describe your trip"), {
      target: { value: "Beach trip" },
    });
    fireEvent.click(screen.getByLabelText("Send"));
    await screen.findByText("The assistant is busy right now.");
    expect(screen.getByText("Try again")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Beach trip")).toBeNull());
  });

  it("asks signed-out travelers to sign in, keeping their message", () => {
    auth.user = null;
    render(<TripAssistant homeCity="" onBuild={vi.fn()} onFill={vi.fn()} />);
    expect(screen.getByText("Sign in to ask")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Describe your trip"), {
      target: { value: "Ski trip" },
    });
    expect(JSON.parse(window.sessionStorage.getItem("waypoint.assistant")!).pending).toBe(
      "Ski trip",
    );
    expect(chat.fn).not.toHaveBeenCalled();
  });
});
