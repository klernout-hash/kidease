import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fromCrossJSON } from "seroval";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = new URL(process.argv[2] ?? "http://127.0.0.1:8100/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
const out = resolve(process.argv[3] ?? "artifacts/search-loader-budget");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  let hold = false, held, catalogue;
  let pageCalls = 0;
  await page.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base.origin) return route.abort();
    let name = "";
    try { name = JSON.parse(Buffer.from(url.pathname.split("/").at(-1), "base64url").toString()).export; } catch { /* public asset */ }
    if (!name.startsWith("searchDaycarePage_")) return route.continue();
    pageCalls++;
    if (!catalogue) {
      const response = await route.fetch({ headers: { ...request.headers(), accept: "application/json" } });
      const body = await response.json();
      catalogue = (response.headers()["x-tss-serialized"] ? fromCrossJSON(body, {}) : body).result;
    }
    if (hold) { hold = false; held = route; return; }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: catalogue }) });
  });
  await page.goto(new URL("/search?q=Winnipeg", base).href, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("kidease-search-cache") || "null")?.response?.items?.length > 0);
  hold = true;
  const pending = page.evaluate(async () => {
    const mod = await import("/src/routes/search.tsx");
    const start = performance.now();
    const result = await mod.searchLoader({ location: { search: { q: "Winnipeg" } }, abortController: new AbortController() });
    return { ready: result.itemsReady, elapsed: performance.now() - start };
  });
  const loader = await pending;
  assert.equal(loader.ready, false);
  assert.ok(held, "The loader HTTP read was held beyond its paint budget");
  const before = pageCalls;
  await page.evaluate(() => {
    window.__budgetFreshDone = false;
    window.__budgetFresh = import("/src/lib/server/daycares.ts").then((mod) => mod.searchDaycarePage({ data: {
      lat: 49.8951, lng: -97.1384, label: "Winnipeg, MB", q: "Winnipeg", radiusKm: 25, sort: "distance", ageGroup: "any", refresh: true,
    } })).then(() => { window.__budgetFreshDone = true; });
  });
  await page.waitForTimeout(300);
  const blocked = !(await page.evaluate(() => window.__budgetFreshDone));
  if (process.env.EXPECT_LOADER_QUEUE_BLOCK === "1") {
    assert.equal(blocked, true, "Reproduce: the abandoned loader still owns the queue");
  } else {
    await page.waitForFunction(() => window.__budgetFreshDone, undefined, { timeout: 1500 });
    assert.ok(pageCalls > before, "Fresh read reached the network before the held loader was released");
  }
  await held.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: catalogue }) }).catch(() => {});
  await page.evaluate(() => window.__budgetFresh);
  const verdict = { simulatedNetworkHold: true, publicCatalogueCardsUnchanged: true, loaderReady: loader.ready, elapsedMs: Math.round(loader.elapsed), freshReadBlockedAfterPaint: blocked,
    expected: process.env.EXPECT_LOADER_QUEUE_BLOCK === "1" ? "reproduced before fix" : "cancelled HTTP read releases queue" };
  await writeFile(`${out}/verdict.json`, JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict));
} finally { await browser.close(); }
