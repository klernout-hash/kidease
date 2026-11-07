import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { releasedCount, releasedRows } from "../src/lib/gov/k-anonymity.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const between = (file, start, end) => {
  const src = read(file);
  return src.slice(src.indexOf(start), src.indexOf(end));
};

test("a small count that was removed stays removed", () => {
  assert.equal(releasedCount(3), null);
  assert.equal(releasedCount(null), null);
  assert.equal(releasedCount(0), 0);
  assert.equal(releasedCount(6), 6);
  const rows = releasedRows([
    { kind: "a", n: null },
    { kind: "b", n: 9 },
  ]);
  assert.equal(rows[0].suppressed, true);
  assert.equal(rows[0].n, null);
  assert.equal(rows[1].n, 9);
  assert.equal(rows[1].suppressed, false);
});

test("government loaders remove a count under 5 before the page is sent", () => {
  assert.match(between("../src/lib/server/compliance-ratios.ts", "export const loadGovRatios", "export const loadAdminRatios"), /suppressRows/);
  assert.match(between("../src/lib/server/compliance-calendar.ts", "export const loadGovCalendar", "export const loadAdminCalendar"), /suppressRows/);
  assert.match(between("../src/lib/server/compliance-complaints.ts", "export const loadGovComplaints", "export const loadAdminComplaints"), /suppressRows/);
  assert.match(between("../src/lib/server/compliance-fees.ts", "export const loadGovFees", "export const loadAdminFees"), /suppressRows/);
  assert.match(between("../src/lib/server/compliance-incidents.ts", "export const loadGovIncidents", "export const loadAdminIncidents"), /suppressRows/);
  assert.match(between("../src/lib/server/compliance-funding.ts", "export const loadGovFunding", "export const loadAdminFunding"), /suppressRows/);
  assert.match(between("../src/lib/server/compliance-screening.ts", "export const loadGovScreening", "export const loadAdminScreening"), /suppressCount/);
  assert.match(between("../src/lib/server/compliance-audit.ts", "export const loadGovAudit", "export const loadAdminAudit"), /suppressCount/);
  assert.match(read("../src/components/compliance/audit-page.tsx"), /data-ke="gov-audit-count"/);
});
