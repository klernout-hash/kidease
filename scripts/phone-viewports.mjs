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
