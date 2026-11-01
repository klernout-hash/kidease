import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fundingMode, fundingReport, submissionPlan } from "../src/lib/compliance/funding.ts";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
test("funding reports stay off and block a mismatched claim", () => {
  assert.equal(fundingMode({}), "off");
  assert.equal(fundingMode({ FEATURE_FUNDING_REPORTS: "1" }), "dry_run");
  const report = fundingReport({ province: "ON", period: "2026-03", lines: [{ ageKey: "infant", enrolled: 4, attendedDays: 0 }] });
  assert.equal(report.verified, false);
  assert.equal(report.blocked, true);
  assert.equal(submissionPlan("dry_run", true), "blocked");
  assert.equal(submissionPlan("dry_run", false), "log");
  assert.equal(submissionPlan("live", false), "ready");
  assert.equal(JSON.stringify(report).includes("child"), false);
});
test("funding flag and help stay in place", () => {
  assert.match(src(".env.example"), /^FEATURE_FUNDING_REPORTS=0$/m);
  assert.match(src(".env.example"), /^FEATURE_FUNDING_REPORTS_LIVE=0$/m);
  assert.match(src("src/routes/gov_.funding.tsx"), /guardGovDesk/);
  assert.match(src("migrations/0136_gov_funding_reports.sql"), /PLACEHOLDER/);
  assert.match(src("src/components/compliance/frame.tsx"), /href="\/help"/);
});
