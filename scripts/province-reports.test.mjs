import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { provinceReportsEnabled } from "../src/lib/features.ts";
import {
  buildProvinceReport,
  provinceTemplate,
  reportProvinceAllowed,
} from "../src/lib/province-reports.ts";

const rows = [
  { licence: "MB-1", name: "River Centre", city: "Winnipeg", postal: "R3C 0A1", province: "MB", licensedSpaces: 40, openSpots: 2 },
  { licence: null, name: "No licence on file", city: "Brandon", postal: null, province: "MB", licensedSpaces: null, openSpots: null },
];

test("province reports default off", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PROVINCE_REPORTS, false);
  assert.equal(provinceReportsEnabled({}), false);
  assert.deepEqual(buildProvinceReport({ province: "MB", rows, format: "csv", reportDate: "2026-10-31", enabled: false }), {
    ok: false,
    reason: "off",
  });
});

test("Manitoba and Ontario columns differ from the generic file", () => {
  assert.equal(provinceTemplate("MB"), "MB");
  assert.equal(provinceTemplate("on"), "ON");
  assert.equal(provinceTemplate("BC"), "generic");
  const mb = buildProvinceReport({ province: "MB", rows, format: "csv", reportDate: "2026-10-31", enabled: true });
  const on = buildProvinceReport({ province: "ON", rows, format: "csv", reportDate: "2026-10-31", enabled: true });
  const bc = buildProvinceReport({ province: "BC", rows: [], format: "csv", reportDate: "2026-10-31", enabled: true });
  assert.equal(mb.ok && on.ok && bc.ok, true);
  if (!mb.ok || !on.ok || !bc.ok) return;
  assert.match(mb.body, /Facility name/);
  assert.match(mb.body, /River Centre/);
  assert.match(mb.body, /No licence on file/);
  assert.doesNotMatch(mb.body, /undefined|null/);
  assert.match(on.body, /Program name/);
  assert.match(on.body, /Vacancies/);
  assert.match(bc.body, /No centres in this export/);
  assert.match(bc.body, /^Licence,Name,City,Province/m);
  const pdf = buildProvinceReport({ province: "MB", rows, format: "pdf", reportDate: "2026-10-31", enabled: true });
  assert.equal(pdf.ok, true);
  if (pdf.ok) {
    assert.match(pdf.body, /^%PDF-1\.4/);
    assert.match(pdf.body, /%%EOF/);
    assert.equal(pdf.contentType, "application/pdf");
  }
});

test("a government user only exports their own province when scopes are on", () => {
  assert.equal(reportProvinceAllowed({ role: "admin", requested: "ON" }), true);
  assert.equal(reportProvinceAllowed({ role: "government", requested: "MB", govProvince: "MB", govScopesOn: false }), false);
  assert.equal(reportProvinceAllowed({ role: "government", requested: "ON", govProvince: "MB", govScopesOn: true }), false);
  assert.equal(reportProvinceAllowed({ role: "government", requested: "MB", govProvince: "MB", govScopesOn: true }), true);
  assert.equal(reportProvinceAllowed({ role: "parent", requested: "MB" }), false);
});
