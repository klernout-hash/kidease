#!/usr/bin/env node
/** Summarize recorded layout evidence without treating skipped or pending cases as passed. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";

const directory = resolve(process.argv[2] || "artifacts/performance-polish");
const output = resolve(process.argv[3] || `${directory}/layout-summary.json`);
const files = readdirSync(directory, { recursive: true }).filter(
  (file) => file.endsWith("-layout.json") && !/(?:initial|exploratory|partial|reuse)/.test(file),
);
const reports = files.map((file) => ({
  file,
  report: JSON.parse(readFileSync(resolve(directory, file), "utf8")),
}));
const summary = {
  generatedAt: new Date().toISOString(),
  evidenceDirectory: directory,
  interpretation: {
    passed:
      "Only a completed case with loaded-page readiness and zero recorded findings is counted as passed.",
    overlap:
      "Geometric overlap candidates include sticky headers over scrolling content and require human review; counts are not a confirmed bug count.",
    gated:
      "Organization/staff flags remain off and government visibility gates remain in force; a loaded gated state is not populated feature coverage.",
    zoom: "The 200% profiles simulate reflow with half CSS viewport width; no physical device or browser UI zoom claim.",
    incomplete:
      "An unfinished run, missing readiness, blocked route, runtime error or selected untested page is retained explicitly.",
  },
  runs: [],
  uniqueCaseCoverage: {},
};
const uniqueCases = new Map();

for (const { file, report } of reports) {
  const counts = {};
  const issueKinds = {};
  const pages = new Map();
  for (const result of report.results) {
    const status =
      result.status === "passed" && !result.readiness?.ready
        ? "unverified-readiness"
        : result.status;
    counts[status] = (counts[status] || 0) + 1;
    const key = JSON.stringify([
      report.phase,
      report.commit,
      result.page,
      result.locale,
      result.profile,
    ]);
    if (!uniqueCases.has(key))
      uniqueCases.set(key, { phase: report.phase, statuses: new Set(), readiness: [] });
    const unique = uniqueCases.get(key);
    unique.statuses.add(status);
    unique.readiness.push(Boolean(result.readiness?.ready));
    if (!pages.has(result.page))
      pages.set(result.page, { id: result.page, cases: 0, counts: {}, findings: {} });
    const page = pages.get(result.page);
    page.cases += 1;
    page.counts[status] = (page.counts[status] || 0) + 1;
    for (const issue of result.issues) {
      issueKinds[issue.kind] = (issueKinds[issue.kind] || 0) + 1;
      page.findings[issue.kind] = (page.findings[issue.kind] || 0) + 1;
    }
  }
  summary.runs.push({
    file,
    phase: report.phase,
    revision: report.commit,
    complete: Boolean(report.finishedAt),
    startedAt: report.startedAt,
    finishedAt: report.finishedAt || null,
    mode: report.configuration.mode,
    workers: report.configuration.workers || 1,
    selectedPages: report.pages.filter((page) => page.selected).length,
    inventoryPages: report.pages.length,
    cases: report.results.length,
    counts,
    issueKinds,
    screenshots: report.results.filter((result) => result.screenshot).length,
    loadedReadinessCases: report.results.filter((result) => result.readiness?.ready).length,
    pageSummaries: Array.from(pages.values()),
    blockedOrUnrunPages: report.pages
      .filter((page) => page.selected && ["blocked", "not-run", "running"].includes(page.status))
      .map(({ id, status, reason }) => ({ id, status, reason: reason || null })),
    unavailableCases: report.results
      .filter(
        (result) =>
          ["blocked", "error", "running", "interrupted"].includes(result.status) ||
          !result.readiness?.ready,
      )
      .map((result) => ({
        page: result.page,
        locale: result.locale,
        profile: result.profile,
        status: result.status,
        reason: result.reason || result.readiness?.reason || null,
      })),
    requestBlocks: report.results.reduce((counts, result) => {
      for (const block of result.blockedRequests)
        counts[block.kind] = (counts[block.kind] || 0) + 1;
      return counts;
    }, {}),
  });
}

for (const unique of uniqueCases.values()) {
  const statuses = Array.from(unique.statuses);
  const outcome =
    statuses.every((status) => status === "passed") && unique.readiness.every(Boolean)
      ? "passedInAllRecordedRuns"
      : statuses.some((status) => ["failed", "error"].includes(status))
        ? "hasRecordedFailures"
        : statuses.every((status) => ["blocked", "unverified-readiness"].includes(status))
          ? "unavailable"
          : "incompleteOrInconsistent";
  const counts = (summary.uniqueCaseCoverage[unique.phase] ||= { total: 0 });
  counts.total += 1;
  counts[outcome] = (counts[outcome] || 0) + 1;
}

writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      report: relative(process.cwd(), output),
      runs: summary.runs.map(({ file, complete, cases, counts }) => ({
        file,
        complete,
        cases,
        counts,
      })),
    },
    null,
    2,
  ),
);
