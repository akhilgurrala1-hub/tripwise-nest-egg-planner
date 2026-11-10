import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "test" ? [] : files(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

describe("external links", () => {
  it("open only after safeExternalUrl checks them (no raw href={x.url})", () => {
    const raw: string[] = [];
    for (const p of files(SRC)) {
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/href=\{\s*[\w.?]*\.(?:url|link|mapsUrl|bookingUrl)\s*\}/g))
        raw.push(`${relative(SRC, p)}: ${m[0]}`);
    }
    expect(raw).toEqual([]);
  });
});
