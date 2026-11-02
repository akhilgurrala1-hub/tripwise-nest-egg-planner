// Regenerates every brand image in public/ from public/favicon.svg (the source of truth).
//   node scripts/brand-assets.mjs            (needs Playwright's Chromium)
//   GEIST_DIR=/path/to/geist-sans node ...   (folder with Geist-*.woff2, for the social image text)
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
const BLUE = "#2457E6";

/** Variants of the mark: rounded tile (default), full-bleed square, or full-bleed with a safe-zone inset. */
function mark({ bleed = false, inset = 1 } = {}) {
  const scale =
    inset === 1 ? "" : ` transform="translate(16 16) scale(${inset}) translate(-16 -16)"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" ${bleed ? "" : 'rx="8"'} fill="${BLUE}"/><g${scale}>${inner}</g></svg>`;
}
const dataUri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();

async function png(svgText, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="${dataUri(svgText)}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
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

// Social share image (1200×630).
const geist = process.env.GEIST_DIR;
const font = (w, file) =>
  geist && existsSync(join(geist, file))
    ? `@font-face{font-family:Geist;font-weight:${w};src:url(data:font/woff2;base64,${readFileSync(join(geist, file)).toString("base64")}) format("woff2")}`
    : "";
const routeBig = inner.replace(/stroke-width="2.7"/, 'stroke-width="2.2"');
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><head><style>
  ${font(400, "Geist-Regular.woff2")}${font(500, "Geist-Medium.woff2")}${font(600, "Geist-SemiBold.woff2")}
  body{margin:0;width:1200px;height:630px;background:#FBFBFC;font-family:Geist,Inter,system-ui,sans-serif;color:#1A1B1F;overflow:hidden;position:relative}
  .wrap{position:absolute;left:88px;top:84px;right:520px}
  .lock{display:flex;align-items:center;gap:18px}
  .word{font-size:44px;font-weight:600;letter-spacing:-0.03em}
  h1{margin:88px 0 0;font-size:64px;line-height:1.05;font-weight:600;letter-spacing:-0.035em}
  p{margin:22px 0 0;font-size:26px;line-height:1.4;color:#6B6F78;letter-spacing:-0.01em}
  .art{position:absolute;right:56px;top:118px;width:420px;height:350px}
  .rule{position:absolute;left:88px;right:88px;bottom:64px;height:1px;background:#E6E7EA}
  .foot{position:absolute;left:88px;bottom:28px;font-size:18px;color:#8A8E97;letter-spacing:0.08em;text-transform:uppercase;font-weight:500}
</style></head><body>
  <div class="wrap">
    <div class="lock"><img src="${dataUri(mark())}" width="72" height="72"><span class="word">Waypoint</span></div>
    <h1>Plan a trip,<br>to the dollar.</h1>
    <p>Budgets, live weather and day-by-day plans for road trips, flights, cruises and staycations.</p>
  </div>
  <svg class="art" viewBox="4 6 24 20"><g>${routeBig
    // Swap the tile color for the page color first, then turn the white route brand blue.
    .replace(/fill="#2457E6"/g, 'fill="#FBFBFC"')
    .replace(/stroke="#2457E6"/g, 'stroke="#FBFBFC"')
    .replace(/stroke="#fff"/g, `stroke="${BLUE}"`)}</g></svg>
  <div class="rule"></div><div class="foot">Road trips · Fly-aways · Cruises · Train &amp; bus · Staycations</div>
</body></html>`);
await page.waitForTimeout(150);
writeFileSync(
  join(pub, "og-image.png"),
  await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }),
);

await browser.close();
console.log("Brand assets written to public/");
