/**
 * Native-shell viewport pass for every iPhone point size the app still supports.
 * iOS deployment target is 15, so 320×568 (iPhone SE, 1st generation) stays in.
 * Landscape is allowed on iPhone. Layouts follow width, not a device name.
 * Larger Dynamic Type scales are checked on the same page.
 */

export const IPHONE_VIEWPORTS = [
  { name: "se1-portrait", width: 320, height: 568, safe: { top: 20, right: 0, bottom: 0, left: 0 } },
  { name: "se1-landscape", width: 568, height: 320, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: "se-portrait", width: 375, height: 667, safe: { top: 20, right: 0, bottom: 0, left: 0 } },
  { name: "se-landscape", width: 667, height: 375, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: "mini-portrait", width: 375, height: 812, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { name: "mini-landscape", width: 812, height: 375, safe: { top: 0, right: 0, bottom: 21, left: 47 } },
  { name: "14-portrait", width: 390, height: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { name: "14-landscape", width: 844, height: 390, safe: { top: 0, right: 0, bottom: 21, left: 47 } },
  { name: "16-portrait", width: 393, height: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } },
  { name: "16-landscape", width: 852, height: 393, safe: { top: 0, right: 0, bottom: 21, left: 59 } },
  { name: "16pro-portrait", width: 402, height: 874, safe: { top: 59, right: 0, bottom: 34, left: 0 } },
  { name: "16pro-landscape", width: 874, height: 402, safe: { top: 0, right: 0, bottom: 21, left: 59 } },
  { name: "xr-portrait", width: 414, height: 896, safe: { top: 48, right: 0, bottom: 34, left: 0 } },
  { name: "xr-landscape", width: 896, height: 414, safe: { top: 0, right: 0, bottom: 21, left: 48 } },
  { name: "air-portrait", width: 420, height: 912, safe: { top: 59, right: 0, bottom: 34, left: 0 } },
  { name: "air-landscape", width: 912, height: 420, safe: { top: 0, right: 0, bottom: 21, left: 59 } },
  { name: "plus-portrait", width: 428, height: 926, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { name: "plus-landscape", width: 926, height: 428, safe: { top: 0, right: 0, bottom: 21, left: 47 } },
  { name: "max-portrait", width: 430, height: 932, safe: { top: 59, right: 0, bottom: 34, left: 0 } },
  { name: "max-landscape", width: 932, height: 430, safe: { top: 0, right: 0, bottom: 21, left: 59 } },
  { name: "promax-portrait", width: 440, height: 956, safe: { top: 59, right: 0, bottom: 34, left: 0 } },
  { name: "promax-landscape", width: 956, height: 440, safe: { top: 0, right: 0, bottom: 21, left: 59 } },
];

const PHONE_ROUTES = ["/", "/search", "/login", "/fr", "/fr/login", "/help", "/for-daycares", "/inbox", "/parent", "/call/demo", "/video/demo", "/admin", "/app-admin-unavailable"];

const CAPPED = new Set(["/", "/search", "/login", "/fr", "/fr/login", "/help", "/for-daycares"]);

const TEXT_SCALES = [1.35, 1.64, 2.12];

const NATIVE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 KidEaseNative";

function pageCap(width) {
  if (width >= 1200) return 1040;
  if (width >= 1024) return 880;
  if (width >= 768) return 720;
  return width;
}

export async function runPhoneViewportPass(browser, base) {
  const problems = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: NATIVE_UA,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  for (const vp of IPHONE_VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const path of PHONE_ROUTES) {
      const label = `${vp.name} ${path}`;
      try {
        const res = await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 25000 });
        const status = res?.status() ?? 0;
        if (status >= 500) {
          problems.push(`${label} status ${status}`);
          continue;
        }
        const found = await page.evaluate(
          ({ safe, scales }) => {
            const root = document.documentElement;
            root.style.setProperty("--ke-safe-top", `${safe.top}px`);
            root.style.setProperty("--ke-safe-right", `${safe.right}px`);
            root.style.setProperty("--ke-safe-bottom", `${safe.bottom}px`);
            root.style.setProperty("--ke-safe-left", `${safe.left}px`);
            root.style.setProperty("--ke-text-scale", "1");
            const notes = [];
            const overflow = () => root.scrollWidth > root.clientWidth + 2;
            if (overflow()) notes.push(`overflow ${root.scrollWidth}>${root.clientWidth}`);
            const header = document.querySelector("header");
            if (header) {
              const pad = parseFloat(getComputedStyle(header).paddingTop) || 0;
              if (pad + 1 < safe.top) notes.push(`header-top ${Math.round(pad)}<${safe.top}`);
            }
            const shell = document.querySelector(".min-h-dvh");
            if (shell) {
              const left = parseFloat(getComputedStyle(shell).paddingLeft) || 0;
              if (left + 1 < safe.left) notes.push(`shell-left ${Math.round(left)}<${safe.left}`);
            }
            const bar = document.querySelector("[data-ke='app-tab-bar']");
            if (bar && getComputedStyle(bar).display !== "none") {
              const inner = bar.firstElementChild;
              const barPad = parseFloat(getComputedStyle(bar).paddingBottom) || 0;
              const innerPad = inner ? parseFloat(getComputedStyle(inner).paddingBottom) || 0 : 0;
              const pad = Math.max(barPad, innerPad);
              if (pad + 1 < safe.bottom) notes.push(`tab-bottom ${Math.round(pad)}<${safe.bottom}`);
              const box = bar.getBoundingClientRect();
              if (box.height > 0 && box.bottom < window.innerHeight - 2) notes.push(`tab-float ${Math.round(box.bottom)}<${window.innerHeight}`);
            }
            const h1 = document.querySelector("h1");
            if (h1 && (h1.textContent || "").trim()) {
              if (h1.scrollWidth > h1.clientWidth + 4) notes.push("h1-clip");
              const box = h1.getBoundingClientRect();
              const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
              if (box.height > 0 && box.top + 8 < headerBottom) notes.push("h1-under-header");
            }
            const pageEl = document.querySelector("[data-ke='page']");
            const pageWidth = pageEl ? Math.round(pageEl.getBoundingClientRect().width) : null;
            for (const scale of scales) {
              root.style.setProperty("--ke-text-scale", String(scale));
              void root.offsetWidth;
              const size = parseFloat(getComputedStyle(root).fontSize) || 0;
              if (Math.abs(size - 14 * scale) > 0.75) notes.push(`font ${scale} ${size.toFixed(1)}`);
              if (overflow()) notes.push(`type ${scale} overflow ${root.scrollWidth}>${root.clientWidth}`);
              const title = document.querySelector("h1");
              if (title && (title.textContent || "").trim() && title.scrollWidth > title.clientWidth + 4) {
                notes.push(`type ${scale} h1-clip`);
              }
            }
            root.style.setProperty("--ke-text-scale", "1");
            return { notes, pageWidth };
          },
          { safe: vp.safe, scales: TEXT_SCALES },
        );
        for (const note of found.notes) problems.push(`${label} ${note}`);
        if (vp.width >= 768 && CAPPED.has(path) && found.pageWidth != null) {
          const cap = pageCap(vp.width);
          if (found.pageWidth > cap + 1) problems.push(`${label} page ${found.pageWidth}>${cap}`);
        }
      } catch (err) {
        problems.push(`${label} ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  await context.close();
  return problems;
}

/**
 * Regression for Kyle's 2 Nov iPhone report at 390×844 (native shell):
 * no element wider than the screen (rails scroll inside themselves), exactly one bottom tab bar,
 * the tab bar steps aside while the keyboard is open, and at most one bottom prompt at a time.
 */
export const MOBILE_LAYOUT_ROUTES = ["/", "/search", "/inbox", "/parent", "/provider"];

export async function runMobileLayoutRegression(browser, base) {
  const problems = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: NATIVE_UA, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const path of MOBILE_LAYOUT_ROUTES) {
    try {
      const res = await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 25000 });
      if ((res?.status() ?? 0) >= 500) {
        problems.push(`${path} status ${res?.status()}`);
        continue;
      }
      await page.waitForTimeout(600);
      const notes = await page.evaluate(() => {
        const out = [];
        const w = window.innerWidth;
        for (const el of document.querySelectorAll("[data-ke='page'] *")) {
          if (el.closest(".ke-rail, .ke-chip-carousel, [data-ke='map'], .maplibregl-map, [aria-hidden='true']")) continue;
          // Content inside its own horizontal scroller (chip rows, tabs) is meant to extend.
          let inScroller = false;
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            if (getComputedStyle(a).overflowX !== "visible") { inScroller = true; break; }
          }
          if (inScroller) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.right > w + 2 || r.left < -2)) {
            out.push(`overflow ${el.tagName.toLowerCase()}${el.getAttribute("data-ke") ? `[${el.getAttribute("data-ke")}]` : ""} ${Math.round(r.left)}..${Math.round(r.right)}`);
            break;
          }
        }
        for (const card of document.querySelectorAll(".ke-rail--visual .ke-rail-card")) {
          const r = card.getBoundingClientRect();
          if (r.width > w * 0.9) out.push(`rail-card ${Math.round(r.width)}>${Math.round(w * 0.9)}`);
          break;
        }
        const visible = (el) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
        const bars = [...document.querySelectorAll("[data-ke='app-tab-bar']")].filter(visible);
        if (bars.length > 1) out.push(`tab-bars ${bars.length}`);
        document.documentElement.dataset.keyboard = "open";
        const barsOpen = [...document.querySelectorAll("[data-ke='app-tab-bar']")].filter(visible);
        if (barsOpen.length) out.push("tab-bar-visible-with-keyboard");
        delete document.documentElement.dataset.keyboard;
        const prompts = [...document.querySelectorAll("[data-ke='cookie-consent'], [data-ke='push-explainer']")].filter(visible);
        if (prompts.length > 1) out.push(`prompts ${prompts.length}`);
        return out;
      });
      for (const n of notes) problems.push(`390x844 ${path} ${n}`);
    } catch (err) {
      problems.push(`390x844 ${path} ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await context.close();
  return problems;
}

/**
 * 390px checks for the phone issues Kyle recorded: photo frames, see-all inset,
 * map toggle clear of the chips, privacy padding, no floating role pill, and
 * the help launcher sitting above the tab bar.
 */
export async function runPhoneIssuePass(browser, base) {
  const problems = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: NATIVE_UA,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  async function open(path) {
    const res = await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 25000 });
    if ((res?.status() ?? 0) >= 500) problems.push(`${path} status ${res?.status()}`);
    await page.waitForTimeout(400);
  }

  try {
    await open("/");
    const home = await page.evaluate(() => {
      const notes = [];
      const frame = document.createElement("div");
      frame.className = "ke-photo-frame";
      frame.style.width = "200px";
      const img = document.createElement("img");
      img.className = "ke-photo";
      img.alt = "";
      frame.appendChild(img);
      document.body.appendChild(frame);
      const frameStyle = getComputedStyle(frame);
      const imgStyle = getComputedStyle(img);
      const box = frame.getBoundingClientRect();
      const ratio = box.width > 0 ? box.width / box.height : 0;
      if (frameStyle.overflow !== "hidden" || ratio < 1.2 || ratio > 1.45) {
        notes.push(`photo-frame ratio ${ratio.toFixed(2)} overflow ${frameStyle.overflow}`);
      }
      if (imgStyle.objectFit !== "cover" || imgStyle.position !== "absolute") {
        notes.push(`photo object-fit ${imgStyle.objectFit} position ${imgStyle.position}`);
      }
      frame.remove();
      const visible = (el) => {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 8 && r.height > 8;
      };
      const link = [...document.querySelectorAll(".ke-see-all")].find(visible);
      if (link) {
        const right = link.getBoundingClientRect().right;
        if (right > window.innerWidth - 8) notes.push(`see-all flush right ${Math.round(right)}`);
      }
      if (document.querySelector("[data-ke='role-switch-pill']")) notes.push("floating role pill");
      return notes;
    });
    for (const note of home) problems.push(`home ${note}`);

    await open("/search");
    const search = await page.evaluate(() => {
      const notes = [];
      const toggle = document.querySelector("[data-ke='explore-map-toggle']");
      const chips = document.querySelector(".ke-explore-filter-bar [data-chip-carousel]");
      if (toggle && chips) {
        const t = toggle.getBoundingClientRect();
        const c = chips.getBoundingClientRect();
        const overlap = t.left < c.right - 4 && t.right > c.left + 4 && t.top < c.bottom - 4 && t.bottom > c.top + 4;
        if (overlap) notes.push(`map toggle overlaps chips ${Math.round(t.left)}<${Math.round(c.right)}`);
      } else notes.push("map toggle or chips missing");
      return notes;
    });
    for (const note of search) problems.push(`search ${note}`);

    await open("/privacy");
    const privacy = await page.evaluate(() => {
      const notes = [];
      const main = document.querySelector("[data-ke='legal-page']");
      if (!main) return ["legal page missing"];
      const style = getComputedStyle(main);
      const padL = parseFloat(style.paddingLeft) || 0;
      const padR = parseFloat(style.paddingRight) || 0;
      if (padL < 16) notes.push(`privacy pad-left ${padL}`);
      if (padR < 16) notes.push(`privacy pad-right ${padR}`);
      return notes;
    });
    for (const note of privacy) problems.push(`privacy ${note}`);

    await page.mouse.click(20, 20).catch(() => undefined);
    const launcher = page.locator("[data-ke='help-launcher']");
    /* Help is a lazy chunk after the first tap (or a 4s idle cap). The tap above
       starts it; the wait covers the chunk on a busy preview. */
    const seen = await launcher.waitFor({ state: "visible", timeout: 12000 }).then(() => true).catch(() => false);
    if (!seen) {
      problems.push("help launcher did not show");
    } else {
      const overlap = await page.evaluate(() => {
        const bot = document.querySelector(".ke-help-bot");
        const bar = document.querySelector("[data-ke='app-tab-bar']");
        if (!bot || !bar) return "help or tab bar missing";
        const b = bot.getBoundingClientRect();
        const t = bar.getBoundingClientRect();
        if (b.height < 8 || t.height < 8) return "help or tab bar has no box";
        if (b.bottom > t.top + 2) return `help overlaps tab ${Math.round(b.bottom)}>${Math.round(t.top)}`;
        return "";
      });
      if (overlap) problems.push(overlap);
    }
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }

  await context.close();
  return problems;
}
