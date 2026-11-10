import { describe, expect, it } from "vitest";

import { SECURITY_HEADERS } from "@/lib/security-headers";

describe("security headers", () => {
  it("refuses to be framed by other sites (clickjacking)", () => {
    expect(SECURITY_HEADERS["x-frame-options"]).toBe("DENY");
    expect(SECURITY_HEADERS["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("blocks plugins and base-tag hijacking without limiting the app's own scripts", () => {
    const csp = SECURITY_HEADERS["content-security-policy"]!;
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toMatch(/script-src|default-src/);
  });

  it("keeps the existing defaults", () => {
    expect(SECURITY_HEADERS["x-content-type-options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(SECURITY_HEADERS["permissions-policy"]).toContain("camera=()");
  });
});
