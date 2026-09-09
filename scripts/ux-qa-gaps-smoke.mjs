/**
 * Playwright smokes for UX-QA gaps: chat-off home, /pay hub, FR routes.
 * Skip without BASE_URL / E2E_BASE_URL (same as e2e-smoke).
 *
 *   BASE_URL=http://127.0.0.1:8081 node scripts/ux-qa-gaps-smoke.mjs
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { parseE2eArgs, skipReason, targetOrigin } from "./e2e-smoke-lib.mjs";

const args = parseE2eArgs(process.argv.slice(2), process.env);
const skip = skipReason(args);
if (skip) {
  console.log(`skip ux-qa-gaps-smoke: ${skip}`);
  process.exit(0);
}

const origin = targetOrigin(args);
const browser = await chromium.launch({ headless: true });
const errors = [];

async function check(path, fn) {
  const page = await browser.newPage();
  try {
    const res = await page.goto(new URL(path, origin).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const status = res?.status() ?? 0;
    await fn(page, status);
  } catch (err) {
    errors.push(`${path}: ${err instanceof Error ? err.message : err}`);
  } finally {
    await page.close();
  }
}

await check("/", async (page, status) => {
  assert.equal(status, 200, `home HTTP ${status}`);
  await page.waitForTimeout(2800);
  const live = await page.locator(".ke-help-bot").count();
  const ask = await page.getByPlaceholder(/ask a question/i).count();
  assert.equal(live, 0, "Live Chat bubble must stay hidden when FEATURE_INAPP_CHAT is off");
  assert.equal(ask, 0, "Ask-a-question composer must not mount when chat is off");
});

await check("/pay", async (page, status) => {
  assert.equal(status, 200, `/pay HTTP ${status}`);
  const title = await page.locator("h1, p.font-display").first().textContent();
  assert.match(String(title || ""), /pay a centre bill|payer une facture/i);
});

for (const [path, expectH1] of [
  ["/fr/get-app", /télécharger l’appli/i],
  ["/fr/benefits", /aide pour payer/i],
  ["/fr/login", /connexion/i],
]) {
  await check(path, async (page, status) => {
    assert.equal(status, 200, `${path} HTTP ${status}`);
    const h1 = await page.locator("h1").first().textContent();
    assert.match(String(h1 || ""), expectH1, `${path} H1`);
    const lang = await page.locator("html").getAttribute("lang");
    assert.match(String(lang || ""), /fr/i, `${path} lang`);
  });
}

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("ux-qa-gaps-smoke ok");
