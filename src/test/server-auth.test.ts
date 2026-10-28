import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  claims: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: (handler: unknown) => handler }),
  createServerFn: () => {
    const options: { middleware?: unknown; validator?: unknown } = {};
    const chain = {
      middleware: (middleware: unknown) => {
        options.middleware = middleware;
        return chain;
      },
      inputValidator: (validator: unknown) => {
        options.validator = validator;
        return chain;
      },
      handler: () => options,
    };
    return chain;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: mocks.request }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims: mocks.claims } }),
}));

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAiItinerary } from "@/lib/ai-itinerary.functions";
import { getRealStops } from "@/lib/places/real-stops.functions";

const authenticate = requireSupabaseAuth as unknown as (options: {
  next: (value?: unknown) => unknown;
}) => Promise<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://test.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

afterEach(() => vi.unstubAllEnvs());

it("declares the verified auth middleware on both billable server functions", () => {
  for (const fn of [createAiItinerary, getRealStops]) {
    expect((fn as unknown as { middleware: unknown[] }).middleware).toContain(requireSupabaseAuth);
  }
});

it("rejects signed-out requests before any Supabase or provider work", async () => {
  mocks.request.mockReturnValue(new Request("https://test.invalid"));
  const next = vi.fn();
  await expect(authenticate({ next })).rejects.toThrow("No authorization header");
  expect(next).not.toHaveBeenCalled();
  expect(mocks.claims).not.toHaveBeenCalled();
});

it("rejects unverified or malformed bearer tokens", async () => {
  const next = vi.fn();
  for (const token of ["invalid", "test.jwt.signature"]) {
    mocks.request.mockReturnValue(
      new Request("https://test.invalid", { headers: { authorization: `Bearer ${token}` } }),
    );
    mocks.claims.mockResolvedValue({ data: null, error: new Error("invalid signature") });
    await expect(authenticate({ next })).rejects.toThrow("Invalid token");
  }
  expect(next).not.toHaveBeenCalled();
});

it("continues with a user id only after Supabase confirms claims", async () => {
  mocks.request.mockReturnValue(
    new Request("https://test.invalid", {
      headers: { authorization: "Bearer test.jwt.signature" },
    }),
  );
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "test-user" } }, error: null });
  const next = vi.fn().mockResolvedValue("ok");
  await expect(authenticate({ next })).resolves.toBe("ok");
  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ context: expect.objectContaining({ userId: "test-user" }) }),
  );
});
