#!/usr/bin/env node
/** Local proof of native Menu fallback, separate from hydration/startup timing. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { localAuditUrl } from "./polish-coverage.mjs";

const args = process.argv.slice(2);
const option = (name, fallback = "") => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? fallback : args[index + 1];
};
const base = new URL(localAuditUrl(option("base", "http://127.0.0.1:8092")));
const out = resolve(option("out", "../evidence/iteration-3/menu-fallback"));
const sourceSha = option("source-sha");
assert.match(sourceSha, /^[a-f0-9]{40}$/, "Pass the exact built --source-sha.");
assert.ok(out.startsWith(resolve(process.cwd(), "..") + "/"), "Evidence must remain in the task workspace.");
const report = {
  sourceSha, server: base.origin, startedAt: new Date().toISOString(),
  method: "Guest synthetic local pages at1280x800. Native fallback has JavaScript disabled and tests navigation independently from recorded CSS readiness/geometry; settled drawer checks wait for stylesheet readiness and the local React onClick marker. No startup, React hydration-speed or INP claim.",
  cases: [],
};
mkdirSync(out, { recursive: true });
const save = () => writeFileSync(resolve(out, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
const chrome = option("chrome");
const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
try {
  for (const locale of ["en", "fr"]) {
    const home = locale === "fr" ? "/fr" : "/";
    const destination = locale === "fr" ? "/fr/menu" : "/menu";
    for (const mode of ["native-no-js", "hydrated-drawer"]) {
      for (const activation of ["click", "Enter"]) {
        const row = { locale, mode, activation, passed: false };
        report.cases.push(row);
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: mode !== "native-no-js" });
        await context.route("**/*", (route) => {
          const url = new URL(route.request().url());
          return url.origin !== base.origin || url.pathname === "/api/health" ? route.abort() : route.continue();
        });
        try {
          const page = await context.newPage();
          row.requestFailures = [];
          page.on("requestfailed", (request) => row.requestFailures.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
          const response = await page.goto(new URL(home, base).href, { waitUntil: "domcontentloaded" });
          row.homeStatus = response?.status();
          assert.equal(row.homeStatus, 200);
          const trigger = page.locator('header [aria-controls="ke-nav-drawer"]');
          assert.equal(await trigger.evaluate((element) => element.tagName), "A");
          assert.equal(await trigger.getAttribute("href"), destination);
          row.triggerAtDcl = await trigger.boundingBox();
          row.stylesAtDcl = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => ({ path: new URL(link.href).pathname, origin: new URL(link.href).origin, loaded: Boolean(link.sheet), media: link.media, disabled: link.disabled })));
          if (mode === "hydrated-drawer") {
            await page.waitForFunction(() => {
              const sheets = [...document.querySelectorAll('link[rel="stylesheet"]')];
              return sheets.length > 0 && sheets.every((link) => Boolean(link.sheet));
            });
            const box = await trigger.boundingBox();
            row.styledTrigger = box;
            assert.ok(box && box.width >= 44 && box.height >= 44);
            await page.waitForFunction(() => {
              const element = document.querySelector('header [aria-controls="ke-nav-drawer"]');
              const key = element && Object.keys(element).find((name) => name.startsWith("__reactProps$"));
              return Boolean(key && typeof element[key]?.onClick === "function");
            });
          }
          await trigger.focus();
          const activate = () => activation === "click" ? trigger.click() : trigger.press("Enter");
          if (mode === "native-no-js") {
            const [navigation] = await Promise.all([
              page.waitForNavigation({ waitUntil: "domcontentloaded" }), activate(),
            ]);
            row.menuStatus = navigation?.status();
            assert.equal(row.menuStatus, 200);
            assert.equal(new URL(page.url()).pathname, destination);
            const main = page.locator('main[data-ke="app-menu"]');
            await main.waitFor({ state: "visible" });
            row.visibleNavigationLinks = await main.locator("a[href]").evaluateAll((links) => links.filter((link) => link.getClientRects().length > 0).length);
            assert.ok(row.visibleNavigationLinks > 1, "Native destination must contain real navigation.");
            row.destination = destination;
          } else {
            await activate();
            const drawer = page.locator("#ke-nav-drawer");
            await drawer.waitFor({ state: "visible" });
            assert.equal(await trigger.getAttribute("aria-expanded"), "true");
            row.focusMovedIntoDrawer = await drawer.evaluate((element) => element.contains(document.activeElement));
            assert.equal(row.focusMovedIntoDrawer, true);
            assert.equal(new URL(page.url()).pathname, home);
            await page.keyboard.press("Escape");
            await drawer.waitFor({ state: "detached" });
            row.focusRestored = await trigger.evaluate((element) => element === document.activeElement);
            assert.equal(row.focusRestored, true);
            assert.equal(await trigger.getAttribute("aria-expanded"), "false");
            assert.equal(new URL(page.url()).pathname, home);
          }
          row.passed = true;
        } catch (error) {
          row.error = String(error?.message ?? error).slice(0, 1000);
        } finally {
          await context.close();
          save();
        }
      }
    }
  }
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(JSON.stringify({ passed: report.cases.filter((row) => row.passed).length, total: report.cases.length, browserClosed: true, report: resolve(out, "summary.json") }));
if (report.cases.some((row) => !row.passed)) process.exitCode = 1;
