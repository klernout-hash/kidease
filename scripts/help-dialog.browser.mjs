import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { checkedOutputPath, smokeAllowedOutputDirs } from "./browser-guard.mjs";
import { startHelpDialogFixture } from "./fixtures/help-dialog.mjs";
import { frenchTypography } from "../src/lib/french-type.ts";

// Actual Help/Radix/Router components in an isolated local fixture. No full-app
// runtime, financial modules, application server, database or provider is loaded.
assert.ok(!/^https?:/i.test(process.argv[2] ?? ""), "Use the isolated fixture, not an application preview URL");
const output = checkedOutputPath(
  resolve(process.argv[2] ?? "artifacts/help-dialog", "verdict.json"),
  smokeAllowedOutputDirs(),
  "verdict",
);
const out = dirname(output);
await mkdir(out, { recursive: true });
const isolated = await startHelpDialogFixture(out);
const base = new URL(isolated.origin);
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
} catch (error) {
  await isolated.close();
  throw error;
}
const verdict = {
  ok: false,
  checks: [],
  nonReadRequestsBlocked: 0,
  externalRequestsBlocked: 0,
  blockedNonReadPaths: [],
  apiRequestsBlocked: 0,
  webSocketRequestsBlocked: 0,
  scope: "isolated actual Help/Radix/Router components; synthetic denied service edges; compiled application CSS",
  sourceProvenance: isolated.provenance,
  boundary: isolated.metrics,
};
const text = Object.fromEntries(["en", "fr"].map((locale) => {
  const pack = isolated.packs[locale];
  const value = (key) => locale === "fr" ? frenchTypography(pack[key]) : pack[key];
  return [locale, {
    help: value("helpBot"), close: value("close"), input: value("helpBotPh"), send: value("send"),
    loading: value("loading"), typing: value("helpBotTyping"), failure: value("helpBotFail"), agent: value("helpBotAgent"),
    path: locale === "fr" ? "/fr/help" : "/help", report: locale === "fr" ? "/fr/report" : "/report",
  }];
}));

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function deadline(promise, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fixture(locale, width, { holdImport = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    colorScheme: "light",
    locale: locale === "fr" ? "fr-CA" : "en-CA",
    serviceWorkers: "block",
  });
  await context.addCookies([{ name: "kidease-locale", value: locale, url: base.origin }]);
  await context.addInitScript(() => {
    localStorage.setItem("kidease-theme", "light");
    localStorage.setItem("kidease-look", "clean");
  });
  const importSeen = deferred();
  const importRelease = deferred();
  const writeSeen = deferred();
  const writeRelease = deferred();
  let pauseWrites = false;
  let writes = 0;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base.origin) {
      verdict.externalRequestsBlocked++;
      await route.abort();
      return;
    }
    if (/^\/(?:api|_server[^/]*|__server[^/]*)(?:\/|$)/.test(url.pathname)) {
      verdict.apiRequestsBlocked++;
      await route.abort();
      return;
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      verdict.nonReadRequestsBlocked++;
      const blocked = `${request.method()} ${url.pathname}`;
      if (!verdict.blockedNonReadPaths.includes(blocked)) verdict.blockedNonReadPaths.push(blocked);
      writes++;
      if (pauseWrites) {
        writeSeen.resolve();
        await writeRelease.promise;
      }
      await route.abort();
      return;
    }
    if (
      holdImport &&
      /\/(?:assets\/help-bot[^/]*\.js|src\/components\/help-bot\.tsx)$/.test(url.pathname)
    ) {
      importSeen.resolve();
      await importRelease.promise;
    }
    await route.continue();
  });
  await context.routeWebSocket("**/*", (socket) => {
    verdict.webSocketRequestsBlocked++;
    socket.close();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/net::ERR_(?:FAILED|ABORTED)/.test(message.text())) {
      consoleErrors.push(message.text().slice(0, 1500));
    }
  });
  const copy = text[locale];
  console.log(JSON.stringify({ locale, width, stage: "loading-local-page", holdImport }));
  const trigger = page.locator('[data-ke="help-launcher"] button');
  try {
    await page.goto(new URL(copy.path, base).href, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await trigger.waitFor();
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-ke="help-launcher"] button');
      const key = button && Object.keys(button).find((name) => name.startsWith("__reactProps$"));
      return Boolean(key && typeof button[key]?.onClick === "function");
    });
    assert.equal(await trigger.getAttribute("aria-label"), copy.help);
  } catch (error) {
    verdict.checks.push({
      locale,
      width,
      holdImport,
      stage: "setup-failed",
      pageErrors: errors,
      consoleErrors,
    });
    await page.screenshot({ path: `${out}/setup-failure-${locale}-${width}.png` }).catch(() => {});
    importRelease.resolve();
    writeRelease.resolve();
    await context.close();
    throw error;
  }
  console.log(JSON.stringify({ locale, width, stage: "launcher-hydrated", holdImport }));
  return {
    context,
    page,
    trigger,
    errors,
    copy,
    importSeen,
    importRelease,
    writeSeen,
    writeRelease,
    pauseWrites() {
      pauseWrites = true;
    },
    writes: () => writes,
    async dispose() {
      importRelease.resolve();
      writeRelease.resolve();
      await context.close();
    },
  };
}

function dialogFor(page) {
  return page.locator('[data-ke="help-dialog"]');
}

async function focusInside(page) {
  await page.waitForFunction(() =>
    document.querySelector('[data-ke="help-dialog"]')?.contains(document.activeElement),
  );
}

async function open(f, waitForBody = true) {
  await f.trigger.focus();
  await f.page.keyboard.press("Enter");
  const dialog = dialogFor(f.page);
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute("role"), "dialog");
  assert.equal(await dialog.getAttribute("aria-modal"), "true");
  await f.page.getByRole("dialog", { name: f.copy.help, exact: true }).waitFor();
  const close = dialog.getByRole("button", { name: f.copy.close, exact: true });
  await f.page.waitForFunction(
    (node) => document.activeElement === node,
    await close.elementHandle(),
  );
  if (waitForBody) await dialog.getByRole("textbox", { name: f.copy.input, exact: true }).waitFor();
  return dialog;
}

async function closed(f, restore = true) {
  await dialogFor(f.page).waitFor({ state: "detached" });
  if (restore) {
    await f.page.waitForFunction(
      (node) => document.activeElement === node,
      await f.trigger.elementHandle(),
    );
    assert.equal(await f.trigger.getAttribute("aria-expanded"), "false");
  }
  assert.notEqual(
    await f.page.evaluate(() => getComputedStyle(document.body).pointerEvents),
    "none",
  );
}

async function trap(f, dialog) {
  const controls = [];
  for (const control of await dialog
    .locator("a[href], button, input, select, textarea, [tabindex]")
    .all()) {
    if (
      await control.evaluate(
        (node) =>
          node.tabIndex >= 0 && !node.matches(":disabled") && node.getClientRects().length > 0,
      )
    )
      controls.push(control);
  }
  assert.ok(controls.length > 2, "Loaded dialog has keyboard controls");
  await controls.at(-1).focus();
  await f.page.keyboard.press("Tab");
  assert.equal(
    await controls[0].evaluate((node) => node === document.activeElement),
    true,
    "Tab wraps to first control",
  );
  await f.page.keyboard.press("Shift+Tab");
  assert.equal(
    await controls.at(-1).evaluate((node) => node === document.activeElement),
    true,
    "Shift+Tab wraps to last control",
  );
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < controls.length + 1; i++) {
      await f.page.keyboard.press(key);
      await focusInside(f.page);
    }
  }
  await f.trigger.evaluate((node) => node.focus());
  await focusInside(f.page);
}

async function reflow(f, locale) {
  const { page, copy } = f;
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => document.documentElement.style.setProperty("--ke-text-scale", "2"));
  const dialog = await open(f);
  const geometry = await dialog.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      x: box.x,
      y: box.y,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      overflow: node.scrollWidth > node.clientWidth + 1,
      rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
  });
  assert.ok(geometry.rootFont >= 27, "The 200% text scale is applied");
  assert.ok(
    geometry.x >= -1 && geometry.y >= -1 && geometry.right <= 321 && geometry.bottom <= 569,
    JSON.stringify(geometry),
  );
  assert.equal(geometry.overflow, false, "Dialog has no horizontal overflow at 320px/200% text");
  await page.screenshot({
    path: `${out}/help-${locale}-320-text200-top.png`,
    animations: "disabled",
  });
  for (const control of [
    dialog.getByRole("button", { name: copy.close, exact: true }),
    dialog.getByRole("textbox", { name: copy.input, exact: true }),
    dialog.getByRole("button", { name: copy.agent, exact: true }),
  ]) {
    await control.focus();
    const box = await control.boundingBox();
    assert.ok(
      box && box.x >= -1 && box.y >= -1 && box.x + box.width <= 321 && box.y + box.height <= 569,
      `Focused control is reachable: ${JSON.stringify(box)}`,
    );
  }
  await dialog
    .getByRole("textbox", { name: copy.input, exact: true })
    .fill("Synthetic keyboard smoke question");
  await dialog.getByRole("button", { name: copy.send, exact: true }).focus();
  const send = await dialog.getByRole("button", { name: copy.send, exact: true }).boundingBox();
  assert.ok(send && send.y >= -1 && send.y + send.height <= 569, "Send remains reachable");
  await page.screenshot({ path: `${out}/help-${locale}-320-text200.png`, animations: "disabled" });
  await page.keyboard.press("Escape");
  await closed(f);
  await page.evaluate(() => document.documentElement.style.removeProperty("--ke-text-scale"));
  verdict.checks.push({
    locale,
    width: 320,
    textScale: "200%",
    reflow: "passed",
    focusedControlsReachable: true,
  });
}

async function navigation(f) {
  const { page, copy } = f;
  // Invoke a real React Link, as an app/native navigation event while open.
  await page
    .locator(`a[href="${copy.report}"]`)
    .first()
    .evaluate((node) => node.click());
  await page.waitForURL((url) => url.pathname === copy.report);
  await closed(f, false);
  // Browser/native Back must dismiss an open panel on the destination too.
  // Do not wait for the chat body: lazy-import interruption cases hold it.
  await open(f, false);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === copy.path);
  await page.locator('[data-ke="help-launcher"] button').waitFor();
  assert.equal(await dialogFor(page).count(), 0, "Back returns to a closed Help dialog");
}

try {
  for (const locale of ["en", "fr"]) {
    for (const width of [390, 1280]) {
      const f = await fixture(locale, width);
      try {
        const dialog = await open(f);
        const log = dialog.getByRole("log", { name: f.copy.help, exact: true });
        assert.equal(await log.getAttribute("aria-live"), "polite");
        assert.match(await log.getAttribute("aria-relevant"), /additions/);
        assert.equal(
          await dialog.getByRole("button", { name: f.copy.send, exact: true }).isDisabled(),
          true,
        );
        await f.page.screenshot({
          path: `${out}/help-${locale}-${width}.png`,
          animations: "disabled",
        });
        await trap(f, dialog);
        await f.page.keyboard.press("Escape");
        await closed(f);
        for (let cycle = 0; cycle < 3; cycle++) {
          const current = await open(f);
          await current.getByRole("button", { name: f.copy.close, exact: true }).click();
          await closed(f);
        }
        await open(f);
        await f.page.mouse.click(2, 2);
        await closed(f);
        await open(f);
        const before = await f.page.evaluate(() => window.scrollY);
        f.pauseWrites();
        await dialog
          .getByRole("textbox", { name: f.copy.input, exact: true })
          .fill("Synthetic keyboard smoke question");
        await dialog.getByRole("button", { name: f.copy.send, exact: true }).click();
        await deadline(
          f.writeSeen.promise,
          "Synthetic send never reached the blocked local request",
        );
        assert.ok(
          (await log.innerText()).includes(f.copy.typing),
          "Busy status uses the current language",
        );
        f.writeRelease.resolve();
        await log.getByText(f.copy.failure, { exact: false }).waitFor();
        assert.ok(f.writes() > 0, "The synthetic send was blocked before reaching the server");
        assert.equal(
          await f.page.evaluate(() => window.scrollY),
          before,
          "Reply status does not scroll the underlying page",
        );
        await focusInside(f.page);
        await trap(f, dialog);
        await f.page.screenshot({
          path: `${out}/help-${locale}-${width}-blocked-send.png`,
          animations: "disabled",
        });
        await f.page.keyboard.press("Escape");
        await closed(f);
        await open(f);
        await navigation(f);
        if (width === 390) await reflow(f, locale);
        assert.deepEqual(f.errors, [], "No uncaught browser errors");
        verdict.checks.push({
          locale,
          width,
          initialCloseFocus: true,
          tabTrap: true,
          outsideFocusBlocked: true,
          escapeCloseRestore: true,
          closeButtonRestore: true,
          reopenCycles: 3,
          backdropRestore: true,
          translatedLabelsAndLog: true,
          translatedBlockedSend: true,
          navigationAndBackClose: true,
          pageErrors: f.errors,
        });
        console.log(JSON.stringify(verdict.checks.at(-1)));
      } catch (error) {
        await f.page.screenshot({ path: `${out}/failure-${locale}-${width}.png` }).catch(() => {});
        verdict.checks.push({ locale, width, stage: "dialog-failed", pageErrors: f.errors });
        throw error;
      } finally {
        await f.dispose();
      }
    }
    for (const interrupt of ["close", "navigation"]) {
      const f = await fixture(locale, 390, { holdImport: true });
      try {
        const dialog = await open(f, false);
        await deadline(f.importSeen.promise, "Help lazy chunk was not intercepted");
        await dialog.getByRole("status").waitFor();
        assert.equal(await dialog.getByRole("status").innerText(), f.copy.loading);
        if (interrupt === "close") {
          await f.page.keyboard.press("Escape");
          await closed(f);
        } else {
          await navigation(f);
        }
        f.importRelease.resolve();
        await open(f);
        await f.page.keyboard.press("Escape");
        await closed(f);
        assert.deepEqual(f.errors, []);
        verdict.checks.push({
          locale,
          width: 390,
          lazyImportInterruptedBy: interrupt,
          closeBeforeChunk: true,
          translatedLoading: true,
          subsequentOpen: true,
        });
        console.log(JSON.stringify(verdict.checks.at(-1)));
      } catch (error) {
        await f.page
          .screenshot({ path: `${out}/failure-lazy-${locale}-${interrupt}.png` })
          .catch(() => {});
        verdict.checks.push({
          locale,
          width: 390,
          stage: "lazy-interruption-failed",
          interrupt,
          pageErrors: f.errors,
        });
        throw error;
      } finally {
        await f.dispose();
      }
    }
  }
  assert.equal(verdict.checks.length, 10, "All original Help cases must run");
  assert.equal(verdict.externalRequestsBlocked, 0, "No external request may be attempted");
  assert.equal(verdict.apiRequestsBlocked, 0, "No application API may be requested");
  assert.equal(verdict.webSocketRequestsBlocked, 0, "No WebSocket may be requested");
  assert.deepEqual(verdict.blockedNonReadPaths, ["POST /__help_fixture/denied"], "Only the explicit rejecting Help boundary may attempt a request");
  assert.equal(verdict.nonReadRequestsBlocked, 4, "One synthetic denied send per normal locale/width case");
  verdict.ok = true;
} catch (error) {
  verdict.error = String(error?.stack || error);
  process.exitCode = 1;
  console.error(verdict.error);
} finally {
  await browser.close();
  try {
    await isolated.close();
  } catch (error) {
    verdict.ok = false;
    verdict.cleanupError = String(error?.stack || error);
    process.exitCode = 1;
  }
  await writeFile(output, JSON.stringify(verdict, null, 2));
}
