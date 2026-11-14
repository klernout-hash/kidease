#!/usr/bin/env node
/** Compare the focused iteration-2 captures without changing first-pass files. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || "../evidence/iteration-2");
const afterFolder = process.argv[3] || "after";
const outputStem = process.argv[4] || "comparison";
if (![afterFolder, outputStem].every((value) => /^[a-zA-Z0-9_-]+$/.test(value))) {
  throw new Error("Folder and output names must be simple local names.");
}
const folders = { before: "before", after: afterFolder };
const read = (path) =>
  existsSync(resolve(root, path)) ? JSON.parse(readFileSync(resolve(root, path), "utf8")) : null;
const phases = Object.fromEntries(
  ["before", "after"].map((phase) => [
    phase,
    {
      lighthouse: read(`${folders[phase]}/lighthouse/summary.json`),
      startup: read(`${folders[phase]}/startup/summary.json`),
      visualReview: read(`review-${folders[phase]}.json`),
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
function frameReview(row, phase) {
  const sidecar = phases[phase].visualReview;
  if (sidecar && sidecar.sourceSha !== phases[phase].lighthouse?.methodology.sourceSha) {
    throw new Error(`Visual review source mismatch for ${phase}.`);
  }
  return (
    sidecar?.rows.find(
      (item) => item.id === row.id && item.locale === row.locale && item.run === row.run,
    )?.finalFrameVisualReview ||
    row.finalFrameVisualReview ||
    null
  );
}
function eventTiming(startup) {
  if (!startup) return null;
  const events = startup.startup?.events || [];
  const first = events.filter(
    (event) =>
      event.startTime >= (startup.firstAttempt?.before?.at ?? Infinity) - 10 &&
      event.startTime <= (startup.firstAttempt?.after?.at ?? -Infinity),
  );
  const summarizeEvents = (items) => ({
    entries: items.length,
    positiveInteractionIds: [
      ...new Set(items.map((event) => event.interactionId).filter((id) => id > 0)),
    ],
    maxObservedDurationMs: items.length ? Math.max(...items.map((event) => event.duration)) : null,
  });
  return {
    firstAttemptSucceeded: startup.firstAttemptSucceeded,
    handlerAtClick: startup.beforeFirstClick?.onClickAttached ?? null,
    actualFirstClickMs: startup.startup?.clicks?.[0]?.at ?? null,
    firstAttemptWindow: summarizeEvents(first),
    allCapturedIncludingDiagnosticRetry: summarizeEvents(events),
    fieldInpMs: null,
    interpretation:
      "Diagnostic EventTiming at a 16ms threshold is not field INP. Missing entries are unobserved, not zero. Fast event processing does not imply successful activation or early handler readiness.",
  };
}
function summarize(phase, id, locale) {
  const all =
    phases[phase].lighthouse?.rows.filter((row) => row.id === id && row.locale === locale) || [];
  const captured = all.filter((row) => row.navigationMeasured && row.intendedSurfaceReady);
  const verified = captured.filter(
    (row) =>
      frameReview(row, phase)?.loadedSurface && !frameReview(row, phase).heldFullPageSkeleton,
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
      file: `${folders[phase]}/lighthouse/${row.lighthouseFinalScreenshot}`,
      review: frameReview(row, phase),
    })),
    startup:
      phases[phase].startup?.results.find((row) => row.id === id && row.locale === locale) || null,
    eventTiming: eventTiming(
      phases[phase].startup?.results.find((row) => row.id === id && row.locale === locale),
    ),
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
    lighthouse: {
      ...phases.before.lighthouse.methodology,
      documentWarmup:
        "One same-URL document-only warmup per fresh profile, using fixed mobile Chrome136 UA; Lighthouse mobile navigation uses host Chrome157. No browser asset cache is warmed and no retry-until-fast is performed.",
      historicalWarmupWordingCorrected: true,
    },
    host,
    startup: phases.before.startup
      ? {
          ...phases.before.startup.methodology,
          serverWarmup:
            "Fixed mobile Chrome136-UA document warmup, then desktop Chrome157 browser navigation at1280x800. Different warmup/navigation UA pairing preserved across phases, with no retry-until-fast.",
        }
      : null,
    inp: "Unavailable. Lighthouse TBT and diagnostic EventTiming are not field INP.",
    causality:
      "Serial agent jobs and matched warmed-server protocol improve consistency, but recorded background user-browser activity prevents a strict exclusive-host or causal isolated-benchmark claim.",
    documentWarmupUserAgentCorrection:
      "Historical same-UA wording was inaccurate: every phase uses a fixed mobile Chrome136 UA for the document-only warmup, while Lighthouse mobile navigation uses the host Chrome157 version. This fixed pairing is preserved for final comparability. Original SSR listing sets match; no version-dependent content difference was demonstrated. Raw Lighthouse environment.networkUserAgent records the actual emulated mobile UA; its top-level userAgent and row browserUserAgent describe host Chrome.",
  },
  inpMs: null,
  targetEvaluation: {
    lcpTargetMs: 2500,
    javascriptTargetGzipBytes: 200000,
    clsTarget: 0.1,
    afterLcpFailures: rows
      .filter((row) => row.after.statistics.lcpMs.median >= 2500)
      .map((row) => `${row.id}-${row.locale}`),
    afterJavascriptFailures: rows
      .filter((row) => row.after.javascriptGzipBytes.median >= 200000)
      .map((row) => `${row.id}-${row.locale}`),
    afterClsFailures: rows
      .filter((row) => row.after.statistics.cls.median >= 0.1)
      .map((row) => `${row.id}-${row.locale}`),
    inp: "Not evaluated: field INP unavailable.",
  },
  rows,
};
writeFileSync(resolve(root, `${outputStem}.json`), JSON.stringify(result, null, 2));
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
  result.methodology.documentWarmupUserAgentCorrection,
  "",
  result.methodology.causality,
  "",
  "| Page / locale | Verified samples before / after | LCP ms median before → after | LCP range before / after | CLS before → after | TBT ms before → after | Script gzip bytes before → after | Search RPC calls before / after |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.id} ${row.locale} | ${row.before.verifiedFinalFrameSamples} / ${row.after.verifiedFinalFrameSamples} | ${f(row.before.statistics.lcpMs.median)} → ${f(row.after.statistics.lcpMs.median)} | ${r(row.before.statistics.lcpMs)} / ${r(row.after.statistics.lcpMs)} | ${f(row.before.statistics.cls.median, 6)} → ${f(row.after.statistics.cls.median, 6)} | ${f(row.before.statistics.tbtMs.median)} → ${f(row.after.statistics.tbtMs.median)} | ${f(row.before.javascriptGzipBytes.median, 0)} → ${f(row.after.javascriptGzipBytes.median, 0)} | ${row.before.searchDaycarePageCalls.join(",")} / ${row.after.searchDaycarePageCalls.join(",") || "pending"} |`,
  ),
  "",
  "## Startup diagnostics",
  "",
  "A coordinate click targets the existing desktop header Menu at DCL+1 second. Actual navigation/DCL/click timestamps, local React handler detection, aria-expanded/panel state and first-attempt outcome are kept separate. The first result is saved before any diagnostic second activation. A retry does not convert first-attempt failure into a pass. DCL+1 second is not the same time after navigation across routes. Observer/CDP instrumentation adds overhead; these traces are separate from Lighthouse and are not field INP.",
  "",
  "| Page / locale | Before first activation | After first activation | Before handler at click | After handler at click | Actual first click ms after navigation before → after | First-window observed EventTiming max ms before → after |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.id} ${row.locale} | ${row.before.startup ? (row.before.startup.firstAttemptSucceeded ? "opened" : "failed") : "pending"} | ${row.after.startup ? (row.after.startup.firstAttemptSucceeded ? "opened" : "failed") : "pending"} | ${row.before.startup ? (row.before.startup.beforeFirstClick?.onClickAttached ? "detected" : "not detected") : "pending"} | ${row.after.startup ? (row.after.startup.beforeFirstClick?.onClickAttached ? "detected" : "not detected") : "pending"} | ${f(row.before.eventTiming?.actualFirstClickMs)} → ${f(row.after.eventTiming?.actualFirstClickMs)} | ${f(row.before.eventTiming?.firstAttemptWindow.maxObservedDurationMs)} → ${f(row.after.eventTiming?.firstAttemptWindow.maxObservedDurationMs)} |`,
  ),
  "",
  "INP remains unavailable. Targets, all pages/desks, physical phones, production media/tiles/CDN and true browser zoom are not certified by this targeted run.",
  "Missing EventTiming entries are unobserved at the 16ms threshold, not zero or a pass. Event durations on a failed menu activation do not establish a usable response. EventTiming includes diagnostic pointer events and is not a field INP estimate.",
  "",
  `Collection and final-frame review complete: ${result.complete ? "yes" : "no; after captures or review are pending"}.`,
  "",
].join("\n");
writeFileSync(resolve(root, `${outputStem}.md`), markdown);
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
