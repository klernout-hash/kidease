#!/usr/bin/env node
/** Focused loopback-only geometry proof for shared control touch floors. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { localAuditUrl } from "./polish-coverage.mjs";

const args = { base: "", revision: "", phase: "", out: "" };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, "");
  if (!(key in args) || !process.argv[i + 1]) throw new Error("Unsupported argument");
  args[key] = process.argv[i + 1];
}
args.base = localAuditUrl(args.base);
if (!/^[a-f0-9]{40}$/.test(args.revision) || !/^[a-z0-9-]+$/.test(args.phase))
  throw new Error("Supply the verified full source SHA and a phase label");
if (process.env.POLISH_FIXTURE_DATABASE !== "local-pglite")
  throw new Error("Verify disposable PGLite, then set POLISH_FIXTURE_DATABASE=local-pglite");
const out = resolve(args.out);
if (!out.startsWith(`${process.cwd()}/artifacts/`)) throw new Error("Write proof under artifacts/");
const report = {
  configuration: args,
  methodology: "Chromium loopback fixture; DOM text-scale and viewport resize, not physical device or browser UI zoom. No product forms or consent choices submitted.",
  cases: [],
};
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  for (const surface of ["home", "parent"]) {
    for (const locale of ["en", "fr"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 842 },
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      await context.routeWebSocket("**", (socket) => socket.close());
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        let path = url.pathname;
        try { path = decodeURIComponent(path).replace(/\/+/g, "/").replace(/\/+$/, ""); } catch { /* block origin below */ }
        if (url.origin !== args.base || path === "/api/health") return route.abort("blockedbyclient");
        return route.continue();
      });
      await context.addInitScript(() => {
        localStorage.setItem("kidease-analytics-consent", "denied");
        localStorage.setItem("kidease-theme", "light");
      });
      if (surface === "parent") {
        const response = await context.request.post(`${args.base}/api/e2e-seed`, {
          maxRedirects: 0,
          data: { role: "parent", paid: false, activity: true, attention: true },
          headers: { origin: args.base, "content-type": "application/json" },
        });
        if (!response.ok()) throw new Error(`Local fixture returned ${response.status()}`);
        const cookie = response.headersArray().find((header) =>
          header.name.toLowerCase() === "set-cookie" && header.value.split(";")[0].includes("session_token="),
        );
        if (cookie) {
          const pair = cookie.value.split(";")[0];
          await context.addCookies([{
            name: "kidease.e2e_session",
            value: decodeURIComponent(pair.slice(pair.indexOf("=") + 1)),
            url: args.base,
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
          }]);
        }
      }
      const page = await context.newPage();
      const path = surface === "home" ? "/" : "/parent";
      const localized = locale === "fr" ? `/fr${path === "/" ? "" : path}` : path;
      const response = await page.goto(`${args.base}${localized}?look=classic`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      const ready = surface === "home" ? '[data-ke="home-claim-strip"]' : '[data-ke="parent-home-search"]';
      await page.locator(ready).first().waitFor({ state: "attached", timeout: 20000 });
      await page.waitForTimeout(750);
      await page.waitForFunction(() => {
        window.dispatchEvent(new Event("kidease:open-cookie-settings"));
        return Boolean(document.querySelector('[data-ke="cookie-consent"]'));
      }, null, { timeout: 15000 });
      await page.locator(".ke-help-bot > button").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
      for (const textScale of ["md", "xl"]) {
        await page.evaluate((scale) => {
          document.documentElement.style.setProperty("--ke-text-scale", scale === "xl" ? "1.25" : "1");
          document.documentElement.dataset.textScale = scale;
        }, textScale);
        for (const viewport of [
          { width: 320, height: 842 },
          { width: 390, height: 842 },
          { width: 768, height: 320 },
          { width: 1280, height: 320 },
          { width: 160, height: 370 },
          { width: 195, height: 421 },
        ]) {
          await page.setViewportSize(viewport);
          await page.waitForTimeout(100);
          const measured = await page.evaluate(() => {
            const selectors = {
              heroClaim: '[data-ke="home-claim-strip"] a',
              parentInput: '[data-ke="parent-home-search"] input',
              parentSearch: '[data-ke="parent-home-search"] button',
              cookieEssential: '[data-ke="cookie-essential"]',
              cookieAllow: '[data-ke="cookie-allow"]',
              cookiePolicies: '[data-ke="cookie-consent"] a',
            };
            const controls = [];
            for (const [name, selector] of Object.entries(selectors)) {
              for (const element of document.querySelectorAll(selector)) {
                const rect = element.getBoundingClientRect();
                if (!rect.width || !rect.height || getComputedStyle(element).visibility === "hidden") continue;
                controls.push({ name, text: element.textContent?.trim() || element.getAttribute("name"), width: rect.width, height: rect.height, passes44: rect.width >= 43.99 && rect.height >= 43.99 });
              }
            }
            // Exercise a caller's undersized rem classes on an isolated clone
            // of the rendered shared Button, without invoking its handler.
            const sourceButton = document.querySelector('[data-ke="cookie-essential"]');
            if (sourceButton) {
              const probe = sourceButton.cloneNode(false);
              probe.removeAttribute("data-ke");
              probe.setAttribute("aria-hidden", "true");
              probe.tabIndex = -1;
              probe.className = probe.className.split(/\s+/).filter((name) => !/^min-[hw]-/.test(name)).concat("min-h-11", "min-w-11").join(" ");
              probe.style.cssText = "position:fixed;left:-10000px;top:0;width:0;height:0;padding:0;border:0";
              document.body.append(probe);
              const rect = probe.getBoundingClientRect();
              controls.push({ name: "sharedButtonCallerOverride", text: "Isolated rendered Button clone with min-h-11/min-w-11", width: rect.width, height: rect.height, passes44: rect.width >= 43.99 && rect.height >= 43.99 });
              probe.remove();
            }
            const panel = document.querySelector(".ke-cookie-consent-panel");
            const rect = panel?.getBoundingClientRect();
            const allow = document.querySelector('[data-ke="cookie-allow"]')?.getBoundingClientRect();
            const help = document.querySelector(".ke-help-bot > button")?.getBoundingClientRect();
            const tabBar = document.querySelector('[data-ke="app-tab-bar"]')?.getBoundingClientRect();
            const overlaps = (a, b) => Boolean(a?.width && b?.width && Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top));
            const rectangle = (value) => value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null;
            return {
              rootFontSize: getComputedStyle(document.documentElement).fontSize,
              overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
              controls,
              helpAvailable: Boolean(help?.width),
              helpFitsViewport: Boolean(help?.width && help.top >= 0 && help.bottom <= innerHeight + 1),
              cookieHelpOverlap: overlaps(allow, help),
              cookieTabOverlap: overlaps(rect, tabBar),
              cookieAllowRect: rectangle(allow),
              helpRect: rectangle(help),
              tabBarRect: rectangle(tabBar),
              channel: document.documentElement.dataset.channel,
              helpClear: document.documentElement.style.getPropertyValue("--ke-help-clear"),
              cookiePanel: rect ? { top: rect.top, bottom: rect.bottom, height: rect.height, scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight, overflowY: getComputedStyle(panel).overflowY, fitsViewport: rect.top >= 0 && rect.bottom <= innerHeight + 1 } : null,
            };
          });
          const reachability = await page.locator('[data-ke="cookie-consent"] a, [data-ke="cookie-consent"] button').evaluateAll((elements) => {
            const panel = document.querySelector(".ke-cookie-consent-panel");
            const savedScroll = panel?.scrollTop ?? 0;
            const rows = elements.map((element) => {
              element.scrollIntoView({ block: "nearest", inline: "nearest" });
              const rect = element.getBoundingClientRect();
              const port = panel?.getBoundingClientRect();
              return { text: element.textContent.trim(), fullyVisibleInPanel: Boolean(port && rect.top >= port.top - 1 && rect.bottom <= port.bottom + 1) };
            });
            if (panel) panel.scrollTop = savedScroll;
            return rows;
          });
          report.cases.push({ surface, locale, ...viewport, textScale, status: response?.status(), finalPath: new URL(page.url()).pathname, ...measured, reachability });
        }
      }
      await context.close();
    }
  }
} catch (error) {
  report.error = String(error.message || error);
  throw error;
} finally {
  await browser.close();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}
const failures = report.cases.flatMap((row) => row.controls.filter((control) => !control.passes44));
console.log(JSON.stringify({ cases: report.cases.length, under44: failures.length, overflowCases: report.cases.filter((row) => row.overflow).length, panelOutsideViewport: report.cases.filter((row) => !row.cookiePanel?.fitsViewport).length, cookieHelpOverlap: report.cases.filter((row) => row.cookieHelpOverlap).length, cookieTabOverlap: report.cases.filter((row) => row.cookieTabOverlap).length, unavailableHelp: report.cases.filter((row) => !row.helpAvailable).length, helpOutsideViewport: report.cases.filter((row) => !row.helpFitsViewport).length, unreachableControls: report.cases.flatMap((row) => row.reachability.filter((control) => !control.fullyVisibleInPanel)).length, out }));
process.exitCode = failures.length || report.cases.some((row) => row.overflow || !row.cookiePanel?.fitsViewport || row.cookieHelpOverlap || row.cookieTabOverlap || !row.helpAvailable || !row.helpFitsViewport || row.reachability.some((control) => !control.fullyVisibleInPanel)) ? 1 : 0;
