import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { demandDelivery, demandMode, demandReport, quarterKey, quarterReportDue } from "../src/lib/compliance/demand.ts";
import { canSeeProvince } from "../src/lib/compliance/mode.ts";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
test("demand cells under 5 are hidden and another province is dropped", () => {
  assert.equal(demandMode({}), "off");
  assert.equal(demandMode({ FEATURE_DEMAND_REPORTS: "1" }), "dry_run");
  assert.equal(quarterKey("2026-04-02"), "2026-Q2");
  assert.equal(quarterReportDue("2026-04-02"), true);
  assert.equal(quarterReportDue("2026-05-02"), false);
  const report = demandReport([
    { province: "ON", area: "M5V", ageKey: "infant", n: 2 },
    { province: "ON", area: "M4W", ageKey: "infant", n: 3 },
    { province: "ON", area: "M5A", ageKey: "toddler", n: 20 },
    { province: "MB", area: "R3C", ageKey: "infant", n: 40 },
  ], "ON");
  assert.equal(report.rows.some((row) => row.area === "R3C"), false);
  assert.equal(report.rows.some((row) => row.n != null && row.n > 0 && row.n < 5), false);
  assert.equal(demandDelivery("dry_run", true), "log");
  assert.equal(demandDelivery("live", true), "send");
  assert.equal(demandDelivery("live", false), "skip");
  assert.equal(canSeeProvince({ role: "government", govProvince: "ON", rowProvince: "MB" }), false);
});
test("demand flag defaults off", () => {
  assert.match(src(".env.example"), /^FEATURE_DEMAND_REPORTS=0$/m);
  assert.match(src(".env.example"), /^FEATURE_DEMAND_REPORTS_LIVE=0$/m);
  assert.match(src("src/routes/gov_.demand.tsx"), /guardGovDesk/);
  assert.doesNotMatch(src("src/lib/server/compliance-demand.ts"), /child_label|user_id/);
  assert.match(src("src/components/compliance/frame.tsx"), /href="\/help"/);
});
