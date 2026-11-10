import { describe, expect, it } from "vitest";

import { cloudflareGeo, vercelGeo } from "@/lib/live/visitor-geo";

describe("vercelGeo", () => {
  it("reads Vercel's location headers and decodes the city", () => {
    const h = new Headers({
      "x-vercel-ip-latitude": "35.2271",
      "x-vercel-ip-longitude": "-80.8431",
      "x-vercel-ip-city": "S%C3%A3o%20Paulo",
      "x-vercel-ip-country-region": "NC",
      "x-vercel-ip-country": "US",
    });
    expect(vercelGeo(h)).toEqual({
      city: "São Paulo",
      regionCode: "NC",
      region: "NC",
      country: "US",
      lat: 35.2271,
      lon: -80.8431,
    });
  });

  it("returns null without coordinates", () => {
    expect(vercelGeo(new Headers({ "x-vercel-ip-city": "Charlotte" }))).toBeNull();
  });

  it("keeps a malformed city as sent", () => {
    const h = new Headers({
      "x-vercel-ip-latitude": "1",
      "x-vercel-ip-longitude": "2",
      "x-vercel-ip-city": "%E0%A4%A",
    });
    expect(vercelGeo(h)?.city).toBe("%E0%A4%A");
  });
});

describe("cloudflareGeo", () => {
  it("needs finite coordinates", () => {
    expect(cloudflareGeo({ city: "X" })).toBeNull();
    expect(cloudflareGeo({ latitude: "1", longitude: "2", city: "X" })?.lat).toBe(1);
  });
});
