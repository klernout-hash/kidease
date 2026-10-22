/**
 * Native-shell viewport pass for 13" and 11" iPads, plus Split View and Slide Over.
 * Records one e2e result. Does not change the caller's page viewport.
 */

export const IPAD_VIEWPORTS = [
  { name: "13-portrait", width: 1032, height: 1376 },
  { name: "13-landscape", width: 1376, height: 1032 },
  { name: "11-portrait", width: 834, height: 1194 },
  { name: "11-landscape", width: 1194, height: 834 },
  { name: "slide-over", width: 320, height: 1032 },
  { name: "split-half", width: 688, height: 1032 },
  { name: "split-two-thirds", width: 917, height: 1032 },
];

export const IPAD_ROUTES = [
  "/",
  "/search",
  "/login",
  "/fr",
  "/fr/login",
  "/help",
  "/for-daycares",
  "/inbox",
  "/parent",
  "/call/demo",
  "/video/demo",
];

const NATIVE_UA = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 KidEaseNative";

const CAPPED = new Set(["/", "/search", "/login", "/fr", "/fr/login", "/help", "/for-daycares"]);

function pageCap(width) {
  if (width >= 1200) return 1040;
  if (width >= 1024) return 880;
  if (width >= 768) return 720;
  return width;
}

export async function runIpadViewportPass(browser, base) {
  const problems = [];
  for (const vp of IPAD_VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: NATIVE_UA,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    for (const path of IPAD_ROUTES) {
      const label = `${vp.name} ${path}`;
      try {
        const res = await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 25000 });
        const status = res?.status() ?? 0;
        if (status >= 500) problems.push(`${label} status ${status}`);
        const metrics = await page.evaluate(() => {
          const doc = document.documentElement;
          const pageEl = document.querySelector("[data-ke='page']");
          const rail = document.querySelector(".ke-rail--visual");
          const apple = document.querySelector(".ke-apple-button");
          return {
            scroll: doc.scrollWidth,
            client: doc.clientWidth,
            pageWidth: pageEl ? Math.round(pageEl.getBoundingClientRect().width) : null,
            railDisplay: rail ? getComputedStyle(rail).display : null,
            appleWidth: apple ? Math.round(apple.getBoundingClientRect().width) : null,
          };
        });
        if (metrics.scroll > metrics.client + 2) {
          problems.push(`${label} overflow ${metrics.scroll}>${metrics.client}`);
        }
        if (vp.width >= 768 && CAPPED.has(path) && metrics.pageWidth != null) {
          const cap = pageCap(vp.width);
          if (metrics.pageWidth > cap + 1) problems.push(`${label} page ${metrics.pageWidth}>${cap}`);
          if (metrics.pageWidth > vp.width - 48) problems.push(`${label} page edge ${metrics.pageWidth}`);
        }
        if (vp.width >= 1024 && (path === "/login" || path === "/fr/login") && metrics.appleWidth != null && metrics.appleWidth > 376) {
          problems.push(`${label} apple ${metrics.appleWidth}`);
        }
        if (vp.width >= 768 && metrics.railDisplay && metrics.railDisplay !== "grid") {
          problems.push(`${label} rail ${metrics.railDisplay}`);
        }
      } catch (err) {
        problems.push(`${label} ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await context.close();
  }
  return problems;
}
