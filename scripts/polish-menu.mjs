#!/usr/bin/env node
/** Reproducible guest-drawer keyboard checks against an HTTP loopback server. */
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { localAuditUrl } from "./polish-coverage.mjs";

const args = {
  base: "http://127.0.0.1:8083",
  phase: "before",
  out: "artifacts/performance-polish/before-menu",
  chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  revision: "",
  cases: "all",
};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, "");
  if (!key || !(key in args) || !process.argv[i + 1])
    throw new Error(`Unsupported argument: ${process.argv[i]}`);
  args[key] = process.argv[i + 1];
}
args.base = localAuditUrl(args.base);
args.out = resolve(args.out);
const outputRelative = relative(process.cwd(), args.out);
if (!outputRelative || outputRelative.startsWith("..") || isAbsolute(outputRelative))
  throw new Error("Output must be inside this checkout.");
if (!/^[a-z0-9-]+$/.test(args.phase)) throw new Error("Use a simple phase name.");
if (args.revision && !/^[a-f0-9]{40}$/.test(args.revision))
  throw new Error("Revision must be a full verified source SHA.");
mkdirSync(args.out, { recursive: true });
let commit = "unavailable";
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  /* provenance remains unavailable */
}
const report = {
  schemaVersion: 1,
  phase: args.phase,
  commit: args.revision || commit,
  harnessCommit: commit,
  caseSelection: args.cases,
  startedAt: new Date().toISOString(),
  methodology: {
    server: args.base,
    browser: "Headless system Chrome",
    device: "simulated viewport, not a physical device",
    input: "Guest menu open, keyboard and scroll only; no product form submissions",
    network: "All external HTTP requests and /api/health blocked",
    scope: "Guest drawer only; no authenticated menu certification",
    openingRetries:
      "Up to three deliberate opening activations after a one-second settle. The eight keyboard/scroll checks require the drawer to be open; first-activation success is recorded separately in openAttempts and is not certified by a passed keyboard case.",
    sourceProvenance: args.revision
      ? "Served revision supplied from the independently verified local build."
      : "Harness checkout revision; verify that it matches the served build.",
  },
  results: [],
};
const reportPath = resolve(args.out, `${args.phase}-menu.json`);
const save = () => writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
save();

function drawerState() {
  const panel = document.querySelector("#ke-nav-drawer");
  if (!panel) return null;
  const name = (element) => ({
    tag: element.tagName.toLowerCase(),
    name: (element.getAttribute("aria-label") || element.textContent || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 100),
    href: element.getAttribute("href")?.split("?")[0] || null,
  });
  const visible = (element) => {
    const style = getComputedStyle(element);
    if (
      !element.getClientRects().length ||
      style.visibility === "hidden" ||
      style.display === "none" ||
      element.closest("[inert],[hidden]") ||
      element.matches(":disabled") ||
      element.tabIndex < 0
    )
      return false;
    for (
      let parent = element.parentElement;
      parent && parent !== panel;
      parent = parent.parentElement
    ) {
      if (
        parent.matches("details:not([open])") &&
        !(element.tagName === "SUMMARY" && element.parentElement === parent)
      )
        return false;
    }
    return true;
  };
  const candidates = [
    ...panel.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex]"),
  ];
  const controls = candidates.filter(visible);
  controls.forEach((element, index) =>
    element.setAttribute("data-polish-tab-index", String(index)),
  );
  const last = controls[controls.length - 1];
  const rect = panel.getBoundingClientRect();
  const lastRect = last?.getBoundingClientRect();
  const footer = panel.querySelector(":scope > :last-child");
  const footerRect = footer?.getBoundingClientRect();
  return {
    appearance: {
      look: document.documentElement.dataset.look || "classic",
      theme: document.documentElement.dataset.resolvedTheme,
      textScale: document.documentElement.dataset.textScale || "md",
    },
    active: document.activeElement ? name(document.activeElement) : null,
    activeIndex: document.activeElement?.getAttribute("data-polish-tab-index"),
    panel: {
      top: rect.top,
      bottom: rect.bottom,
      clientHeight: panel.clientHeight,
      scrollHeight: panel.scrollHeight,
      scrollTop: panel.scrollTop,
      overflowY: getComputedStyle(panel).overflowY,
    },
    footer: footerRect
      ? { top: footerRect.top, bottom: footerRect.bottom, height: footerRect.height }
      : null,
    lastControl: last
      ? {
          ...name(last),
          top: lastRect.top,
          bottom: lastRect.bottom,
          initiallyInViewport: lastRect.top >= 0 && lastRect.bottom <= innerHeight + 1,
        }
      : null,
    controls: controls.map((element, index) => ({ index, ...name(element) })),
    visibleSummaryIndexes: controls.flatMap((element, index) =>
      element.tagName === "SUMMARY" ? [String(index)] : [],
    ),
    excludedCollapsedDescendants: candidates
      .filter((element) => !visible(element) && element.closest("details:not([open])"))
      .map(name),
  };
}

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: args.chrome,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  for (const locale of ["en", "fr"])
    for (const height of [800, 320])
      for (const look of ["classic", "clean"])
        for (const theme of ["light", "dark"]) {
          const id = `${locale}-1280x${height}-${look}-${theme}${height === 320 ? "-large-text" : ""}`;
          if (args.cases !== "all" && !args.cases.split(",").includes(id)) continue;
          const row = {
            id,
            locale,
            viewport: { width: 1280, height },
            look,
            theme,
            textScale: height === 320 ? "xl" : "md",
            status: "running",
            checks: {},
            blockedRequests: [],
            errors: [],
          };
          report.results.push(row);
          const context = await browser.newContext({
            viewport: row.viewport,
            colorScheme: theme,
            reducedMotion: "reduce",
            serviceWorkers: "block",
          });
          try {
            await context.route("**/*", async (route) => {
              const url = new URL(route.request().url());
              if (["blob:", "data:"].includes(url.protocol)) return route.continue();
              if (
                url.origin !== args.base ||
                /^\/api\/health\/?$/.test(decodeURIComponent(url.pathname))
              ) {
                row.blockedRequests.push({
                  kind: url.origin === args.base ? "forbidden-health" : "external",
                  origin: url.origin,
                  path: url.origin === args.base ? url.pathname : undefined,
                });
                return route.abort("blockedbyclient");
              }
              return route.continue();
            });
            await context.routeWebSocket("**/*", (socket) => {
              row.blockedRequests.push({ kind: "websocket", origin: new URL(socket.url()).origin });
              socket.close();
            });
            await context.addInitScript(
              ({ theme: selectedTheme, textScale }) => {
                localStorage.setItem("kidease-theme", selectedTheme);
                localStorage.setItem("kidease-text-scale", textScale);
              },
              { theme, textScale: row.textScale },
            );
            const page = await context.newPage();
            page.on("pageerror", (error) => row.errors.push(error.message));
            const response = await page.goto(
              `${args.base}${locale === "fr" ? "/fr" : "/"}?look=${look}`,
              { waitUntil: "domcontentloaded", timeout: 45000 },
            );
            row.httpStatus = response?.status() || 0;
            await page.waitForTimeout(1000);
            const opener = page.locator('header button[aria-controls="ke-nav-drawer"]');
            if (!(await opener.isVisible()))
              throw new Error("Guest website menu opener unavailable; menu was not audited.");
            await opener.focus();
            row.opener = await opener.evaluate((element) => ({
              name: element.getAttribute("aria-label"),
              width: element.getBoundingClientRect().width,
              height: element.getBoundingClientRect().height,
            }));
            const panel = page.locator("#ke-nav-drawer");
            row.openAttempts = [];
            for (let attempt = 0; attempt < 3; attempt += 1) {
              await opener.click();
              const opened = await panel
                .waitFor({ state: "visible", timeout: 2500 })
                .then(() => true)
                .catch(() => false);
              row.openAttempts.push({ attempt: attempt + 1, opened });
              if (opened) break;
            }
            await panel.waitFor({ state: "visible", timeout: 1000 });
            await page.waitForTimeout(100);
            row.initial = await page.evaluate(drawerState);
            row.screenshot = `${args.phase}-menu-${id}.png`;
            await page.screenshot({
              path: resolve(args.out, row.screenshot),
              fullPage: false,
              animations: "disabled",
            });
            const close = panel.getByRole("button", { name: /^(close|fermer)$/i });
            await close.focus();
            await page.keyboard.press("Shift+Tab");
            const shifted = await page.evaluate(drawerState);
            row.shiftTabFromClose = shifted.active;
            row.checks.shiftTabFromCloseWrapsToLast =
              shifted.activeIndex === String(row.initial.controls.length - 1);
            await panel.locator('[data-polish-tab-index="0"]').focus();
            await page.keyboard.press("Shift+Tab");
            row.checks.reverseTabWraps =
              (await page.evaluate(drawerState)).activeIndex ===
              String(row.initial.controls.length - 1);
            await panel
              .locator(`[data-polish-tab-index="${row.initial.controls.length - 1}"]`)
              .focus();
            await page.keyboard.press("Tab");
            row.checks.forwardTabWraps = (await page.evaluate(drawerState)).activeIndex === "0";
            await panel.locator('[data-polish-tab-index="0"]').focus();
            row.tabOrder = [];
            for (let index = 0; index < row.initial.controls.length + 2; index += 1) {
              const state = await page.evaluate(drawerState);
              row.tabOrder.push({ index: state.activeIndex, active: state.active });
              await page.keyboard.press("Tab");
            }
            row.checks.tabRemainsInDrawer = row.tabOrder.every((item) => item.index !== null);
            row.checks.summariesReachable = row.initial.visibleSummaryIndexes.every((index) =>
              row.tabOrder.some((item) => item.index === index),
            );
            row.checks.collapsedDescendantsExcluded = row.tabOrder.every(
              (item) =>
                !row.initial.excludedCollapsedDescendants.some(
                  (hidden) =>
                    hidden.tag === item.active.tag &&
                    hidden.name === item.active.name &&
                    hidden.href === item.active.href,
                ),
            );
            await page.evaluate(() => {
              const panelElement = document.querySelector("#ke-nav-drawer");
              for (const element of [panelElement, ...panelElement.querySelectorAll("*")]) {
                if (["auto", "scroll"].includes(getComputedStyle(element).overflowY))
                  element.scrollTop = element.scrollHeight;
              }
            });
            row.scrolled = await page.evaluate(drawerState);
            row.checks.lastControlReachableByScrolling =
              row.scrolled.lastControl?.initiallyInViewport === true;
            if (height === 320) {
              row.bottomScreenshot = `${args.phase}-menu-${id}-bottom.png`;
              await page.screenshot({
                path: resolve(args.out, row.bottomScreenshot),
                fullPage: false,
                animations: "disabled",
              });
            }
            await page.keyboard.press("Escape");
            await panel.waitFor({ state: "detached", timeout: 5000 });
            row.checks.escapeRestoresOpener = await opener.evaluate(
              (element) => document.activeElement === element,
            );
            row.status =
              row.httpStatus < 400 &&
              Object.values(row.checks).every(Boolean) &&
              row.errors.length === 0
                ? "passed"
                : "failed";
          } catch (error) {
            row.status = "error";
            row.reason = String(error.message || error).slice(0, 500);
          } finally {
            await context.close();
            save();
          }
          console.log(`${args.phase}: menu ${id}: ${row.status}`);
        }
} catch (error) {
  report.error = String(error.message || error).slice(0, 500);
  process.exitCode = 1;
} finally {
  await browser?.close();
  report.finishedAt = new Date().toISOString();
  save();
}
if (report.results.length === 0) {
  report.error ||= "No matching menu cases were executed.";
  save();
  process.exitCode = 1;
}
if (report.results.some((row) => row.status !== "passed")) process.exitCode = 1;
console.log(
  JSON.stringify(
    {
      report: reportPath,
      counts: report.results.reduce(
        (counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }),
        {},
      ),
    },
    null,
    2,
  ),
);
