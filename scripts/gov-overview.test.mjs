import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("overview leads with province-scoped queue data and retains the detailed directory view", () => {
  const frame = src("components/gov/gov-frame.tsx");
  const dashboard = src("components/gov/gov-dashboard.tsx");
  const summary = src("components/gov/gov-summary.tsx");
  assert.ok(frame.indexOf("{summary}") < frame.indexOf("gov-filters"));
  assert.match(dashboard, /<details[^>]+data-ke="gov-overview-detail"/);
  assert.ok(summary.indexOf("gov-summary-tiles") < summary.indexOf("gov-attention-queue"));
  assert.match(summary, /gov-data-request-queue/);
  for (const route of ["gov.tsx", "fr.gov.tsx"]) {
    assert.match(src(`routes/${route}`), /guardGovDesk/);
    assert.match(src(`routes/${route}`), /loadGovSummary/);
  }
});

test("overview previews reuse audited queues and keep data requests aggregated", () => {
  const server = src("lib/server/gov-desk.ts");
  const loader = server.slice(server.indexOf("export const loadGovSummary"), server.indexOf("export const exportGovDeskCsv"));
  assert.match(loader, /middleware\(\[govAuthMiddleware\]\)/);
  assert.match(loader, /buildPage\(gov, leaf, data.locale\)/);
  assert.match(loader, /row\.meta\?\.view === "to_review"/);
  assert.match(loader, /row\.tone === "bad"/);
  assert.match(loader, /auditDesk[^\n]+"open:data-requests"/);
  assert.match(loader, /cells: \[kind, status, count\]/);
  assert.doesNotMatch(loader, /proposed_value|review_note|user_id/);
  assert.match(server, /const cells = suppressRows\(rows.map\(\(row\) => \(\{ kind: row\.kind, status: row\.status/);
});
