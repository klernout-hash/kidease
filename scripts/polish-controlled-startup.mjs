#!/usr/bin/env node
/** Controlled iteration-3 startup diagnosis; canonical states and no reseeding. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { POLISH_PAGES, localAuditUrl, polishPath } from "./polish-coverage.mjs";
import { inspectFixtureSurface } from "./polish-fixture-prepare.mjs";
import {
  CONTROLLED_ACCEPT_ENCODING,
  CONTROLLED_DOCUMENT_ACCEPT,
  htmlTransportFacts,
  loadControlledProtocol,
  userAgentsFromVersion,
} from "./polish-controlled-protocol.mjs";

const argv = process.argv.slice(2);
const value = (key, fallback) => {
  const i = argv.indexOf(`--${key}`);
  return i < 0 ? fallback : argv[i + 1];
};
const phase = value("phase", "");
const base = localAuditUrl(
  value("base", phase === "before" ? "http://127.0.0.1:8091" : "http://127.0.0.1:8092"),
);
const out = resolve(value("out", `../evidence/iteration-3/${phase}/startup`));
const sourceSha = value("source-sha", "");
if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("Pass the exact built --source-sha.");
const protocol = loadControlledProtocol({
  manifestFile: value("fixture-manifest", ""),
  phase,
  base,
  sourceSha,
  expectedHtmlEncoding: value("html-encoding", ""),
});
if (argv.includes("--validate-protocol")) {
  console.log(JSON.stringify({ validated: true, protocol: protocol.metadata }));
  process.exit(0);
}
const ids = value("pages", "home,search").split(",");
if (ids.some((id) => !["home", "search", "daycare"].includes(id)))
  throw new Error("Only the approved home, search, and daycare startup cases are supported.");
for (const id of ids) protocol.stateFor(id === "daycare" ? "provider" : "guest");
if (!out.startsWith(resolve(process.cwd(), "..") + "/") && !out.startsWith("/tmp/"))
  throw new Error("Output must remain in this task workspace or /tmp.");
const network = {
  offline: false,
  latency: 562.5,
  downloadThroughput: (1474.56 * 1024) / 8,
  uploadThroughput: (675 * 1024) / 8,
  connectionType: "cellular4g",
};
const report = {
  sourceSha,
  startedAt: new Date().toISOString(),
  methodology: {
    server: base,
    protocol: protocol.metadata,
    collectorFiles: Object.fromEntries(
      [
        "polish-controlled-startup.mjs",
        "polish-controlled-protocol.mjs",
        "polish-coverage.mjs",
        "polish-fixture-prepare.mjs",
        "polish-fixture-control.mjs",
        "polish-fixture-lib.mjs",
        "polish-readiness.mjs",
      ].map((file) => [
        file,
        createHash("sha256")
          .update(readFileSync(new URL(file, import.meta.url)))
          .digest("hex"),
      ]),
    ),
    acceptEncoding: CONTROLLED_ACCEPT_ENCODING,
    transportPolicy:
      "Direct app servers; explicit phase-specific expected HTML encoding. Identity-before/gzip-after is an application code effect, without a QA proxy.",
    viewport: { width: 1280, height: 800 },
    channel: "Desktop website drawer at 1280 CSS px, not a physical phone.",
    cpuSlowdownMultiplier: 4,
    network,
    networkMethod:
      "Applied CDP throttling, not Lighthouse simulation. Adjusted Slow4G latency562.5ms/download1474.56Kbps/upload675Kbps.",
    input:
      "Existing header Menu only; first coordinate click no earlier than DCL+1second. Handler observation continues to absolute navigation+30seconds; first failure is preserved. No form, account or messaging action.",
    firstAttempt:
      "First result is saved before any retry. A separate second activation is diagnostic only and never turns a failed first attempt into a pass.",
    instrumentation:
      "Read-only MutationObserver, PerformanceObserver, DOM polling every100ms and CDP timeline/network trace; overhead is present. Handler attachment is a sampled local marker, not whole-app hydration. These traces are diagnostic, separate from Lighthouse and not field INP.",
    serverWarmup:
      "Exactly one same-URL document GET using the identical actual-derived desktop user-agent and explicit Accept-Encoding as the fresh1280x800 browser navigation. No retry-until-fast.",
    quietWindow:
      "Root declared all other agent tests/builds/browsers stopped until these serial captures close. Lighthouse boundary host observations are retained separately.",
    privacy:
      "Local synthetic fixture only. Trace URLs lose query/hash; headers, cookies, tokens and request payload fields are redacted. No production data.",
    external: "External HTTP/WebSocket and /api/health blocked.",
  },
  results: [],
};
if (existsSync(resolve(out, "summary.json"))) {
  throw new Error(
    "Refusing to overwrite an existing startup phase; choose a new output directory.",
  );
}
mkdirSync(out, { recursive: true });
const save = () => writeFileSync(resolve(out, "summary.json"), JSON.stringify(report, null, 2));
save();

function facts(body) {
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
  };
}
function safeUrl(value) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.origin + u.pathname : value;
  } catch {
    return value;
  }
}
function sanitize(value, key = "") {
  if (/cookie|authorization|password|token|headers|postData|requestBody/i.test(key))
    return "[redacted]";
  if (typeof value === "string") return /url|documentURL/i.test(key) ? safeUrl(value) : value;
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k)]));
  return value;
}

function startupObserver() {
  const data = {
    milestones: {},
    launchHold: [],
    skeletonStates: [],
    longTasks: [],
    events: [],
    lcps: [],
    clicks: [],
    handlerStates: [],
  };
  window.__polishStartup = data;
  let eventObserver;
  const eventRecord = (entry) => ({
    name: entry.name,
    startTime: entry.startTime,
    duration: entry.duration,
    processingStart: entry.processingStart,
    processingEnd: entry.processingEnd,
    interactionId: entry.interactionId,
  });
  const snapshot = () => {
    if (eventObserver) data.events.push(...eventObserver.takeRecords().map(eventRecord));
    return {
      ...data,
      userAgent: navigator.userAgent,
      documentTimeOriginMs: performance.timeOrigin,
      capturedAtMs: performance.now(),
      navigation: performance.getEntriesByType("navigation")[0]?.toJSON(),
      finalUrl: location.origin + location.pathname,
    };
  };
  const emit = (kind, detail = {}, includeSnapshot = false) => {
    const payload = {
      kind,
      atMs: performance.now(),
      absoluteAtMs: performance.timeOrigin + performance.now(),
      timeOriginMs: performance.timeOrigin,
      url: location.origin + location.pathname,
      ...detail,
    };
    if (includeSnapshot) payload.startup = snapshot();
    try {
      Promise.resolve(window.__polishStartupRecord(payload)).catch(() => {});
    } catch {
      /* Context loss remains visible in CDP records. */
    }
  };
  window.__polishStartupSnapshot = snapshot;
  emit("document-start");
  window.addEventListener("pagehide", () => emit("page-hide", {}, true));
  window.addEventListener("beforeunload", () => emit("before-unload", {}, true));
  const mark = (name) => {
    if (data.milestones[name] === undefined) data.milestones[name] = performance.now();
  };
  mark("initScript");
  let lastHold, lastSkeletons, lastHandler, raf;
  const inspect = () => {
    raf = null;
    if (document.querySelector("h1")) mark("firstH1");
    if (document.querySelector("article[data-slug]")) mark("firstListingArticle");
    if (document.querySelector('[data-ke="daycare-desk"][data-settled="1"]'))
      mark("daycareSettled");
    const hold = document.documentElement?.hasAttribute("data-ke-launch-hold") || false;
    if (hold !== lastHold) {
      data.launchHold.push({ at: performance.now(), active: hold });
      lastHold = hold;
    }
    const skeletons = [...document.querySelectorAll(".ke-skel")].filter(
      (element) => element.getClientRects().length > 0,
    ).length;
    if (skeletons !== lastSkeletons) {
      data.skeletonStates.push({ at: performance.now(), visibleCount: skeletons });
      lastSkeletons = skeletons;
    }
    const button = document.querySelector('header [aria-controls="ke-nav-drawer"]');
    if (button) {
      mark("menuButtonPresent");
      const propsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
      const attached = Boolean(propsKey && typeof button[propsKey]?.onClick === "function");
      if (attached !== lastHandler) {
        data.handlerStates.push({ at: performance.now(), onClickAttached: attached });
        emit("handler-state", { onClickAttached: attached }, true);
        lastHandler = attached;
      }
      if (attached) mark("menuOnClickAttached");
    }
    const panel = document.querySelector("#ke-nav-drawer");
    if (
      panel?.getClientRects().length &&
      getComputedStyle(panel).visibility !== "hidden" &&
      data.milestones.drawerFirstVisible === undefined
    ) {
      mark("drawerFirstVisible");
      emit("drawer-ready", {}, true);
    }
    const menu = document.querySelector('main[data-ke="app-menu"]');
    if (menu?.getClientRects().length && data.milestones.nativeMenuReady === undefined) {
      const realLinks = [...menu.querySelectorAll("a[href]")].flatMap((anchor) => {
        const rect = anchor.getBoundingClientRect();
        const href = new URL(anchor.getAttribute("href"), location.href);
        if (
          !rect.width ||
          !rect.height ||
          getComputedStyle(anchor).visibility === "hidden" ||
          href.origin !== location.origin ||
          href.pathname === location.pathname
        )
          return [];
        return [
          {
            path: href.pathname,
            dataKe: anchor.getAttribute("data-ke"),
            textLength: anchor.textContent?.trim().length || 0,
          },
        ];
      });
      if (realLinks.length) {
        mark("nativeMenuReady");
        emit("native-menu-ready", { role: menu.getAttribute("data-role"), realLinks }, true);
      }
    }
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(inspect);
  };
  new MutationObserver(schedule).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-ke-launch-hold", "aria-expanded", "data-settled", "class"],
  });
  document.addEventListener("DOMContentLoaded", () => {
    mark("domContentLoaded");
    inspect();
    emit("dom-content-loaded", {}, true);
  });
  document.addEventListener(
    "click",
    (event) => {
      const element = event.target instanceof Element ? event.target.closest("button,a") : null;
      data.clicks.push({
        at: performance.now(),
        absoluteAtMs: performance.timeOrigin + performance.now(),
        tag: element?.tagName || null,
        ariaControls: element?.getAttribute("aria-controls") || null,
        onClickAttachedAtCapture: Boolean(
          element &&
          Object.keys(element).some(
            (key) => key.startsWith("__reactProps$") && typeof element[key]?.onClick === "function",
          ),
        ),
        href:
          element?.tagName === "A"
            ? new URL(element.getAttribute("href"), location.href).pathname
            : null,
      });
      emit("click", { click: data.clicks.at(-1) }, true);
    },
    true,
  );
  setInterval(inspect, 100);
  try {
    new PerformanceObserver((list) =>
      data.longTasks.push(
        ...list
          .getEntries()
          .map((entry) => ({ startTime: entry.startTime, duration: entry.duration })),
      ),
    ).observe({ type: "longtask", buffered: true });
  } catch {
    /* Unsupported API remains absent. */
  }
  try {
    eventObserver = new PerformanceObserver((list) =>
      data.events.push(...list.getEntries().map(eventRecord)),
    );
    eventObserver.observe({ type: "event", buffered: true, durationThreshold: 16 });
  } catch {
    /* Not field INP. */
  }
  try {
    new PerformanceObserver((list) =>
      data.lcps.push(
        ...list.getEntries().map((entry) => ({
          startTime: entry.startTime,
          renderTime: entry.renderTime,
          size: entry.size,
          tag: entry.element?.tagName || null,
          dataKe: entry.element?.getAttribute("data-ke") || null,
          textLength: entry.element?.textContent?.length || 0,
        })),
      ),
    ).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    /* Unsupported API remains absent. */
  }
}

async function buttonState(page) {
  return page.evaluate(() => {
    const button = document.querySelector('header [aria-controls="ke-nav-drawer"]');
    const panel = document.querySelector("#ke-nav-drawer");
    const rect = button?.getBoundingClientRect();
    const propsKey = button && Object.keys(button).find((key) => key.startsWith("__reactProps$"));
    return {
      at: performance.now(),
      absoluteAtMs: performance.timeOrigin + performance.now(),
      documentTimeOriginMs: performance.timeOrigin,
      documentUrl: location.origin + location.pathname,
      tag: button?.tagName || null,
      href:
        button?.tagName === "A"
          ? new URL(button.getAttribute("href"), location.href).pathname
          : null,
      present: Boolean(button),
      rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      onClickAttached: Boolean(propsKey && typeof button[propsKey]?.onClick === "function"),
      reactPropsAttached: Boolean(propsKey),
      ariaExpanded: button?.getAttribute("aria-expanded") || null,
      panelVisible: Boolean(
        panel?.getClientRects().length && getComputedStyle(panel).visibility !== "hidden",
      ),
      topElementMatchesButton: rect
        ? button.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
          )
        : false,
      launchHold: document.documentElement.hasAttribute("data-ke-launch-hold"),
    };
  });
}

for (const id of ids)
  for (const locale of ["en", "fr"]) {
    const definition = POLISH_PAGES.find((page) => page.id === id);
    const url = base + polishPath(definition, locale, "provincial-employee-day-care-portage-1255");
    const stem = `${id}-${locale}`;
    const row = {
      id,
      locale,
      requestedUrl: url,
      viewport: { width: 1280, height: 800 },
      firstAttemptSucceeded: false,
      blocked: [],
      errors: [],
    };
    row.fixtureValidityAtSampleStart = protocol.assertCurrentValidity();
    report.results.push(row);
    save();
    let browser,
      cdp,
      traceStarted = false;
    try {
      browser = await chromium.launch({
        executablePath: value(
          "chrome",
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-background-networking",
          "--proxy-server=http://127.0.0.1:9",
          "--proxy-bypass-list=127.0.0.1;localhost",
        ],
      });
      const browserCdp = await browser.newBrowserCDPSession();
      const userAgents = userAgentsFromVersion(await browserCdp.send("Browser.getVersion"));
      await browserCdp.detach();
      row.userAgents = userAgents;
      const context = await browser.newContext({
        userAgent: userAgents.desktop,
        extraHTTPHeaders: { "Accept-Encoding": CONTROLLED_ACCEPT_ENCODING },
        storageState: protocol.stateFor(id === "daycare" ? "provider" : "guest"),
        viewport: row.viewport,
        colorScheme: "light",
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      const documents = new Map();
      row.documentEvents = [];
      await context.exposeBinding("__polishStartupRecord", (source, message) => {
        if (source.frame.parentFrame()) return;
        try {
          if (new URL(message.url).origin !== base) return;
        } catch {
          return;
        }
        const key = String(message.timeOriginMs);
        const doc = documents.get(key) || {
          timeOriginMs: message.timeOriginMs,
          url: message.url,
          clicks: [],
        };
        if (message.startup) doc.startup = message.startup;
        if (message.kind === "click") doc.clicks.push(message.click);
        if (message.kind === "drawer-ready") doc.drawerReady = message;
        if (message.kind === "native-menu-ready") doc.nativeMenuReady = message;
        if (message.kind === "page-hide") doc.pageHide = message;
        documents.set(key, doc);
        row.documentEvents.push(message);
      });
      await context.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (["data:", "blob:", "about:"].includes(u.protocol)) return route.continue();
        let guardedPath = u.pathname;
        try {
          guardedPath = decodeURIComponent(guardedPath).replace(/\/+/g, "/").replace(/\/+$/, "");
        } catch {
          /* origin remains checked */
        }
        if (
          u.origin !== base ||
          /^\/api\/(?:health|e2e-seed)(?:\/|$)/i.test(guardedPath) ||
          /^\/(?:fr\/)?status(?:\/|$)/i.test(guardedPath)
        ) {
          row.blocked.push({ origin: u.origin, path: u.origin === base ? u.pathname : null });
          return route.abort("blockedbyclient");
        }
        return route.request().resourceType() === "document"
          ? route.continue({
              headers: { ...route.request().headers(), accept: CONTROLLED_DOCUMENT_ACCEPT },
            })
          : route.continue();
      });
      await context.routeWebSocket("**/*", (socket) => socket.close());
      const warmStarted = Date.now();
      const warm = await context.request.get(url, {
        headers: {
          "user-agent": userAgents.desktop,
          accept: CONTROLLED_DOCUMENT_ACCEPT,
          "accept-encoding": CONTROLLED_ACCEPT_ENCODING,
        },
        maxRedirects: 0,
      });
      const warmBody = await warm.text();
      row.documentWarmup = {
        status: warm.status(),
        durationMs: Date.now() - warmStarted,
        userAgent: userAgents.desktop,
        accept: CONTROLLED_DOCUMENT_ACCEPT,
        acceptEncoding: CONTROLLED_ACCEPT_ENCODING,
        transport: htmlTransportFacts(
          warm.headers(),
          Buffer.byteLength(warmBody),
          protocol.metadata.expectedHtmlEncoding,
        ),
        ...facts(warmBody),
      };
      await context.addInitScript(startupObserver);
      const page = await context.newPage();
      page.on("pageerror", (error) => row.errors.push(error.message));
      cdp = await context.newCDPSession(page);
      await cdp.send("Page.enable");
      const { frameTree } = await cdp.send("Page.getFrameTree");
      const mainFrameId = frameTree.frame.id;
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", network);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const requests = new Map(),
        headerExtras = new Map(),
        reads = [];
      const safeRequestHeaders = (headers) => {
        const normalized = Object.fromEntries(
          Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
        );
        return {
          userAgent: normalized["user-agent"] || null,
          acceptEncoding: normalized["accept-encoding"] || null,
          accept: normalized.accept || null,
        };
      };
      cdp.on("Network.requestWillBeSentExtraInfo", (event) => {
        const headers = safeRequestHeaders(event.headers);
        headerExtras.set(event.requestId, headers);
        const entry = requests.get(event.requestId);
        if (entry?.resourceType === "Document") Object.assign(entry, headers);
      });
      cdp.on("Network.requestWillBeSent", (event) => {
        const u = new URL(event.request.url);
        if (u.origin === base)
          requests.set(event.requestId, {
            path: u.pathname,
            method: event.request.method,
            resourceType: event.type,
            startedAt: event.timestamp,
            wallTimeMs: event.wallTime * 1000,
            isTopFrameDocument: event.type === "Document" && event.frameId === mainFrameId,
            ...(event.type === "Document"
              ? headerExtras.get(event.requestId) || safeRequestHeaders(event.request.headers)
              : {}),
          });
      });
      cdp.on("Network.responseReceived", (event) => {
        const entry = requests.get(event.requestId);
        if (entry)
          Object.assign(entry, {
            status: event.response.status,
            responseAt: event.timestamp,
            responseAbsoluteMs: entry.wallTimeMs + (event.timestamp - entry.startedAt) * 1000,
            encodedHeaderBytes: event.response.encodedDataLength,
            ...(entry.resourceType === "Document"
              ? {
                  safeResponseHeaders: Object.fromEntries(
                    Object.entries(event.response.headers).filter(([key]) =>
                      /^(?:content-encoding|content-length|content-type)$/i.test(key),
                    ),
                  ),
                }
              : {}),
          });
      });
      cdp.on("Network.loadingFinished", (event) => {
        const entry = requests.get(event.requestId);
        if (!entry) return;
        Object.assign(entry, {
          finishedAt: event.timestamp,
          finishedAbsoluteMs: entry.wallTimeMs + (event.timestamp - entry.startedAt) * 1000,
          encodedBytes: event.encodedDataLength,
        });
        if (entry.resourceType === "Document")
          reads.push(
            cdp
              .send("Network.getResponseBody", { requestId: event.requestId })
              .then((response) => {
                const body = response.base64Encoded
                  ? Buffer.from(response.body, "base64").toString("utf8")
                  : response.body;
                entry.document = facts(body);
                entry.transport = htmlTransportFacts(
                  entry.safeResponseHeaders || {},
                  Buffer.byteLength(body),
                  protocol.metadata.expectedHtmlEncoding,
                );
              })
              .catch((error) =>
                row.errors.push(`Document body unavailable: ${error.message.split("\n")[0]}`),
              ),
          );
      });
      await cdp.send("Tracing.start", {
        categories:
          "devtools.timeline,v8.execute,blink.user_timing,loading,disabled-by-default-devtools.timeline",
        transferMode: "ReturnAsStream",
      });
      traceStarted = true;
      row.navigationStartWall = new Date().toISOString();
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      row.status = response?.status() || 0;
      row.domContentLoadedWall = new Date().toISOString();
      row.initialObservedDocumentHeaders = safeRequestHeaders(
        await response.request().allHeaders(),
      );
      row.initialDocumentTimeOriginMs = await page.evaluate(() => performance.timeOrigin);
      row.initialDocumentUrl = url;
      await page.waitForTimeout(1000);
      row.firstAttemptEligibleAfterDclMs = 1000;
      row.handlerObservationDeadlineFromNavigationMs = 30000;
      row.initialDocumentBeforeClick = await page.evaluate(() => window.__polishStartupSnapshot());
      row.initialSurfaceBeforeClick = await page.evaluate(inspectFixtureSurface, { pageId: id });
      row.initialSurfaceBeforeClickHash = createHash("sha256")
        .update(JSON.stringify(row.initialSurfaceBeforeClick))
        .digest("hex");
      if (id === "search") {
        const expected = protocol.expectedSurface("guest", locale);
        row.initialSearchIdentityMatched = Boolean(
          expected &&
          row.initialSurfaceBeforeClick.total === expected.surface.total &&
          JSON.stringify(row.initialSurfaceBeforeClick.orderedCards?.map((card) => card.slug)) ===
            JSON.stringify(expected.surface.orderedCards.map((card) => card.slug)),
        );
        row.initialCanonicalSurfaceMatched =
          row.initialSurfaceBeforeClickHash === expected?.surfaceHash;
      } else {
        row.initialCanonicalSurfaceMatched = null;
      }
      row.originalSurfaceVerification =
        id === "home"
          ? "Home canonical surface unavailable; compare to independent settled home probes and paired phase hash later."
          : row.initialCanonicalSurfaceMatched
            ? "Canonical initial search surface matched."
            : "Diagnostic: initial search surface not canonical; preserve early timing without readiness delay.";
      row.diagnosticOnlyForOriginalContent = row.initialCanonicalSurfaceMatched !== true;
      row.initialContentReadyBeforeClick = Boolean(
        row.initialDocumentBeforeClick.milestones.firstH1 !== undefined &&
        (id === "daycare"
          ? row.initialDocumentBeforeClick.milestones.daycareSettled !== undefined
          : row.initialDocumentBeforeClick.milestones.firstListingArticle !== undefined),
      );
      row.beforeFirstClick = await buttonState(page);
      const initialOrigin = row.initialDocumentTimeOriginMs;
      const initialKey = String(initialOrigin);
      const observationDeadline = initialOrigin + 30000;
      const expectedMenuPath = locale === "fr" ? "/fr/menu" : "/menu";
      const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, Math.max(0, ms)));
      const initialDocument = () => documents.get(initialKey);
      const firstClick = () => initialDocument()?.clicks[0] || null;
      const outcome = (cutoffAbsoluteMs) => {
        const clickEvent = firstClick();
        if (!clickEvent)
          return {
            mode: "none",
            readyAtInitialMs: null,
            reason: "No actual click event was observed in the initial document.",
          };
        const clickAbsoluteMs = clickEvent.absoluteAtMs;
        const candidates = [];
        const drawer = initialDocument()?.drawerReady;
        if (
          drawer &&
          drawer.absoluteAtMs >= clickAbsoluteMs &&
          drawer.absoluteAtMs <= cutoffAbsoluteMs
        ) {
          candidates.push({
            mode: "drawer",
            readyAtInitialMs: drawer.absoluteAtMs - initialOrigin,
            absoluteAtMs: drawer.absoluteAtMs,
            documentUrl: drawer.url,
          });
        }
        for (const document of documents.values()) {
          const native = document.nativeMenuReady;
          if (
            !native ||
            new URL(document.url).pathname !== expectedMenuPath ||
            native.absoluteAtMs < clickAbsoluteMs ||
            native.absoluteAtMs > cutoffAbsoluteMs ||
            !native.realLinks?.length
          )
            continue;
          const request = [...requests.values()].find(
            (entry) =>
              entry.isTopFrameDocument &&
              entry.path === expectedMenuPath &&
              entry.status === 200 &&
              entry.wallTimeMs >= clickAbsoluteMs - 20 &&
              entry.wallTimeMs <= native.absoluteAtMs,
          );
          if (request)
            candidates.push({
              mode: "native-menu",
              readyAtInitialMs: native.absoluteAtMs - initialOrigin,
              absoluteAtMs: native.absoluteAtMs,
              documentUrl: document.url,
              targetDocumentTimeOriginMs: document.timeOriginMs,
              httpStatus: request.status,
              requestStartedAtInitialMs: request.wallTimeMs - initialOrigin,
              realNavigationLinks: native.realLinks,
              reactReadinessProved: false,
              fieldInpMs: null,
            });
        }
        return (
          candidates.sort((x, y) => x.absoluteAtMs - y.absoluteAtMs)[0] || {
            mode: "none",
            readyAtInitialMs: null,
          }
        );
      };
      row.firstAttempt = {
        before: row.beforeFirstClick,
        issuedFromNodeWallMs: Date.now(),
        unavailable: !(row.beforeFirstClick.rect?.width > 0),
      };
      if (!row.firstAttempt.unavailable) {
        const rect = row.beforeFirstClick.rect;
        await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
      }
      await wait(1000);
      row.firstAttempt.observedAtNodeWallMs = Date.now();
      row.firstAttempt.actualClickObserved = Boolean(firstClick());
      row.firstAttempt.outcomeCutoffAbsoluteMs = firstClick()?.absoluteAtMs
        ? firstClick().absoluteAtMs + 1000
        : null;
      row.firstAttempt.outcomeAt1s = outcome(
        row.firstAttempt.outcomeCutoffAbsoluteMs ?? row.firstAttempt.observedAtNodeWallMs,
      );
      row.firstAttempt.mode = row.firstAttempt.outcomeAt1s.mode;
      row.firstAttempt.opened = row.firstAttempt.mode === "drawer";
      row.firstAttemptSucceeded = row.firstAttempt.mode !== "none";
      row.fieldInpMs = null;
      row.firstAttemptRecordedAt = new Date().toISOString();
      save();
      await wait(observationDeadline - Date.now());
      row.originalFirstClickEvent = firstClick();
      row.firstFunctionalOutcomeWithin30Seconds = outcome(observationDeadline);
      row.firstFunctionalActivationWithin30Seconds =
        row.firstFunctionalOutcomeWithin30Seconds.mode !== "none";
      row.firstOutcomeWindowFrozenAt = new Date().toISOString();
      // Preserve the first observation/window before any diagnostic second input.
      save();
      let currentSnapshot = await Promise.race([
        page.evaluate(() => window.__polishStartupSnapshot?.() || null).catch(() => null),
        wait(1000).then(() => null),
      ]);
      if (currentSnapshot) {
        const key = String(currentSnapshot.documentTimeOriginMs);
        const current = documents.get(key) || {
          timeOriginMs: currentSnapshot.documentTimeOriginMs,
          url: currentSnapshot.finalUrl,
          clicks: [],
        };
        current.startup = currentSnapshot;
        documents.set(key, current);
      }
      if (
        !row.firstAttemptSucceeded &&
        !row.firstFunctionalActivationWithin30Seconds &&
        currentSnapshot?.documentTimeOriginMs === initialOrigin
      ) {
        const state = await buttonState(page).catch(() => null);
        row.handlerStateAfterBoundedObservation = state;
        if (state?.onClickAttached && state.rect?.width > 0) {
          row.diagnosticSecondAttempt = { before: state, issuedFromNodeWallMs: Date.now() };
          await page.mouse.click(
            state.rect.x + state.rect.width / 2,
            state.rect.y + state.rect.height / 2,
          );
          await wait(1000);
          const after = await buttonState(page).catch(() => null);
          row.diagnosticSecondAttempt.after = after;
          row.diagnosticSecondAttempt.opened = after?.panelVisible && after.ariaExpanded === "true";
        } else {
          row.diagnosticSecondAttempt = {
            skipped: true,
            reason:
              "No initial-document handler after the absolute30second observation; no repeated clicks until success.",
          };
        }
      } else {
        row.diagnosticSecondAttempt = {
          skipped: true,
          reason:
            "First functional outcome already recorded or initial document replaced; no second input.",
        };
      }
      currentSnapshot = await Promise.race([
        page.evaluate(() => window.__polishStartupSnapshot?.() || null).catch(() => null),
        wait(1000).then(() => null),
      ]);
      if (currentSnapshot && currentSnapshot.documentTimeOriginMs === initialOrigin) {
        const current = initialDocument() || { timeOriginMs: initialOrigin, url, clicks: [] };
        current.startup = currentSnapshot;
        documents.set(initialKey, current);
      }
      row.startup = initialDocument()?.startup || row.initialDocumentBeforeClick;
      row.firstActualClickEvent = row.originalFirstClickEvent;
      row.firstClickAfterDclMs = row.firstActualClickEvent
        ? row.firstActualClickEvent.at - row.startup.navigation.domContentLoadedEventEnd
        : null;
      row.firstClickScheduleMatched =
        row.firstClickAfterDclMs !== null && row.firstClickAfterDclMs >= 1000;
      const attachedAt =
        row.startup.milestones.menuOnClickAttached ??
        row.startup.handlerStates.find((entry) => entry.onClickAttached)?.at ??
        null;
      row.menuHandlerObservedByTraceEnd = attachedAt !== null;
      row.handlerObservedWithin30Seconds = attachedAt !== null && attachedAt <= 30000;
      row.initialHandlerObservation = {
        deadlineFromNavigationMs: 30000,
        observedAttachmentAtMs: attachedAt,
        initialDocumentUnloadedAtMs: initialDocument()?.pageHide
          ? initialDocument().pageHide.absoluteAtMs - initialOrigin
          : null,
        censoredByNativeNavigation: Boolean(
          initialDocument()?.pageHide &&
          initialDocument().pageHide.absoluteAtMs < observationDeadline,
        ),
      };
      const observedFirstSuccess =
        row.firstAttempt.outcomeAt1s.mode !== "none"
          ? row.firstAttempt.outcomeAt1s
          : row.firstFunctionalOutcomeWithin30Seconds;
      row.firstSuccessfulActivationMs =
        observedFirstSuccess.mode !== "none"
          ? observedFirstSuccess.readyAtInitialMs
          : row.diagnosticSecondAttempt.opened
            ? row.diagnosticSecondAttempt.after.absoluteAtMs - initialOrigin
            : null;
      row.firstSuccessfulActivationAttempt =
        observedFirstSuccess.mode !== "none"
          ? "first"
          : row.diagnosticSecondAttempt.opened
            ? "diagnostic-second"
            : null;
      row.firstSuccessfulActivationMode =
        observedFirstSuccess.mode !== "none"
          ? observedFirstSuccess.mode
          : row.diagnosticSecondAttempt.opened
            ? "drawer"
            : "none";
      row.actualNavigationUserAgent = row.startup.userAgent || null;
      row.documents = [...documents.values()];
      row.clockInterpretation =
        "All activation elapsed times use the initial document timeOrigin. Native target documents retain separate timeOrigin/URL and CDP wall/monotonic timestamps. Native200+real SSR nav links proves functionality, not React readiness or field INP. Immutable1second first outcome and30second first-input window precede any diagnostic second click.";
      const completed = new Promise((resolveEvent) =>
        cdp.once("Tracing.tracingComplete", resolveEvent),
      );
      await cdp.send("Tracing.end");
      const finished = await completed;
      traceStarted = false;
      let trace = "";
      for (;;) {
        const chunk = await cdp.send("IO.read", { handle: finished.stream });
        trace += chunk.base64Encoded
          ? Buffer.from(chunk.data, "base64").toString("utf8")
          : chunk.data;
        if (chunk.eof) break;
      }
      await cdp.send("IO.close", { handle: finished.stream });
      row.trace = `${stem}-trace.json`;
      writeFileSync(resolve(out, row.trace), JSON.stringify(sanitize(JSON.parse(trace))));
      if (row.firstSuccessfulActivationMode === "drawer")
        await page.keyboard.press("Escape").catch(() => {});
      row.afterTrace = await Promise.race([
        page
          .evaluate(() => ({
            at: performance.now(),
            absoluteAtMs: performance.timeOrigin + performance.now(),
            timeOriginMs: performance.timeOrigin,
            url: location.origin + location.pathname,
            headings: [...document.querySelectorAll("h1")].map((node) => node.textContent?.trim()),
            visibleSkeletons: [...document.querySelectorAll(".ke-skel")].filter(
              (node) => node.getClientRects().length > 0,
            ).length,
            listingArticles: document.querySelectorAll("article[data-slug]").length,
            nativeMenuVisible: Boolean(
              document.querySelector('main[data-ke="app-menu"]')?.getClientRects().length,
            ),
            launchHold: document.documentElement.hasAttribute("data-ke-launch-hold"),
          }))
          .catch(() => null),
        wait(1000).then(() => null),
      ]);
      row.afterTraceState =
        row.afterTrace?.timeOriginMs === initialOrigin
          ? "original-route"
          : row.afterTrace?.nativeMenuVisible
            ? "native-menu-target"
            : "target-pending-or-unavailable";
      row.settledAfterTrace =
        row.afterTraceState === "original-route"
          ? row.initialContentReadyBeforeClick
          : row.afterTraceState === "native-menu-target";
      if (row.afterTrace) {
        const actualPageId = row.afterTraceState === "native-menu-target" ? "native-menu" : id;
        row.afterTrace.surface = await page
          .evaluate(inspectFixtureSurface, { pageId: actualPageId })
          .catch(() => null);
        row.afterTrace.surfaceHash = row.afterTrace.surface
          ? createHash("sha256").update(JSON.stringify(row.afterTrace.surface)).digest("hex")
          : null;
      }
      row.menuStateAfterContentReadiness = await buttonState(page).catch(() => null);
      row.readinessInterpretation =
        "Initial source-page surface is preserved before input. A native target is separately labelled and never substituted as original content. Native menu HTTP200 plus real SSR nav links proves functional activation, not hydration or INP.";
      await page
        .screenshot({
          path: resolve(out, `${stem}-after-trace-${row.afterTraceState}.png`),
          fullPage: false,
          timeout: 2000,
        })
        .catch(() => {});
      await Promise.allSettled(reads);
      row.network = [...requests.values()].filter(
        (entry) => entry.resourceType === "Document" || entry.path.startsWith("/_serverFn/"),
      );
      const navigationDocument = row.network.find((entry) => entry.resourceType === "Document");
      row.userAgentMatched =
        row.actualNavigationUserAgent === userAgents.desktop &&
        row.initialObservedDocumentHeaders.userAgent === userAgents.desktop;
      if (navigationDocument) Object.assign(navigationDocument, row.initialObservedDocumentHeaders);
      row.acceptEncodingMatched = navigationDocument?.acceptEncoding === CONTROLLED_ACCEPT_ENCODING;
      row.documentAcceptMatched = navigationDocument?.accept === CONTROLLED_DOCUMENT_ACCEPT;
      row.htmlTransportMatched =
        row.documentWarmup.transport.encodingMatched &&
        navigationDocument?.transport?.encodingMatched === true;
      row.protocolMatched =
        row.userAgentMatched &&
        row.acceptEncodingMatched &&
        row.documentAcceptMatched &&
        row.htmlTransportMatched &&
        row.firstClickScheduleMatched;
      row.protocolErrors = [
        !row.userAgentMatched && "Actual desktop UA differs from warmup",
        !row.acceptEncodingMatched && "Actual navigation Accept-Encoding differs from warmup",
        !row.documentAcceptMatched &&
          "Actual document Accept differs from explicit text/html warmup",
        !row.htmlTransportMatched && "HTML content-encoding differs from explicit phase policy",
        !row.firstClickScheduleMatched && "First actual click did not satisfy DCL+1second schedule",
      ].filter(Boolean);
      row.complete =
        row.protocolMatched &&
        row.initialContentReadyBeforeClick &&
        row.status >= 200 &&
        row.status < 400;
    } catch (error) {
      row.complete = false;
      row.error = String(error?.message || error).split("\n")[0];
    } finally {
      if (traceStarted) await cdp?.send("Tracing.end").catch(() => {});
      await browser?.close().catch(() => {});
      save();
    }
    console.log(
      JSON.stringify({
        id,
        locale,
        complete: row.complete,
        firstAttemptSucceeded: row.firstAttemptSucceeded,
        handlerAtFirstClick: row.beforeFirstClick?.onClickAttached,
        settledAfterTrace: row.settledAfterTrace,
        error: row.error,
      }),
    );
  }
report.finishedAt = new Date().toISOString();
save();
if (report.results.some((row) => !row.complete)) process.exitCode = 1;
