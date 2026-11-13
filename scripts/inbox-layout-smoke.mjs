import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

// Local fixture accounts only. Never point this test at a deployed database.
const base = new URL(process.env.INBOX_SMOKE_URL || "http://127.0.0.1:8081");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Loopback URL required");
const out = "artifacts/inbox-layout";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || undefined,
});
const results = [];

async function seed(context) {
  for (const data of [
    { role: "parent", activity: true },
    { role: "provider", ownSlug: "e2e-centre", activity: true, engagement: true },
  ]) {
    const response = await context.request.post(new URL("/api/e2e-seed", base).href, {
      data,
      headers: { origin: base.origin },
    });
    assert.equal(response.status(), 200, `Local ${data.role} fixture must be enabled`);
  }
}

async function geometry(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        scrollTop: el.scrollTop,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        display: getComputedStyle(el).display,
      };
    };
    return {
      scrollY,
      height: innerHeight,
      docHeight: document.documentElement.scrollHeight,
      body: {
        height: document.body.getBoundingClientRect().height,
        pad: getComputedStyle(document.body).paddingBottom,
      },
      header: box(".ke-site-header"),
      back: box('[data-ke="thread-back"]'),
      frame: box('[data-ke-viewport="inbox"]'),
      inbox: box('[data-ke="centre-inbox"]'),
      composer: box('[data-ke="thread-composer"]'),
      tabs: box('[data-ke="app-tab-bar"]'),
      transcript: box('[data-ke="centre-inbox"] ul[aria-live="polite"]'),
    };
  });
}

function assertFrame(value, label) {
  assert.equal(value.scrollY, 0, `${label}: focus must not scroll the document`);
  assert.ok(value.frame.top >= 0, `${label}: frame must remain at the top of the viewport`);
  assert.ok(value.header.top >= 0, `${label}: site header must remain on screen`);
  assert.ok(value.back.top >= value.header.bottom - 1, `${label}: back control remains visible`);
  assert.ok(
    value.inbox.scrollHeight <= value.inbox.clientHeight + 1,
    `${label}: hidden grid must not scroll`,
  );
  const bottom = value.tabs?.display === "none" ? value.frame.bottom : value.tabs.top;
  assert.ok(
    value.composer.bottom <= bottom + 1,
    `${label}: composer remains above bottom navigation`,
  );
  assert.ok(bottom - value.composer.bottom < 20, `${label}: no blank tail below composer`);
}

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === base.origin ? route.continue() : route.abort();
  });
  await context.addInitScript(() => localStorage.setItem("ke-channel", "app"));
  await seed(context);
  const page = await context.newPage();
  for (const size of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(new URL("/inbox/e2e-eng-thread?view=centre", base).href, {
      waitUntil: "networkidle",
    });
    await page.locator('[data-ke="thread-composer"] input').waitFor();
    // Exercise real component geometry with a long synthetic transcript,
    // without sending a message or changing the fixture's conversation data.
    await page.locator('ul[aria-live="polite"]').evaluate((list) => {
      const items = [...list.children];
      for (let i = 0; i < 16; i++) for (const item of items) list.append(item.cloneNode(true));
    });
    const input = page.locator('[data-ke="thread-composer"] input');
    for (let i = 0; i < 4; i++) {
      await input.focus();
      await page.waitForTimeout(100); // The existing global focus-reveal timer is 60ms.
      await input.blur();
      assertFrame(await geometry(page), `${size.width} focus cycle ${i + 1}`);
    }
    const value = await geometry(page);
    const label = `${size.width}x${size.height}`;
    console.log(label, JSON.stringify(value));
    await page.screenshot({ path: `${out}/thread-${label}.png` });
    assertFrame(value, label);
    const scroll = await page.locator('ul[aria-live="polite"]').evaluate((list) => {
      const port = list.parentElement;
      port.scrollTop = port.scrollHeight;
      return { height: port.clientHeight, content: port.scrollHeight, top: port.scrollTop };
    });
    assert.ok(
      scroll.height > 0 && scroll.content > scroll.height && scroll.top > 0,
      `${label}: transcript is scrollable`,
    );
    await input.focus();
    await page.waitForTimeout(100);
    await input.blur();
    const afterFocus = await page
      .locator('ul[aria-live="polite"]')
      .evaluate((list) => list.parentElement.scrollTop);
    assert.equal(
      afterFocus,
      scroll.top,
      `${label}: focus preserves the transcript's scroll position`,
    );
    assertFrame(await geometry(page), `${label} scrolled`);
    await page.screenshot({ path: `${out}/thread-${label}.png` });
    const essentialOnly = page.getByRole("button", { name: "Essential only", exact: true });
    if (await essentialOnly.isVisible()) {
      await essentialOnly.click();
      await page.locator('[data-ke="cookie-consent"]').waitFor({ state: "hidden" });
    }
    await page.screenshot({ path: `${out}/draft-${size.width}.png` });
    if (size.width < 1280) {
      await page.locator('[data-ke="inbox-detail-open"]').click();
      await page.locator('[role="dialog"]').waitFor();
      await page.locator('[role="dialog"] button[aria-label]').first().click();
      await page.locator('[role="dialog"]').waitFor({ state: "hidden" });
      assertFrame(await geometry(page), `${label} closed details`);
    }
    await page.locator('[data-ke="thread-back"]').click();
    await page.waitForURL(/\/inbox\?view=centre$/);
    const row = page.locator('a[href*="e2e-eng-thread"]').first();
    await row.click();
    await page.locator('[data-ke="thread-composer"] input').waitFor();
    assertFrame(await geometry(page), `${label} reopened from list`);
    results.push({ size, geometry: value, scroll, detailsAndBack: "passed" });
  }
  // Emulate the configured iOS body's explicit resize. This is a browser check,
  // not verification of the actual iPhone keyboard or Capacitor bridge.
  const native = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 KidEaseNative",
    storageState: await context.storageState(),
  });
  await native.route("**/*", (route) =>
    new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort(),
  );
  const nativePage = await native.newPage();
  await nativePage.goto(new URL("/inbox/e2e-eng-thread?view=centre", base).href, {
    waitUntil: "networkidle",
  });
  await nativePage.locator('[data-ke="thread-composer"] input').waitFor();
  await nativePage.evaluate(() => {
    document.body.style.height = "504px";
  });
  await nativePage.waitForFunction(
    () =>
      document.querySelector('[data-ke-viewport="inbox"]').getBoundingClientRect().height === 504,
  );
  const nativeBody = await geometry(nativePage);
  assert.equal(nativeBody.frame.height, 504, "Native body resize must define available space once");
  await nativePage.setViewportSize({ width: 390, height: 504 });
  await nativePage.waitForTimeout(50);
  assert.equal(
    (await geometry(nativePage)).frame.height,
    504,
    "Resized viewport and body must not subtract twice",
  );
  await nativePage.evaluate(() => {
    document.body.style.height = "";
  });
  await nativePage.setViewportSize({ width: 390, height: 844 });
  await nativePage.waitForFunction(
    () =>
      document.querySelector('[data-ke-viewport="inbox"]').getBoundingClientRect().height === 844,
  );
  results.push({ nativeBodyResize: "passed", geometry: nativeBody });
  writeFileSync(`${out}/verdict.json`, JSON.stringify({ ok: true, results }, null, 2));
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
  await browser.close();
}
