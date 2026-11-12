#!/usr/bin/env node
/** Local-only, non-interactive page audit; never submits product forms. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import {
  POLISH_PAGES,
  POLISH_SCREENSHOT_WIDTHS,
  localAuditUrl,
  polishPath,
  polishProfiles,
} from "./polish-coverage.mjs";

function options(args) {
  const result = {
    base: "http://127.0.0.1:8081",
    out: "artifacts/performance-polish",
    mode: "quick",
    phase: "local",
    locales: "en,fr",
    pages: "core",
    slug: "",
    fixtures: "none",
    scroll: "full",
    chrome: "",
    menu: "yes",
    revision: "",
    workers: "1",
    reuse: "",
    "retry-pages": "",
    "retry-reason": "",
  };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index].replace(/^--/, "");
    if (
      !(key in result) ||
      !args[index].startsWith("--") ||
      !args[index + 1] ||
      args[index + 1].startsWith("--")
    )
      throw new Error(`Unsupported or missing argument: ${args[index]}`);
    result[key] = args[++index];
  }
  result.base = localAuditUrl(result.base);
  result.out = resolve(result.out);
  const inside = relative(process.cwd(), result.out);
  if (!inside || inside.startsWith("..") || isAbsolute(inside))
    throw new Error("Output must be a directory inside this checkout.");
  if (!/^[a-z0-9-]+$/.test(result.phase))
    throw new Error("Use a simple phase label, such as before or after.");
  if (!["none", "local-pglite"].includes(result.fixtures))
    throw new Error("--fixtures must be none or local-pglite.");
  if (result.fixtures === "local-pglite" && process.env.POLISH_FIXTURE_DATABASE !== "local-pglite")
    throw new Error(
      "Verify the server uses a disposable local PGLite database, then set POLISH_FIXTURE_DATABASE=local-pglite explicitly.",
    );
  result.locales = result.locales.split(",");
  if (result.locales.some((locale) => !["en", "fr"].includes(locale)))
    throw new Error("Locales must be en and/or fr.");
  if (!["full", "top"].includes(result.scroll)) throw new Error("--scroll must be full or top.");
  if (!["yes", "no"].includes(result.menu)) throw new Error("--menu must be yes or no.");
  if (result.revision && !/^[a-f0-9]{40}$/.test(result.revision))
    throw new Error("--revision must be a verified full served-source Git SHA.");
  result.workers = Number(result.workers);
  if (!Number.isInteger(result.workers) || result.workers < 1 || result.workers > 3)
    throw new Error("--workers must be 1, 2 or 3.");
  if (result["retry-pages"] && (!result.reuse || !result["retry-reason"]))
    throw new Error(
      "Retry pages require --reuse and an explicit --retry-reason; prior attempts remain linked.",
    );
  return result;
}

/** Runs in the page; records exceptions so exclusions are reviewable. */
export function inspectLayout() {
  const styles = new WeakMap();
  const rects = new WeakMap();
  const styleOf = (el) => {
    if (!styles.has(el)) styles.set(el, getComputedStyle(el));
    return styles.get(el);
  };
  const rectOf = (el) => {
    if (!rects.has(el)) rects.set(el, el.getBoundingClientRect());
    return rects.get(el);
  };
  const issues = [];
  const observations = [];
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const selector =
    "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=checkbox],[role=switch]";
  const activeDialog = Array.from(
    document.querySelectorAll('[role="dialog"][aria-modal="true"]'),
  ).find((el) => rectOf(el).width > 0);
  const name = (el) =>
    (
      el.getAttribute("aria-label") ||
      el.getAttribute("alt") ||
      el.textContent ||
      el.getAttribute("name") ||
      el.tagName
    )
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 100);
  const locator = (el) => {
    if (el.id) return `#${el.id}`;
    if (el.getAttribute("data-ke"))
      return `${el.tagName.toLowerCase()}[data-ke="${el.getAttribute("data-ke")}"]`;
    return `${el.tagName.toLowerCase()}${el.classList.length ? `.${Array.from(el.classList).slice(0, 3).join(".")}` : ""}`;
  };
  const box = (rect) => ({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width * 10) / 10,
    height: Math.round(rect.height * 10) / 10,
  });
  function visuallyHidden(el) {
    const style = styleOf(el);
    return style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)";
  }
  function rendered(el) {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
    const rect = rectOf(el);
    const style = styleOf(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      !visuallyHidden(el) &&
      !el.closest("[hidden],[inert],details:not([open]) > :not(summary)")
    );
  }
  function horizontalScroller(el) {
    for (
      let parent = el.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      const style = styleOf(parent);
      if (
        ["auto", "scroll"].includes(style.overflowX) &&
        parent.scrollWidth > parent.clientWidth + 1
      )
        return parent;
    }
    return null;
  }
  function inViewport(el) {
    const rect = rectOf(el);
    if (rect.right <= 0 || rect.left >= vw || rect.bottom <= 0 || rect.top >= vh) return false;
    const clipped = horizontalScroller(el);
    if (clipped) {
      const clip = rectOf(clipped);
      if (rect.right <= clip.left || rect.left >= clip.right) return false;
    }
    return true;
  }
  const add = (kind, el, extra = {}) =>
    issues.push({
      kind,
      target: locator(el),
      text: name(el),
      rect: box(rectOf(el)),
      ...extra,
    });
  if (document.documentElement.scrollWidth > vw + 1)
    issues.push({
      kind: "document-overflow",
      width: vw,
      scrollWidth: document.documentElement.scrollWidth,
    });

  const controls = Array.from((activeDialog || document).querySelectorAll(selector)).filter(
    (el) => rendered(el) && inViewport(el),
  );
  for (const el of controls) {
    const rect = rectOf(el);
    let target = rect;
    if (el instanceof HTMLInputElement) {
      const labels = Array.from(el.labels || []).filter(rendered);
      const label = labels.find((item) => rectOf(item).width >= 44 && rectOf(item).height >= 44);
      if (label) {
        target = rectOf(label);
        observations.push({
          kind: "associated-label-target",
          target: locator(el),
          label: locator(label),
          rect: box(target),
        });
      }
    }
    if (target.width < 43.5 || target.height < 43.5)
      add("tap-target-under-44", el, { effectiveTarget: box(target) });
    if (!name(el) && !(el instanceof HTMLInputElement && el.labels?.length))
      add("control-name-missing", el);
  }
  for (let i = 0; i < controls.length; i += 1) {
    const a = controls[i];
    const ra = rectOf(a);
    for (let j = i + 1; j < controls.length; j += 1) {
      const b = controls[j];
      if (a.contains(b) || b.contains(a)) {
        add("nested-interactive", a, { other: locator(b) });
        continue;
      }
      const rb = rectOf(b);
      const width = Math.min(ra.right, rb.right, vw) - Math.max(ra.left, rb.left, 0);
      const height = Math.min(ra.bottom, rb.bottom, vh) - Math.max(ra.top, rb.top, 0);
      if (width > 2 && height > 2) {
        const pair = [a, b];
        const save = pair.find((el) => el.getAttribute("data-ke") === "save-listing");
        const input = pair.find((el) => el instanceof HTMLInputElement);
        const other = input === a ? b : a;
        const paddedInputControl =
          input &&
          input.parentElement === other.parentElement &&
          parseFloat(styleOf(input).paddingRight) + 1 >= rectOf(other).width;
        const fixedChrome = pair.find((el) => {
          for (let p = el; p && p !== document.body; p = p.parentElement)
            if (
              styleOf(p).position === "fixed" &&
              (p.tagName === "NAV" || p.getAttribute("role") === "navigation")
            )
              return true;
          return false;
        });
        const railOverlay = pair.some(horizontalScroller);
        if (save || paddedInputControl || fixedChrome || railOverlay)
          observations.push({
            kind: save
              ? "card-save-overlay"
              : paddedInputControl
                ? "padded-input-control"
                : fixedChrome
                  ? "fixed-navigation-overlay"
                  : "scroll-rail-overlay",
            target: locator(a),
            other: locator(b),
            intersection: { width: Math.round(width), height: Math.round(height) },
          });
        else
          add("interactive-overlap", a, {
            other: locator(b),
            otherText: name(b),
            intersection: { width: Math.round(width), height: Math.round(height) },
          });
      }
    }
  }
  for (const el of (activeDialog || document).querySelectorAll(activeDialog ? "*" : "body *")) {
    if (visuallyHidden(el)) {
      observations.push({ kind: "visually-hidden-accessible-text", target: locator(el) });
      continue;
    }
    if (!rendered(el) || !inViewport(el)) continue;
    const rect = rectOf(el);
    const scroller = horizontalScroller(el);
    if (rect.left < -1 || rect.right > vw + 1) {
      if (scroller)
        observations.push({
          kind: "horizontal-scroll-region",
          target: locator(el),
          region: locator(scroller),
        });
      else if (!el.closest("svg") && !["SVG", "PATH"].includes(el.tagName))
        add("element-outside-viewport", el);
    }
    if (
      !(el instanceof HTMLElement) ||
      !el.textContent?.trim() ||
      el.children.length ||
      el.clientWidth === 0
    )
      continue;
    const style = styleOf(el);
    if (el.scrollWidth > el.clientWidth + 1 && ["hidden", "clip"].includes(style.overflowX)) {
      const accessible = el.getAttribute("aria-label") || el.getAttribute("title");
      if (style.textOverflow === "ellipsis" && accessible)
        observations.push({
          kind: "accessible-ellipsis",
          target: locator(el),
          accessibleText: accessible,
        });
      else
        add("text-clipped-horizontal", el, {
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          textOverflow: style.textOverflow,
        });
    }
    if (
      el.scrollHeight > el.clientHeight + 2 &&
      ["hidden", "clip"].includes(style.overflowY) &&
      style.webkitLineClamp === "none"
    )
      add("text-clipped-vertical", el, {
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      });
  }
  for (const image of document.images) {
    if (rendered(image) && inViewport(image) && !image.hasAttribute("alt"))
      add("image-alt-missing", image);
  }
  return {
    issues,
    observations,
    page: {
      width: vw,
      height: vh,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollY: window.scrollY,
      look: document.documentElement.dataset.look || "classic",
      theme: document.documentElement.dataset.resolvedTheme,
      textScale: document.documentElement.dataset.textScale || "md",
    },
  };
}

async function seed(context, base, role) {
  const response = await context.request.post(`${base}/api/e2e-seed`, {
    data: {
      role,
      paid: false,
      ownSlug: role === "provider" ? "e2e-attention-centre" : "",
      activity: true,
      attention: true,
    },
    headers: { origin: base, "content-type": "application/json" },
  });
  if (!response.ok())
    throw new Error(
      `Local fixture seed returned ${response.status()}; authenticated page was not audited.`,
    );
  // Local HTTP needs the same compatibility cookie as the existing WebKit smoke.
  const cookies = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value.split(";")[0])
    .filter((value) => value.includes("session_token="));
  if (cookies[0]) {
    const value = cookies[0].slice(cookies[0].indexOf("=") + 1);
    await context.addCookies([
      {
        name: "kidease.e2e_session",
        value: decodeURIComponent(value),
        url: base,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
  }
}

async function run() {
  const args = options(process.argv.slice(2));
  const profiles = polishProfiles(args.mode);
  const selected =
    args.pages === "all"
      ? POLISH_PAGES
      : args.pages === "core"
        ? POLISH_PAGES.filter((page) => page.tier === "core")
        : args.pages === "public"
          ? POLISH_PAGES.filter((page) => page.tier !== "desk")
          : POLISH_PAGES.filter((page) => args.pages.split(",").includes(page.id));
  if (!selected.length) throw new Error("No matching page IDs.");
  mkdirSync(args.out, { recursive: true });
  let sha = "unavailable";
  try {
    sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    /* provenance stays unavailable */
  }
  const manifest = {
    schemaVersion: 1,
    phase: args.phase,
    commit: args.revision || sha,
    provenance: {
      servedRevision: args.revision || sha,
      servedRevisionSource: args.revision
        ? "explicit independently verified source"
        : "working checkout HEAD; verify server separately",
      harnessRevision: sha,
    },
    startedAt: new Date().toISOString(),
    configuration: { ...args, profiles },
    methodology: {
      engine: "Chromium headless",
      physicalDevice: false,
      externalRequests: "blocked",
      healthRequests: "blocked",
      zoom: "Half CSS viewport reflow approximation, not browser UI zoom",
      overlapScope: "Rendered viewport at each recorded scroll position",
      input:
        "No product form is submitted; optional loopback seed creates only disposable local fixtures",
      animations: "reduced-motion requested",
    },
    pages: POLISH_PAGES.map((page) => ({
      ...page,
      selected: selected.includes(page),
      status: "not-run",
    })),
    results: [],
  };
  const reportPath = resolve(args.out, `${args.phase}-layout.json`);
  let reused = [];
  if (args.reuse) {
    const prior = JSON.parse(readFileSync(resolve(args.reuse), "utf8"));
    if (
      prior.commit !== manifest.commit ||
      prior.phase !== manifest.phase ||
      prior.configuration.base !== args.base
    )
      throw new Error(
        "Reused evidence must have the same verified source revision, phase, and local server origin.",
      );
    reused = prior.results.filter((result) => !["running", "interrupted"].includes(result.status));
    manifest.reusedEvidence = {
      report: resolve(args.reuse),
      cases: reused.length,
      originalMode: prior.configuration.mode,
      originalScroll: prior.configuration.scroll,
      retriedPages: args["retry-pages"].split(",").filter(Boolean),
      retryReason: args["retry-reason"] || null,
    };
  }
  const save = () => writeFileSync(reportPath, `${JSON.stringify(manifest, null, 2)}\n`);
  save();
  const browser = await chromium.launch({
    headless: true,
    ...(args.chrome ? { executablePath: args.chrome } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    for (const pageSpec of selected) {
      const coverage = manifest.pages.find((page) => page.id === pageSpec.id);
      if (pageSpec.safetyBlock) {
        coverage.status = "blocked";
        coverage.reason = pageSpec.safetyBlock;
        save();
        continue;
      }
      if (pageSpec.requiresSlug && !args.slug) {
        coverage.status = "blocked";
        coverage.reason = "No verified local catalog slug supplied.";
        save();
        continue;
      }
      if (pageSpec.role && args.fixtures !== "local-pglite") {
        coverage.status = "blocked";
        coverage.reason = "Disposable local fixture database not explicitly verified.";
        save();
        continue;
      }
      coverage.status = "running";
      let fixtureState;
      if (pageSpec.role) {
        const fixtureContext = await browser.newContext();
        try {
          await seed(fixtureContext, args.base, pageSpec.role);
          fixtureState = await fixtureContext.storageState();
        } catch (error) {
          coverage.status = "blocked";
          coverage.reason = String(error.message || error);
          save();
          continue;
        } finally {
          await fixtureContext.close();
        }
      }
      const cases = args.locales.flatMap((locale) =>
        profiles.map((profile) => ({ locale, profile })),
      );
      let nextCase = 0;
      async function runCase({ locale, profile }) {
        const existing = reused.find(
          (row) => row.page === pageSpec.id && row.locale === locale && row.profile === profile.id,
        );
        if (existing && !args["retry-pages"].split(",").includes(pageSpec.id)) {
          manifest.results.push({ ...existing, reusedFrom: resolve(args.reuse) });
          save();
          return;
        }
        const result = {
          page: pageSpec.id,
          locale,
          profile: profile.id,
          viewport: { width: profile.width, height: profile.height },
          requestedPath: polishPath(pageSpec, locale, args.slug),
          status: "running",
          issues: [],
          observations: [],
          blockedRequests: [],
          consoleErrors: [],
          pageErrors: [],
          ...(existing
            ? {
                priorAttempt: {
                  report: resolve(args.reuse),
                  status: existing.status,
                  reason: existing.reason || null,
                  readiness: existing.readiness,
                  retryReason: args["retry-reason"],
                },
              }
            : {}),
        };
        manifest.results.push(result);
        const context = await browser.newContext({
          viewport: result.viewport,
          colorScheme: profile.theme,
          reducedMotion: "reduce",
          serviceWorkers: "block",
          ...(fixtureState ? { storageState: fixtureState } : {}),
        });
        try {
          await context.routeWebSocket("**", (socket) => {
            result.blockedRequests.push({
              kind: "websocket",
              destination: new URL(socket.url()).origin,
            });
            socket.close();
          });
          await context.route("**/*", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (["data:", "blob:"].includes(url.protocol)) return route.continue();
            let pathname = url.pathname;
            try {
              pathname = decodeURIComponent(pathname).replace(/\/+/g, "/").replace(/\/+$/, "");
            } catch {
              /* invalid escapes stay blocked by the origin check */
            }
            if (url.origin !== args.base || pathname === "/api/health") {
              result.blockedRequests.push({
                kind: pathname === "/api/health" ? "forbidden-health" : "external",
                resourceType: request.resourceType(),
                destination: url.origin === args.base ? url.pathname : url.origin,
              });
              return route.abort("blockedbyclient");
            }
            return route.continue();
          });
          await context.addInitScript(({ theme, textScale }) => {
            localStorage.setItem("kidease-theme", theme);
            localStorage.setItem("kidease-text-scale", textScale);
          }, profile);
          const page = await context.newPage();
          page.on("pageerror", (error) => result.pageErrors.push(error.message));
          page.on("console", (message) => {
            if (message.type() === "error") result.consoleErrors.push(message.text().slice(0, 240));
          });
          const url = new URL(result.requestedPath, args.base);
          url.searchParams.set("look", profile.look);
          const response = await page.goto(url.href, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          const readinessSelector =
            pageSpec.id === "parent"
              ? '[data-ke="parent-home-saved"]'
              : pageSpec.id === "daycare"
                ? '[data-ke="daycare-desk"][data-settled="1"]'
                : pageSpec.id === "admin"
                  ? '[data-ke="admin-queue-filters"]'
                  : ["org", "staff"].includes(pageSpec.id)
                    ? ".ke-dense h2, .ke-dense p.font-display"
                    : "h1";
          result.readiness = { selector: readinessSelector, ready: false };
          const routeUnavailable =
            (response?.status() || 0) >= 400 ||
            new URL(page.url()).pathname !== new URL(result.requestedPath, args.base).pathname;
          try {
            if (routeUnavailable)
              throw new Error("Route unavailable before loaded-page readiness.");
            await page
              .locator(readinessSelector)
              .first()
              .waitFor({ state: "visible", timeout: 20000 });
            await page.waitForFunction(
              () =>
                !Array.from(
                  document.querySelectorAll(
                    '[data-ke="admin-gate-pending"], [data-ke="admin-session-pending"], [aria-label="Starting KidEase"]',
                  ),
                ).some((el) => el.getBoundingClientRect().width > 0),
              undefined,
              { timeout: 10000 },
            );
            result.readiness.ready = true;
          } catch {
            result.readiness.reason = routeUnavailable
              ? `Expected ${new URL(result.requestedPath, args.base).pathname}, received ${response?.status() || 0} ${new URL(page.url()).pathname}.`
              : "Expected loaded route content did not become visible within the readiness budget.";
          }
          await page.waitForTimeout(1000);
          await page.evaluate(() => document.fonts.ready);
          result.httpStatus = response?.status() || 0;
          result.finalPath = new URL(page.url()).pathname;
          result.title = await page.title();
          const body = (await page.locator("body").innerText()).slice(0, 240);
          result.bodyPrefix = body;
          result.headings = await page.locator("h1,h2").allTextContents();
          result.mainText = (
            await page
              .locator('[data-ke="parent-identity"], .ke-dense, main')
              .first()
              .innerText()
              .catch(() => "")
          ).slice(0, 600);
          result.surfaceState =
            pageSpec.gate &&
            /not (?:available|enabled)|turned off|disabled|not yet|bientôt|désactiv|indisponible|pas encore/i.test(
              await page.locator("body").innerText(),
            )
              ? "feature-gated-or-empty; inspect screenshot"
              : pageSpec.role
                ? "local authenticated fixture; inspect screenshot for populated-state coverage"
                : "public";
          const wantedPath = new URL(result.requestedPath, args.base).pathname;
          if (
            result.finalPath !== wantedPath ||
            !result.readiness.ready ||
            result.httpStatus >= 400 ||
            /page not found|page introuvable|KidEase could not finish loading/i.test(body) ||
            (await page.locator('[data-ke="admin-gate-pending"]').count())
          ) {
            result.status = "blocked";
            result.reason = !result.readiness.ready
              ? result.readiness.reason
              : `Expected ${wantedPath}, received ${result.httpStatus} ${result.finalPath}.`;
          } else {
            const seenIssues = new Set();
            const seenObservations = new Set();
            let scrollPosition = 0;
            let scrollSteps = 0;
            do {
              await page.evaluate((y) => window.scrollTo(0, y), scrollPosition);
              await page.waitForTimeout(60);
              const sample = await page.evaluate(inspectLayout);
              result.rendered = sample.page;
              for (const issue of sample.issues) {
                const key = JSON.stringify([issue.kind, issue.target, issue.text, issue.other]);
                if (!seenIssues.has(key)) {
                  seenIssues.add(key);
                  result.issues.push({ ...issue, scrollY: sample.page.scrollY });
                }
              }
              for (const observation of sample.observations) {
                const key = JSON.stringify([
                  observation.kind,
                  observation.target,
                  observation.region,
                ]);
                if (!seenObservations.has(key)) {
                  seenObservations.add(key);
                  result.observations.push(observation);
                }
              }
              scrollSteps += 1;
              scrollPosition += Math.round(profile.height * 0.8);
              if (
                args.scroll === "top" ||
                scrollPosition >= sample.page.scrollHeight ||
                scrollSteps >= 80
              )
                break;
            } while (scrollSteps < 80);
            result.scrollSteps = scrollSteps;
            result.scrollCoverage =
              args.scroll === "top"
                ? "first viewport only"
                : scrollSteps >= 80
                  ? "capped at 80 scroll samples"
                  : "full document with 20% overlapping viewport samples";
            result.status = result.issues.length || result.pageErrors.length ? "failed" : "passed";
          }
          const screenshot =
            args.mode !== "matrix" &&
            (POLISH_SCREENSHOT_WIDTHS.includes(profile.width) ||
              profile.look !== "classic" ||
              profile.theme !== "light");
          if (screenshot) {
            await page.evaluate(() => window.scrollTo(0, 0));
            result.readiness.beforeScreenshot = await page
              .locator(readinessSelector)
              .first()
              .isVisible();
            if (!result.readiness.beforeScreenshot) {
              result.status = "blocked";
              result.reason =
                "Route returned to pending content before screenshot; not counted as loaded coverage.";
            }
            result.screenshot = `${args.phase}-${pageSpec.id}-${locale}-${profile.id}.png`;
            await page.screenshot({
              path: resolve(args.out, result.screenshot),
              fullPage: true,
              animations: "disabled",
            });
          }
        } catch (error) {
          result.status = "error";
          result.reason = String(error.message || error).slice(0, 500);
        } finally {
          await context.close();
          save();
        }
        console.log(
          `${args.phase}: ${pageSpec.id} ${locale} ${profile.id}: ${result.status} (${result.issues.length} issues)`,
        );
      }
      await Promise.all(
        Array.from({ length: Math.min(args.workers, cases.length) }, async () => {
          while (nextCase < cases.length) {
            const current = cases[nextCase++];
            await runCase(current);
          }
        }),
      );
      const rows = manifest.results.filter((row) => row.page === pageSpec.id);
      coverage.status = rows.every((row) => row.status === "passed")
        ? "passed"
        : rows.some((row) => ["failed", "error"].includes(row.status))
          ? "failed"
          : "blocked";
      save();
    }
  } finally {
    await browser.close();
    manifest.finishedAt = new Date().toISOString();
    save();
  }
  const counts = manifest.results.reduce(
    (acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }),
    {},
  );
  console.log(
    JSON.stringify(
      {
        report: reportPath,
        counts,
        blockedPages: manifest.pages
          .filter((page) => page.selected && page.status === "blocked")
          .map((page) => page.id),
      },
      null,
      2,
    ),
  );
  process.exitCode =
    manifest.results.some((row) => ["failed", "error", "blocked"].includes(row.status)) ||
    manifest.pages.some((page) => page.selected && page.status === "blocked")
      ? 1
      : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname))
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
