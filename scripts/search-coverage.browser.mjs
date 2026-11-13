import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fromCrossJSON, fromJSON } from "seroval";
import { chromium } from "playwright";

// Read-only loopback QA. All coverage/total/error scenarios are simulated.
// Listing cards are copied unchanged from the local public catalogue response.
const base = new URL(process.argv[2] ?? "http://127.0.0.1:8100/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Loopback preview required");
const out = resolve(process.argv[3] ?? "artifacts/search-coverage");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const verdict = [];
let catalogue;
const evidence = (status) => ({ version: 1, status, totalKind: status === "complete" ? "exact" : status === "partial" ? "at-least" : "available",
  source: status === "unverified" ? "snapshot" : "primary", reasons: status === "partial" ? ["candidate-limit"] : status === "unverified" ? ["source-fallback"] : [], retryable: status === "unverified", observedAt: Date.now() });
function exportName(url) {
  try { return JSON.parse(Buffer.from(new URL(url).pathname.split("/").at(-1), "base64url").toString()).export; } catch { return ""; }
}
function dataFor(url) {
  try { return fromJSON(JSON.parse(new URL(url).searchParams.get("payload"))).data; } catch { return {}; }
}
function fixture(mode) {
  const zero = mode.endsWith("0");
  const capped = mode === "page-limit";
  const status = capped ? "partial" : mode.replace(/0$/, "");
  return { ...catalogue, fixtureScenario: mode, items: zero ? [] : catalogue.items, total: zero ? 0 : capped ? 5000 : catalogue.total,
    page: capped ? 40 : 1, hasMore: false, nextPage: null, pageLimitReached: capped, evidence: evidence(status) };
}
async function watermark(page, label) {
  await page.evaluate((label) => {
    let note = document.getElementById("coverage-test-only");
    if (!note) { note = document.createElement("div"); note.id = "coverage-test-only"; document.body.append(note); }
    note.textContent = `LOCAL TEST: ${label}. Coverage responses simulated; public catalogue cards unchanged.`;
    note.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#fff7cc;color:#24200b;padding:5px 12px;font:12px/1.3 sans-serif;pointer-events:none;border-top:1px solid #c9ad37";
  }, label);
}
async function shot(page, name, width) {
  await watermark(page, name);
  await page.screenshot({ path: `${out}/${name}-${width}.png`, animations: "disabled" });
}
async function settle(page, status) {
  await page.locator(`[data-ke="search-coverage"][data-coverage="${status}"]`).waitFor({ timeout: 45000 }).catch(async (error) => {
    console.log(JSON.stringify({ expected: status, page: page.url(), states: await page.locator('[data-ke="search-coverage"]').allTextContents(), count: await page.locator('[data-ke="search-count"]').allTextContents() }));
    await page.screenshot({ path: `${out}/failure-${Date.now()}.png` });
    throw error;
  });
  await page.waitForFunction(() => !document.querySelector('[data-ke="search-count"]')?.textContent.includes("Loading"));
}
async function retry(page) {
  const button = page.locator('[data-ke="search-coverage"] button:visible').first();
  if (await button.count()) await button.click();
  else await page.getByRole("button", { name: /^(Retry|Try again)$/ }).first().click();
}

try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", locale: "en-CA" });
    await context.addInitScript(() => {
      localStorage.setItem("kidease-theme", "light");
      localStorage.setItem("kidease-look", "clean");
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let mode = "partial";
    let mapMode = "partial0";
    let holdNext = false;
    let held;
    const requests = [];
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== base.origin) return route.abort();
      const name = exportName(url);
      if (!name.startsWith("searchDaycarePage_") && !name.startsWith("searchDaycareMap_")) return route.continue();
      const data = dataFor(url);
      const channel = name.startsWith("searchDaycarePage_") ? "page" : "map";
      if (process.env.SEARCH_COVERAGE_DEBUG) console.log(JSON.stringify({channel,mode,mapMode,refresh:data.refresh}));
      requests.push({ channel, refresh: data.refresh === true, live: data.live === true, page: data.page ?? 1 });
      if (!catalogue) {
        const response = await route.fetch({ headers: { ...request.headers(), accept: "application/json" } });
        const body = await response.json();
        const decoded = response.headers()["x-tss-serialized"] ? fromCrossJSON(body, {}) : body;
        catalogue = decoded.result;
        assert.ok(catalogue.items.length > 0, "Use actual public catalogue cards, not invented listings");
      }
      if (channel === "page" && holdNext) {
        holdNext = false;
        held = route;
        return;
      }
      const choice = channel === "map" ? mapMode : mode;
      if (choice === "error") return route.fulfill({ status: 503, contentType: "text/plain", body: "Simulated local retrieval failure" });
      const response = fixture(choice);
      const result = channel === "map" ? { pins: [], total: response.total, evidence: response.evidence } : response;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result }) });
    });
    async function load(next) {
      mode = next;
      await page.evaluate(() => sessionStorage.removeItem("kidease-search-cache")).catch(() => {});
      await page.goto(new URL("/search?q=Winnipeg", base).href, { waitUntil: "domcontentloaded", timeout: 120000 });
      await settle(page, next === "error" ? "error" : next.replace(/0$/, ""));
      if (next !== "error") await page.waitForFunction((scenario) => JSON.parse(sessionStorage.getItem("kidease-search-cache") || "null")?.response?.fixtureScenario === scenario, next);
    }
    await load("partial");
    assert.match(await page.locator('[data-ke="msv2-count"]:visible, [data-ke="search-count"]:visible').first().innerText(), /At least/);
    assert.ok(await page.locator('article[data-slug]').count() > 0);
    await shot(page, "partial", width);
    mode = "complete";
    const beforeRetry = requests.length;
    await retry(page);
    await page.waitForFunction(() => !document.querySelector('[data-ke="search-coverage"]') && !document.querySelector('[data-ke="search-count"]')?.textContent.includes("Loading"));
    assert.ok(requests.slice(beforeRetry).some((r) => r.channel === "page" && r.refresh));
    assert.doesNotMatch(await page.locator('[data-ke="msv2-count"]:visible, [data-ke="search-count"]:visible').first().innerText(), /At least|available to view/);
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("kidease-search-cache")).response.evidence.status), "complete");
    await shot(page, "retry-recovered", width);
    await load("unverified");
    assert.match(await page.locator('[data-ke="msv2-count"]:visible, [data-ke="search-count"]:visible').first().innerText(), /listings available to view/);
    assert.doesNotMatch(await page.locator('[data-ke="msv2-count"]:visible, [data-ke="search-count"]:visible').first().innerText(), /At least|matching/);
    await shot(page, "unverified", width);
    for (const scenario of ["partial0", "unverified0"]) {
      await load(scenario);
      const body = await page.locator('body').innerText();
      assert.match(body, /This search is incomplete/);
      assert.match(body, /There may still be centres in this area/);
      assert.equal(await page.locator('article[data-slug]').count(), 0);
      await shot(page, scenario, width);
    }
    await load("error");
    assert.match(await page.locator('[data-ke="search-coverage"]').innerText(), /could not be refreshed/);
    await shot(page, "error", width);
    mode = "unverified";
    // Existing network protection briefly opens after four 503 attempts.
    await page.waitForTimeout(3500);
    await retry(page);
    await settle(page, "unverified");
    assert.ok(await page.locator('article[data-slug]').count() > 0, "A failed read can recover");

    // Active map Retry must refresh both channels, not just the visible pins.
    await page.locator('[data-ke="explore-map-toggle"]:visible, [data-ke="msv2-map-toggle"]:visible').first().click();
    await page.locator('[data-ke="search-map-count"]:visible').first().waitFor();
    assert.match(await page.locator('[data-ke="search-map-count"]:visible').first().innerText(), /0 mapped · At least 0/);
    mapMode = "unverified0";
    const mapRetryStart = requests.length;
    await retry(page);
    await settle(page, "unverified");
    await page.waitForFunction(() => [...document.querySelectorAll('[data-ke="search-map-count"]')].some((n) => n.textContent.includes("available to view")));
    for (const channel of ["page", "map"]) assert.ok(requests.slice(mapRetryStart).some((r) => r.channel === channel && r.refresh), `Retry refreshes ${channel}`);
    await shot(page, "map-unverified", width);
    await page.locator('[data-ke="explore-map-toggle"]:visible, [data-ke="msv2-map-toggle"]:visible').first().click();

    // A held retry from before a filter/back cycle must not overwrite the
    // newer zero-result response or its session metadata when it settles.
    await load("partial0");
    holdNext = true;
    await retry(page);
    await page.waitForFunction(() => document.querySelector('[data-ke="search-count"]')?.textContent.includes("Loading"));
    for (let i = 0; !held && i < 50; i++) await page.waitForTimeout(100);
    assert.ok(held, "Hold the original Retry response");
    mode = "unverified0";
    const liveLink = page.locator('[data-ke="live-on-kidease"]:visible').first();
    if (await liveLink.count()) await liveLink.click();
    else {
      await page.locator('[data-ke="msv2-filters"]:visible').click();
      await page.locator('#search-filters').getByRole("button", { name: "Claim verified", exact: true }).click();
    }
    await page.waitForURL((url) => url.searchParams.has("live"));
    await settle(page, "unverified");
    const closeFilters = page.locator('#search-filters').getByRole("button", { name: "Close", exact: true });
    if (await closeFilters.count()) await closeFilters.click();
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => !url.searchParams.has("live"));
    await settle(page, "unverified");
    const old = held;
    held = null;
    await old.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: fixture("partial") }) }).catch(() => {});
    await page.waitForTimeout(500);
    assert.equal(await page.locator('article[data-slug]').count(), 0, "Obsolete Retry cannot restore old cards after back");
    assert.equal(await page.locator('[data-ke="search-coverage"]').getAttribute("data-coverage"), "unverified");
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("kidease-search-cache")).response.evidence.status), "unverified");
    await shot(page, "stale-retry-ignored", width);
    mode = "page-limit";
    await page.evaluate(() => sessionStorage.removeItem("kidease-search-cache"));
    await page.goto(new URL("/search?q=Winnipeg&page=40", base).href, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.locator('[data-ke="search-page-limit"]:visible').first().waitFor();
    assert.match(await page.locator('[data-ke="search-page-limit"]:visible').first().innerText(), /last page/);
    const nextLinks = await page.locator('a[href*="page="]').evaluateAll((links) => links.map((link) => new URL(link.href).searchParams.get("page")));
    assert.ok(nextLinks.every((value) => Number(value) < 40), "Terminal page offers no self-next or page 41");
    await page.locator('[data-ke="search-page-limit"]:visible').first().scrollIntoViewIfNeeded();
    await shot(page, "page-limit", width);
    mode = "unverified0";
    await page.evaluate(() => sessionStorage.removeItem("kidease-search-cache"));
    await page.goto(new URL("/fr/search?q=Winnipeg", base).href, { waitUntil: "domcontentloaded", timeout: 120000 });
    await settle(page, "unverified");
    await page.getByText("La recherche est incomplète", { exact: true }).filter({ visible: true }).first().waitFor();
    assert.match(await page.locator('[data-ke="msv2-count"]:visible, [data-ke="search-count"]:visible').first().innerText(), /fiches consultables/);
    await shot(page, "unverified0-fr", width);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, "Coverage controls fit the viewport");
    verdict.push({ width, simulatedCoverage: true, unchangedPublicCatalogCards: catalogue.items.length, partial: true, unverified: true,
      partialZero: true, unverifiedZero: true, failureRecovery: true, freshPageAndActiveMap: true, staleRetryAfterFilterAndBackIgnored: true, terminalPage: true, frenchEmptyCopy: true, mobileSearchV2: await page.locator('[data-ke="msv2-results"]').count() > 0, overflow, pageErrors: errors });
    console.log(JSON.stringify(verdict.at(-1)));
    await context.close();
  }
  await writeFile(`${out}/verdict.json`, JSON.stringify(verdict, null, 2));
} finally { await browser.close(); }
