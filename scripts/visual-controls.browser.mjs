/** Ordinary synthetic visual regression. Never starts an application or map service. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildVisualControlsFixture } from "./fixtures/visual-controls.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const phase = process.env.VISUAL_CAPTURE_PHASE || "after";
assert(["before", "after"].includes(phase), "VISUAL_CAPTURE_PHASE must be before or after");
const out = join(root, "artifacts/visual-controls", phase);
await mkdir(out, { recursive: true });
const fixture = await buildVisualControlsFixture(root, out, phase);
const verdict = {
  phase,
  ok: false,
  evidenceKind: phase === "before" ? "expected RED geometry" : "44px regression acceptance",
  scope: fixture.provenance.kind,
  provenance: fixture.provenance,
  cases: [],
};
let browser;
try {
  const chrome =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(chrome) ? { executablePath: chrome } : {}),
    args: ["--disable-background-networking"],
  });
  for (const locale of ["en", "fr"])
    for (const look of ["clean", "classic"])
      for (const width of [390, 1280]) {
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          deviceScaleFactor: 1,
          colorScheme: "light",
          serviceWorkers: "block",
          locale: locale === "fr" ? "fr-CA" : "en-CA",
        });
        const requests = [];
        let webSockets = 0;
        const errors = [];
        await context.route("**/*", (route) => {
          requests.push({ method: route.request().method() });
          return route.abort("blockedbyclient");
        });
        await context.routeWebSocket("**/*", (socket) => {
          webSockets++;
          socket.close();
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.name));
        page.setDefaultTimeout(15000);
        const row = { locale, look, width, ok: false };
        verdict.cases.push(row);
        try {
          await page.setContent(
            `<!doctype html><html lang="${locale}" data-channel="website" data-look="${look}" data-resolved-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.css}</style></head><body><div id="root"></div></body></html>`,
          );
          await page.evaluate(() => {
            window.__visualControls = { radii: [], layers: [], locates: 0, zooms: [] };
          });
          await page.addScriptTag({ content: fixture.script });
          await page.locator('[data-radius="quiet"] select').waitFor();
          await page.evaluate(() => document.fonts.ready);
          const geometry = await page.evaluate(() => {
            const rect = (element) => {
              const box = element.getBoundingClientRect();
              return {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                right: box.right,
                bottom: box.bottom,
              };
            };
            const controls = [...document.querySelectorAll("select,.ke-map-controls button")].map(
              (element) => {
                const box = rect(element);
                const points = [
                  [box.x + box.width / 2, box.y + box.height / 2],
                  [box.x + 5, box.y + box.height / 2],
                  [box.right - 5, box.y + box.height / 2],
                ];
                return {
                  kind:
                    element.tagName === "SELECT"
                      ? element.closest("[data-radius]").dataset.radius
                      : element.textContent.trim() || element.getAttribute("aria-label"),
                  ...box,
                  hit: points.every(
                    ([x, y]) =>
                      document.elementFromPoint(x, y)?.closest("button,select") === element,
                  ),
                };
              },
            );
            return {
              controls,
              map: rect(document.querySelector("[data-map-host]")),
              stack: rect(document.querySelector(".ke-map-controls")),
              badge: rect(document.querySelector("[data-map-host] .pointer-events-none")),
              scrollWidth: document.documentElement.scrollWidth,
              fontStatus: document.fonts.status,
              bodyFamily: getComputedStyle(document.body).fontFamily,
            };
          });
          row.geometry = geometry;
          assert.equal(geometry.scrollWidth, width, "No horizontal page overflow");
          assert(
            geometry.controls.every((control) => control.hit),
            "All controls receive their inset/centre hits",
          );
          assert(
            geometry.stack.x >= geometry.map.x &&
              geometry.stack.right <= geometry.map.right &&
              geometry.stack.y >= geometry.map.y &&
              geometry.stack.bottom <= geometry.map.bottom,
            "Full map control stack fits in the 280px host",
          );
          const intersects = (a, b) =>
            Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
          assert(
            !intersects(geometry.badge, geometry.stack),
            "Radius badge does not cover the control stack",
          );
          for (let i = 0; i < geometry.controls.length; i++)
            for (let j = i + 1; j < geometry.controls.length; j++)
              assert(
                !intersects(geometry.controls[i], geometry.controls[j]),
                "Independent controls do not overlap",
              );
          const mapLayers = geometry.controls.filter((control) =>
            [fixture.packs[locale].mapRoad, fixture.packs[locale].mapSat].includes(control.kind),
          );
          assert.equal(mapLayers.length, 2);
          if (phase === "before") {
            assert(
              mapLayers.every((control) => control.height < 44),
              "Record the existing short map-layer controls",
            );
            if (look === "clean")
              assert(
                geometry.controls.find((control) => control.kind === "quiet").height < 44,
                "Record the existing short clean quiet radius select",
              );
          } else
            assert(
              geometry.controls.every((control) => control.width >= 44 && control.height >= 44),
              "Every recorded control is at least 44 by44 CSS pixels",
            );
          const radius = page.locator('[data-radius="quiet"] select');
          await radius.focus();
          assert(await radius.evaluate((element) => document.activeElement === element));
          await radius.selectOption("50");
          const satellite = page.getByRole("button", {
            name: fixture.packs[locale].mapSat,
            exact: true,
          });
          await satellite.focus();
          await page.keyboard.press("Space");
          await page
            .getByRole("button", { name: fixture.packs[locale].mapRoad, exact: true })
            .click();
          await page
            .getByRole("button", { name: fixture.packs[locale].useLocation, exact: true })
            .click();
          await page.getByRole("button", { name: "Zoom in", exact: true }).click();
          await page.getByRole("button", { name: "Zoom out", exact: true }).click();
          row.callbacks = await page.evaluate(() => window.__visualControls);
          assert.deepEqual(row.callbacks, {
            radii: [50],
            layers: ["satellite", "roadmap"],
            locates: 1,
            zooms: [1, -1],
          });
          assert.deepEqual(errors, []);
          assert.deepEqual(requests, []);
          assert.equal(webSockets, 0);
          row.browserRequests = requests.length;
          row.webSockets = webSockets;
          row.pageErrors = errors;
          const screenshot = await page.screenshot({
            path: join(out, `controls-${locale}-${look}-${width}.png`),
            fullPage: true,
            animations: "disabled",
          });
          row.screenshotSha256 = createHash("sha256").update(screenshot).digest("hex");
          row.ok = true;
        } finally {
          await context.close();
        }
      }
  verdict.ok = true;
} finally {
  await browser?.close();
  await writeFile(join(out, "verdict.json"), JSON.stringify(verdict, null, 2) + "\n");
}
console.log(
  JSON.stringify({ ok: verdict.ok, phase, cases: verdict.cases.length, scope: verdict.scope }),
);
