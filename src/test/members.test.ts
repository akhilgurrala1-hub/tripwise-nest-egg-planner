import { describe, expect, it } from "vitest";

import { friendlyShareError, inviteUrl, tokenFromHash } from "@/lib/members";

const TOKEN = "a".repeat(32) + "0123456789abcdef".repeat(2);

describe("invite links", () => {
  it("puts the token after the #, so it never reaches the server", () => {
    const url = inviteUrl("https://example.test", TOKEN);
    expect(url).toBe(`https://example.test/join#${TOKEN}`);
    expect(new URL(url).search).toBe("");
    expect(new URL(url).pathname).toBe("/join");
  });

  it("reads only a well-formed token from a fragment", () => {
    expect(tokenFromHash(`#${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash(`#${TOKEN.toUpperCase()}`)).toBe(TOKEN);
    expect(tokenFromHash("")).toBeNull();
    expect(tokenFromHash("#short")).toBeNull();
    expect(tokenFromHash(`#${TOKEN}x`)).toBeNull();
    expect(tokenFromHash(`#${"g".repeat(64)}`)).toBeNull();
  });
});

describe("what people are told", () => {
  it("turns each database code into a plain sentence", () => {
    expect(friendlyShareError(new Error("invalid_invite"))).toMatch(/isn't valid any more/);
    expect(friendlyShareError("own_trip")).toMatch(/your own trip/);
    expect(friendlyShareError({ message: "x" })).toMatch(/Something went wrong/);
    expect(friendlyShareError(new Error("P0001: member_limit"))).toMatch(/as many people/);
    expect(friendlyShareError(null)).toMatch(/Something went wrong/);
  });

  it("never shows raw database text", () => {
    const m = friendlyShareError(new Error('permission denied for table "trip_members"'));
    expect(m).not.toMatch(/permission|table|trip_members/);
  });
});
