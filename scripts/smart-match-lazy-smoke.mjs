#!/usr/bin/env node
/** Local-only UI proof. Never completes the quiz or saves/submits search results. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { localAuditUrl } from "./polish-coverage.mjs";

const base = new URL(localAuditUrl(process.argv[2] || "http://127.0.0.1:8081"));
const out = process.argv[3] ? resolve(process.argv[3]) : null;
if (out) {
  const inside = relative(process.cwd(), out);
  if (!inside || inside.startsWith("..") || isAbsolute(inside))
    throw new Error("Screenshot output must be a directory inside this checkout.");
  mkdirSync(out, { recursive: true });
}

async function localReadOnlyRequest(route) {
  const url = new URL(route.request().url());
  if (
    (url.origin !== base.origin && ["http:", "https:"].includes(url.protocol)) ||
    (url.origin === base.origin &&
      (/^\/(?:api\/health|(?:fr\/)?status)(?:\/|$)/.test(url.pathname) ||
        !["GET", "HEAD"].includes(route.request().method())))
  ) {
    await route.abort();
    return false;
  }
  return true;
}

async function openHome(page, locale, look = "classic", theme = "light") {
  await page.addInitScript((value) => localStorage.setItem("kidease-theme", value), theme);
  const url = new URL(locale === "fr" ? "/fr" : "/", base);
  url.searchParams.set("look", look);
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  const entry = page.locator('[data-ke="smart-match-open"]:visible').first();
  await entry.waitFor({ state: "visible" });
  const handle = await entry.elementHandle();
  await page.waitForFunction(
    (element) => {
      const key = Object.keys(element).find((name) => name.startsWith("__reactProps$"));
      return Boolean(key && typeof element[key]?.onClick === "function");
    },
    handle,
    { timeout: 30000 },
  );
  const readiness = await entry.evaluate((element) => {
    const key = Object.keys(element).find((name) => name.startsWith("__reactProps$"));
    return {
      onClickAttached: Boolean(key && typeof element[key]?.onClick === "function"),
      atMs: performance.now(),
    };
  });
  return { entry, readiness };
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const rows = [];
const surfaces = [];
let activeCase = null;
try {
  for (const locale of ["en", "fr"]) {
    for (const width of [390, 1280]) {
      activeCase = { phase: "behavior", locale, width };
      const scriptRequests = [];
      const page = await browser.newPage({
        viewport: { width, height: width === 390 ? 844 : 900 },
      });
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.origin === base.origin && /\.(?:m?js|tsx?)(?:$|\?)/.test(url.pathname))
          scriptRequests.push(url.pathname);
      });
      let releaseChunk;
      const chunkGate = new Promise((resolveGate) => {
        releaseChunk = resolveGate;
      });
      let chunkRequests = 0;
      const chunkUrl =
        /\/(?:assets\/smart-match-chat-[^/]+\.js|src\/components\/smart-match-chat\.tsx)(?:\?|$)/;
      await page.route("**/*", async (route) => {
        if (!(await localReadOnlyRequest(route))) return;
        if (chunkUrl.test(new URL(route.request().url()).pathname)) {
          chunkRequests += 1;
          await chunkGate;
        }
        return route.continue();
      });
      try {
        const { entry, readiness } = await openHome(page, locale);
        assert.equal(chunkRequests, 0, `${locale}: chat must not download before the CTA opens`);
        const initialOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
        const firstChunk = page.waitForRequest((request) =>
          chunkUrl.test(new URL(request.url()).pathname),
        );
        await entry.click();
        const chunkRequest = await firstChunk;
        const dialog = page.locator('[data-ke="smart-match-chat"]');
        await dialog.waitFor({ state: "visible" });
        await page.waitForFunction(
          () => document.activeElement?.getAttribute("data-ke") === "smart-match-chat",
        );
        await page.waitForFunction(() => getComputedStyle(document.body).overflow === "hidden");
        assert.equal(
          await dialog.locator('[role="status"]').count(),
          1,
          `${locale}: loading body stays inside the immediate dialog`,
        );
        assert.equal(chunkRequests, 1, `${locale}: opening requests the chat chunk once`);
        const close = dialog.locator("button[aria-label]").first();
        await page.keyboard.press("Shift+Tab");
        assert.equal(
          await dialog.evaluate((element) => element.contains(document.activeElement)),
          true,
          `${locale}: initial Shift+Tab stays inside the pending dialog`,
        );
        await page.keyboard.press("Tab");
        assert.equal(
          await close.evaluate((element) => element === document.activeElement),
          true,
          `${locale}: the pending close button wraps forward`,
        );
        const pendingBox = await dialog.boundingBox();
        assert.ok(pendingBox);
        if (out)
          await page.screenshot({
            path: resolve(out, `smart-match-${locale}-${width}-classic-light-pending.png`),
          });
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
        await page.waitForFunction((element) => element === document.activeElement, await entry.elementHandle(), { timeout: 3000 });
        assert.equal(
          await page.evaluate(() => getComputedStyle(document.body).overflow),
          initialOverflow,
          `${locale}: pending close restores scroll`,
        );
        assert.equal(
          await entry.evaluate((element) => element === document.activeElement),
          true,
          `${locale}: pending Escape restores the opener`,
        );
        releaseChunk();
        await entry.click();
        const reply = dialog.locator("#smart-match-reply");
        await reply.waitFor({ state: "visible" });
        const readyBox = await dialog.boundingBox();
        assert.ok(readyBox);
        const chunkResponse = await chunkRequest.response();
        assert.ok(chunkResponse?.ok(), "The requested chat chunk was delivered successfully");
        const chunkBody = await chunkResponse.body();
        const chatChunk = {
          path: new URL(chunkRequest.url()).pathname,
          bodyBytes: chunkBody.length,
          gzipBytes: gzipSync(chunkBody).length,
        };
        const restart = dialog.getByRole("button", {
          name: locale === "fr" ? "Recommencer" : "Start over",
          exact: true,
        });
        await close.focus();
        await page.keyboard.press("Shift+Tab");
        assert.equal(
          await restart.evaluate((element) => element === document.activeElement),
          true,
          `${locale}: initial Shift+Tab reaches the last ready control`,
        );
        await page.keyboard.press("Tab");
        assert.equal(
          await close.evaluate((element) => element === document.activeElement),
          true,
          `${locale}: the ready dialog wraps forward`,
        );
        await page.keyboard.press("Shift+Tab");
        assert.equal(
          await restart.evaluate((element) => element === document.activeElement),
          true,
          `${locale}: the ready dialog wraps backward`,
        );
        const smallTargets = await dialog
          .locator("button:not(:disabled), input:not(:disabled), a[href]")
          .evaluateAll((elements) =>
            elements
              .map((element) => ({
                label: element.getAttribute("aria-label") || element.textContent?.trim(),
                box: element.getBoundingClientRect(),
              }))
              .filter(({ box }) => box.width < 44 || box.height < 44)
              .map(({ label, box }) => ({ label, width: box.width, height: box.height })),
          );
        assert.deepEqual(smallTargets, [], `${locale}: native chat controls have 44px targets`);
        assert.ok(
          Math.abs(pendingBox.height - readyBox.height) <= 2,
          `${locale}: pending/ready height differs by ${Math.abs(pendingBox.height - readyBox.height)}px`,
        );
        assert.ok(
          Math.abs(pendingBox.width - readyBox.width) <= 2,
          `${locale}: pending/ready width stays fixed`,
        );
        if (out)
          await page.screenshot({
            path: resolve(out, `smart-match-${locale}-${width}-classic-light-ready.png`),
          });
        await dialog
          .getByRole("button", { name: locale === "fr" ? /^Nourrisson/ : /^Infant/ })
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector("#smart-match-reply")?.getAttribute("autocomplete") ===
            "address-level2",
        );
        await reply.fill("Toronto");
        await reply.press("Enter");
        await dialog.getByRole("button", { name: /10 km/ }).click();
        await dialog
          .getByRole("button", { name: locale === "fr" ? "Retour" : "Back", exact: true })
          .click();
        assert.equal(
          await reply.getAttribute("autocomplete"),
          "address-level2",
          `${locale}: Back restores the place question`,
        );
        await dialog
          .getByRole("button", {
            name: locale === "fr" ? "Recommencer" : "Start over",
            exact: true,
          })
          .click();
        await dialog
          .getByRole("button", { name: locale === "fr" ? /^Nourrisson/ : /^Infant/ })
          .waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
        await page.waitForFunction((element) => element === document.activeElement, await entry.elementHandle(), { timeout: 3000 });
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), initialOverflow);
        assert.equal(
          await entry.evaluate((element) => element === document.activeElement),
          true,
          `${locale}: ready Escape restores the opener`,
        );
        rows.push({
          locale,
          width,
          chunkRequests,
          readiness,
          chatChunk,
          scriptRequests,
          pendingBox,
          readyBox,
          immediateFocus: true,
          pendingEscape: true,
          openerRestored: true,
          tabWrap: true,
          targets44: true,
          quizBackRestart: true,
        });
      } finally {
        releaseChunk();
        await page.close();
      }
    }
  }
  if (out) {
    for (const locale of ["en", "fr"]) {
      for (const width of [390, 1280]) {
        for (const look of ["classic", "clean"]) {
          for (const theme of ["light", "dark"]) {
            activeCase = { phase: "appearance", locale, width, look, theme };
            const height = width === 390 ? 844 : 800;
            const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
            await page.route("**/*", async (route) => {
              if (await localReadOnlyRequest(route)) return route.continue();
            });
            try {
              const { entry, readiness } = await openHome(page, locale, look, theme);
              await entry.click();
              const dialog = page.locator('[data-ke="smart-match-chat"]');
              await dialog.locator("#smart-match-reply").waitFor({ state: "visible" });
              const box = await dialog.boundingBox();
              assert.ok(box);
              assert.ok(
                box.x >= -1 &&
                  box.y >= -1 &&
                  box.x + box.width <= width + 1 &&
                  box.y + box.height <= height + 1,
                "Dialog fits the CSS viewport",
              );
              const name = `smart-match-${locale}-${width}-${look}-${theme}-ready.png`;
              await page.screenshot({ path: resolve(out, name) });
              const actual = await page.evaluate(() => ({
                look: document.documentElement.dataset.look || "classic",
                theme: document.documentElement.dataset.resolvedTheme,
              }));
              assert.deepEqual(actual, { look, theme });
              surfaces.push({
                locale,
                width,
                height,
                look,
                theme,
                readiness,
                box,
                screenshot: name,
              });
            } finally {
              await page.close();
            }
          }
        }
      }
    }
  }
  const result = {
    ok: true,
    base: base.origin,
    servedRevision:
      process.env.POLISH_SERVED_REVISION || "Not supplied; verify the preview source independently",
    methodology: {
      physicalDevice: false,
      engine: "Chromium headless",
      externalRequests: "blocked",
      healthAndStatus: "blocked",
      writes: "blocked",
      quizResults: "not requested",
      activation:
        "Waits for observed React onClick attachment before the first activation; does not certify early SSR input responsiveness",
      gzipBytes:
        "Deterministic gzip of the delivered chat JavaScript body, not the local HTTP transfer size or all transitive dependencies",
    },
    rows,
    surfaces,
  };
  if (out)
    writeFileSync(resolve(out, "smart-match-lazy-proof.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const failure = {
    ok: false,
    base: base.origin,
    activeCase,
    error: error instanceof Error ? error.message : String(error),
    rows,
    surfaces,
  };
  if (out)
    writeFileSync(resolve(out, "smart-match-lazy-proof.json"), JSON.stringify(failure, null, 2));
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
