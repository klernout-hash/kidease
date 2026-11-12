#!/usr/bin/env node
/** Summarize preserved local Lighthouse samples without collecting new data. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || "../evidence");
const json = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const maybeJson = (path) => (existsSync(resolve(root, path)) ? json(path) : null);
const primary = Object.fromEntries(
  ["before", "after"].map((phase) => [phase, json(`${phase}/lighthouse/summary.json`)]),
);
const metrics = [
  "lcpMs",
  "cls",
  "tbtMs",
  "javascriptGzipBytes",
  "documentBodyBytes",
  "observedServerResponseMs",
];
function statistics(values) {
  const finite = values.filter(Number.isFinite);
  const sorted = [...finite].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    samples: sorted.length,
    median: sorted.length
      ? sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2
      : null,
    min: sorted.length ? sorted[0] : null,
    max: sorted.length ? sorted.at(-1) : null,
    values: finite,
  };
}
function samplesFor(phase) {
  const output = [];
  for (const folder of ["lighthouse", "lighthouse-core-replicates"]) {
    const summary = maybeJson(`${phase}/${folder}/summary.json`);
    if (!summary) continue;
    for (const row of summary.rows) {
      const file = `${phase}/${folder}/${row.id}-${row.locale}-${row.run}.json`;
      const raw = maybeJson(file);
      output.push({
        id: row.id,
        locale: row.locale,
        run: row.run,
        measured: row.measured,
        sourceSha: summary.methodology.sourceSha,
        serverState: summary.methodology.serverState,
        lcpMs: row.lcpMs ?? null,
        cls: row.cls ?? null,
        tbtMs: row.tbtMs ?? null,
        javascriptGzipBytes: row.javascript?.gzipBytes ?? null,
        scriptCount: row.javascript?.scriptCount ?? null,
        documentBodyBytes:
          row.documentBodyBytes ??
          raw?.audits["document-latency-insight"]?.details?.debugData?.uncompressedResponseBytes ??
          null,
        observedServerResponseMs:
          row.observedServerResponseMs ?? raw?.audits["server-response-time"]?.numericValue ?? null,
        ssrListingArticleCount: row.ssrListingArticleCount ?? null,
        readinessListingArticleCount: row.readinessListingArticleCount ?? null,
        readinessUniqueListingCount: row.readinessUniqueListingCount ?? null,
        readinessListingSlugs: row.readinessListingSlugs ?? null,
        requestedUrl: row.requestedUrl,
        finalUrl: row.finalUrl,
        intendedSurfaceReady: row.intendedSurfaceReady,
        mainContentMarkerVisible: row.mainContentMarkerVisible ?? null,
        renderedHeadings: row.renderedHeadings,
        finalScreenshotVisualReview: row.finalScreenshotVisualReview ?? null,
        localeLimitation: row.localeLimitation ?? null,
        limitation: row.limitation ?? null,
        error: row.error ?? row.runtimeError ?? null,
        json: file,
        report: `${phase}/${folder}/${row.report || `${row.id}-${row.locale}-${row.run}.html`}`,
        lighthouseFinalScreenshot: row.lighthouseFinalScreenshot
          ? `${phase}/${folder}/${row.lighthouseFinalScreenshot}`
          : null,
      });
    }
  }
  return output;
}
const samples = { before: samplesFor("before"), after: samplesFor("after") };
const core = ["home", "search", "listing", "login"];
const intended = [...core, "parent", "daycare", "admin"];
function summarize(phase, id, locale) {
  const selected = samples[phase].filter(
    (row) => row.id === id && row.locale === locale && row.measured,
  );
  return {
    samples: selected.length,
    expectedSamples: core.includes(id) ? 3 : 1,
    ...Object.fromEntries(
      metrics.map((metric) => [metric, statistics(selected.map((row) => row[metric]))]),
    ),
    inpMs: null,
  };
}
const rows = intended.flatMap((id) =>
  ["en", "fr"].map((locale) => {
    const before = summarize("before", id, locale);
    const after = summarize("after", id, locale);
    const limits = [];
    if (id === "admin" && locale === "fr")
      limits.push(
        "French locale requested through /admin?lang=fr; existing admin main content remains English.",
      );
    if (!core.includes(id))
      limits.push("One timing sample per phase; no stable desk median or range is established.");
    return {
      id,
      locale,
      before,
      after,
      complete:
        before.samples === before.expectedSamples && after.samples === after.expectedSamples,
      delta: Object.fromEntries(
        metrics.map((metric) => [
          metric,
          before[metric].median === null || after[metric].median === null
            ? null
            : after[metric].median - before[metric].median,
        ]),
      ),
      afterTargets: {
        lcp:
          after.lcpMs.median === null
            ? "unavailable"
            : after.lcpMs.median < 2500
              ? "lab-sample-within-target"
              : "failed",
        cls:
          after.cls.median === null
            ? "unavailable"
            : after.cls.median < 0.1
              ? "lab-sample-within-target"
              : "failed",
        javascript:
          after.javascriptGzipBytes.median === null
            ? "unavailable"
            : after.javascriptGzipBytes.median >= 200000
              ? "failed-even-with-inline-scripts-excluded"
              : "unverified-inline-scripts-excluded",
        inp: "unavailable-no-field-data",
      },
      limitations: limits,
    };
  }),
);
const gateIds = ["org", "staff", "government"];
const gates = gateIds.flatMap((id) =>
  ["en", "fr"].map((locale) => ({
    id,
    locale,
    before: samples.before.find((row) => row.id === id && row.locale === locale),
    after: samples.after.find((row) => row.id === id && row.locale === locale),
    reason:
      id === "government"
        ? "Existing government access/visibility gate redirects this fixture to the public home page."
        : "Provider fixture reaches the shared daycare surface; a distinct organization/staff membership and populated desk are not provisioned.",
    countedAsPassed: false,
  })),
);
const providerStatic = maybeJson("provider-static-dependencies.json");
const providerLoaded = maybeJson("provider-loaded-script-comparison.json");
const contentComparisons = core.flatMap((id) =>
  ["en", "fr"].map((locale) => {
    const before = samples.before.filter(
      (row) => row.id === id && row.locale === locale && row.run > 1,
    );
    const after = samples.after.filter(
      (row) => row.id === id && row.locale === locale && row.run > 1,
    );
    const sets = [...before, ...after]
      .filter((row) => Array.isArray(row.readinessListingSlugs))
      .map((row) => JSON.stringify([...row.readinessListingSlugs].sort()));
    return {
      id,
      locale,
      beforeWarmListingCounts: before.map((row) => row.readinessUniqueListingCount),
      afterWarmListingCounts: after.map((row) => row.readinessUniqueListingCount),
      sameListingSlugSetsAcrossWarmProbes: sets.length === 4 ? new Set(sets).size === 1 : null,
      interpretation:
        "Independent readiness content checks, not an assertion about SSR completeness in the original timing frame.",
    };
  }),
);
const targetFailures = {
  measuredRouteLocaleRows: rows.filter((row) => row.after.samples > 0).length,
  lcp: rows.filter((row) => row.afterTargets.lcp === "failed").length,
  cls: rows.filter((row) => row.afterTargets.cls === "failed").length,
  javascript: rows.filter((row) => row.afterTargets.javascript.startsWith("failed")).length,
  inp: "Unavailable for every row; no field data.",
};
const comparison = {
  complete: rows.every((row) => row.complete),
  completionScope:
    "Expected timing samples for available core, parent, daycare, and admin surfaces only. This does not mean all product routes, gated desks, or performance targets passed.",
  fullDeskCoverageComplete: false,
  performanceTargetsMet: false,
  methodology: {
    beforeSourceSha: primary.before.methodology.sourceSha,
    afterSourceSha: primary.after.methodology.sourceSha,
    lighthouseVersion: primary.after.methodology.lighthouseVersion,
    device: primary.after.methodology.device,
    network: primary.after.methodology.network,
    throttling: primary.after.methodology.throttling,
    profile:
      "Cold Chrome profile for every navigation. The first full matrix started with a fresh dedicated server; the two core replicates use the same warmed local PGLite process. These mixed server states are retained in the ranges and per-sample metadata.",
    coreSampleCountPerPhase: 3,
    deskSampleCountPerPhase: 1,
    hostContention:
      "Before and after used dedicated preview servers and separate local database processes, but layout workers and Node checks ran concurrently on the same shared Mac during timing collection. These are exploratory simulated lab readings under host contention, not a causally isolated benchmark, a physical-device test, or field INP. The observed EN search regression is retained and cannot be attributed to unchanged search query logic without an isolated rerun.",
    externalRequests: primary.after.methodology.externalRequests,
    healthEndpoint: primary.after.methodology.healthEndpoint,
    javascriptBudget: primary.after.methodology.javascriptBudget,
    inp: "Unavailable. TBT is navigation lab data, not INP; no field INP claim is made.",
    readiness:
      "Timing samples retain raw Lighthouse JSON/HTML/final screenshots. Independent same-session checks verify settled desk content; parent/daycare/admin final screenshots in both languages were also visually inspected. These checks do not establish full accessibility or production behavior.",
    targets: {
      lcpMs: 2500,
      cls: 0.1,
      inpMs: 200,
      javascriptGzipBytes: 200000,
      comparison: "Strictly less than each threshold.",
    },
  },
  rows,
  gates,
  samples,
  contentComparisons,
  targetFailures,
  providerLoadedScripts: providerLoaded,
  providerStaticDependencies: providerStatic
    ? providerStatic.map(
        ({ phase, entry, staticModuleCount, staticRawBytes, staticGzipBytes }) => ({
          phase,
          entry,
          staticModuleCount,
          staticRawBytes,
          staticGzipBytes,
        }),
      )
    : null,
  observedMedianRegressions: rows
    .filter((row) => row.delta.lcpMs > 0)
    .map(({ id, locale, delta }) => ({
      id,
      locale,
      lcpMs: delta.lcpMs,
      interpretation:
        "Observed lab median difference; these small sample sets do not establish statistical significance.",
    })),
};
writeFileSync(resolve(root, "comparison.json"), JSON.stringify(comparison, null, 2));

const fmt = (number, digits = 3) =>
  number === null || number === undefined
    ? "unavailable"
    : Number(number.toFixed(digits)).toString();
const pair = (row, metric, digits = 3) =>
  `${fmt(row.before[metric].median, digits)} → ${fmt(row.after[metric].median, digits)}`;
const range = (stats) => `${fmt(stats.min)}–${fmt(stats.max)}`;
const md = [
  "# Local performance comparison",
  "",
  `Built source: before \`${comparison.methodology.beforeSourceSha}\`; after \`${comparison.methodology.afterSourceSha}\`.`,
  "",
  `${comparison.methodology.device} ${comparison.methodology.network} Lighthouse ${comparison.methodology.lighthouseVersion}. External browser services and health are blocked. These are lab results, not physical-phone or field measurements.`,
  "",
  comparison.methodology.profile,
  "",
  comparison.methodology.hostContention,
  "",
  "Core routes have three samples per phase; parent/daycare/admin have one. All raw samples, including regressions and the initial cold-server result, remain in comparison.json and the linked Lighthouse reports. INP is unavailable; TBT is shown separately.",
  "",
  "| Page | Locale | Samples before / after | LCP ms before → after | LCP range before / after | CLS before → after | TBT ms before → after | Script gzip bytes before → after |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.id} | ${row.locale}${row.id === "admin" && row.locale === "fr" ? " (English main copy)" : ""} | ${row.before.samples} / ${row.after.samples} | ${pair(row, "lcpMs")} | ${range(row.before.lcpMs)} / ${range(row.after.lcpMs)} | ${pair(row, "cls", 6)} | ${pair(row, "tbtMs")} | ${pair(row, "javascriptGzipBytes", 0)} |`,
  ),
  "",
  `The script figure sums unique loaded same-origin script bodies compressed individually with gzip level 9. Inline document scripts are excluded, so it is a lower bound for the full JavaScript budget. ${targetFailures.javascript} of ${targetFailures.measuredRouteLocaleRows} measured route/locale rows exceed 200,000 bytes; ${targetFailures.lcp} exceed the LCP target and ${targetFailures.cls} exceed the CLS target. LCP target failures and median regressions remain visible; no overall target-compliance claim is made.`,
  "",
  "## Unavailable desk coverage",
  "",
  ...gates.map((gate) => `- ${gate.id} ${gate.locale}: ${gate.reason} Not counted as passed.`),
  "",
  "French admin uses /admin?lang=fr; its existing main copy is English. The original /fr/admin 404 diagnostic is preserved under before/lighthouse/initial-run-diagnostics.",
  "",
  "## Provider script graph",
  "",
  providerLoaded
    ? `The first EN provider navigation loaded ${providerLoaded.beforeGzipBytes} → ${providerLoaded.afterGzipBytes} gzip bytes (${providerLoaded.deltaGzipBytes}; ${fmt(providerLoaded.percentChange, 2)}%). This is a loaded-script comparison, not a claim that product features or dependencies were deleted. Full added/removed/changed chunk details are in provider-loaded-script-comparison.json.`
    : "Loaded-script comparison unavailable.",
  "",
  providerStatic
    ? `Static provider dependency graph: ${providerStatic.find((row) => row.phase === "before")?.staticGzipBytes} → ${providerStatic.find((row) => row.phase === "after")?.staticGzipBytes} gzip bytes; ${providerStatic.find((row) => row.phase === "before")?.staticModuleCount} → ${providerStatic.find((row) => row.phase === "after")?.staticModuleCount} statically reachable modules. The direct route entry can grow while heavy panes move behind dynamic imports. The static graph and actual first navigation are separate measurements.`
    : "Static dependency graph unavailable.",
  "",
  "## Document and content checks",
  "",
  "| Page / locale | Before document bytes by sample | After document bytes by sample | Before SSR listing articles | After SSR listing articles |",
  "| --- | --- | --- | --- | --- |",
  ...rows
    .filter((row) => core.includes(row.id))
    .map((row) => {
      const before = samples.before.filter(
        (sample) => sample.id === row.id && sample.locale === row.locale,
      );
      const after = samples.after.filter(
        (sample) => sample.id === row.id && sample.locale === row.locale,
      );
      const values = (items, key) =>
        items.map((sample) => (sample[key] === null ? "unavailable" : sample[key])).join(", ");
      return `| ${row.id} / ${row.locale} | ${values(before, "documentBodyBytes")} | ${values(after, "documentBodyBytes")} | ${values(before, "ssrListingArticleCount")} | ${values(after, "ssrListingArticleCount")} |`;
    }),
  "",
  "Document size can change when the server returns an initial fallback and the browser later fills results. Per-sample readiness listing counts/slugs, document bytes, observed server latency, final screenshot, and final URL are retained in comparison.json. A successful later readiness probe alone does not prove that the original timing frame was fully loaded; the actual Lighthouse screenshots and LCP node records must be reviewed too.",
  "",
  `Expected timing sample set complete: ${comparison.complete ? "yes" : "no; captures are still pending or unavailable"}. Full desk coverage and performance-target compliance remain incomplete.`,
  "",
].join("\n");
writeFileSync(resolve(root, "comparison.md"), md);
console.log(
  JSON.stringify({
    complete: comparison.complete,
    rows: rows.length,
    unavailableDeskRows: gates.length,
    beforeValidSamples: samples.before.filter((row) => row.measured).length,
    afterValidSamples: samples.after.filter((row) => row.measured).length,
  }),
);
