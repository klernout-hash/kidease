import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

// Run against an existing local preview; no server or data mutations are needed.
const base = new URL(process.argv[2] ?? "http://127.0.0.1:8099/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Use a local preview");
const out = resolve(process.argv[3] ?? "artifacts/smart-match-dialog");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
});
const verdict = [];

async function inside(dialog) {
  await dialog.page().waitForFunction(() => {
    const panel = document.querySelector('[data-ke="smart-match-chat"]');
    return panel?.contains(document.activeElement);
  });
}

async function keyboardContained(dialog) {
  const page = dialog.page();
  const controls = dialog.locator('a[href], button, input, select, textarea, [tabindex]').filter({ visible: true });
  const enabled = [];
  for (const control of await controls.all()) {
    if (await control.evaluate((node) => node.tabIndex >= 0 && !node.matches(":disabled"))) enabled.push(control);
  }
  assert.ok(enabled.length > 1, "The current question has keyboard controls");
  await enabled.at(-1).focus();
  await page.keyboard.press("Tab");
  assert.equal(await enabled[0].evaluate((node) => node === document.activeElement), true, "Tab wraps to first control");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await enabled.at(-1).evaluate((node) => node === document.activeElement), true, "Shift+Tab wraps to last control");
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < enabled.length + 2; i++) {
      await page.keyboard.press(key);
      await inside(dialog);
    }
  }
}

async function closedAndRestored(page, trigger) {
  await page.locator('[data-ke="smart-match-chat"]').waitFor({ state: "detached" });
  await page.waitForFunction((node) => document.activeElement === node, await trigger.elementHandle());
}

try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", locale: "en-CA" });
    await context.addInitScript(() => {
      localStorage.setItem("kidease-theme", "light");
      localStorage.setItem("kidease-look", "clean");
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const home = new URL("/?look=clean", base);
    await page.goto(home.href, { waitUntil: "domcontentloaded", timeout: 120000 });
    const card = page.locator('[data-ke="smart-match-card"]:visible').first();
    await card.waitFor({ timeout: 90000 });
    await page.waitForFunction(() => Boolean(window.__keTabBarOwner));
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => document.fonts.status === "loaded");
    await card.screenshot({ path: `${out}/closed-after-${width}.png`, animations: "disabled" });
    const trigger = card.locator('[data-ke="smart-match-open"]');
    await trigger.press("Enter");
    const dialog = page.locator('[data-ke="smart-match-chat"]');
    await dialog.waitFor();
    assert.equal(await dialog.getAttribute("aria-modal"), "true");
    await inside(dialog);
    await page.screenshot({ path: `${out}/dialog-${width}.png` });
    await keyboardContained(dialog);
    // Programmatic focus attempts outside must also stay in the modal.
    await trigger.evaluate((node) => node.focus());
    await inside(dialog);
    await dialog.getByRole("button", { name: "Any age", exact: true }).click();
    await inside(dialog);
    await keyboardContained(dialog);
    await dialog.locator("input").fill("Winnipeg");
    await page.keyboard.press("Escape");
    await closedAndRestored(page, trigger);
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.keyboard.press("Enter");
      await dialog.waitFor();
      assert.equal(await dialog.getByRole("button", { name: "Any age", exact: true }).isVisible(), true, "Interrupted reopen keeps existing fresh quiz behavior");
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await closedAndRestored(page, trigger);
    }
    await page.keyboard.press("Enter");
    await dialog.waitFor();
    await page.mouse.click(2, 2);
    await closedAndRestored(page, trigger);
    console.log(JSON.stringify({ width, homeDialogChecks: "passed" }));
    // The same entry is nested inside the phone/desktop navigation drawer.
    // Phone navigation uses /menu, so open the desktop drawer before resizing.
    if (width < 1024) await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('button[aria-controls="ke-nav-drawer"]:visible').click();
    const drawer = page.locator("#ke-nav-drawer");
    await drawer.waitFor();
    if (width < 1024) await page.setViewportSize({ width, height: 900 });
    const drawerTrigger = drawer.locator('[data-ke="smart-match-open"]:visible').first();
    await drawerTrigger.click();
    await dialog.waitFor();
    await inside(dialog);
    await keyboardContained(dialog);
    const inFront = await dialog.evaluate((panel) => {
      const box = panel.getBoundingClientRect();
      return panel.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    });
    assert.equal(inFront, true, "The nested dialog is above the drawer");
    await page.screenshot({ path: `${out}/dialog-from-menu-${width}.png` });
    await page.keyboard.press("Escape");
    await closedAndRestored(page, drawerTrigger);
    assert.equal(await drawer.isVisible(), true, "Escape closes only the top dialog");
    await page.keyboard.press("Enter");
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await closedAndRestored(page, drawerTrigger);
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await drawer.waitFor({ state: "detached" });
    verdict.push({ width, initialFocusInside: true, tabWrap: true, shiftTabWrap: true, outsideFocusBlocked: true, dynamicQuestionFocus: true, escapeRestoresTrigger: true, closeReopenCycles: 3, backdropCloseRestores: true, menuLayering: true, menuEscapePreservesDrawer: true, pageErrors: errors });
    console.log(JSON.stringify(verdict.at(-1)));
    await context.close();
  }
  await writeFile(`${out}/verdict.json`, JSON.stringify(verdict, null, 2));
} finally { await browser.close(); }
