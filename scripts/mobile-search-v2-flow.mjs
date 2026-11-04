#!/usr/bin/env node
/**
 * Phone-width walk of the mobile search sheet.
 * The dev server must already be running with FEATURE_MOBILE_SEARCH_V2=1.
 * Usage: node scripts/mobile-search-v2-flow.mjs http://127.0.0.1:8099
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const base = (process.argv[2] || "http://127.0.0.1:8099").replace(/\/$/, "");
const outDir = join(process.cwd(), "docs/mobile-search-v2");
mkdirSync(outDir, { recursive: true });

const steps = [];
function mark(name, ok, detail = "") {
  steps.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: outDir, size: { width: 390, height: 844 } },
  locale: "en-CA",
});
const page = await context.newPage();
page.setDefaultTimeout(25000);

async function dismissCookies() {
  const banner = page.locator("[data-ke=cookie-consent]");
  if (await banner.count()) {
    const button = banner.locator("[data-ke=cookie-essential]");
    if (await button.count()) await button.click({ timeout: 3000 }).catch(() => {});
    await banner.waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});
  }
}

async function phoneRoot() {
  await page.waitForFunction(() => document.documentElement.dataset.channel);
  const channel = await page.evaluate(() => document.documentElement.dataset.channel);
  return channel === "app" ? ".ke-home-app" : ".ke-home-web";
}

try {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await dismissCookies();
  const homeRoot = await phoneRoot();
  const pill = page.locator(`${homeRoot} [data-ke=msv2-pill]`);
  await pill.waitFor({ state: "visible" });
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && Object.keys(el).some((key) => key.startsWith("__reactProps"));
  }, `${homeRoot} [data-ke=msv2-pill]`);
  await page.screenshot({ path: join(outDir, "01-pill.png") });
  mark("pill", true);

  await pill.click();
  const sheet = page.locator("[data-ke=msv2-sheet]");
  await sheet.waitFor({ state: "visible" });
  await page.screenshot({ path: join(outDir, "02-where.png") });
  mark("where", (await sheet.getAttribute("data-step")) === "where");

  await page.locator("[data-ke=msv2-where-input]").fill("Winnipeg");
  const suggestion = page.locator("[data-ke=msv2-where-list] button", { hasText: "Winnipeg" }).first();
  if (await suggestion.count()) await suggestion.click();
  await page.locator("[data-ke=msv2-next]").click();
  const day = page.locator("[data-ke=msv2-calendar] button:not([disabled])").filter({ hasText: /^\d{1,2}$/ }).first();
  if (await day.count()) await day.click();
  await page.getByRole("button", { name: "Full-time" }).click();
  await page.screenshot({ path: join(outDir, "03-when.png") });
  mark("when", (await sheet.getAttribute("data-step")) === "when");

  await page.locator("[data-ke=msv2-next]").click();
  await page.screenshot({ path: join(outDir, "04-who.png") });
  mark("who", (await sheet.getAttribute("data-step")) === "who");

  await page.locator("[data-ke=msv2-count-toddler]").locator("xpath=following-sibling::button").click();
  const count = await page.locator("[data-ke=msv2-count-toddler]").innerText();
  await page.locator("[data-ke=msv2-search]").click();
  await page.waitForURL(/\/search/, { timeout: 45000 });
  await dismissCookies();
  const results = page.locator("[data-ke=msv2-results]");
  await results.waitFor({ state: "visible", timeout: 45000 });
  await page
    .locator("[data-ke=msv2-list]")
    .getByText(/licensed|Aucun|No licensed|Loading/i)
    .first()
    .waitFor({ timeout: 8000 })
    .catch(() => {});
  await page.screenshot({ path: join(outDir, "05-results.png") });
  const headline = await page.locator("[data-ke=msv2-summary]").innerText();
  mark("search", /Winnipeg/i.test(headline) && count.trim() === "1", headline.replace(/\s+/g, " "));

  await page.goto(`${base}/fr`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await dismissCookies();
  const frRoot = await phoneRoot();
  const frPill = page.locator(`${frRoot} [data-ke=msv2-pill]`);
  await frPill.waitFor({ state: "visible" });
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && Object.keys(el).some((key) => key.startsWith("__reactProps"));
  }, `${frRoot} [data-ke=msv2-pill]`);
  const frText = await frPill.innerText();
  await page.screenshot({ path: join(outDir, "06-pill-fr.png") });
  await frPill.click();
  await page.locator("[data-ke=msv2-sheet]").waitFor({ state: "visible" });
  await page.screenshot({ path: join(outDir, "07-where-fr.png") });
  mark("french", /garderie/i.test(frText), frText.replace(/\s+/g, " "));
} catch (err) {
  mark("flow", false, err instanceof Error ? err.message : String(err));
  await page.screenshot({ path: join(outDir, "fail.png") }).catch(() => {});
} finally {
  await context.close();
  await browser.close();
}

const failed = steps.filter((step) => !step.ok);
console.log(JSON.stringify({ ok: failed.length === 0, steps }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
