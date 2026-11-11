// Regenerates every brand image in public/ from public/favicon.svg (the source of truth).
//   node scripts/brand-assets.mjs            (needs Playwright's Chromium)
// Outputs: favicon.ico (16/32/48), apple-touch-icon.png, icon-192/512.png,
// icon-maskable-512.png and og-image.png. Keep the mark in sync with src/components/app/Logo.tsx.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const pub = new URL("../public/", import.meta.url).pathname;
const svg = readFileSync(join(pub, "favicon.svg"), "utf8");
const inner = svg.replace(/^[\s\S]*?<rect[^>]*\/>/, "").replace(/<\/svg>\s*$/, "");
const GROUND = "#0F1A33";

/** Variants of the mark: rounded tile (default), full-bleed square, or full-bleed with a safe-zone inset. */
function mark({ bleed = false, inset = 1 } = {}) {
  const scale =
    inset === 1 ? "" : ` transform="translate(16 16) scale(${inset}) translate(-16 -16)"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" ${bleed ? "" : 'rx="7"'} fill="${GROUND}"/><g${scale}>${inner}</g></svg>`;
}
const dataUri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();

async function png(svgText, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="${dataUri(svgText)}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  await page.waitForTimeout(120);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

/** ICO container holding PNG images (supported by every current browser and Windows). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const icoImages = [];
for (const size of [16, 32, 48]) icoImages.push({ size, data: await png(mark(), size) });
writeFileSync(join(pub, "favicon.ico"), ico(icoImages));
// iOS rounds the corners itself, so the touch icon is a full-bleed square.
writeFileSync(
  join(pub, "apple-touch-icon.png"),
  await png(mark({ bleed: true, inset: 0.86 }), 180),
);
writeFileSync(join(pub, "icon-192.png"), await png(mark(), 192));
writeFileSync(join(pub, "icon-512.png"), await png(mark(), 512));
// Android masks can crop to a circle: keep the route inside the central 80% safe zone.
writeFileSync(
  join(pub, "icon-maskable-512.png"),
  await png(mark({ bleed: true, inset: 0.72 }), 512),
);

// Social share image (1200×630): the brand's editorial language on its near-black ground.
const fontDir = (name) =>
  new URL(`../node_modules/@fontsource-variable/${name}/files/`, import.meta.url).pathname;
const face = (family, name, file, style = "normal") =>
  `@font-face{font-family:${family};font-style:${style};font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync(join(fontDir(name), file)).toString("base64")}) format("woff2")}`;
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><head><style>
  ${face("Fraunces", "fraunces", "fraunces-latin-opsz-normal.woff2")}
  ${face("Fraunces", "fraunces", "fraunces-latin-opsz-italic.woff2", "italic")}
  ${face("Inter", "inter", "inter-latin-wght-normal.woff2")}
  ${face("Mono", "jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2")}
  body{margin:0;width:1200px;height:630px;background:#0F1A33;color:#F6F1E7;font-family:Inter,system-ui,sans-serif;overflow:hidden;position:relative}
  .wrap{position:absolute;left:88px;top:72px;right:480px}
  .lock{display:flex;align-items:center;gap:20px}
  .word{font-family:Inter,sans-serif;font-size:42px;font-weight:700;letter-spacing:-0.01em}
  .label{display:flex;align-items:center;gap:18px;margin-top:84px;font-family:Inter,sans-serif;font-size:22px;font-weight:600;color:#E0602F}
  .label::before{content:"";width:44px;height:1px;background:#E0602F}
  h1{font-family:Inter,sans-serif;font-weight:700;margin:28px 0 0;font-size:100px;line-height:0.98;letter-spacing:-0.028em}
  h1 em{font-style:normal;color:#E0602F}
  p{margin:30px 0 0;font-size:24px;line-height:1.5;color:#C7CCDB;max-width:560px}
  .art{position:absolute;right:72px;top:120px;width:380px;height:380px}
  .rule{position:absolute;left:88px;right:88px;bottom:72px;height:1px;background:rgba(246,241,231,0.16)}
  .foot{position:absolute;left:88px;bottom:30px;font-family:Inter,sans-serif;font-size:18px;color:#A9B0C4}
</style></head><body>
  <div class="wrap">
    <div class="lock"><img src="${dataUri(mark())}" width="64" height="64"><span class="word">Waypoint</span></div>
    <div class="label">Trip planner · Priced to the dollar</div>
    <h1>Plan a trip,<br><em>to the dollar.</em></h1>
    <p>Budgets, day-by-day plans and a booking checklist for any kind of trip.</p>
  </div>
  <svg class="art" viewBox="2.4 2.4 27.2 27.2"><g>${inner}</g></svg>
  <div class="rule"></div><div class="foot">Road trips · Fly-aways · Cruises · Train &amp; bus · Staycations</div>
</body></html>`);
await page.waitForTimeout(150);
writeFileSync(
  join(pub, "og-image.png"),
  await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }),
);

await browser.close();
console.log("Brand assets written to public/");
