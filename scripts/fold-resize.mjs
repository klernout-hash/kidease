/**
 * Live resize pass. Apple's iPhone Duo prepare page names the Xcode 27.1
 * simulator and says not to hardcode a screen size. It does not publish
 * point dimensions, so foldables are covered by a continuous sweep from
 * 320pt through iPad widths, including near-square windows.
 * One page load per route. Resizing must not reload or drop typed state.
 */

const NATIVE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 KidEaseNative";

const ROUTES = [
  { path: "/", field: "[data-ke='where-field'] input", value: "Winnipeg" },
  { path: "/search", field: "[data-ke='where-field'] input", value: "Winnipeg" },
  { path: "/login", field: "input[type='email']", value: "ada@kidease.ca" },
  { path: "/help", field: "input[autocomplete='name']", value: "Ada" },
  { path: "/fr", field: "[data-ke='where-field'] input", value: "Winnipeg" },
  { path: "/call/demo", field: "input[type='email']", value: "ada@kidease.ca" },
  { path: "/video/demo", field: "input[type='email']", value: "ada@kidease.ca" },
];

export function foldSteps() {
  const steps = [];
  for (let width = 320; width <= 1032; width += 64) {
    steps.push({ name: `tall-${width}`, width, height: Math.round(width * 1.7) });
  }
  steps.push({ name: "ipad-13", width: 1032, height: 1376 });
  for (const width of [480, 600, 688, 768, 834, 900, 951, 1032]) {
    steps.push({ name: `square-${width}`, width, height: width });
  }
  steps.push({ name: "wide-open", width: 951, height: 700 });
  steps.push({ name: "wide-short", width: 1032, height: 640 });
  return steps;
}

function expectedShape(width, height) {
  const ratio = height > 0 ? width / height : 1;
  if (ratio >= 0.85 && ratio <= 1.18) return "square";
  if (ratio > 1.18) return "wide";
  return "tall";
}

function pageCap(width) {
  if (width >= 1200) return 1040;
  if (width >= 1024) return 880;
  if (width >= 768) return 720;
  return width;
}

export async function runFoldResizePass(browser, base) {
  const problems = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: NATIVE_UA,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const steps = foldSteps();

  for (const route of ROUTES) {
    const label = route.path;
    try {
      const res = await page.goto(new URL(route.path, base).href, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(async () => {
        return page.goto(new URL(route.path, base).href, { waitUntil: "domcontentloaded", timeout: 25000 });
      });
      const status = res?.status() ?? 0;
      if (status >= 500) {
        problems.push(`${label} status ${status}`);
        continue;
      }
      const armed = await page.evaluate((field) => {
        window.__keFoldMark = "stay";
        const input = field ? document.querySelector(field) : null;
        return {
          origin: performance.timeOrigin,
          href: location.href,
          hasField: Boolean(input),
        };
      }, route.field);
      if (armed.hasField) {
        const field = page.locator(route.field).first();
        if (await field.isVisible().catch(() => false)) {
          // A controlled input filled before hydration resets to empty. Fill again once React owns it.
          let kept = false;
          for (let attempt = 0; attempt < 6 && !kept; attempt += 1) {
            await field.fill(route.value);
            kept = await page
              .waitForFunction(
                ({ sel, value }) => document.querySelector(sel)?.value === value,
                { sel: route.field, value: route.value },
                { timeout: 500 },
              )
              .then(() => true)
              .catch(() => false);
          }
          if (!kept) armed.hasField = false;
        } else armed.hasField = false;
      }
      const selected = await page.evaluate(() => document.querySelector(".ke-split")?.getAttribute("data-selected") ?? null);
      for (const step of steps) {
        await page.setViewportSize({ width: step.width, height: step.height });
        const found = await page.evaluate(
          ({ field, value, shape, cap, checkCap, selected }) => {
            window.dispatchEvent(new Event("resize"));
            const root = document.documentElement;
            const notes = [];
            if (window.__keFoldMark !== "stay") notes.push("reloaded");
            if (root.scrollWidth > root.clientWidth + 2) notes.push(`overflow ${root.scrollWidth}>${root.clientWidth}`);
            if (root.dataset.keShape !== shape) notes.push(`shape ${root.dataset.keShape || "missing"}!=${shape}`);
            const input = field ? document.querySelector(field) : null;
            if (input && input.value !== value) notes.push(`state ${input.value}`);
            if (checkCap) {
              const pageEl = document.querySelector("[data-ke='page']");
              const pageWidth = pageEl ? Math.round(pageEl.getBoundingClientRect().width) : null;
              if (pageWidth != null && pageWidth > cap + 1) notes.push(`page ${pageWidth}>${cap}`);
            }
            const split = document.querySelector(".ke-split");
            if (split && selected != null && split.getAttribute("data-selected") !== selected) notes.push("split-state");
            return notes;
          },
          {
            field: armed.hasField ? route.field : null,
            value: route.value,
            shape: expectedShape(step.width, step.height),
            cap: pageCap(step.width),
            checkCap: step.width >= 768 && documentCapPath(route.path),
            selected,
          },
        );
        for (const note of found) problems.push(`${label} ${step.name} ${note}`);
        const origin = await page.evaluate(() => performance.timeOrigin);
        if (origin !== armed.origin) problems.push(`${label} ${step.name} new-document`);
      }
    } catch (err) {
      problems.push(`${label} ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    }
  }

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.evaluate(() => {
      window.__keFoldMark = "stay";
      const room = document.createElement("div");
      room.className = "ke-video-room";
      room.dataset.ke = "video-room";
      room.dataset.keLive = "video";
      const stage = document.createElement("div");
      stage.className = "ke-video-stage";
      const video = document.createElement("video");
      video.dataset.keProbe = "live";
      video.muted = true;
      stage.appendChild(video);
      room.appendChild(stage);
      room.style.position = "fixed";
      room.style.left = "0";
      room.style.right = "0";
      room.style.top = "4rem";
      room.style.zIndex = "5";
      document.body.appendChild(room);
    });
    for (const step of [
      { name: "phone", width: 390, height: 844, grid: false },
      { name: "square", width: 800, height: 800, grid: true },
      { name: "fold-open", width: 951, height: 700, grid: true },
      { name: "fold-closed", width: 440, height: 700, grid: false },
      { name: "ipad", width: 1032, height: 1376, grid: true },
    ]) {
      await page.setViewportSize({ width: step.width, height: step.height });
      const found = await page.evaluate(({ grid }) => {
        window.dispatchEvent(new Event("resize"));
        const notes = [];
        if (window.__keFoldMark !== "stay") notes.push("reloaded");
        const video = document.querySelector("[data-ke-probe='live']");
        if (!video || !video.isConnected) notes.push("video-detached");
        else if (getComputedStyle(video).objectFit !== "contain") notes.push(`fit ${getComputedStyle(video).objectFit}`);
        const room = document.querySelector("[data-ke-live='video']");
        const display = room ? getComputedStyle(room).display : "";
        if (grid && display !== "grid") notes.push(`stage ${display}`);
        if (!grid && display === "grid") notes.push("stage grid");
        return notes;
      }, { grid: step.grid });
      for (const note of found) problems.push(`media ${step.name} ${note}`);
    }
  } catch (err) {
    problems.push(`media ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }

  const web = await browser.newContext({
    viewport: { width: 800, height: 900 },
    deviceScaleFactor: 1,
  });
  const webPage = await web.newPage();
  try {
    await webPage.goto(new URL("/", base).href, { waitUntil: "domcontentloaded", timeout: 25000 });
    await webPage.evaluate(() => {
      window.__keFoldMark = "stay";
    });
    const origin = await webPage.evaluate(() => performance.timeOrigin);
    for (const step of [
      { name: "compact", width: 700, height: 800, channel: "app" },
      { name: "regular", width: 1100, height: 800, channel: "website" },
      { name: "folded", width: 420, height: 800, channel: "app" },
    ]) {
      await webPage.setViewportSize({ width: step.width, height: step.height });
      const found = await webPage.evaluate((channel) => {
        window.dispatchEvent(new Event("resize"));
        const notes = [];
        if (window.__keFoldMark !== "stay") notes.push("reloaded");
        if (document.documentElement.dataset.channel !== channel) notes.push(`channel ${document.documentElement.dataset.channel}`);
        return notes;
      }, step.channel);
      for (const note of found) problems.push(`web ${step.name} ${note}`);
      const nextOrigin = await webPage.evaluate(() => performance.timeOrigin);
      if (nextOrigin !== origin) problems.push(`web ${step.name} new-document`);
    }
  } catch (err) {
    problems.push(`web ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
  await web.close();
  await context.close();
  return problems;
}

function documentCapPath(path) {
  return path === "/" || path === "/search" || path === "/login" || path === "/help" || path === "/fr";
}
