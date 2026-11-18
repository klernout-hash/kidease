/**
 * Layout audit: loads public pages at every target width and fails on
 *   - horizontal page scroll,
 *   - two tappable controls overlapping (ignoring ones clipped by a scroller,
 *     fixed-vs-flowing pairs, and controls drawn inside another control),
 *   - text spilling out of its box (clipped text with an ellipsis is fine),
 *   - tap targets under 44px (clean look only; today's look is reported).
 *
 *   npm run e2e:layout                         # vite preview on :8081, then audit
 *   LAYOUT_AUDIT_URL=https://... npm run e2e:layout -- --no-preview
 *
 * Writes artifacts/layout-audit/report.json. LAYOUT_AUDIT_BLOCKING=0 reports
 * without failing the run.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

export const LAYOUT_WIDTHS = [320, 360, 375, 390, 414, 768, 1024, 1280, 1440, 1920];
export const LAYOUT_PAGES = [
  "/",
  "/search?q=Winnipeg",
  "/login",
  "/claim",
  "/fr",
  "/fr/search?q=Winnipeg",
  "/fr/login",
];
export const MIN_TAP = 44;

const args = new Set(process.argv.slice(2));
const base = new URL(process.env.LAYOUT_AUDIT_URL || "http://127.0.0.1:8081");
const blocking = process.env.LAYOUT_AUDIT_BLOCKING !== "0";
const out = "artifacts/layout-audit";

/** Runs in the page. Kept free of closures so Playwright can serialise it. */
export function auditPage(minTap) {
  const d = document;
  const W = innerWidth;
  const hiddenUp = (e) => {
    for (let p = e; p && p !== d.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return true;
    }
    return false;
  };
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && !hiddenUp(e);
  };
  const name = (e) =>
    `${((e.dataset && e.dataset.ke) || e.getAttribute("aria-label") || e.textContent || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40)} <${e.tagName.toLowerCase()}>`;
  const fixed = (e) => {
    for (let p = e; p && p !== d.body; p = p.parentElement) if (getComputedStyle(p).position === "fixed") return true;
    return false;
  };
  // The part of an element a person can actually see: cut by any scrolling or clipping ancestor.
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    let box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    for (let p = e.parentElement; p && p !== d.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(hidden|auto|scroll|clip)/.test(s.overflowX) || /(hidden|auto|scroll|clip)/.test(s.overflowY)) {
        const c = p.getBoundingClientRect();
        box = {
          left: Math.max(box.left, c.left),
          right: Math.min(box.right, c.right),
          top: Math.max(box.top, c.top),
          bottom: Math.min(box.bottom, c.bottom),
        };
      }
    }
    return box;
  };
  const issues = { overflow: [], overlap: [], spill: [], small: [] };

  const scrollWidth = d.scrollingElement.scrollWidth;
  if (scrollWidth > W + 1) {
    for (const e of d.body.querySelectorAll("*")) {
      const r = e.getBoundingClientRect();
      if (r.right <= W + 1 || r.width < 2 || !visible(e)) continue;
      let clipped = false;
      for (let p = e.parentElement; p && p !== d.body; p = p.parentElement) {
        if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(p).overflowX)) {
          clipped = true;
          break;
        }
      }
      if (!clipped) issues.overflow.push(`${name(e)} reaches ${Math.round(r.right)}px`);
      if (issues.overflow.length >= 5) break;
    }
    if (!issues.overflow.length) issues.overflow.push(`page is ${scrollWidth}px wide`);
  }

  // Inert content can still overflow or spill text, but its controls cannot be
  // activated. Native modal dialogs escape inherited (not explicit) inertness.
  const inertControl = (element) => {
    for (let node = element; node; node = node.parentElement) {
      if (node.hasAttribute("inert")) return true;
      if (node.matches("dialog:modal")) return false;
    }
    return false;
  };
  const controls = [...d.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab]')]
    .filter((element) => visible(element) && !inertControl(element))
    .map((e) => ({ e, r: shown(e), fixed: fixed(e) }))
    .filter(({ r }) => r.right - r.left > 1 && r.bottom - r.top > 1);
  const seen = new Set();
  for (let i = 0; i < controls.length; i += 1) {
    const a = controls[i];
    const raw = a.e.getBoundingClientRect();
    const inline = a.e.tagName === "A" && getComputedStyle(a.e).display === "inline";
    const box = a.e.type === "checkbox" || a.e.type === "radio";
    if (!inline && !box && (raw.height < minTap - 0.5 || raw.width < minTap - 0.5)) {
      const key = `small:${(a.e.dataset && a.e.dataset.ke) || name(a.e)}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.small.push(`${name(a.e)} ${Math.round(raw.width)}x${Math.round(raw.height)}`);
      }
    }
    for (let j = i + 1; j < controls.length; j += 1) {
      const b = controls[j];
      if (a.e.contains(b.e) || b.e.contains(a.e) || a.fixed !== b.fixed) continue;
      const inside = (x, y) => x.left >= y.left - 1 && x.right <= y.right + 1 && x.top >= y.top - 1 && x.bottom <= y.bottom + 1;
      if (inside(a.r, b.r) || inside(b.r, a.r)) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ix > 2 && iy > 2) {
        const key = `overlap:${name(a.e)}|${name(b.e)}`;
        if (!seen.has(key)) {
          seen.add(key);
          issues.overlap.push(`${name(a.e)} overlaps ${name(b.e)}`);
        }
      }
    }
  }

  for (const e of d.body.querySelectorAll("h1,h2,h3,h4,p,span,a,button,dd,dt,li,label,strong,td,th")) {
    if (issues.spill.length >= 10 || !visible(e)) continue;
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
    if (!hasText || e.clientWidth <= 1 || e.scrollWidth <= e.clientWidth + 2) continue;
    const s = getComputedStyle(e);
    if (s.display === "inline" || s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none") continue;
    if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) continue;
    issues.spill.push(`${name(e)} ${e.scrollWidth}px in ${e.clientWidth}px`);
  }
  const faces = d.fonts ? [...d.fonts].map((face) => ({ family: face.family, status: face.status })) : [];
  const finalUrl = new URL(d.location.href);
  finalUrl.username = "";
  finalUrl.password = "";
  finalUrl.hash = "";
  for (const key of new Set(finalUrl.searchParams.keys())) {
    if (key !== "q" && key !== "look") finalUrl.searchParams.set(key, "[redacted]");
  }
  return {
    width: W, scrollWidth, issues,
    finalUrl: finalUrl.href,
    fonts: {
      status: d.fonts?.status ?? "unavailable",
      // FontFaceSet has settled; this does not establish which face rendered.
      ready: d.fonts?.status === "loaded",
      bodyFamily: getComputedStyle(d.body).fontFamily,
      loadedFamilies: [...new Set(faces.filter((face) => face.status === "loaded").map((face) => face.family))].sort(),
      faces,
    },
  };
}

/** Preserve navigation diagnostics without changing the existing audit timing/policy. */
export async function auditLayoutPage(page, url) {
  let navigationStatus = null;
  let navigationError = null;
  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    navigationStatus = response?.status() ?? null;
  } catch (error) {
    // Names suffice for attribution; messages/stacks can contain URL credentials.
    navigationError = error instanceof Error ? error.name : "NavigationError";
    await page.waitForLoadState("load");
  }
  await page.waitForTimeout(800);
  return { ...(await page.evaluate(auditPage, MIN_TAP)), navigationStatus, navigationError };
}

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Preview did not answer at ${url}`);
}

async function main() {
  let preview = null;
  if (!args.has("--no-preview")) {
    preview = spawn("npm", ["run", "preview"], { stdio: "inherit", detached: true });
    await waitFor(base.href, Number(process.env.LAYOUT_AUDIT_WAIT_MS || 90000));
  }
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  let failures = 0;
  try {
    for (const look of ["clean", "classic"]) {
      for (const width of LAYOUT_WIDTHS) {
        const context = await browser.newContext({
          viewport: { width, height: width < 768 ? 800 : 900 },
          deviceScaleFactor: 1,
          isMobile: width < 768,
          hasTouch: width < 768,
          colorScheme: "light",
        });
        // No first-visit tips or cookie bar in the way of the audit.
        await context.addInitScript((lookName) => {
          try {
            const tours = ["welcome:parent", "welcome:provider", "tour:parent:search", "tour:parent:listing", "tour:provider:attendance"];
            localStorage.setItem("kidease-first-run", JSON.stringify({ seen: tours, dismissed: tours }));
            localStorage.setItem("kidease-analytics-consent", "denied");
            localStorage.setItem("kidease-look", lookName);
          } catch {
            // storage blocked: the audit still runs
          }
        }, look);
        const page = await context.newPage();
        for (const path of LAYOUT_PAGES) {
          const url = new URL(path, base);
          url.searchParams.set("look", look);
          const result = await auditLayoutPage(page, url.href);
          const { overflow, overlap, spill, small } = result.issues;
          const smallFails = look === "clean" ? small : [];
          const bad = overflow.length + overlap.length + spill.length + smallFails.length;
          failures += bad;
          report.push({ look, width, path, ...result.issues, finalUrl: result.finalUrl, navigationStatus: result.navigationStatus, navigationError: result.navigationError, fonts: result.fonts });
          if (bad) console.log(`[layout] ${look} ${width}px ${path}: ${bad} issue(s)`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    if (preview?.pid) {
      try {
        process.kill(-preview.pid);
      } catch {
        // already gone
      }
    }
  }
  writeFileSync(`${out}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[layout] ${failures} issue(s) across ${report.length} page loads. Report: ${out}/report.json`);
  if (failures && blocking) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
