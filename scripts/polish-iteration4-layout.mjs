#!/usr/bin/env node
/** Exact, non-interactive local visual cohorts; never a performance benchmark. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { inspectLayout } from "./polish-layout.mjs";
import { inspectFixtureSurface } from "./polish-fixture-prepare.mjs";
import { isForbiddenFixturePath } from "./polish-fixture-lib.mjs";
import { localAuditUrl } from "./polish-coverage.mjs";
import { loadControlledProtocol, CONTROLLED_ACCEPT_ENCODING } from "./polish-controlled-protocol.mjs";
import { waitForPolishReadiness } from "./polish-readiness.mjs";
import { controlledSearchPath, waitForSettledSurface } from "./polish-settled-surface.mjs";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ownDirectory = dirname(fileURLToPath(import.meta.url));
const taskRoot = resolve(ownDirectory, "../..");

export function iteration4Profiles() {
  return [{ width: 390, height: 844 }, { width: 1280, height: 800 }].flatMap((viewport) =>
    ["classic", "clean"].flatMap((look) => ["light", "dark"].map((theme) => ({
      ...viewport, look, theme, id: `${viewport.width}-${look}-${theme}`,
    }))),
  );
}

function options(argv) {
  const args = { base: "", phase: "", "source-sha": "", "source-tree": "", "fixture-manifest": "", "html-encoding": "gzip", "baseline-report": "", out: "", chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!argv[i]?.startsWith("--") || !(key in args) || !argv[i + 1] || argv[i + 1].startsWith("--"))
      throw new Error(`Unsupported or missing visual argument: ${argv[i]}`);
    args[key] = argv[i + 1];
  }
  args.base = localAuditUrl(args.base);
  if (!["before", "after"].includes(args.phase) || !/^[a-f0-9]{40}$/.test(args["source-sha"]) || !/^[a-f0-9]{40}$/.test(args["source-tree"]))
    throw new Error("Supply before|after and the independently verified full source SHA/tree.");
  if (process.env.POLISH_FIXTURE_DATABASE !== "local-pglite")
    throw new Error("Verify disposable PGlite and set POLISH_FIXTURE_DATABASE=local-pglite.");
  if (!args.out) throw new Error("Supply a new visual evidence --out directory.");
  args.out = resolve(args.out);
  const within = relative(taskRoot, args.out);
  if (!within || within.startsWith("..") || isAbsolute(within))
    throw new Error("Visual evidence must be a new directory within this task workspace.");
  if (args.phase === "after" && !args["baseline-report"])
    throw new Error("After visuals require the corresponding before report for exact same-case text comparison.");
  return args;
}

function imageFacts() {
  const shown = (image) => {
    const box = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth && style.visibility !== "hidden" && style.display !== "none";
  };
  return [...document.images].filter(shown).map((image) => ({
    alt: image.getAttribute("alt"),
    source: (image.currentSrc || image.src).startsWith("data:") ? "inline image" : new URL(image.currentSrc || image.src, location.href).pathname,
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }));
}

async function waitVisibleImages(page, timeoutMs = 2500) {
  const start = Date.now();
  let images = [];
  do {
    images = await page.evaluate(imageFacts);
    if (images.every((image) => image.complete && image.naturalWidth > 0))
      return { ready: true, images, elapsedMs: Date.now() - start };
    await page.waitForTimeout(100);
  } while (Date.now() - start < timeoutMs);
  return { ready: false, images, elapsedMs: Date.now() - start, reason: "Visible images remain incomplete or broken; screenshots retain that state." };
}

async function guard(context, base, blocked) {
  await context.routeWebSocket("**", (socket) => { blocked.push({ kind: "websocket" }); socket.close(); });
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["data:", "blob:"].includes(url.protocol)) return route.continue();
    if (url.origin !== base || isForbiddenVisualRoute(url.pathname)) {
      blocked.push({ kind: url.origin !== base ? "external" : "forbidden-local-route", resourceType: request.resourceType(), destination: url.origin === base ? url.pathname : url.origin });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
}

export function isForbiddenVisualRoute(pathname) {
  let path = String(pathname).split("?")[0];
  for (let pass = 0; pass < 3; pass++) {
    try { const decoded = decodeURIComponent(path); if (decoded === path) break; path = decoded; }
    catch { break; }
  }
  path = path.replace(/\/+/g, "/").replace(/\/+$/, "");
  return isForbiddenFixturePath(pathname) || /^\/(?:api\/(?:health|e2e-seed)(?:\/|$)|(?:fr\/)?status(?:\/|$))/i.test(path);
}

function surfaceCardIdentityMatches(actual, expected) {
  return Boolean(expected && actual.total === expected.total && actual.renderedCards === expected.renderedCards && JSON.stringify(actual.orderedCards?.map((card) => card.slug)) === JSON.stringify(expected.orderedCards?.map((card) => card.slug)));
}

export async function runIteration4Layout(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === "--help") {
    console.log("node scripts/polish-iteration4-layout.mjs --base LOOPBACK_ORIGIN --phase before|after --source-sha FULL_SHA --source-tree FULL_TREE --fixture-manifest PATH --html-encoding gzip --out NEW_TASK_DIRECTORY [--baseline-report BEFORE_JSON] [--chrome EXECUTABLE]");
    return;
  }
  const args = options(argv);
  const reportFile = resolve(args.out, `${args.phase}-layout.json`);
  if (existsSync(reportFile)) throw new Error("Refusing to overwrite a visual phase; preserve prior evidence.");
  const protocol = loadControlledProtocol({ manifestFile: args["fixture-manifest"], phase: args.phase, base: args.base, sourceSha: args["source-sha"], expectedHtmlEncoding: args["html-encoding"] });
  const baseline = args["baseline-report"] ? JSON.parse(readFileSync(resolve(args["baseline-report"]), "utf8")) : null;
  if (baseline && (baseline.phase !== "before" || baseline.methodology?.contract !== "iteration4-visual-v1" || baseline.fixture?.snapshotSha256 !== protocol.metadata.snapshotSha256))
    throw new Error("Before visual report must use this identical fixture archive and visual contract.");
  mkdirSync(args.out, { recursive: true });
  const report = {
    schemaVersion: 1, phase: args.phase, sourceSha: args["source-sha"], sourceTree: args["source-tree"], startedAt: new Date().toISOString(),
    fixture: protocol.metadata,
    configuration: { base: args.base, chrome: args.chrome, profiles: iteration4Profiles(), pages: ["home", "search"], locales: ["en", "fr"], baselineReport: args["baseline-report"] || null },
    methodology: { contract: "iteration4-visual-v1", physicalDevice: false, performanceMeasurement: false, engine: "Installed desktop Chrome; actual version recorded below", inputs: "No clicks, forms, consent choices, account changes or role seeding. Guest fixture state only.", appearance: "Each case uses an independent context. Theme preference and look query are explicit. Classic default is unchanged.", capture: "Actual 390x844 or1280x800 viewport PNG plus full-page PNG after bounded full-document scrolling. No pixel/state substitution.", scan: "Existing inspectLayout checks each overlapping viewport through the full document, with 80-sample/45second bounds. All actual issues and documented inspector observations are retained.", imageReadiness: "Visible images are checked at each scroll position. Broken or incomplete images fail the case and remain visible in screenshots. Unvisited below-fold images are not called loaded.", search: "Meaningful geographic labels plus96 ordered cards required.390px canonical full text is strict;1280px canonical differences are reported, and after comparison requires exact same-case before full text without normalizing responsive text.", sourceParity: "Official-main PR846 Huawei availability changes are separate from performance work; any observed copy difference remains in the full text comparison.", exclusions: "Only home/search EN/FR, two widths and normal text. No physical device, browser UI zoom, full accessibility certification, authenticated desks or complete original matrix is claimed." },
    results: [],
  };
  const save = () => writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
  save();
  const browser = await chromium.launch({ executablePath: args.chrome, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--no-first-run", "--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=127.0.0.1;localhost"] });
  report.browserVersion = browser.version();
  try {
    for (const pageId of ["home", "search"]) for (const locale of ["en", "fr"]) for (const profile of iteration4Profiles()) {
      protocol.assertCurrentValidity();
      const key = `${pageId}-${locale}-${profile.id}`;
      const expected = protocol.expectedSurface("guest", locale)?.surface;
      const prior = baseline?.results.find((row) => row.key === key);
      const row = { key, pageId, locale, profile, status: "running", issues: [], observations: [], blockedRequests: [], pageErrors: [], consoleErrors: [], screenshots: {} };
      report.results.push(row); save();
      const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1, colorScheme: profile.theme, reducedMotion: "reduce", serviceWorkers: "block", storageState: protocol.stateFor("guest"), extraHTTPHeaders: { "Accept-Encoding": CONTROLLED_ACCEPT_ENCODING } });
      try {
        await guard(context, args.base, row.blockedRequests);
        await context.addInitScript(({ theme }) => { localStorage.setItem("kidease-theme", theme); localStorage.setItem("kidease-text-scale", "md"); }, profile);
        const page = await context.newPage();
        page.on("pageerror", (error) => row.pageErrors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") row.consoleErrors.push(message.text().slice(0, 240)); });
        const path = pageId === "search" ? controlledSearchPath(locale) : locale === "fr" ? "/fr" : "/";
        const url = new URL(path, args.base); url.searchParams.set("look", profile.look);
        row.requestedPath = url.pathname + url.search;
        const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
        row.httpStatus = response?.status() || 0;
        row.finalPath = new URL(page.url()).pathname;
        row.initialSurface = await page.evaluate(inspectFixtureSurface, { pageId });
        row.initialSurfaceHash = hash(row.initialSurface);
        row.headerHandlerAttached = await page.waitForFunction(() => {
          const menu = document.querySelector('header [aria-controls="ke-nav-drawer"]');
          const propsKey = menu && Object.keys(menu).find((key) => key.startsWith("__reactProps$"));
          return Boolean(propsKey && typeof menu[propsKey]?.onClick === "function");
        }, null, { timeout: 30000 }).then(() => true, () => false);
        row.readiness = await waitForPolishReadiness(page, { pageId });
        if (pageId === "search") row.settledSurface = await waitForSettledSurface(page, { pageId, inspectSurface: inspectFixtureSurface, expectedSurface: prior?.surface || (profile.width === 390 ? expected : null) });
        row.fontsReady = await page.evaluate(() => Promise.race([document.fonts.ready.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 5000))]));
        row.surface = await page.evaluate(inspectFixtureSurface, { pageId });
        row.surfaceHash = hash(row.surface);
        if (pageId === "search") {
          row.canonicalFullTextParity = hash(expected) === row.surfaceHash;
          row.canonicalIdentityParity = surfaceCardIdentityMatches(row.surface, expected);
          row.canonicalComparisonNote = profile.width === 390 ? "Canonical fixture viewport matches; full text must match." : "Canonical fixture is390px; responsive full text differences remain explicit. After compares this exact1280px case against before.";
        }
        if (prior) { row.beforeFullTextParity = prior.surfaceHash === row.surfaceHash; row.beforeSurfaceHash = prior.surfaceHash; }
        row.appearance = await page.evaluate(() => ({ look: document.documentElement.dataset.look || "classic", theme: document.documentElement.dataset.resolvedTheme, width: innerWidth, height: innerHeight, rootFontSize: getComputedStyle(document.documentElement).fontSize }));
        const seen = new Set(), seenObservations = new Set();
        row.imageSamples = [];
        let position = 0, sampleCount = 0, completeScan = false;
        const deadline = Date.now() + 45000;
        do {
          await page.evaluate((y) => window.scrollTo(0, y), position);
          await page.waitForTimeout(75);
          row.imageSamples.push({ position, ...await waitVisibleImages(page) });
          const sample = await page.evaluate(inspectLayout);
          for (const issue of sample.issues) { const signature = JSON.stringify([issue.kind, issue.target, issue.text, issue.other]); if (!seen.has(signature)) { seen.add(signature); row.issues.push({ ...issue, scrollY: sample.page.scrollY }); } }
          for (const observation of sample.observations) { const signature = JSON.stringify(observation); if (!seenObservations.has(signature)) { seenObservations.add(signature); row.observations.push(observation); } }
          row.lastScannedGeometry = sample.page;
          sampleCount++;
          if (sample.page.scrollY + profile.height >= sample.page.scrollHeight - 1) { completeScan = true; break; }
          position = Math.min(sample.page.scrollHeight - profile.height, position + Math.round(profile.height * 0.8));
        } while (sampleCount < 80 && Date.now() < deadline);
        row.scrollCoverage = { complete: completeScan, samples: sampleCount, capReached: !completeScan, scope: "Full-document viewport samples if complete; otherwise the unvisited remainder is unverified." };
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
        row.preScreenshotImages = await waitVisibleImages(page);
        row.finalSurface = await page.evaluate(inspectFixtureSurface, { pageId });
        row.surfaceStableDuringScan = hash(row.finalSurface) === row.surfaceHash;
        const appearanceMatched = row.appearance.look === profile.look && row.appearance.theme === profile.theme && row.appearance.width === profile.width && row.appearance.height === profile.height;
        const contentMatched = row.httpStatus === 200 && row.finalPath === url.pathname && row.readiness.ready && row.readiness.healthy && row.headerHandlerAttached && row.surfaceStableDuringScan && (pageId !== "search" || (row.settledSurface?.settled && row.canonicalIdentityParity && (profile.width !== 390 || row.canonicalFullTextParity))) && (!baseline || (prior && row.beforeFullTextParity));
        row.loadedContentVerified = Boolean(contentMatched);
        row.geometryStatus = row.issues.length ? "failed" : "passed";
        row.visualAssetsReady = row.fontsReady && row.imageSamples.every((sample) => sample.ready) && row.preScreenshotImages.ready;
        row.fullPageAssetsVerified = row.visualAssetsReady && completeScan;
        row.status = !contentMatched || !appearanceMatched ? "blocked" : row.issues.length || row.pageErrors.length || !row.visualAssetsReady || !completeScan ? "failed" : "passed";
        const label = row.status === "blocked" ? "blocked-content" : !completeScan ? "incomplete-scan" : !row.visualAssetsReady ? "incomplete-assets" : "loaded";
        row.screenshotState = label;
        for (const [kind, fullPage] of [["viewport", false], ["fullpage", true]]) {
          const name = `${args.phase}-${key}-${label}-${kind}.png`;
          const bytes = await page.screenshot({ path: resolve(args.out, name), fullPage, animations: "disabled" });
          row.screenshots[kind] = { file: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), fullPage, viewport: { width: profile.width, height: profile.height } };
        }
      } catch (error) { row.status = "error"; row.reason = String(error.message || error).slice(0, 500); }
      finally { await context.close(); save(); }
      console.log(`${args.phase} ${key}: ${row.status}, ${row.issues.length} geometry issues`);
    }
  } finally {
    await browser.close(); report.finishedAt = new Date().toISOString();
    report.counts = report.results.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }), {});
    save();
  }
  console.log(JSON.stringify({ report: reportFile, counts: report.counts, cases: report.results.length }));
  process.exitCode = report.results.length !== 32 || report.results.some((row) => row.status !== "passed") ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runIteration4Layout().catch((error) => { console.error(error.message); process.exitCode = 1; });
