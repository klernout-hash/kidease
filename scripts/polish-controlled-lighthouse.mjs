#!/usr/bin/env node
/** Controlled iteration-4 Lighthouse captures; immutable snapshot states, no seeding. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadavg } from "node:os";
import { chromium } from "playwright";
import { modelLcp } from "./polish-lantern-model.mjs";
import { inspectFixtureSurface } from "./polish-fixture-prepare.mjs";
import { CONTROLLED_SEARCH_CASE, SETTLED_SURFACE_CONTRACT, controlledSearchPath, waitForSettledSurface } from "./polish-settled-surface.mjs";
import { POLISH_PAGES, polishPath } from "./polish-coverage.mjs";
import {
  CONTROLLED_ACCEPT_ENCODING,
  CONTROLLED_DOCUMENT_ACCEPT,
  htmlTransportFacts,
  installCapturedState,
  loadControlledProtocol,
  sanitizeArtifact,
  userAgentsFromVersion,
} from "./polish-controlled-protocol.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? fallback : argv[i + 1];
};
const phase = value("phase", "");
const base = new URL(
  value("base", phase === "before" ? "http://127.0.0.1:8091" : "http://127.0.0.1:8092"),
);
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
const protocol = loadControlledProtocol({
  manifestFile: value("fixture-manifest", ""),
  phase,
  base: base.origin,
  sourceSha,
  expectedHtmlEncoding: value("html-encoding", ""),
});
if (argv.includes("--validate-protocol")) {
  console.log(JSON.stringify({ validated: true, protocol: protocol.metadata }));
  process.exit(0);
}
const out = resolve(value("out", `../evidence/iteration-4/${phase}/lighthouse`));
if (![repo, resolve(repo, ".."), "/tmp"].some((root) => out.startsWith(`${root}/`))) {
  throw new Error("Output must be inside this task workspace or /tmp.");
}
const runCount = Number(value("runs", "3"));
const runOffset = Number(value("run-offset", "0"));
if (argv.includes("--recover-reports"))
  throw new Error(
    "Controlled phases are append-free; preserve interrupted captures and choose a new phase directory.",
  );
const captureNavigation = true;
const warmDocument = true;
const quietHost = true;
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
const selected = value("pages", "home,search").split(",");
if (selected.some((id) => !pages.some((page) => page.id === id)))
  throw new Error("Unknown --pages entry.");
for (const id of selected) protocol.stateFor(pages.find((page) => page.id === id)?.role || "guest");

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
  captureNavigation,
  protocol: protocol.metadata,
  collectorFiles: Object.fromEntries(
    [
      "polish-controlled-lighthouse.mjs",
      "polish-controlled-protocol.mjs",
      "polish-lantern-model.mjs",
      "polish-coverage.mjs",
      "polish-fixture-prepare.mjs",
      "polish-fixture-control.mjs",
      "polish-fixture-lib.mjs",
      "polish-readiness.mjs",
      "polish-settled-surface.mjs",
    ].map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(new URL(file, import.meta.url)))
        .digest("hex"),
    ]),
  ),
  documentWarmup:
    "Exactly one same-URL document GET with the same actual-derived mobile user-agent and explicit Accept-Encoding as the Lighthouse navigation. Browser assets/cache are not warmed; no retry-until-fast.",
  documentWarmupUserAgent:
    "Derived from Browser.getVersion per fresh profile; asserted equal to Lighthouse environment.networkUserAgent.",
  acceptEncoding: CONTROLLED_ACCEPT_ENCODING,
  transportPolicy:
    "Direct app servers: expected encoding is phase-specific. Identity-before/gzip-after is an application transport effect; no QA proxy or response rewriting.",
  hostQuietDeclaration: quietHost
    ? "Operator declared that other agent layout workers, tests, builds and automation browsers were stopped for this serial collection. Existing user browsers may remain. Sanitized process observations are recorded at sample boundaries; this is not continuous CPU-isolation proof."
    : "No quiet-host declaration.",
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
    "Captured synthetic role states from the canonical imported PGLite snapshot. No per-navigation seed or standalone auth-session request; no live accounts or charges.",
  intendedContentVerification:
    "Iteration4 independent probe preserves its DCL+500ms observation, then waits at most25seconds for stable geographic labels and strict full canonical surface text. This cannot change the original Lighthouse LCP/TBT. Search uses explicit identical Winnipeg queries and fresh locale profiles; this is a different testcase from iteration3 empty-query captures.",
  settledSurfaceContract: SETTLED_SURFACE_CONTRACT,
  postprocessing:
    "Same-run capture; guestsearch Lantern models recomputed from full raw inputs only after measured browser closes and host.after is captured. Sanitized inputs/models are persisted; no metric timing overlap.",
};
if (existsSync(resolve(out, "summary.json"))) {
  throw new Error(
    "Refusing to overwrite an existing measurement phase; choose a new output directory.",
  );
}
mkdirSync(out, { recursive: true });
const summary = { methodology, createdAt: new Date().toISOString(), rows: [], aggregates: [] };
function saveSummary() {
  writeFileSync(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
}
saveSummary();

function localAsset(url) {
  const parsed = new URL(url, base);
  let guardedPath = parsed.pathname;
  try {
    guardedPath = decodeURIComponent(guardedPath).replace(/\/+/g, "/").replace(/\/+$/, "");
  } catch {
    /* origin remains checked */
  }
  if (
    parsed.origin !== base.origin ||
    /^\/api\/(?:health|e2e-seed)(?:\/|$)/i.test(guardedPath) ||
    /^\/(?:fr\/)?status(?:\/|$)/i.test(guardedPath)
  )
    return null;
  return parsed;
}

function documentFacts(body) {
  const slugs = [...body.matchAll(/<article\b[^>]*\bdata-slug=["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
  return {
    bytes: Buffer.byteLength(body),
    sha256: createHash("sha256").update(body).digest("hex"),
    listingArticleCount: slugs.length,
    uniqueListingCount: new Set(slugs).size,
    listingSlugs: [...new Set(slugs)],
    containsSkeletonMarkup: /\bke-skel\b/.test(body),
    containsParentHome: /data-ke=["']parent-home["']/.test(body),
    containsDaycareHome: /data-ke=["']daycare-desk["']/.test(body),
    containsLaunchHoldReference: /data-ke-launch-hold/.test(body),
    htmlLaunchHoldAttribute: /\bdata-ke-launch-hold(?:\s|=|>)/.test(
      body.match(/<html\b[^>]*>/i)?.[0] || "",
    ),
  };
}

const knownMeasurementPids = new Set([process.pid]);
function hostSnapshot() {
  const snapshot = {
    capturedAt: new Date().toISOString(),
    loadAverage: loadavg(),
    expectedMeasurementPid: process.pid,
  };
  if (!quietHost) return snapshot;
  try {
    let serverPids = [];
    try {
      serverPids = execFileSync("lsof", ["-nP", `-iTCP:${base.port}`, "-sTCP:LISTEN", "-t"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .trim()
        .split(/\s+/)
        .map(Number)
        .filter((pid) => Number.isInteger(pid) && pid > 0);
    } catch {
      /* Preserve absence of listener-PID visibility. */
    }
    snapshot.expectedServerPids = serverPids;
    const text = execFileSync("ps", ["-axo", "pid=,ppid=,pcpu=,comm="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const processes = text
      .split("\n")
      .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/))
      .filter(Boolean)
      .map((match) => ({
        pid: Number(match[1]),
        parentPid: Number(match[2]),
        cpuPercent: Number(match[3]),
        executable: match[4],
      }));
    const expected = new Set([...knownMeasurementPids, ...serverPids]);
    for (let changed = true; changed;) {
      changed = false;
      for (const item of processes)
        if (expected.has(item.parentPid) && !expected.has(item.pid)) {
          expected.add(item.pid);
          changed = true;
        }
    }
    for (const pid of expected) knownMeasurementPids.add(pid);
    const dev = (item) =>
      /(?:^|\/)(?:node|npm|npx|python\d*|vite|esbuild|tsc)(?:$|\s)|Chrome|Safari|firefox|WebKit/i.test(
        item.executable,
      );
    snapshot.developmentAndBrowserProcesses = processes
      .filter(dev)
      .map((item) => ({ ...item, expected: expected.has(item.pid) }));
    snapshot.potentialCompetingDevelopmentProcesses = processes.filter(
      (item) => dev(item) && !expected.has(item.pid) && item.cpuPercent >= 1,
    );
    snapshot.otherCpuPercentSum = processes
      .filter((item) => !expected.has(item.pid) && !dev(item))
      .reduce((sum, item) => sum + item.cpuPercent, 0);
    snapshot.note =
      "Executable names and CPU only; no command-line arguments, environment values, or process payloads are collected. CPU percentages are OS observations, not continuous sampling.";
  } catch (error) {
    snapshot.error = String(error?.message || error).split("\n")[0];
  }
  return snapshot;
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
    const expectedSurface = protocol.expectedSurface(definition.role || "guest", locale);
    if (definition.id === "search" && (expectedSurface?.captureContract !== SETTLED_SURFACE_CONTRACT || expectedSurface.path !== controlledSearchPath(locale) || JSON.stringify(expectedSurface.searchCase) !== JSON.stringify(CONTROLLED_SEARCH_CASE)))
      throw new Error("Iteration4 search requires a fresh locale-isolated geographic fixture proof; do not reuse iteration3 surfaces.");
    const path = definition.id === "search" ? expectedSurface.path : polishPath(definition, locale, listingSlug);
    const url = new URL(path, base).href;
    for (let run = runOffset + 1; run <= runOffset + runCount; run++) {
      const name = `${definition.id}-${locale}-${run}`;
      let chrome;
      let browser;
      let rawModelInputs;
      const blocked = new Map();
      const row = {
        id: definition.id,
        locale,
        run,
        requestedUrl: url,
        limitation: definition.limitation || null,
      };
      row.fixtureValidityAtSampleStart = protocol.assertCurrentValidity();
      const host = { before: hostSnapshot() };
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
        const browserCdp = await browser.newBrowserCDPSession();
        const userAgents = userAgentsFromVersion(await browserCdp.send("Browser.getVersion"));
        await browserCdp.detach();
        row.userAgents = userAgents;
        const mobileUserAgent = userAgents.mobile;
        await installCapturedState(
          context,
          protocol.stateFor(definition.role || "guest"),
          base.origin,
        );
        const observed = { documents: [], requests: [], errors: [] };
        const responseReads = [];
        let gatheringNavigation = false;
        if (captureNavigation)
          context.on("response", (response) => {
            if (!gatheringNavigation) return;
            const request = response.request();
            const parsed = localAsset(response.url());
            if (!parsed) return;
            const kind = request.resourceType();
            if (kind !== "document" && !parsed.pathname.startsWith("/_serverFn/")) return;
            const reading = (async () => {
              const body = await response.body();
              const documentHeaders = kind === "document" ? await request.allHeaders() : null;
              const timing = request.timing();
              const entry = {
                path: parsed.pathname,
                resourceType: kind,
                method: request.method(),
                status: response.status(),
                bytes: body.length,
                timing,
                ...(kind === "document"
                  ? {
                      userAgent: documentHeaders["user-agent"],
                      acceptEncoding: documentHeaders["accept-encoding"],
                      accept: documentHeaders.accept,
                      transport: htmlTransportFacts(
                        response.headers(),
                        body.length,
                        protocol.metadata.expectedHtmlEncoding,
                      ),
                      networkSizes: await request.sizes().catch(() => null),
                    }
                  : {}),
              };
              observed.requests.push(entry);
              if (kind === "document")
                observed.documents.push({ ...entry, ...documentFacts(body.toString("utf8")) });
            })().catch((error) =>
              observed.errors.push({
                path: parsed.pathname,
                resourceType: kind,
                error: String(error?.message || error).split("\n")[0],
              }),
            );
            responseReads.push(reading);
          });
        await context.route("**/*", async (route) => {
          const requestUrl = route.request().url();
          if (/^(?:data|blob|about):/.test(requestUrl)) return route.continue();
          const parsed = localAsset(requestUrl);
          if (parsed)
            return route.request().resourceType() === "document"
              ? route.continue({
                  headers: { ...route.request().headers(), accept: CONTROLLED_DOCUMENT_ACCEPT },
                })
              : route.continue();
          const reason =
            new URL(requestUrl).origin === base.origin
              ? "forbidden-local-endpoint"
              : new URL(requestUrl).origin;
          blocked.set(reason, (blocked.get(reason) || 0) + 1);
          return route.abort("blockedbyclient");
        });
        if (warmDocument) {
          const started = Date.now();
          const response = await context.request.get(url, {
            headers: {
              "user-agent": mobileUserAgent,
              accept: CONTROLLED_DOCUMENT_ACCEPT,
              "accept-encoding": CONTROLLED_ACCEPT_ENCODING,
            },
            maxRedirects: 0,
          });
          const body = await response.text();
          row.documentWarmup = {
            status: response.status(),
            durationMs: Date.now() - started,
            userAgent: mobileUserAgent,
            accept: CONTROLLED_DOCUMENT_ACCEPT,
            acceptEncoding: CONTROLLED_ACCEPT_ENCODING,
            transport: htmlTransportFacts(
              response.headers(),
              Buffer.byteLength(body),
              protocol.metadata.expectedHtmlEncoding,
            ),
            ...documentFacts(body),
          };
        }
        host.beforeNavigation = hostSnapshot();
        gatheringNavigation = true;
        const result = await lighthouse(url, {
          port: chrome.port,
          logLevel: "error",
          output: ["json", "html"],
          onlyCategories: ["performance", "accessibility"],
          disableStorageReset: true,
          formFactor: "mobile",
          emulatedUserAgent: mobileUserAgent,
          extraHeaders: { "Accept-Encoding": CONTROLLED_ACCEPT_ENCODING },
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
        gatheringNavigation = false;
        await Promise.allSettled(responseReads);
        if (!result?.lhr) throw new Error("Lighthouse did not return a navigation report.");
        const { lhr } = result;
        row.actualNavigationUserAgent = lhr.environment?.networkUserAgent || null;
        row.userAgentMatched = row.actualNavigationUserAgent === mobileUserAgent;
        if (definition.id === "search" && result.artifacts) {
          rawModelInputs = { artifacts: result.artifacts, lhr };
        }
        const lcpDetails = lhr.audits["lcp-breakdown-insight"]?.details?.items || [];
        row.lcpCandidate = lcpDetails.find((item) => item.type === "node") || null;
        row.observedLcpBreakdown = lcpDetails.find((item) => item.type === "table")?.items || null;
        row.lcpCandidateSkeletonLike = /ke-skel|skeleton|loading|chargement|starting/i.test(
          `${row.lcpCandidate?.snippet || ""} ${row.lcpCandidate?.nodeLabel || ""}`,
        );
        if (captureNavigation) {
          row.originalNavigation = observed;
          row.searchDaycarePageCalls = observed.requests.filter((item) =>
            item.path.startsWith("/_serverFn/61609873"),
          ).length;
          row.readAiFeatureFlagCalls = observed.requests.filter((item) =>
            item.path.startsWith("/_serverFn/8d52baba"),
          ).length;
          row.ssrDocumentFacts = observed.documents[0] || null;
          if (definition.id === "search") {
            const expected = protocol.expectedSurface("guest", locale)?.surface;
            row.originalSsrCanonicalSearchMatched = Boolean(
              expected &&
              row.ssrDocumentFacts?.listingArticleCount === expected.renderedCards &&
              JSON.stringify(row.ssrDocumentFacts?.listingSlugs) ===
                JSON.stringify(expected.orderedCards.map((card) => card.slug)),
            );
          }
          row.htmlTransportMatched =
            row.documentWarmup?.transport.encodingMatched === true &&
            row.ssrDocumentFacts?.transport?.encodingMatched === true;
          if (row.ssrDocumentFacts)
            row.ssrListingArticleCount = row.ssrDocumentFacts.listingArticleCount;
          writeFileSync(resolve(out, `${name}-navigation.json`), JSON.stringify(observed, null, 2));
        }
        row.lighthouseDocumentResourceBytes =
          lhr.audits["document-latency-insight"]?.details?.debugData?.uncompressedResponseBytes ??
          null;
        row.documentBodyBytes = row.ssrDocumentFacts?.bytes ?? row.lighthouseDocumentResourceBytes;
        row.observedServerResponseMs = lhr.audits["server-response-time"]?.numericValue ?? null;
        const mainDocument = result.artifacts?.MainDocumentContent;
        if (typeof mainDocument === "string" && row.ssrListingArticleCount === undefined) {
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
        const verificationCdp = await context.newCDPSession(auditedPage);
        await verificationCdp.send("Network.setUserAgentOverride", { userAgent: mobileUserAgent });
        await auditedPage.setExtraHTTPHeaders({
          "User-Agent": mobileUserAgent,
          "Accept-Encoding": CONTROLLED_ACCEPT_ENCODING,
        });
        await auditedPage.setViewportSize({ width: 412, height: 823 });
        await auditedPage.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        if (definition.id === "search") {
          row.probeSettling = await waitForSettledSurface(auditedPage, {
            pageId: definition.id,
            inspectSurface: inspectFixtureSurface,
            expectedSurface: expectedSurface.surface,
            geography: expectedSurface.searchCase,
            onInitial: async (initial) => {
              row.probeInitialObservation = initial;
              const filename = `${name}-probe-initial-500ms.png`;
              const screenshotStartedAt = new Date().toISOString();
              const bytes = await auditedPage.screenshot({ path: resolve(out, filename), fullPage: false });
              row.probeInitialScreenshot = { file: filename, sha256: createHash("sha256").update(bytes).digest("hex"), observationElapsedMs: initial.elapsedMs, screenshotStartedAt, screenshotCompletedAt: new Date().toISOString(), interpretation: "First probe after a500ms minimum; screenshot follows the recorded DOM observation. Diagnostic, not the Lighthouse final frame or a settled-content pass." };
            },
          });
        }
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
        if (definition.id !== "search") await auditedPage.waitForTimeout(500);
        row.readinessSurface = await auditedPage.evaluate(inspectFixtureSurface, {
          pageId: definition.id,
        });
        row.readinessSurfaceHash = createHash("sha256")
          .update(JSON.stringify(row.readinessSurface))
          .digest("hex");
        if (["search", "parent", "daycare", "admin"].includes(definition.id)) {
          const expected = protocol.expectedSurface(definition.role || "guest", locale);
          row.expectedReadinessSurfaceHash = expected?.surfaceHash || null;
          row.readinessFullContentParity = Boolean(
            expected && row.readinessSurfaceHash === expected.surfaceHash && row.probeSettling?.settled !== false,
          );
        }
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
          const fullBodyText = (await auditedPage.locator("body").innerText()).replace(/\s+/g, " ");
          const totalMatch = fullBodyText.match(
            /(\d[\d, ]*)\s*(?:licensed centres|centres permis)/i,
          );
          row.readinessVisibleLicensedCentreTotal = totalMatch
            ? Number(totalMatch[1].replace(/\D/g, ""))
            : null;
          const bodyStart = fullBodyText.slice(0, 220);
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
        row.probeScreenshot = `${name}-probe-412x823.png`;
        const probeBytes = await auditedPage.screenshot({
          path: resolve(out, row.probeScreenshot),
          fullPage: false,
        });
        row.probeScreenshotMetadata = {
          viewport: { width: 412, height: 823 },
          fullPage: false,
          independentAfterLighthouse: true,
          sourceSha,
          sha256: createHash("sha256").update(probeBytes).digest("hex"),
          canonicalContentMatched: row.readinessFullContentParity ?? null,
          state:
            row.intendedSurfaceReady && row.readinessFullContentParity !== false
              ? "settled-content-probe"
              : "diagnostic-unavailable",
          interpretation:
            "Independent settled probe; not the original Lighthouse timing frame. Pixel review remains required; never equate different capture geometry/state.",
        };
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
        row.documentHeaderPolicyMatched =
          row.ssrDocumentFacts?.userAgent === mobileUserAgent &&
          row.ssrDocumentFacts?.acceptEncoding === CONTROLLED_ACCEPT_ENCODING &&
          row.ssrDocumentFacts?.accept === CONTROLLED_DOCUMENT_ACCEPT;
        row.protocolMatched =
          row.userAgentMatched === true &&
          row.htmlTransportMatched === true &&
          row.documentHeaderPolicyMatched &&
          row.readinessFullContentParity !== false &&
          row.originalSsrCanonicalSearchMatched !== false;
        row.protocolErrors = [
          !row.userAgentMatched && "Lighthouse mobile user-agent differs from warmup",
          !row.htmlTransportMatched && "HTML content-encoding differs from explicit phase policy",
          !row.documentHeaderPolicyMatched &&
            "Actual document UA/Accept-Encoding header parity is unverified",
          row.readinessFullContentParity === false &&
            "Visible full surface differs from the verified canonical fixture",
          row.originalSsrCanonicalSearchMatched === false &&
            "Original search document does not contain canonical96ordered SSR card slugs",
        ].filter(Boolean);
        row.measured =
          row.navigationMeasured && row.intendedSurfaceReady === true && row.protocolMatched;
        writeFileSync(resolve(out, `${name}-scripts.json`), JSON.stringify(javascript, null, 2));
      } catch (error) {
        row.measured = false;
        row.error = String(error?.message || error).split("\n")[0];
      } finally {
        row.browserCleanupConfirmed = !browser;
        await browser
          ?.close()
          .then(() => {
            row.browserCleanupConfirmed = true;
          })
          .catch(() => {});
        try {
          await chrome?.kill();
          row.browserCleanupConfirmed = true;
        } catch {
          /* Browser disconnect can already have stopped this fresh profile. */
        }
        host.after = hostSnapshot();
        if (quietHost) {
          row.hostObservations = {
            before: host.before,
            beforeNavigation: host.beforeNavigation,
            after: host.after,
          };
          row.hostSnapshotCompetingDevelopmentJobs = [
            host.before,
            host.beforeNavigation,
            host.after,
          ]
            .filter(Boolean)
            .flatMap((snapshot) => snapshot.potentialCompetingDevelopmentProcesses || []);
          row.hostSnapshotVisibilityComplete = [host.before, host.beforeNavigation, host.after]
            .filter(Boolean)
            .every((snapshot) => !snapshot.error);
          writeFileSync(resolve(out, `${name}-host.json`), JSON.stringify(host, null, 2));
        }
      }
      if (rawModelInputs) {
        const startedAt = new Date().toISOString();
        try {
          if (!row.browserCleanupConfirmed)
            throw new Error(
              "Browser cleanup unconfirmed; model computation skipped to avoid measurement overlap.",
            );
          const keys = ["Trace", "DevtoolsLog", "GatherContext", "URL", "SourceMaps", "HostDPR"];
          const input = Object.fromEntries(keys.map((key) => [key, rawModelInputs.artifacts[key]]));
          row.lanternArtifactFile = `${name}-lantern-inputs.json`;
          row.lanternArtifactKeys = Object.keys(input).filter((key) => input[key] !== undefined);
          writeFileSync(
            resolve(out, row.lanternArtifactFile),
            JSON.stringify(sanitizeArtifact(input)),
          );
          const model = await modelLcp(
            rawModelInputs.artifacts,
            rawModelInputs.lhr,
            sourceSha,
            resolve(toolRoot, ".."),
          );
          row.lanternModelFile = `${name}-lantern-model.json`;
          row.lanternModelMatchesReported =
            model.recomputedLcpMatchesLhr && model.recomputedFcpMatchesLhr;
          writeFileSync(resolve(out, row.lanternModelFile), JSON.stringify(model, null, 2));
        } catch (error) {
          row.lanternModelError = String(error?.message || error).split("\n")[0];
        }
        row.lanternModelComputation = {
          startedAt,
          finishedAt: new Date().toISOString(),
          afterBrowserCloseAndHostSnapshot: true,
        };
        rawModelInputs = null;
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
      if (row.protocolMatched === false)
        throw new Error(
          `Controlled protocol mismatch in ${name}; original capture preserved and phase stopped without retry.`,
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
