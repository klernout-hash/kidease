#!/usr/bin/env node
/** Compare the focused iteration-2 captures without changing first-pass files. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || "../evidence/iteration-2");
const read = (path) =>
  existsSync(resolve(root, path)) ? JSON.parse(readFileSync(resolve(root, path), "utf8")) : null;
const phases = Object.fromEntries(
  ["before", "after"].map((phase) => [
    phase,
    {
      lighthouse: read(`${phase}/lighthouse/summary.json`),
      startup: read(`${phase}/startup/summary.json`),
    },
  ]),
);
if (!phases.before.lighthouse) throw new Error("The preserved iteration-2 baseline is required.");
function stats(values) {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return {
    samples: ordered.length,
    values: values.filter(Number.isFinite),
    median: ordered.length
      ? ordered.length % 2
        ? ordered[middle]
        : (ordered[middle - 1] + ordered[middle]) / 2
      : null,
    min: ordered.length ? ordered[0] : null,
    max: ordered.length ? ordered.at(-1) : null,
  };
}
function summarize(phase, id, locale) {
  const all =
    phases[phase].lighthouse?.rows.filter((row) => row.id === id && row.locale === locale) || [];
  const captured = all.filter((row) => row.navigationMeasured && row.intendedSurfaceReady);
  const verified = captured.filter(
    (row) =>
      row.finalFrameVisualReview?.loadedSurface && !row.finalFrameVisualReview.heldFullPageSkeleton,
  );
  return {
    sourceSha: phases[phase].lighthouse?.methodology.sourceSha || null,
    requestedSamples: 3,
    capturedSamples: captured.length,
    verifiedFinalFrameSamples: verified.length,
    complete: verified.length === 3,
    statistics: Object.fromEntries(
      ["lcpMs", "cls", "tbtMs", "documentBodyBytes"].map((metric) => [
        metric,
        stats(verified.map((row) => row[metric])),
      ]),
    ),
    javascriptGzipBytes: stats(verified.map((row) => row.javascript?.gzipBytes)),
    provisionalLcpMs: stats(captured.map((row) => row.lcpMs)),
    originalSsrArticleCounts: all.map((row) => row.ssrListingArticleCount ?? null),
    originalSsrUniqueListingCounts: all.map(
      (row) => row.ssrDocumentFacts?.uniqueListingCount ?? null,
    ),
    readinessUniqueListingCounts: all.map((row) => row.readinessUniqueListingCount ?? null),
    searchDaycarePageCalls: all.map((row) => row.searchDaycarePageCalls ?? null),
    readAiFeatureFlagCalls: all.map((row) => row.readAiFeatureFlagCalls ?? null),
    lcpCandidates: all.map((row) => row.lcpCandidate || null),
    frames: all.map((row) => ({
      run: row.run,
      file: `${phase}/lighthouse/${row.lighthouseFinalScreenshot}`,
      review: row.finalFrameVisualReview || null,
    })),
    startup:
      phases[phase].startup?.results.find((row) => row.id === id && row.locale === locale) || null,
  };
}
const rows = ["home", "search", "daycare"].flatMap((id) =>
  ["en", "fr"].map((locale) => {
    const before = summarize("before", id, locale),
      after = summarize("after", id, locale);
    const beforeRows = phases.before.lighthouse.rows.filter(
      (row) => row.id === id && row.locale === locale,
    );
    const afterRows =
      phases.after.lighthouse?.rows.filter((row) => row.id === id && row.locale === locale) || [];
    const slugs = (items, get) =>
      items
        .map(get)
        .filter(Array.isArray)
        .map((list) => JSON.stringify([...new Set(list)].sort()));
    const both = [
      ...slugs(beforeRows, (row) => row.readinessListingSlugs),
      ...slugs(afterRows, (row) => row.readinessListingSlugs),
    ];
    const originals = [
      ...slugs(beforeRows, (row) => row.ssrDocumentFacts?.listingSlugs),
      ...slugs(afterRows, (row) => row.ssrDocumentFacts?.listingSlugs),
    ];
    return {
      id,
      locale,
      before,
      after,
      complete: before.complete && after.complete,
      delta: {
        medianLcpMs:
          before.statistics.lcpMs.median === null || after.statistics.lcpMs.median === null
            ? null
            : after.statistics.lcpMs.median - before.statistics.lcpMs.median,
        medianCls:
          before.statistics.cls.median === null || after.statistics.cls.median === null
            ? null
            : after.statistics.cls.median - before.statistics.cls.median,
        medianJavascriptGzipBytes:
          before.javascriptGzipBytes.median === null || after.javascriptGzipBytes.median === null
            ? null
            : after.javascriptGzipBytes.median - before.javascriptGzipBytes.median,
      },
      matchedReadinessListingSlugSets: both.length === 6 ? new Set(both).size === 1 : null,
      matchedOriginalSsrListingSlugSets:
        originals.length === 6 ? new Set(originals).size === 1 : null,
      matchedFinalFrameAppearances:
        before.complete && after.complete
          ? new Set([...before.frames, ...after.frames].map((frame) => frame.review?.appearance))
              .size === 1
          : null,
    };
  }),
);
const host = Object.fromEntries(
  ["before", "after"].map((phase) => {
    const captures = phases[phase].lighthouse?.rows || [];
    const competing = captures.flatMap((row) => row.hostSnapshotCompetingDevelopmentJobs || []);
    return [
      phase,
      {
        operatorDeclaration: phases[phase].lighthouse?.methodology.hostQuietDeclaration || null,
        boundaryVisibilityComplete:
          captures.length === 18 && captures.every((row) => row.hostSnapshotVisibilityComplete),
        competingBrowserActivityObserved: captures.length
          ? competing.some((process) => /Chrome|Safari|WebKit|firefox/i.test(process.executable))
          : null,
        otherDevelopmentActivityObserved: captures.length
          ? competing.some((process) => !/Chrome|Safari|WebKit|firefox/i.test(process.executable))
          : null,
        interpretation:
          "Other agent test/build/layout jobs were declared stopped. Existing user-browser CPU activity means this is not proof of an otherwise idle or exclusively isolated Mac. Executable/CPU observations are preserved locally without arguments or environment values.",
      },
    ];
  }),
);
const result = {
  schemaVersion: 1,
  complete:
    rows.every((row) => row.complete) &&
    ["before", "after"].every(
      (phase) =>
        phases[phase].startup?.results.length === 6 &&
        phases[phase].startup.results.every((row) => row.complete),
    ),
  scope:
    "Targeted incremental follow-up on home/search/daycare EN/FR; not full product acceptance. Original default-branch75cf and first-pass comparison remain separate and unchanged.",
  beforeSourceSha: phases.before.lighthouse.methodology.sourceSha,
  afterSourceSha: phases.after.lighthouse?.methodology.sourceSha || null,
  methodology: {
    lighthouse: phases.before.lighthouse.methodology,
    host,
    startup: phases.before.startup?.methodology || null,
    inp: "Unavailable. Lighthouse TBT and diagnostic EventTiming are not field INP.",
    causality:
      "Serial agent jobs and matched warmed-server protocol improve consistency, but recorded background user-browser activity prevents a strict exclusive-host or causal isolated-benchmark claim.",
  },
  rows,
};
writeFileSync(resolve(root, "comparison.json"), JSON.stringify(result, null, 2));
const f = (value, digits = 3) =>
  value === null || value === undefined ? "pending" : Number(value.toFixed(digits)).toString();
const r = (value) => `${f(value.min)}–${f(value.max)}`;
const markdown = [
  "# Iteration-2 targeted performance follow-up",
  "",
  `Baseline build: \`${result.beforeSourceSha}\`; after build: ${result.afterSourceSha ? `\`${result.afterSourceSha}\`` : "pending"}.`,
  "",
  result.scope,
  "",
  "Three serial Lighthouse samples per route/language, each with a fresh Chrome profile and exactly one document-only warmup. The source HTML, LCP candidate, readonly RPCs, actual final frames, host observations and independent settled content are recorded. Final-frame review is required before timing statistics are called verified.",
  "",
  result.methodology.causality,
  "",
  "| Page / locale | Verified samples before / after | LCP ms median before → after | LCP range before / after | CLS before → after | Script gzip bytes before → after | Search RPC calls before / after |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.id} ${row.locale} | ${row.before.verifiedFinalFrameSamples} / ${row.after.verifiedFinalFrameSamples} | ${f(row.before.statistics.lcpMs.median)} → ${f(row.after.statistics.lcpMs.median)} | ${r(row.before.statistics.lcpMs)} / ${r(row.after.statistics.lcpMs)} | ${f(row.before.statistics.cls.median, 6)} → ${f(row.after.statistics.cls.median, 6)} | ${f(row.before.javascriptGzipBytes.median, 0)} → ${f(row.after.javascriptGzipBytes.median, 0)} | ${row.before.searchDaycarePageCalls.join(",")} / ${row.after.searchDaycarePageCalls.join(",") || "pending"} |`,
  ),
  "",
  "## Startup diagnostics",
  "",
  "A coordinate click targets the existing desktop header Menu at DCL+1 second. Actual navigation/DCL/click timestamps, local React handler detection, aria-expanded/panel state and first-attempt outcome are kept separate. The first result is saved before any diagnostic second activation. A retry does not convert first-attempt failure into a pass. DCL+1 second is not the same time after navigation across routes. Observer/CDP instrumentation adds overhead; these traces are separate from Lighthouse and are not field INP.",
  "",
  "| Page / locale | Before first activation | After first activation | Before handler at click | After handler at click |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.id} ${row.locale} | ${row.before.startup ? (row.before.startup.firstAttemptSucceeded ? "opened" : "failed") : "pending"} | ${row.after.startup ? (row.after.startup.firstAttemptSucceeded ? "opened" : "failed") : "pending"} | ${row.before.startup ? (row.before.startup.beforeFirstClick?.onClickAttached ? "detected" : "not detected") : "pending"} | ${row.after.startup ? (row.after.startup.beforeFirstClick?.onClickAttached ? "detected" : "not detected") : "pending"} |`,
  ),
  "",
  "INP remains unavailable. Targets, all pages/desks, physical phones, production media/tiles/CDN and true browser zoom are not certified by this targeted run.",
  "",
  `Collection and final-frame review complete: ${result.complete ? "yes" : "no; after captures or review are pending"}.`,
  "",
].join("\n");
writeFileSync(resolve(root, "comparison.md"), markdown);
console.log(
  JSON.stringify({
    complete: result.complete,
    rows: rows.length,
    beforeVerified: rows.reduce((sum, row) => sum + row.before.verifiedFinalFrameSamples, 0),
    afterVerified: rows.reduce((sum, row) => sum + row.after.verifiedFinalFrameSamples, 0),
    beforeHost: host.before,
    afterHost: host.after,
  }),
);
