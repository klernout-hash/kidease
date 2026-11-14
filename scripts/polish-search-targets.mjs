#!/usr/bin/env node
/** Measure the seven repaired native search targets after healthy content settles. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { waitForPolishReadiness } from "./polish-readiness.mjs";
import { localAuditUrl } from "./polish-coverage.mjs";

const base = localAuditUrl(process.argv[2]);
const revision = process.argv[3];
const out = resolve(process.argv[4]);
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Supply a verified full served SHA");
if (!out.startsWith(`${process.cwd()}/artifacts/`)) throw new Error("Write proof under artifacts/");
const report = {
  revision,
  base,
  methodology: "Loopback-only Chromium; healthy stable content required. Geometry after resize; no clicks or forms.",
  cases: [],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const locale of ["en", "fr"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 842 },
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await context.routeWebSocket("**", (socket) => socket.close());
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      let path = url.pathname;
      try { path = decodeURIComponent(path).replace(/\/+/g, "/").replace(/\/+$/, ""); } catch { /* original path remains */ }
      return url.origin !== base || path === "/api/health"
        ? route.abort("blockedbyclient")
        : route.continue();
    });
    await context.addInitScript(() => {
      localStorage.setItem("kidease-analytics-consent", "denied");
      localStorage.setItem("kidease-text-scale", "md");
      localStorage.setItem("kidease-theme", "light");
    });
    const page = await context.newPage();
    await page.goto(`${base}${locale === "fr" ? "/fr/search" : "/search"}?look=classic`, {
      waitUntil: "domcontentloaded",
    });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width < 768 ? 842 : 960 });
      const readiness = await waitForPolishReadiness(page, {
        pageId: "search",
        timeoutMs: 25000,
        stableMs: 500,
      });
      const targets = await page.evaluate(() => {
        const selectors = {
          needCareFast: 'a.mt-1[href*="need-care-fast"]',
          changeLocation: 'a.inline-flex.shrink-0.max-w-full.text-left[href*="change"]',
          searchPill: '[data-ke="search-pill"]',
          searchSubmit: '[data-ke="search-submit"]',
          filters: '[data-ke="explore-filters-toggle"]',
          map: '[data-ke="explore-map-toggle"]',
        };
        const result = [];
        const record = (name, element) => {
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          result.push({
            name,
            text: element.textContent.trim(),
            width: rect.width,
            height: rect.height,
            passes44: rect.width >= 43.99 && rect.height >= 43.99,
          });
        };
        for (const [name, selector] of Object.entries(selectors))
          for (const element of document.querySelectorAll(selector)) record(name, element);
        for (const element of document.querySelectorAll("summary"))
          if (/Area waitlist|Liste d’attente du quartier/.test(element.textContent))
            record("areaWaitlist", element);
        return result;
      });
      report.cases.push({
        locale,
        width,
        readiness,
        targets,
        complete: targets.length === 7 && readiness.ready && readiness.healthy && targets.every((target) => target.passes44),
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ cases: report.cases.length, passed: report.cases.filter((row) => row.complete).length, out }));
process.exitCode = report.cases.length !== 8 || report.cases.some((row) => !row.complete) ? 1 : 0;
