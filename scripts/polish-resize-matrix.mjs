#!/usr/bin/env node
/** Responsive geometry checks reuse a loaded page within each appearance/text cohort. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { inspectLayout } from "./polish-layout.mjs";
import { waitForPolishReadiness } from "./polish-readiness.mjs";
import { POLISH_PAGES, localAuditUrl, polishPath, polishProfiles } from "./polish-coverage.mjs";

const args = {
  base: "http://127.0.0.1:8084",
  revision: "",
  out: "artifacts/performance-polish/after-resize-matrix",
  canonical: "artifacts/performance-polish/after/after-layout.json",
  pages: "home,search,listing,login,parent,daycare,org,staff,admin,government",
  slug: "provincial-employee-day-care-portage-1255",
  chrome: "",
  workers: "3",
};
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index].replace(/^--/, "");
  if (!(key in args) || !process.argv[index + 1])
    throw new Error(`Unsupported or missing argument: ${process.argv[index]}`);
  args[key] = process.argv[index + 1];
}
args.base = localAuditUrl(args.base);
if (!/^[a-f0-9]{40}$/.test(args.revision))
  throw new Error("Supply the verified full served-source --revision.");
if (process.env.POLISH_FIXTURE_DATABASE !== "local-pglite")
  throw new Error(
    "Verify the disposable local PGLite server and set POLISH_FIXTURE_DATABASE=local-pglite.",
  );
args.workers = Number(args.workers);
if (![1, 2, 3].includes(args.workers))
  throw new Error("Use one to three independent cohort workers.");
args.out = resolve(args.out);
if (relative(process.cwd(), args.out).startsWith(".."))
  throw new Error("Output must stay inside this checkout.");
const canonicalPath = resolve(args.canonical);
const canonical = JSON.parse(readFileSync(canonicalPath, "utf8"));
if (canonical.commit !== args.revision || canonical.configuration.base !== args.base)
  throw new Error("Canonical evidence must match the verified source revision and local origin.");
const selected = POLISH_PAGES.filter((page) => args.pages.split(",").includes(page.id));
if (!selected.length) throw new Error("No selected page IDs.");
const profiles = polishProfiles("matrix");
mkdirSync(args.out, { recursive: true });
const reportPath = resolve(args.out, "after-layout.json");
const report = {
  schemaVersion: 1,
  phase: "after",
  commit: args.revision,
  startedAt: new Date().toISOString(),
  configuration: { ...args, mode: "resize-matrix", profiles, scroll: "top" },
  methodology: {
    engine: "Chromium headless",
    physicalDevice: false,
    checkType:
      "Resize of an already loaded page within one locale/appearance/text-scale cohort; not fresh startup performance",
    appearanceCases:
      "Exact matching completed canonical screenshots are reused with their original outcomes and provenance",
    zoom: "Half CSS viewport reflow approximation; not browser UI zoom",
    textScale:
      "Existing --ke-text-scale CSS variable and data-text-scale setting mirrored in the fixture DOM after readiness",
    scroll: "First viewport only; canonical reused rows retain their recorded scope",
    network: "HTTP loopback only; all WebSockets and the decoded health path blocked",
    accountData: "Disposable local fixture only; feature flags unchanged",
  },
  requestedProfileCases: selected.length * profiles.length * 2,
  pages: POLISH_PAGES.map((page) => ({
    ...page,
    selected: selected.includes(page),
    status: "not-run",
  })),
  results: [],
};
const save = () => writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
save();

async function installGuards(context, blocks) {
  await context.routeWebSocket("**", (socket) => {
    blocks.push({ kind: "websocket", destination: new URL(socket.url()).origin });
    socket.close();
  });
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["data:", "blob:"].includes(url.protocol)) return route.continue();
    let path = url.pathname;
    try {
      path = decodeURIComponent(path).replace(/\/+/g, "/").replace(/\/+$/, "");
    } catch {
      /* origin check still applies */
    }
    if (url.origin !== args.base || path === "/api/health") {
      blocks.push({
        kind: path === "/api/health" ? "forbidden-health" : "external",
        destination: url.origin === args.base ? path : url.origin,
        resourceType: request.resourceType(),
      });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
}

async function fixtureState(browser, pageSpec) {
  if (!pageSpec.role) return undefined;
  const context = await browser.newContext();
  try {
    const response = await context.request.post(`${args.base}/api/e2e-seed`, {
      data: {
        role: pageSpec.role,
        paid: false,
        ownSlug: pageSpec.role === "provider" ? "e2e-attention-centre" : "",
        activity: true,
        attention: true,
      },
      headers: { origin: args.base, "content-type": "application/json" },
    });
    if (!response.ok()) throw new Error(`Local fixture seed returned ${response.status()}.`);
    const pair = response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value.split(";")[0])
      .find((value) => value.includes("session_token="));
    if (pair)
      await context.addCookies([
        {
          name: "kidease.e2e_session",
          value: decodeURIComponent(pair.slice(pair.indexOf("=") + 1)),
          url: args.base,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
    return await context.storageState();
  } finally {
    await context.close();
  }
}

async function runCohort(browser, task) {
  const { pageSpec, locale, cohort, state } = task;
  const blocks = [];
  const pageErrors = [];
  const context = await browser.newContext({
    viewport: { width: cohort[0].width, height: cohort[0].height },
    colorScheme: cohort[0].theme,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    ...(state ? { storageState: state } : {}),
  });
  try {
    await installGuards(context, blocks);
    await context.addInitScript(({ theme, textScale }) => {
      localStorage.setItem("kidease-theme", theme);
      localStorage.setItem("kidease-text-scale", textScale);
    }, cohort[0]);
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const requestedPath = polishPath(pageSpec, locale, args.slug);
    const url = new URL(requestedPath, args.base);
    url.searchParams.set("look", cohort[0].look);
    let unavailable = "";
    let response;
    try {
      response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (
        (response?.status() || 0) >= 400 ||
        new URL(page.url()).pathname !== new URL(requestedPath, args.base).pathname
      )
        unavailable = `Expected ${new URL(requestedPath, args.base).pathname}, received ${response?.status() || 0} ${new URL(page.url()).pathname}.`;
      if (!unavailable) {
        const loaded = await waitForPolishReadiness(page, { pageId: pageSpec.id });
        if (!loaded.ready) unavailable = loaded.reason;
      }
    } catch (error) {
      unavailable = String(error.message || error).slice(0, 400);
    }
    for (const profile of cohort) {
      const prior = canonical.results.find(
        (row) => row.page === pageSpec.id && row.locale === locale && row.profile === profile.id,
      );
      const result = {
        page: pageSpec.id,
        locale,
        profile: profile.id,
        viewport: { width: profile.width, height: profile.height },
        requestedPath,
        checkType: "same-session-resize",
        status: "running",
        issues: [],
        observations: [],
        pageErrors: [],
        consoleErrors: [],
        blockedRequests: [],
        scrollCoverage: "first viewport only after resize",
        ...(prior
          ? {
              priorAttempt: {
                report: canonicalPath,
                status: prior.status,
                readiness: prior.readiness,
                reason: prior.reason || null,
              },
            }
          : {}),
      };
      report.results.push(result);
      if (unavailable) {
        result.status = "blocked";
        result.reason = unavailable;
        result.checkType = "unavailable-cohort; no DOM pass claimed";
        result.readiness = { ready: false };
        result.blockedRequests = [...blocks];
        save();
        continue;
      }
      try {
        await page.setViewportSize(result.viewport);
        await page.evaluate(({ textScale }) => {
          const root = document.documentElement;
          root.style.setProperty("--ke-text-scale", textScale === "xl" ? "1.25" : "1");
          root.dataset.textScale = textScale;
          window.scrollTo(0, 0);
        }, profile);
        await page.waitForTimeout(150);
        const content = await waitForPolishReadiness(page, {
          pageId: pageSpec.id,
          timeoutMs: 5000,
          stableMs: 300,
        });
        result.readiness = { ...content, contract: "content-v2" };
        if (!content.ready) {
          result.status = "blocked";
          result.reason = content.reason;
          save();
          continue;
        }
        const sample = await page.evaluate(inspectLayout);
        result.rendered = sample.page;
        result.issues = sample.issues;
        result.observations = sample.observations;
        result.pageErrors = [...pageErrors];
        result.blockedRequests = [...blocks];
        result.httpStatus = response?.status() || 0;
        result.finalPath = new URL(page.url()).pathname;
        result.geometryStatus =
          result.issues.length || result.pageErrors.length ? "failed" : "passed";
        result.status = result.geometryStatus === "passed" && content.healthy ? "passed" : "failed";
        if (!content.healthy)
          result.reason = "Settled error surface; healthy result-data coverage unavailable.";
      } catch (error) {
        result.status = "error";
        result.reason = String(error.message || error).slice(0, 400);
      }
      save();
    }
  } finally {
    await context.close();
  }
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    ...(args.chrome ? { executablePath: args.chrome } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    for (const pageSpec of selected) {
      const coverage = report.pages.find((page) => page.id === pageSpec.id);
      coverage.status = "running";
      let state;
      try {
        state = await fixtureState(browser, pageSpec);
      } catch (error) {
        coverage.status = "blocked";
        coverage.reason = error.message;
        save();
        continue;
      }
      const tasks = [];
      for (const locale of ["en", "fr"]) {
        const groups = new Map();
        for (const profile of profiles) {
          const prior = canonical.results.find(
            (row) =>
              row.page === pageSpec.id && row.locale === locale && row.profile === profile.id,
          );
          if (
            (profile.look !== "classic" || profile.theme !== "light") &&
            prior &&
            (pageSpec.id !== "search" || prior.readiness?.contract === "content-v2") &&
            ["passed", "failed", "blocked"].includes(prior.status)
          ) {
            report.results.push({
              ...prior,
              checkType: "canonical appearance evidence reused",
              reusedFrom: canonicalPath,
              ...(prior.screenshot ? { originalScreenshot: `after/${prior.screenshot}` } : {}),
            });
            continue;
          }
          const key = [profile.look, profile.theme, profile.textScale].join(":");
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(profile);
        }
        for (const cohort of groups.values()) tasks.push({ pageSpec, locale, cohort, state });
      }
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(args.workers, tasks.length) }, async () => {
          while (cursor < tasks.length) await runCohort(browser, tasks[cursor++]);
        }),
      );
      const rows = report.results.filter((row) => row.page === pageSpec.id);
      coverage.status =
        rows.length !== profiles.length * 2
          ? "incomplete"
          : rows.every((row) => row.status === "passed")
            ? "passed"
            : rows.every((row) => row.status === "blocked")
              ? "blocked"
              : "failed";
      save();
      console.log(
        `resize matrix: ${pageSpec.id}: ${rows.length}/${profiles.length * 2} profiles, ${coverage.status}`,
      );
    }
  } finally {
    await browser.close();
    report.finishedAt = new Date().toISOString();
    save();
  }
  const counts = report.results.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    return counts;
  }, {});
  console.log(
    JSON.stringify(
      {
        report: reportPath,
        cases: report.results.length,
        requested: report.requestedProfileCases,
        counts,
      },
      null,
      2,
    ),
  );
  process.exitCode =
    report.results.length !== report.requestedProfileCases ||
    report.results.some((row) => row.status !== "passed")
      ? 1
      : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  run().catch((error) => {
    report.error = error.message;
    save();
    console.error(error.message);
    process.exitCode = 1;
  });
