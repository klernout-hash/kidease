import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { demandCopy, demandDelivery, demandMode, demandReport, quarterKey, quarterReportDue } from "../src/lib/compliance/demand.ts";
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

test("EN and FR demand copy describes waitlist entries without unique-person or quarter-window claims", () => {
  const en = demandCopy("en");
  const fr = demandCopy("fr");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  assert.match(en.title, /waitlist entries/i);
  assert.match(fr.title, /listes d’attente/i);
  assert.match(en.why, /marked waiting/);
  assert.match(fr.why, /marquées « en attente »/);
  assert.match(en.why, /same account.*several lists/i);
  assert.match(fr.why, /même compte.*plusieurs listes/i);
  assert.match(en.why, /not unique child or family counts/);
  assert.match(fr.why, /pas un décompte d’enfants ou de familles distincts/);
  assert.match(en.why, /not limited to the displayed quarter/);
  assert.match(fr.why, /ne se limitent pas au trimestre affiché/);
  assert.match(en.why, /hidden or combined/);
  assert.match(fr.why, /masqués ou regroupés/);
  assert.match(en.empty, /may be hidden/);
  assert.match(fr.empty, /peuvent être masqués/);
  for (const copy of [en, fr]) {
    assert.doesNotMatch([copy.title, copy.why, copy.empty, copy.next].join(" "), /saved.search|recherches enregistrées/i);
  }
  const page = src("src/components/compliance/demand-page.tsx");
  assert.match(page, /title=\{copy\.title\} copy=\{copy\}/);
  assert.match(page, /\{copy\.empty\}/);
});
