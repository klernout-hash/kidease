#!/usr/bin/env node
/** Local-only startup diagnosis, separate from Lighthouse timing samples. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { POLISH_PAGES, localAuditUrl, polishPath } from "./polish-coverage.mjs";

const argv = process.argv.slice(2);
const value = (key, fallback) => {
  const i = argv.indexOf(`--${key}`);
  return i < 0 ? fallback : argv[i + 1];
};
const base = localAuditUrl(value("base", "http://127.0.0.1:8091"));
const out = resolve(value("out", "../evidence/iteration-2/before/startup"));
const sourceSha = value("source-sha", "");
if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("Pass the exact built --source-sha.");
const ids = value("pages", "home,search,daycare").split(",");
if (ids.some((id) => !["home", "search", "daycare"].includes(id)))
  throw new Error("Only the approved home, search, and daycare startup cases are supported.");
if (ids.includes("daycare") && !argv.includes("--local-fixtures"))
  throw new Error("Daycare requires operator-verified local PGLite and --local-fixtures.");
if (!out.startsWith(resolve(process.cwd(), "..") + "/") && !out.startsWith("/tmp/"))
  throw new Error("Output must remain in this task workspace or /tmp.");
const mobileUa =
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36";
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
    viewport: { width: 1280, height: 800 },
    channel: "Desktop website drawer at 1280 CSS px, not a physical phone.",
    cpuSlowdownMultiplier: 4,
    network,
    networkMethod:
      "Applied CDP throttling, not Lighthouse simulation. Adjusted Slow4G latency562.5ms/download1474.56Kbps/upload675Kbps.",
    input:
      "Existing header Menu button only; coordinate click at one second after DOMContentLoaded, with actual timestamps recorded. No form, account or messaging action.",
    firstAttempt:
      "First result is saved before any retry. A separate second activation is diagnostic only and never turns a failed first attempt into a pass.",
    instrumentation:
      "Read-only MutationObserver, PerformanceObserver, DOM polling and CDP timeline/network trace; overhead is present. These traces are diagnostic, separate from Lighthouse and not field INP.",
    serverWarmup:
      "One same-URL fixed mobile Chrome136-UA document GET via the separate API client before the fresh desktop Chrome157 navigation at1280x800. Warmup and navigation UAs differ; this pairing is preserved across phases. No retry until fast.",
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
async function seed(context) {
  const response = await context.request.post(`${base}/api/e2e-seed`, {
    data: { role: "provider", paid: false, ownSlug: "e2e-centre" },
    headers: { origin: base },
  });
  if (!response.ok()) throw new Error(`Local provider fixture HTTP${response.status()}`);
  for (const header of response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")) {
    const pair = header.value.split(";", 1)[0],
      eq = pair.indexOf("=");
    if (pair.slice(0, eq).includes("session_token"))
      await context.addCookies([
        {
          name: "kidease.e2e_session",
          value: pair.slice(eq + 1),
          url: base,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
  }
  const session = await context.request.get(`${base}/api/auth/get-session`);
  if (!(await session.json().catch(() => null))?.user?.id)
    throw new Error("Synthetic fixture session unavailable.");
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
    const button = document.querySelector('header button[aria-controls="ke-nav-drawer"]');
    if (button) {
      mark("menuButtonPresent");
      const propsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
      const attached = Boolean(propsKey && typeof button[propsKey]?.onClick === "function");
      if (attached !== lastHandler) {
        data.handlerStates.push({ at: performance.now(), onClickAttached: attached });
        lastHandler = attached;
      }
      if (attached) mark("menuOnClickAttached");
    }
    const panel = document.querySelector("#ke-nav-drawer");
    if (panel?.getClientRects().length && getComputedStyle(panel).visibility !== "hidden")
      mark("drawerFirstVisible");
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
  });
  document.addEventListener(
    "click",
    (event) => {
      const element = event.target instanceof Element ? event.target.closest("button,a") : null;
      data.clicks.push({
        at: performance.now(),
        tag: element?.tagName || null,
        ariaControls: element?.getAttribute("aria-controls") || null,
      });
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
    new PerformanceObserver((list) =>
      data.events.push(
        ...list.getEntries().map((entry) => ({
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration,
          processingStart: entry.processingStart,
          processingEnd: entry.processingEnd,
          interactionId: entry.interactionId,
        })),
      ),
    ).observe({ type: "event", buffered: true, durationThreshold: 16 });
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
    const button = document.querySelector('header button[aria-controls="ke-nav-drawer"]');
    const panel = document.querySelector("#ke-nav-drawer");
    const rect = button?.getBoundingClientRect();
    const propsKey = button && Object.keys(button).find((key) => key.startsWith("__reactProps$"));
    return {
      at: performance.now(),
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
      const context = await browser.newContext({
        viewport: row.viewport,
        colorScheme: "light",
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      await context.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (["data:", "blob:", "about:"].includes(u.protocol)) return route.continue();
        if (u.origin !== base || /^\/api\/health(?:\/|$)/.test(u.pathname)) {
          row.blocked.push({ origin: u.origin, path: u.origin === base ? u.pathname : null });
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      await context.routeWebSocket("**/*", (socket) => socket.close());
      if (id === "daycare") await seed(context);
      const warmStarted = Date.now();
      const warm = await context.request.get(url, {
        headers: { "user-agent": mobileUa, accept: "text/html" },
        maxRedirects: 0,
      });
      const warmBody = await warm.text();
      row.documentWarmup = {
        status: warm.status(),
        durationMs: Date.now() - warmStarted,
        ...facts(warmBody),
      };
      await context.addInitScript(startupObserver);
      const page = await context.newPage();
      page.on("pageerror", (error) => row.errors.push(error.message));
      cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", network);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const requests = new Map(),
        reads = [];
      cdp.on("Network.requestWillBeSent", (event) => {
        const u = new URL(event.request.url);
        if (u.origin === base)
          requests.set(event.requestId, {
            path: u.pathname,
            method: event.request.method,
            resourceType: event.type,
            startedAt: event.timestamp,
          });
      });
      cdp.on("Network.responseReceived", (event) => {
        const entry = requests.get(event.requestId);
        if (entry)
          Object.assign(entry, {
            status: event.response.status,
            responseAt: event.timestamp,
            encodedHeaderBytes: event.response.encodedDataLength,
          });
      });
      cdp.on("Network.loadingFinished", (event) => {
        const entry = requests.get(event.requestId);
        if (!entry) return;
        Object.assign(entry, {
          finishedAt: event.timestamp,
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
      await page.waitForTimeout(1000);
      row.beforeFirstClick = await buttonState(page);
      if (!row.beforeFirstClick.rect || row.beforeFirstClick.rect.width <= 0)
        throw new Error("Header Menu control unavailable at the scheduled first activation.");
      const click = async () => {
        const before = await buttonState(page);
        const rect = before.rect;
        if (!rect) return { before, unavailable: true };
        await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
        const issued = await buttonState(page);
        await page.waitForTimeout(1000);
        const after = await buttonState(page);
        return {
          before,
          issued,
          after,
          opened: after.panelVisible && after.ariaExpanded === "true",
        };
      };
      row.firstAttempt = await click();
      row.firstAttemptSucceeded = row.firstAttempt.opened;
      row.firstAttemptRecordedAt = new Date().toISOString();
      save();
      await page.screenshot({ path: resolve(out, `${stem}-after-first.png`), fullPage: false });
      if (!row.firstAttemptSucceeded) {
        await page
          .waitForFunction(
            () => {
              const button = document.querySelector('header button[aria-controls="ke-nav-drawer"]');
              const key =
                button && Object.keys(button).find((key) => key.startsWith("__reactProps$"));
              return Boolean(key && typeof button[key]?.onClick === "function");
            },
            undefined,
            { timeout: 10000 },
          )
          .catch(() => {});
        row.diagnosticSecondAttempt = await click();
        await page.screenshot({
          path: resolve(out, `${stem}-after-diagnostic-second.png`),
          fullPage: false,
        });
      }
      await page.waitForTimeout(1000);
      row.startup = await page.evaluate(() => ({
        ...window.__polishStartup,
        navigation: performance.getEntriesByType("navigation")[0]?.toJSON(),
        finalUrl: location.origin + location.pathname,
      }));
      row.menuHandlerObservedByTraceEnd = row.startup.milestones.menuOnClickAttached !== undefined;
      row.firstActualClickEvent = row.startup.clicks[0] || null;
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
      await page.keyboard.press("Escape");
      const selector =
        id === "daycare" ? '[data-ke="daycare-desk"][data-settled="1"]' : "article[data-slug]";
      row.settledSelector = selector;
      row.settledAfterTrace = await page
        .locator(selector)
        .first()
        .waitFor({ state: "visible", timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      row.afterTrace = await page.evaluate(() => ({
        at: performance.now(),
        headings: [...document.querySelectorAll("h1")].map((node) => node.textContent?.trim()),
        visibleSkeletons: [...document.querySelectorAll(".ke-skel")].filter(
          (node) => node.getClientRects().length > 0,
        ).length,
        listingArticles: document.querySelectorAll("article[data-slug]").length,
        launchHold: document.documentElement.hasAttribute("data-ke-launch-hold"),
      }));
      row.menuStateAfterContentReadiness = await buttonState(page);
      row.readinessInterpretation =
        "Settled content is separate from handler attachment and first-activation success; it does not certify whole-application hydration.";
      await page.screenshot({
        path: resolve(out, `${stem}-settled-after-trace.png`),
        fullPage: false,
      });
      await Promise.allSettled(reads);
      row.network = [...requests.values()].filter(
        (entry) => entry.resourceType === "Document" || entry.path.startsWith("/_serverFn/"),
      );
      row.complete = true;
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
