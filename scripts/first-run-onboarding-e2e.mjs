#!/usr/bin/env node
/**
 * Browser checks for first-run onboarding.
 * The server must already be running with FEATURE_FIRST_RUN_ONBOARDING=1
 * and E2E_ROLE_FIXTURE=1.
 *
 *   node scripts/first-run-onboarding-e2e.mjs http://127.0.0.1:8080
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const base = (process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
const outDir = process.env.FIRST_RUN_OUT || "/opt/cursor/artifacts";
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

async function dismissCookies(page) {
  const banner = page.locator("[data-ke=cookie-consent]");
  if (await banner.count()) {
    const button = banner.locator("[data-ke=cookie-essential]");
    if (await button.count()) await button.click({ timeout: 3000 }).catch(() => {});
  }
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-CA" });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await dismissCookies(page);
  const welcome = page.locator("[data-ke=first-run-welcome]");
  await welcome.waitFor({ state: "visible" });
  mark("first-visit", (await welcome.getAttribute("data-audience")) === "parent");
  await page.screenshot({ path: join(outDir, "first-run-parent-en-390.png") });
  await page.locator("[data-ke=first-run-skip]").click();
  await welcome.waitFor({ state: "hidden" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-ke=help-button]").waitFor({ state: "visible" });
  await page.waitForTimeout(800);
  mark("reload-hides", (await welcome.count()) === 0);

  await page.goto(`${base}/help`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-ke=help-guide-search]").waitFor({ state: "visible" });
  await page.locator("[data-ke=replay-welcome][data-tour-key=welcome\\:parent]").click();
  await welcome.waitFor({ state: "visible" });
  mark("replay", (await welcome.getAttribute("data-step")) === "1");
  await page.locator("[data-ke=first-run-skip]").click();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: join(outDir, "first-run-help-en-1280.png") });
  await context.close();

  const fr = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-CA" });
  const frPage = await fr.newPage();
  frPage.setDefaultTimeout(25000);
  await frPage.goto(`${base}/fr`, { waitUntil: "domcontentloaded" });
  await dismissCookies(frPage);
  const frWelcome = frPage.locator("[data-ke=first-run-welcome]");
  await frWelcome.waitFor({ state: "visible" });
  const frText = await frWelcome.innerText();
  mark("french", frText.includes("Trouvez") && (await frWelcome.getAttribute("data-locale")) === "fr", frText.slice(0, 80));
  await frPage.screenshot({ path: join(outDir, "first-run-parent-fr-390.png") });
  await frPage.setViewportSize({ width: 1280, height: 800 });
  await frPage.screenshot({ path: join(outDir, "first-run-parent-fr-1280.png") });
  await fr.close();

  const provider = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-CA" });
  const desk = await provider.newPage();
  desk.setDefaultTimeout(30000);
  const seeded = await provider.request.post(`${base}/api/e2e-seed`, {
    data: { role: "provider", resetOnboarding: true },
  });
  mark("seed", seeded.ok(), String(seeded.status()));
  await desk.goto(`${base}/provider?desk=today`, { waitUntil: "domcontentloaded" });
  await dismissCookies(desk);
  const providerWelcome = desk.locator("[data-ke=first-run-welcome]");
  await providerWelcome.waitFor({ state: "visible", timeout: 20000 });
  mark("provider-welcome", (await providerWelcome.getAttribute("data-audience")) === "provider");
  await desk.screenshot({ path: join(outDir, "first-run-provider-en-390.png") });
  await desk.locator("[data-ke=first-run-skip]").click();
  const coach = desk.locator("[data-ke=coach-tour]");
  if (await coach.isVisible().catch(() => false)) {
    await desk.locator("[data-ke=coach-skip]").click();
  } else {
    await coach.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
    if (await coach.count()) await desk.locator("[data-ke=coach-skip]").click();
  }
  const fees = desk.locator("[data-ke=provider-setup-step][data-step=fees]");
  await fees.waitFor({ state: "visible" });
  mark("fees-open", (await fees.getAttribute("data-done")) === "false");
  const marked = await provider.request.post(`${base}/api/e2e-seed`, {
    data: { role: "provider", markFee: true },
  });
  mark("mark-fee", marked.ok(), String(marked.status()));
  await desk.reload({ waitUntil: "domcontentloaded" });
  if (await providerWelcome.isVisible().catch(() => false)) await desk.locator("[data-ke=first-run-skip]").click();
  if (await coach.isVisible().catch(() => false)) await desk.locator("[data-ke=coach-skip]").click();
  await fees.waitFor({ state: "visible" });
  mark("fees-done", (await fees.getAttribute("data-done")) === "true");
  await desk.setViewportSize({ width: 1280, height: 800 });
  await desk.screenshot({ path: join(outDir, "first-run-provider-en-1280.png") });

  await desk.goto(`${base}/fr/provider?desk=today`, { waitUntil: "domcontentloaded" });
  const frDesk = desk.locator("[data-ke=first-run-welcome]");
  if (await frDesk.isVisible().catch(() => false)) await desk.locator("[data-ke=first-run-skip]").click();
  const frCoach = desk.locator("[data-ke=coach-tour]");
  if (await frCoach.count()) await desk.locator("[data-ke=coach-skip]").click().catch(() => {});
  const frList = desk.locator("[data-ke=provider-setup]");
  await frList.waitFor({ state: "visible" });
  const frListText = await frList.innerText();
  mark("provider-french", frListText.includes("prêt") || frListText.includes("tarifs"), frListText.slice(0, 80));
  await desk.setViewportSize({ width: 390, height: 844 });
  await desk.screenshot({ path: join(outDir, "first-run-provider-fr-390.png") });
  await provider.close();
} catch (err) {
  mark("crash", false, err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

const failed = steps.filter((step) => !step.ok);
console.log(JSON.stringify({ ok: failed.length === 0, steps }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
