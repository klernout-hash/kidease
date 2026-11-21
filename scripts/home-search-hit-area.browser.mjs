import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { chromium } from "playwright";
import { buildHomeSearchFixture } from "./fixtures/home-search-hit-area.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const phase = process.env.VISUAL_CAPTURE_PHASE || "after";
assert.ok(["before", "after"].includes(phase));
const out = join(root, "artifacts/home-search-hit-area", phase);

async function segmentGeometry(input) {
  return input.evaluate((element) => {
    const pill = element.closest('form[data-search-row]').querySelector(":scope > div");
    let segment = element;
    while (segment.parentElement !== pill) {
      segment = segment.parentElement;
      if (!segment) throw Error("Actual compound segment missing");
    }
    const box = segment.getBoundingClientRect();
    const field = element.getBoundingClientRect();
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`).getBoundingClientRect();
    // Stay clear of the rounded lower/right corners in both stacked and wide rows.
    const points = [{ x: box.left + 2, y: box.top + box.height / 2 }, { x: box.left + box.width / 2, y: box.top + 2 }];
    const inside = (point, rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    const rect = (item) => ({ x: item.x, y: item.y, width: item.width, height: item.height, right: item.right, bottom: item.bottom });
    return { width: box.width, height: box.height, inputHeight: field.height, segment: rect(box), input: rect(field), label: rect(label), row: rect(pill.getBoundingClientRect()), points: points.map((point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return { ...point, outsideField: !inside(point, field) && !inside(point, label), hitsSegment: Boolean(hit && segment.contains(hit)), noninteractiveBackground: Boolean(hit && !hit.closest('input,select,textarea,label,a,button,[role="button"],[role="combobox"]')) };
    }) };
  });
}

test("actual home compound fields preserve padding focus and local interactions", { timeout: 180_000 }, async () => {
  await mkdir(out, { recursive: true });
  const report = { phase, evidenceKind: phase === "before" ? "expected Name-padding gap" : "compound-field regression acceptance", ok: false, cases: [] };
  let browser;
  try {
    const fixture = await buildHomeSearchFixture(root, out);
    report.provenance = fixture.provenance;
    const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === "darwin" && existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);
    browser = await chromium.launch({ headless: true, ...(executable ? { executablePath: executable } : {}), args: ["--disable-background-networking"] });
    for (const locale of ["en", "fr"]) for (const look of ["clean", "classic"]) for (const width of [390, 1280]) {
      const result = { locale, look, width, ok: false, browserRequests: [], webSockets: 0, pageErrors: [] };
      report.cases.push(result);
      const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block", colorScheme: "light", locale: locale === "fr" ? "fr-CA" : "en-CA" });
      await context.route("**/*", (route) => { result.browserRequests.push(route.request().url()); return route.abort("blockedbyclient"); });
      await context.routeWebSocket("**/*", (socket) => { result.webSockets++; socket.close(); });
      const page = await context.newPage();
      page.on("pageerror", (error) => result.pageErrors.push(error.message));
      const copy = fixture.copy[locale];
      try {
        await page.setContent(`<!doctype html><html lang="${locale}" data-look="${look}" data-resolved-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fixture.css}</style></head><body><main style="max-width:960px;margin:auto;padding:14px"><p>Synthetic actual home search; no route, catalogue or provider.</p><div id="root"></div></main></body></html>`);
        await page.evaluate((locale) => {
          window.__homeHit = { locale, lookups: [], navigations: [], ages: [], radii: [], resolved: [], submits: [], transports: [] };
          const deny = (kind) => () => { window.__homeHit.transports.push(kind); throw Error("No transport in home focus fixture: " + kind); };
          window.fetch = deny("fetch");
          XMLHttpRequest.prototype.open = deny("xhr");
          navigator.sendBeacon = deny("beacon");
          window.open = deny("window.open");
          for (const name of ["WebSocket", "EventSource", "WebTransport", "Worker", "SharedWorker"]) if (name in window) window[name] = class { constructor() { deny(name)(); } };
        }, locale);
        await page.addScriptTag({ content: fixture.script });
        const reset = page.locator("[data-fixture-reset]");
        const name = page.getByRole("combobox", { name: copy.searchDaycare, exact: true });
        const where = page.getByRole("combobox", { name: copy.searchWhere, exact: true });
        await name.waitFor();
        await page.evaluate(() => document.fonts.ready);
        const blank = await segmentGeometry(name);
        assert.ok(blank.width >= 44 && blank.height >= 44);
        assert.ok(blank.points.every((point) => point.outsideField && point.hitsSegment && point.noninteractiveBackground));
        result.nameGeometry = blank;
        result.paddingFocus = [];
        for (const point of blank.points) {
          await reset.click();
          await page.mouse.click(point.x, point.y);
          const focused = await name.evaluate((element) => document.activeElement === element);
          result.paddingFocus.push(focused);
          assert.equal(focused, phase === "after", "Actual Name padding forwards focus only after the production fix");
        }
        // Both phases capture this same initial interaction, before any other form work.
        result.paddingScreenshot = `home-search-${locale}-${look}-${width}.png`;
        const screenshot = join(out, result.paddingScreenshot);
        await page.screenshot({ path: screenshot, fullPage: true });
        result.paddingScreenshotSha256 = createHash("sha256").update(await readFile(screenshot)).digest("hex");
        const expectedEarlySubmits = phase === "after" ? 1 : 0;
        if (phase === "after") {
          assert.ok(await name.evaluate((element) => document.activeElement === element));
          assert.ok(await page.getByRole("button", { name: copy.infant, exact: true }).isVisible(), "Actual child-age panel is active during submit acceptance");
          const submit = page.getByRole("button", { name: copy.findChildcare, exact: true });
          result.activeNameSubmit = await submit.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const points = [{ x: box.left + box.width / 2, y: box.top + box.height / 2 }, { x: box.left + 4, y: box.top + box.height / 2 }];
            return { x: box.x, y: box.y, width: box.width, height: box.height, points: points.map((point) => {
              const hit = document.elementFromPoint(point.x, point.y);
              return { ...point, hitsSubmit: Boolean(hit && element.contains(hit)), actualTag: hit?.tagName ?? null };
            }) };
          });
          assert.ok(result.activeNameSubmit.points.every((point) => point.hitsSubmit), "Search must receive center and inset hits while Name/age panel is active");
          const beforeSubmit = await page.evaluate(() => window.__homeHit.submits.length);
          assert.equal(beforeSubmit, 0);
          await page.mouse.click(result.activeNameSubmit.points[0].x, result.activeNameSubmit.points[0].y);
          assert.deepEqual(await page.evaluate(() => window.__homeHit.submits.slice(0)), [{ where: "", name: "", radius: 25 }], "Active Name Search activation submits exactly once without a reset");
          result.activeNameSubmit.submissionsAdded = 1;
        }
        await reset.click();
        const whereBox = await segmentGeometry(where);
        assert.ok(whereBox.points[0].outsideField && whereBox.points[0].hitsSegment && whereBox.points[0].noninteractiveBackground);
        await page.mouse.click(whereBox.points[0].x, whereBox.points[0].y);
        assert.ok(await where.evaluate((element) => document.activeElement === element), "Actual existing Where forwarding remains intact");
        await reset.click();
        await page.getByText(copy.searchDaycare, { exact: true }).click();
        assert.ok(await name.evaluate((element) => document.activeElement === element), "Native explicit label focuses actual Name input");
        await name.click();
        assert.ok(await name.evaluate((element) => document.activeElement === element));

        // Native Tab traversal stays in DOM order, including the dynamically shown chips.
        await reset.click();
        const sequence = [where, page.getByRole("combobox", { name: copy.searchRadius, exact: true }), page.getByRole("button", { name: new RegExp(copy.searchWhen) }), name,
          page.getByRole("button", { name: copy.infant, exact: true }), page.getByRole("button", { name: copy.toddler, exact: true }), page.getByRole("button", { name: copy.findChildcare, exact: true })];
        result.tabOrder = [];
        for (const control of sequence) {
          await page.keyboard.press("Tab");
          assert.ok(await control.evaluate((element) => document.activeElement === element), "Native in-bar Tab order");
          result.tabOrder.push(await control.evaluate((element) => element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.textContent));
        }
        await reset.click();
        await name.click();
        const chip = page.getByRole("button", { name: copy.infant, exact: true });
        await chip.click();
        assert.ok(await chip.evaluate((element) => document.activeElement === element), "Name padding handler must not steal chip focus");
        assert.deepEqual(await page.evaluate(() => window.__homeHit.ages), ["infant"]);
        assert.equal(await page.evaluate(() => window.__homeHit.submits.length), expectedEarlySubmits, "Chip interaction adds no submission");

        await reset.click();
        await name.fill("Synthetic");
        const suggestion = page.getByRole("link", { name: /Synthetic Maple/ });
        await suggestion.waitFor();
        // Typing is already focused. A real blank-padding click blurs then refocuses it.
        const populated = await segmentGeometry(name);
        assert.ok(populated.points[0].outsideField && populated.points[0].hitsSegment && populated.points[0].noninteractiveBackground, "Populated refocus point is real blank segment padding");
        await page.mouse.click(populated.points[0].x, populated.points[0].y);
        await page.waitForTimeout(160);
        const refocused = await name.evaluate((element) => document.activeElement === element);
        const keptOpen = await suggestion.isVisible();
        result.populatedPadding = { refocused, keptOpen, waitedMs: 160, geometry: populated };
        assert.equal(refocused, phase === "after");
        assert.equal(keptOpen, phase === "after", "A stale 120ms blur callback must not close a refocused actual field");
        // Move focus outside without invoking the fixture reset or changing the query.
        await reset.focus();
        await page.waitForTimeout(160);
        const outsideActive = await name.evaluate((element) => document.activeElement === element);
        const outsideOpen = await suggestion.isVisible();
        result.outsideBlur = { inputActive: outsideActive, suggestionsVisible: outsideOpen, waitedMs: 160, retainedValue: await name.inputValue() };
        assert.equal(outsideActive, false);
        assert.equal(outsideOpen, false, "The actual blur timer still closes after focus leaves the input");
        assert.equal(await name.inputValue(), "Synthetic", "Outside focus must not reset the typed query");
        await name.focus();
        await suggestion.waitFor();
        await suggestion.focus();
        await page.keyboard.press("Enter");
        assert.equal(await name.inputValue(), "Synthetic Maple");
        assert.equal(await page.evaluate(() => window.__homeHit.navigations.length), 1);
        assert.equal(await suggestion.isVisible(), false, "Actual result activation closes suggestions immediately");
        await reset.click();
        await name.fill("Pointer");
        await suggestion.waitFor();
        await suggestion.click();
        assert.equal(await name.inputValue(), "Synthetic Maple");
        assert.equal(await page.evaluate(() => window.__homeHit.navigations.length), 2);
        assert.equal(await suggestion.isVisible(), false, "Actual pointer result activation keeps mousedown/click behavior");
        result.suggestionActivation = { keyboard: true, pointer: true, syntheticNavigations: 2 };
        await reset.click();
        await where.fill("Synthetic place");
        const beforeFinalSubmit = await page.evaluate(() => window.__homeHit.submits.length);
        assert.equal(beforeFinalSubmit, expectedEarlySubmits, "Focus, lookup and selection interactions add no submission");
        await page.getByRole("button", { name: copy.findChildcare, exact: true }).click();
        assert.deepEqual(await page.evaluate((start) => window.__homeHit.submits.slice(start), beforeFinalSubmit), [{ where: "Synthetic place", name: "", radius: 25 }], "The later ordinary Search activation also submits exactly once");
        assert.equal(await page.evaluate(() => window.__homeHit.submits.length), expectedEarlySubmits + 1);
        result.callbacks = await page.evaluate(() => ({ lookups: window.__homeHit.lookups, navigations: window.__homeHit.navigations, ages: window.__homeHit.ages, submits: window.__homeHit.submits, transports: window.__homeHit.transports }));
        assert.deepEqual(result.callbacks.transports, []);
        assert.deepEqual(result.browserRequests, []);
        assert.equal(result.webSockets, 0);
        assert.deepEqual(result.pageErrors, []);
        result.scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.equal(result.scrollWidth, width);
        result.ok = true;
      } catch (error) {
        result.failure = error instanceof Error ? error.stack : String(error);
        await page.screenshot({ path: join(out, `failure-${locale}-${look}-${width}.png`), fullPage: true }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
    report.ok = true;
  } catch (error) {
    report.failure = error instanceof Error ? error.stack : String(error);
    throw error;
  } finally {
    await browser?.close();
    await writeFile(join(out, "verdict.json"), JSON.stringify(report, null, 2) + "\n");
  }
});
