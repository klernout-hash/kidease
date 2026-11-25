/**
 * Live resize pass. Apple's iPhone Duo prepare page names the Xcode 27.1
 * simulator and says not to hardcode a screen size, so foldables are covered by
 * a continuous sweep from 320pt through iPad widths, including near-square
 * windows. One page load per route. Resizing must not reload or drop typed state.
 *
 * iPhone Duo: Apple has not published point sizes. The simulator figures that
 * third parties report (DUO_POSES in store-viewports.mjs) are added to the
 * sweep, and runDuoPass checks each pose (safe strip, rail, split map, crease)
 * and a fold, unfold, rotate sequence on one page load.
 */
import { DUO_CREASE_X, DUO_POSES } from "./store-viewports.mjs";


const NATIVE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 KidEaseNative";

const ROUTES = [
  { path: "/", field: "[data-ke='where-field'] input", value: "Winnipeg" },
  { path: "/search", field: "[data-ke='where-field'] input", value: "Winnipeg" },
  { path: "/login", field: "input[type='password']", value: "correct-horse" },
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
  for (const pose of DUO_POSES) steps.push({ name: pose.name, width: pose.width, height: pose.height });
  return steps;
}

function expectedShape(width, height) {
  const ratio = height > 0 ? width / height : 1;
  if (ratio >= 0.85 && ratio <= 1.18) return "square";
  if (ratio > 1.18) return "wide";
  return "tall";
}

function pageCap(width) {
  // App look: 720 on a tablet, then the full width up to 1040 from 900 (inner foldable display, iPad landscape).
  if (width >= 900) return Math.min(width, 1040);
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
          // React mounts the controlled input after the first paint and writes
          // its empty state over a value typed too early. Fill once that wipe
          // has happened. Resizing after that must keep the typed value.
          await field.fill(route.value);
          const wiped = await page
            .waitForFunction(
              ({ sel, value }) => document.querySelector(sel)?.value !== value,
              { sel: route.field, value: route.value },
              { timeout: 1800 },
            )
            .then(() => true)
            .catch(() => false);
          let kept = !wiped;
          if (wiped) {
            await field.fill(route.value);
            kept = await page
              .waitForFunction(
                ({ sel, value }) => document.querySelector(sel)?.value === value,
                { sel: route.field, value: route.value },
                { timeout: 1000 },
              )
              .then(async () => {
                await page.waitForTimeout(400);
                return page.evaluate(
                  ({ sel, value }) => document.querySelector(sel)?.value === value,
                  { sel: route.field, value: route.value },
                );
              })
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
  problems.push(...(await runDuoPass(browser, base)));
  return problems;
}

function documentCapPath(path) {
  return path === "/" || path === "/search" || path === "/login" || path === "/help" || path === "/fr";
}

const SAFARI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** Signed out in CI. /inbox and /parent show their guest screens; the layout rules are the same. */
const DUO_ROUTES = ["/", "/search?q=Winnipeg", "/login", "/fr/search?q=Winnipeg", "/inbox", "/parent", "/provider?desk=today"];

/** Fold-time bugs only. Network noise from map tiles in CI is not a fold regression. */
const DUO_CONSOLE = /ResizeObserver|Hydration|hydrat|Maximum update depth|Minified React error|Cannot read properties of null/i;

function isInner(pose) {
  return pose.width >= 900 && pose.width / pose.height >= 1.2;
}

async function injectSafe(page, safe) {
  await page.evaluate((safe) => {
    const root = document.documentElement;
    root.style.setProperty("--ke-safe-top", `${safe.top}px`);
    root.style.setProperty("--ke-safe-right", `${safe.right}px`);
    root.style.setProperty("--ke-safe-bottom", `${safe.bottom}px`);
    root.style.setProperty("--ke-safe-left", `${safe.left}px`);
    root.style.setProperty("--ke-text-scale", "1");
    window.dispatchEvent(new Event("resize"));
  }, safe);
}

/** Per-pose layout facts, measured in the page. */
async function measureDuo(page, safe) {
  return page.evaluate((safe) => {
    const root = document.documentElement;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const notes = [];
    if (root.scrollWidth > root.clientWidth + 2) notes.push(`overflow ${root.scrollWidth}>${root.clientWidth}`);
    // A control under the side strip is only a problem if a tap there would reach it.
    const strip = [];
    for (const el of document.querySelectorAll("a[href], button, input:not([type='hidden']), select, textarea, [role='button']")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= H) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.pointerEvents === "none") continue;
      const y = Math.min(Math.max(r.top + r.height / 2, 1), H - 1);
      const probes = [];
      if (safe.right > 0 && r.right > W - safe.right + 1) probes.push(Math.max(W - safe.right + 1, r.left + 1));
      if (safe.left > 0 && r.left < safe.left - 1) probes.push(Math.min(safe.left - 1, r.right - 1));
      for (const x of probes) {
        if (x < 0 || x >= W) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) {
          const name = el.getAttribute("data-ke") || el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 24) || el.tagName.toLowerCase();
          strip.push(`${name}@${Math.round(r.left)}-${Math.round(r.right)}`);
          break;
        }
      }
    }
    if (strip.length) notes.push(`strip ${strip.slice(0, 3).join(",")}`);
    const pageEl = document.querySelector("[data-ke='page']");
    const bar = document.querySelector("[data-ke='app-tab-bar']");
    const barBox = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect() : null;
    const cards = [...document.querySelectorAll(".ke-search-results .ke-result-stack article[data-slug]")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .slice(0, 4);
    return {
      notes,
      W,
      H,
      channel: root.dataset.channel || "",
      pageWidth: pageEl ? Math.round(pageEl.getBoundingClientRect().width) : null,
      bar: barBox ? { left: barBox.left, right: barBox.right, top: barBox.top, bottom: barBox.bottom, width: barBox.width, height: barBox.height } : null,
      columns: new Set(cards.map((r) => Math.round(r.left / 8))).size,
      cardCount: cards.length,
    };
  }, safe);
}

async function readSplit(page) {
  return page.evaluate(() => {
    const split = document.querySelector("[data-ke='search-split']");
    const map = document.querySelector("[data-ke='search-split-map']");
    if (!split || !map) return null;
    const list = split.firstElementChild;
    if (!list || list === map) return null;
    const a = list.getBoundingClientRect();
    const b = map.getBoundingClientRect();
    return { listRight: a.right, mapLeft: b.left, mapHeight: b.height };
  });
}

/**
 * iPhone Duo poses (T2). Each pose: no sideways scroll, no control under the
 * side strip, the right navigation, and on the inner display the full-width
 * column, the side rail and the list plus map with the crease in the gap.
 * Then fold, unfold and rotate on one page load.
 */
export async function runDuoPass(browser, base) {
  const problems = [];
  for (const pose of DUO_POSES) {
    const context = await browser.newContext({
      viewport: { width: pose.width, height: pose.height },
      userAgent: pose.web ? SAFARI_UA : NATIVE_UA,
      deviceScaleFactor: 1,
      hasTouch: true,
    });
    const page = await context.newPage();
    for (const path of DUO_ROUTES) {
      const label = `duo ${pose.name} ${path}`;
      try {
        const res = await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(async () => {
          return page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 25000 });
        });
        const status = res?.status() ?? 0;
        if (status >= 500) {
          problems.push(`${label} status ${status}`);
          continue;
        }
        await injectSafe(page, pose.safe);
        // Signed-out desks can redirect (to /login, say). Judge the page that loaded.
        const bare = new URL(page.url()).pathname.replace(/^\/fr(?=\/|$)/, "") || "/";
        // Navigation and width are asserted on the public pages every pose renders the same way.
        const navPage = bare === "/" || bare === "/search";
        const widthPage = navPage || bare === "/login";
        const hasTabs = navPage;
        if (hasTabs && !pose.web) {
          await page.waitForSelector("[data-ke='app-tab-bar']", { state: "attached", timeout: 8000 }).catch(() => undefined);
        }
        const inner = isInner(pose) && !pose.web;
        if (inner && bare === "/search") {
          await page.waitForSelector("[data-ke='search-split-map']", { state: "attached", timeout: 10000 }).catch(() => undefined);
        }
        await page.waitForTimeout(250);
        const m = await measureDuo(page, pose.safe);
        for (const note of m.notes) problems.push(`${label} ${note}`);
        if (m.channel !== "app") problems.push(`${label} channel ${m.channel || "missing"}`);
        if (inner) {
          // The rail (5.5rem) and the side strip take their share; the column fills the rest instead of stopping at 720.
          const rail = m.bar && hasTabs ? m.bar.width : 0;
          const room = m.W - rail - pose.safe.left - pose.safe.right;
          if (widthPage && m.pageWidth != null && m.pageWidth < Math.min(860, room - 2)) problems.push(`${label} page ${m.pageWidth}<${Math.min(860, Math.round(room - 2))}`);
          if (hasTabs && (!m.bar || m.bar.height <= 300 || m.bar.width > 100)) {
            problems.push(`${label} rail ${m.bar ? `${Math.round(m.bar.width)}x${Math.round(m.bar.height)}` : "hidden"}`);
          }
          if (bare === "/search") {
            const split = await readSplit(page);
            if (!split) problems.push(`${label} split-map missing`);
            else {
              const lo = DUO_CREASE_X - 20;
              const hi = DUO_CREASE_X + 20;
              if (split.listRight > hi || split.mapLeft < lo || split.mapLeft <= split.listRight) {
                problems.push(`${label} crease gap ${Math.round(split.listRight)}-${Math.round(split.mapLeft)} misses ${DUO_CREASE_X}`);
              }
              if (m.bar && split.mapHeight > m.H) problems.push(`${label} split-map taller than the window`);
            }
          }
        } else if (hasTabs && !pose.web) {
          if (!m.bar || m.bar.height < 30) problems.push(`${label} bottom-bar hidden`);
          else if (m.bar.height > 200 || m.bar.bottom < m.H - pose.safe.bottom - 1) problems.push(`${label} bottom-bar ${Math.round(m.bar.top)}-${Math.round(m.bar.bottom)}`);
          if (bare === "/search" && m.cardCount >= 2 && m.columns > 1) problems.push(`${label} columns ${m.columns}`);
        }
      } catch (err) {
        problems.push(`${label} ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
    await context.close();
  }
  problems.push(...(await duoFoldSequence(browser, base)));
  return problems;
}

/** Cover portrait, inner landscape, cover, inner portrait, cover: one page load. */
async function duoFoldSequence(browser, base) {
  const problems = [];
  const poses = Object.fromEntries(DUO_POSES.map((pose) => [pose.name, pose]));
  const cover = poses["duo-cover-portrait"];
  const context = await browser.newContext({
    viewport: { width: cover.width, height: cover.height },
    userAgent: NATIVE_UA,
    deviceScaleFactor: 1,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  let armed = false;
  page.on("console", (msg) => {
    if (armed && msg.type() === "error" && DUO_CONSOLE.test(msg.text())) errors.push(msg.text().slice(0, 120));
  });
  page.on("pageerror", (err) => {
    if (armed) errors.push(String(err?.message || err).slice(0, 120));
  });
  try {
    await page.goto(new URL("/search?q=Winnipeg", base).href, { waitUntil: "domcontentloaded", timeout: 25000 });
    await injectSafe(page, cover.safe);
    await page.waitForSelector("[data-ke='search-split']", { state: "attached", timeout: 15000 });
    await page.waitForTimeout(1500);
    const origin = await page.evaluate(() => {
      window.__keFoldMark = "stay";
      return performance.timeOrigin;
    });
    const filtersKey = () => page.evaluate(() => document.querySelector("[data-ke='search-split']")?.getAttribute("data-ke-filters") ?? null);
    const startKey = await filtersKey();
    // Put a card under the reader's eye, then remember where it sits.
    await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
    await page.waitForTimeout(400);
    const pickAnchor = () =>
      page.evaluate(() => {
        const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
        const x = Math.round(document.documentElement.clientWidth / 2);
        const hit = document.elementFromPoint(x, Math.max(header + 24, 80));
        const card = hit?.closest("[data-slug]");
        return card ? { slug: card.getAttribute("data-slug"), top: card.getBoundingClientRect().top } : null;
      });
    let anchor = await pickAnchor();
    armed = true;
    for (const name of ["duo-inner-landscape", "duo-cover-portrait", "duo-inner-portrait", "duo-cover-portrait"]) {
      const pose = poses[name];
      await page.setViewportSize({ width: pose.width, height: pose.height });
      await injectSafe(page, pose.safe);
      await page.waitForTimeout(700);
      const state = await page.evaluate((slug) => {
        const el = slug ? document.querySelector(`[data-slug="${CSS.escape(slug)}"]`) : null;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        return {
          mark: window.__keFoldMark === "stay",
          origin: performance.timeOrigin,
          top: el && el.getClientRects().length ? el.getBoundingClientRect().top : null,
          clamped: window.scrollY <= 2 || window.scrollY >= max - 2,
        };
      }, anchor?.slug ?? null);
      if (!state.mark || state.origin !== origin) problems.push(`duo-fold ${name} reloaded`);
      const key = await filtersKey();
      if (startKey != null && key !== startKey) problems.push(`duo-fold ${name} filters changed`);
      if (anchor && state.top != null && !state.clamped && Math.abs(state.top - anchor.top) > 80) {
        problems.push(`duo-fold ${name} anchor moved ${Math.round(state.top - anchor.top)}px`);
      }
      anchor = (await pickAnchor()) ?? anchor;
    }
    if (errors.length) problems.push(`duo-fold console ${errors.slice(0, 2).join(" | ")}`);
  } catch (err) {
    problems.push(`duo-fold ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
  armed = false;
  problems.push(...(await duoSheetUnfold(page, base, poses)));
  await context.close();
  return problems;
}

/**
 * C4a regression: the msv2 search sheet open with a postal code typed, then
 * unfold. The sheet stays visible with the text, and closing it leaves a page
 * that takes taps. Runs only when FEATURE_MOBILE_SEARCH_V2 renders the sheet.
 */
async function duoSheetUnfold(page, base, poses) {
  const problems = [];
  const cover = poses["duo-cover-portrait"];
  const inner = poses["duo-inner-landscape"];
  try {
    await page.setViewportSize({ width: cover.width, height: cover.height });
    await page.goto(new URL("/search?q=Winnipeg", base).href, { waitUntil: "domcontentloaded", timeout: 25000 });
    await injectSafe(page, cover.safe);
    const opener = page.locator("[data-ke='msv2-summary']").first();
    const shown = await opener
      .waitFor({ state: "visible", timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      console.log("[fold-resize] duo-sheet skipped: the mobile search sheet is off in this build");
      return problems;
    }
    await opener.click();
    const input = page.locator("[data-ke='msv2-sheet'] [data-ke='msv2-where-input']");
    await input.waitFor({ state: "visible", timeout: 8000 });
    await input.fill("R3T 2N2");
    await page.setViewportSize({ width: inner.width, height: inner.height });
    await injectSafe(page, inner.safe);
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const sheet = document.querySelector("dialog[data-ke='msv2-sheet']");
      const box = sheet?.getBoundingClientRect();
      const field = document.querySelector("[data-ke='msv2-where-input']");
      return { open: Boolean(sheet?.open), width: box?.width ?? 0, value: field?.value ?? null };
    });
    if (!after.open || after.width <= 300) problems.push(`duo-sheet unfold sheet ${after.open ? Math.round(after.width) : "closed"}`);
    if (after.open && after.value !== "R3T 2N2") problems.push(`duo-sheet unfold value ${after.value}`);
    if (after.open) await page.locator("[data-ke='msv2-close']").click({ timeout: 5000 });
    await page.waitForTimeout(500);
    const usable = await page.evaluate(() => {
      const open = document.querySelector("dialog[open]");
      const hit = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
      return { open: Boolean(open), hit: hit ? hit.tagName : "" };
    });
    if (usable.open) problems.push("duo-sheet still open after close");
    if (usable.hit === "HTML" || usable.hit === "") problems.push("duo-sheet page inert after close");
  } catch (err) {
    problems.push(`duo-sheet ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
  return problems;
}
