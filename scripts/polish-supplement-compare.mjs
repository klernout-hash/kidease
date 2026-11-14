#!/usr/bin/env node
/** Summarize the matched n=1 final-build extension without replacing n=3 evidence. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || "../evidence/iteration-2");
const load = (path) =>
  existsSync(resolve(root, path)) ? JSON.parse(readFileSync(resolve(root, path), "utf8")) : null;
const phases = Object.fromEntries(
  ["before", "final"].map((phase) => [
    phase,
    {
      summary: load(`${phase}/lighthouse-supplement/summary.json`),
      review: load(`review-${phase}-supplement.json`),
    },
  ]),
);
function observation(phase, id, locale) {
  const { summary, review } = phases[phase];
  if (review && review.sourceSha !== summary?.methodology.sourceSha) {
    throw new Error(`Visual-review source mismatch in ${phase}.`);
  }
  const records = summary?.rows.filter((row) => row.id === id && row.locale === locale) || [];
  if (records.length > 1)
    throw new Error("This supplement is limited to one observation per case.");
  const row = records[0];
  const visual = review?.rows.find(
    (item) => item.id === id && item.locale === locale,
  )?.finalFrameVisualReview;
  const ready = Boolean(
    row?.navigationMeasured &&
    row?.intendedSurfaceReady &&
    visual?.loadedSurface &&
    !visual.heldFullPageSkeleton,
  );
  const stat = (value) => ({
    samples: ready && Number.isFinite(value) ? 1 : 0,
    values: ready && Number.isFinite(value) ? [value] : [],
    median: ready && Number.isFinite(value) ? value : null,
    min: ready && Number.isFinite(value) ? value : null,
    max: ready && Number.isFinite(value) ? value : null,
  });
  return {
    sourceSha: summary?.methodology.sourceSha || null,
    samples: ready ? 1 : 0,
    captured: Boolean(row?.navigationMeasured),
    ready,
    reviewComplete: Boolean(visual),
    limitation: row?.limitation || null,
    lcpMs: stat(row?.lcpMs),
    cls: stat(row?.cls),
    tbtMs: stat(row?.tbtMs),
    javascriptGzipBytes: stat(row?.javascript?.gzipBytes),
    documentBodyBytes: stat(row?.documentBodyBytes),
    inpMs: null,
    frame: row ? `${phase}/lighthouse-supplement/${row.lighthouseFinalScreenshot}` : null,
    visualReview: visual || null,
    report: row ? `${phase}/lighthouse-supplement/${row.report}` : null,
    originalSsrArticleCount: row?.ssrListingArticleCount ?? null,
    originalSsrUniqueListingCount: row?.ssrDocumentFacts?.uniqueListingCount ?? null,
    readinessUniqueListingCount: row?.readinessUniqueListingCount ?? null,
    contentState: row?.contentState || null,
    lcpCandidate: row?.lcpCandidate || null,
  };
}
const rows = ["listing", "login", "parent", "admin"].flatMap((id) =>
  ["en", "fr"].map((locale) => ({
    id,
    locale,
    before: observation("before", id, locale),
    after: observation("final", id, locale),
  })),
);
const result = {
  schemaVersion: 1,
  complete: rows.every((row) => row.before.reviewComplete && row.after.reviewComplete),
  availablePairs: rows.filter((row) => row.before.ready && row.after.ready).length,
  requestedPairs: rows.length,
  beforeSourceSha: phases.before.summary?.methodology.sourceSha || null,
  afterSourceSha: phases.final.summary?.methodology.sourceSha || null,
  interpretation:
    "Matched single observations (n=1 per route/language/phase), not stable medians or statistical evidence. A complete review may still contain blocked cases. Separate from the six n=3 priority rows and startup traces.",
  methodology: {
    warmup:
      "Exactly one fixed mobile Chrome136-UA document GET before each fresh mobile Chrome157 Lighthouse profile. Different UA versions are explicit; this pairing is retained across phases.",
    device:
      "Lighthouse simulated mobile 412x823 CSS px, DPR1.75, CPU4x, Slow4G RTT150ms/throughput1638.4Kbps; not a physical device.",
    host: "Other agent test/build/browser jobs were declared stopped; existing user browser CPU activity can remain. Boundary observations are not continuous exclusive-host proof.",
    environment:
      "Disposable local PGLite fixtures only. External requests and /api/health blocked. No DSN, live accounts, messages or charges; subscriptionsOFF and payment configuration unchanged.",
    inp: "Unavailable; TBT is not INP.",
    frenchAdmin:
      "Existing /admin?lang=fr route; main admin copy may remain English and does not establish full French admin localization.",
    unavailable:
      "Distinct populated organization/staff memberships and government desk acceptance are outside this extension; do not count shared/gated provider surfaces as those desks passing.",
  },
  rows,
};
writeFileSync(resolve(root, "supplement-comparison.json"), JSON.stringify(result, null, 2));
const number = (value, digits = 3) =>
  value === null || value === undefined ? "unavailable" : Number(value.toFixed(digits)).toString();
const markdown = [
  "# Final-build matched supplemental observations",
  "",
  result.interpretation,
  "",
  `Sources: before ${result.beforeSourceSha || "pending"}; final ${result.afterSourceSha || "pending"}.`,
  "",
  "| Page / locale | Verified n before / after | LCP ms before → after | CLS before → after | TBT ms before → after | Script gzip bytes before → after |",
  "| --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.id} ${row.locale} | ${row.before.samples} / ${row.after.samples} | ${number(row.before.lcpMs.median)} → ${number(row.after.lcpMs.median)} | ${number(row.before.cls.median, 6)} → ${number(row.after.cls.median, 6)} | ${number(row.before.tbtMs.median)} → ${number(row.after.tbtMs.median)} | ${number(row.before.javascriptGzipBytes.median, 0)} → ${number(row.after.javascriptGzipBytes.median, 0)} |`,
  ),
  "",
  ...Object.values(result.methodology),
  "",
].join("\n");
writeFileSync(resolve(root, "supplement-comparison.md"), markdown);
console.log(
  JSON.stringify({
    complete: result.complete,
    availablePairs: result.availablePairs,
    requestedPairs: result.requestedPairs,
  }),
);
