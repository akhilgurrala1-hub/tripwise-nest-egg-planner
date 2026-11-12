import { describe, expect, it } from "vitest";

import {
  affiliateDisclosure,
  outboundLink,
  parsePartnerConfig,
  partnerForUrl,
} from "@/lib/partners/config";
import {
  estimateCommission,
  isEarned,
  reverseCommission,
  summarizeCommissions,
  type CommissionRecord,
} from "@/lib/partners/commission";

const cfg = parsePartnerConfig(
  JSON.stringify({
    booking: { param: "aid", value: "TEST-123" },
    bogus: { param: "x", value: "y" },
  }),
);

describe("partner links", () => {
  it("leaves every link untouched when nothing is configured", () => {
    const l = outboundLink("https://www.booking.com/searchresults.html?ss=Rome", {});
    expect(l).toEqual({
      href: "https://www.booking.com/searchresults.html?ss=Rome",
      rel: "noopener noreferrer",
      affiliate: false,
    });
  });

  it("adds a configured tracking value only to that partner's https links", () => {
    const l = outboundLink("https://www.booking.com/searchresults.html?ss=Rome", cfg);
    expect(l.affiliate).toBe(true);
    expect(new URL(l.href!).searchParams.get("aid")).toBe("TEST-123");
    expect(new URL(l.href!).searchParams.get("ss")).toBe("Rome");
    expect(l.rel).toContain("sponsored");
    // Other providers and plain http stay plain.
    expect(outboundLink("https://www.kayak.com/flights", cfg).affiliate).toBe(false);
    expect(outboundLink("http://www.booking.com/x", cfg).affiliate).toBe(false);
  });

  it("replaces an existing value of the same name instead of doubling it", () => {
    const l = outboundLink("https://booking.com/x?aid=OLD", cfg);
    expect(new URL(l.href!).searchParams.getAll("aid")).toEqual(["TEST-123"]);
  });

  it("refuses non-web links", () => {
    expect(outboundLink("javascript:alert(1)", cfg).href).toBeUndefined();
    expect(outboundLink("not a url", cfg).href).toBeUndefined();
  });

  it("matches a partner by host, subdomains included, and not by lookalikes", () => {
    expect(partnerForUrl("https://m.booking.com/x")?.id).toBe("booking");
    expect(partnerForUrl("https://notbooking.com/x")).toBeNull();
    expect(partnerForUrl("https://booking.com.evil.test/x")).toBeNull();
  });
});

describe("partner configuration", () => {
  it("ignores unknown partners, bad parameter names and unsafe values", () => {
    expect(Object.keys(cfg)).toEqual(["booking"]);
    expect(parsePartnerConfig(JSON.stringify({ booking: { param: "a b", value: "1" } }))).toEqual(
      {},
    );
    expect(
      parsePartnerConfig(JSON.stringify({ booking: { param: "aid", value: "1&x=2" } })),
    ).toEqual({});
    expect(parsePartnerConfig("not json")).toEqual({});
    expect(parsePartnerConfig(undefined)).toEqual({});
    expect(parsePartnerConfig("[]")).toEqual({});
  });

  it("says Waypoint earns nothing when nothing is configured, and names only configured partners otherwise", () => {
    expect(affiliateDisclosure({})).toMatch(/earns nothing/);
    const d = affiliateDisclosure(cfg);
    expect(d).toMatch(/Booking\.com/);
    expect(d).not.toMatch(/KAYAK|Expedia/);
    expect(d).not.toMatch(/earns nothing/);
  });
});

const rec = (over: Partial<CommissionRecord>): CommissionRecord => ({
  id: "1",
  partnerId: "booking",
  partnerRef: "BK-1",
  bookingValue: 1000,
  commission: 40,
  currency: "USD",
  status: "approved",
  ...over,
});

describe("commissions", () => {
  it("only a partner-reported, approved or paid commission is earned", () => {
    expect(isEarned(rec({}))).toBe(true);
    expect(isEarned(rec({ status: "paid" }))).toBe(true);
    expect(isEarned(rec({ status: "estimated", partnerRef: "" }))).toBe(false);
    expect(isEarned(rec({ status: "pending" }))).toBe(false);
    expect(isEarned(rec({ partnerRef: "" }))).toBe(false);
    expect(isEarned(rec({ status: "reversed" }))).toBe(false);
  });

  it("never counts booking value or estimates as earned", () => {
    const s = summarizeCommissions([
      rec({ id: "a", commission: 40 }),
      rec({ id: "b", status: "paid", commission: 25.5 }),
      rec({ id: "c", status: "pending", commission: 10 }),
      rec({ id: "d", status: "estimated", partnerRef: "", commission: 99 }),
      rec({ id: "e", status: "reversed", commission: 12 }),
    ]);
    expect(s).toEqual({ earned: 65.5, paid: 25.5, pending: 10, estimated: 99, reversed: 12 });
  });

  it("a refund reverses a commission and the reversal keeps its reason", () => {
    const r = reverseCommission(rec({}), "Guest cancelled");
    expect(r.status).toBe("reversed");
    expect(isEarned(r)).toBe(false);
    expect(summarizeCommissions([r]).earned).toBe(0);
  });

  it("estimates from a published rate and refuses nonsense", () => {
    expect(estimateCommission(1000, 4)).toBe(40);
    expect(estimateCommission(-5, 4)).toBe(0);
    expect(estimateCommission(100, 150)).toBe(0);
  });
});
