import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "playwright";
import { renderParentHomeFixture } from "./fixtures/parent-home.mjs";

// Actual home and care content, synthetic data and router/attention/plan slots.
// This preview never uses credentials, app APIs, database access or external assets.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "artifacts/desk-stage-order");
const staticRoot = join(root, ".vercel/output/static");
const assets = await readdir(join(staticRoot, "assets"));
const stylesheet = assets.find((name) => /^styles-.*\.css$/.test(name));
assert.ok(stylesheet, "Build the app before running this preview.");
const css = await readFile(join(staticRoot, "assets", stylesheet));
const fonts = new Map(
  await Promise.all(
    ["plus-jakarta-sans-latin.woff2", "plus-jakarta-sans-latin-ext.woff2"].map(async (name) => [
      name,
      await readFile(join(root, "public/fonts", name)),
    ]),
  ),
);
await mkdir(output, { recursive: true });
function html(options) {
  return `<!doctype html><html lang="${options.locale}" data-look="classic" data-theme="light" data-resolved-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Synthetic parent home preview</title><link rel="stylesheet" href="/fixture.css"><style>.fixture-label{padding:1rem;border-bottom:1px solid var(--color-border);font-size:.85rem}.fixture-shell{max-width:72rem;margin:auto;padding:.75rem}.fixture-content{min-width:0}@media(min-width:48rem){.fixture-content{margin-left:12rem}}</style></head><body><div class="fixture-label">Synthetic local preview · actual ParentHome + care content · ${options.locale.toUpperCase()} · ${options.stage} · care ${options.careState}${options.childCount === 2 ? " · two children + long notes" : ""}</div><div class="fixture-shell ke-dense"><main class="fixture-content">${renderParentHomeFixture(options)}</main></div></body></html>`;
}
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/fixture.css") {
    response.writeHead(200, { "content-type": "text/css" }).end(css);
  } else if (url.pathname.startsWith("/fonts/") && fonts.has(url.pathname.slice(7))) {
    response.writeHead(200, { "content-type": "font/woff2" }).end(fonts.get(url.pathname.slice(7)));
  } else if (url.pathname === "/") {
    const locale = url.searchParams.get("locale") === "fr" ? "fr" : "en";
    const stage = url.searchParams.get("stage") === "searching" ? "searching" : "enrolled";
    const careState = ["ready", "loading", "error"].includes(url.searchParams.get("careState"))
      ? url.searchParams.get("careState")
      : "ready";
    const childCount = url.searchParams.get("childCount") === "2" ? 2 : 1;
    const longNote = url.searchParams.get("longNote") === "true";
    response
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(html({ locale, stage, careState, childCount, longNote }));
  } else response.writeHead(404).end();
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let browser;
const metrics = {
  synthetic: true,
  stylesheet,
  externalRequests: [],
  captures: [],
  careTransitions: [],
  limitations:
    "Actual home/care/Button markup with synthetic data and router, attention, matches, area and plan slots. Simplified shell; no authentication, hydration, actual network latency, production data, or real form actions validated.",
};
try {
  browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--disable-background-networking"],
  });
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === baseUrl) return route.continue();
    metrics.externalRequests.push(requestUrl.origin + requestUrl.pathname);
    return route.abort();
  });
  for (const locale of ["en", "fr"]) {
    for (const width of [390, 1280]) {
      for (const [stage, careState, childCount, longNote] of [
        ["enrolled", "ready", 1, false],
        ["searching", "ready", 1, false],
        ["enrolled", "loading", 1, false],
        ["enrolled", "error", 1, false],
        ["enrolled", "ready", 2, true],
        ["enrolled", "loading", 2, true],
      ]) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 844 });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(
          `${baseUrl}/?${new URLSearchParams({ locale, stage, careState, childCount, longNote })}`,
          { waitUntil: "load" },
        );
        await page.evaluate(() => document.fonts.ready);
        const layout = await page.evaluate(() => {
          const controls = [...document.querySelectorAll("main a,main button,main input")].map(
            (node) => {
              const box = node.getBoundingClientRect();
              return {
                label: node.textContent.trim() || node.getAttribute("aria-label") || node.name,
                width: box.width,
                height: box.height,
              };
            },
          );
          return {
            overflow:
              document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth,
            controls,
            smallControls: controls.filter(
              (control) => control.width < 43.5 || control.height < 43.5,
            ),
            headingOrder: [...document.querySelectorAll("main h1, main h2, main h3, main h4")].map(
              (node) => ({ level: node.tagName, text: node.textContent.trim() }),
            ),
            sectionOrder: [
              ...document.querySelectorAll(
                "[data-ke='parent-home'] > [data-ke], [data-ke='parent-home'] > div > [data-ke]",
              ),
            ].map((node) => node.getAttribute("data-ke")),
          };
        });
        assert.equal(layout.viewportWidth, width, "Capture viewport must match its label");
        const focus = [];
        const controls = page.locator("main a,main button,main input");
        for (let index = 0; index < (await controls.count()); index++) {
          await controls.nth(index).focus();
          focus.push(
            await controls.nth(index).evaluate((node) => {
              const style = getComputedStyle(node);
              return {
                label: node.textContent.trim() || node.name,
                visible:
                  (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
                  style.boxShadow !== "none",
                outline: style.outline,
                boxShadow: style.boxShadow,
              };
            }),
          );
        }
        await page.evaluate(() => {
          document.activeElement.blur();
          window.scrollTo(0, 0);
        });
        const screenshot = `${locale}-${stage}-${careState}${childCount === 2 ? "-two-long" : ""}-${width}.png`;
        await page.screenshot({ path: join(output, screenshot), fullPage: true });
        metrics.captures.push({
          locale,
          stage,
          careState,
          childCount,
          longNote,
          width,
          screenshot,
          ...layout,
          focus,
          pageErrors: errors,
        });
        if (stage === "enrolled" && careState === "loading") {
          await page.evaluate(() => {
            window.fixtureShifts = [];
            window.fixtureObserver = new PerformanceObserver((list) => {
              for (const entry of list.getEntries())
                if (!entry.hadRecentInput)
                  window.fixtureShifts.push({
                    value: entry.value,
                    sources: (entry.sources || []).map((source) => ({
                      node: source.node?.getAttribute("data-ke") || source.node?.tagName,
                      previous: source.previousRect.toJSON(),
                      current: source.currentRect.toJSON(),
                    })),
                  });
            });
            window.fixtureObserver.observe({ type: "layout-shift", buffered: false });
          });
          await page.waitForTimeout(600);
          const ready = renderParentHomeFixture({
            locale,
            stage,
            careState: "ready",
            childCount,
            longNote,
          });
          await page.evaluate((markup) => {
            const documentWithReady = new DOMParser().parseFromString(markup, "text/html");
            document
              .querySelector('[data-ke="parent-home-care"]')
              .replaceWith(documentWithReady.querySelector('[data-ke="parent-home-care"]'));
          }, ready);
          await page.waitForTimeout(250);
          metrics.careTransitions.push({
            locale,
            width,
            childCount,
            longNote,
            ...(await page.evaluate(() => ({
              cls: window.fixtureShifts.reduce((sum, entry) => sum + entry.value, 0),
              shifts: window.fixtureShifts,
            }))),
          });
        }
        await page.close();
      }
    }
  }
  await context.close();
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
await writeFile(join(output, "metrics.json"), JSON.stringify(metrics, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      captures: metrics.captures.length,
      overflow: metrics.captures.filter((item) => item.overflow).map((item) => item.screenshot),
      smallControls: metrics.captures
        .filter((item) => item.smallControls.length)
        .map((item) => ({ screenshot: item.screenshot, controls: item.smallControls })),
      focusFailures: metrics.captures
        .filter((item) => item.focus.some((control) => !control.visible))
        .map((item) => ({
          screenshot: item.screenshot,
          controls: item.focus.filter((control) => !control.visible),
        })),
      careTransitions: metrics.careTransitions.map(
        ({ locale, width, childCount, longNote, cls }) => ({
          locale,
          width,
          childCount,
          longNote,
          cls,
        }),
      ),
      pageErrors: metrics.captures.flatMap((item) => item.pageErrors),
      blockedExternalRequests: metrics.externalRequests.length,
      output,
    },
    null,
    2,
  ),
);
