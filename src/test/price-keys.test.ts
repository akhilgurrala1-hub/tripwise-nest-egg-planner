import { describe, expect, it } from "vitest";

import { checkPriceKeys, priceKey } from "@/lib/prices/keys.server";

describe("finding the price services' keys", () => {
  it("reads the documented names", () => {
    expect(priceKey("serpapi", { SERPAPI_API_KEY: "abc123" })).toEqual({
      key: "abc123",
      name: "SERPAPI_API_KEY",
    });
    expect(priceKey("eia", { EIA_API_KEY: "e1" })).toEqual({ key: "e1", name: "EIA_API_KEY" });
  });

  it("accepts common spellings and cleans pasted values", () => {
    expect(priceKey("serpapi", { SERPAPI_KEY: "  abc123\n" })?.key).toBe("abc123");
    expect(priceKey("serpapi", { SERP_API_KEY: '"abc123"' })?.key).toBe("abc123");
    expect(priceKey("serpapi", { serpApiKey: "abc" })).toEqual({ key: "abc", name: "serpApiKey" });
    expect(priceKey("eia", { EIA_KEY: "e1" })?.name).toBe("EIA_KEY");
  });

  it("ignores empty values and unrelated secrets", () => {
    expect(priceKey("serpapi", { SERPAPI_API_KEY: "   ", LOVABLE_API_KEY: "x" })).toBeNull();
    expect(priceKey("eia", { GOOGLE_MAPS_API_KEY: "x" })).toBeNull();
  });
});

const respond = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );

describe("testing the connection", () => {
  it("reports searches left and a working gas key, without spending a search", async () => {
    const urls: string[] = [];
    const checks = await checkPriceKeys({ SERPAPI_KEY: "s1", EIA_API_KEY: "e1" }, ((
      url: string,
    ) => {
      urls.push(url);
      return url.includes("serpapi")
        ? respond(200, { plan_name: "Free Plan", total_searches_left: 243 })
        : respond(200, { response: {} });
    }) as typeof fetch);
    expect(urls[0]).toBe("https://serpapi.com/account.json?api_key=s1");
    expect(checks).toEqual([
      {
        service: "serpapi",
        name: "SERPAPI_KEY",
        status: "ok",
        detail: "Free Plan · 243 searches left this month",
      },
      { service: "eia", name: "EIA_API_KEY", status: "ok", detail: "Connected" },
    ]);
  });

  it("says when a key is missing or rejected", async () => {
    const checks = await checkPriceKeys({ SERPAPI_API_KEY: "bad" }, (() =>
      respond(401, { error: "Invalid API key." })) as typeof fetch);
    expect(checks.map((c) => c.status)).toEqual(["rejected", "missing"]);
    expect(JSON.stringify(checks)).not.toContain("bad");
  });
});
