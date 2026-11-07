/**
 * The design system's rules, enforced: every component sticks to the type scale,
 * the 8px grid, springs for motion and the materials, so the app keeps feeling
 * like one product as it grows. When a rule fails, use the token named in the
 * message (see the "Design system" notes in AGENTS.md).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { springEasing, SPRINGS } from "@/lib/spring";

const SRC = join(__dirname, "..");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "test") files(p, out);
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const SOURCES = files(SRC).map((p) => ({ path: relative(SRC, p), text: readFileSync(p, "utf8") }));

/** Every place a pattern appears, as "file: match". */
function find(re: RegExp, allow: (path: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const f of SOURCES) {
    if (allow(f.path)) continue;
    for (const m of f.text.matchAll(re)) out.push(`${f.path}: ${m[0]}`);
  }
  return out;
}

describe("type", () => {
  it("uses the 9-level scale, never one-off sizes (text-display … text-micro)", () => {
    expect(find(/\btext-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g)).toEqual([]);
  });

  it("takes letter-spacing from the scale, not by hand", () => {
    expect(find(/\btracking-\[[^\]]+\]|\btracking-(?:tight|tighter)\b/g)).toEqual([]);
  });

  it("keeps monospace for codes people copy (keys, confirmation numbers)", () => {
    expect(
      find(/\bfont-mono\b/g, (p) => p.endsWith("PriceKeyCheck.tsx") || p.endsWith("book.tsx")),
    ).toEqual([]);
  });
});

describe("space", () => {
  it("sits on the 8px grid (4px only for small details)", () => {
    const off =
      /(?<![\w[\]/.-])-?(?:[a-z-]+:)*(?:p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y)-(?:0\.5|1\.5|2\.5|3\.5|3|5|7|9|11|13|15)(?![\w.])/g;
    expect(find(off)).toEqual([]);
  });

  it("uses spacing tokens, not arbitrary pixels", () => {
    expect(
      find(
        /(?<![\w-])-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-y|space-x)-\[(?!1px\])[^\]]+\]/g,
      ),
    ).toEqual([]);
  });
});

describe("motion", () => {
  it("moves on springs: no hand-tuned bezier curves in components", () => {
    expect(find(/cubic-bezier\(|ease-\[[^\]]+\]/g)).toEqual([]);
  });

  it("responds to touch, not hover: cards press, they don't float up", () => {
    expect(find(/\bhover:-?translate-[xy]-[\w.]+/g)).toEqual([]);
  });

  it("the CSS springs match the physics", () => {
    // Compare without layout whitespace (Prettier wraps the long easings).
    const flat = (t: string) =>
      t
        .replace(/\s+/g, " ")
        .replace(/\(\s+/g, "(")
        .replace(/,?\s*\)/g, ")");
    const css = flat(readFileSync(join(SRC, "styles.css"), "utf8"));
    for (const name of ["snappy", "smooth", "bouncy", "press"] as const) {
      const { easing } = springEasing(SPRINGS[name], name === "bouncy" ? 36 : 24);
      expect(css, `--ease-spring-${name} is out of date with SPRINGS.${name}`).toContain(
        flat(`--ease-spring-${name}: ${easing};`),
      );
    }
  });
});

describe("surfaces", () => {
  it("has no decorative gradients (photo scrims excepted)", () => {
    expect(find(/\bbg-gradient-to-\w+|\bbg-linear-to-\w+|linear-gradient\(/g)).toEqual([]);
  });

  it("has no pill-shaped chips: controls are rounded rectangles", () => {
    const pills: string[] = [];
    for (const f of SOURCES)
      for (const m of f.text.matchAll(/"[^"\n]*\brounded-full\b[^"\n]*"/g))
        if (/\bpx-\d/.test(m[0]) && /\b(text-|font-)/.test(m[0])) pills.push(`${f.path}: ${m[0]}`);
    expect(pills).toEqual([]);
  });

  it("rounds corners from the four-radius scale only, never by hand", () => {
    expect(find(/\brounded(?:-[a-z]{1,2})?-\[(?!inherit\])[^\]]+\]/g)).toEqual([]);
  });

  it("fields share one shape: text inputs, text areas and selects", () => {
    const ui = join(SRC, "components", "ui");
    const fields = ["input", "textarea", "select"].filter((f) =>
      readdirSync(ui).includes(`${f}.tsx`),
    );
    expect(fields).toContain("input");
    for (const f of fields) {
      const src = readFileSync(join(ui, `${f}.tsx`), "utf8");
      expect(src, `${f}.tsx`).toMatch(/rounded-xl border border-input bg-fill/);
      expect(src, `${f}.tsx`).not.toMatch(/\bshadow-sm\b/);
    }
  });

  it("floating menus use the floating material", () => {
    expect(find(/rounded-md border bg-popover/g)).toEqual([]);
  });

  it("glass turns solid for Reduce Transparency and Increase Contrast", () => {
    const css = readFileSync(join(SRC, "styles.css"), "utf8");
    for (const query of ["prefers-reduced-transparency: reduce", "prefers-contrast: more"]) {
      const at = css.indexOf(`@media (${query})`);
      expect(at, `no @media (${query}) block`).toBeGreaterThan(-1);
      const block = css.slice(at, css.indexOf("\n}\n", at));
      for (const material of [".material-thick", ".material-regular", ".floating"])
        expect(block, `${material} under ${query}`).toContain(material);
      expect(block).toContain("backdrop-filter: none");
    }
  });
});

describe("buttons", () => {
  it("show work in progress: spinner in place of the icon, label kept, pressed once", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { Button } = await import("@/components/ui/button");
    const html = renderToStaticMarkup(createElement(Button, { loading: true }, "Save"));
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("data-spinner");
    expect(html).toContain("Save");
    const idle = renderToStaticMarkup(createElement(Button, null, "Save"));
    expect(idle).not.toContain("data-spinner");
    expect(idle).not.toContain("aria-busy");
  });
});

describe("class merging", () => {
  it("keeps a text color next to a type level", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("text-go-foreground", "text-headline")).toBe("text-go-foreground text-headline");
    expect(cn("text-body", "text-footnote")).toBe("text-footnote");
    expect(cn("text-sm", "text-caption")).toBe("text-caption");
  });
});

describe("no template tells", () => {
  it("headlines are one color: no accent word in the brand color", () => {
    expect(find(/<em className="text-primary">/g)).toEqual([]);
  });

  it("blue marks only what you can press or what's selected: no decorative or status blue", () => {
    // Icons and plain text in the accent color read as buttons that aren't there.
    const icon = /<(?!Link\b|Button\b)[A-Z]\w*\s+className="[^"]*\btext-primary(?![\w-])[^"]*"/g;
    const text =
      /<(?:span|p|div|dd|dt|li|h[1-6])\b[^>]*className="[^"]*\btext-primary(?![\w-])[^"]*"/g;
    expect([...find(icon, (p) => p.startsWith("components/ui/")), ...find(text)]).toEqual([]);
  });

  it("no sparkles or magic wands standing in for features", () => {
    expect(
      find(/\b(?:Sparkles?|Wand2?|WandSparkles)\b/g, (p) => p.startsWith("components/ui/")),
    ).toEqual([]);
  });

  it("coral stays in the logo and the route art; the UI has one brand color", () => {
    const art = (p: string) =>
      /Logo\.tsx$|Illustrations\.tsx$|TravelScene\.tsx$|Intro\.tsx$/.test(p);
    expect(
      find(/\b(?:text|bg|border|ring|fill|stroke)-(?:brand-coral|coral-text)\b/g, art),
    ).toEqual([]);
  });

  it("photos go through Photo (loading placeholder, fade-in, fallback), never a bare img", () => {
    expect(find(/<img\b/g, (p) => p.endsWith("Photo.tsx"))).toEqual([]);
  });

  it("pairs a serif display face with the text face, both self-hosted", () => {
    const css = readFileSync(join(SRC, "styles.css"), "utf8");
    const face = (name: string) => css.match(new RegExp(`--font-${name}:\\s*"([^"]+)"`))?.[1];
    expect(face("display")).toBe("Newsreader Variable");
    expect(face("sans")).toBe("Instrument Sans Variable");
    expect(css).toContain('@import "@fontsource-variable/newsreader');
  });

  it("uses its own type pairing, self-hosted: no Inter, no Google Fonts", () => {
    const css = readFileSync(join(SRC, "styles.css"), "utf8");
    expect(css).not.toMatch(/"Inter"/);
    const root = readFileSync(join(SRC, "routes", "__root.tsx"), "utf8");
    expect(root).not.toMatch(/fonts\.googleapis\.com/);
  });
});

describe("product-team basics", () => {
  const ROUTES = join(SRC, "routes");
  const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8");

  it("every page has its own title and description", () => {
    const pages = [
      ...readdirSync(ROUTES).map((f) => join(ROUTES, f)),
      ...readdirSync(join(ROUTES, "_authenticated")).map((f) => join(ROUTES, "_authenticated", f)),
    ].filter((f) => f.endsWith(".tsx") && !/__root|route\.tsx$/.test(f));
    const missing = pages.filter((f) => {
      const src = readFileSync(f, "utf8");
      return !/title: "/.test(src) || !/name: "description"/.test(src);
    });
    expect(missing.map((f) => relative(SRC, f))).toEqual([]);
  });

  it("has a Privacy Policy and Terms, linked from the footer and the sign-up form", () => {
    expect(read("routes", "privacy.tsx")).toContain("Privacy Policy");
    expect(read("routes", "terms.tsx")).toContain("Terms of Service");
    const shell = read("components", "app", "AppShell.tsx");
    expect(shell).toContain('to="/privacy"');
    expect(shell).toContain('to="/terms"');
    const auth = read("routes", "auth.tsx");
    expect(auth).toContain('to="/terms"');
    expect(auth).toContain('to="/privacy"');
  });

  it("no gradient text, glowing orbs or labels stacked above page titles", () => {
    expect(find(/\bbg-clip-text\b|\bblur-3xl\b|radial-gradient\(/g)).toEqual([]);
    expect(read("components", "app", "TripHeader.tsx")).not.toMatch(/eyebrow/);
  });

  it("content is simply there: no fade-in on every card, section or page", () => {
    const css = read("styles.css");
    expect(css).not.toMatch(/@utility (animate-rise|animate-pop|animate-page|reveal|parallax) /);
    expect(css).not.toMatch(/\.hero-in \{/);
    expect(
      find(/\banimate-(?:rise|pop|page)\b|useScrollReveal|countUp|\bhero-in\b|\bparallax\b/g),
    ).toEqual([]);
  });

  it("copy says what the product does, not buzzwords", () => {
    const buzz =
      /\b(?:seamless(?:ly)?|effortless(?:ly)?|unlock|supercharge|revolutioni[sz]e|cutting-edge|next-gen|game-chang\w+|AI-powered|smart budgets?|empower\w*|blazing)\b/gi;
    expect(find(buzz)).toEqual([]);
  });
});
