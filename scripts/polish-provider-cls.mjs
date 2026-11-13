#!/usr/bin/env node
/**
 * Attribute provider layout shifts on an isolated, loopback PGLite preview.
 *
 * node scripts/polish-provider-cls.mjs --base http://127.0.0.1:8091 \
 *   --source-sha <built-sha> --out artifacts/performance-polish/provider-cls \
 *   --runs 3 --local-fixtures
 *
 * The preview must have E2E_ROLE_FIXTURE=1, no DATABASE_URL, and the intended
 * production flags. No flags are changed here. --record-only records a failing
 * baseline without making the command fail; the report still records failure.
 * This is an unthrottled attribution probe, not Lighthouse or field vitals.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index < 0 ? fallback : argv[index + 1];
};
const base = new URL(option("base", "http://127.0.0.1:8091"));
if (base.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(base.hostname) || base.username || base.password) {
  throw new Error("An HTTP loopback preview is required.");
}
if (!argv.includes("--local-fixtures")) {
  throw new Error("--local-fixtures must confirm an isolated PGLite preview with no DATABASE_URL.");
}
const sourceSha = option("source-sha", "");
if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("--source-sha must identify the exact built source.");
const runs = Number(option("runs", "3"));
if (!Number.isInteger(runs) || runs < 1 || runs > 9) throw new Error("--runs must be between 1 and 9.");
const locales = option("locales", "en,fr").split(",");
if (locales.some((locale) => !["en", "fr"].includes(locale))) throw new Error("Only EN and FR are supported.");
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(option("out", "artifacts/performance-polish/provider-cls"));
if (![repo, dirname(repo), "/tmp"].some((root) => out.startsWith(`${root}/`))) {
  throw new Error("Output must remain in this task workspace or /tmp.");
}
mkdirSync(out, { recursive: true });
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const summary = {
  sourceSha,
  origin: base.origin,
  methodology: "Fresh Chrome context per run; 412×823 CSS px, DPR 1.75, mobile viewport. No CPU or network throttling. Local synthetic provider fixture e2e-centre only. External requests and /api/health blocked. CLS uses the maximum 5-second session window with a 1-second gap. This diagnostic does not measure field INP or physical-device performance.",
  target: { cls: 0.1 },
  rows: [],
};
const saveSummary = () => writeFileSync(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));

function allowedRequest(url) {
  const parsed = new URL(url);
  if (["data:", "blob:", "about:"].includes(parsed.protocol)) return true;
  let path;
  try {
    path = decodeURIComponent(parsed.pathname).toLowerCase();
  } catch {
    return false;
  }
  return parsed.origin === base.origin && !/^\/api\/health(?:\/|$)/.test(path);
}

function installProbe() {
  const rect = (value) => ({ x: value.x, y: value.y, width: value.width, height: value.height });
  const nodeInfo = (node) => node instanceof Element ? {
    tag: node.tagName,
    id: node.id || null,
    ke: node.getAttribute("data-ke"),
    classes: typeof node.className === "string" ? node.className : null,
  } : null;
  const shifts = [];
  const phases = [];
  const supported = PerformanceObserver.supportedEntryTypes.includes("layout-shift");
  const geometry = () => {
    const page = document.querySelector('[data-ke="page"]');
    if (!page) return null;
    const style = getComputedStyle(page);
    const after = getComputedStyle(page, "::after");
    const generated = after.content !== "none" && after.content !== "normal" && after.display !== "none";
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const spacerHeight = generated ? parseFloat(after.height) || 0 : 0;
    const pageRect = page.getBoundingClientRect();
    const children = Array.from(page.children).filter((child) => child.getClientRects().length);
    const contentBottom = Math.max(pageRect.top, ...children.map((child) => child.getBoundingClientRect().bottom));
    return {
      page: rect(pageRect),
      body: rect(document.body.getBoundingClientRect()),
      header: document.querySelector("header") ? rect(document.querySelector("header").getBoundingClientRect()) : null,
      contentBottom,
      contentEndGap: pageRect.bottom - contentBottom,
      paddingBottom,
      spacerGenerated: generated,
      spacerHeight,
      endClearance: paddingBottom + spacerHeight,
      parentPaddingBottom: parseFloat(getComputedStyle(page.parentElement).paddingBottom) || 0,
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      channel: document.documentElement.dataset.channel,
      runtime: document.documentElement.dataset.runtime,
      providerClass: page.classList.contains("ke-provider-page"),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  };
  const capture = (entry) => shifts.push({
    time: entry.startTime,
    value: entry.value,
    hadRecentInput: entry.hadRecentInput,
    sources: entry.sources.map((source) => ({
      node: nodeInfo(source.node),
      previous: rect(source.previousRect),
      current: rect(source.currentRect),
    })),
    geometry: geometry(),
  });
  const observer = supported ? new PerformanceObserver((list) => list.getEntries().forEach(capture)) : null;
  observer?.observe({ type: "layout-shift", buffered: true });
  let lastPhase = "";
  const timer = setInterval(() => {
    const phase = {
      skeletons: document.querySelectorAll(".ke-skel").length,
      safeArrival: Boolean(document.querySelector('[data-ke="safe-arrival"]')),
      settled: document.querySelector('[data-ke="daycare-desk"]')?.getAttribute("data-settled") || null,
      geometry: geometry(),
    };
    const next = JSON.stringify(phase);
    if (next !== lastPhase) {
      phases.push({ time: performance.now(), ...phase });
      lastPhase = next;
    }
  }, 50);
  window.__polishProviderCls = {
    finish() {
      clearInterval(timer);
      observer?.takeRecords().forEach(capture);
      observer?.disconnect();
      let windowScore = 0;
      let windowStart = 0;
      let previous = 0;
      let cls = 0;
      for (const entry of shifts.filter((entry) => !entry.hadRecentInput)) {
        if (windowScore && entry.time - previous < 1000 && entry.time - windowStart < 5000) {
          windowScore += entry.value;
        } else {
          windowStart = entry.time;
          windowScore = entry.value;
        }
        previous = entry.time;
        cls = Math.max(cls, windowScore);
      }
      return { supported, cls, shifts, phases, settledGeometry: geometry() };
    },
  };
}

for (const locale of locales) {
  for (let run = 1; run <= runs; run++) {
    const name = `provider-${locale}-${run}`;
    const row = { locale, run };
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath,
        args: ["--disable-background-networking", "--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=127.0.0.1;localhost"],
      });
      const context = await browser.newContext({
        viewport: { width: 412, height: 823 },
        deviceScaleFactor: 1.75,
        isMobile: true,
        userAgent: "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36",
      });
      await context.route("**/*", (route) => allowedRequest(route.request().url()) ? route.continue() : route.abort("blockedbyclient"));
      const seed = await context.request.post(new URL("/api/e2e-seed", base).href, {
        data: { role: "provider", paid: false, ownSlug: "e2e-centre" },
        headers: { origin: base.origin, "content-type": "application/json" },
      });
      if (!seed.ok()) throw new Error(`Local provider fixture failed: HTTP ${seed.status()}`);
      const page = await context.newPage();
      await page.addInitScript(installProbe);
      const started = Date.now();
      const response = await page.goto(new URL(locale === "fr" ? "/fr/provider" : "/provider", base).href, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      row.status = response?.status() || 0;
      await page.locator('[data-ke="daycare-desk"][data-settled="1"]').waitFor({ timeout: 30000 });
      await page.waitForTimeout(Math.max(0, 9000 - (Date.now() - started)));
      const trace = await page.evaluate(() => window.__polishProviderCls.finish());
      row.url = page.url();
      row.cls = trace.cls;
      row.endClearance = trace.settledGeometry?.endClearance;
      row.supported = trace.supported;
      row.ok = row.status === 200 && trace.supported && trace.cls < summary.target.cls && !trace.settledGeometry?.overflow;
      writeFileSync(resolve(out, `${name}.json`), JSON.stringify({ sourceSha, ...row, trace }, null, 2));
      await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: false });
    } catch (error) {
      row.ok = false;
      row.error = String(error?.message || error);
    } finally {
      await browser?.close();
    }
    summary.rows.push(row);
    saveSummary();
    console.log(`[provider-cls] ${name} ${JSON.stringify(row)}`);
  }
}
summary.ok = summary.rows.length === locales.length * runs && summary.rows.every((row) => row.ok);
saveSummary();
if (!summary.ok && !argv.includes("--record-only")) process.exitCode = 1;
