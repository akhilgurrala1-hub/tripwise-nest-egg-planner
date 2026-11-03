import { describe, expect, it } from "vitest";

import { LIMITS, rateLimiter } from "@/lib/rate-limit.server";

describe("per-account limits on paid features", () => {
  it("allows normal use, then says when to try again", () => {
    let t = 0;
    const rl = rateLimiter(() => t);
    const limit = { max: 3, windowMs: 60 * 60 * 1000 };
    expect([1, 2, 3].map(() => rl.take("u1", "aiPlan", limit))).toEqual([null, null, null]);
    t = 20 * 60 * 1000;
    expect(rl.take("u1", "aiPlan", limit)).toBe(
      "You've used this a lot in the last hour. Try again in about 40 minutes.",
    );
    // An hour after the first use, there's room again.
    t = 60 * 60 * 1000 + 1;
    expect(rl.take("u1", "aiPlan", limit)).toBeNull();
  });

  it("counts each account and each feature separately", () => {
    const rl = rateLimiter(() => 0);
    const limit = { max: 1, windowMs: 1000 };
    expect(rl.take("u1", "aiPlan", limit)).toBeNull();
    expect(rl.take("u1", "aiPlan", limit)).not.toBeNull();
    expect(rl.take("u2", "aiPlan", limit)).toBeNull();
    expect(rl.take("u1", "prices", limit)).toBeNull();
  });

  it("is generous enough for a real planning session", () => {
    expect(LIMITS.aiChat.max).toBeGreaterThanOrEqual(40);
    expect(LIMITS.aiPlan.max).toBeGreaterThanOrEqual(10);
    expect(LIMITS.prices.max).toBeGreaterThanOrEqual(10);
  });
});
