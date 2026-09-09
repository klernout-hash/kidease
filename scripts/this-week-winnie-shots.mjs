#!/usr/bin/env node
/**
 * Capture THIS WEEK Winnie-loop screens at 390 and 1280.
 * Requires: CATALOG_SOURCE=json ALLOW_TEST_LISTINGS=0 npm run dev
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8080";
const OUT = process.env.SHOT_DIR || "/opt/cursor/artifacts/this-week-winnie";
mkdirSync(OUT, { recursive: true });

const LISTING = "acorn-family-place-playroom-100141";
const LISTING_B = "action-centre-day-nursery-inc-1150";

const pages = [
  { name: "home", path: "/" },
  { name: "search-gate", path: "/search" },
  { name: "search-toddler-now", path: "/search?age=toddler&start=now&q=Winnipeg" },
  { name: "search-home-cat", path: "/search?age=toddler&start=now&q=Winnipeg&cat=home" },
  { name: "listing-unclaimed", path: `/daycare/${LISTING}` },
  { name: "compare-two", path: `/compare?slugs=${LISTING},${LISTING_B}` },
];

const viewports = [
  { w: 390, h: 844 },
  { w: 1280, h: 800 },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    for (const spec of pages) {
      const url = `${BASE}${spec.path}`;
      console.error(`goto ${vp.w} ${url}`);
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(800);
      if (spec.name === "compare-two" && vp.w === 390) {
        await page.locator(".overflow-x-auto").evaluate((el) => {
          el.scrollLeft = el.scrollWidth;
        }).catch(() => undefined);
      }
      const file = `${OUT}/${spec.name}-${vp.w}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.error(`wrote ${file}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(OUT);
