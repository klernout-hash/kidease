#!/usr/bin/env node
/**
 * Cold, loopback-only Lighthouse measurements. Install the pinned audit tool
 * outside this application: npm install --prefix ../audit-tools lighthouse@13.6.0
 *
 * node scripts/polish-lighthouse.mjs --base http://127.0.0.1:8082 \
 *   --out ../evidence/before/lighthouse --source-sha <built-sha> --runs 3 \
 *   --local-fixtures --pages home,search,listing,login,parent,daycare,admin
 *
 * --local-fixtures asserts that the operator started an isolated PGLite server
 * with a cleared environment and E2E_ROLE_FIXTURE=1. Never use a server with a
 * DATABASE_URL. No payment or account action is exercised by a navigation.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { POLISH_PAGES, polishPath } from "./polish-coverage.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? fallback : argv[i + 1];
};
const base = new URL(value("base", "http://127.0.0.1:8082"));
if (
  base.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(base.hostname) ||
  base.username ||
  base.password
) {
  throw new Error("Only an HTTP loopback audit server is allowed.");
}
const sourceSha = value("source-sha", "");
if (!/^[a-f0-9]{40}$/.test(sourceSha))
  throw new Error("--source-sha must identify the exact built source (40 hexadecimal characters).");
const out = resolve(value("out", "artifacts/performance-polish/lighthouse"));
if (![repo, resolve(repo, ".."), "/tmp"].some((root) => out.startsWith(`${root}/`))) {
  throw new Error("Output must be inside this task workspace or /tmp.");
}
const runCount = Number(value("runs", "3"));
const runOffset = Number(value("run-offset", "0"));
const recoverReports = argv.includes("--recover-reports");
if (!Number.isInteger(runCount) || runCount < 1 || runCount > 9)
  throw new Error("--runs must be between 1 and 9.");
if (!Number.isInteger(runOffset) || runOffset < 0 || runOffset > 99)
  throw new Error("--run-offset must be between 0 and 99.");
const locales = value("locales", "en,fr").split(",");
if (locales.some((locale) => !["en", "fr"].includes(locale)))
  throw new Error("Only en and fr are supported by this audit.");
const toolRoot = resolve(
  process.env.POLISH_AUDIT_TOOLS || resolve(repo, "../audit-tools"),
  "node_modules",
);
const { default: lighthouse } = await import(
  pathToFileURL(resolve(toolRoot, "lighthouse/core/index.js")).href
);
const { launch } = await import(
  pathToFileURL(resolve(toolRoot, "chrome-launcher/dist/index.js")).href
);
const lighthouseVersion = JSON.parse(
  readFileSync(resolve(toolRoot, "lighthouse/package.json"), "utf8"),
).version;
const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const listingSlug = value("listing", "provincial-employee-day-care-portage-1255");
const pages = POLISH_PAGES.filter((page) => ["core", "desk"].includes(page.tier)).map((page) => ({
  ...page,
  limitation: ["org", "staff"].includes(page.id)
    ? "Provider fixture; separate organization/staff membership is not provisioned. This measures the gated provider surface, not a verified organization/staff desk home."
    : page.gate || null,
}));
const selected = value("pages", pages.map((page) => page.id).join(",")).split(",");
if (selected.some((id) => !pages.some((page) => page.id === id)))
  throw new Error("Unknown --pages entry.");
if (
  selected.some((id) => pages.find((page) => page.id === id)?.role) &&
  !argv.includes("--local-fixtures")
) {
  throw new Error(
    "Authenticated navigation requires --local-fixtures and an operator-verified isolated PGLite server.",
  );
}

const throttling = {
  rttMs: 150,
  throughputKbps: 1638.4,
  requestLatencyMs: 562.5,
  downloadThroughputKbps: 1474.56,
  uploadThroughputKbps: 675,
  cpuSlowdownMultiplier: 4,
};
const methodology = {
  sourceSha,
  origin: base.origin,
  lighthouseVersion,
  sampleCountPerRoute: runCount,
  runOffset,
  serverState: value(
    "server-state",
    "Operator-specified preview process; server cache warmness is not inferred by this script.",
  ),
  device:
    "Simulated Moto G Power viewport, 412×823 CSS px, DPR 1.75; desktop Chrome, not a physical phone.",
  network:
    "Lighthouse simulated Slow 4G (150 ms RTT, 1638.4 Kbit/s throughput), CPU slowdown multiplier 4.",
  throttlingMethod: "simulate",
  throttling,
  coldProfilePerNavigation: true,
  externalRequests:
    "Blocked by Chromium proxy and Playwright; public external photos/maps/analytics are unavailable in this local fixture run.",
  healthEndpoint: "Blocked; never requested by audit code.",
  inp: "Unavailable. Lighthouse navigation TBT is recorded separately and is not field INP.",
  javascriptBudget:
    "Sum of gzip level-9 body sizes for each unique same-origin Script URL in Lighthouse network-requests. Measured from the loaded script bodies; not the local server's actual transfer encoding. Inline document scripts are not included.",
  authenticated:
    "Loopback-only synthetic sessions from /api/e2e-seed in an operator-verified isolated PGLite server; no live accounts or charges.",
  intendedContentVerification:
    "Independent same-session navigation after each Lighthouse sample verifies settled headings and redirects. It does not change the captured Lighthouse sample.",
  postprocessing: recoverReports
    ? "Recovered from existing, unaltered Lighthouse JSON; no timing sample rerun."
    : "Same-run Lighthouse capture and postprocessing.",
};
mkdirSync(out, { recursive: true });
const summary = { methodology, createdAt: new Date().toISOString(), rows: [], aggregates: [] };
if (recoverReports && existsSync(resolve(out, "summary.json"))) {
  const previous = JSON.parse(readFileSync(resolve(out, "summary.json"), "utf8"));
  if (previous.methodology?.frenchAdminSupplement) {
    summary.methodology.frenchAdminSupplement = previous.methodology.frenchAdminSupplement;
  }
}
function saveSummary() {
  writeFileSync(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
}
saveSummary();

async function seedFixture(context, role) {
  const response = await context.request.post(new URL("/api/e2e-seed", base).href, {
    data: { role, paid: false, ownSlug: "e2e-centre" },
    headers: { origin: base.origin, "content-type": "application/json" },
  });
  if (!response.ok())
    throw new Error(`Local ${role} fixture unavailable: HTTP ${response.status()}`);
  // The repository's loopback fallback accepts this cookie on plain HTTP.
  // Do not expose a fixture token in reports or console output.
  const cookies = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie");
  const fallback = [];
  for (const { value: header } of cookies) {
    const pair = header.split(";", 1)[0];
    const eq = pair.indexOf("=");
    if (!pair.slice(0, eq).includes("session_token")) continue;
    fallback.push({
      name: "kidease.e2e_session",
      value: pair.slice(eq + 1),
      url: base.origin,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    });
  }
  if (fallback.length) await context.addCookies(fallback);
  const session = await context.request.get(new URL("/api/auth/get-session", base).href);
  const sessionBody = await session.json().catch(() => null);
  if (!session.ok() || !sessionBody?.user?.id)
    throw new Error(`Local ${role} fixture did not establish a verified session.`);
}

function localAsset(url) {
  const parsed = new URL(url, base);
  if (parsed.origin !== base.origin || /^\/api\/health(?:\/|$)/.test(parsed.pathname)) return null;
  return parsed;
}

async function measureScripts(lhr) {
  const network = lhr.audits["network-requests"]?.details?.items || [];
  const scripts = [
    ...new Set(network.filter((item) => item.resourceType === "Script").map((item) => item.url)),
  ];
  const rows = [];
  for (const url of scripts) {
    const asset = localAsset(url);
    if (!asset || !/\.(?:m?js)(?:$|\?)/.test(asset.href)) continue;
    // Re-fetch only static script bodies. Never fetch application API URLs.
    const response = await fetch(asset, { redirect: "error" });
    if (!response.ok)
      throw new Error(
        `Loaded script body could not be read: ${asset.pathname} HTTP ${response.status}`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    rows.push({
      path: asset.pathname + asset.search,
      bytes: bytes.length,
      gzipBytes: gzipSync(bytes, { level: 9 }).length,
    });
  }
  return {
    gzipBytes: rows.reduce((n, row) => n + row.gzipBytes, 0),
    scriptCount: rows.length,
    scripts: rows,
  };
}

for (const definition of pages.filter((page) => selected.includes(page.id))) {
  for (const locale of locales) {
    const path = polishPath(definition, locale, listingSlug);
    const url = new URL(path, base).href;
    for (let run = runOffset + 1; run <= runOffset + runCount; run++) {
      const name = `${definition.id}-${locale}-${run}`;
      let chrome;
      let browser;
      const blocked = new Map();
      const row = {
        id: definition.id,
        locale,
        run,
        requestedUrl: url,
        limitation: definition.limitation || null,
      };
      if (definition.id === "admin" && locale === "fr") {
        row.localeLimitation =
          "French locale requested via /admin?lang=fr; existing admin main content remains English. This verifies the loaded admin surface, not complete French localization.";
      }
      console.log(`[polish-lighthouse] ${name}`);
      try {
        chrome = await launch({
          chromePath,
          chromeFlags: [
            "--headless=new",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-background-networking",
            "--disable-component-update",
            "--no-first-run",
            "--proxy-server=http://127.0.0.1:9",
            "--proxy-bypass-list=127.0.0.1;localhost",
          ],
        });
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
        const context = browser.contexts()[0];
        await context.route("**/*", async (route) => {
          const requestUrl = route.request().url();
          if (/^(?:data|blob|about):/.test(requestUrl)) return route.continue();
          const parsed = localAsset(requestUrl);
          if (parsed) return route.continue();
          const reason =
            new URL(requestUrl).origin === base.origin ? "health" : new URL(requestUrl).origin;
          blocked.set(reason, (blocked.get(reason) || 0) + 1);
          return route.abort("blockedbyclient");
        });
        if (definition.role) {
          await seedFixture(context, definition.role);
          row.fixtureSessionVerified = true;
        }
        const result = recoverReports
          ? { lhr: JSON.parse(readFileSync(resolve(out, `${name}.json`), "utf8")) }
          : await lighthouse(url, {
              port: chrome.port,
              logLevel: "error",
              output: ["json", "html"],
              onlyCategories: ["performance", "accessibility"],
              disableStorageReset: true,
              formFactor: "mobile",
              throttlingMethod: "simulate",
              throttling,
              screenEmulation: {
                mobile: true,
                width: 412,
                height: 823,
                deviceScaleFactor: 1.75,
                disabled: false,
              },
              blockedUrlPatterns: ["*/api/health", "*/api/health?*", "*/api/health/*"],
              maxWaitForLoad: 45000,
            });
        if (!result?.lhr) throw new Error("Lighthouse did not return a navigation report.");
        const { lhr } = result;
        row.documentBodyBytes =
          lhr.audits["document-latency-insight"]?.details?.debugData?.uncompressedResponseBytes ??
          null;
        row.observedServerResponseMs = lhr.audits["server-response-time"]?.numericValue ?? null;
        const mainDocument = result.artifacts?.MainDocumentContent;
        if (typeof mainDocument === "string") {
          row.ssrListingArticleCount = [
            ...mainDocument.matchAll(/<article\b[^>]*\bdata-slug=/g),
          ].length;
        }
        if (result.report) {
          const [json, html] = result.report;
          writeFileSync(resolve(out, `${name}.json`), json);
          writeFileSync(resolve(out, `${name}.html`), html);
        }
        const finalScreenshot = lhr.audits["final-screenshot"]?.details?.data;
        if (typeof finalScreenshot === "string" && finalScreenshot.startsWith("data:image/")) {
          const extension = finalScreenshot.startsWith("data:image/jpeg") ? "jpg" : "png";
          const screenshotName = `${name}-final.${extension}`;
          writeFileSync(
            resolve(out, screenshotName),
            Buffer.from(finalScreenshot.split(",")[1], "base64"),
          );
          row.lighthouseFinalScreenshot = screenshotName;
        }
        // Lighthouse disposes its own target. Probe a fresh page in the same
        // synthetic session instead of reusing a possibly closed page handle.
        const auditedPage = await context.newPage();
        await auditedPage.setViewportSize({ width: 412, height: 823 });
        await auditedPage.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await auditedPage
          .locator("h1")
          .first()
          .waitFor({ state: "attached", timeout: 10000 })
          .catch(() => {});
        const readinessSelector =
          definition.id === "parent"
            ? '[data-ke="parent-home"][data-settled="1"] [data-ke="parent-home-saved"]'
            : ["daycare", "org", "staff"].includes(definition.id)
              ? '[data-ke="daycare-desk"][data-settled="1"]'
              : definition.id === "admin"
                ? '[data-ke="admin-queue-filters"]'
                : null;
        if (readinessSelector) {
          row.readinessSelector = readinessSelector;
          await auditedPage
            .locator(readinessSelector)
            .first()
            .waitFor({ state: "visible", timeout: 30000 })
            .catch(() => {});
          row.mainContentMarkerVisible = await auditedPage
            .locator(readinessSelector)
            .first()
            .isVisible()
            .catch(() => false);
        }
        if (definition.id === "admin") {
          await auditedPage
            .locator('[data-ke="admin-review-loading"]')
            .waitFor({ state: "hidden", timeout: 30000 })
            .catch(() => {});
          row.adminQueueLoading = await auditedPage
            .locator('[data-ke="admin-review-loading"]')
            .isVisible()
            .catch(() => false);
        }
        await auditedPage.waitForTimeout(500);
        {
          const slugs = await auditedPage
            .locator("article[data-slug]")
            .evaluateAll((articles) =>
              articles
                .filter((article) => article.getClientRects().length > 0)
                .map((article) => article.getAttribute("data-slug")),
            );
          row.readinessListingArticleCount = slugs.length;
          row.readinessUniqueListingCount = new Set(slugs).size;
          row.readinessListingSlugs = [...new Set(slugs)];
          const headings = await auditedPage.locator("h1").allTextContents();
          const bodyStart = (await auditedPage.locator("body").innerText())
            .replace(/\s+/g, " ")
            .slice(0, 220);
          row.renderedHeadings = headings.map((heading) => heading.trim()).filter(Boolean);
          row.contentState =
            /not found|could not finish loading|page introuvable|impossible de charger/i.test(
              `${headings.join(" ")} ${bodyStart}`,
            )
              ? "error-or-gate"
              : /^(?:loading|starting|preparing|taking you|chargement|démarrage)/i.test(bodyStart)
                ? "pending"
                : row.renderedHeadings.length
                  ? "heading-rendered"
                  : "no-heading-verification";
          row.intendedSurfaceReady =
            row.contentState === "heading-rendered" &&
            !["org", "staff"].includes(definition.id) &&
            (!readinessSelector || row.mainContentMarkerVisible) &&
            row.adminQueueLoading !== true;
          row.verificationUrl = auditedPage.url();
          row.verificationMatched = new URL(auditedPage.url()).pathname === new URL(url).pathname;
          row.intendedSurfaceReady &&= row.verificationMatched;
        }
        await auditedPage.close();
        const javascript = await measureScripts(lhr);
        const audits = lhr.audits;
        const network = audits["network-requests"]?.details?.items || [];
        const document = network.find((item) => item.resourceType === "Document");
        Object.assign(row, {
          finalUrl: lhr.finalDisplayedUrl || lhr.finalUrl,
          documentStatus: document?.statusCode || null,
          browserUserAgent: lhr.environment?.hostUserAgent || null,
          runtimeError: lhr.runtimeError || null,
          warnings: lhr.runWarnings,
          performanceScore: lhr.categories.performance.score,
          accessibilityScore: lhr.categories.accessibility.score,
          lcpMs: audits["largest-contentful-paint"].numericValue,
          cls: audits["cumulative-layout-shift"].numericValue,
          tbtMs: audits["total-blocking-time"].numericValue,
          fcpMs: audits["first-contentful-paint"].numericValue,
          speedIndexMs: audits["speed-index"].numericValue,
          inpMs: null,
          javascript,
          blockedRequests: Object.fromEntries(blocked),
          report: `${name}.html`,
        });
        row.navigationMatched = new URL(row.finalUrl).pathname === new URL(url).pathname;
        row.navigationMeasured =
          !lhr.runtimeError &&
          row.navigationMatched &&
          (row.documentStatus === null || row.documentStatus < 400);
        row.measured = row.navigationMeasured && row.intendedSurfaceReady === true;
        writeFileSync(resolve(out, `${name}-scripts.json`), JSON.stringify(javascript, null, 2));
      } catch (error) {
        row.measured = false;
        row.error = String(error?.message || error).split("\n")[0];
      } finally {
        await browser?.close().catch(() => {});
        try {
          await chrome?.kill();
        } catch {
          /* Browser disconnect can already have stopped this fresh profile. */
        }
      }
      summary.rows.push(row);
      saveSummary();
      console.log(
        JSON.stringify({
          name,
          measured: row.measured,
          lcpMs: row.lcpMs,
          cls: row.cls,
          tbtMs: row.tbtMs,
          javascriptGzipBytes: row.javascript?.gzipBytes,
          error: row.error,
        }),
      );
    }
  }
}

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};
for (const definition of pages.filter((page) => selected.includes(page.id))) {
  for (const locale of locales) {
    const all = summary.rows.filter((row) => row.id === definition.id && row.locale === locale);
    const measured = all.filter((row) => row.measured);
    summary.aggregates.push({
      id: definition.id,
      locale,
      requestedSamples: runCount,
      measuredSamples: measured.length,
      medianLcpMs: median(measured.map((row) => row.lcpMs)),
      medianCls: median(measured.map((row) => row.cls)),
      medianTbtMs: median(measured.map((row) => row.tbtMs)),
      medianJavascriptGzipBytes: median(measured.map((row) => row.javascript?.gzipBytes)),
      inpMs: null,
      limitation: definition.limitation || null,
    });
  }
}
saveSummary();
if (summary.rows.some((row) => !row.measured)) process.exitCode = 1;
